import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { test } from 'node:test';
import type { SQLiteBindValue } from 'expo-sqlite';
import { normalizeCode, type CodeInput } from './code';
import { createGrocery, formatOMR, initializeDatabase, lineTotal, parseOMR, parseQuantity, referenceNameKey, validateDate, validateMonth, type Database, type Executor, type Grouping, type ProductInput, type PurchaseInput } from './grocery';
import { migrations } from './schema';
import { createSubmission } from './submission';

function executor(connection: DatabaseSync): Executor {
  const bindings = (values: SQLiteBindValue[]): SQLInputValue[] => values.map((value) => typeof value === 'boolean' ? Number(value) : value instanceof ArrayBuffer ? new Uint8Array(value) : value);
  return {
    async execAsync(sql) { connection.exec(sql); },
    async runAsync(sql, ...values) {
      const result = connection.prepare(sql).run(...bindings(values));
      return { lastInsertRowId: Number(result.lastInsertRowid), changes: Number(result.changes) };
    },
    async getFirstAsync<T>(sql: string, ...values: SQLiteBindValue[]) { const row = connection.prepare(sql).get(...bindings(values)); return row ? { ...row } as T : null; },
    async getAllAsync<T>(sql: string, ...values: SQLiteBindValue[]) { return connection.prepare(sql).all(...bindings(values)).map((row) => ({ ...row })) as T[]; },
  };
}
function open(path: string) {
  const connection = new DatabaseSync(path, { enableForeignKeyConstraints: false });
  const db: Database = {
    ...executor(connection),
    async withExclusiveTransactionAsync(work) {
      const transaction = new DatabaseSync(path, { enableForeignKeyConstraints: false });
      try {
        transaction.exec('BEGIN');
        await work(executor(transaction));
        transaction.exec('COMMIT');
      } catch (error) {
        transaction.exec('ROLLBACK');
        throw error;
      } finally { transaction.close(); }
    },
  };
  return { db, close: () => connection.close() };
}
async function fixture(versions: readonly string[] = migrations) {
  const folder = mkdtempSync(join(tmpdir(), 'grocery-'));
  const path = join(folder, 'grocery.db');
  const { db, close } = open(path);
  await initializeDatabase(db, versions);
  return { db, path, close, cleanup: () => { close(); rmSync(folder, { recursive: true }); } };
}
const now = () => new Date(2026, 9, 9, 12);
const input = (changes: Partial<PurchaseInput> = {}): PurchaseInput => ({
  product: { name: 'Milk', brand: { name: 'Mazoon' }, grouping: { category: { name: 'Dairy' } } },
  store: { name: 'Local store' }, month: '2026-10', quantity: '3', unitPrice: '0.001', ...changes,
});

