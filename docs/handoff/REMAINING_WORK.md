# Remaining work — paused handoff

Implementation is **paused at the user's request**. This document is a future plan, not permission to edit, build, publish, merge, dispatch or rerun anything. After the three handoff documents are pushed, stop and wait for the user to resume. Earlier autonomous implementation and automatic-merge authorization does not override this pause.

Read [Current status](CURRENT_STATUS.md) and [Completed work and design](COMPLETED_WORK_AND_DESIGN.md) alongside this plan. The [backlog](../implementation-backlog.md), [design](../superpowers/specs/2026-10-09-grocery-tracker-design.md) and actual issue bodies remain the acceptance contract. Thirteen feature issues are merged; #6, #7, #8, #17 and #18 remain open. PR21 is an unmerged runtime prerequisite for #18, not completion of #18.

## Starting points

Read-only GitHub and local inspection during this documentation pass confirmed main and the two open PR heads below. Recheck them after resume; handoff SHAs are snapshots, not instructions to overwrite later work.

| Work | Branch and exact starting head | Location / state |
| --- | --- | --- |
| Actual merged main16 | `main` — `1e551d2dc678bd1fa3c900d04cb2b3007e142608` | `E:/Projects/grocery-tracking-app`; features through #16, excluding #6–#8 and #17 |
| iOS prerequisite [PR21](https://github.com/saudm6/grocery-tracking-app/pull/21) | `test/ios-simulator-runtime` — `e92b9a7fccb79723cea58ba96a11df9ed09fb0d2` | `E:/Projects/grocery-tracking-worktrees/ios-runtime`; published, native run failed |
| Known camera [PR28 / #6](https://github.com/saudm6/grocery-tracking-app/pull/28) | `feat/issue-06-known-camera` — `3cd92547d9c91de006f6b6837dae505e08b444e9` | `E:/Projects/grocery-tracking-worktrees/issue06`; source, 70-test CI, exports and Android accepted; iOS pending |
| [#7](https://github.com/saudm6/grocery-tracking-app/issues/7) transaction core | `codex/issue-07-unknown-scan` — `35eadcc60f34deb7dda5564e979ae92fbd787c66` | `E:/Projects/grocery-tracking-worktrees/issue07`; unpublished data-only candidate, parent actual main16 |
| [#8](https://github.com/saudm6/grocery-tracking-app/issues/8) catalog core | `codex/issue-08-catalog-code` — `abbc03eca0c029078c14fb25197c00ef8a722e62` | `E:/Projects/grocery-tracking-worktrees/issue08`; unpublished refresh correction over `3ccb41604db3bb7bd3565cbba6e8028ac3171d55`, original base actual main16 |
| [#17](https://github.com/saudm6/grocery-tracking-app/issues/17) access core | `codex/issue-17-accessibility-core` — `d12bf8ef1050d0ee0eb43df742e343fd84335bb9` | `E:/Projects/grocery-tracking-worktrees/issue17`; unpublished two-file core, parent actual main16 |

Continue each owned branch by a **normal merge of verified, actually landed main**, preserving existing work. Do not merge open prerequisite branches, rebase or force-push. For any target advance, compare the complete owned patch, conflicts, native inputs and actual callers. A compatible stable-screen target advance alone does not require recompiling an unchanged native prerequisite; final #18 still needs the latest complete installed app on both platforms.

## Latest iOS outcome: e92 failed at Simulator boot

[Run 38068494331](https://github.com/saudm6/grocery-tracking-app/actions/runs/38068494331), attempt 1, job `114260912971`, failed. The authoritative job completion is **2026-10-10 17:04:19 UTC**. The “Complete job” step ended at 17:04:07 UTC; the local terminal checkpoint was recorded at 17:04:50.946 UTC and collection finished at 17:04:53.876 UTC. These timestamps describe different events.

Exact tested source is e92, tree `292f19f73a6d45edeb3ca225e09ef0cdc0277258`. Its parent is `f50d5db4b2ec4524bee9eb33c8ff430615eb2d0e`; f50 was an unpublished warmup-relocation experiment, subsequently reversed. Net e92 versus the preceding published c0b2 changes exactly four runtime bounds, described below. The native receipt identifies workflow merge SHA `b1102c7ed2e7d93863bb5405d56b7318d29975e5`.

The earliest failed gate is `run_stage simulator-boot 600 xcrun simctl bootstatus "$udid" -b` at `scripts/verify-ios-simulator.sh:888`. Boot output progressed through data migration, including Tones, Vibrations and Shortcuts migrators, then remained nonterminal waiting for the system app. Critical retained lines are:

```text
Status=4, isTerminal=NO, Elapsed=10:06.
Waiting on System App
"reason": "deadline", "exitCode": 124
stage=simulator-boot state=end exit=124
```

The stage started at 16:51:29 UTC; its deadline result was emitted around 17:01:44–47 UTC. This establishes a bounded Simulator-boot timeout. It does not establish an app defect, the underlying migration/system-app cause, or that a blind rerun or larger deadline would succeed.

| Boundary | Actual evidence and limit |
| --- | --- |
| Source / helpers | Hosted source and proof-helper step passed. Both current ordinary Checks runs (`38068492528` push and `38068494341` PR) passed type/lint, 68 tests, zero failures and both JS exports. Their actual checkout trees match e92. These are source checks, not installed iOS proof. |
| Tools / prebuild / Pods | Template download, Maestro download, prebuild and Pods stages exited 0. Maestro archive checksum reported OK. Native lock capture follows successful Pods in source order, but no lockfile artifact was uploaded from this run. |
| `xcodebuild` | One pre-boot xcodebuild child exited 0 with proven owned-group cleanup. The source call at line 878 is **scheme enumeration (`-list -json`)**, not the Release build at line 916. No `BUILD SUCCEEDED`, Release archive, embedded bundle, install or installed-JS comparison is credited for e92. |
| Simulator / app | Boot deadline 124 is proved. Source order stops before driver warmup, loopback startup, Release build, installation, UI, purchase, restart and native SQLite proof. The complete app UI result is unknown/unexecuted, not an app assertion failure. |
| Connectivity | Before-cache GitHub, Apple and IPv4 probes returned 0. Cleanup later recorded `after github 28`; its first failed endpoint short-circuits the rest. The underlying DNS/connect/TLS/service/routing cause is unknown. No successful final online proof is retained. |
| Denial / restoration | Receipt says `networkWithdrawn:false`, `timedGuardFired:false`, `networkRestorationProven:false`. The offline phase and guard were never started. Thus no withdrawal, offline operation or restoration pass is claimed; the failed final connectivity proof correctly withheld output. |
| Cleanup / artifacts / cache | Boot child's deadline cleanup completed (`childStatus:-15`); final `ownedCommandCleanupFailed:false`. Loopback was never started, so `loopbackServerWaited:false` is not a live-server cleanup test. The later deadline belongs to the source's cleanup screenshot command, not evidence of shutdown failure. `safeToUpload:false`; artifact upload and compiler-cache save were skipped; artifact inventory is **0**. Cache restore ran earlier, but this outcome proves no build speedup or successful current cache save. |

The final receipt has `nativeOfflineSmokePassed:false`, `primaryExitCode:124`, `lastStage:"simulator-boot"` and final `exitCode:1` after the failed online proof. Strict safety/output gates were retained. No Paid 0.003, saved-price baseline, restart, native DB, completed-offline or latest-app acceptance follows.

Evidence already collected, without a replacement observer:

- Raw log: `C:/Users/Saud/.codex/visualizations/2026/10/09/01a12185-4b2e-7a33-8488-bba9785051e7/orchestrate/issue18-native-run38068494331.log` — **129,236 bytes**, SHA256 **`d8915ad79a09db52336d88df05ee8d2ffa0ca87b6c30664f5964f9e06e8af49d`**.
- Same directory: `issue18-native-run38068494331-metadata.json`, `-jobs.json`, `-artifacts.json`, `-completion-collection.json`, and `issue18-native-watch-e92-checkpoint.json`. The watcher naturally completed; do not restart or poll a missing old handle.
- Accepted source/bounds, publication and current CI reviews: `issue18-root-e92-offline-budget-source-review.md`, `issue18-root-e92-publication-review.md`, `issue18-root-e92-ci-review.md` in that directory.

This documentation diagnosis is grounded in the raw log and exact source order. **e92's terminal outcome has not yet received the independent failure classification/index and ledger entry used for earlier attempts.** The ledger's thirteen older PR21 failed heads predate e92; none grants a native PASS. The pause prevents starting a new audit or retry now.

## Priority sequence after user resume

The practical order is **PR21 → #6 → #7 → #8 → #17 → #18**. #7 and #8 share identification/editor reach, so coordinate their writers and integrate only landed work. The independent data/core candidates below are preparation, not completed issues.

### 1. Finish PR21's native prerequisite

First obtain the independent, read-only e92 outcome review using the already collected log/source/metadata. Inspect the exact boot boundary and failed final connectivity probe before selecting any bounded next action. Keep underlying causes unknown unless new evidence proves them. Do not launch an identical job, alter an assertion, or increase another timeout simply because this run failed. Any justified correction needs its smallest affected check, an exact committed candidate, independent source review and coordinator release before publication/one native attempt.

PR21 owns exactly `.github/workflows/ios-simulator.yml`, `scripts/verify-ios-simulator.sh`, `tests/native/ios-smoke.yaml`, `tests/native/assert-ios-db.mjs`, README and app.json's iOS bundle identifier. Preserve SDK/template/Maestro integrity, unsigned fresh Release packaging, exact source, schema 2 proof, generated Podfile.lock, embedded-JS/install identity, all 56 flow commands and strict owned-process/network/output gates.

The current accepted bounds are **offline command 600 seconds, timed restoration guard 630, cleanup restoration wait 635**. Driver startup environment remains 120000 milliseconds; native compile 180 minutes, job 240 minutes, Simulator boot 600 seconds and original single warmup placement are unchanged. `600 < 630 < 635` gives nominal margins, not a guaranteed maximum-duration probe envelope; guard/probe violations must fail closed. The older camera plan's **120/150/155** values and its 6d2 “current run” wording are superseded historical snapshots.

Before merge, prove the real installed offline manual purchase: validation, 3 × 0.001 OMR = 0.003 OMR, saved-price provenance, process restart, literal SQLite/schema/integrity/FKs, before/during/completed/after connectivity, timed guard behavior and actual cleanup/output eligibility. An ordinary UI failure remains native FAIL even if diagnostics/cache upload is safe. Review the exact then-current target, full patch and caller/native compatibility independently. PR21 remains “Prerequisite for #18”; never close #18 with it.

Historical failures to preserve, not replay blindly: da5/6df compile limits and cleanup/diagnostic gaps; bf249 missing `rg`; f92 driver timeout plus strict process-permission handling; 935 loopback probe timeout; 3fa server-readiness failure; eb and c4c6/08e self-test signal/auxiliary-process defects; 3e53 tab-selector mismatch; 442 second keyboard-dismissal failure; 6d2 attempt 1 external GitHub timeout and attempt 2 plain Home selector failure; c0b2 whole offline-command deadline. Their exact receipts retain uncertain causes. Current code incorporates independently reviewed fixes; old failed native runs are not acceptance for unexecuted later steps.

### 2. Integrate and finish #6's real camera binary

Once PR21 is actually accepted and landed, the #6 owner normally merges that **actual main** into 3cd's branch, preserving its seven-file camera patch and the accepted runtime harness. Retain the camera plugin and `com.saudm6.grocerytracker` iOS identifier together. Do not dispatch raw 3cd: it lacks the runtime harness and iOS bundle identifier.

The shipped shared identifier is **`src/components/product-chooser.tsx`**, including Capture state, generations and CameraView, plus its purchase caller/camera adapter. `CodeIdentifier` was a prospective extraction name, not an existing completed component. Reuse the real chooser rather than creating a second decoder, lookup owner or save coordinator.

Accepted 3cd evidence includes source/70-test CI/both exports and Android PASS+NOTES: 21 real imagefile-camera/native callback cases; exact bytes/format/owner or error; permission recovery, focus/background/reopen, held lookup and parent-identity invalidation, archived ownership, read retry, late transaction rollback and rapid-save admission. Its compatible installed native9ab debug host with current-source maps is **Metro-backed execution**, not a 3cd embedded offline APK. Physical optical calibration remains untested.

Fresh integration comparisons must bind Android dependency/config/native fingerprints and current-source mappings before reusing that Android proof. iOS requires compiling the actual locked **expo-camera 57.0.6** module, retaining resolved camera Pods/Podfile.lock, Info.plist's camera purpose and absence of microphone permission. No Android-only or JS-export pass substitutes for this binary.

Use the accepted narrow camera-iOS plan: real permission denial and usable manual/typed fallback, retained month/paid/store draft, explicit saved-product selection, foreground/background/close/reopen, actual blank/unavailable/error behavior, no fabricated mount event or callback, and no accidental save/attachment. Preserve raw retail format and opaque QR bytes; check exact ownership/collision/archived paths and stale resolutions. A read-only preparation exercise must leave DB rows/defaults unchanged, followed by the strict offline purchase smoke. Simulator camera limitations do not authorize claiming optical decoding; the user's approved actual Android virtual camera supplies that evidence, with physical calibration stated as a limit.

Select **one** automatic publication run or, when specifically required after it is terminal, the existing exact-SHA workflow on landed main:

```text
gh workflow run ios-simulator.yml --repo saudm6/grocery-tracking-app --ref main -f source_sha=<reviewed-integrated-full-SHA>
```

This is a future command only. Native-adapter/lifecycle changes and final #18 require exact-SHA installed checks even when path filters do not trigger. No automatic-plus-manual duplicate compile.

### 3. Complete #7's unknown-code purchase UI

Normal-merge actual landed #6 main into 35eadcc. The prepared core changes only `src/data/grocery.ts` and its tests: optional creation-only `NewProduct.code`, shared private `writeCode`, one exclusive transaction, existing-ID purchase inputs cannot implicitly attach a code. Eleven selected real SQLite checks passed, including five new core cases; this is not mounted scanner or native proof.

On the same monthly purchase/scan page, show captured exact code/format and manual product/brand/category/optional subcategory/store/OMR/whole-quantity fields. Create inline references, product, code, purchase and any current-price observation atomically through the existing boundary. Known lookup/explicit choice uses the exact owner. Keep code and paid draft across permission/read/save failures; intentional Retake/replacement invalidates stale lookup without clearing the independent submission guard.

Verify actual unknown retail and QR frames → manual details → failure/rollback → retained draft/corrected retry → subsequent known rescan. Preserve all eight tables and code bytes on collision/late failure, including archived ownership, NUL/BOM and canonical aliases. Current-month saves use the sole saved-price writer; old-month saves are spending-only with no defaults/history until explicit Apply. Verify dates, quantity/OMR validation, rapid taps commit once, a fresh form permits an intentional repeat, actual chosen-month list/paid identity and refreshed views. Source/core tests alone cannot close #7.

### 4. Complete #8's catalog scan/attachment flow

Normal-merge then-current actual main, including landed scanner and any shared #7 boundary work, into abbc. Preserve the prepared exact-selected-ID metadata refresh: focus/failed selection/save refresh current target, generation rejects stale reads, Save requires a ready read for that ID, Retry retains every field/code, archived details use push so Back retains the editor, explicit reactivation refreshes on return. The two affected SQLite checks passed; mounted React focus/Back/Retry remains unexecuted.

Reuse #6's actual chooser in the existing product editor. Known codes open the exact owner; unknown codes expose same-page manual catalog fields. Second-code attachment requires explicit existing-product selection, cannot steal active/archived ownership and must retain captured bytes/format. References/product/code/defaults/history save atomically, **without a purchase or monthly spending change**. Use the shared saved-price writer and pre-save exclusion; store-only changes create no price event.

Exercise real camera and typed identity agreement, unknown catalog creation, known owner, second code, archived target/reactivation/Back, focus refresh, pending/read-error Save blocking, retained draft retry, stale selection, collision/late rollback and duplicate-submit protection. Compare all existing purchases/totals byte-for-byte, native code bytes, FK/integrity and refreshed details. Complete source checks/affected exports, independent installed verification and current-head review before merge.

### 5. Finish #17's complete first-use/accessibility audit

Normal-merge actual landed #7/#8 and current main into d12. Its existing two-file core replaces Home's shortcut with house Action and requests generic native back labels. Ordinary Android tap/Back and a fully visible enabled/clickable/focusable **352.73 × 48dp** target are accepted. iOS generic Back and full assistive technology are not proved.

Audit fresh offline Catalog/Spending/Home/Inflation/reference empties, month choice, first product/purchase, camera denial/unreadable/collision, invalid OMR/quantity, database save and post-commit read recovery, optional dates and clear ordinary versus Apply/delete outcomes. No misleading zero trend, lost draft, duplicate row or mutation replay on read-only Retry. Review exposed raw database diagnostics in user-facing errors only after reproducing them on final source; preserve useful validation and recovery.

Use a small typical phone, largest supported font scale and visible keyboard; check unclipped labels/actions, both target dimensions, normal-text contrast 4.5:1 / large-text 3:1, non-color-only meaning, lower-field reach, route/dialog/error/commit focus and keyboard order. Earlier viewport-clipped Retry/Open rectangles do not earn full 48dp credit; scroll fully into view and observe actual activation before deciding whether a layout fix is needed.

Complete real TalkBack navigation, semantic Home-action activation, error/saved announcements and bound utterance completion/audio. Existing speech overlay shows requested speech-pipeline text, **not audible output**; a misleadingly named earlier Home-focus PNG actually focuses Spending total. The task-owned emulator's `-no-audio` launch prevented PCM capture. After resume, the native owner may configure/relaunch only that owned AVD for supported audio with data/settings/process restoration, select usable local voice data and capture/review actual speech. This is available tooling work, not a need for the user's phone. Record iOS VoiceOver separately and honestly. Full #17 requires final installed offline behavior, not just the narrow core.

### 6. Finish #18 on the latest complete app and test its README

After #6/#7/#8/#17 actually land, freeze the final source and install appropriate **latest embedded Android and iOS builds**. Reuse unchanged per-slice rule checks by exact input, while executing decisive integrated workflows on both platforms. Keep Expo Go, Metro-backed debug, host SQLite, JS exports, unsigned Simulator app and standalone offline evidence separately labelled.

Final domain checklist:

- [ ] Exact baisa arithmetic, integer/safe-range/zero-price validation; atomic refs/product/code/purchase saves, late rollback/retry and duplicate admission/fresh intentional repeat.
- [ ] Known/unknown retail and opaque/numeric/URL/NUL/BOM QR; canonical uniqueness, archived ownership, explicit second-code attachment, permission denial, unreadable frame, stale/duplicate callbacks and manual fallback.
- [ ] Existing DB upgrade preserves rows; failed upgrade/read/save recovery never resets data. Restart without Metro/external connectivity retains literal records, schema, FK/integrity and no fault objects.
- [ ] Paid snapshots survive saved-default edits. One saved-price writer; source/store/date provenance, same-price/store-only rules and pre-save exclusion remain correct.
- [ ] Dated and month-only old receipts remain spending-only until Apply. Repeated Apply is idempotent; exclusion/reinclusion retains history; ordinary correction/deletion versus explicit Apply synchronization/removal is clear. Earlier insertion changes baseline/next delta without changing today's defaults.
- [ ] Inflation predecessor-before-filter, decreases/zero references/excluded gaps/end-period price; current provider/primary-brand versus exact scanned owner; subcategory moves reclassify historical Home/Spending/Inflation without altering totals, IDs or paid data.
- [ ] Complete #17 keyboard/font/contrast/focus/actual assistive-tech and error-recovery observations at final source, with honest platform limits.
- [ ] Actual source/tool/native locks, app/bundle/executable hashes, installed identity, UI command/hierarchy/frame, native SQLite and all offline/restore/cleanup facts bind each claim. No screenshot-only save or restoration pass; literal emitted evidence is distinguished from sequential source inference. Cache HIT/SAVE is reported only when actual logs prove it.

Update README's outdated “first slice / future screens” wording and document the real completed actions, local-only data-loss/uninstall limitation and lack of backup/cloud sync. Test the instructions from the delivered exact-source builds:

- Development/static baseline: `npm ci`, `npm run typecheck`, `npm run lint`, `npm test`, `npm start`. Local heavy exports run **serially** as `npx expo export --platform android --output-dir dist/android --no-bytecode --max-workers 2`, then the equivalent `--platform ios --output-dir dist/ios`. `npm run bundle`/exports produce JS, not an installable APK or `.app`.
- Android guide must name the actual tested prebuild/Gradle controller, caps, signing/ABI, APK output/hash and install/relaunch commands. Prior #1 proved `npx expo prebuild --platform android --no-install`, a bounded `assembleRelease -PreactNativeArchitectures=x86_64 --no-daemon --max-workers=1` controller and `adb -s emulator-5580 install --no-streaming <APK>`; its APK was at `E:/gv01/android/app/build/outputs/apk/release/app-release.apk`. That old artifact proves #1 only. Reproduce/document the final locked build and supported task-owned SDK/JDK/Ninja/embedding caps; do not present an uncapped bare command or the Metro debug host as final offline delivery.
- iOS guide must show the exact-SHA workflow command, actual successful run/artifact name, `gh run download <run-id> --repo saudm6/grocery-tracking-app --name ios-simulator-<source-sha> --dir <owned-output>`, safe `app.tar.gz` extraction, actual `.app` path, then `xcrun simctl install <booted-udid> <actual-app-path>` and `xcrun simctl launch <udid> com.saudm6.grocerytracker`. Validate these steps on the available macOS Simulator and bind Podfile.lock/bundle/app hashes. The current failed run has no downloadable app; placeholders are a guide requirement, not executed final commands. Unsigned Simulator support is distinct from a physical-device signed IPA.

No app-store publication, cloud account/service, paid runner, larger runner or Apple developer login is required. The final outcome is a testable local first version, with independent exact-head acceptance before closure.

## Resources, evidence and resume checklist

Available resources are the provisioned task-owned Android 15/API35 x86_64 AVD, SDK/JDK/Gradle/native tools, short build checkout `E:/gv01`, existing exact-source runtime/DB receipts and standard free public GitHub macOS runner. No phone is connected; standing preference 17 explicitly approved actual emulator camera/runtime workflows instead of requesting hardware. Preserve the distinction from physical optical calibration and iOS hardware camera support.

This Windows host has 16 GiB RAM: one heavy export/native compile lane, capped workers, no unrelated process kills, database resets or other-worktree edits. Before future use, inspect current ownership/identity rather than assuming an old PID is live. Hosted iOS is separate, with one observer and bounded waits; no duplicate automatic/manual attempt or cancellation solely because observation is slow. Disposable hosted network denial must preserve loopback, a timed guard and proven restoration before uploads/job control; do not change local Windows networking or persistent repository/account settings.

Read the retained store's `preferences.md` (1–23), issue briefs, `issue18-final-acceptance-checklist.md` and `issue18-camera-ios-dispatch-plan.md`. Their earlier head/run snapshots are historical; **use e92's 600/630/635 bounds**, not the camera plan's old 120/150/155. Preserve all existing receipts/indexes and human work. Apply meaningful affected checks and reuse unchanged accepted exports/source evidence rather than repeating it for ceremony. Each issue needs a writer in its isolated branch, independent current-head source/native verdict, exact provenance/limits and coordinator-controlled merge; a green CI or old runtime alone is insufficient.

- [ ] Wait for an explicit user resume. No implementation/retry/dispatch/publication is authorized by this document.
- [ ] On resume, re-read all three handoff documents and verify actual main, PR21/PR28 heads, candidate cleanliness, runtime ownership and remaining issue state.
- [ ] **First concrete next action:** independently review already collected e92 boot/final-connectivity evidence and exact source order; finish its failure classification before proposing the smallest evidence-supported runtime action. Do not blindly rerun, weaken gates or treat old successful build/UI fragments as a current pass.
- [ ] Then follow PR21 → #6 → #7 → #8 → #17 → #18, integrating only actual landed main and preserving each prepared core.
- [ ] Close/merge only after the independently reviewed actual required evidence; PR21 never closes final #18.

Only this handoff document was authored in this pass. No app/test/config edits, git publication, build, rerun, dispatch, replacement watcher or runtime mutation occurred.
