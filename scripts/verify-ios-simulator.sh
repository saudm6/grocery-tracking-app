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

bounded_run() {
  local seconds="$1"
  shift
  python3 - "$seconds" "$@" <<'PY'
import os, signal, subprocess, sys
p = subprocess.Popen(sys.argv[2:], start_new_session=True)
try:
    sys.exit(p.wait(timeout=int(sys.argv[1])))
except subprocess.TimeoutExpired:
    if os.name == 'posix': os.killpg(p.pid, signal.SIGTERM)
    else: p.terminate()
    try:
        p.wait(timeout=5)
    except subprocess.TimeoutExpired:
        if os.name == 'posix': os.killpg(p.pid, signal.SIGKILL)
        else: p.kill()
        p.wait()
    sys.exit(124)
PY
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
  if bounded_run 1 "$(python3 -c 'import sys; print(sys.executable)')" -c 'import time; time.sleep(30)'; then
    exit 1
  else
    [[ "$?" == 124 ]]
  fi
  printf 'Network helper self-test passed: idempotent restore, independent timed restore, process deadline. No host interface commands ran.\n'
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
mkdir -p "$state" "$tools_dir" "$evidence/maestro" "$evidence/database"
udid='' guard_pid='' monitor_pid='' loopback_pid='' offline_started=0 passed=false

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
  curl --noproxy '*' --fail --silent --max-time 2 http://127.0.0.1:9187/ > /dev/null
}