test('OMR and quantity boundaries preserve exact baisa and reject unsafe or invalid input', () => {
  assert.equal(lineTotal(parseQuantity('3'), parseOMR('0.001')), 3);
  assert.equal(parseOMR('0'), 0);
  assert.equal(parseOMR('20.000'), 20000);
  assert.equal(parseOMR('9007199254740.991'), Number.MAX_SAFE_INTEGER);
  assert.equal(formatOMR(3), '0.003');
  assert.equal(formatOMR(0), '0.000');
  assert.equal(formatOMR(Number.MAX_SAFE_INTEGER), '9007199254740.991');
  for (const price of ['-1', '1.0001', '1e3', 'NaN', '', '9007199254740.992']) assert.throws(() => parseOMR(price));
  for (const quantity of ['0', '-1', '1.5', '1e3', '', '9007199254740992']) assert.throws(() => parseQuantity(quantity));
  assert.throws(() => lineTotal(2, Number.MAX_SAFE_INTEGER));
});
test('calendar input accepts month-only receipts and real dates within the chosen month', () => {
  assert.equal(validateMonth('2026-10'), '2026-10');
  assert.equal(validateDate(undefined, '2026-10'), null);
  assert.equal(validateDate('2024-02-29', '2024-02'), '2024-02-29');
  assert.throws(() => validateDate('2026-02-29', '2026-02'));
  assert.throws(() => validateDate('2026-04-31', '2026-04'));
  for (const month of ['2026-00', '2026-13', '0000-01', '26-10']) assert.throws(() => validateMonth(month));
  for (const date of ['2026-02-29', '2026-02-30', '2026-10-00', '2026-11-01', '2026-10-9']) assert.throws(() => validateDate(date, '2026-10'));
});
test('purchase labels, exact total, current baseline, and records survive database reopening', async () => {
  const f = await fixture();
  try {
    const grocery = createGrocery(f.db, now);
    const purchaseId = await grocery.recordPurchase(input({ purchaseDate: '2026-10-05' }));
    assert.equal((await grocery.getMonth('2026-10')).total, 3);
    assert.deepEqual(await f.db.getFirstAsync('SELECT saved_price, saved_store_id FROM products'), { saved_price: 1, saved_store_id: 1 });
    assert.deepEqual(await f.db.getFirstAsync('SELECT source, price, effective_month, effective_date, source_purchase_id FROM price_history'), { source: 'saved_price', price: 1, effective_month: '2026-10', effective_date: '2026-10-09', source_purchase_id: purchaseId });
    const reopened = open(f.path);
    try {
      await initializeDatabase(reopened.db);
      const report = await createGrocery(reopened.db, now).getMonth('2026-10');
      assert.equal(report.total, 3);
      assert.deepEqual(report.purchases[0], { id: purchaseId, productId: 1, product: 'Milk', brand: 'Mazoon', category: 'Dairy', subcategory: null, store: 'Local store', month: '2026-10', purchaseDate: '2026-10-05', quantity: 3, unitPrice: 1, lineTotal: 3 });
    } finally { reopened.close(); }
  } finally { f.cleanup(); }
});
test('older receipts leave saved defaults unset, while current changes use one private writer', async () => {
  const f = await fixture();
  try {
    const grocery = createGrocery(f.db, now);
    await grocery.recordPurchase(input({ month: '2026-09', unitPrice: '2', quantity: '1' }));
    assert.deepEqual(await f.db.getFirstAsync('SELECT saved_price, saved_store_id FROM products'), { saved_price: null, saved_store_id: null });
    assert.equal((await f.db.getAllAsync('SELECT * FROM price_history')).length, 0);
    const baseline = await grocery.recordPurchase(input({ product: { id: 1 }, store: { id: 1 }, unitPrice: '2', quantity: '1', notInflation: true }));
    await grocery.recordPurchase(input({ product: { id: 1 }, store: { name: 'Other store' }, unitPrice: '2', quantity: '1' }));
    assert.deepEqual(await f.db.getFirstAsync('SELECT saved_price, saved_store_id FROM products'), { saved_price: 2000, saved_store_id: 1 });
    const change = await grocery.recordPurchase(input({ product: { id: 1 }, store: { id: 2 }, unitPrice: '2.500', quantity: '1', notInflation: true }));
    assert.deepEqual(await f.db.getAllAsync('SELECT price, included, source_purchase_id FROM price_history ORDER BY id'), [{ price: 2000, included: 1, source_purchase_id: baseline }, { price: 2500, included: 0, source_purchase_id: change }]);
    assert.equal((await grocery.getMonth('2026-09')).total, 2000);
    assert.deepEqual(await f.db.getFirstAsync('SELECT saved_price, saved_store_id FROM products'), { saved_price: 2500, saved_store_id: 2 });
  } finally { f.cleanup(); }
});
test('inline creation rolls back after failure, rejects normalized duplicates, and reuses selected IDs', async () => {
  const f = await fixture();
  try {
    const grocery = createGrocery(f.db, now);
    await f.db.execAsync("CREATE TRIGGER reject_purchase BEFORE INSERT ON purchases BEGIN SELECT RAISE(ABORT, 'injected failure'); END;");
    await assert.rejects(grocery.recordPurchase(input()), /injected failure/);
    for (const table of ['brands', 'categories', 'stores', 'products', 'purchases', 'price_history']) assert.equal((await f.db.getAllAsync(`SELECT * FROM ${table}`)).length, 0, table);
    await f.db.execAsync('DROP TRIGGER reject_purchase');
    await grocery.recordPurchase(input());
    await assert.rejects(grocery.recordPurchase(input({ product: { name: 'Yogurt', brand: { name: ' MAZOON ' }, grouping: { category: { name: 'New category that must not remain' } } } })), /already exists/);
    const refs = await grocery.listReferences();
    assert.equal(referenceNameKey(' MAZOON '), refs.brands[0].nameKey);
    await grocery.recordPurchase(input({ product: { name: 'Yogurt', brand: { id: refs.brands[0].id }, grouping: { category: { id: refs.categories[0].id } } }, store: { id: refs.stores[0].id } }));
    for (const table of ['brands', 'categories', 'stores']) assert.equal((await f.db.getAllAsync(`SELECT * FROM ${table}`)).length, 1);
    await assert.rejects(grocery.recordPurchase(input({ unitPrice: '-1' })));
    assert.equal((await grocery.getMonth('2026-10')).purchases.length, 2);
  } finally { f.cleanup(); }
});
test('dedicated reference creates and ID renames refresh labels while preserving purchases, defaults and history after reopening', async () => {
  const f = await fixture();
  try {
    const grocery = createGrocery(f.db, now);
    const brandId = await grocery.saveBrand({ name: ' Mazoon ' });
    const storeId = await grocery.saveStore({ name: ' Local store ' });
    assert.equal(brandId, 1);
    assert.equal(storeId, 1);
    assert.deepEqual(await grocery.listReferences(), { brands: [{ id: 1, name: 'Mazoon', nameKey: 'mazoon' }], stores: [{ id: 1, name: 'Local store', nameKey: 'local store' }], categories: [], subcategories: [] });
    await grocery.recordPurchase(input({ product: { name: 'Milk', brand: { id: brandId }, grouping: { category: { name: 'Dairy' } } }, store: { id: storeId }, month: '2026-09', quantity: '2', unitPrice: '2.000' }));
    await grocery.recordPurchase(input({ product: { id: 1 }, store: { id: storeId } }));
    assert.deepEqual(await f.db.getAllAsync('SELECT id, product_id, brand_id, store_id, quantity, unit_price FROM purchases ORDER BY id'), [
      { id: 1, product_id: 1, brand_id: 1, store_id: 1, quantity: 2, unit_price: 2000 },
      { id: 2, product_id: 1, brand_id: 1, store_id: 1, quantity: 3, unit_price: 1 },
    ]);
    assert.deepEqual(await f.db.getFirstAsync('SELECT brand_id, saved_price, saved_store_id FROM products'), { brand_id: 1, saved_price: 1, saved_store_id: 1 });
    const purchases = await f.db.getAllAsync('SELECT * FROM purchases ORDER BY id');
    const products = await f.db.getAllAsync('SELECT * FROM products ORDER BY id');
    const history = await f.db.getAllAsync('SELECT * FROM price_history ORDER BY id');
    assert.equal(await grocery.saveBrand({ id: brandId, name: ' MAZOON ' }), brandId);
    assert.equal(await grocery.saveBrand({ id: brandId, name: ' Mazoon Dairy ' }), brandId);
    assert.equal(await grocery.saveStore({ id: storeId, name: ' Neighborhood market ' }), storeId);
    assert.deepEqual(await f.db.getAllAsync('SELECT * FROM purchases ORDER BY id'), purchases);
    assert.deepEqual(await f.db.getAllAsync('SELECT * FROM products ORDER BY id'), products);
    assert.deepEqual(await f.db.getAllAsync('SELECT * FROM price_history ORDER BY id'), history);
    const reopened = open(f.path);
    try {
      await initializeDatabase(reopened.db);
      const saved = createGrocery(reopened.db, now);
      assert.deepEqual(await saved.listReferences(), { brands: [{ id: 1, name: 'Mazoon Dairy', nameKey: 'mazoon dairy' }], stores: [{ id: 1, name: 'Neighborhood market', nameKey: 'neighborhood market' }], categories: [{ id: 1, name: 'Dairy', nameKey: 'dairy' }], subcategories: [] });
      const old = await saved.getMonth('2026-09');
      assert.equal(old.total, 4000);
      assert.deepEqual(old.purchases[0], { id: 1, productId: 1, product: 'Milk', brand: 'Mazoon Dairy', category: 'Dairy', subcategory: null, store: 'Neighborhood market', month: '2026-09', purchaseDate: null, quantity: 2, unitPrice: 2000, lineTotal: 4000 });
      const current = await saved.getMonth('2026-10');
      assert.equal(current.total, 3);
      assert.equal(current.purchases[0].brand, 'Mazoon Dairy');
      assert.equal(current.purchases[0].store, 'Neighborhood market');
    } finally { reopened.close(); }
  } finally { f.cleanup(); }
});
test('dedicated and inline names share blank and normalized duplicate rejection without changing records', async () => {
  const f = await fixture();
  try {
    const grocery = createGrocery(f.db, now);
    await grocery.recordPurchase(input());
    const brandNames = [' MAZOON ', 'Ｍａｚｏｏｎ'];
    const storeNames = [' LOCAL STORE ', 'Ｌｏｃａｌ ｓｔｏｒｅ'];
    for (const name of ['', ' \t\n ']) {
      await assert.rejects(grocery.saveBrand({ name }), /blank/);
      await assert.rejects(grocery.saveStore({ name }), /blank/);
      await assert.rejects(grocery.saveBrand({ id: 1, name }), /blank/);
      await assert.rejects(grocery.saveStore({ id: 1, name }), /blank/);
      await assert.rejects(grocery.recordPurchase(input({ product: { name: 'Invalid brand', brand: { name }, grouping: { category: { id: 1 } } }, store: { id: 1 } })), /blank/);
      await assert.rejects(grocery.recordPurchase(input({ product: { id: 1 }, store: { name } })), /blank/);
    }
    for (const name of brandNames) {
      await assert.rejects(grocery.saveBrand({ name }), /already exists/);
      await assert.rejects(grocery.recordPurchase(input({ product: { name: 'Duplicate brand', brand: { name }, grouping: { category: { id: 1 } } }, store: { id: 1 } })), /already exists/);
    }
    for (const name of storeNames) {
      await assert.rejects(grocery.saveStore({ name }), /already exists/);
      await assert.rejects(grocery.recordPurchase(input({ product: { name: 'Must roll back', brand: { id: 1 }, grouping: { category: { id: 1 } } }, store: { name } })), /already exists/);
    }
    const otherBrand = await grocery.saveBrand({ name: 'Other brand' });
    const otherStore = await grocery.saveStore({ name: 'Other store' });
    await assert.rejects(grocery.saveBrand({ id: otherBrand, name: ' MAZOON ' }), /already exists/);
    await assert.rejects(grocery.saveStore({ id: otherStore, name: ' LOCAL STORE ' }), /already exists/);
    for (const recordId of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, 999]) {
      await assert.rejects(grocery.saveBrand({ id: recordId, name: 'Missing brand' }), /valid saved record|no longer exists/);
      await assert.rejects(grocery.saveStore({ id: recordId, name: 'Missing store' }), /valid saved record|no longer exists/);
    }
    assert.deepEqual(await grocery.listReferences(), { brands: [{ id: 1, name: 'Mazoon', nameKey: 'mazoon' }, { id: 2, name: 'Other brand', nameKey: 'other brand' }], stores: [{ id: 1, name: 'Local store', nameKey: 'local store' }, { id: 2, name: 'Other store', nameKey: 'other store' }], categories: [{ id: 1, name: 'Dairy', nameKey: 'dairy' }], subcategories: [] });
    assert.equal((await f.db.getAllAsync('SELECT * FROM products')).length, 1);
    assert.equal((await grocery.getMonth('2026-10')).total, 3);
    assert.equal(await grocery.saveStore({ name: 'Mazoon' }), 3);
    assert.equal(await grocery.saveBrand({ name: 'Local store' }), 3);
  } finally { f.cleanup(); }
});
test('failed brand and store renames roll back their labels and linked writes, then permit retry', async () => {
  const f = await fixture();
  try {
    const grocery = createGrocery(f.db, now);
    await grocery.recordPurchase(input());
    for (const table of ['brands', 'stores'] as const) {
      await f.db.execAsync(`CREATE TRIGGER reject_rename AFTER UPDATE ON ${table} BEGIN UPDATE purchases SET unit_price = 9; SELECT RAISE(ABORT, 'injected rename failure'); END;`);
      await assert.rejects(table === 'brands' ? grocery.saveBrand({ id: 1, name: 'Corrected brand' }) : grocery.saveStore({ id: 1, name: 'Corrected store' }), /injected rename failure/);
      assert.deepEqual(await grocery.listReferences(), { brands: [{ id: 1, name: 'Mazoon', nameKey: 'mazoon' }], stores: [{ id: 1, name: 'Local store', nameKey: 'local store' }], categories: [{ id: 1, name: 'Dairy', nameKey: 'dairy' }], subcategories: [] });
      assert.equal((await grocery.getMonth('2026-10')).total, 3);
      assert.deepEqual(await f.db.getFirstAsync('SELECT id, product_id, brand_id, store_id, quantity, unit_price FROM purchases'), { id: 1, product_id: 1, brand_id: 1, store_id: 1, quantity: 3, unit_price: 1 });
      assert.deepEqual(await f.db.getFirstAsync('SELECT saved_price, saved_store_id FROM products'), { saved_price: 1, saved_store_id: 1 });
      assert.deepEqual(await f.db.getFirstAsync('SELECT price, store_id, source_purchase_id FROM price_history'), { price: 1, store_id: 1, source_purchase_id: 1 });
      await f.db.execAsync('DROP TRIGGER reject_rename');
    }
    assert.equal(await grocery.saveBrand({ id: 1, name: 'Corrected brand' }), 1);
    assert.equal(await grocery.saveStore({ id: 1, name: 'Corrected store' }), 1);
    const purchase = (await grocery.getMonth('2026-10')).purchases[0];
    assert.equal(purchase.brand, 'Corrected brand');
    assert.equal(purchase.store, 'Corrected store');
    assert.equal(purchase.lineTotal, 3);
  } finally { f.cleanup(); }
});
test('dedicated reference submission saves once, retains a rejected name, and a fresh editor can save again', async () => {
  const f = await fixture();
  try {
    const grocery = createGrocery(f.db, now);
    const submit = createSubmission();
    await Promise.all([submit(() => grocery.saveStore({ name: 'First store' })), submit(() => grocery.saveStore({ name: 'First store' }))]);
    await submit(() => grocery.saveStore({ name: 'Second store' }));
    assert.deepEqual((await grocery.listReferences()).stores, [{ id: 1, name: 'First store', nameKey: 'first store' }]);
    const retry = createSubmission();
    const draft = { name: ' FIRST STORE ' };
    await assert.rejects(retry(() => grocery.saveStore(draft)), /already exists/);
    assert.equal(draft.name, ' FIRST STORE ');
    draft.name = 'Second store';
    assert.equal(await retry(() => grocery.saveStore(draft)), 2);
    assert.equal(await createSubmission()(() => grocery.saveBrand({ name: 'New brand' })), 1);
    assert.deepEqual((await grocery.listReferences()).stores, [{ id: 1, name: 'First store', nameKey: 'first store' }, { id: 2, name: 'Second store', nameKey: 'second store' }]);
  } finally { f.cleanup(); }
});
test('monthly aggregate overflow rejects a whole save without partial references', async () => {
  const f = await fixture();
  try {
    const grocery = createGrocery(f.db, now);
    await grocery.recordPurchase(input({ unitPrice: '9007199254740.991', quantity: '1' }));
    await assert.rejects(grocery.recordPurchase(input({ product: { name: 'New product', brand: { id: 1 }, grouping: { category: { id: 1 } } }, store: { name: 'Must roll back' } })), /month total/);
    assert.equal((await grocery.getMonth('2026-10')).total, Number.MAX_SAFE_INTEGER);
    assert.equal((await f.db.getAllAsync('SELECT * FROM stores')).length, 1);
    assert.equal((await f.db.getAllAsync('SELECT * FROM products')).length, 1);
  } finally { f.cleanup(); }
});
test('real SQLite enforces foreign keys on a fresh exclusive connection and shape/amount/date/identity constraints', async () => {
  const f = await fixture();
  try {
    const grocery = createGrocery(f.db, now);
    await assert.rejects(grocery.recordPurchase(input({ product: { name: 'Invalid grouping', brand: { name: 'Must roll back' }, grouping: { subcategory: { id: 999 } } } })), /no longer exists/);
    assert.equal((await f.db.getAllAsync('SELECT * FROM brands')).length, 0);
    await grocery.recordPurchase(input());
    for (const sql of [
      "INSERT INTO products(name, category_id, subcategory_id) VALUES ('Bad', NULL, NULL)",
      "UPDATE products SET category_id = 999 WHERE id = 1",
      "UPDATE purchases SET unit_price = -1 WHERE id = 1",
      "UPDATE purchases SET unit_price = 1.5 WHERE id = 1",
      "UPDATE purchases SET quantity = 0 WHERE id = 1",
      "UPDATE purchases SET quantity = 2, unit_price = 9007199254740991 WHERE id = 1",
      "UPDATE purchases SET month = '2026-13' WHERE id = 1",
      "UPDATE purchases SET purchase_date = '2026-10-32' WHERE id = 1",
      "INSERT INTO stores(name, name_key) VALUES ('Local store', 'local store')",
      "INSERT INTO price_history(product_id, price, source, effective_month, recorded_at, source_purchase_id) VALUES (1, 2, 'receipt', '2026-09', 'later', 1)",
    ]) await assert.rejects(f.db.execAsync(sql), /constraint|CHECK|UNIQUE|FOREIGN KEY/i, sql);
    await f.db.execAsync("INSERT INTO product_codes(product_id, namespace, original_code, canonical_key) VALUES (1, 'qr', 'opaque', 'opaque')");
    await assert.rejects(f.db.execAsync("INSERT INTO product_codes(product_id, namespace, original_code, canonical_key) VALUES (1, 'qr', 'opaque', 'opaque')"), /UNIQUE/);
    await f.db.execAsync('DELETE FROM purchases WHERE id = 1');
    assert.deepEqual(await f.db.getFirstAsync('SELECT source, source_purchase_id FROM price_history'), { source: 'saved_price', source_purchase_id: null });
  } finally { f.cleanup(); }
});
test('purchase identity snapshots survive catalog edits, and month queries use purchase grouping', async () => {
  const f = await fixture();
  try {
    const grocery = createGrocery(f.db, now);
    await grocery.recordPurchase(input());
    await f.db.execAsync("INSERT INTO categories(name, name_key) VALUES ('Other', 'other'); UPDATE products SET brand_id = NULL, category_id = 2, name = 'Renamed milk' WHERE id = 1;");
    const purchase = (await grocery.getMonth('2026-10')).purchases[0];
    assert.equal(purchase.category, 'Dairy');
    assert.equal(purchase.brand, 'Mazoon');
    assert.equal(purchase.product, 'Renamed milk');
    assert.equal(purchase.lineTotal, 3);
  } finally { f.cleanup(); }
});
test('failed versioned upgrade preserves old records and retries without resetting the database', async () => {
  const f = await fixture();
  try {
    await createGrocery(f.db, now).recordPurchase(input());
    await assert.rejects(initializeDatabase(f.db, [...migrations, 'CREATE TABLE upgrade_marker (id INTEGER); INVALID SQL;']));
    assert.deepEqual(await f.db.getFirstAsync('PRAGMA user_version'), { user_version: migrations.length });
    assert.equal((await f.db.getAllAsync("SELECT name FROM sqlite_master WHERE name = 'upgrade_marker'")).length, 0);
    assert.equal((await createGrocery(f.db, now).getMonth('2026-10')).total, 3);
    await initializeDatabase(f.db, [...migrations, 'CREATE TABLE upgrade_marker (id INTEGER);']);
    assert.deepEqual(await f.db.getFirstAsync('PRAGMA user_version'), { user_version: migrations.length + 1 });
    assert.equal((await createGrocery(f.db, now).getMonth('2026-10')).total, 3);
  } finally { f.cleanup(); }
});
test('exclusive setup failure in the no-write gap remains retryable with existing data intact', async () => {
  const f = await fixture();
  try {
    await createGrocery(f.db, now).recordPurchase(input());
    const faulty: Database = { ...f.db, withExclusiveTransactionAsync(work) {
      return f.db.withExclusiveTransactionAsync((tx) => work({ ...tx, async execAsync(sql) {
        if (sql.startsWith('COMMIT;')) { await tx.execAsync('COMMIT'); throw new Error('injected setup failure'); }
        await tx.execAsync(sql);
      } }));
    } };
    await assert.rejects(initializeDatabase(faulty), /no transaction is active/);
    await initializeDatabase(f.db);
    assert.equal((await createGrocery(f.db, now).getMonth('2026-10')).total, 3);
  } finally { f.cleanup(); }
});
test('suppressed taps leave the admitted submission pending until its save actually finishes', async () => {
  const pending: boolean[] = [];
  const submit = createSubmission((value) => pending.push(value));
  let finish: (() => void) | undefined;
  const saving = submit(() => new Promise<void>((resolve) => { finish = resolve; }));
  assert.deepEqual(pending, [true]);
  assert.equal(await submit(async () => { assert.fail('Duplicate save ran'); }), undefined);
  assert.deepEqual(pending, [true]);
  finish!();
  await saving;
  assert.deepEqual(pending, [true, false]);
});
test('repeated submit produces one purchase, failure permits retry, and a fresh form permits repeat purchase', async () => {
  const f = await fixture();
  try {
    const grocery = createGrocery(f.db, now);
    const draft = input();
    const submit = createSubmission();
    await Promise.all([submit(() => grocery.recordPurchase(draft)), submit(() => grocery.recordPurchase(draft))]);
    await submit(() => grocery.recordPurchase(draft));
    assert.equal((await grocery.getMonth('2026-10')).purchases.length, 1);
    const retry = createSubmission();
    await assert.rejects(retry(() => grocery.recordPurchase({ ...draft, unitPrice: '-1' })));
    assert.equal(draft.unitPrice, '0.001');
    await retry(() => grocery.recordPurchase(input({ product: { id: 1 }, store: { id: 1 } })));
    assert.equal((await grocery.getMonth('2026-10')).purchases.length, 2);
  } finally { f.cleanup(); }
});

