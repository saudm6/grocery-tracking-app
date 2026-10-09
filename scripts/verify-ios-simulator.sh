#!/bin/bash
set -euo pipefail

native_host() {
  [[ "${RUNNER_ENVIRONMENT:-}" == github-hosted && "${RUNNER_OS:-}" == macOS && "$(uname -s)" == Darwin ]]
}

interface_up() { sudo /sbin/ifconfig "$1" up; }

restore_network() {
  local state="$1" interface failed=0
  [[ ! -f "$state/restored" ]] || return 0
  while IFS= read -r interface; do
    [[ "$interface" =~ ^[a-zA-Z][a-zA-Z0-9]*$ && "$interface" != lo0 ]] || return 1
    interface_up "$interface" >> "$state/restoration.log" 2>&1 || failed=1
  done < "$state/interfaces"
  if [[ "$failed" == 0 ]]; then
    date -u '+%FT%TZ' > "$state/restored"
  fi
  return "$failed"
}

guard_restore() {
  local state="$1" delay="$2"
  touch "$state/guard-ready"
  sleep "$delay"
  if [[ ! -f "$state/restored" ]]; then
    date -u '+%FT%TZ' > "$state/guard-fired"
    restore_network "$state"
  fi
}

probe() {
  local phase="$1" expectation="$2" label url code
  for label in github apple ipv4; do
    case "$label" in
      github) url=https://github.com ;;
      apple) url=https://developer.apple.com ;;
      ipv4) url=http://1.1.1.1 ;;
    esac
    if curl --noproxy '*' --silent --show-error --head --connect-timeout 2 --max-time 5 "$url" > "$state/$phase-$label.txt" 2>&1; then code=0; else code=$?; fi
    printf '%s %s %s %s\n' "$(date -u '+%FT%TZ')" "$phase" "$label" "$code" >> "$state/probes.log"
    if [[ "$expectation" == online ]]; then [[ "$code" == 0 ]] || return 1; else [[ "$code" != 0 ]] || return 1; fi
  done
  if [[ -f "$state/ipv6-available" ]]; then
    if curl --noproxy '*' --silent --show-error --head --connect-timeout 2 --max-time 5 'http://[2606:4700:4700::1111]' > "$state/$phase-ipv6.txt" 2>&1; then code=0; else code=$?; fi
    printf '%s %s ipv6 %s\n' "$(date -u '+%FT%TZ')" "$phase" "$code" >> "$state/probes.log"
    if [[ "$expectation" == online ]]; then [[ "$code" == 0 ]] || return 1; else [[ "$code" != 0 ]] || return 1; fi
  fi
  if [[ -n "$loopback_pid" ]]; then
    curl --noproxy '*' --fail --silent --max-time 2 http://127.0.0.1:9187/ > /dev/null
  fi
}

prove_restoration() {
  local network_state="$1" withdrawn="$2" wait_seconds="$3" deadline
  if [[ "$withdrawn" == 1 ]]; then
    if ! restore_network "$network_state"; then
      deadline=$((SECONDS + wait_seconds))
      while [[ ! -f "$network_state/restored" ]]; do
        (( SECONDS < deadline )) || return 1
        sleep 0.2
      done
    fi
  fi
  probe after online || return 1
  date -u '+%FT%TZ' > "$network_state/restoration-proven"
}

