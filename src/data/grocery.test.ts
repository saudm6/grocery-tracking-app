import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { test } from 'node:test';
import type { SQLiteBindValue } from 'expo-sqlite';
import { createGrocery, formatOMR, initializeDatabase, lineTotal, parseOMR, parseQuantity, referenceNameKey, validateDate, validateMonth, type Database, type Executor, type PurchaseInput } from './grocery';
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
async function fixture() {
  const folder = mkdtempSync(join(tmpdir(), 'grocery-'));
  const path = join(folder, 'grocery.db');
  const { db, close } = open(path);
  await initializeDatabase(db);
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
    await assert.rejects(grocery.recordPurchase(input({ product: { name: 'Invalid grouping', brand: { name: 'Must roll back' }, grouping: { subcategoryId: 999 } } })), /FOREIGN KEY/);
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
    assert.deepEqual(await f.db.getFirstAsync('PRAGMA user_version'), { user_version: 1 });
    assert.equal((await f.db.getAllAsync("SELECT name FROM sqlite_master WHERE name = 'upgrade_marker'")).length, 0);
    assert.equal((await createGrocery(f.db, now).getMonth('2026-10')).total, 3);
    await initializeDatabase(f.db, [...migrations, 'CREATE TABLE upgrade_marker (id INTEGER);']);
    assert.deepEqual(await f.db.getFirstAsync('PRAGMA user_version'), { user_version: 2 });
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