const catalog = (changes: Partial<ProductInput> = {}): ProductInput => ({ name: 'Catalog milk', grouping: { category: { name: 'Dairy' } }, savedStore: null, ...changes });

async function storedState(db: Executor) {
  const state: Record<string, unknown[]> = {};
  for (const table of ['brands', 'categories', 'subcategories', 'stores', 'products', 'product_codes', 'purchases', 'price_history']) {
    state[table] = await db.getAllAsync(`SELECT * FROM ${table} ORDER BY id`);
  }
  return state;
}

test('categories and parent-scoped subcategories share name rules and stable transactional rename IDs', async () => {
  const f = await fixture();
  try {
    const grocery = createGrocery(f.db, now);
    assert.equal(await grocery.saveCategory({ name: ' Dairy ' }), 1);
    assert.equal(await grocery.saveCategory({ name: 'Other' }), 2);
    assert.equal(await grocery.saveSubcategory({ name: ' Milk ', parentCategoryId: 1 }), 1);
    assert.equal(await grocery.saveSubcategory({ name: 'Milk', parentCategoryId: 2 }), 2);
    assert.equal(await grocery.saveSubcategory({ name: 'Yogurt', parentCategoryId: 1 }), 3);
    await grocery.recordPurchase(input({ product: { name: 'Milk', grouping: { subcategory: { id: 1 } } } }));
    const baseline = await storedState(f.db);
    for (const name of ['', '  ', 'Bad\0name']) {
      await assert.rejects(grocery.saveCategory({ name }), /blank|NUL/);
      await assert.rejects(grocery.saveSubcategory({ name, parentCategoryId: 1 }), /blank|NUL/);
      await assert.rejects(grocery.saveSubcategory({ id: 1, name, parentCategoryId: 1 }), /blank|NUL/);
    }
    for (const name of [' MILK ', 'Ｍｉｌｋ']) await assert.rejects(grocery.saveSubcategory({ name, parentCategoryId: 1 }), /already exists/);
    await assert.rejects(grocery.saveCategory({ name: ' ＤＡＩＲＹ ' }), /already exists/);
    await assert.rejects(grocery.saveCategory({ id: 1, name: 'Other' }), /already exists/);
    await assert.rejects(grocery.saveCategory({ id: 999, name: 'Missing' }), /no longer exists/);
    await assert.rejects(grocery.saveSubcategory({ id: 999, name: 'Missing', parentCategoryId: 1 }), /no longer exists/);
    await assert.rejects(grocery.saveSubcategory({ id: 1, name: 'Milk', parentCategoryId: 2 }), /existing parent/);
    await assert.rejects(grocery.saveSubcategory({ id: 1, name: 'Yogurt', parentCategoryId: 1 }), /already exists/);
    for (const parentCategoryId of [0, 999]) await assert.rejects(grocery.saveSubcategory({ name: 'Missing parent', parentCategoryId }), /valid saved|no longer exists/);
    assert.deepEqual(await storedState(f.db), baseline);
    for (const table of ['categories', 'subcategories']) {
      await f.db.execAsync(`CREATE TRIGGER rename_failure AFTER UPDATE ON ${table} BEGIN UPDATE purchases SET unit_price = 99; SELECT RAISE(ABORT, 'rename failure'); END`);
      await assert.rejects(table === 'categories' ? grocery.saveCategory({ id: 1, name: 'Dairy corrected' }) : grocery.saveSubcategory({ id: 1, name: 'Milk corrected', parentCategoryId: 1 }), /rename failure/);
      assert.deepEqual(await storedState(f.db), baseline);
      await f.db.execAsync('DROP TRIGGER rename_failure');
    }
    assert.equal(await grocery.saveCategory({ id: 1, name: ' ＤＡＩＲＹ ' }), 1);
    assert.equal(await grocery.saveSubcategory({ id: 1, name: ' ＭＩＬＫ ', parentCategoryId: 1 }), 1);
    assert.deepEqual((await grocery.listReferences()).subcategories, [
      { id: 1, name: 'MILK', nameKey: 'milk', categoryId: 1, category: 'DAIRY' },
      { id: 3, name: 'Yogurt', nameKey: 'yogurt', categoryId: 1, category: 'DAIRY' },
      { id: 2, name: 'Milk', nameKey: 'milk', categoryId: 2, category: 'Other' },
    ]);
    assert.deepEqual((await grocery.getMonth('2026-10')).purchases[0], { id: 1, productId: 1, product: 'Milk', brand: null, category: 'DAIRY', subcategory: 'MILK', store: 'Local store', month: '2026-10', purchaseDate: null, quantity: 3, unitPrice: 1, lineTotal: 3 });
    assert.deepEqual((await storedState(f.db)).purchases, baseline.purchases);
    assert.deepEqual((await storedState(f.db)).price_history, baseline.price_history);
  } finally { f.cleanup(); }
});