bounded_run() {
  local seconds="$1"
  shift
  BOUNDED_CLEANUP_FAILED_FILE="$evidence/command-cleanup-failed" python3 - "$seconds" "$@" <<'PY'
import json, os, pathlib, signal, subprocess, sys, time
p = None
received_signal = 0
primary = {'reason': 'spawn', 'exitCode': 1}
def record(event, **details):
    row = {'event': event, 'command': pathlib.Path(sys.argv[2]).name,
           'ownedGroup': p.pid if p is not None else None, **details}
    encoded = json.dumps(row)
    try: print('[bounded] ' + encoded, file=sys.stderr, flush=True)
    except OSError: pass
    marker = os.getenv('BOUNDED_CLEANUP_FAILED_FILE')
    if marker and event == 'cleanup-failed':
        with pathlib.Path(marker).open('a') as stream: stream.write(encoded + '\n')
def group_members():
    if os.name != 'posix': return []
    try:
        rows = subprocess.run(['ps', '-axo', 'pid=,ppid=,pgid=,stat='], capture_output=True,
                              text=True, timeout=2, check=True).stdout.splitlines()
        return [row.split() for row in rows if len(row.split()) == 4 and row.split()[2] == str(p.pid)][:40]
    except Exception as error: return {'diagnosticError': type(error).__name__}
def cancel(signum, frame):
    global received_signal, primary
    received_signal = signum
    primary = {'reason': 'signal', 'signal': signum, 'exitCode': 128 + signum}
    if p is not None: raise SystemExit(128 + signum)
for signum in (signal.SIGINT, signal.SIGTERM): signal.signal(signum, cancel)
try:
    p = subprocess.Popen(sys.argv[2:], start_new_session=True)
    if received_signal: raise SystemExit(128 + received_signal)
    started = time.monotonic()
    budget = int(sys.argv[1])
    while True:
        remaining = budget - (time.monotonic() - started)
        if remaining <= 0: raise subprocess.TimeoutExpired(p.args, budget)
        try:
            result = p.wait(timeout=min(45, remaining))
            primary = {'reason': 'child-exit', 'childStatus': result, 'exitCode': result if result >= 0 else 128 - result}
            sys.exit(result if result >= 0 else 128 - result)
        except subprocess.TimeoutExpired:
            if time.monotonic() - started >= budget: raise
            print(f'[progress] command={sys.argv[2]} elapsed={int(time.monotonic()-started)}s budget={budget}s', file=sys.stderr, flush=True)
except subprocess.TimeoutExpired:
    primary = {'reason': 'deadline', 'exitCode': 124}
    sys.exit(124)
except KeyboardInterrupt:
    primary = {'reason': 'interrupt', 'exitCode': 130}
    sys.exit(130)
finally:
    for signum in (signal.SIGINT, signal.SIGTERM): signal.signal(signum, signal.SIG_IGN)
    record('primary-exit', **primary)
    if p is not None:
        try:
            def stop_group(signum):
                try: os.killpg(p.pid, signum)
                except ProcessLookupError: pass
            if os.name == 'posix': stop_group(signal.SIGTERM)
            elif p.poll() is None: p.terminate()
            try: p.wait(timeout=1)
            except subprocess.TimeoutExpired: pass
            if os.name == 'posix': stop_group(signal.SIGKILL)
            elif p.poll() is None: p.kill()
            p.wait()
            if os.name == 'posix':
                deadline = time.monotonic() + 5
                while True:
                    try: os.killpg(p.pid, 0)
                    except ProcessLookupError: break
                    if time.monotonic() >= deadline: raise RuntimeError('Owned command group did not finish cleanup')
                    time.sleep(0.05)
            record('cleanup-complete', childStatus=p.returncode)
        except BaseException as error:
            record('cleanup-failed', errorType=type(error).__name__, error=str(error)[:2048],
                   primary=primary, members=group_members())
            raise
PY
}

failure_tail() {
  printf '[failure-tail] %s (at most 80 lines, 2048 characters per line)\n' "$1"
  tail -n 80 "$2" | awk '{ print substr($0, 1, 2048); fflush(); }'
}

run_stage() {
  local name="$1" seconds="$2" result
  shift 2
  active_stage="$name"
  printf '%s stage=%s state=start budget=%ss\n' "$(date -u '+%FT%TZ')" "$name" "$seconds" | tee -a "$evidence/stages.log"
  printf '%s ' "$name" >> "$evidence/commands.log"
  printf '%q ' "$@" >> "$evidence/commands.log"
  printf '\n' >> "$evidence/commands.log"
  if bounded_run "$seconds" "$@" 2>&1 | tee "$evidence/$name.log" | awk '/^\[progress\]|^CompileC |^Swift|^Ld |^\*\*| error:| warning:/ { print; fflush(); }'; then
    result=0
  else result=$?; failure_tail "$name" "$evidence/$name.log"; fi
  printf '%s stage=%s state=end exit=%s\n' "$(date -u '+%FT%TZ')" "$name" "$result" | tee -a "$evidence/stages.log"
  return "$result"
}

