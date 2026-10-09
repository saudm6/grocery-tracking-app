# First-version implementation backlog

The [app design](superpowers/specs/2026-10-09-grocery-tracker-design.md) defines the behavior. Each linked GitHub issue has its own acceptance criteria and verification. Start with #1's manual offline purchase; implement each later slice once its prerequisites are complete. Shared price/history, identity, and database rules are established before multiple screens depend on them.

| Issue | Complete user-facing slice | Blocked by |
| --- | --- | --- |
| [#1](https://github.com/saudm6/grocery-tracking-app/issues/1) | Record a manual purchase in a chosen month offline | None |
| [#2](https://github.com/saudm6/grocery-tracking-app/issues/2) | Manage brands and stores from dedicated catalog pages | #1 |
| [#3](https://github.com/saudm6/grocery-tracking-app/issues/3) | Manage products in the catalog without recording spending | #1, #2 |
| [#4](https://github.com/saudm6/grocery-tracking-app/issues/4) | Manage categories and subcategories with linked product spending | #1, #3 |
| [#5](https://github.com/saudm6/grocery-tracking-app/issues/5) | Select a known product manually for a repeat purchase | #3, #4 |
| [#6](https://github.com/saudm6/grocery-tracking-app/issues/6) | Scan a known UPC, EAN, or QR code into a purchase | #3, #5 |
| [#7](https://github.com/saudm6/grocery-tracking-app/issues/7) | Save an unknown scanned product and purchase together | #2, #4, #6 |
| [#8](https://github.com/saudm6/grocery-tracking-app/issues/8) | Scan or type a product code into the catalog without spending | #3, #6 |
| [#9](https://github.com/saudm6/grocery-tracking-app/issues/9) | Correct or delete purchases without automatically rewriting price history | #4, #5 |
| [#10](https://github.com/saudm6/grocery-tracking-app/issues/10) | Track current saved price changes from current-month purchases | #3, #5 |
| [#11](https://github.com/saudm6/grocery-tracking-app/issues/11) | Edit product saved prices and inspect complete price history | #3, #10 |
| [#12](https://github.com/saudm6/grocery-tracking-app/issues/12) | Apply old receipts to Inflation and change inclusion at any time | #9, #11 |
| [#13](https://github.com/saudm6/grocery-tracking-app/issues/13) | Explore counted price increases by category and month | #4, #12 |
| [#14](https://github.com/saudm6/grocery-tracking-app/issues/14) | Choose a primary brand for each subcategory | #2, #4, #5 |
| [#15](https://github.com/saudm6/grocery-tracking-app/issues/15) | Show monthly spending analytics on Home | #1, #4, #9 |
| [#16](https://github.com/saudm6/grocery-tracking-app/issues/16) | Move a subcategory and reclassify all past reports | #4, #13, #15 |
| [#17](https://github.com/saudm6/grocery-tracking-app/issues/17) | Make the first-use and empty-data flows usable and accessible | #7, #8, #13, #14, #15, #16 |
| [#18](https://github.com/saudm6/grocery-tracking-app/issues/18) | Verify the complete offline app and document how to run it | #7, #8, #9, #11, #13, #14, #16, #17 |

## Shared completion requirements

- Each screen provides labeled accessible controls, usable keyboard/screen-reader navigation, understandable validation, and retained form values after failed saves. #17 audits the full experience after these basics ship with each slice.
- Each mutation completes through the grocery boundary, uses bound SQL and the required transaction/constraints, and refreshes affected reads after commit. Repeated callbacks or Save taps do not duplicate a submission; a new form can record an intentional repeat purchase.
- Meaningful checks for each new data rule belong to that issue. Use database-level checks for constraints, rollback, and migrations, pure examples for money/code/Inflation rules, and real phone hardware for camera behavior in #6/#7. #18 reruns and integrates these checks rather than starting verification at the end.
- A schema-changing slice adds an upgrade check preserving existing data and a recoverable failure check. No initialization or migration failure may recover by silently resetting the database.

## Implementation milestones

1. **Manual purchase (#1):** choose a month, create the required catalog records and one purchase atomically, verify the total and offline reopening, and establish the shared price writer/database safeguards. Scanning and reports are later work.
2. **Catalog and repeat purchases (#2–#5):** preserve stable record IDs and historical purchase grouping, and use the shared price writer and code normalizer. #5 waits for #4; this also supplies #8's subcategory prerequisite through #6.
3. **Scanning and corrections (#6–#9), current prices/history (#10–#11):** follow the individual blockers, with error recovery and tests in each slice. Ordinary purchase corrections/deletions preserve history.
4. **Historical Apply, reporting, and preferences (#12–#16):** #12 builds on #9's correction/deletion flows and #11's history. Old receipts are spending-only until **Apply inflation**; an optional purchase date and the defined month-only fallback determine historical order. Switching inclusion off retains the observation as a reference. Only an explicit Apply action synchronizes a receipt correction/removal, and it never changes today's saved defaults. Then complete the Inflation/Home reports, primary brands, and category moves according to their blockers.
5. **Final audits (#17–#18):** verify complete usability/accessibility, offline and device behavior, and reproducible setup/installable test builds.

The first version ends with an installable test build and documented local setup. App-store publication, cloud sync, backup/export, automated receipt import, online product lookup, weights, and multiple currencies are outside this backlog. Manually entering an old receipt and explicitly applying its price to Inflation are included.