test('catalog and purchase inline grouping drafts commit completely or roll back references, codes, defaults and history', async () => {
  const f = await fixture();
  try {
    const grocery = createGrocery(f.db, now);
    assert.equal(await grocery.saveProduct(catalog({ name: 'Inline catalog', brand: { name: 'Brand' }, grouping: { subcategory: { name: 'Milk', parentCategory: { name: 'Dairy' } } }, savedStore: { name: 'Market' }, savedPrice: '2.000', code: { format: 'qr', value: 'Inline\0QR' } })), 1);
    assert.deepEqual((await grocery.getProductDetails(1)).codes[0], { id: 1, namespace: 'qr', original: 'Inline\0QR', format: 'qr', key: 'Inline\0QR' });
    assert.equal((await grocery.getMonth('2026-10')).total, 0);
    const baseline = await storedState(f.db);
    const collision = catalog({ name: 'Collision', brand: { name: 'Rollback brand' }, grouping: { subcategory: { name: ' ＭＩＬＫ ', parentCategory: { id: 1 } } } });
    await assert.rejects(grocery.saveProduct(collision), /already exists/);
    await assert.rejects(grocery.recordPurchase(input({ product: { name: 'Collision', brand: { name: 'Rollback brand' }, grouping: collision.grouping }, store: { id: 1 } })), /already exists/);
    await assert.rejects(grocery.saveProduct(catalog({ name: 'Bad parent draft', grouping: { subcategory: { name: 'New child', parentCategory: { name: ' DAIRY ' } } } })), /already exists/);
    await assert.rejects(grocery.saveProduct(catalog({ name: 'Bad store', grouping: { subcategory: { name: 'New child', parentCategory: { name: 'Rollback parent' } } }, savedStore: { id: 999 } })), /no longer exists/);
    await assert.rejects(grocery.saveProduct(catalog({ name: 'Bad code owner', grouping: { subcategory: { name: 'New child', parentCategory: { name: 'Rollback parent' } } }, code: { format: 'qr', value: 'Inline\0QR' } })), /belongs to another/);
    assert.deepEqual(await storedState(f.db), baseline);
    await f.db.execAsync("CREATE TRIGGER history_failure AFTER INSERT ON price_history BEGIN UPDATE purchases SET unit_price = 99; SELECT RAISE(ABORT, 'history failure'); END");
    const grouped = { name: 'New product', brand: { name: 'New brand' }, grouping: { subcategory: { name: 'New child', parentCategory: { name: 'New parent' } } } };
    await assert.rejects(grocery.saveProduct(catalog({ ...grouped, savedStore: { name: 'New store' }, savedPrice: '3.000', code: { format: 'qr', value: 'New QR' } })), /history failure/);
    await assert.rejects(grocery.recordPurchase(input({ product: grouped, store: { name: 'New store' }, quantity: '2', unitPrice: '3.000' })), /history failure/);
    assert.deepEqual(await storedState(f.db), baseline);
    await f.db.execAsync('DROP TRIGGER history_failure');
    await grocery.recordPurchase(input({ product: { name: 'Known grouping', grouping: { subcategory: { id: 1 } } }, store: { id: 1 }, quantity: '2', unitPrice: '2.000' }));
    await grocery.recordPurchase(input({ product: grouped, store: { name: 'New store' }, quantity: '2', unitPrice: '3.000' }));
    assert.deepEqual((await grocery.listReferences()).subcategories, [
      { id: 1, name: 'Milk', nameKey: 'milk', categoryId: 1, category: 'Dairy' },
      { id: 2, name: 'New child', nameKey: 'new child', categoryId: 2, category: 'New parent' },
    ]);
    assert.equal((await grocery.getMonth('2026-10')).total, 10000);
    assert.deepEqual(await f.db.getAllAsync('SELECT id, product_id, source_purchase_id, price FROM price_history ORDER BY id'), [
      { id: 1, product_id: 1, source_purchase_id: null, price: 2000 },
      { id: 2, product_id: 2, source_purchase_id: 1, price: 2000 },
      { id: 3, product_id: 3, source_purchase_id: 2, price: 3000 },
    ]);
  } finally { f.cleanup(); }
});

test('one grouping is required at the boundary and SQLite independently preserves valid direct and subcategory links', async () => {
  const f = await fixture();
  try {
    const grocery = createGrocery(f.db, now);
    await grocery.saveCategory({ name: 'Dairy' });
    await grocery.saveSubcategory({ name: 'Milk', parentCategoryId: 1 });
    await grocery.saveStore({ name: 'Market' });
    await grocery.recordPurchase(input({ product: { name: 'Direct', grouping: { category: { id: 1 } } }, store: { id: 1 }, month: '2026-09', quantity: '1', unitPrice: '2.000' }));
    await grocery.recordPurchase(input({ product: { name: 'Child', grouping: { subcategory: { id: 1 } } }, store: { id: 1 }, month: '2026-09', quantity: '1', unitPrice: '1.500' }));
    const baseline = await storedState(f.db);
    for (const grouping of [{}, { category: { id: 1 }, subcategory: { id: 1 } }, { subcategory: { id: 1, name: 'Mixed' } }, { subcategory: { id: 1, parentCategory: { id: 1 } } }, { subcategory: { name: 'Missing parent' } }, { subcategory: { id: 999 } }]) {
      await assert.rejects(grocery.saveProduct(catalog({ name: 'Invalid', grouping: grouping as unknown as Grouping })));
      await assert.rejects(grocery.recordPurchase(input({ product: { name: 'Invalid', brand: { name: 'Rollback brand' }, grouping: grouping as unknown as Grouping }, store: { id: 1 } })));
      assert.deepEqual(await storedState(f.db), baseline);
    }
    for (const sql of [
      "INSERT INTO products(name, category_id, subcategory_id) VALUES ('Bad', 1, 1)",
      "INSERT INTO products(name) VALUES ('Bad')",
      'UPDATE products SET category_id = 1, subcategory_id = 1 WHERE id = 1',
      'UPDATE products SET category_id = NULL, subcategory_id = NULL WHERE id = 2',
      "INSERT INTO purchases(product_id, store_id, category_id, subcategory_id, month, quantity, unit_price, created_at) VALUES (1, 1, 1, 1, '2026-09', 1, 1, 'now')",
      "INSERT INTO purchases(product_id, store_id, month, quantity, unit_price, created_at) VALUES (1, 1, '2026-09', 1, 1, 'now')",
      'UPDATE purchases SET category_id = 1, subcategory_id = 1 WHERE id = 1',
      'UPDATE purchases SET category_id = NULL, subcategory_id = NULL WHERE id = 2',
    ]) await assert.rejects(f.db.execAsync(sql), /CHECK/);
    assert.deepEqual(await storedState(f.db), baseline);
    assert.deepEqual(await f.db.getAllAsync('SELECT id, category_id, subcategory_id FROM products ORDER BY id'), [{ id: 1, category_id: 1, subcategory_id: null }, { id: 2, category_id: null, subcategory_id: 1 }]);
    assert.equal((await grocery.getMonth('2026-09')).total, 3500);
    assert.equal((await grocery.getSubcategoryDetails(1)).total, 1500);
  } finally { f.cleanup(); }
});

