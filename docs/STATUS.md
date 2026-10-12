# Status and remaining plan

Updated 2026-10-12. This replaces the three `docs/handoff/` files. They are still in git history at commit `88d7c14` if an old detail is needed.

The [design](superpowers/specs/2026-10-09-grocery-tracker-design.md) still defines how the app behaves. The [original backlog](implementation-backlog.md) explains how the first 18 issues were split.

## Where things stand

| Area | State |
| --- | --- |
| Merged on `main` | 13 of 18 issues: #1–#5 and #9–#16. Manual purchases, catalog, categories/subcategories, repeat purchases, corrections, saved prices, price history, Apply inflation, the Inflation tab, primary brands, Home analytics and subcategory moves. |
| Checks on `main` | CI passes: typecheck, lint, 68 tests against real SQLite, and Android and iOS JavaScript bundles. |
| Tested where | Android only: Expo Go and an Android emulator on this PC. **The app has never been opened on an iPhone.** |
| #6 camera | [PR #28](https://github.com/saudm6/grocery-tracking-app/pull/28) is ready. Scanning was tested on the Android emulator's virtual camera (UPC-A, UPC-E, EAN-8, EAN-13 and QR). It needs `main` merged in again before landing. |
| #7, #8 unknown codes | Replaced by step 4 below. Codex's unmerged local branches `codex/issue-07-unknown-scan` and `codex/issue-08-catalog-code` were built for the old "fields on the scanning page" design and are not needed. |
| #17 polish | Unmerged local branch `codex/issue-17-accessibility-core` has a 3-line fix (Home button, back-button labels). Fold it into step 6. |
| #18 finish | Not started. README is out of date. |
| [PR #21](https://github.com/saudm6/grocery-tracking-app/pull/21) | iOS simulator test harness on GitHub's Mac runners. 14 runs and none passed; the last one failed while the simulator was still booting. The iOS simulator has no camera either. Recommended: close without merging. |

## Decisions (2026-10-12)

1. **This is an Expo app and the real device is an iPhone.** Development testing runs on the Android emulator on this Windows PC. iPhone checks happen in Expo Go at two fixed points, not per feature.
2. **An unknown code opens the normal Add product form** with the code filled in. If a purchase was in progress, saving the product returns to it with the new product selected. There is no separate set of fields on the scanning page.
3. **No iOS CI harness.** A real iPhone in Expo Go is better evidence and costs nothing.
4. **Backup/export is part of v1.** All data lives in one file on one phone. Expo Go data also stays inside Expo Go and will not carry over to an installed build, so export/import is needed before real daily use.

## Remaining plan

| Step | Work | Checked by |
| --- | --- | --- |
| 1. Clean up | Close PR #21. Delete the unneeded #7/#8 branches. Remove merged Codex worktrees. Rewrite GitHub issues #7, #8, #17 and #18 to match this plan, and open an issue for backup. | Claude, after your OK for the GitHub changes |
| 2. First iPhone look | Run checklist A below. It finds iPhone-only layout problems before more is built on top. | You, about 10 minutes |
| 3. Camera (#6) | Merge `main` into PR #28, fix anything from step 2, rerun the emulator scan checks, merge. | Claude: CI and emulator |
| 4. Unknown codes open Add product (#7 and #8) | See below. | Claude: tests and emulator |
| 5. Backup | Export a complete copy of the database through the iPhone share sheet (Files, AirDrop, email). Import it on a fresh install after a clear "this replaces all data" confirmation. Never merge partially. | Claude: tests and emulator |
| 6. Polish (#17, smaller) | Empty screens say what to do next. Errors are understandable. Labels and button sizes are fine with large text. Include the 3-line #17 fix. | Claude: emulator, including the accessibility tree |
| 7. Finish (#18, smaller) | Rewrite README: run in Expo Go, export/import, and how to install a real build if you choose to. Run checklist B. | You, about 15 minutes |
| Optional | Format the code with Prettier and split the 2,462-line test file. No behavior change; it makes the code readable for you. | CI |

### Step 4 in detail

- In the purchase form, a scanned or typed code with no owner shows **Add as new product**. It opens the existing Add product screen (`product-edit`) with the code and format filled in. After saving, it returns to the purchase form with the new product selected. Price, store and quantity are then confirmed and the purchase is saved.
- The Add product and Edit product screens get a **Scan code** button next to the code field. It uses the same scanner as the purchase form. A known code shows its existing product with an **Open** button. An unknown code stays filled in, so the product saves with it. Edit product uses the same button to add a second barcode.
- An archived product's code still opens that product and offers reactivation. It never starts Add product.
- No new database operation should be needed: `saveProduct` already saves a product with its code in one transaction. If QR text with unusual characters does not survive being passed between screens, pass it in memory instead of through route parameters.
- Checks: a test that the new code resolves to the new product afterwards. On the emulator, scan an unknown code, add the product, return to the purchase, and save. Scan the code again and confirm it selects the new product. Also leave right after the product save and confirm the product exists with no spending.

## How changes are tested

- **Every change:** CI (typecheck, lint, tests, both bundles).
- **New or changed data rules:** a test in `src/data/grocery.test.ts` against real SQLite.
- **Screens and camera:** Claude runs the app on the Android emulator already installed at `E:/Projects/grocery-tracking-worktrees/runtime01` (AVD `GroceryVerify01`). Its virtual camera shows barcode images, so scanning works without a phone.
- **iPhone:** only checklists A and B. The iOS simulator needs a Mac and has no camera, so the iPhone cannot be tested from this PC.

No hash binding, evidence store or network-shutoff harness. A short note in each PR says what was checked and where.

### Checklist A. First iPhone look (step 2)

1. On the PC, in this folder: `npm ci` (first time only), then `npm start`. The iPhone must be on the same Wi-Fi. If it cannot connect, use `npx expo start --tunnel`.
2. On the iPhone, open the Camera app, scan the QR code in the terminal and open it in **Expo Go**.
3. Open Total Spending and tap **Add**. Enter a product, a new category, a new store, price `1.250`, quantity `2`. Save. The month total shows `2.500`.
4. Open Home, Inflation, and that product under Catalog, Products. Note anything cut off, overlapping, unreadable or not tappable. Screenshots are the easiest way to report it.
5. Swipe Expo Go closed, open the project again: the purchase is still there.

### Checklist B. Final check (step 7)

Checklist A again on the final version, plus:

1. In a new purchase, scan a real product barcode that is not saved yet. Tap **Add as new product**, save the product, then save the purchase.
2. Scan the same barcode in another new purchase. It selects that product.
3. Scan any QR code. It shows the text and never opens a website.
4. In iPhone Settings, turn camera access off for Expo Go, then try to scan. Typing a code and searching still work.
5. Export a backup and confirm the file appears where you sent it.

## Open decision: how the app gets onto your iPhone for daily use

| Option | Cost | Result |
| --- | --- | --- |
| Expo Go | Free | Fine for testing. Needs `npm start` running on the PC to open the app. |
| EAS Build + Apple Developer Program | $99/year | A real installed app that works fully offline, delivered through TestFlight or direct install. Expo builds it in the cloud, so no Mac is needed. |

Free sideloading needs a Mac, or third-party tools whose installs expire every 7 days. Not recommended.

Whichever you choose, use backup (step 5) to move data from testing into the real install.

## Leftovers on this PC

- `E:/Projects/grocery-tracking-worktrees`: 37 git worktrees (issue01–17, verify*, ios-runtime) plus `runtime01`. Keep `runtime01`: it holds the Android SDK, the emulator and the Expo Go APK used for testing. The merged worktrees can be removed.
- `E:/gv01`: an Android native build checkout from issue 1. Can be removed.
- `C:/Users/Saud/.codex/visualizations/2026/10/09/01a12185-4b2e-7a33-8488-bba9785051e7/orchestrate`: Codex's evidence store (logs, screenshots, receipts). Not needed for the plan above.
