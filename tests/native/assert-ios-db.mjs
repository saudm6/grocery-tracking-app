import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { DatabaseSync } from 'node:sqlite';

function verify(path, month, date) {
  assert.ok(existsSync(path), 'The installed app must have created grocery.db');
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    assert.equal(db.prepare('PRAGMA user_version').get().user_version, 2);
    assert.deepEqual(db.prepare('PRAGMA integrity_check').all().map((row) => ({ ...row })), [{ integrity_check: 'ok' }]);
    assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);
    const rows = db.prepare(`SELECT p.id, pr.name AS product, b.name AS brand, c.name AS category,
      s.name AS store, p.month, p.purchase_date, p.quantity, p.unit_price,
      p.quantity * p.unit_price AS line_total, pr.saved_price, pr.saved_store_id,
      p.store_id, pr.archived FROM purchases p
      JOIN products pr ON pr.id = p.product_id JOIN brands b ON b.id = p.brand_id
      JOIN categories c ON c.id = p.category_id JOIN stores s ON s.id = p.store_id`).all();
    assert.equal(rows.length, 1, 'Invalid submission must not save; successful submission must save exactly once');
    const row = { ...rows[0] };
    assert.equal(row.product, 'IOSSmokeMilk');
    assert.equal(row.brand, 'IOSSmokeBrand');
    assert.equal(row.category, 'IOSSmokeDairy');
    assert.equal(row.store, 'IOSSmokeStore');
    assert.equal(row.month, month);
    assert.equal(row.purchase_date, null);
    assert.equal(row.quantity, 3);
    assert.equal(row.unit_price, 1);
    assert.equal(row.line_total, 3);
    assert.equal(row.saved_price, 1);
    assert.equal(row.saved_store_id, row.store_id);
    assert.equal(row.archived, 0);
    for (const table of ['products', 'brands', 'categories', 'stores', 'purchases', 'price_history']) {
      assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count, 1, `${table} row count`);
    }
    for (const table of ['subcategories', 'product_codes']) {
      assert.equal(db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count, 0, `${table} row count`);
    }
    const history = { ...db.prepare('SELECT * FROM price_history').get() };
    assert.equal(history.price, 1);
    assert.equal(history.store_id, row.store_id);
    assert.equal(history.source, 'saved_price');
    assert.equal(history.source_purchase_id, row.id);
    assert.equal(history.effective_month, month);
    assert.equal(history.effective_date, date);
    assert.equal(history.included, 1);
    assert.ok(!Number.isNaN(Date.parse(history.recorded_at)));
    return { schemaVersion: 2, integrity: 'ok', foreignKeyViolations: 0, purchase: row, history };
  } finally {
    db.close();
  }
}

async function selfTest() {
  const directory = mkdtempSync(join(tmpdir(), 'grocery-ios-db-proof-'));
  const path = join(directory, 'grocery.db');
  const connection = new DatabaseSync(path);
  const executor = (db) => ({
    async execAsync(sql) { db.exec(sql); },
    async runAsync(sql, ...values) {
      const result = db.prepare(sql).run(...values);
      return { lastInsertRowId: Number(result.lastInsertRowid), changes: Number(result.changes) };
    },
    async getFirstAsync(sql, ...values) { return db.prepare(sql).get(...values) ?? null; },
    async getAllAsync(sql, ...values) { return db.prepare(sql).all(...values); },
  });
  const db = {
    ...executor(connection),
    async withExclusiveTransactionAsync(work) {
      const tx = new DatabaseSync(path, { enableForeignKeyConstraints: false });
      try {
        tx.exec('BEGIN');
        await work(executor(tx));
        tx.exec('COMMIT');
      } catch (error) {
        tx.exec('ROLLBACK');
        throw error;
      } finally { tx.close(); }
    },
  };
  try {
    const { createGrocery, initializeDatabase } = createRequire(import.meta.url)('../../.test-build/grocery.js');
    await initializeDatabase(db);
    await createGrocery(db, () => new Date(2026, 9, 9, 12)).recordPurchase({
      product: { name: 'IOSSmokeMilk', brand: { name: 'IOSSmokeBrand' }, grouping: { category: { name: 'IOSSmokeDairy' } } },
      store: { name: 'IOSSmokeStore' }, month: '2026-10', quantity: '3', unitPrice: '0.001',
    });
    verify(path, '2026-10', '2026-10-09');
    connection.exec('UPDATE purchases SET unit_price = 2');
    assert.throws(() => verify(path, '2026-10', '2026-10-09'));
    connection.exec('UPDATE purchases SET unit_price = 1; PRAGMA user_version = 3');
    assert.throws(() => verify(path, '2026-10', '2026-10-09'));
    assert.throws(() => verify(join(directory, 'missing.db'), '2026-10', '2026-10-09'));
    process.stdout.write('SQLite proof self-test passed: real writer accepted; wrong price/schema/missing file rejected.\n');
  } finally {
    connection.close();
    rmSync(directory, { recursive: true });
  }
}

if (process.argv[2] === '--self-test') await selfTest();
else {
  const [, , path, month, date] = process.argv;
  assert.match(month ?? '', /^\d{4}-\d{2}$/);
  assert.match(date ?? '', /^\d{4}-\d{2}-\d{2}$/);
  process.stdout.write(`${JSON.stringify(verify(path, month, date), null, 2)}\n`);
}
