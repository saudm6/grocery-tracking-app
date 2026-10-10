# Completed work and design decisions

This is the durable design and completed-work handoff for the paused grocery tracker project, audited on 2026-10-10. It records completed slices and the limits of their evidence. After the requested documentation push, stop and wait for the user's explicit resume. This handoff does not authorize restarting implementation or merging a pending branch.

Read [CURRENT_STATUS.md](CURRENT_STATUS.md) for the live frontier, worktrees, processes and ownership. Read [REMAINING_WORK.md](REMAINING_WORK.md) for the unfinished acceptance criteria and restart sequence.

The repository was at main `1e551d2dc678bd1fa3c900d04cb2b3007e142608`, tree `2c4c9e95edbfef476f738988bf9dc19e431d3335`, before the requested handoff files. Thirteen of eighteen numbered issues are merged. Issues 6, 7, 8, 17 and 18 remain open. The separate iOS prerequisite PR 21 remains open and is not completion of issue 18.

The [implementation backlog](../implementation-backlog.md) and [original design](../superpowers/specs/2026-10-09-grocery-tracker-design.md) still define scope. Their historical status prose is stale. In particular, the design says no implementation has started, and README contains wording about future functionality that is now on main. Actual source, merged PR state and exact-head verification receipts take precedence over that status prose. Do not mistake prospective design notes for executed verification.

## Landed work

The table was checked against GitHub PR state. Each source head below was independently reviewed before a guarded squash merge. A merge commit is the resulting main commit, not the reviewed branch head.

