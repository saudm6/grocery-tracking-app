# Grocery tracker app design

**Status:** Draft for review. This document describes the app; no app implementation has started.

## Goal

Build an Expo app for recording groceries bought, the store, quantity, and price, then reviewing monthly spending. The app works offline and keeps its database on the device. A scan identifies a product already saved in the local catalog; for a new code, the user supplies the product details. There is no automatic online product lookup.

## Main navigation and pages

| Area | Pages and actions |
| --- | --- |
| Home | Analytics only: selected-month total, previous-month comparison, spending by category and subcategory, and spending by store. Values refresh after a purchase is added, edited, or removed. |
| Total Spending | Choose a year and month. See that month's total and every purchase entry, including repeat purchases of one product. The top-right **Add** action opens the purchase form. Each entry shows the exact product and brand, its category/subcategory, quantity, unit price, line total, and store; open an entry to correct or delete it. |
| Inflation | Filter by category and inclusive start/end month. See products whose included saved-price changes rose in that period, with the earlier price, later price, OMR increase, percentage increase, and a small price-over-time chart. Changes marked **Not inflation** are omitted from its charts and comparisons. Tap a product to open its details. |
| Products | Search, view, add, and edit catalog products, including their saved price and store. Add with a scan or by typing a code; products without a code can also be added manually. A product can be saved without recording spending. Product details show brand, category/subcategory, linked products in that subcategory, codes, saved price/store, when the price last changed, its full price history with editable **Not inflation** marks, and purchases with their actual paid prices. |
| Brands | Dedicated list and add/rename page. |
| Categories | Dedicated list and add/rename page, showing each category's subcategories. |
| Subcategories | Dedicated list and add/rename page. A detail page shows linked products, the current primary brand, and spending by brand and product. Move a subcategory to another category without recreating it or its linked products. |
| Stores | A reusable store list in the local database. Choose or create a store from the purchase form; the Catalog area also provides a simple list to fix store names. |

The initial bottom tabs are **Home**, **Total Spending**, **Inflation**, and **Catalog**. Catalog links to the Products, Brands, Categories, Subcategories, and Stores pages. Inflation opens the same product details page as Catalog.

## Two ways to add a product

1. **Catalog only:** On Products, scan or type a code, enter a product name, choose or create its brand, category, and optional subcategory, and optionally save its current price and store. An unknown scan shows these manual fields on the same scanning page. Saving puts the product in the catalog for future scans. It does not change spending. From the saved product, **Record purchase** can open the monthly purchase form if the user also bought it.
2. **While recording spending:** On Total Spending, choose a month and tap Add. Scan a code or search/select a product manually. A known code fills in the product identity, brand, category/subcategory, saved price, and saved store; the user confirms or changes the price and store for this purchase. For the current month, a changed price also updates the product's saved price/store and adds a dated price-history entry. The user can mark that change **Not inflation** before saving. An unknown code, including an unknown QR code, stays visible while the scanning page shows manual fields for product name, brand, category, optional subcategory, store, and price; missing reference values can be created there. The user enters a whole-item quantity, then saves. One save creates any new catalog records and the purchase together before returning to that month's list; current-month entries also set the new product's saved price and store.

For either flow, a denied camera permission or an unreadable label leaves manual code entry and product search available. A scan is handled once per form opening so a camera callback cannot add duplicate purchases. Repeated purchases of the same product remain separate entries, because store and price can differ.

## Categories, subcategories, and linked products

A category contains subcategories, and a subcategory links products that serve the same need. For example, **Dairy → Milk** can contain separate Mazoon Milk and Marai Milk products, each with its own code, brand, price history, and purchases. Category and subcategory are the only grouping levels; there is no separate product-group table. A product belongs to at most one subcategory; an ungrouped product can sit directly under a category. Spending on **Milk** adds the actual purchases of both products, while each purchase still identifies the exact brand and product bought.

Each subcategory can have one current primary brand that has at least one active product in that subcategory. Changing Milk's primary brand from Mazoon to Marai puts Marai's milk products first when the user chooses Milk manually; the user still chooses the exact product. Scanning a code always selects the scanned product, regardless of the primary brand. Switching the primary does not rewrite past purchases or price history. The primary brand is a current preference; purchase entries show which brand and product were actually bought in each month. If a brand no longer has an active product in Milk, its primary selection is cleared.