if [[ "${1:-}" == --self-test ]]; then
  test_dir="$(mktemp -d)"
  trap 'rm -rf "$test_dir"' EXIT
  mkdir "$test_dir/normal" "$test_dir/guard"
  printf 'en0\nen1\n' | tee "$test_dir/normal/interfaces" > "$test_dir/guard/interfaces"
  interface_up() { printf '%s\n' "$1" >> "$test_dir/restored-interfaces"; }
  restore_network "$test_dir/normal"
  restore_network "$test_dir/normal"
  [[ "$(wc -l < "$test_dir/restored-interfaces" | tr -d ' ')" == 2 ]]
  guard_restore "$test_dir/guard" 1 &
  guard_test_pid=$!
  wait "$guard_test_pid"
  [[ -f "$test_dir/guard/guard-fired" && -f "$test_dir/guard/restored" ]]
  [[ "$(wc -l < "$test_dir/restored-interfaces" | tr -d ' ')" == 4 ]]
  mkdir "$test_dir/recovered" "$test_dir/persistent" "$test_dir/probe-failure" "$test_dir/early"
  printf 'en0\n' | tee "$test_dir/recovered/interfaces" "$test_dir/persistent/interfaces" > "$test_dir/probe-failure/interfaces"
  state="$test_dir/recovered" loopback_pid=mock probe_fails=0 restore_calls=0
  touch "$test_dir/loopback-alive"
  interface_up() {
    restore_calls="$(cat "$test_dir/restore-calls" 2>/dev/null || printf 0)"
    restore_calls=$((restore_calls + 1))
    printf '%s\n' "$restore_calls" > "$test_dir/restore-calls"
    [[ "$restore_calls" -gt 1 ]]
  }
  curl() {
    if [[ "$*" == *127.0.0.1* ]]; then
      [[ -f "$test_dir/loopback-alive" && -f "$state/restored" ]] || return 1
      printf 'loopback after restore\n' >> "$test_dir/probe-events"
    fi
    [[ "$probe_fails" == 0 ]]
  }
  guard_restore "$state" 1 &
  recovery_pid=$!
  prove_restoration "$state" 1 3
  wait "$recovery_pid"
  [[ -f "$state/guard-fired" && -f "$state/restoration-proven" && -f "$test_dir/loopback-alive" ]]
  [[ "$(wc -l < "$test_dir/probe-events" | tr -d ' ')" == 1 ]]
  state="$test_dir/persistent"
  interface_up() { return 1; }
  if prove_restoration "$state" 1 1; then exit 1; fi
  [[ ! -f "$state/restoration-proven" ]]
  state="$test_dir/probe-failure" probe_fails=1
  interface_up() { return 0; }
  if prove_restoration "$state" 1 1; then exit 1; fi
  [[ -f "$state/restored" && ! -f "$state/restoration-proven" ]]
  state="$test_dir/early" loopback_pid='' probe_fails=0
  prove_restoration "$state" 0 1
  [[ -f "$state/restoration-proven" && ! -f "$state/restored" ]]
  [[ "$(wc -l < "$test_dir/probe-events" | tr -d ' ')" == 1 ]]
  evidence="$test_dir"
  run_stage fixture-success 5 "$(python3 -c 'import sys; print(sys.executable)')" -c 'print("full diagnostic retained")'
  grep -q '^full diagnostic retained' "$evidence/fixture-success.log"
  if run_stage fixture-failure 5 "$(python3 -c 'import sys; print(sys.executable)')" -c 'raise SystemExit(9)'; then
    exit 1
  else [[ "$?" == 9 ]]; fi
  if run_stage fixture-deadline 1 "$(python3 -c 'import sys; print(sys.executable)')" -c 'import time; time.sleep(30)'; then
    exit 1
  else
    [[ "$?" == 124 ]]
  fi
  [[ "$active_stage" == fixture-deadline ]]
  [[ "$(tail -n 1 "$evidence/stages.log")" == *'stage=fixture-deadline state=end exit=124' ]]
  if run_stage fixture-traceback 5 "$(python3 -c 'import sys; print(sys.executable)')" -c 'raise RuntimeError("fixture diagnostic visible")' > "$test_dir/traceback-console.txt"; then
    exit 1
  else [[ "$?" == 1 ]]; fi
  grep -q '^RuntimeError: fixture diagnostic visible' "$test_dir/traceback-console.txt"
  grep -q '"reason": "child-exit".*"exitCode": 1' "$test_dir/traceback-console.txt"
  [[ ! -f "$evidence/command-cleanup-failed" ]]
  python3 - "${BASH_SOURCE[0]}" "$test_dir" <<'PY'