test('subcategory current membership changes while recorded Milk and brand spending survive reassignment, archive, rename and reopening', async () => {
  const f = await fixture();
  try {
    const grocery = createGrocery(f.db, now);
    await grocery.saveBrand({ name: 'Mazoon' });
    await grocery.saveBrand({ name: 'Marai' });
    await grocery.saveStore({ name: 'Market' });
    await grocery.saveCategory({ name: 'Dairy' });
    await grocery.saveSubcategory({ name: 'Milk', parentCategoryId: 1 });
    await grocery.saveSubcategory({ name: 'Yogurt', parentCategoryId: 1 });
    for (const [name, brand] of [['Mazoon milk 1L', { id: 1 }], ['Marai milk 1L', { id: 2 }], ['Free milk', null]] as const) {
      await grocery.saveProduct(catalog({ name, brand, grouping: { subcategory: { id: 1 } }, savedStore: { id: 1 } }));
    }
    await grocery.recordPurchase(input({ product: { id: 1 }, store: { id: 1 }, month: '2026-09', quantity: '2', unitPrice: '2.000' }));
    await grocery.recordPurchase(input({ product: { id: 2 }, store: { id: 1 }, month: '2026-09', quantity: '1', unitPrice: '1.500' }));
    await grocery.recordPurchase(input({ product: { id: 3 }, store: { id: 1 }, month: '2026-09', quantity: '1', unitPrice: '0' }));
    const milk = await grocery.getSubcategoryDetails(1);
    assert.equal(milk.total, 5500);
    assert.deepEqual(milk.brands, [
      { brandId: null, brand: null, total: 0, products: [{ productId: 3, product: 'Free milk', total: 0 }] },
      { brandId: 2, brand: 'Marai', total: 1500, products: [{ productId: 2, product: 'Marai milk 1L', total: 1500 }] },
      { brandId: 1, brand: 'Mazoon', total: 4000, products: [{ productId: 1, product: 'Mazoon milk 1L', total: 4000 }] },
    ]);
    await grocery.saveProduct(catalog({ id: 1, name: 'Mazoon milk 1L', brand: { id: 2 }, grouping: { subcategory: { id: 2 } }, savedStore: { id: 1 } }));
    assert.deepEqual((await grocery.getSubcategoryDetails(1)).products.map((row) => row.id).sort(), [2, 3]);
    assert.deepEqual((await grocery.getSubcategoryDetails(2)).products, [{ id: 1, name: 'Mazoon milk 1L', brand: 'Marai', archived: false }]);
    assert.equal((await grocery.getSubcategoryDetails(1)).total, 5500);
    assert.deepEqual(await f.db.getFirstAsync('SELECT brand_id, category_id, subcategory_id, quantity, unit_price FROM purchases WHERE id = 1'), { brand_id: 1, category_id: null, subcategory_id: 1, quantity: 2, unit_price: 2000 });
    assert.equal((await grocery.getMonth('2026-09')).purchases.find((row) => row.id === 1)?.brand, 'Mazoon');
    await grocery.recordPurchase(input({ product: { id: 1 }, store: { id: 1 }, quantity: '3', unitPrice: '2.500' }));
    assert.equal((await grocery.getSubcategoryDetails(2)).total, 7500);
    await grocery.saveProduct(catalog({ id: 2, name: 'Marai milk 1L', brand: { id: 2 }, grouping: { category: { id: 1 } }, savedStore: { id: 1 } }));
    await grocery.recordPurchase(input({ product: { id: 2 }, store: { id: 1 }, quantity: '1', unitPrice: '0.001' }));
    await grocery.setProductArchived(3, true);
    assert.deepEqual((await grocery.getSubcategoryDetails(1)).products, [{ id: 3, name: 'Free milk', brand: null, archived: true }]);
    assert.equal((await grocery.getSubcategoryDetails(1)).total, 5500);
    assert.equal((await grocery.getSubcategoryDetails(2)).total, 7500);
    assert.equal((await grocery.getMonth('2026-10')).total, 7501);
    const before = await storedState(f.db);
    await grocery.saveCategory({ id: 1, name: 'Dairy corrected' });
    await grocery.saveSubcategory({ id: 1, name: 'Fresh milk', parentCategoryId: 1 });
    const after = await storedState(f.db);
    for (const table of ['brands', 'stores', 'products', 'purchases', 'product_codes', 'price_history']) assert.deepEqual(after[table], before[table]);
    const reopened = open(f.path);
    try {
      await initializeDatabase(reopened.db);
      const saved = createGrocery(reopened.db, now);
      assert.equal((await saved.getMonth('2026-09')).total, 5500);
      assert.equal((await saved.getMonth('2026-10')).total, 7501);
      assert.deepEqual((await saved.getMonth('2026-09')).purchases.map((row) => [row.category, row.subcategory]), [['Dairy corrected', 'Fresh milk'], ['Dairy corrected', 'Fresh milk'], ['Dairy corrected', 'Fresh milk']]);
      assert.equal((await saved.getSubcategoryDetails(1)).total, 5500);
      assert.equal((await saved.getSubcategoryDetails(2)).total, 7500);
      assert.deepEqual(await reopened.db.getFirstAsync('PRAGMA user_version'), { user_version: 2 });
      assert.deepEqual(await reopened.db.getFirstAsync('PRAGMA integrity_check'), { integrity_check: 'ok' });
      assert.deepEqual(await reopened.db.getAllAsync('PRAGMA foreign_key_check'), []);
    } finally { reopened.close(); }
  } finally { f.cleanup(); }
});

test('recorded brand and exact product IDs keep equal names separate and retain zero and empty spending', async () => {
  const f = await fixture();
  try {
    const grocery = createGrocery(f.db, now);
    await grocery.saveCategory({ name: 'Dairy' });
    await grocery.saveSubcategory({ name: 'Milk', parentCategoryId: 1 });
    await grocery.saveSubcategory({ name: 'Empty', parentCategoryId: 1 });
    await grocery.saveBrand({ name: 'First' });
    await grocery.saveBrand({ name: 'Second' });
    await grocery.saveStore({ name: 'Market' });
    await grocery.saveProduct(catalog({ name: 'Same name', brand: { id: 1 }, grouping: { subcategory: { id: 1 } } }));
    await grocery.recordPurchase(input({ product: { id: 1 }, store: { id: 1 }, month: '2026-09', quantity: '1', unitPrice: '2.000' }));
    await grocery.saveProduct(catalog({ id: 1, name: 'Same name', brand: { id: 2 }, grouping: { subcategory: { id: 1 } } }));
    await grocery.recordPurchase(input({ product: { id: 1 }, store: { id: 1 }, quantity: '1', unitPrice: '1.500' }));
    await grocery.saveProduct(catalog({ name: 'Same name', brand: { id: 2 }, grouping: { subcategory: { id: 1 } } }));
    await grocery.recordPurchase(input({ product: { id: 2 }, store: { id: 1 }, quantity: '1', unitPrice: '1.000' }));
    assert.deepEqual((await grocery.getSubcategoryDetails(1)).brands, [
      { brandId: 1, brand: 'First', total: 2000, products: [{ productId: 1, product: 'Same name', total: 2000 }] },
      { brandId: 2, brand: 'Second', total: 2500, products: [{ productId: 1, product: 'Same name', total: 1500 }, { productId: 2, product: 'Same name', total: 1000 }] },
    ]);
    assert.equal((await grocery.getSubcategoryDetails(1)).total, 4500);
    assert.deepEqual(await grocery.getSubcategoryDetails(2), { id: 2, name: 'Empty', nameKey: 'empty', categoryId: 1, category: 'Dairy', products: [], total: 0, brands: [] });
    for (const childId of [0, 999]) await assert.rejects(grocery.getSubcategoryDetails(childId), /valid saved|no longer exists/);
  } finally { f.cleanup(); }
});

test('safe individual months remain writable when all-time subcategory spending exceeds the readable amount limit', async () => {
  const f = await fixture();
  try {
    const grocery = createGrocery(f.db, now);
    await grocery.recordPurchase(input({ product: { name: 'Large', grouping: { subcategory: { name: 'Milk', parentCategory: { name: 'Dairy' } } } }, month: '2026-09', quantity: '1', unitPrice: '9007199254740.991' }));
    await grocery.recordPurchase(input({ product: { id: 1 }, store: { id: 1 }, quantity: '1', unitPrice: '0.001' }));
    assert.equal((await grocery.getMonth('2026-09')).total, Number.MAX_SAFE_INTEGER);
    assert.equal((await grocery.getMonth('2026-10')).total, 1);
    const baseline = await storedState(f.db);
    await assert.rejects(grocery.getSubcategoryDetails(1), /safe amount limit/);
    assert.deepEqual(await storedState(f.db), baseline);
  } finally { f.cleanup(); }
});

