import type { SQLiteBindValue } from 'expo-sqlite';
import { migrations } from './schema';

export interface Executor {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, ...params: SQLiteBindValue[]): Promise<{ lastInsertRowId: number; changes: number }>;
  getFirstAsync<T>(sql: string, ...params: SQLiteBindValue[]): Promise<T | null>;
  getAllAsync<T>(sql: string, ...params: SQLiteBindValue[]): Promise<T[]>;
}
export interface Database extends Executor {
  withExclusiveTransactionAsync(work: (tx: Executor) => Promise<void>): Promise<void>;
}
export type Reference = { id: number; name?: never } | { name: string; id?: never };
export type ReferenceRow = { id: number; name: string; nameKey: string };
export type References = { brands: ReferenceRow[]; categories: ReferenceRow[]; stores: ReferenceRow[] };
type Grouping = { category: Reference; subcategoryId?: never } | { subcategoryId: number; category?: never };
type NewProduct = { name: string; brand?: Reference | null; grouping: Grouping; id?: never };
export type PurchaseInput = {
  product: NewProduct | { id: number; name?: never };
  store: Reference;
  month: string;
  purchaseDate?: string | null;
  quantity: string;
  unitPrice: string;
  notInflation?: boolean;
};
type ProductRow = { id: number; brand_id: number | null; category_id: number | null; subcategory_id: number | null; saved_price: number | null; archived: number };
export type PurchaseRow = {
  id: number; productId: number; product: string; brand: string | null; category: string; subcategory: string | null;
  store: string; month: string; purchaseDate: string | null; quantity: number; unitPrice: number; lineTotal: number;
};
export type MonthReport = { month: string; purchases: PurchaseRow[]; total: number };
const max = BigInt(Number.MAX_SAFE_INTEGER);