import os, pathlib, signal, subprocess, sys, time
source = pathlib.Path(sys.argv[1]).read_text()
body = source.split("python3 - \"$seconds\" \"$@\" <<'PY'\n", 1)[1].split('\nPY\n', 1)[0]
original_popen, original_argv = subprocess.Popen, sys.argv[:]
original_handlers = {s: signal.getsignal(s) for s in (signal.SIGINT, signal.SIGTERM)}
directory = pathlib.Path(sys.argv[2])
program = '''import json, os, pathlib, signal, subprocess, sys, time
ready = pathlib.Path(sys.argv[1])
grandchild = None
if os.name == 'posix':
    signal.signal(signal.SIGTERM, signal.SIG_IGN)
    grandchild = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(30)'])
ready.write_text(json.dumps({'child': os.getpid(), 'grandchild': grandchild.pid if grandchild else None}))
time.sleep(30)
'''
for reason, signum, expected in [('SIGINT', signal.SIGINT, 130), ('SIGTERM', signal.SIGTERM, 143), ('deadline', None, 124)]:
    children = []
    ready = directory / f'{reason}-child.json'
    class ObservedChild(original_popen):
        delivered = False
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            children.append(self)
        def wait(self, *args, **kwargs):
            if not self.delivered:
                self.delivered = True
                deadline = time.monotonic() + 5
                while not ready.exists():
                    assert self.poll() is None, 'Fixture child must be alive before cancellation'
                    assert time.monotonic() < deadline, 'Fixture child readiness deadline'
                    time.sleep(0.01)
                assert self.poll() is None
                if signum is not None: signal.raise_signal(signum)
            return super().wait(*args, **kwargs)
    subprocess.Popen = ObservedChild
    sys.argv = ['bounded', '1' if signum is None else '30', sys.executable, '-c', program, str(ready)]
    try:
        try: exec(compile(body, 'bounded_run', 'exec'), {})
        except SystemExit as exit_result: assert exit_result.code == expected, (reason, exit_result.code)
        else: raise AssertionError('Bounded child must exit')
        assert len(children) == 1 and children[0].poll() is not None, 'Owned child must be terminated and reaped'
        if os.name == 'posix':
            try: os.killpg(children[0].pid, 0)
            except ProcessLookupError: pass
            else: raise AssertionError('Owned descendant group must be gone')
        print(f'{reason}: exit={expected}, owned child PID={children[0].pid} terminated and waited; platform={os.name}')
    finally:
        subprocess.Popen, sys.argv = original_popen, original_argv[:]
        for s, handler in original_handlers.items(): signal.signal(s, handler)
        for child in children:
            if os.name == 'posix':
                try: os.killpg(child.pid, signal.SIGKILL)
                except ProcessLookupError: pass
            elif child.poll() is None: child.kill()
            child.wait()
cleanup_child = None
class CleanupFailureChild(original_popen):
    waits = 0
    def wait(self, *args, **kwargs):
        result = super().wait(*args, **kwargs)
        self.waits += 1
        if self.waits == 2: raise RuntimeError('fixture owned cleanup exception')
        return result
def failing_cleanup(*args, **kwargs):
    global cleanup_child
    if args[0][0] == sys.executable:
        cleanup_child = CleanupFailureChild(*args, **kwargs)
        return cleanup_child
    return original_popen(*args, **kwargs)
marker = directory / 'fixture-cleanup-failed'
os.environ['BOUNDED_CLEANUP_FAILED_FILE'] = str(marker)
subprocess.Popen = failing_cleanup
sys.argv = ['bounded', '5', sys.executable, '-c', 'raise SystemExit(0)']
try:
    try: exec(compile(body, 'bounded_run', 'exec'), {})
    except RuntimeError as error: assert str(error) == 'fixture owned cleanup exception'
    else: raise AssertionError('Fixture cleanup exception must propagate')
    import json
    details = json.loads(marker.read_text())
    assert details['event'] == 'cleanup-failed' and details['primary']['exitCode'] == 0
    assert details['errorType'] == 'RuntimeError' and details['ownedGroup'] == cleanup_child.pid
    assert cleanup_child.poll() is not None, 'Diagnostic fixture must reap the owned child'
    print('Cleanup exception: primary exit 0 retained, structured denial reason recorded, owned child reaped')
finally:
    subprocess.Popen, sys.argv = original_popen, original_argv[:]
    os.environ.pop('BOUNDED_CLEANUP_FAILED_FILE')
    for s, handler in original_handlers.items(): signal.signal(s, handler)
    if cleanup_child is not None:
        if cleanup_child.poll() is None: cleanup_child.kill()
        original_popen.wait(cleanup_child)
PY
  [[ ! -f "$evidence/command-cleanup-failed" ]]
  printf 'Helper self-test passed: restore/probe failure paths, timed recovery/live loopback, early diagnostics, retained stage logs/exit status, real-child signal and deadline cleanup. No host interface commands ran.\n'
  exit 0
fi