test('fresh category, subcategory and inline purchase guards admit one operation and allow corrected failures', async () => {
  const f = await fixture();
  try {
    const grocery = createGrocery(f.db, now);
    const parent = createSubmission();
    await Promise.all([parent(() => grocery.saveCategory({ name: 'Dairy' })), parent(() => grocery.saveCategory({ name: 'Duplicate callback' }))]);
    const child = createSubmission();
    await assert.rejects(child(() => grocery.saveSubcategory({ name: ' ', parentCategoryId: 1 })), /blank/);
    await Promise.all([child(() => grocery.saveSubcategory({ name: 'Milk', parentCategoryId: 1 })), child(() => grocery.saveSubcategory({ name: 'Duplicate callback', parentCategoryId: 1 }))]);
    const purchase = createSubmission();
    const draft = input({ product: { name: 'New milk', grouping: { subcategory: { name: 'Milk', parentCategory: { id: 1 } } } }, unitPrice: '2.000', quantity: '2' });
    await assert.rejects(purchase(() => grocery.recordPurchase(draft)), /already exists/);
    draft.product = { name: 'New milk', grouping: { subcategory: { id: 1 } } };
    await Promise.all([purchase(() => grocery.recordPurchase(draft)), purchase(() => grocery.recordPurchase(draft))]);
    await createSubmission()(() => grocery.recordPurchase(input({ product: { id: 1 }, store: { id: 1 }, unitPrice: '2.000', quantity: '2' })));
    assert.deepEqual((await grocery.listReferences()).categories, [{ id: 1, name: 'Dairy', nameKey: 'dairy' }]);
    assert.deepEqual((await grocery.listReferences()).subcategories, [{ id: 1, name: 'Milk', nameKey: 'milk', categoryId: 1, category: 'Dairy' }]);
    assert.equal((await grocery.getMonth('2026-10')).total, 8000);
    assert.equal((await grocery.getMonth('2026-10')).purchases.length, 2);
    assert.equal((await grocery.getProductDetails(1)).history.length, 1);
  } finally { f.cleanup(); }
});
const retailVectors: [CodeInput, string][] = [
  [{ format: 'upc_e', value: '01234558' }, '00012345000058'],
  [{ format: 'upc_e', value: '04567840' }, '00045670000080'],
  [{ format: 'upc_e', value: '03456703' }, '00034000005673'],
  [{ format: 'upc_e', value: '09847531' }, '00098400000751'],
  [{ format: 'upc_e', value: '12345670' }, '00123456000070'],
  [{ format: 'upc_e', value: '01234514' }, '00012100003454'],
  [{ format: 'upc_e', value: '01234523' }, '00012200003453'],
  [{ format: 'ean13', value: '6291041500213' }, '06291041500213'],
  [{ format: 'ean8', value: '95012346' }, '00000095012346'],
  [{ format: 'upc_a', value: '012345000058' }, '00012345000058'],
  [{ format: 'ean13', value: '0012345000058' }, '00012345000058'],
  [{ format: 'upc_a', value: '000095012346' }, '00000095012346'],
  [{ format: 'ean13', value: '0000095012346' }, '00000095012346'],
  [{ format: 'ean8', value: '01234558' }, '00000001234558'],
];

test('typed retail formats validate literal check digits, expand all UPC-E branches, and retain original representations', () => {
  for (const [code, key] of retailVectors) assert.deepEqual(normalizeCode(code), { namespace: 'retail', format: code.format, original: code.value, key });
  for (const code of [
    { format: 'upc_a', value: '012345000059' }, { format: 'ean13', value: '0012345000059' },
    { format: 'ean8', value: '95012347' }, { format: 'upc_e', value: '01234559' },
    { format: 'upc_e', value: '123455' }, { format: 'upc_e', value: '0123455' },
    { format: 'upc_e', value: '22345670' }, { format: 'ean8', value: '９５０１２３４６' },
    { format: 'ean8', value: ' 95012346' }, { format: 'ean8', value: '9501-2346' },
    { format: 'ean8', value: 'abcdefgh' }, { value: '95012346' },
  ]) assert.throws(() => normalizeCode(code as CodeInput));
  for (let system = 2; system <= 9; system++) assert.throws(() => normalizeCode({ format: 'upc_e', value: `${system}2345670` }), /number system/);
});

test('opaque QR retains whitespace, case, Unicode and NUL with a well-formed 4096 UTF-8 byte limit', () => {
  for (const value of ['012345000058', ' Milk ', 'Milk', 'milk', 'é', 'e\u0301', '\0QR', 'QR\0value', '\ufeffQR', ' ', 'a'.repeat(4096), 'é'.repeat(2048), '😀'.repeat(1024)]) {
    assert.deepEqual(normalizeCode({ format: 'qr', value }), { namespace: 'qr', format: 'qr', original: value, key: value });
  }
  for (const value of ['', 'a'.repeat(4097), 'é'.repeat(2049), '😀'.repeat(1025), '\ud800', '\udfff', 'A\ud800B']) assert.throws(() => normalizeCode({ format: 'qr', value }));
});

test('catalog defaults, shared price writes and literal name search preserve spending and past observed stores', async () => {
  const f = await fixture();
  try {
    const grocery = createGrocery(f.db, now);
    await grocery.recordPurchase(input({ month: '2026-09', unitPrice: '2', quantity: '2' }));
    await grocery.recordPurchase(input({ product: { id: 1 }, store: { id: 1 } }));
    const purchaseRows = await f.db.getAllAsync('SELECT * FROM purchases ORDER BY id');
    const productId = await grocery.saveProduct(catalog({ name: 'Milk %_', grouping: { category: { id: 1 } } }));
    assert.equal(productId, 2);
    assert.deepEqual(await f.db.getFirstAsync('SELECT saved_price, saved_store_id FROM products WHERE id = 2'), { saved_price: null, saved_store_id: null });
    assert.deepEqual(await grocery.listProducts('%_'), [{ id: 2, name: 'Milk %_', brand: null, archived: false }]);
    assert.deepEqual((await grocery.listProducts(' ＭＩＬＫ ')).map((row) => row.id), [1, 2]);
    const edit = catalog({ id: 2, name: 'Milk %_', grouping: { category: { id: 1 } }, savedPrice: '0.001', savedStore: { id: 1 }, notInflation: true });
    await grocery.saveProduct(edit);
    await grocery.saveProduct({ ...edit, savedStore: { name: 'Catalog store' } });
    await grocery.saveProduct({ ...edit, savedPrice: undefined, savedStore: null });
    assert.deepEqual(await f.db.getFirstAsync('SELECT saved_price, saved_store_id FROM products WHERE id = 2'), { saved_price: 1, saved_store_id: null });
    assert.deepEqual(await f.db.getAllAsync('SELECT price, store_id, included, source_purchase_id FROM price_history WHERE product_id = 2'), [{ price: 1, store_id: 1, included: 1, source_purchase_id: null }]);
    await grocery.saveProduct({ ...edit, savedPrice: '0.003', savedStore: { id: 2 } });
    await grocery.saveProduct({ ...edit, savedPrice: '0.002', savedStore: null, notInflation: false });
    assert.deepEqual(await f.db.getAllAsync('SELECT price, store_id, source, effective_month, effective_date, recorded_at, included, source_purchase_id FROM price_history WHERE product_id = 2 ORDER BY id'), [
      { price: 1, store_id: 1, source: 'saved_price', effective_month: '2026-10', effective_date: '2026-10-09', recorded_at: now().toISOString(), included: 1, source_purchase_id: null },
      { price: 3, store_id: 2, source: 'saved_price', effective_month: '2026-10', effective_date: '2026-10-09', recorded_at: now().toISOString(), included: 0, source_purchase_id: null },
      { price: 2, store_id: null, source: 'saved_price', effective_month: '2026-10', effective_date: '2026-10-09', recorded_at: now().toISOString(), included: 1, source_purchase_id: null },
    ]);
    assert.deepEqual(await f.db.getAllAsync('SELECT * FROM purchases ORDER BY id'), purchaseRows);
    assert.equal((await grocery.getMonth('2026-09')).total, 4000);
    assert.equal((await grocery.getMonth('2026-10')).total, 3);
    const beforePurchase = await f.db.getAllAsync('SELECT * FROM price_history WHERE product_id = 2 ORDER BY id');
    await grocery.recordPurchase(input({ product: { id: 2 }, store: { id: 2 }, unitPrice: '0.002', quantity: '1' }));
    assert.deepEqual(await f.db.getFirstAsync('SELECT saved_price, saved_store_id FROM products WHERE id = 2'), { saved_price: 2, saved_store_id: null });
    assert.deepEqual(await f.db.getAllAsync('SELECT * FROM price_history WHERE product_id = 2 ORDER BY id'), beforePurchase);
    const purchaseId = await grocery.recordPurchase(input({ product: { id: 2 }, store: { id: 1 }, unitPrice: '0.004', quantity: '1', notInflation: true }));
    const details = await grocery.getProductDetails(2);
    assert.equal(details.savedPrice, 4);
    assert.equal(details.savedStoreId, 1);
    assert.equal(details.priceFirstSet, now().toISOString());
    assert.equal(details.lastSavedPriceChanged, now().toISOString());
    assert.equal(details.history[3].sourcePurchaseId, purchaseId);
    assert.equal(details.history[3].included, false);
    assert.deepEqual(details.history.map((row) => row.baseline), [true, false, false, false]);
    await grocery.saveProduct({ ...edit, savedPrice: '0', savedStore: null });
    assert.equal((await grocery.getProductDetails(2)).savedPrice, 0);
    for (const savedPrice of ['-1', '0.0001', '9007199254740.992']) await assert.rejects(grocery.saveProduct({ ...edit, savedPrice }));
    assert.equal((await grocery.getMonth('2026-10')).total, 9);
  } finally { f.cleanup(); }
});

test('chronological predecessor controls first-price exclusion and baseline without changing stored flags', async () => {
  const f = await fixture();
  try {
    const grocery = createGrocery(f.db, now);
    const earlierId = await grocery.saveProduct(catalog());
    await f.db.runAsync("INSERT INTO price_history(product_id, price, source, effective_month, effective_date, recorded_at) VALUES (?, 2000, 'receipt', '2026-09', NULL, 'late receipt')", earlierId);
    assert.equal((await grocery.getProductDetails(earlierId)).canExcludeSavedPrice, true);
    await grocery.saveProduct(catalog({ id: earlierId, grouping: { category: { id: 1 } }, savedPrice: '2.500', notInflation: true }));
    assert.deepEqual((await grocery.getProductDetails(earlierId)).history.map((row) => ({ price: row.price, baseline: row.baseline, included: row.included })), [{ price: 2000, baseline: true, included: true }, { price: 2500, baseline: false, included: false }]);
    const futureId = await grocery.saveProduct(catalog({ name: 'Future history', grouping: { category: { id: 1 } } }));
    await f.db.runAsync("INSERT INTO price_history(product_id, price, source, effective_month, effective_date, recorded_at) VALUES (?, 700, 'receipt', '2026-10', NULL, 'month only'), (?, 900, 'receipt', '2026-10', '2026-10-10', 'future'), (?, 1000, 'receipt', '2026-11', NULL, 'future month')", futureId, futureId, futureId);
    assert.equal((await grocery.getProductDetails(futureId)).canExcludeSavedPrice, false);
    await grocery.saveProduct(catalog({ id: futureId, name: 'Future history', grouping: { category: { id: 1 } }, savedPrice: '0.800', notInflation: true }));
    let details = await grocery.getProductDetails(futureId);
    assert.deepEqual(details.history.map((row) => ({ price: row.price, baseline: row.baseline, included: row.included })), [{ price: 800, baseline: true, included: true }, { price: 900, baseline: false, included: true }, { price: 700, baseline: false, included: true }, { price: 1000, baseline: false, included: true }]);
    await f.db.runAsync("INSERT INTO price_history(product_id, price, source, effective_month, effective_date, recorded_at, included) VALUES (?, 500, 'receipt', '2026-09', '2026-09-30', 'inserted later', 0)", futureId);
    details = await grocery.getProductDetails(futureId);
    assert.deepEqual(details.history.map((row) => ({ price: row.price, baseline: row.baseline, included: row.included })), [{ price: 500, baseline: true, included: false }, { price: 800, baseline: false, included: true }, { price: 900, baseline: false, included: true }, { price: 700, baseline: false, included: true }, { price: 1000, baseline: false, included: true }]);
    assert.equal(details.savedPrice, 800);
    assert.equal(details.priceFirstSet, now().toISOString());
    assert.equal(details.lastSavedPriceChanged, now().toISOString());
  } finally { f.cleanup(); }
});