| Issue | Delivered behavior and accepted evidence | PR | Reviewed source head | Resulting main commit |
| --- | --- | --- | --- | --- |
| 1 | Manual offline purchase in a chosen month, inline references, exact money, atomic save, retry and duplicate-submit protection. Actual first-slice standalone Android offline startup/restart was verified at this head. See [issue01-verification.md][e01]. | [19](https://github.com/saudm6/grocery-tracking-app/pull/19) | `9280208065e2c219b54821ce7acbf6998ad71597` | `2f6811d07f2789eddce168a86b10fbbf6dcf6be7` |
| 2 | Dedicated Brands and Stores pages, explicit saved-ID versus new-name choices, stable-ID rename, retained failed drafts and refreshed reads. See [issue02-verification.md][e02]. | [20](https://github.com/saudm6/grocery-tracking-app/pull/20) | `631916113f1dc0378c7796cd4451029f025d1cdc` | `82511f48ca2d78bfd247925c187c9243c2b039ae` |
| 3 | Catalog product create/edit without spending, optional price/store, shared price history, typed UPC/EAN/QR identity, archive/reactivation and version 2 code migration. See [issue03-verification.md][e03]. | [22](https://github.com/saudm6/grocery-tracking-app/pull/22) | `7cb7107fa3126a7e07ff56035b7160796cafcfbb` | `1dd3fc8e9fa02678e482acb7bcf8b0a5d18bf177` |
| 4 | Category/subcategory management, nested inline grouping, linked products and recorded spending with stable grouping IDs. See [issue04-verification.md][e04]. | [23](https://github.com/saudm6/grocery-tracking-app/pull/23) | `30ddc0e1c92fb65ccaf3a3d2ceb2370537bd30e8` | `0eeb72fa55a649d4a77683303b9d7a8997a5eae9` |
| 5 | Manual known-product selection and intentional repeat purchases, explicit identity, default initialization and preserved paid history. See [issue05-verification.md][e05]. | [24](https://github.com/saudm6/grocery-tracking-app/pull/24) | `555ac6c2a866660de30de2d6657bce60e0986314` | `f0f7326ef1f790945c454a308de7a25c07d4ce1c` |
| 9 | Purchase correction, month/product/group/store changes and confirmed deletion, with ordinary spending edits separate from saved defaults/history. See [issue09-verification.md][e09]. | [25](https://github.com/saudm6/grocery-tracking-app/pull/25) | `ec76c17b9e56fe2affe565a370d88150de3fa39e` | `df5b59200d8bad66d4dee2fc57a8ac49241056ff` |
| 10 | Pre-save inclusion choice for eligible changed current prices; current-month purchase price changes use the existing shared writer. Older purchases remain spending-only. See [issue10-verification.md][e10]. | [26](https://github.com/saudm6/grocery-tracking-app/pull/26) | `0c33ba46b60e1216145ca895c1646a60d1e16861` | `165968369d225cebff587ff5e4e07ddd47663d6b` |
| 11 | Product details distinguish actual paid entries from saved defaults and full history. Saved-price first/last labels use saved-price events, not receipt insertion order. See [issue11-verification.md][e11]. | [29](https://github.com/saudm6/grocery-tracking-app/pull/29) | `8eb7fd9a40ae3fe1173e8c2911c6354ac82df11f` | `11bb8a7f68e3250c2aad854a1b520c375f0e543a` |
| 12 | Explicit receipt Apply, idempotent linked history, reversible non-baseline inclusion, explicit combined correction/removal and ordinary deletion preservation. Source and actual native mutation/recovery evidence were accepted. See [issue12-root-native-review.md][e12]. | [31](https://github.com/saudm6/grocery-tracking-app/pull/31) | `f4301a7d18d0fd232b07078703d1a5a39ab0c71c` | `3d775fd1cdbc7b4ba65f6e610992c3850e32ab5f` |
| 13 | Inflation category/month filtering, signed counted changes, excluded actual predecessors, historical period-end price, zero-reference percentage handling and chart gaps. Final actual 22-stage native review was accepted. See [issue13-root-native-review.md][e13]. | [32](https://github.com/saudm6/grocery-tracking-app/pull/32) | `0e5acc7c6a717f1f21b2362ebd2915b5b16289a6` | `917a77e69c131c84bc2af6bfae8f7264c12dd9eb` |
| 14 | Eligible active primary brand per subcategory, scoped manual ordering and same-transaction cleanup of invalid membership. Exact code lookup still selects its owner. See [issue14-verification.md][e14]. | [27](https://github.com/saudm6/grocery-tracking-app/pull/27) | `b68895830346bc75d1825910df1b651f7d003f28` | `e9e1de2cc8b953f44db1af671969943be47e3f42` |
| 15 | Home selected-month paid totals, previous-month comparison and category/subcategory/store breakdowns, refreshed after purchase changes. Final actual native preservation/recovery review was accepted. See [issue15-root-native-review.md][e15]. | [30](https://github.com/saudm6/grocery-tracking-app/pull/30) | `138919d8a69dacb7ee630c81efa31d97ff7f6fdd` | `a74046c3b9c7af13c39f25902682d104bb1035b9` |
| 16 | Same-ID subcategory move and historical report reclassification through its current parent, without recreating linked products or rewriting paid records. Final 29-stage actual native review was accepted. See [issue16-root-native-review.md][e16]. | [33](https://github.com/saudm6/grocery-tracking-app/pull/33) | `5816840925bebab38866e6e3e94c73a8c3766b5b` | `1e551d2dc678bd1fa3c900d04cb2b3007e142608` |

The native reports are generally PASS+NOTES for their exact feature allocation. Early stable slices used actual Expo Go and Metro. Later slices used a compatible installed debug host with exact committed JavaScript bound through source maps. Those are real native executions, but they do not turn an old APK into a new embedded release artifact. Only issue 1's recorded standalone offline result applies to its issue 1 build. Main16 still lacks the final latest-app standalone Android and installed iOS audit required by issue 18. Spoken screen-reader, physical-camera and final accessibility claims are also separate.

The program resolved issues in dependency order, not numerical order. For example, primary brand 14 landed before 11, and Home 15 before Inflation 13 and reparenting 16. This explains the main commit sequence without implying unfinished camera issues are already integrated.

## Implemented work that is not landed

| Slice | Exact accepted candidate | What exists | What the acceptance does not prove |
| --- | --- | --- | --- |
| Camera 6, [PR 28](https://github.com/saudm6/grocery-tracking-app/pull/28) | `3cd92547d9c91de006f6b6837dae505e08b444e9`, tree `540f2fd18089418abb999004df8e7bb164824ef9` | Known-product camera/typed purchase selection, source checks and both exports, current 70-test CI, accepted Android optical/lifecycle/atomic-save evidence. | Installed camera-compatible iOS, a current-source embedded offline APK, full feature merge or physical-phone calibration. |
| Unknown-code7 core | `35eadcc60f34deb7dda5564e979ae92fbd787c66`, tree `7fa30ca57f4f13793ed798f65a3b1bc1a6e14e65`; sole main 16 parent | Creation-only optional CodeInput and one private code writer reused by catalog and new-product purchase in one exclusive transaction. Eleven meaningful host SQLite tests and source/light review accepted. | Scanner UI handoff, exact integrated exports/CI, installed unknown-code workflows or issue 7 completion. |
| Catalog-code8 core | `abbc03eca0c029078c14fb25197c00ef8a722e62`, tree `3e79df68fa79318f097a2a2b1e4e31f49ec42f63`; normal child of `3ccb41604db3bb7bd3565cbba6e8028ac3171d55`, based on main 16 | Explicit saved-ID attachment in mounted ProductEditor; exact selected-target metadata freshness correction. Six initial host checks and two affected correction checks accepted at their respective heads. | Shared camera integration, React focus/Back/error behavior on an installed runtime, complete issue 8 or publication. |
| Accessibility 17 core | `d12bf8ef1050d0ee0eb43df742e343fd84335bb9`, tree `cc45152b9ed426701e30c4612daf548baf8949af`; sole main 16 parent | Home uses the house Action and a supported generic native Back-label option. Source/light review and narrow actual Android Home target/action/Back evidence accepted. | Spoken Home activation/utterance, iOS Back behavior, full small-screen/large-font/contrast/keyboard/error audit or issue 17 completion. |
| iOS prerequisite, [PR 21](https://github.com/saudm6/grocery-tracking-app/pull/21) | Published `e92b9a7fccb79723cea58ba96a11df9ed09fb0d2`, tree `292f19f73a6d45edeb3ca225e09ef0cdc0277258` | Hosted native harness, exact-source workflow, bounded command/cleanup/network proof, source and CI acceptance. | Native PASS, readiness to merge or completion of final issue 18. Latest hosted native run failed. |

These independent cores were released from actual main 16 while hosted iOS work continued. No core branched from an open camera or harness PR. Final 7/8 completion must integrate the actual landed camera main. Final 17 must audit the actual integrated7/8 app. Releasing a bounded core for useful independent progress did not waive its eventual dependency or native evidence.

### Camera 6 evidence and its boundaries

Current camera implementation lives in `E:/Projects/grocery-tracking-worktrees/issue06/src/components/product-chooser.tsx`. There is no committed `code-identifier.tsx` in that candidate. Notes mentioning a shared CodeIdentifier describe the intended reusable capture/lookup integration for 7/8; do not import a nonexistent component or independently duplicate its scanner.

The implementation models Capture with a generation and idle/requesting/preview/captured/error state. CameraView admission checks current generation, preview session, mounted state, focused route, foreground AppState, visibility and disabled status. Only the appropriate active view mounts a preview. One admitted callback retains raw decoded CodeInput. Explicit Retake/replacement starts a new generation and obsolete lookup results cannot retarget the form. Camera capture and createSubmission guard different events. Retake must not reset an already completed save guard.

Known codes resolve exact local IDs regardless of primary-brand preference. Permission denial and unreadable labels leave product search and typed entry available. A lookup/capture alone creates no code, product or purchase. Selection and final Save remain explicit.

[The current Android root review][e06] accepted 21/21 real imagefile-to-native-camera cases and 17 literal mutation stages. The camera service decoded rendered virtual-camera frames; no fabricated JavaScript callback counted as optics. Recorded outcomes included UPC-A, UPC-E with expansion, EAN-8, a distinct EAN-13, exact opaque/numeric/URL/Unicode/NUL/BOM QR, accepted 4000/4096 bytes and rejected 4097 bytes. An optical leading-zero EAN label was actually reported as UPC-A, so it did not earn EAN-13 format credit. Distinct `6291041500213` supplied that credit. The first 4096 fixture miss received no pass; one authorized same-payload pitch adjustment later yielded actual decoder proof.

The installed Android host was APK SHA256 `96A4F61CA560485BF58F26E6A408C1C3E98A9740A8A11FED468CBD8C89841E18`, built from an earlier 9ab source with compatible locked native inputs. Twenty-two current committed production source-map bindings and actual actions established3cd JavaScript execution. It required Metro. This is neither a 3cd-embedded APK nor iOS proof.

Actual permission/lifecycle/read-error/late-abort/rapid-save/archive checks preserved the original database rows and exact code bytes. A delayed lookup was observed and held manual fields remained intact, but the cancelled promise's completion was not instrumented. The review does not claim that unobserved completion. Initial postboot ANR cause remained unknown; an unchanged settled cold launch succeeded, so no speculative app fix was made. Clipped Retry/Open screenshots were forwarded to 17 without claiming full 48dp visibility. Physical-phone optics, spoken accessibility and external-keyboard checks remain unproved.

### Unknown-code7 transaction choice

The accepted core extends only the new-product creation variant with optional code. Existing-ID purchase input rejects code both in its type and runtime validation. This is the actual accepted refinement, superseding older prospective text that proposed purchase-level attachment to an existing ID.

Private writeCode extracts existing catalog owner validation and byte-safe insertion. Normalization happens before the transaction. The code is inserted inside the same exclusive transaction as references, product, Paid and eligible Saved history. There is no new public coordinator, transaction handle, schema or purchase writer. Archived/canonical collisions reject the whole operation.

The [root core review][e07] accepted tests for literal3-baisa current creation, older-month no defaults/history, retail aliases, exact BOM/NUL hex, active/archived collision rollback, late corruption rollback, retained-draft rapid retry once,4096-byte validation, overflow, reopening, integrity and foreign keys. These are actual file-backed host SQLite tests, not installed unknown-camera workflows.

### Catalog-code8 selection and metadata correction

The existing saveProduct already owns atomic catalog reference/product/code/default/history writes and does not create Paid. The smallest independent UI addition reused ProductRow and listProducts inside the mounted ProductEditor. Reusing ProductChooser wholesale at this stage would introduce another typed-code form and purchase-month navigation semantics. A separate route would require serializing raw code and drafts across a remount. Neither earned its extra state.

Explicit selection uses a stable displayed ID and fresh ProductDetails. It intentionally initializes the selected product's name, brand, grouping, price and store, which the UI explains beforehand. Raw code and format stay in the existing mounted form. Search/name equality never silently chooses an owner. The existing edit route stays bound to its own ID, and archived results require explicit details/reactivation.

Root review caught that a creation-route selected ProductDetails snapshot was not refreshed by the outer references-only read. Normal child abbc corrected this with exact-ID, generation-guarded TargetRead. Focus and failed selection/save refetch that same admitted ID without resetting fields, code, format or selection. Save stays disabled until a successful ready read matches the current ID. Read failure exposes Retry, and current archived metadata exposes a details push so Back can return to the retained editor. Only explicit choice initializes fields.

[The corrected root review][e08] binds ten immutable source/evidence copies and records actual two-test SQLite success. The affected test reads changed archived/default/exclusion metadata, forces a genuine unavailable-column read error, restores it and retries the same ID while retaining the draft. Host checks also protect both codes, store-only history behavior, all-eight-table rollback, unchanged September 4000/October 3 and reopen integrity. They do not execute React focus/navigation; installed focus/Back/read-error/Save-blocking remains required.

### Accessibility 17 narrow correction

Home's standalone Link was focusable but not clickable in the observed Android native vector. The core replaces it with the existing house Action and router navigation. Generic native Back labeling uses a supported platform option to address the technical `(tabs)` title seen in an iOS artifact. No custom header/control or dependency was added.

[The narrow Android root review][e17native] accepted the fully visible Home target at 352.73×48dp, enabled/clickable/focusable, physical transition to Spending, and Android Back to Home. Compatible installed-host provenance and 127 artifact/protected-file bindings were checked. The original 6 native and Go databases/settings were preserved and current 6 runtime source was restored.

TalkBack remains partial. A diagnostic focus/overlay and requested speech text are not completed Home utterance or audible PCM. The image whose name implied Home action focus actually showed Spending total. Emulator no-audio and unsuccessful bounded audio observation are tooling limits, not proven product defects or a need for a connected user phone. Do not resize a nominal 48dp house action merely because a screenshot clips part of it. Final 17 needs actual reachability, full target bounds and the complete accessibility matrix.

## Domain rules the next implementation must preserve

### Money, quantities and calendar

Amounts are nonnegative integer baisa. One OMR is 1000 baisa. Inputs permit at most three decimal places, including zero, and formatted values retain three places. Whole-item quantities are positive safe integers. Weights, fractions, other currencies and scientific-notation inputs are outside the first version.

Amounts, quantity products, month totals and report aggregates must remain within JavaScript's safe integer range, ending at `9007199254740991`. The boundary uses BigInt for exact intermediate arithmetic and rejects unsafe results rather than allowing rounding. SQL constraints independently protect stored integer values and line-total multiplication. Money is never stored as binary floating-point OMR.

Month is validated `YYYY-MM` with years 0001-9999. Optional date is a real calendar `YYYY-MM-DD` within that month, including correct leap-year rules. Current-month eligibility is evaluated against the device's local calendar at commit. Do not use UTC month, form-opening time or a test fixture's historical date as the production clock. Recorded timestamp remains separate from effective date/month; later timezone changes must not rewrite recorded effective periods.

See `src/data/grocery.ts` parsing/calendar helpers and `src/data/schema.ts` constraints on actual main.

### SQLite ownership and recovery

There is one local SQLite database and one grocery boundary. Screens call operations; they do not assemble SQL, pre-save references or coordinate multiple writes for one logical Save. Executor/Database adapters keep transaction-owned operations on the native exclusive transaction object. SQL values are bound parameters.

Schema version 2 has exactly eight domain tables: brands, categories, subcategories, stores, products, product_codes, purchases and price_history. Product and purchase grouping is exactly one direct category or subcategory. Stable foreign keys, code uniqueness, safe integers and nullable unique source-purchase linkage are database constraints, not UI assumptions.

Expo's exclusive transaction begins on a fresh connection. Changing SQLite foreign_keys inside that already-started transaction has no effect. The existing boundary deliberately restarts the still-untouched transaction with `COMMIT; PRAGMA foreign_keys = ON; BEGIN IMMEDIATE;` and asserts the pragma before app writes. Preserve this setup. If failure occurs in the no-write gap, Expo's later rollback can report no active transaction, but existing data must remain unchanged and retryable. Do not remove it as an incidental workaround without equivalent actual native proof.

Initialization waits for versioned transactional migrations. A too-new database rejects startup. Upgrade failure exposes Retry and preserves all existing records, IDs, code bytes and version. Version2 rebuilds product_codes with byte-length constraints so NUL-leading content is valid and IDs/owners survive. Never reset, delete, silently recreate or downgrade the user's database to recover from initialization/migration failure.

Tests and native fault fixtures deliberately abort late writes after tentative cross-table changes. A meaningful rollback assertion compares complete rows across all eight tables plus code hex, not just counts. Task-owned fixtures must be removed and schema/index/FK/integrity restored after checks. User data is never reset.

### Recorded Paid and current Saved are different facts

Paid stores the chosen month/date, exact product ID, brand at purchase time, store, recorded direct category or subcategory, whole quantity and unit price. Catalog edits, new defaults and price observations do not rewrite those recorded fields. Explicit purchase correction/deletion can intentionally change spending.

This is an ID-backed snapshot, not a copy of every display name. Product/store/reference renames remain visible through their stable IDs. A deliberate subcategory move changes current report classification. Neither exception permits silently replacing an older paid amount/brand/store with current defaults.

The sole private writeSavedPrice serves catalog price edits and current-month purchase saves. It compares against Product.saved_price, never the newest inserted mixed-history observation. A first/changed price updates saved price/store and appends one saved_price event atomically. An unchanged price creates no event. A catalog store-only change updates only the default store and does not rewrite the earlier observation's store. A purchase at a different store but unchanged price affects that Paid row only.

Older purchases are spending-only by default. A new product from an older receipt has null current price/store and no saved_price event until a later eligible current purchase or catalog edit sets them. Applying its historical receipt still does not set today's defaults.

Purchase-created saved_price events keep sourcePurchaseId. The same nullable unique key covers both saved_price and receipt sources, preventing a receipt that once created current history from being applied again after it ages. Ordinary deletion uses `ON DELETE SET NULL` to preserve both kinds of history while detaching the deleted Paid link. Do not cascade history away.

### History order, baseline and classification

Order the full product history by effective month, dated observations before month-only observations in that month, actual date, then stable observation ID. Missing dates remain month-only. Do not invent a day for display or use insertion order as historical order.

Baseline is the earliest observation in that order, derived at read time. It contributes zero counted increase and has no active classification control. Its stored inclusion flag remains intact. Inserting an earlier receipt can expose the old baseline's retained flag and recompute later deltas without resetting any classification.

For a new saved price, pre-save Not inflation is available only if an actual chronological predecessor exists at that local effective date. An earlier month qualifies; in the same month a dated observation on or before that day qualifies. A later day or same-month undated receipt does not. Do not substitute nonempty history or latest inserted row for this rule.

Every non-baseline price delta uses the immediately preceding actual price before inclusion/month filtering. Excluded observations contribute zero but stay in full history and remain future reference prices. For20→22 excluded, then 22→23 included, the counted increase is 1 OMR and that included step's reference is 22, not 20.

Saved first-set/last-changed labels use saved_price events in save order, including excluded ones. Receipt effective order and late insertion cannot replace today's saved defaults or those labels. Full history displays effective period, recording time, source, observed store and classification distinctly.

### Explicit receipt Apply and ordinary correction

Apply inflation is an explicit user action. It creates or updates one receipt-sourced observation from that purchase's product, unit price, store and month/date. Unchanged reapply makes no duplicate. Existing receipt observation ID, recording time and classification are preserved across its synchronization. Today's Saved price/store are untouched.

Ordinary correction/deletion remains spending-only. Explicit combined Apply correction synchronizes the receipt observation in the same transaction as Paid changes. Explicit combined removal deletes the receipt observation and purchase together after confirmation. The operation cannot mutate/remove a saved_price-sourced observation as though it were a receipt. A previously current saved-price event stays anchored to its original product/history even if its Paid source is later moved or deleted.

Keep nullable source linkage, baseline recalculation and failed-write retention distinct. A successful commit followed by a failed read needs read Retry, not a repeated write or another observation.

### Inflation and spending projections

Inflation filters by current product category and an inclusive month range. It calculates predecessors over complete history first, then sums included non-baseline signed changes in range. Included decreases reduce the net. Only positive-net products are ranked, by counted OMR increase. Zero or negative net is not a price-increase result.

Percentage uses the actual predecessor of the first included non-baseline observation in the selected range. A zero reference has an unavailable percentage rather than division by zero. Price at period end is the latest actual effective observation on/before the end month, including excluded values. It can differ from today's default and the last visible included chart point.

The chart omits excluded observations and shows gaps across them. A baseline appears if it falls in range. Do not invent an outside-range anchor, exact date for a month-only point, or point where no observation exists. Full details retain excluded/decreasing observations for explanation.

Home and Spending query the same Paid records; no second persisted total exists. Home computes selected-month total/count, previous-month total/difference/percentage and category/subcategory/store groups. January crosses the year boundary correctly. January 0001 has no previous valid month; zero previous total has no percentage. Mutation/focus refresh changes displayed results after commit.

Purchases preserve a direct recorded category or recorded child ID. Child-linked reports resolve the child's current parent, so moving the same child reclassifies past spending without updating the Paid rows. A product's current direct category does not replace a purchase's recorded direct category. Inflation uses the product's current grouping, which is another deliberate distinction.

### Stable references, grouping and primary brand

Reference inputs select an existing ID or carry a new-name draft. Names are trimmed, NFKC-normalized and compared using the shared en-US lowercase key. Brand/store/category duplicates reject rather than silently choosing a matching name. Subcategory names are unique within their parent. Human names reject NUL; exact opaque QR follows a different rule.

New nested parent/subcategory/brand/store records resolve inside the same save transaction. No screen pre-saves a reference to make its product save work. Rename/move preserves stable IDs. Failed duplicate/stale/lock saves retain attempted fields and refresh available choices.

Primary brand is a current preference per child, not a historical snapshot. It must have at least one active product in that child. Scoped manual choices put those products first but still require an exact product choice. Code lookup is unaffected. Archiving or changing the last eligible member clears the preference in the same transaction. Parent-only reclassification does not recreate child membership or its valid primary preference.

### Code identity and byte fidelity

CodeInput carries an explicit format and raw value. Typed ambiguous eight-digit codes choose UPC-E or EAN-8; the boundary does not guess. UPC-A, UPC-E, EAN-8 and EAN-13 require exact digits/length/check digit. UPC-E expands before canonical comparison. Equivalent representations share one retail namespace and a padded 14-digit key, while preserving the original value and format.

QR uses a separate namespace, even when numeric. Its value is opaque text; URLs are not opened. Case, whitespace, Unicode, BOM and embedded/leading NUL are identity. Well-formed Unicode must encode to 1-4096 UTF-8 bytes. Reject unpaired surrogates and 4097 bytes. Do not trim, normalize, uppercase or strip BOM from QR.

Ordinary native SQLite TEXT binding/reading can truncate NUL through C-string termination. The accepted boundary binds UTF-8 byte arrays with `CAST(? AS TEXT)` and reads original/key as BLOB with fatal UTF-8 decode and BOM retention. Preserve this at every code writer/reader. Comparing JavaScript strings while silently truncating stored bytes is insufficient.

A namespace/key belongs to one product, including archived products. A product can own several codes. Same-owner canonical aliases are no-ops and preserve the first stored original/format. Another-owner collision rolls back references/product/default/history together. Archiving does not release ownership; reactivation keeps the same ID. Second-code attachment requires explicit existing-product selection, not a duplicate name or implicit lookup-to-write handoff.

### Form state, submission and house UI

The shared createSubmission owns pending and completed state per form. Suppressed taps cannot clear the admitted operation's pending indicator. A failed save leaves the guard retryable. A successful save suppresses replay. A fresh intentional form supplies a fresh guard and can record another purchase.

Read refresh/error recovery is separate from mutation submission. Read IDs/focus generations ignore stale completion. Errors keep entered fields, selected IDs and captured raw code. Refresh choices without remounting a keyed draft. After committed writes, refresh affected visible queries; read Retry must not execute Save again.

Reuse Field, Action, ErrorMessage, ReferenceField, GroupingField, ProductRow, ProductChooser and existing chart/history cards. Field labels and minimum 48dp house controls, alert/error semantics and native keyboard/Back behavior are baseline requirements. Prefer the existing Action over a custom control. Native XML is evidence of exposed semantics/bounds, not proof of audible TalkBack/VoiceOver utterance or keyboard navigation.

## iOS prerequisite decisions and lessons

PR 21 adds six files relative to main 16: `.github/workflows/ios-simulator.yml`, README, app.json, `scripts/verify-ios-simulator.sh`, `tests/native/assert-ios-db.mjs` and `tests/native/ios-smoke.yaml`. It adds the bundle identifier and a hosted manual-purchase offline proof, not the final latest-feature18 audit. Its body must not close18.

The authorized runner is standard free `macos-26-intel` on the public repository. No paid/larger runner, Apple login, app-store publication or persistent account/repository changes were granted. Disposable owned-runner network denial is allowed. Local Windows networking is not.

The workflow binds source SHA and native configuration, builds a fresh unsigned Simulator Release app, distinguishes compiler results from installed app/JavaScript artifacts, and uses actual UI plus copied native SQLite for proof. Exact-SHA workflow dispatch is needed when path filters would not automatically exercise the required native adapter/lifecycle change. One automatic run or one manual run is owned and observed; do not create both for the same intended verification.

The harness proves online reachability before denial, preserves identity-checked loopback for local driver/UI access, withdraws external connectivity, probes actual denial through the flow, restores connectivity and proves restoration. A timed guard prevents unbounded denial. Cleanup and safe artifact/cache upload are conditional on restoration and owned process cleanup, not just a finally block running. Resolver denial, loopback identity, stale process-group protection and signal handling have actual helper checks. An unknown cleanup or restoration result fails closed.

The accepted e92 revision supersedes the earlier 120/150/155-second provisional window and the stale camera-iOS planning receipt that still quotes it. Current bounds are offline whole-command 600 seconds, restoration guard validation/invocation 630 seconds and restoration wait 635 seconds. `600 < 630 < 635` gives nominal 30-second and 5-second margins, not a guaranteed worst-case probe envelope. Driver startup remains 120000ms. The original single online warmup placement is restored. Native build/job bounds and the 56-command manual flow were otherwise preserved. See [the budget source review][e92source].

This budget change followed actual c0b2 evidence. Fresh driver startup consumed about92 seconds of the120-second whole flow, leaving only nine completed records before deadline124, without a failed UI assertion. A proposed warmup move was held, then reversed because the successful wrapper intentionally cleans its host process group; moving it could not promise driver reuse. Do not describe the source experiment as an established startup fix or guarantee of native PASS.

Other recorded lessons must remain distinct from app defects.

- Native tab accessibility labels did not match early fixture selectors. Fixes used actual hierarchy labels. The later plain Home assertion was ambiguous because actual hierarchy had two Home headers and one selected native Home-tab. The screenshot showed loaded Home; it did not prove a missing screen.
- A repeated hideKeyboard step failed when the earlier step had already hidden the keyboard. The smallest fixture correction used the actual static Category target and asserted keyboard absence. This did not justify changing form behavior or removing save/database proof.
- One loopback signal self-test targeted child Bash rather than the wrapper being tested. Later source targets the owned wrapper after actual readiness and records delivery. Hosted production INT130, TERM143 and deadline124 proof remain distinct from Windows cases explicitly skipped/unproved for POSIX signals.
- External probe timeouts and UI/ADB transport misses received no pass credit and no speculative grocery data/control redesign. Compiler cache restoration/save is a compiler artifact fact, not a speedup, installed app identity or native workflow PASS.

Latest native e92 [run 38068494331](https://github.com/saudm6/grocery-tracking-app/actions/runs/38068494331), job 114260912971, completed failure. The successful preboot xcodebuild call was only `xcodebuild -list -json` scheme enumeration. Simulator boot then reached its 600-second deadline with exit 124 and last output Waiting on System App. The actual Release build, driver warmup, loopback service, installation and UI were not reached. OfflineStarted is 0; no external network withdrawal occurred. The cleanup receipt has restoration unproved, safeToUpload false and zero artifacts; the cleanup-screenshot xcrun also reached a 90-second deadline. This is not a failed app assertion or evidence that the revised 600-second offline flow was exercised. There is no e92 Release-build or installed-app success claim. Root's read of the raw terminal failure is a failure observation; the checkpoint still labels detailed native verdict UNASSESSED. Diagnosis and next changes remain stopped work, covered in REMAINING_WORK.

Both current e92 source CI runs passed types, lint,68 tests and Android/iOS exports at the reviewed tree. Source success does not override this native failure. Previous partial iOS build/launch/restoration observations remain tied to their own older failed heads, not latest main and not a prerequisite merge PASS.

## Orchestration and verification policy

The user authorized completing all 18 issues and automatic main merges, then explicitly paused implementation and requested these handoffs. Pause takes precedence. Do not restart builds, coding, runtime actions, publication or merges until instructed to resume.

The coordinator writes briefs/bookkeeping and reviews; agents implement and fix source/conflicts. The user accepted available Codex subagents, one to three per issue, because no Augment CLI/connector was available. Do not claim Aug agents ran. One writer owns an isolated branch/worktree; an independent verifier reviews the current head and decisive native behavior before merge. No nested fan-out was authorized for the bounded core tasks.

Follow Poteto Mode and Ponytail full. Compare concrete designs before nontrivial changes, name the data shape, reuse the grocery boundary and house controls, keep scope complete and small, and record actual evidence/limits. Skill instructions do not replace explicit session authorization or the user's pause. No force-push, deploy, store publication, user-data deletion/reset or unrelated project/process mutation is authorized by this program.

Branches start from actual merged main. Ordinary integration uses the actual landed dependency, not an open PR parent, force/rebase workaround or copied partial scanner. Main advances require fresh live-target/conflict/full-patch/native-input/caller compatibility checks. Stable slices can land on their own current source/native verdict while an immutable iOS infrastructure run continues; that exception does not waive camera6 installed iOS or final18 latest Android+iOS.

Source checks include exact-head typecheck, warning-free lint, meaningful real SQLite checks, whitespace review and both platform exports as applicable. Green CI, a manifest or a hash index is not automatic acceptance. Reviewers inspect coverage and the real source, raw results, rendered UI and native database/artifacts. Evidence binds exact SHA/tree, actual command, platform, artifact hash/size and completed scope. Check mutable handles for actual liveness instead of relying on old lockfiles or intent.

The local16GiB host serializes heavy exports/native compiles. Local exports run Android then iOS with `npx expo export --platform <platform> --output-dir dist/<platform> --no-bytecode --max-workers 2`. Native Android work uses the task-owned emulator/Metro/build state and appropriate worker caps. Do not start parallel heavy work or kill unrelated processes. Reuse identical installed dependencies without changing package files merely to repeat a check.

Reuse unchanged exact-head owner/green-CI exports and frozen accepted evidence. Fresh changed-source light checks, decisive native workflows and concrete compatibility concerns still need verification. Do not repeatedly audit the same logs, titles, hashes or unchanged native compile for ceremony. Frozen source copies/receipts survive later authorized checkout edits; mutable watch checkpoints are not immutable past evidence. Future reviewers must distinguish the two.

For native retained-field checks, batch all visible values from the same actual post-action capture. Scroll only to missing fields and bind each frame to its action/route/source. A clipped control does not prove a defective minimum size, and a transport miss does not prove a passed workflow. Preserve completed write evidence rather than replaying it after a read-only observation failure.

When resumed, guarded automatic merge is eligible only for an independently accepted exact current head after fresh PR/base/check/ledger review. The program used `gh pr merge <PR> --repo saudm6/grocery-tracking-app --squash --auto --match-head-commit <fullSHA>`. On an unprotected target, auto may merge immediately. Verify resulting main and issue state, then ordinary-integrate that actual main downstream. PR 21 needs real native PASS first and still must not close18.

The final deliverable includes installable test builds and reproducible setup/install instructions. App-store release, cloud sync, backup/export, online lookup, receipt automation, weights and additional currencies remain outside the backlog. Local data can be lost on uninstall/device loss; the design's existing local-only limitation must remain documented. Historical dependency advisory triage is not a clean current security audit or permission for incompatible forced package updates.

## Evidence sources and durable references

The detailed local evidence store is `C:/Users/Saud/.codex/visualizations/2026/10/09/01a12185-4b2e-7a33-8488-bba9785051e7/orchestrate`. It includes preferences.md through 23, decisions.tsv, overview.md, owner/independent receipts, hash indexes and hosted raw logs. Those files preserve exact-head history; old partial wording is superseded by later final entries and accepted review packets. The table above separately rechecked actual merged/open PR state.

Repository source locations include `src/data/grocery.ts`, code.ts, schema.ts and submission.ts; `src/data/provider.tsx`; `src/components/form.tsx` and the named house components; `src/screens/` forms/reports; and `src/app/` route adapters. Pending core source belongs to its isolated worktree, not main. Read CURRENT_STATUS for exact paths before editing anything.

This document references accepted reviews and failure observations rather than copying full artifact logs. The local links below require the preserved workspace/store. The PR and workflow URLs provide remote history, while the three repository handoffs preserve the rationale and remaining obligations without requiring this chat.

[e01]: C:/Users/Saud/.codex/visualizations/2026/10/09/01a12185-4b2e-7a33-8488-bba9785051e7/orchestrate/issue01-verification.md
[e02]: C:/Users/Saud/.codex/visualizations/2026/10/09/01a12185-4b2e-7a33-8488-bba9785051e7/orchestrate/issue02-verification.md
[e03]: C:/Users/Saud/.codex/visualizations/2026/10/09/01a12185-4b2e-7a33-8488-bba9785051e7/orchestrate/issue03-verification.md
[e04]: C:/Users/Saud/.codex/visualizations/2026/10/09/01a12185-4b2e-7a33-8488-bba9785051e7/orchestrate/issue04-verification.md
[e05]: C:/Users/Saud/.codex/visualizations/2026/10/09/01a12185-4b2e-7a33-8488-bba9785051e7/orchestrate/issue05-verification.md
[e06]: C:/Users/Saud/.codex/visualizations/2026/10/09/01a12185-4b2e-7a33-8488-bba9785051e7/orchestrate/issue06-root-3cd-android-native-review.md
[e07]: C:/Users/Saud/.codex/visualizations/2026/10/09/01a12185-4b2e-7a33-8488-bba9785051e7/orchestrate/issue07-root-core-source-review.md
[e08]: C:/Users/Saud/.codex/visualizations/2026/10/09/01a12185-4b2e-7a33-8488-bba9785051e7/orchestrate/issue08-root-abbc-refresh-review.md
[e09]: C:/Users/Saud/.codex/visualizations/2026/10/09/01a12185-4b2e-7a33-8488-bba9785051e7/orchestrate/issue09-verification.md
[e10]: C:/Users/Saud/.codex/visualizations/2026/10/09/01a12185-4b2e-7a33-8488-bba9785051e7/orchestrate/issue10-verification.md
[e11]: C:/Users/Saud/.codex/visualizations/2026/10/09/01a12185-4b2e-7a33-8488-bba9785051e7/orchestrate/issue11-verification.md
[e12]: C:/Users/Saud/.codex/visualizations/2026/10/09/01a12185-4b2e-7a33-8488-bba9785051e7/orchestrate/issue12-root-native-review.md
[e13]: C:/Users/Saud/.codex/visualizations/2026/10/09/01a12185-4b2e-7a33-8488-bba9785051e7/orchestrate/issue13-root-native-review.md
[e14]: C:/Users/Saud/.codex/visualizations/2026/10/09/01a12185-4b2e-7a33-8488-bba9785051e7/orchestrate/issue14-verification.md
[e15]: C:/Users/Saud/.codex/visualizations/2026/10/09/01a12185-4b2e-7a33-8488-bba9785051e7/orchestrate/issue15-root-native-review.md
[e16]: C:/Users/Saud/.codex/visualizations/2026/10/09/01a12185-4b2e-7a33-8488-bba9785051e7/orchestrate/issue16-root-native-review.md
[e17native]: C:/Users/Saud/.codex/visualizations/2026/10/09/01a12185-4b2e-7a33-8488-bba9785051e7/orchestrate/issue17-root-core-native-review.md
[e92source]: C:/Users/Saud/.codex/visualizations/2026/10/09/01a12185-4b2e-7a33-8488-bba9785051e7/orchestrate/issue18-root-e92-offline-budget-source-review.md

Skipped implementation, test/build/runtime actions and git/remote mutations during this handoff. Pending iOS, integrated scanning and full accessibility evidence remain incomplete; handoff writing does not close those risks.