A subcategory can be moved to another category by changing its parent; its ID and linked products remain the same. All past and future purchases in that subcategory count under its new parent category in Home and monthly category totals. The purchases still keep their exact product, brand, store, price, and subcategory.

## Data design

The app uses Expo SQLite as the single local database. Expo Router provides the screens, and Expo Camera provides code scanning. The UI asks one grocery data boundary to look up codes, save catalog records, record purchases, and read monthly reports. That boundary owns validation and database transactions; screens do not assemble SQL or coordinate several writes for one save. [Expo SQLite](https://docs.expo.dev/versions/latest/sdk/sqlite/), [Expo Camera](https://docs.expo.dev/versions/latest/sdk/camera/), and [Expo Router](https://docs.expo.dev/router/introduction/) support this proposed shape.

| Record | Fields that matter |
| --- | --- |
| Brand | ID, unique name |
| Category | ID, unique name |
| Subcategory | ID, parent category ID, name, optional primary brand ID |
| Store | ID, unique name |
| Product | ID, name, optional brand ID, either a direct category ID or a subcategory ID, optional saved price in baisa, optional saved store ID, archived status |
| Product code | Product ID, code kind, original code, lookup key; each kind/key pair identifies one product, and one product may have more than one code |
| Product price history | ID, product ID, saved price in baisa, store ID at the time, date/time recorded, included-in-Inflation flag; the first price is the baseline and each changed saved price adds a row |
| Purchase entry | ID, product ID, brand ID at purchase time, store ID, chosen year-month, either a direct category ID or a subcategory ID at purchase time, quantity, unit price in baisa, creation time |

The product's saved price and store prefill future purchases. Each purchase keeps its own confirmed price and actual store. For example, buying a product at 20.000 OMR records 20.000 OMR in that month. Three months later, scanning it fills in the same product; changing the price to 22.000 OMR and saving records a new purchase at 22.000 OMR, updates the product's saved price, and adds a dated 20.000 → 22.000 OMR price change. The earlier 20.000 OMR purchase and monthly total stay intact. Editing an old purchase to correct a mistake changes that purchase only.

When a changed price is saved with a current-month purchase, the product's saved store becomes the store where that price was observed. A different purchase store without a price change affects only that purchase. Adding an older month's purchase does not set or replace today's saved price or create a false current price change; a new product created from an old receipt has no saved price until one is set separately. The saved price can always be edited directly on the product page.

When a saved product price is first set, the app records its baseline with the date and time; the baseline is included so later increases have a reference price. A different price confirmed while adding a current-month purchase, or an edit on the product page, appends a history row in the same database transaction as the product update; an unchanged price adds no row. Each later change counts toward Inflation by default. It can be marked **Not inflation** when saving or later from the product's history, without changing the saved price or any purchase. The product details page derives **last price changed** from the latest change row, including excluded ones, or shows **price first set** if there has been no change. Dates and times display in the device's local time. Past history rows are kept when the current price changes.

The purchase entry records its brand and either its direct category or subcategory at purchase time. Changing a product's brand or subcategory later does not change older entries. For an entry linked to a subcategory, category analytics derive the subcategory's **current** parent, so moving Milk to a new category reclassifies all its past totals without rewriting purchases. A directly categorized entry keeps its own category. The purchase correction form can fix a mistaken product or grouping on an entry. Product and store names remain linked to catalog records so a spelling correction appears everywhere, including older entries. Monthly totals are calculated from purchase entries, never stored in a second totals table. Catalog records referenced by purchases or price history are archived rather than deleted.

Quantity is a positive whole number of items and price is the amount for one item; line total is quantity × unit price. Prices are stored as integer baisa to avoid floating-point totals.

For matching, standard retail UPC/EAN barcodes that represent the same product number share one lookup key, while QR content is treated as an opaque code. The app never opens a scanned QR URL. Retail codes are checked for valid length and check digit; QR content is limited to a reasonable length and shown before saving. A kind/key pair cannot identify two products. The first-time scan save is one transaction: either product, new brand/category/store, and purchase all save, or none do.

The app-facing operations are `lookupCode(code)`, `saveProduct(input)`, `getProductDetails(id)`, `getInflation(category, startMonth, endMonth)`, `setPriceChangeInflationStatus(changeId, included)`, `saveBrand(name)`, `saveCategory(name)`, `saveSubcategory(name, parentCategory)`, `setPrimaryBrand(subcategory, brand)`, `saveStore(name)`, `recordPurchase(input)`, `updatePurchase(id, changes)`, `deletePurchase(id)`, `getMonth(month)`, and `getHomeAnalytics(month)`. Product and purchase inputs carry the price-change **Not inflation** choice when a price changes. `saveSubcategory` also changes its parent when moved and keeps the same subcategory ID. `setPrimaryBrand` accepts only a brand with an active product in that subcategory. `saveProduct` records price changes atomically. `recordPurchase` creates any new catalog records, updates a known product's current price when appropriate, appends the price-history row, and records the purchase in one transaction. Code normalization and SQL stay behind this boundary.

## Inflation calculations

For each product, the selected start price is the latest included saved price known at the start of the chosen range, or its first included price recorded inside the range. The end price is the latest included saved price recorded through the last day of the selected end month. The page lists products with at least two included prices and a positive net change, sorted by the OMR increase. It shows `end − start` in OMR and `(end − start) ÷ start` as a percentage; a zero start price has no percentage. An excluded change is skipped as both a chart point and comparison baseline. Products with only one included price are shown in details but are not labeled as having increased. The category filter uses each product's current category, so moving its subcategory also reclassifies past price points in that filter. Product details list the full dated price history, including decreases, excluded changes, and the store saved with each price; charts use included prices only.

This page reflects prices entered into this app, not an official inflation index. A price change that was never recorded cannot appear in its trend.

## Screen data flow

```text
Camera or typed code → local code lookup → known product or new-product form
                                        → confirm purchase details
                                        → one SQLite transaction for purchase and any price change
                                        → selected-month list → Home analytics query

Edit product saved price → update product and append dated price-history row
                         → Inflation and product details read the new timeline
```

The monthly view and Home query the same purchase entries. Changing an entry's month, price, quantity, category, or store changes the relevant totals on the next read. Deleting an entry requires confirmation because it removes recorded spending.

## Design choice

Two shapes were compared. A pure catalog model stores only links in purchases; it is smaller but a product edit can silently change older purchases. A full purchase snapshot copies every product and store label into each entry; it preserves old labels but adds duplicated data and more rules for edits. The proposed design keeps paid price, brand, and category/subcategory link on each purchase. It preserves exact spending and provider history while letting a deliberate subcategory move reclassify past category totals. Product and store renames remain visible in old entries by design.

## Confirmed decisions

- Scanning supports both standard grocery UPC/EAN barcodes and QR codes.
- An unknown QR code opens manual product details on the same scanning page.
- The first version uses OMR only, with no currency selector or conversion.
- Quantity is a whole-item count; weights and volumes are outside the first version.
- Products can hold a saved price and store for new purchases; each purchase preserves its actual price and store when those product defaults change.
- Product saved-price changes keep dated history; the Inflation tab compares those prices by category and month and links to product details.
- Confirming a different price when adding a current-month purchase updates the product's saved price and Inflation history while preserving older purchases.
- A price change marked **Not inflation** remains in product history and the current saved price, but is excluded from Inflation charts and increase calculations.
- Categories contain movable subcategories that link products, so spending on Milk can include purchases from different brands while each entry keeps its exact product.
- A subcategory can have one current primary brand; it changes manual suggestions, while scans and purchases retain exact product and brand identity.
- Moving a subcategory to another category also moves its past spending and price-change points into the new category's reports.

## First implementation slice after approval

Set up the Expo project, SQLite schema, and code lookup/record-purchase boundary. Verify that an unknown scan plus inline brand/category/subcategory/store creates one complete purchase, a repeated scan cannot create a duplicate unintentionally, and rescanning a known product at 22.000 OMR after a 20.000 OMR purchase adds one dated price change while the older month stays at 20.000 OMR. Verify that **Not inflation** keeps that change in history but removes it from Inflation comparisons, switching Milk's primary brand leaves purchases intact, and moving Milk reclassifies its past category totals. Then build the screens around those operations.

No cloud account, cross-device sync, receipt import, or online product search is included in this first design. A local-only database can be lost if the app is uninstalled or the device is lost; export or backup should be designed before relying on it as the only long-term record.