test('catalog metadata edits preserve purchase snapshots and existing subcategory membership unless explicitly changed', async () => {
  const f = await fixture();
  try {
    const grocery = createGrocery(f.db, now);
    await grocery.recordPurchase(input());
    await f.db.execAsync("INSERT INTO subcategories(id, category_id, name, name_key) VALUES (1, 1, 'Milk', 'milk'); UPDATE products SET category_id = NULL, subcategory_id = 1 WHERE id = 1;");
    const purchases = await f.db.getAllAsync('SELECT * FROM purchases');
    const history = await f.db.getAllAsync('SELECT * FROM price_history');
    await grocery.saveProduct(catalog({ id: 1, name: 'Corrected milk', brand: { id: 1 }, grouping: { subcategory: { id: 1 } }, savedStore: { id: 1 } }));
    assert.equal((await grocery.getProductDetails(1)).subcategoryId, 1);
    await grocery.saveProduct(catalog({ id: 1, name: 'Corrected milk', brand: { name: 'New brand' }, grouping: { category: { name: 'Other category' } }, savedStore: null }));
    assert.deepEqual(await f.db.getAllAsync('SELECT * FROM purchases'), purchases);
    assert.deepEqual(await f.db.getAllAsync('SELECT * FROM price_history'), history);
    assert.deepEqual((await grocery.getMonth('2026-10')).purchases[0], { id: 1, productId: 1, product: 'Corrected milk', brand: 'Mazoon', category: 'Dairy', subcategory: null, store: 'Local store', month: '2026-10', purchaseDate: null, quantity: 3, unitPrice: 1, lineTotal: 3 });
    const details = await grocery.getProductDetails(1);
    assert.equal(details.brand, 'New brand');
    assert.equal(details.category, 'Other category');
    assert.equal(details.subcategoryId, null);
    assert.equal(details.savedPrice, 1);
    assert.equal(details.savedStoreId, null);
    const unpriced = await grocery.saveProduct(catalog({ name: 'Store only', grouping: { category: { id: 1 } }, savedStore: { id: 1 } }));
    assert.equal((await grocery.getProductDetails(unpriced)).savedStoreId, 1);
    assert.equal((await grocery.getProductDetails(unpriced)).savedPrice, null);
    assert.equal((await grocery.getProductDetails(unpriced)).history.length, 0);
    assert.equal((await grocery.getMonth('2026-10')).total, 3);
  } finally { f.cleanup(); }
});

test('code ownership is canonical, separate for QR, exact for Unicode/NUL, and rolls back complete failed catalog saves', async () => {
  const f = await fixture();
  try {
    const grocery = createGrocery(f.db, now);
    const ownerId = await grocery.saveProduct(catalog({ savedPrice: '0.001', code: { format: 'upc_e', value: '01234558' } }));
    assert.equal(ownerId, 1);
    const edit = catalog({ id: 1, grouping: { category: { id: 1 } }, savedPrice: '0.001', code: { format: 'ean13', value: '0012345000058' } });
    await grocery.saveProduct(edit);
    assert.deepEqual(await f.db.getAllAsync('SELECT id, product_id, scanner_format, original_code, canonical_key FROM product_codes'), [{ id: 1, product_id: 1, scanner_format: 'upc_e', original_code: '01234558', canonical_key: '00012345000058' }]);
    for (const format of ['upc_e', 'upc_a', 'ean13'] as const) assert.deepEqual(await grocery.lookupCode({ format, value: format === 'upc_e' ? '01234558' : format === 'upc_a' ? '012345000058' : '0012345000058' }), { id: 1, name: 'Catalog milk', brand: null, archived: false });
    const tables = ['brands', 'categories', 'stores', 'products', 'product_codes', 'purchases', 'price_history'];
    const before = await Promise.all(tables.map((table) => f.db.getAllAsync(`SELECT * FROM ${table} ORDER BY id`)));
    await assert.rejects(grocery.saveProduct(catalog({ name: 'Must roll back', brand: { name: 'Must roll back brand' }, grouping: { category: { name: 'Must roll back category' } }, savedStore: { name: 'Must roll back store' }, savedPrice: '3', code: { format: 'upc_a', value: '012345000058' } })), /belongs to another/);
    assert.deepEqual(await Promise.all(tables.map((table) => f.db.getAllAsync(`SELECT * FROM ${table} ORDER BY id`))), before);
    await f.db.execAsync("CREATE TRIGGER reject_catalog_history BEFORE INSERT ON price_history BEGIN UPDATE products SET name = 'corrupt'; SELECT RAISE(ABORT, 'history failure'); END;");
    await assert.rejects(grocery.saveProduct({ ...edit, name: 'Changed', brand: { name: 'Transient brand' }, savedStore: { name: 'Transient store' }, savedPrice: '0.002', code: { format: 'qr', value: 'Transient QR' } }), /history failure/);
    assert.deepEqual(await Promise.all(tables.map((table) => f.db.getAllAsync(`SELECT * FROM ${table} ORDER BY id`))), before);
    await f.db.execAsync('DROP TRIGGER reject_catalog_history');
    for (const change of [{ id: 999 }, { id: 0 }, { brand: { id: 999 } }, { grouping: { category: { id: 999 } } }, { savedStore: { id: 999 } }, { savedPrice: '1.0001' }, { grouping: { category: { name: ' DAIRY ' } } }]) await assert.rejects(grocery.saveProduct({ ...edit, ...change }));
    assert.deepEqual(await Promise.all(tables.map((table) => f.db.getAllAsync(`SELECT * FROM ${table} ORDER BY id`))), before);
    const qrValues = ['012345000058', ' Milk ', 'Milk', 'milk', 'é', 'e\u0301', '\0QR', 'QR\0value', '\ufeffQR', ' ', 'a'.repeat(4096), 'é'.repeat(2048), '😀'.repeat(1024)];
    for (const value of qrValues) {
      const productId = await grocery.saveProduct(catalog({ name: 'Exact QR', grouping: { category: { id: 1 } }, code: { format: 'qr', value } }));
      assert.equal((await grocery.lookupCode({ format: 'qr', value }))?.id, productId);
      assert.equal((await grocery.getProductDetails(productId)).codes[0].original, value);
    }
    for (const [code, key] of retailVectors) {
      const known = await grocery.lookupCode(code);
      const productId = known?.id ?? await grocery.saveProduct(catalog({ name: 'Retail vector', grouping: { category: { id: 1 } }, code }));
      await grocery.saveProduct(catalog({ id: productId, name: known?.name ?? 'Retail vector', grouping: { category: { id: 1 } }, code }));
      assert.equal((await grocery.lookupCode(code))?.id, productId);
      assert.equal((await grocery.getProductDetails(productId)).codes[0].key, key);
    }
    for (const code of [{ format: 'upc_a', value: '012345000059' }, { format: 'qr', value: '\ud800' }, { format: 'qr', value: 'é'.repeat(2049) }] as CodeInput[]) {
      await assert.rejects(grocery.saveProduct(catalog({ grouping: { category: { id: 1 } }, code })));
      await assert.rejects(grocery.lookupCode(code));
    }
    assert.equal((await grocery.getMonth('2026-10')).total, 0);
    assert.equal((await f.db.getAllAsync('SELECT * FROM purchases')).length, 0);
  } finally { f.cleanup(); }
});

