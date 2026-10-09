# Grocery tracker app design

**Status:** Final design for the first version. This document describes the app; no app implementation has started.

## Goal

Build an Expo app for recording groceries bought, the store, quantity, and price, then reviewing monthly spending. The app works offline and keeps its database on the device. A scan identifies a product already saved in the local catalog; for a new code, the user supplies the product details. There is no automatic online product lookup.

## Main navigation and pages

| Area | Pages and actions |
| --- | --- |
| Home | Analytics only: selected-month total, previous-month comparison, spending by category and subcategory, and spending by store. Values refresh after a purchase is added, edited, or removed. |
| Total Spending | Choose a year and month. See that month's total and every purchase entry, including repeat purchases of one product. The top-right **Add** action opens the purchase form. Each entry shows the exact product and brand, its category/subcategory, quantity, unit price, line total, and store; open an entry to correct or delete it. An older receipt can optionally include its purchase date and use **Apply inflation** to record its historical price. |
| Inflation | Filter by category and inclusive start/end month. See products whose counted recorded-price changes rose in that period, with their recorded price as of the selected end month, counted OMR increase, percentage increase, and a small price-over-time chart. History includes saved-price changes and explicitly applied old receipts. Changes marked **Not inflation** are omitted from charts and contribute zero to the increase. Tap a product to open its details. |
| Products | Search, view, add, and edit catalog products, including their saved price and store. Add with a scan or by typing a code; products without a code can also be added manually. A product can be saved without recording spending. Product details show brand, category/subcategory, linked products in that subcategory, codes, saved price/store, when the price last changed, its full price history with editable **Not inflation** marks, and purchases with their actual paid prices. |
| Brands | Dedicated list and add/rename page. |
| Categories | Dedicated list and add/rename page, showing each category's subcategories. |
| Subcategories | Dedicated list and add/rename page. A detail page shows linked products, the current primary brand, and spending by brand and product. Move a subcategory to another category without recreating it or its linked products. |
| Stores | A reusable store list in the local database. Choose or create a store from the purchase form; the Catalog area also provides a simple list to fix store names. |

The initial bottom tabs are **Home**, **Total Spending**, **Inflation**, and **Catalog**. Catalog links to the Products, Brands, Categories, Subcategories, and Stores pages. Inflation opens the same product details page as Catalog.

## Two ways to add a product

1. **Catalog only:** On Products, scan or type a code, enter a product name, choose or create its brand, category, and optional subcategory, and optionally save its current price and store. An unknown scan shows these manual fields on the same scanning page. Saving puts the product in the catalog for future scans. It does not change spending. A saved-price observation with an earlier historical reference offers **Not inflation** before saving, with included as the default; a baseline with no earlier observation has no exclusion choice. From the saved product, **Record purchase** can open the monthly purchase form if the user also bought it.
2. **While recording spending:** On Total Spending, choose a month and tap Add. Scan a code or search/select a product manually. A known code fills in the product identity, brand, category/subcategory, saved price, and saved store; the user confirms or changes the price and store for this purchase. For the current month, a changed price also updates the product's saved price/store and adds a dated price-history entry. The user can mark that change **Not inflation** before saving. An unknown code, including an unknown QR code, stays visible while the scanning page shows manual fields for product name, brand, category, optional subcategory, store, and price; missing reference values can be created there. The user enters a whole-item quantity, then saves. One save creates any new catalog records and the purchase together before returning to that month's list; current-month entries also set the new product's saved price and store.

For either flow, a denied camera permission or an unreadable label leaves manual code entry and product search available. A scan is handled once per form opening, and repeated Save taps cannot create duplicate purchases. A failed save retains the form values for correction/retry. Opening a new purchase form permits an intentional repeat purchase, because store and price can differ. Reuse the purchase form and scan component across entry points; a scan identifies a product and does not save spending by itself. Only mount the camera preview while its screen is focused.

Older receipts are spending-only by default. After saving one, **Apply inflation** can add its price to the historical timeline without changing today's saved price or store. The exact purchase date is optional, even when applying Inflation; the chosen year-month remains required. The rules below define repeated application, exclusion, corrections, and deletion.

## Categories, subcategories, and linked products

