# Grocery tracker app design

**Status:** Draft for review. This document describes the app; no app implementation has started.

## Goal

Build an Expo app for recording groceries bought, the store, quantity, and price, then reviewing monthly spending. The app works offline and keeps its database on the device. A scan identifies a product already saved in the local catalog; for a new code, the user supplies the product details. There is no automatic online product lookup.

## Main navigation and pages

| Area | Pages and actions |
| --- | --- |
| Home | Analytics only: selected-month total, previous-month comparison, spending by category, and spending by store. Values refresh after a purchase is added, edited, or removed. |
| Total Spending | Choose a year and month. See that month's total and every purchase entry, including repeat purchases of one product. The top-right **Add** action opens the purchase form. Each entry shows product, quantity, unit price, line total, and store; open an entry to correct or delete it. |
| Inflation | Filter by category and inclusive start/end month. See products whose saved price rose in that period, with the earlier price, later price, OMR increase, percentage increase, and a small price-over-time chart. Tap a product to open its details. |
| Products | Search, view, add, and edit catalog products, including their saved price and store. Add with a scan or by typing a code; products without a code can also be added manually. A product can be saved without recording spending. Product details show brand, category, codes, saved price/store, when the price last changed, its price history, and purchases with their actual paid prices. |
| Brands | Dedicated list and add/rename page. |
| Categories | Dedicated list and add/rename page. |
| Stores | A reusable store list in the local database. Choose or create a store from the purchase form; the Catalog area also provides a simple list to fix store names. |

The initial bottom tabs are **Home**, **Total Spending**, **Inflation**, and **Catalog**. Catalog links to the Products, Brands, Categories, and Stores pages. Inflation opens the same product details page as Catalog.

## Two ways to add a product

1. **Catalog only:** On Products, scan or type a code, enter a product name, choose or create its brand and category, and optionally save its current price and store. An unknown scan shows these manual fields on the same scanning page. Saving puts the product in the catalog for future scans. It does not change spending. From the saved product, **Record purchase** can open the monthly purchase form if the user also bought it.
2. **While recording spending:** On Total Spending, choose a month and tap Add. Scan a code or search/select a product manually. A known code fills in the product identity, brand, category, saved price, and saved store; the user confirms or changes the price and store for this purchase. An unknown code, including an unknown QR code, stays visible while the scanning page shows manual fields for product name, brand, category, store, and price. The user enters a whole-item quantity, then saves. One save creates any new catalog records, saves the new product's price and store, and records the purchase with its own price and store before returning to that month's list.

For either flow, a denied camera permission or an unreadable label leaves manual code entry and product search available. A scan is handled once per form opening so a camera callback cannot add duplicate purchases. Repeated purchases of the same product remain separate entries, because store and price can differ.

## Data design

