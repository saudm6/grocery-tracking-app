# Grocery tracker app design

**Status:** Draft for review. This document describes the app; no app implementation has started.

## Goal

Build an Expo app for recording groceries bought, the store, quantity, and price, then reviewing monthly spending. The app works offline and keeps its database on the device. A scan identifies a product already saved in the local catalog; for a new code, the user supplies the product details. There is no automatic online product lookup.

## Main navigation and pages

| Area | Pages and actions |
| --- | --- |
| Home | Analytics only: selected-month total, previous-month comparison, spending by category, and spending by store. Values refresh after a purchase is added, edited, or removed. |
| Total Spending | Choose a year and month. See that month's total and every purchase entry, including repeat purchases of one product. The top-right **Add** action opens the purchase form. Each entry shows product, quantity, unit price, line total, and store; open an entry to correct or delete it. |
| Products | Search, view, add, and edit catalog products. Add with a scan or by typing a code; products without a code can also be added manually. A product can be saved without recording spending. |
| Brands | Dedicated list and add/rename page. |
| Categories | Dedicated list and add/rename page. |
| Stores | A reusable store list in the local database. Choose or create a store from the purchase form; the Catalog area also provides a simple list to fix store names. |

The initial bottom tabs are **Home**, **Total Spending**, and **Catalog**. Catalog links to the Products, Brands, Categories, and Stores pages. This keeps the main tab bar short while giving each requested entity its own page.

## Two ways to add a product

1. **Catalog only:** On Products, scan or type a code, enter a product name, and choose or create its brand and category. Saving puts it in the catalog for future scans. It does not change spending. From the saved product, **Record purchase** can open the monthly purchase form if the user also bought it.
2. **While recording spending:** On Total Spending, choose a month and tap Add. Scan a code or search/select a product manually. A known code fills in the product identity, brand, and category. A new code stays on the form while the user enters the product name and chooses or creates brand and category. The user chooses or creates a store, enters quantity and the price paid per unit, then saves. One save creates any new catalog records and the purchase together, then returns to that month's list.

For either flow, a denied camera permission or an unreadable label leaves manual code entry and product search available. A scan is handled once per form opening so a camera callback cannot add duplicate purchases. Repeated purchases of the same product remain separate entries, because store and price can differ.

## Data design

The app uses Expo SQLite as the single local database. Expo Router provides the screens, and Expo Camera provides code scanning. The UI asks one grocery data boundary to look up codes, save catalog records, record purchases, and read monthly reports. That boundary owns validation and database transactions; screens do not assemble SQL or coordinate several writes for one save. [Expo SQLite](https://docs.expo.dev/versions/latest/sdk/sqlite/), [Expo Camera](https://docs.expo.dev/versions/latest/sdk/camera/), and [Expo Router](https://docs.expo.dev/router/introduction/) support this proposed shape.

| Record | Fields that matter |
| --- | --- |
| Brand | ID, unique name |
| Category | ID, unique name |
| Store | ID, unique name |
| Product | ID, name, optional brand ID, optional category ID, archived status |
| Product code | Product ID, code kind, original code, lookup key; each kind/key pair identifies one product, and one product may have more than one code |
| Purchase entry | ID, product ID, store ID, chosen year-month, category ID at purchase time, quantity, unit price in the currency's smallest unit, creation time |

The purchase entry owns the price: editing a catalog product never rewrites what was paid. Its category ID is recorded at purchase time so changing a product's category later does not move old spending between categories. The purchase correction form can fix a mistaken category on that entry. Product and store names remain linked to catalog records so a spelling correction appears everywhere, including older entries. Monthly totals are calculated from purchase entries, never stored in a second totals table. A product, brand, category, or store used in purchases cannot be deleted in a way that erases history.

The first version treats quantity as a positive whole number of items and price as the amount for one item; line total is quantity × unit price. Money is stored as integer minor units to avoid floating-point totals. The proposed starting currency is OMR, whose smallest unit is the baisa. The quantity and currency choices need confirmation before implementation.

For matching, standard retail UPC/EAN barcodes that represent the same product number share one lookup key, while QR content is treated as an opaque code. The app never opens a scanned QR URL. Retail codes are checked for valid length and check digit; QR content is limited to a reasonable length and shown before saving. A kind/key pair cannot identify two products. The first-time scan save is one transaction: either product, new brand/category/store, and purchase all save, or none do.

The app-facing operations are `lookupCode(code)`, `saveProduct(product)`, `saveBrand(name)`, `saveCategory(name)`, `saveStore(name)`, `recordPurchase(month, product, store, quantity, unitPrice)`, `updatePurchase(id, changes)`, `deletePurchase(id)`, `getMonth(month)`, and `getHomeAnalytics(month)`. `recordPurchase` handles inline catalog creation and the purchase in one transaction. Code normalization and SQL stay behind this boundary.

## Screen data flow

```text
Camera or typed code → local code lookup → known product or new-product form
                                        → confirm purchase details
                                        → one SQLite transaction
                                        → selected-month list → Home analytics query
```

The monthly view and Home query the same purchase entries. Changing an entry's month, price, quantity, category, or store changes the relevant totals on the next read. Deleting an entry requires confirmation because it removes recorded spending.

## Design choice

Two shapes were compared. A pure catalog model stores only links in purchases; it is smaller but recategorizing a product would silently rewrite older category totals. A full purchase snapshot copies every product and store label into each entry; it preserves old labels but adds duplicated data and more rules for edits. The proposed design uses the purchase-ledger candidate for historical price and category accuracy, with the catalog-first candidate's month-only entry flow and lean Home analytics. It keeps the reusable catalog, records price and category on each purchase, and derives analytics from those entries. Product and store renames remain visible in old entries by design.

## Decisions to confirm before app code

1. Should scanning support grocery UPC/EAN barcodes **and** QR codes? This draft assumes both.
2. Is **OMR** the only currency needed at first?
3. Does quantity need weights or volumes such as **0.5 kg**, or is a whole-number item count enough?
4. When adding a product in the catalog, should price and store be saved as suggestions for later purchases, or is the **Record purchase** action enough? This draft keeps price and store on purchases only.

## First implementation slice after approval

Set up the Expo project, SQLite schema, and code lookup/record-purchase boundary. Verify that an unknown scan plus inline brand/category/store creates one complete purchase, a repeated scan cannot create a duplicate unintentionally, and monthly totals use the saved prices. Then build the screens around those operations.

No cloud account, cross-device sync, receipt import, or online product search is included in this first design. A local-only database can be lost if the app is uninstalled or the device is lost; export or backup should be designed before relying on it as the only long-term record.