A category contains subcategories, and a subcategory links products that serve the same need. For example, **Dairy → Milk** can contain separate Mazoon Milk and Marai Milk products, each with its own code, brand, price history, and purchases. Category and subcategory are the only grouping levels; there is no separate product-group table. A product belongs to at most one subcategory; an ungrouped product can sit directly under a category. Spending on **Milk** adds the actual purchases of both products, while each purchase still identifies the exact brand and product bought.

Each subcategory can have one current primary brand that has at least one active product in that subcategory. Changing Milk's primary brand from Mazoon to Marai puts Marai's milk products first when the user chooses Milk manually; the user still chooses the exact product. Scanning a code always selects the scanned product, regardless of the primary brand. Switching the primary does not rewrite past purchases or price history. The primary brand is a current preference; purchase entries show which brand and product were actually bought in each month. If archiving, moving, or changing the brand of a product removes the last active product for Milk's primary brand, the same transaction clears that primary selection.

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
| Product code | Product ID, namespace (`retail` or `qr`), original code and scanner format, canonical lookup key; each namespace/key pair identifies one product, and one product may have more than one code |
| Product price history | ID, product ID, price in baisa, optional observed store ID, source (`saved_price` or `receipt`), effective year-month and optional local date, date/time recorded, included-in-Inflation flag, optional unique source purchase ID; a purchase can be linked to at most one observation of either source |
| Purchase entry | ID, product ID, brand ID at purchase time, store ID, chosen year-month, optional purchase date within that month, either a direct category ID or a subcategory ID at purchase time, quantity, unit price in baisa, creation time |

The product's saved price and store prefill future purchases. Each purchase keeps its own confirmed price and actual store. For example, buying a product at 20.000 OMR records 20.000 OMR in that month. Three months later, scanning it fills in the same product; changing the price to 22.000 OMR and saving records a new purchase at 22.000 OMR, updates the product's saved price, and adds a dated 20.000 → 22.000 OMR price change. The earlier 20.000 OMR purchase and monthly total stay intact. A normal correction changes the purchase only. An explicit **Apply inflation** action can also synchronize its receipt-sourced historical observation, as described below; it never rewrites a saved-price event.

When a changed price is saved with a current-month purchase, the product's saved store becomes the store where that price was observed. A different purchase store without a price change affects only that purchase. Current month is evaluated using the device's local calendar at save time. Adding an older month's purchase affects spending for that month only unless **Apply inflation** is explicitly used later. A new product created from an old receipt has no saved price, even if its receipt is applied to Inflation. Its first later current-month purchase or product-price edit sets the saved price and creates the first `saved_price` event. The saved price can always be edited directly on the product page.

One private saved-price writer belongs to the grocery boundary from the first implementation slice. Catalog edits and current-month purchase saves both use it. It compares against Product's saved price, never the latest mixed-history observation, and sets a first saved price or appends a changed saved price together with the Product update in one transaction; an unchanged price adds no row. Each event has source `saved_price`, its local effective date/month, and the actual recording timestamp. An event created by a purchase also retains that purchase's ID to prevent later applying the same receipt as a second observation. A price change defaults to included, with **Not inflation** available before either form saves. A store-only product edit changes the saved store but does not create a price event or rewrite an earlier event's observed store.

On product details, the user can switch any non-baseline history observation between **Included in inflation** and **Not inflation** at any time, in either direction. Changing the flag recalculates Inflation but does not change an observation's price/date, today's saved defaults, or any purchase amount. Excluded observations remain in full history and remain reference prices for subsequent changes. The earliest observation in historical order is the baseline and contributes no increase; it has no active flag control. Keep its stored inclusion value underneath (initially included), so an earlier receipt becoming the new baseline reveals the former baseline's existing classification rather than resetting it. Baseline status is derived from order, not permanently attached to the first inserted row.

Product details distinguish the observation's effective date/month from when it was recorded and label its source. **Price first set** and **last saved price changed** use only `saved_price` events in save order, including excluded ones; receipt observations cannot change these labels or today's saved defaults. Full history shows the store observed at each price event, not a separate history of store-only preference changes. Recording timestamps display in the device's local time.

### Apply inflation to an old receipt