cleanup() {
  local result=$?
  trap - EXIT INT TERM
  if [[ -n "$monitor_pid" ]]; then kill "$monitor_pid" 2>/dev/null || true; wait "$monitor_pid" 2>/dev/null || true; fi
  if [[ "$offline_started" == 1 ]]; then
    restore_network "$state" || result=1
    if [[ -f "$state/restored" ]]; then
      if [[ -n "$guard_pid" ]]; then kill "$guard_pid" 2>/dev/null || true; fi
      probe after online || result=1
    else result=1; fi
  fi
  if [[ -n "$loopback_pid" ]]; then kill "$loopback_pid" 2>/dev/null || true; fi
  if [[ -n "$udid" ]]; then
    xcrun simctl io "$udid" screenshot "$evidence/final-screen.png" 2>/dev/null || true
    xcrun simctl shutdown "$udid" 2>/dev/null || true
  fi
  if [[ "$result" != 0 ]]; then passed=false; fi
  EXPECTED_SHA="$EXPECTED_SHA" EVIDENCE="$evidence" PASSED="$passed" RESULT="$result" UDID="$udid" python3 - <<'PY'
import json, os, pathlib
p = pathlib.Path(os.environ['EVIDENCE'])
receipt = {'sourceSHA': os.environ['EXPECTED_SHA'], 'workflowSHA': os.getenv('GITHUB_WORKFLOW_SHA'),
           'runID': os.getenv('GITHUB_RUN_ID'), 'simulatorUDID': os.environ['UDID'],
           'nativeOfflineSmokePassed': os.environ['PASSED'] == 'true', 'exitCode': int(os.environ['RESULT']),
           'bundleIdentifier': 'com.saudm6.grocerytracker', 'configuration': 'Release',
           'networkRestored': (p/'network/restored').exists(), 'timedGuardFired': (p/'network/guard-fired').exists(),
           'limits': ['Simulator, not physical iPhone', 'Manual-purchase slice only; final issue 18 audit follows features',
                      'No physical camera or spoken screen-reader proof']}
(p/'receipt.json').write_text(json.dumps(receipt, indent=2)+'\n')
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
xcrun simctl list --json > "$evidence/simulator-inventory.json"

curl --fail --location --retry 3 'https://registry.npmjs.org/expo-template-bare-minimum/-/expo-template-bare-minimum-57.0.29.tgz' -o "$tools_dir/template.tgz"
node - "$tools_dir/template.tgz" <<'JS'
const fs = require('node:fs'), crypto = require('node:crypto'), assert = require('node:assert/strict');
assert.equal(crypto.createHash('sha512').update(fs.readFileSync(process.argv[2])).digest('base64'), 'Ydc5gzg89z1M3c3eHNACL3aM/i7oame6veQ85Z97Y2hPSpWcWYBKaPd+e10sikCs99Qu9v/AE+QLzLW4QpG4/A==');
JS
curl --fail --location --retry 3 'https://github.com/mobile-dev-inc/Maestro/releases/download/cli-2.11.0/maestro.zip' -o "$tools_dir/maestro.zip"
printf '%s  %s\n' 5384593cb4e7a106489e75a821d157dd43f4e438df6bc308b72e82c685e1283a "$tools_dir/maestro.zip" | shasum -a 256 -c -
unzip -q "$tools_dir/maestro.zip" -d "$tools_dir"
export PATH="$tools_dir/maestro/bin:$PATH" JAVA_HOME="$JAVA_HOME_21_X64" MAESTRO_CLI_NO_ANALYTICS=1
maestro --version >> "$evidence/toolchain.txt"
shasum -a 256 "$tools_dir/template.tgz" "$tools_dir/maestro.zip" > "$evidence/tool-checksums.txt"

export EXPO_PRECOMPILED_FLAVOR=release RCT_NO_LAUNCH_PACKAGER=1
npx --no-install expo prebuild --platform ios --no-install --skip-dependency-update react,react-native --template "$tools_dir/template.tgz" 2>&1 | tee "$evidence/prebuild.log"
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
(cd ios && pod install) 2>&1 | tee "$evidence/pods.log"
[[ -z "$(git status --porcelain --untracked-files=no)" ]]

workspace="$(find ios -maxdepth 1 -type d -name '*.xcworkspace')"
project="$(find ios -maxdepth 1 -type d -name '*.xcodeproj')"
[[ -n "$workspace" && "$workspace" != *$'\n'* && -n "$project" && "$project" != *$'\n'* ]]
scheme="$(ruby -r xcodeproj -e 'p=Xcodeproj::Project.open(ARGV[0]); t=p.targets.select{|x| x.product_type=="com.apple.product-type.application"}; abort "Expected one application target" unless t.length==1; puts t[0].name' "$project")"
xcodebuild -list -json -workspace "$workspace" > "$evidence/schemes.json"
python3 - "$evidence/simulator-inventory.json" <<'PY'
import json, sys
d=json.load(open(sys.argv[1]))
assert any(x['identifier']=='com.apple.CoreSimulator.SimRuntime.iOS-26-5' and x.get('isAvailable') for x in d['runtimes']), 'Pinned iOS runtime unavailable'
assert any(x['identifier']=='com.apple.CoreSimulator.SimDeviceType.iPhone-17' for x in d['devicetypes']), 'Pinned device type unavailable'
PY
udid="$(xcrun simctl create grocery-ios-proof com.apple.CoreSimulator.SimDeviceType.iPhone-17 com.apple.CoreSimulator.SimRuntime.iOS-26-5)"
printf '%s\n' "$udid" > "$evidence/simulator-udid.txt"
xcrun simctl boot "$udid"
xcrun simctl bootstatus "$udid" -b
build_args=(-workspace "$workspace" -scheme "$scheme" -configuration Release -sdk iphonesimulator -destination "platform=iOS Simulator,id=$udid" -derivedDataPath "$RUNNER_TEMP/grocery-ios-derived" CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO COMPILER_INDEX_STORE_ENABLE=NO ONLY_ACTIVE_ARCH=YES)
xcodebuild "${build_args[@]}" -showBuildSettings -json > "$evidence/build-settings.json"
xcodebuild "${build_args[@]}" -resultBundlePath "$evidence/build.xcresult" -jobs 2 build 2>&1 | tee "$evidence/build.log"
app="$(python3 - "$evidence/build-settings.json" "$scheme" <<'PY'
import json, os, sys
rows=[x['buildSettings'] for x in json.load(open(sys.argv[1])) if x['target']==sys.argv[2]]
assert len(rows)==1
s=rows[0]
assert s['PRODUCT_BUNDLE_IDENTIFIER']=='com.saudm6.grocerytracker'
assert s['PLATFORM_NAME']=='iphonesimulator'
print(os.path.join(s['TARGET_BUILD_DIR'], s['WRAPPER_NAME']))
PY
)"
[[ -s "$app/main.jsbundle" ]]
[[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$app/Info.plist")" == com.saudm6.grocerytracker ]]
executable="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$app/Info.plist")"
xcrun lipo -archs "$app/$executable" > "$evidence/app-architecture.txt"
rg -q x86_64 "$evidence/app-architecture.txt"
shasum -a 256 "$app/main.jsbundle" "$app/$executable" > "$evidence/app-checksums.txt"
tar -czf "$evidence/app.tar.gz" -C "$(dirname "$app")" "$(basename "$app")"
xcrun simctl install "$udid" "$app"
installed="$(xcrun simctl get_app_container "$udid" com.saudm6.grocerytracker app)"
cmp "$app/main.jsbundle" "$installed/main.jsbundle"
maestro --device "$udid" hierarchy > "$evidence/driver-warmup.json"

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
node tests/native/assert-ios-db.mjs "$evidence/database/grocery.db" "$proof_month" "$proof_date" > "$evidence/database-proof.json"
shasum -a 256 "$evidence/database/"* > "$evidence/database-checksums.txt"
[[ "$(git rev-parse HEAD)" == "$EXPECTED_SHA" && -z "$(git status --porcelain --untracked-files=no)" ]]
git status --porcelain --untracked-files=no > "$evidence/final-source-status.txt"
passed=true
