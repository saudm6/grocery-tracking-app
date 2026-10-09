# First-version implementation backlog

The [app design](superpowers/specs/2026-10-09-grocery-tracker-design.md) defines the behavior. Each linked GitHub issue has its own acceptance criteria. Start with #1; after its blockers are complete, several later slices can proceed independently.

| Issue | Complete user-facing slice | Blocked by |
| --- | --- | --- |
| [#1](https://github.com/saudm6/grocery-tracking-app/issues/1) | Record a manual purchase in a chosen month offline | None |
| [#2](https://github.com/saudm6/grocery-tracking-app/issues/2) | Manage brands and stores from dedicated catalog pages | #1 |
| [#3](https://github.com/saudm6/grocery-tracking-app/issues/3) | Manage products in the catalog without recording spending | #1, #2 |
| [#4](https://github.com/saudm6/grocery-tracking-app/issues/4) | Manage categories and subcategories with linked product spending | #1, #3 |
| [#5](https://github.com/saudm6/grocery-tracking-app/issues/5) | Select a known product manually for a repeat purchase | #3 |
| [#6](https://github.com/saudm6/grocery-tracking-app/issues/6) | Scan a known UPC, EAN, or QR code into a purchase | #3, #5 |
| [#7](https://github.com/saudm6/grocery-tracking-app/issues/7) | Save an unknown scanned product and purchase together | #2, #4, #6 |
| [#8](https://github.com/saudm6/grocery-tracking-app/issues/8) | Scan or type a product code into the catalog without spending | #3, #6 |
| [#9](https://github.com/saudm6/grocery-tracking-app/issues/9) | Correct or delete purchase entries without rewriting price history | #4, #5 |
| [#10](https://github.com/saudm6/grocery-tracking-app/issues/10) | Track current saved price changes from current-month purchases | #3, #5 |
| [#11](https://github.com/saudm6/grocery-tracking-app/issues/11) | Edit product saved prices and inspect complete price history | #3, #10 |
| [#12](https://github.com/saudm6/grocery-tracking-app/issues/12) | Switch any past price change in or out of Inflation | #11 |
| [#13](https://github.com/saudm6/grocery-tracking-app/issues/13) | Explore counted price increases by category and month | #4, #12 |
| [#14](https://github.com/saudm6/grocery-tracking-app/issues/14) | Choose a primary brand for each subcategory | #2, #4, #5 |
| [#15](https://github.com/saudm6/grocery-tracking-app/issues/15) | Show monthly spending analytics on Home | #1, #4, #9 |
| [#16](https://github.com/saudm6/grocery-tracking-app/issues/16) | Move a subcategory and reclassify all past reports | #4, #13, #15 |
| [#17](https://github.com/saudm6/grocery-tracking-app/issues/17) | Make the first-use and empty-data flows usable and accessible | #7, #8, #13, #14, #15, #16 |
| [#18](https://github.com/saudm6/grocery-tracking-app/issues/18) | Verify the complete offline app and document how to run it | #7, #8, #9, #11, #13, #14, #16, #17 |

The first version ends with an installable test build and documented local setup. App-store publication, cloud sync, backup/export, receipt import, online product lookup, weights, and multiple currencies are outside this backlog.