- A normal old-receipt save creates no history observation. **Apply inflation** explicitly creates one receipt-sourced observation from that receipt's product, unit price, store, chosen month, and optional date. It defaults to included. Applying twice without changes must not create a second observation; at most one is linked to that receipt.
- If the purchase originally created a `saved_price` event when it was current, aging into a past month does not make it an unrecorded receipt. Show its existing history entry and inclusion control instead of creating another observation. Receipt Apply cannot edit/remove or backdate that saved-price event. Enforce the source-purchase uniqueness across both sources.
- An exact purchase date is optional and, when provided, must belong to the chosen month. Effective month/date stay attached to the observation; entering a March receipt in October affects March's history, not October's. A missing date is shown as month-only and does not block applying.
- Historical order is effective month, then actual day for dated observations, with undated observations after dated ones in that month, then stable recording order/ID for ties. This is an explicit approximation when the exact day is unknown, not an invented purchase date. Reapplying preserves recording order so it cannot move an unchanged observation among ties.
- Compare each observation with the immediately preceding actual observation, including excluded ones. With January at 2.000 OMR and an applied March receipt at 2.500 OMR, March contributes +0.500 OMR. A current saved price of 2.800 OMR stays 2.800 OMR. Without an earlier observation, March becomes the baseline and has no calculated increase yet.
- Switching an applied observation to **Not inflation** contributes zero but keeps its price in history as a reference. Switching it back includes it again. Reapplying a corrected receipt retains its existing inclusion flag; applying and classifying are separate actions.
- Ordinary receipt corrections update spending only and leave an applied observation unchanged. If the receipt and observation differ, show that difference beside **Apply inflation**. The edit form's Apply action explicitly saves the correction and updates its linked receipt observation together. Changes to price, product, store, month, or optional date are reflected in that observation and affected products' comparisons. An observation for a different product must not be left behind. Do not silently create a history observation just because the user saves a correction.
- Deletion requires confirmation. **Delete receipt only** preserves any applied observation and detaches its source purchase link; the history keeps its own product, price, store, and effective date/month. For a receipt with an applied receipt-sourced observation, the confirmation also offers **Delete and apply inflation**, clearly explained as deleting the receipt and removing that linked historical observation together. This explicit choice recalculates the remaining history; neither choice changes today's saved defaults. Deleting a purchase never deletes a `saved_price` event.
- The initial receipt Apply action is for older receipts. A later correction can move an already-applied observation to its corrected month, including the current month, only through explicit **Apply inflation**. It keeps the same observation ID/source and never creates a second current-price event. These receipt operations never invoke the saved-price writer.

The purchase entry records its brand and either its direct category or subcategory at purchase time. Changing a product's brand or subcategory later does not change older entries. For an entry linked to a subcategory, category analytics derive the subcategory's **current** parent, so moving Milk to a new category reclassifies all its past totals without rewriting purchases. A directly categorized entry keeps its own category. Subcategory spending uses these purchase links, not the products currently assigned to that subcategory. For example, moving a product from Milk to Yogurt leaves its old purchase in Milk; moving Milk itself reclassifies that purchase under Milk's new parent.

The purchase correction form can fix a mistaken product or grouping. Selecting a replacement product initializes its brand/grouping for confirmation; a quantity-only correction retains the entry's original identity fields. Product and store names remain linked to catalog records so a spelling correction appears everywhere. Monthly totals are calculated from purchase entries, never stored in a second totals table. Renames and moves identify existing records by ID, never by their old name.

Products are archived rather than deleted when referenced by purchases or history. Archive does not hide historical spending or Inflation observations, release product codes, or invalidate old links. A scan of an archived product shows that existing product and offers explicit reactivation with the same ID before a new purchase; it cannot become an unknown-code creation flow. Reference pages support add/rename (and subcategory move), not destructive deletion in v1.

Quantity is a positive whole number of items and price is the amount for one item; line total is quantity × unit price. Parse OMR text into integer baisa without binary floating-point conversion of the decimal input. Display three decimal places. Zero price is valid; negative prices, more than three fractional digits, non-whole/non-positive quantities, and amounts or computed totals outside JavaScript's safe integer range are rejected rather than silently rounded.

Typed and scanned codes use the same normalization from the first typed-code feature. Equivalent UPC/EAN representations share a canonical key in one `retail` namespace; preserve the scanner format separately, rather than making UPC and EAN different identity namespaces. Support UPC-A, UPC-E, EAN-8, and EAN-13 with length/check-digit checks and UPC-E expansion before canonical comparison. Ambiguous typed eight-digit retail codes need a format choice instead of guessing. QR content uses its own `qr` namespace and is matched as opaque text without opening URLs. Numeric QR content must not be confused with a retail code. QR input is nonempty, limited to 4,096 UTF-8 bytes, and shown before saving. A namespace/key pair cannot identify two products, even if one is archived. First-time save is one transaction: either product, any new brand/category/subcategory/store, and purchase all save, or none do.

