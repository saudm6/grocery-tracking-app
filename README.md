# grocery-tracking-app

Record manual grocery purchases offline in an Expo Router app. Choose a month in **Total Spending**, tap **Add**, and enter a product, optional brand, category, store, quantity, and OMR unit price. One save creates the purchase and missing catalog references together.

Use Node 22.18 or newer. Install with `npm ci`, then start with `npm start`. Open the app in SDK 57-compatible Expo Go on Android or iOS. The development bundle must be loaded once before trying the app offline. Production native builds contain their own bundle. Web is outside this first slice.

The SQLite file `grocery.db` stays on the device. Prices use integer baisa and display three decimal places. Current-month purchases set product defaults and dated saved-price history. Older receipts affect spending only. A save failure keeps the form for retry. Startup failures offer Retry and never reset the database.

Run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run bundle` before opening a PR. Tests run the production grocery boundary against real Node SQLite, including exclusive connection foreign keys, failed-save rollback, repeated submission, migration recovery, and reopening persistence. Native bundles verify SDK wiring. Device tests are still required to confirm actual offline restart and screen-reader behavior.

Home analytics, Inflation reports, catalog management, codes, and scanning follow in later issues. Their tabs currently explain that status.

Uninstalling the app or losing the device can lose local records. This version has no backup or cloud synchronization.

First-version design: [Grocery tracker app design](docs/superpowers/specs/2026-10-09-grocery-tracker-design.md).

Implementation plan: [First-version backlog](docs/implementation-backlog.md).