The app uses Expo SQLite as the single local database. Expo Router provides the screens, and Expo Camera provides code scanning. The UI asks one grocery data boundary to look up codes, save catalog records, record purchases, and read monthly reports. That boundary owns validation and database transactions; screens do not assemble SQL or coordinate several writes for one save. [Expo SQLite](https://docs.expo.dev/versions/latest/sdk/sqlite/), [Expo Camera](https://docs.expo.dev/versions/latest/sdk/camera/), and [Expo Router](https://docs.expo.dev/router/introduction/) support this proposed shape.

| Record | Fields that matter |
| --- | --- |
| Brand | ID, unique name |
| Category | ID, unique name |
| Store | ID, unique name |
| Product | ID, name, optional brand ID, optional category ID, optional saved price in baisa, optional saved store ID, archived status |
| Product code | Product ID, code kind, original code, lookup key; each kind/key pair identifies one product, and one product may have more than one code |
| Product price history | ID, product ID, saved price in baisa, store ID at the time, date/time recorded; the first price is the baseline and each changed saved price adds a row |
| Purchase entry | ID, product ID, store ID, chosen year-month, category ID at purchase time, quantity, unit price in baisa, creation time |

The product's saved price and store prefill future purchases. Each purchase keeps its own confirmed price and actual store. Editing a product's saved price or store never rewrites an older purchase or its monthly total; recording a purchase at a different price does not silently change the product's saved price. For example, buying an item at 2.000 OMR records 2.000 OMR in that month. Changing the product's saved price to 2.500 OMR six months later prefills 2.500 OMR for the next purchase while the earlier entry remains 2.000 OMR.

When a saved product price is first set, the app records its baseline with the date and time. Each later edit to a different saved price appends a history row in the same database transaction as the product update; saving an unchanged price adds no row. The product details page derives **last price changed** from the latest change row, or shows **price first set** if there has been no change. Dates and times display in the device's local time. Past history rows are kept when the current price changes.

The purchase entry also records its category ID at purchase time so changing a product's category later does not move old spending between categories. The purchase correction form can fix a mistaken category on that entry. Product and store names remain linked to catalog records so a spelling correction appears everywhere, including older entries. Monthly totals are calculated from purchase entries, never stored in a second totals table. Catalog records referenced by purchases or price history are archived rather than deleted.

Quantity is a positive whole number of items and price is the amount for one item; line total is quantity × unit price. Prices are stored as integer baisa to avoid floating-point totals.

For matching, standard retail UPC/EAN barcodes that represent the same product number share one lookup key, while QR content is treated as an opaque code. The app never opens a scanned QR URL. Retail codes are checked for valid length and check digit; QR content is limited to a reasonable length and shown before saving. A kind/key pair cannot identify two products. The first-time scan save is one transaction: either product, new brand/category/store, and purchase all save, or none do.

The app-facing operations are `lookupCode(code)`, `saveProduct(product)`, `getProductDetails(id)`, `getInflation(category, startMonth, endMonth)`, `saveBrand(name)`, `saveCategory(name)`, `saveStore(name)`, `recordPurchase(month, product, store, quantity, unitPrice)`, `updatePurchase(id, changes)`, `deletePurchase(id)`, `getMonth(month)`, and `getHomeAnalytics(month)`. `saveProduct` records price changes atomically, and `recordPurchase` handles inline catalog creation, its initial price-history row, and the purchase in one transaction. Code normalization and SQL stay behind this boundary.

## Inflation calculations

For each product, the selected start price is the latest saved price known at the start of the chosen range, or its first price recorded inside the range. The end price is the latest saved price recorded through the last day of the selected end month. The page lists products with at least two prices and a positive net change, sorted by the OMR increase. It shows `end − start` in OMR and `(end − start) ÷ start` as a percentage; a zero start price has no percentage. Products with only one recorded price are shown in details but are not labeled as having increased. The category filter uses each product's current category. Product details show the full dated price timeline, including decreases and the store saved with each price.

This page reflects prices entered into this app, not an official inflation index. A price change that was never recorded cannot appear in its trend.

## Screen data flow

```text
Camera or typed code → local code lookup → known product or new-product form
                                        → confirm purchase details
                                        → one SQLite transaction
                                        → selected-month list → Home analytics query

Edit product saved price → update product and append dated price-history row
                         → Inflation and product details read the new timeline
```

The monthly view and Home query the same purchase entries. Changing an entry's month, price, quantity, category, or store changes the relevant totals on the next read. Deleting an entry requires confirmation because it removes recorded spending.

## Design choice

Two shapes were compared. A pure catalog model stores only links in purchases; it is smaller but recategorizing a product would silently rewrite older category totals. A full purchase snapshot copies every product and store label into each entry; it preserves old labels but adds duplicated data and more rules for edits. The proposed design uses the purchase-ledger candidate for historical price and category accuracy, with the catalog-first candidate's month-only entry flow and lean Home analytics. It keeps the reusable catalog, records price and category on each purchase, and derives analytics from those entries. Product and store renames remain visible in old entries by design.

## Confirmed decisions

- Scanning supports both standard grocery UPC/EAN barcodes and QR codes.
- An unknown QR code opens manual product details on the same scanning page.
- The first version uses OMR only, with no currency selector or conversion.
- Quantity is a whole-item count; weights and volumes are outside the first version.
- Products can hold a saved price and store for new purchases; each purchase preserves its actual price and store when those product defaults change.
- Product saved-price edits keep dated history; the Inflation tab compares those prices by category and month and links to product details.
- A purchase at a different price does not update the product's saved price or Inflation history; only an explicit product price edit does.

## First implementation slice after approval

Set up the Expo project, SQLite schema, and code lookup/record-purchase boundary. Verify that an unknown scan plus inline brand/category/store creates one complete purchase, a repeated scan cannot create a duplicate unintentionally, and changing a product's saved price creates one dated change while leaving older monthly totals intact. Then build the screens around those operations.

No cloud account, cross-device sync, receipt import, or online product search is included in this first design. A local-only database can be lost if the app is uninstalled or the device is lost; export or backup should be designed before relying on it as the only long-term record.