### Database lifecycle and ownership

- Initialize one local database before mounting data-dependent screens. Use versioned, transactional schema migrations; startup waits for success and exposes a retryable failure. Never delete or reset the database to recover from an initialization or migration error. Existing data must survive upgrades.
- Enable foreign keys on every connection. Use database constraints for valid references, exactly one direct-category/subcategory link per product and purchase, valid integer amounts/quantities, unique canonical codes, and at most one observation per source purchase across both history sources. Preserve history on ordinary purchase deletion by detaching its nullable source link rather than cascading deletion.
- Use bound parameters for user input. On native platforms, transaction-owned writes use the transaction object passed to Expo SQLite's exclusive transaction API; unrelated async work must not join the save. Handle lock/constraint failures without clearing the draft or reporting a successful save. Validation and transaction logic live behind the grocery boundary, not in screen-specific SQL.
- Reference names are trimmed, nonblank, and compared consistently for duplicates; the same rule applies to dedicated pages and inline creation. Category, brand, and store names are unique within their table; subcategory names are unique within their parent category. A rename/move collision leaves all records unchanged.
- Keep purchase months and effective history months as validated `YYYY-MM` values, optional receipt dates as valid `YYYY-MM-DD`, and recording timestamps separately. A saved-price event captures its device-local effective month/date when saved. Later time-zone changes do not reassign an observation's recorded month.
- Product defaults have one writer and are never derived from the last inserted history row: a late-entered historical receipt can be the newest row without being today's price. Queries derive monthly totals directly from purchases and historical comparisons directly from ordered observations.

The app-facing operations include `lookupCode(code)`, `saveProduct(input)`, `getProductDetails(id)`, `getInflation(category, startMonth, endMonth)`, `setPriceChangeInflationStatus(changeId, included)`, `saveBrand({ id?, name })`, `saveCategory({ id?, name })`, `saveSubcategory({ id?, name, parentCategoryId })`, `setPrimaryBrand(subcategoryId, brandIdOrNull)`, `saveStore({ id?, name })`, `recordPurchase(input)`, `applyReceiptInflation(purchaseId)`, `updatePurchase(id, changes, { applyInflation: false })`, `deletePurchase(id, { applyInflation: false })`, `getMonth(month)`, and `getHomeAnalytics(month)`, plus list/search and archive/reactivation operations needed by their screens. Optional IDs mean create when absent and update that exact record when present. Inline inputs select an existing ID or supply a creation draft; screens do not pre-save references separately.

Product and new-purchase inputs carry the **Not inflation** choice for changed current prices. `saveSubcategory` preserves ID when moved; `setPrimaryBrand` validates active membership. `saveProduct` and `recordPurchase` share the saved-price writer, and `recordPurchase` commits references, product, purchase, and any current-price/history change together. `applyReceiptInflation` creates/updates only a receipt observation. Correction/deletion defaults to spending-only; `{ applyInflation: true }` is sent only for the explicit Apply action and atomically synchronizes/removes the receipt observation as specified above. No public operation exposes SQL or a transaction handle to screens.

## Inflation calculations

Order the product's complete history (saved-price events and applied receipt observations) by the effective period rule above, and find each observation's **immediately preceding actual price** before filtering months or inclusion flags. An included non-baseline observation contributes its signed difference; an excluded one contributes zero but remains the next observation's reference. The selected inclusive month range sums contributions whose effective months fall within that range, not when a historical receipt was entered. Adding, explicitly correcting/removing, or reclassifying an observation recalculates affected comparisons, including the following observation's delta.

The page lists products with a positive counted net change, sorted by that OMR amount. Its percentage is the counted net change divided by the actual price immediately before the first included non-baseline observation in the range; a zero reference price has no percentage. The page separately shows the actual recorded price as of the selected end month, including excluded observations. Label this **Price at period end**; it can differ from today's saved price and from the chart's last included point. Catalog defaults and **last saved price changed** continue to use only actual saved-price updates.