test('archive preserves code ownership and historical spending, and explicit reactivation keeps every identity', async () => {
  const f = await fixture();
  try {
    const grocery = createGrocery(f.db, now);
    const productId = await grocery.saveProduct(catalog({ savedPrice: '0.001', savedStore: { name: 'Catalog store' }, code: { format: 'qr', value: 'Archive QR' } }));
    await grocery.recordPurchase(input({ product: { id: productId }, store: { id: 1 }, month: '2026-09', unitPrice: '2', quantity: '1' }));
    await grocery.recordPurchase(input({ product: { id: productId }, store: { id: 1 } }));
    const details = await grocery.getProductDetails(productId);
    const before = await f.db.getAllAsync('SELECT * FROM purchases ORDER BY id');
    await grocery.setProductArchived(productId, true);
    await grocery.setProductArchived(productId, true);
    assert.deepEqual(await grocery.listProducts(), []);
    assert.deepEqual(await grocery.listProducts('', true), [{ id: 1, name: 'Catalog milk', brand: null, archived: true }]);
    assert.deepEqual(await grocery.lookupCode({ format: 'qr', value: 'Archive QR' }), { id: 1, name: 'Catalog milk', brand: null, archived: true });
    assert.deepEqual(await grocery.getProductDetails(productId), { ...details, archived: true });
    await assert.rejects(grocery.recordPurchase(input({ product: { id: productId }, store: { id: 1 } })), /active product/);
    await assert.rejects(grocery.saveProduct(catalog({ id: productId, grouping: { category: { id: 1 } } })), /Reactivate/);
    await assert.rejects(grocery.saveProduct(catalog({ name: 'Another owner', grouping: { category: { id: 1 } }, code: { format: 'qr', value: 'Archive QR' } })), /belongs to another/);
    assert.equal((await grocery.getMonth('2026-09')).total, 2000);
    assert.equal((await grocery.getMonth('2026-10')).total, 3);
    await grocery.setProductArchived(productId, false);
    await grocery.setProductArchived(productId, false);
    assert.deepEqual(await grocery.getProductDetails(productId), details);
    assert.deepEqual(await f.db.getAllAsync('SELECT * FROM purchases ORDER BY id'), before);
    await assert.rejects(grocery.setProductArchived(999, true), /no longer exists/);
  } finally { f.cleanup(); }
});

test('product-code upgrade preserves all version1 rows and exact values across failed migration rollback and retry', async () => {
  const f = await fixture(migrations.slice(0, 1));
  try {
    await createGrocery(f.db, now).recordPurchase(input());
    await f.db.runAsync('INSERT INTO product_codes(id, product_id, namespace, original_code, scanner_format, canonical_key) VALUES (7, 1, ?, ?, ?, ?), (12, 1, ?, ?, NULL, ?)', 'retail', '01234558', 'upc_e', '00012345000058', 'qr', 'QR\0tail', 'QR\0tail');
    const tables = ['brands', 'categories', 'stores', 'products', 'product_codes', 'purchases', 'price_history'];
    const before = await Promise.all(tables.map((table) => f.db.getAllAsync(`SELECT * FROM ${table} ORDER BY id`)));
    assert.deepEqual(await f.db.getFirstAsync('PRAGMA encoding'), { encoding: 'UTF-8' });
    const codeBytes = [{ id: 7, original: '3031323334353538', key: '3030303132333435303030303538' }, { id: 12, original: '5152007461696C', key: '5152007461696C' }];
    assert.deepEqual(await f.db.getAllAsync('SELECT id, hex(original_code) AS original, hex(canonical_key) AS key FROM product_codes ORDER BY id'), codeBytes);
    await assert.rejects(f.db.runAsync('INSERT INTO product_codes(product_id, namespace, original_code, canonical_key) VALUES (1, ?, ?, ?)', 'qr', '\0leading', '\0leading'), /CHECK/);
    await assert.rejects(initializeDatabase(f.db, [migrations[0], migrations[1] + ' INVALID SQL;']));
    assert.deepEqual(await f.db.getFirstAsync('PRAGMA user_version'), { user_version: 1 });
    assert.deepEqual(await f.db.getAllAsync('SELECT id, hex(original_code) AS original, hex(canonical_key) AS key FROM product_codes ORDER BY id'), codeBytes);
    assert.deepEqual(await Promise.all(tables.map((table) => f.db.getAllAsync(`SELECT * FROM ${table} ORDER BY id`))), before);
    assert.deepEqual(await f.db.getAllAsync("SELECT name FROM sqlite_master WHERE name = 'product_codes_v2'"), []);
    await initializeDatabase(f.db);
    assert.deepEqual(await f.db.getFirstAsync('PRAGMA user_version'), { user_version: 2 });
    assert.deepEqual(await f.db.getAllAsync('SELECT id, hex(original_code) AS original, hex(canonical_key) AS key FROM product_codes ORDER BY id'), codeBytes);
    assert.deepEqual(await Promise.all(tables.map((table) => f.db.getAllAsync(`SELECT * FROM ${table} ORDER BY id`))), before);
    const grocery = createGrocery(f.db, now);
    await grocery.saveProduct(catalog({ id: 1, name: 'Milk', brand: { id: 1 }, grouping: { category: { id: 1 } }, savedStore: { id: 1 }, code: { format: 'qr', value: '\0leading' } }));
    assert.equal((await grocery.lookupCode({ format: 'qr', value: '\0leading' }))?.id, 1);
    assert.deepEqual((await grocery.getProductDetails(1)).codes.map((code) => ({ id: code.id, original: code.original })), [{ id: 7, original: '01234558' }, { id: 12, original: 'QR\0tail' }, { id: 13, original: '\0leading' }]);
    await assert.rejects(f.db.runAsync('INSERT INTO product_codes(product_id, namespace, original_code, canonical_key) VALUES (1, ?, ?, ?)', 'qr', '', ''), /CHECK/);
    await assert.rejects(f.db.runAsync('INSERT INTO product_codes(product_id, namespace, original_code, canonical_key) VALUES (1, ?, ?, ?)', 'qr', '\0leading', '\0leading'), /UNIQUE/);
    assert.deepEqual(await f.db.getAllAsync('PRAGMA foreign_key_check'), []);
    const reopened = open(f.path);
    try {
      await initializeDatabase(reopened.db);
      assert.equal((await createGrocery(reopened.db, now).getMonth('2026-10')).total, 3);
      assert.equal((await createGrocery(reopened.db, now).getProductDetails(1)).codes[2].original, '\0leading');
    } finally { reopened.close(); }
  } finally { f.cleanup(); }
});

test('catalog submission admits one product/event, keeps pending for suppressed callbacks, retries failure and refreshes guards per form', async () => {
  const f = await fixture();
  try {
    const grocery = createGrocery(f.db, now);
    const pending: boolean[] = [];
    const submit = createSubmission((value) => pending.push(value));
    const draft = catalog({ savedPrice: '0.001' });
    await Promise.all([submit(() => grocery.saveProduct(draft)), submit(() => grocery.saveProduct(draft))]);
    await submit(() => grocery.saveProduct(draft));
    assert.deepEqual(pending, [true, false]);
    assert.deepEqual(await grocery.listProducts(), [{ id: 1, name: 'Catalog milk', brand: null, archived: false }]);
    assert.equal((await grocery.getProductDetails(1)).history[0].price, 1);
    const retry = createSubmission();
    const edit = catalog({ id: 1, grouping: { category: { id: 1 } }, savedPrice: '0.0001' });
    await assert.rejects(retry(() => grocery.saveProduct(edit)));
    assert.equal(edit.savedPrice, '0.0001');
    await retry(() => grocery.saveProduct({ ...edit, savedPrice: '0.002' }));
    await createSubmission()(() => grocery.saveProduct({ ...edit, savedPrice: '0.003' }));
    assert.deepEqual((await grocery.getProductDetails(1)).history.map((row) => row.price), [1, 2, 3]);
    assert.equal((await grocery.getMonth('2026-10')).total, 0);
  } finally { f.cleanup(); }
});

test('shared human names reject NUL without truncation or partial writes while opaque QR retains it', async () => {
  const f = await fixture();
  try {
    const grocery = createGrocery(f.db, now);
    await grocery.recordPurchase(input());
    const tables = ['brands', 'categories', 'stores', 'products', 'product_codes', 'purchases', 'price_history'];
    const before = await Promise.all(tables.map((table) => f.db.getAllAsync(`SELECT * FROM ${table} ORDER BY id`)));
    for (const name of ['\0prefix', 'Milk\0suffix']) {
      assert.throws(() => referenceNameKey(name), /NUL/);
      await assert.rejects(grocery.saveBrand({ name }), /NUL/);
      await assert.rejects(grocery.saveBrand({ id: 1, name }), /NUL/);
      await assert.rejects(grocery.saveStore({ name }), /NUL/);
      await assert.rejects(grocery.saveStore({ id: 1, name }), /NUL/);
      await assert.rejects(grocery.saveProduct(catalog({ name, grouping: { category: { id: 1 } } })), /NUL/);
      await assert.rejects(grocery.saveProduct(catalog({ id: 1, name, grouping: { category: { id: 1 } } })), /NUL/);
      for (const change of [{ brand: { name } }, { grouping: { category: { name } } }, { savedStore: { name } }]) {
        await assert.rejects(grocery.saveProduct(catalog({ id: 1, name: 'Changed name', grouping: { category: { id: 1 } }, savedPrice: '0.002', ...change })), /NUL/);
      }
      await assert.rejects(grocery.recordPurchase(input({ product: { name, grouping: { category: { id: 1 } } }, store: { id: 1 } })), /NUL/);
      await assert.rejects(grocery.recordPurchase(input({ product: { name: 'Rollback product', brand: { name }, grouping: { category: { id: 1 } } }, store: { id: 1 } })), /NUL/);
      await assert.rejects(grocery.recordPurchase(input({ product: { name: 'Rollback product', grouping: { category: { name } } }, store: { id: 1 } })), /NUL/);
      await assert.rejects(grocery.recordPurchase(input({ product: { name: 'Rollback product', grouping: { category: { id: 1 } } }, store: { name } })), /NUL/);
      assert.deepEqual(await Promise.all(tables.map((table) => f.db.getAllAsync(`SELECT * FROM ${table} ORDER BY id`))), before);
    }
    await grocery.saveProduct(catalog({ id: 1, name: 'Milk', brand: { id: 1 }, grouping: { category: { id: 1 } }, savedStore: { id: 1 }, code: { format: 'qr', value: 'Milk\0suffix' } }));
    assert.equal((await grocery.lookupCode({ format: 'qr', value: 'Milk\0suffix' }))?.id, 1);
    assert.equal((await grocery.getProductDetails(1)).codes[0].original, 'Milk\0suffix');
    assert.equal((await grocery.getMonth('2026-10')).total, 3);
  } finally { f.cleanup(); }
});