if [[ "${1:-}" == --restore-guard ]]; then
  native_host || { echo 'Restore guard requires the owned hosted macOS runner.' >&2; exit 1; }
  [[ "$2" == "$RUNNER_TEMP/grocery-ios-evidence/network" && "$3" == 150 ]] || exit 1
  guard_restore "$2" "$3"
  exit 0
fi

native_host || { echo 'Native verification requires a disposable GitHub-hosted macOS runner.' >&2; exit 1; }
[[ "${EXPECTED_SHA:-}" =~ ^[0-9a-f]{40}$ && "$(git rev-parse HEAD)" == "$EXPECTED_SHA" ]]
[[ -z "$(git status --porcelain --untracked-files=no)" ]]
[[ "$DEVELOPER_DIR" == /Applications/Xcode_26.6.app/Contents/Developer ]]

evidence="$RUNNER_TEMP/grocery-ios-evidence"
tools_dir="$RUNNER_TEMP/grocery-ios-tools"
state="$evidence/network"
compiler_cache="$RUNNER_TEMP/grocery-ios-derived/CompilationCache.noindex"
mkdir -p "$state" "$tools_dir" "$evidence/maestro" "$evidence/database"
udid='' guard_pid='' monitor_pid='' loopback_pid='' offline_started=0 passed=false active_stage=preflight