For example, 20.000 → 22.000 OMR marked **Not inflation**, followed by an included 22.000 → 23.000 OMR change, contributes **1.000 OMR** to Inflation, not 3.000 OMR. The percentage for a range containing only that included change is `1 ÷ 22`. The chart plots actual prices at included non-baseline observations within the range, plus the baseline if it falls in the range. It omits excluded points and leaves a gap across an excluded observation rather than implying that movement counts as inflation. Month-only observations are labeled accordingly; do not display an invented exact date. A point's counted change uses its preceding actual price, visible in full product history, even when that predecessor is excluded or outside the selected range. The category filter uses each product's current category, so moving its subcategory also reclassifies past observations. Product details include decreases, excluded observations, their sources, and observed stores.

This page reflects prices entered into this app, not an official inflation index. A price change that was never recorded cannot appear in its trend.

## Screen data flow

```text
Camera or typed code → local code lookup → known product or new-product form
                                        → confirm purchase details
                                        → one SQLite transaction for purchase and any price change
                                        → selected-month list → Home analytics query

Edit product saved price → update product and append dated price-history row
                         → Inflation and product details read the new timeline

Save old receipt → spending only
Apply inflation → upsert its historical observation → recompute historical comparisons
                → today's saved price/store remain unchanged
```

The monthly view and Home query the same purchase entries. Changing an entry's month, price, quantity, category, or store changes the relevant totals. After a committed mutation, affected visible screens refresh their queries; returning to an existing tab/detail also refreshes its reads. Inflation refreshes after Apply, exclusion changes, and relevant category moves. Do not maintain a second persisted or manually synchronized copy of totals in UI state. Deleting an entry requires confirmation because it removes recorded spending.

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
- A price change marked **Not inflation** remains in product history and the current saved price, but contributes zero to Inflation; its actual price is the baseline for the next change. Any past change can be switched in or out of Inflation later.
- Categories contain movable subcategories that link products, so spending on Milk can include purchases from different brands while each entry keeps its exact product.
- A subcategory can have one current primary brand; it changes manual suggestions, while scans and purchases retain exact product and brand identity.
- Moving a subcategory to another category also moves its past spending and price-change points into the new category's reports.
- Old receipts are spending-only by default. **Apply inflation** deliberately adds or synchronizes a historical observation without replacing today's saved price/store. Its purchase date is optional; its month is required.
- Excluding an applied receipt keeps its price in history as a reference. Normal receipt corrections/deletions leave history alone; explicitly choosing **Apply inflation** applies the correction or removal to the linked receipt observation too.

## Verification with each feature

Each issue ships with the smallest meaningful behavior check for its new data rule. Baseline form accessibility, labeled controls, useful validation, and recoverable save errors are required as each screen is built. #17 is the complete usability/accessibility audit, and #18 is final integration/device verification, not the first time correctness is checked.

- #1 verifies exact baisa arithmetic, constraints, transaction rollback, duplicate-submit prevention, and persistence after reopening. Later schema changes add a migration test that preserves existing records, including a recoverable failure.
- #3 verifies shared price writes and typed-code identity; #6/#7 also verify real-device scanning, permission denial, focus lifecycle, and repeated camera callbacks. Do not substitute simulator-only checks for the phone camera.
- #4/#9/#15 verify purchase snapshot grouping and paid amounts survive catalog edits. #10/#11 verify baseline/change/no-change behavior, store-only edits, pre-save exclusion, and current-month versus older-month entry.
- #12/#13 verify explicit historical Apply, optional dates and stable month-only order, repeated application, exclusion/reinclusion, predecessor prices outside the range, signed decreases, zero references, and correction/deletion with and without Apply. An inserted earlier receipt can change the chronological baseline and the next event's delta, but never today's saved defaults.
- #14 verifies clearing a primary brand after archive/brand/subcategory changes; #16 verifies historical category reclassification. #18 repeats the complete offline workflow on supported platforms and documents installable test builds.

## First implementation slice

Start with [issue #1](https://github.com/saudm6/grocery-tracking-app/issues/1): initialize Expo Router and the local database, choose a month, manually enter one product and purchase with inline references, save atomically, and see the correct total after reopening offline. Establish the shared saved-price writer and database safeguards in this slice. Camera scanning, historical Apply, Inflation screens, primary brands, and category moves follow in the [implementation backlog](../../implementation-backlog.md); they are not prerequisites for finishing #1.

No cloud account, cross-device sync, automated receipt import, or online product search is included in this first design. Manual old-receipt entry and explicit historical Apply are included. A local-only database can be lost if the app is uninstalled or the device is lost; export or backup should be designed before relying on it as the only long-term record.