export function parseOMR(text: string): number {
  if (typeof text !== 'string' || !/^\d+(?:\.\d{1,3})?$/.test(text.trim())) throw new Error('Enter a nonnegative OMR price with up to three decimal places.');
  const [whole, fraction = ''] = text.trim().split('.');
  const baisa = BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, '0'));
  if (baisa > max) throw new Error('The price is too large.');
  return Number(baisa);
}
export function parseQuantity(text: string): number {
  if (typeof text !== 'string' || !/^\d+$/.test(text.trim())) throw new Error('Quantity must be a positive whole number.');
  const quantity = BigInt(text.trim());
  if (quantity < 1n || quantity > max) throw new Error('Quantity must be a positive safe whole number.');
  return Number(quantity);
}
export function lineTotal(quantity: number, price: number): number {
  if (!Number.isSafeInteger(quantity) || quantity <= 0 || !Number.isSafeInteger(price) || price < 0) throw new Error('Invalid quantity or price.');
  const total = BigInt(quantity) * BigInt(price);
  if (total > max) throw new Error('The line total is too large.');
  return Number(total);
}
export function formatOMR(baisa: number): string {
  if (!Number.isSafeInteger(baisa) || baisa < 0) throw new Error('Invalid baisa amount.');
  return `${Math.floor(baisa / 1000)}.${String(baisa % 1000).padStart(3, '0')}`;
}
export function validateMonth(month: string): string {
  if (typeof month !== 'string' || !/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Choose a valid year and month.');
  return month;
}
export function validateDate(date: string | null | undefined, month: string): string | null {
  if (date == null || date === '') return null;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date.slice(0, 7) !== month) throw new Error('Purchase date must be YYYY-MM-DD within the selected month.');
  const [year, monthNumber, day] = date.split('-').map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (day < 1 || day > days[monthNumber - 1]) throw new Error('Enter a real calendar date.');
  return date;
}
export function localDate(now = new Date()): string {
  return `${String(now.getFullYear()).padStart(4, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
function name(text: string): string {
  if (typeof text !== 'string' || !text.trim()) throw new Error('Names cannot be blank.');
  return text.trim().normalize('NFKC');
}
export function referenceNameKey(text: string): string { return name(text).toLocaleLowerCase('en-US'); }
function id(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error('Select a valid saved record.');
  return value;
}

async function exclusive(db: Database, work: (tx: Executor) => Promise<void>) {
  await db.withExclusiveTransactionAsync(async (tx) => {
    // Expo begins on a fresh connection; restart the untouched transaction to enable its foreign keys.
    await tx.execAsync('COMMIT; PRAGMA foreign_keys = ON; BEGIN IMMEDIATE;');
    const flags = await tx.getFirstAsync<{ foreign_keys: number }>('PRAGMA foreign_keys');
    if (flags?.foreign_keys !== 1) throw new Error('Could not enable database reference checks.');
    await work(tx);
  });
}
export async function initializeDatabase(db: Database, versions: readonly string[] = migrations) {
  await db.execAsync('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  await exclusive(db, async (tx) => {
    const current = (await tx.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))?.user_version ?? 0;
    if (current > versions.length) throw new Error('This database needs a newer app version.');
    for (let version = current; version < versions.length; version++) {
      await tx.execAsync(versions[version]);
      await tx.execAsync(`PRAGMA user_version = ${version + 1}`);
    }
  });
}
async function reference(tx: Executor, table: 'brands' | 'categories' | 'stores', input: Reference): Promise<number> {
  if (input.id !== undefined) {
    const selected = await tx.getFirstAsync<{ id: number }>(`SELECT id FROM ${table} WHERE id = ?`, id(input.id));
    if (!selected) throw new Error('The selected reference no longer exists.');
    return selected.id;
  }
  const label = name(input.name);
  const key = referenceNameKey(label);
  const duplicate = await tx.getFirstAsync<{ id: number }>(`SELECT id FROM ${table} WHERE name_key = ?`, key);
  if (duplicate) throw new Error(`That ${table.slice(0, -1)} already exists. Select the saved record.`);
  return (await tx.runAsync(`INSERT INTO ${table}(name, name_key) VALUES (?, ?)`, label, key)).lastInsertRowId;
}
async function writeSavedPrice(tx: Executor, product: ProductRow, price: number, storeId: number, now: Date, purchaseId: number, notInflation: boolean) {
  if (product.saved_price === price) return;
  const effectiveDate = localDate(now);
  const earlier = await tx.getFirstAsync<{ id: number }>('SELECT id FROM price_history WHERE product_id = ? LIMIT 1', product.id);
  await tx.runAsync('UPDATE products SET saved_price = ?, saved_store_id = ? WHERE id = ?', price, storeId, product.id);
  await tx.runAsync('INSERT INTO price_history(product_id, price, store_id, source, effective_month, effective_date, recorded_at, included, source_purchase_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    product.id, price, storeId, 'saved_price', effectiveDate.slice(0, 7), effectiveDate, now.toISOString(), earlier && notInflation ? 0 : 1, purchaseId);
}
async function readMonth(db: Executor, month: string): Promise<MonthReport> {
  const entries = await db.getAllAsync<Omit<PurchaseRow, 'lineTotal'>>(`SELECT p.id, p.product_id AS productId, pr.name AS product, b.name AS brand,
    c.name AS category, sub.name AS subcategory, s.name AS store, p.month, p.purchase_date AS purchaseDate, p.quantity, p.unit_price AS unitPrice
    FROM purchases p JOIN products pr ON pr.id = p.product_id LEFT JOIN brands b ON b.id = p.brand_id
    JOIN stores s ON s.id = p.store_id LEFT JOIN subcategories sub ON sub.id = p.subcategory_id
    JOIN categories c ON c.id = COALESCE(p.category_id, sub.category_id) WHERE p.month = ? ORDER BY p.id DESC`, month);
  let total = 0n;
  const purchases = entries.map((entry) => {
    const amount = lineTotal(entry.quantity, entry.unitPrice);
    total += BigInt(amount);
    return { ...entry, lineTotal: amount };
  });
  if (total > max) throw new Error('The month total exceeds the safe amount limit.');
  return { month, purchases, total: Number(total) };
}
export function createGrocery(db: Database, clock: () => Date = () => new Date()) {
  return {
    async recordPurchase(input: PurchaseInput): Promise<number> {
      const month = validateMonth(input.month);
      const purchaseDate = validateDate(input.purchaseDate, month);
      const quantity = parseQuantity(input.quantity);
      const price = parseOMR(input.unitPrice);
      lineTotal(quantity, price);
      let purchaseId = 0;
      await exclusive(db, async (tx) => {
        const now = clock();
        let product: ProductRow;
        if (input.product.id !== undefined) {
          const existing = await tx.getFirstAsync<ProductRow>('SELECT * FROM products WHERE id = ?', id(input.product.id));
          if (!existing || existing.archived) throw new Error('Select an active product.');
          product = existing;
        } else {
          const productName = name(input.product.name);
          const brandId = input.product.brand ? await reference(tx, 'brands', input.product.brand) : null;
          const grouping = input.product.grouping;
          const categoryId = grouping.category ? await reference(tx, 'categories', grouping.category) : null;
          const subcategoryId = grouping.subcategoryId !== undefined ? id(grouping.subcategoryId) : null;
          const result = await tx.runAsync('INSERT INTO products(name, brand_id, category_id, subcategory_id) VALUES (?, ?, ?, ?)', productName, brandId, categoryId, subcategoryId);
          product = { id: result.lastInsertRowId, brand_id: brandId, category_id: categoryId, subcategory_id: subcategoryId, saved_price: null, archived: 0 };
        }
        const storeId = await reference(tx, 'stores', input.store);
        const result = await tx.runAsync('INSERT INTO purchases(product_id, brand_id, store_id, category_id, subcategory_id, month, purchase_date, quantity, unit_price, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          product.id, product.brand_id, storeId, product.category_id, product.subcategory_id, month, purchaseDate, quantity, price, now.toISOString());
        purchaseId = result.lastInsertRowId;
        if (month === localDate(now).slice(0, 7)) await writeSavedPrice(tx, product, price, storeId, now, purchaseId, input.notInflation === true);
        await readMonth(tx, month);
      });
      return purchaseId;
    },
    getMonth(month: string) { return readMonth(db, validateMonth(month)); },
    async listReferences(): Promise<References> {
      const [brands, categories, stores] = await Promise.all([
        db.getAllAsync<ReferenceRow>('SELECT id, name, name_key AS nameKey FROM brands ORDER BY name_key'),
        db.getAllAsync<ReferenceRow>('SELECT id, name, name_key AS nameKey FROM categories ORDER BY name_key'),
        db.getAllAsync<ReferenceRow>('SELECT id, name, name_key AS nameKey FROM stores ORDER BY name_key'),
      ]);
      return { brands, categories, stores };
    },
  };
}
export type Grocery = ReturnType<typeof createGrocery>;