if [[ "${1:-}" == --cache-preflight ]]; then
  probe before-cache online
  [[ "${ImageVersion:-}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]
  date -u '+%FT%TZ' > "$state/cache-online-proven"
  printf 'cache_network_ready=true\nimage_version=%s\n' "$ImageVersion" >> "$GITHUB_OUTPUT"
  exit 0
fi

cleanup() {
  local result=$? cache_kib network_proven=0 primary_result
  primary_result="$result"
  trap - EXIT INT TERM
  if [[ -n "$monitor_pid" ]]; then kill "$monitor_pid" 2>/dev/null || true; wait "$monitor_pid" 2>/dev/null || true; fi
  if prove_restoration "$state" "$offline_started" 155; then
    network_proven=1
  else result=1; fi
  if [[ -n "$guard_pid" && ( "$offline_started" == 0 || -f "$state/restored" ) ]]; then
    kill "$guard_pid" 2>/dev/null || true
  fi
  if [[ -n "$loopback_pid" ]]; then kill "$loopback_pid" 2>/dev/null || true; fi
  if [[ -n "$udid" ]]; then
    bounded_run 30 xcrun simctl io "$udid" screenshot "$evidence/final-screen.png" > "$evidence/cleanup-screenshot.log" 2>&1 || failure_tail cleanup-screenshot "$evidence/cleanup-screenshot.log"
    bounded_run 60 xcrun simctl shutdown "$udid" > "$evidence/cleanup-shutdown.log" 2>&1 || failure_tail cleanup-shutdown "$evidence/cleanup-shutdown.log"
  fi
  if [[ "$network_proven" == 1 && ! -f "$evidence/command-cleanup-failed" ]]; then
    printf 'safe_to_upload=true\n' >> "$GITHUB_OUTPUT"
    if [[ -d "$compiler_cache" ]] && cache_kib="$(du -sk "$compiler_cache" | awk '{print $1}')"; then
      printf 'directory=%s\nsizeKiB=%s\n' "$compiler_cache" "$cache_kib" > "$evidence/compiler-cache-size.txt"
      if [[ "$cache_kib" =~ ^[0-9]+$ && "$cache_kib" -gt 0 && "$cache_kib" -le 2097152 ]]; then
        printf 'compiler_cache_save_ok=true\n' >> "$GITHUB_OUTPUT"
      fi
    fi
  else result=1; fi
  if [[ "$result" != 0 ]]; then passed=false; fi
  EXPECTED_SHA="$EXPECTED_SHA" EVIDENCE="$evidence" PASSED="$passed" RESULT="$result" PRIMARY_RESULT="$primary_result" OFFLINE_STARTED="$offline_started" UDID="$udid" ACTIVE_STAGE="$active_stage" python3 - <<'PY'
import json, os, pathlib
p = pathlib.Path(os.environ['EVIDENCE'])
receipt = {'sourceSHA': os.environ['EXPECTED_SHA'], 'workflowSHA': os.getenv('GITHUB_WORKFLOW_SHA'),
           'runID': os.getenv('GITHUB_RUN_ID'), 'simulatorUDID': os.environ['UDID'],
           'nativeOfflineSmokePassed': os.environ['PASSED'] == 'true', 'exitCode': int(os.environ['RESULT']),
           'primaryExitCode': int(os.environ['PRIMARY_RESULT']),
           'lastStage': os.environ['ACTIVE_STAGE'],
           'bundleIdentifier': 'com.saudm6.grocerytracker', 'configuration': 'Release',
           'networkRestored': (p/'network/restored').exists(),
           'networkRestorationProven': (p/'network/restoration-proven').exists(),
           'ownedCommandCleanupFailed': (p/'command-cleanup-failed').exists(),
           'ownedCommandCleanupDetails': (p/'command-cleanup-failed').read_text()[-4096:] if (p/'command-cleanup-failed').exists() else None,
           'safeToUpload': (p/'network/restoration-proven').exists() and not (p/'command-cleanup-failed').exists(),
           'networkWithdrawn': os.getenv('OFFLINE_STARTED') == '1',
           'networkProbeTail': (p/'network/probes.log').read_text().splitlines()[-8:] if (p/'network/probes.log').exists() else [],
           'timedGuardFired': (p/'network/guard-fired').exists(),
           'limits': ['Simulator, not physical iPhone', 'Manual-purchase slice only; final issue 18 audit follows features',
                      'No physical camera or spoken screen-reader proof']}
(p/'receipt.json').write_text(json.dumps(receipt, indent=2)+'\n')
print('[cleanup-receipt] ' + json.dumps(receipt), flush=True)
PY
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

{
  printf 'sourceSHA=%s\nworkflowSHA=%s\nImageVersion=%s\n' "$EXPECTED_SHA" "${GITHUB_WORKFLOW_SHA:-}" "${ImageVersion:-}"
  sw_vers
  xcodebuild -version
  node --version
  ruby --version
  pod --version
} > "$evidence/toolchain.txt"
git show -s --format=fuller HEAD > "$evidence/source.txt"
shasum -a 256 package-lock.json tests/native/ios-smoke.yaml scripts/verify-ios-simulator.sh > "$evidence/source-checksums.txt"
printf 'exactHit=%s\nmatchedKey=%s\n' "${COMPILER_CACHE_HIT:-}" "${COMPILER_CACHE_MATCHED_KEY:-}" > "$evidence/compiler-cache-restore.txt"
xcrun simctl list --json > "$evidence/simulator-inventory.json"

run_stage template-download 120 curl --fail --location --retry 3 'https://registry.npmjs.org/expo-template-bare-minimum/-/expo-template-bare-minimum-57.0.29.tgz' -o "$tools_dir/template.tgz"
node - "$tools_dir/template.tgz" <<'JS'
const fs = require('node:fs'), crypto = require('node:crypto'), assert = require('node:assert/strict');
assert.equal(crypto.createHash('sha512').update(fs.readFileSync(process.argv[2])).digest('base64'), 'Ydc5gzg89z1M3c3eHNACL3aM/i7oame6veQ85Z97Y2hPSpWcWYBKaPd+e10sikCs99Qu9v/AE+QLzLW4QpG4/A==');
JS
run_stage maestro-download 600 curl --fail --location --retry 3 'https://github.com/mobile-dev-inc/Maestro/releases/download/cli-2.11.0/maestro.zip' -o "$tools_dir/maestro.zip"
printf '%s  %s\n' 5384593cb4e7a106489e75a821d157dd43f4e438df6bc308b72e82c685e1283a "$tools_dir/maestro.zip" | shasum -a 256 -c -
unzip -q "$tools_dir/maestro.zip" -d "$tools_dir"
export PATH="$tools_dir/maestro/bin:$PATH" JAVA_HOME="$JAVA_HOME_21_X64" MAESTRO_CLI_NO_ANALYTICS=1
maestro --version >> "$evidence/toolchain.txt"
shasum -a 256 "$tools_dir/template.tgz" "$tools_dir/maestro.zip" > "$evidence/tool-checksums.txt"

export EXPO_PRECOMPILED_FLAVOR=release RCT_NO_LAUNCH_PACKAGER=1
run_stage prebuild 300 npx --no-install expo prebuild --platform ios --no-install --skip-dependency-update react,react-native --template "$tools_dir/template.tgz"
node - "$EXPECTED_SHA" <<'JS'
const fs = require('node:fs'), assert = require('node:assert/strict'), cp = require('node:child_process');
const original = JSON.parse(cp.execFileSync('git', ['show', `${process.argv[2]}:package.json`], {encoding:'utf8'}));
const generated = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const allowed = structuredClone(original);
allowed.scripts.android = 'expo run:android'; allowed.scripts.ios = 'expo run:ios';
assert.deepEqual(generated, allowed, 'Prebuild may change only the two known run scripts');
cp.execFileSync('git', ['restore', '--source', process.argv[2], '--', 'package.json']);
assert.equal(cp.execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], {encoding:'utf8'}), '', 'Prebuild changed tracked source or lockfile');
JS
run_stage pods 600 /bin/bash -c 'cd ios && pod install'
cp ios/Podfile.lock "$evidence/Podfile.lock"
shasum -a 256 "$evidence/Podfile.lock" > "$evidence/native-lockfile-checksum.txt"
[[ -z "$(git status --porcelain --untracked-files=no)" ]]

workspace="$(find ios -maxdepth 1 -type d -name '*.xcworkspace')"
project="$(find ios -maxdepth 1 -type d -name '*.xcodeproj')"
[[ -n "$workspace" && "$workspace" != *$'\n'* && -n "$project" && "$project" != *$'\n'* ]]
scheme="$(ruby -r xcodeproj -e 'p=Xcodeproj::Project.open(ARGV[0]); t=p.targets.select{|x| x.product_type=="com.apple.product-type.application"}; abort "Expected one application target" unless t.length==1; puts t[0].name' "$project")"
active_stage=scheme-inventory
bounded_run 300 xcodebuild -list -json -workspace "$workspace" > "$evidence/schemes.json"
python3 - "$evidence/simulator-inventory.json" <<'PY'
import json, sys
d=json.load(open(sys.argv[1]))
assert any(x['identifier']=='com.apple.CoreSimulator.SimRuntime.iOS-26-5' and x.get('isAvailable') for x in d['runtimes']), 'Pinned iOS runtime unavailable'
assert any(x['identifier']=='com.apple.CoreSimulator.SimDeviceType.iPhone-17' for x in d['devicetypes']), 'Pinned device type unavailable'
PY
udid="$(xcrun simctl create grocery-ios-proof com.apple.CoreSimulator.SimDeviceType.iPhone-17 com.apple.CoreSimulator.SimRuntime.iOS-26-5)"
printf '%s\n' "$udid" > "$evidence/simulator-udid.txt"
xcrun simctl boot "$udid"
run_stage simulator-boot 600 xcrun simctl bootstatus "$udid" -b
build_args=(-workspace "$workspace" -scheme "$scheme" -configuration Release -sdk iphonesimulator -destination "platform=iOS Simulator,id=$udid" -derivedDataPath "$RUNNER_TEMP/grocery-ios-derived" CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO COMPILER_INDEX_STORE_ENABLE=NO ONLY_ACTIVE_ARCH=YES COMPILATION_CACHE_ENABLE_CACHING=YES COMPILATION_CACHE_ENABLE_DIAGNOSTIC_REMARKS=YES)
active_stage=build-settings
bounded_run 300 xcodebuild "${build_args[@]}" -showBuildSettings -json > "$evidence/build-settings.json"
app="$(python3 - "$evidence/build-settings.json" "$scheme" "$compiler_cache" <<'PY'
import json, os, sys
rows=[x['buildSettings'] for x in json.load(open(sys.argv[1])) if x['target']==sys.argv[2]]
assert len(rows)==1
s=rows[0]
assert s['PRODUCT_BUNDLE_IDENTIFIER']=='com.saudm6.grocerytracker'
assert s['PLATFORM_NAME']=='iphonesimulator'
assert s['COMPILATION_CACHE_ENABLE_CACHING']=='YES'
assert s['COMPILATION_CACHE_ENABLE_DIAGNOSTIC_REMARKS']=='YES'
assert s['COMPILATION_CACHE_CAS_PATH']==sys.argv[3]
print(os.path.join(s['TARGET_BUILD_DIR'], s['WRAPPER_NAME']))
PY
)"
[[ ! -e "$app" ]]
date '+%s' > "$evidence/build-start-epoch.txt"
run_stage build 10800 xcodebuild "${build_args[@]}" -resultBundlePath "$evidence/build.xcresult" -jobs 2 build
[[ -s "$app/main.jsbundle" ]]
python3 - "$app/main.jsbundle" "$evidence/build-start-epoch.txt" <<'PY' > "$evidence/fresh-bundle.json"
import json, os, sys
started=int(open(sys.argv[2]).read())
modified=os.stat(sys.argv[1]).st_mtime
assert modified >= started, 'Embedded JavaScript must be generated by this build'
print(json.dumps({'buildStartedEpoch': started, 'bundleModifiedEpoch': modified, 'appAbsentBeforeBuild': True}, indent=2))
PY
[[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$app/Info.plist")" == com.saudm6.grocerytracker ]]
executable="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$app/Info.plist")"
xcrun lipo -archs "$app/$executable" > "$evidence/app-architecture.txt"
grep -q x86_64 "$evidence/app-architecture.txt"
shasum -a 256 "$app/main.jsbundle" "$app/$executable" > "$evidence/app-checksums.txt"
tar -czf "$evidence/app.tar.gz" -C "$(dirname "$app")" "$(basename "$app")"
xcrun simctl install "$udid" "$app"
installed="$(xcrun simctl get_app_container "$udid" com.saudm6.grocerytracker app)"
cmp "$app/main.jsbundle" "$installed/main.jsbundle"
active_stage=driver-warmup
bounded_run 300 maestro --device "$udid" hierarchy > "$evidence/driver-warmup.json"

python3 -m http.server 9187 --bind 127.0.0.1 --directory "$tools_dir" > "$state/loopback.log" 2>&1 &
loopback_pid=$!
sleep 1
probe before online
if curl --noproxy '*' --silent --head --connect-timeout 2 --max-time 5 'http://[2606:4700:4700::1111]' > "$state/before-ipv6.txt" 2>&1; then
  touch "$state/ipv6-available"
else printf 'IPv6 egress unavailable before test; no IPv6 blocking claim.\n' > "$state/ipv6-unavailable.txt"; fi
/sbin/ifconfig -a > "$state/interfaces-before.txt"
/sbin/ifconfig -l -u | tr ' ' '\n' | sed '/^$/d; /^lo0$/d' > "$state/interfaces"
[[ -s "$state/interfaces" ]]
nohup /bin/bash "$PWD/scripts/verify-ios-simulator.sh" --restore-guard "$state" 150 > "$state/guard.log" 2>&1 < /dev/null &
guard_pid=$!
for attempt in $(seq 1 20); do [[ ! -f "$state/guard-ready" ]] || break; sleep 0.1; done
[[ -f "$state/guard-ready" ]]
offline_started=1
while IFS= read -r interface; do sudo /sbin/ifconfig "$interface" down; done < "$state/interfaces"
/sbin/ifconfig -a > "$state/interfaces-offline.txt"
probe withdrawn offline
(
  while true; do
    active="$(/sbin/ifconfig -l -u | tr ' ' '\n' | sed '/^$/d; /^lo0$/d')"
    if [[ -n "$active" ]] || ! probe during offline; then
      printf '%s external interface/probe changed\n' "$(date -u '+%FT%TZ')" > "$state/offline-violation"
      exit 1
    fi
    sleep 2
  done
) > "$state/monitor.log" 2>&1 &
monitor_pid=$!
proof_date="$(date '+%Y-%m-%d')"
proof_month="${proof_date:0:7}"
printf '%s\n' "$proof_date" > "$evidence/proof-date.txt"
active_stage=offline-ui
bounded_run 120 maestro --device "$udid" test tests/native/ios-smoke.yaml -e "MONTH=$proof_month" --format JUNIT --output "$evidence/maestro/junit.xml" --debug-output "$evidence/maestro/debug" --test-output-dir "$evidence/maestro/artifacts" 2>&1 | tee "$evidence/maestro/output.log"
probe completed offline
[[ ! -f "$state/offline-violation" && ! -f "$state/guard-fired" ]]
[[ "$(date '+%Y-%m-%d')" == "$proof_date" ]]
kill "$monitor_pid" 2>/dev/null || true
wait "$monitor_pid" 2>/dev/null || true
monitor_pid=''
restore_network "$state"
kill "$guard_pid" 2>/dev/null || true
guard_pid=''
probe restored online
[[ ! -f "$state/guard-fired" ]]
container="$(xcrun simctl get_app_container "$udid" com.saudm6.grocerytracker data)"
db="$container/Documents/SQLite/grocery.db"
[[ -s "$db" ]]
cp "$db" "$evidence/database/grocery.db"
for suffix in -wal -shm; do if [[ -f "$db$suffix" ]]; then cp "$db$suffix" "$evidence/database/grocery.db$suffix"; fi; done
active_stage=database-proof
node tests/native/assert-ios-db.mjs "$evidence/database/grocery.db" "$proof_month" "$proof_date" > "$evidence/database-proof.json"
shasum -a 256 "$evidence/database/"* > "$evidence/database-checksums.txt"
[[ "$(git rev-parse HEAD)" == "$EXPECTED_SHA" && -z "$(git status --porcelain --untracked-files=no)" ]]
git status --porcelain --untracked-files=no > "$evidence/final-source-status.txt"
passed=true
