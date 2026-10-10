import type { SQLiteBindValue } from 'expo-sqlite';
import { normalizeCode, type CodeInput } from './code';
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
export type SubcategoryRow = ReferenceRow & { categoryId: number; category: string };
export type References = { brands: ReferenceRow[]; categories: ReferenceRow[]; stores: ReferenceRow[]; subcategories: SubcategoryRow[] };
type ReferenceTable = 'brands' | 'categories' | 'stores';
type ReferenceChange = { id?: number; name: string };
type SubcategoryChange = { id?: number; name: string; parentCategoryId: number };
export type SubcategoryReference = { id: number; name?: never; parentCategory?: never } | { name: string; parentCategory: Reference; id?: never };
export type Grouping = { category: Reference; subcategory?: never } | { subcategory: SubcategoryReference; category?: never };
type NewProduct = { name: string; brand?: Reference | null; grouping: Grouping; id?: never };
export type ProductInput = {
  id?: number; name: string; brand?: Reference | null; grouping: Grouping;
  savedPrice?: string; savedStore: Reference | null; code?: CodeInput; notInflation?: boolean;
};
export type PurchaseInput = {
  product: NewProduct | { id: number; name?: never };
  store: Reference;
  month: string;
  purchaseDate?: string | null;
  quantity: string;
  unitPrice: string;
  notInflation?: boolean;
};
type ProductRow = { id: number; brand_id: number | null; category_id: number | null; subcategory_id: number | null; saved_price: number | null; saved_store_id: number | null; archived: number };
type SavedPriceUpdate =
  | { kind: 'catalog'; price?: number; storeId: number | null; notInflation: boolean }
  | { kind: 'purchase'; price: number; storeId: number; purchaseId: number; notInflation: boolean };
export type ProductSummary = { id: number; name: string; brand: string | null; archived: boolean };
export type SubcategoryDetails = SubcategoryRow & {
  products: ProductSummary[]; total: number;
  brands: { brandId: number | null; brand: string | null; total: number; products: { productId: number; product: string; total: number }[] }[];
};
export type ProductCode = { id: number; namespace: 'retail' | 'qr'; original: string; format: string | null; key: string };
export type PriceObservation = {
  id: number; price: number; storeId: number | null; store: string | null; source: 'saved_price' | 'receipt';
  effectiveMonth: string; effectiveDate: string | null; recordedAt: string; included: boolean; sourcePurchaseId: number | null; baseline: boolean;
};
export type ProductDetails = ProductSummary & {
  brandId: number | null; categoryId: number | null; category: string; subcategoryId: number | null; subcategory: string | null;
  savedPrice: number | null; savedStoreId: number | null; savedStore: string | null;
  codes: ProductCode[]; history: PriceObservation[]; canExcludeSavedPrice: boolean;
  priceFirstSet: string | null; lastSavedPriceChanged: string | null;
};
export type PurchaseRow = {
  id: number; productId: number; product: string; brand: string | null; category: string; subcategory: string | null;
  store: string; month: string; purchaseDate: string | null; quantity: number; unitPrice: number; lineTotal: number;
};
export type PurchaseDetails = PurchaseRow & { brandId: number | null; categoryId: number | null; subcategoryId: number | null; storeId: number };
export type PurchaseCorrection = {
  productId: number; store: Reference; grouping?: Grouping; month: string; purchaseDate?: string | null; quantity: string; unitPrice: string;
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
  if (text.includes('\0')) throw new Error('Names cannot contain NUL characters.');
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
async function reference(tx: Executor, table: ReferenceTable, input: Reference): Promise<number> {
  if (input.id !== undefined) {
    const selected = await tx.getFirstAsync<{ id: number }>(`SELECT id FROM ${table} WHERE id = ?`, id(input.id));
    if (!selected) throw new Error('The selected reference no longer exists.');
    return selected.id;
  }
  return writeReference(tx, table, input);
}
async function writeReference(tx: Executor, table: ReferenceTable, input: ReferenceChange): Promise<number> {
  const label = name(input.name);
  const key = referenceNameKey(label);
  const selectedId = input.id === undefined ? null : id(input.id);
  const duplicate = await tx.getFirstAsync<{ id: number }>(`SELECT id FROM ${table} WHERE name_key = ? AND (? IS NULL OR id != ?)`, key, selectedId, selectedId);
  if (duplicate) throw new Error(`That ${table === 'categories' ? 'category' : table.slice(0, -1)} already exists. Select the saved record.`);
  if (selectedId !== null) {
    const result = await tx.runAsync(`UPDATE ${table} SET name = ?, name_key = ? WHERE id = ?`, label, key, selectedId);
    if (!result.changes) throw new Error('The selected reference no longer exists.');
    return selectedId;
  }
  return (await tx.runAsync(`INSERT INTO ${table}(name, name_key) VALUES (?, ?)`, label, key)).lastInsertRowId;
}
async function writeSubcategory(tx: Executor, input: SubcategoryChange): Promise<number> {
  const label = name(input.name);
  const key = referenceNameKey(label);
  const parentId = await reference(tx, 'categories', { id: input.parentCategoryId });
  const selectedId = input.id === undefined ? null : id(input.id);
  if (selectedId !== null) {
    const selected = await tx.getFirstAsync<{ category_id: number }>('SELECT category_id FROM subcategories WHERE id = ?', selectedId);
    if (!selected) throw new Error('The selected subcategory no longer exists.');
    if (selected.category_id !== parentId) throw new Error('Renaming keeps the subcategory in its existing parent category.');
  }
  const duplicate = await tx.getFirstAsync<{ id: number }>('SELECT id FROM subcategories WHERE category_id = ? AND name_key = ? AND (? IS NULL OR id != ?)', parentId, key, selectedId, selectedId);
  if (duplicate) throw new Error('That subcategory already exists in this category. Select the saved record.');
  if (selectedId !== null) {
    await tx.runAsync('UPDATE subcategories SET name = ?, name_key = ? WHERE id = ?', label, key, selectedId);
    return selectedId;
  }
  return (await tx.runAsync('INSERT INTO subcategories(category_id, name, name_key) VALUES (?, ?, ?)', parentId, label, key)).lastInsertRowId;
}
async function resolveGrouping(tx: Executor, input: Grouping): Promise<{ categoryId: number | null; subcategoryId: number | null }> {
  if (!input || (input.category !== undefined) === (input.subcategory !== undefined)) throw new Error('Choose exactly one category or subcategory.');
  if (input.category !== undefined) {
    if (!input.category || typeof input.category !== 'object') throw new Error('Choose a valid category.');
    return { categoryId: await reference(tx, 'categories', input.category), subcategoryId: null };
  }
  const child = input.subcategory;
  if (!child || typeof child !== 'object') throw new Error('Choose a valid subcategory.');
  let subcategoryId: number;
  if (child.id !== undefined) {
    if ('name' in child || 'parentCategory' in child) throw new Error('Choose a saved subcategory ID or a new subcategory name and parent.');
    const selected = await tx.getFirstAsync<{ id: number }>('SELECT id FROM subcategories WHERE id = ?', id(child.id));
    if (!selected) throw new Error('The selected subcategory no longer exists.');
    subcategoryId = selected.id;
  } else {
    if (!child.parentCategory) throw new Error('Choose a parent category for the new subcategory.');
    const parentCategoryId = await reference(tx, 'categories', child.parentCategory);
    subcategoryId = await writeSubcategory(tx, { name: child.name, parentCategoryId });
  }
  return { categoryId: null, subcategoryId };
}
async function hasPredecessor(db: Executor, productId: number, effectiveDate: string): Promise<boolean> {
  return !!await db.getFirstAsync<{ id: number }>(`SELECT id FROM price_history WHERE product_id = ? AND
    (effective_month < ? OR (effective_month = ? AND effective_date <= ?)) LIMIT 1`, productId, effectiveDate.slice(0, 7), effectiveDate.slice(0, 7), effectiveDate);
}
async function writeSavedPrice(tx: Executor, product: ProductRow, update: SavedPriceUpdate, now: Date) {
  const { price, storeId, notInflation } = update;
  if (price === undefined || product.saved_price === price) {
    if (update.kind === 'catalog') await tx.runAsync('UPDATE products SET saved_store_id = ? WHERE id = ?', storeId, product.id);
    return;
  }
  const effectiveDate = localDate(now);
  const earlier = await hasPredecessor(tx, product.id, effectiveDate);
  await tx.runAsync('UPDATE products SET saved_price = ?, saved_store_id = ? WHERE id = ?', price, storeId, product.id);
  await tx.runAsync('INSERT INTO price_history(product_id, price, store_id, source, effective_month, effective_date, recorded_at, included, source_purchase_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    product.id, price, storeId, 'saved_price', effectiveDate.slice(0, 7), effectiveDate, now.toISOString(), earlier && notInflation ? 0 : 1, update.kind === 'purchase' ? update.purchaseId : null);
}
async function readPurchases(db: Executor, column: 'month' | 'product_id', value: string | number): Promise<PurchaseRow[]> {
  const entries = await db.getAllAsync<Omit<PurchaseRow, 'lineTotal'>>(`SELECT p.id, p.product_id AS productId, pr.name AS product, b.name AS brand,
    c.name AS category, sub.name AS subcategory, s.name AS store, p.month, p.purchase_date AS purchaseDate, p.quantity, p.unit_price AS unitPrice
    FROM purchases p JOIN products pr ON pr.id = p.product_id LEFT JOIN brands b ON b.id = p.brand_id
    JOIN stores s ON s.id = p.store_id LEFT JOIN subcategories sub ON sub.id = p.subcategory_id
    JOIN categories c ON c.id = COALESCE(p.category_id, sub.category_id) WHERE p.${column} = ? ORDER BY p.id DESC`, value);
  return entries.map((entry) => ({ ...entry, lineTotal: lineTotal(entry.quantity, entry.unitPrice) }));
}
async function readMonth(db: Executor, month: string): Promise<MonthReport> {
  const purchases = await readPurchases(db, 'month', month);
  let total = 0n;
  for (const purchase of purchases) total += BigInt(purchase.lineTotal);
  if (total > max) throw new Error('The month total exceeds the safe amount limit.');
  return { month, purchases, total: Number(total) };
}
export function createGrocery(db: Database, clock: () => Date = () => new Date()) {
  const saveReference = async (table: ReferenceTable, input: ReferenceChange): Promise<number> => {
    let savedId = 0;
    await exclusive(db, async (tx) => { savedId = await writeReference(tx, table, input); });
    return savedId;
  };
  return {
    saveBrand(input: ReferenceChange) { return saveReference('brands', input); },
    saveStore(input: ReferenceChange) { return saveReference('stores', input); },
    saveCategory(input: ReferenceChange) { return saveReference('categories', input); },
    async saveSubcategory(input: SubcategoryChange): Promise<number> {
      let savedId = 0;
      await exclusive(db, async (tx) => { savedId = await writeSubcategory(tx, input); });
      return savedId;
    },
    async saveProduct(input: ProductInput): Promise<number> {
      const label = name(input.name);
      const price = input.savedPrice === undefined || input.savedPrice.trim() === '' ? undefined : parseOMR(input.savedPrice);
      const code = input.code === undefined ? undefined : normalizeCode(input.code);
      let productId = 0;
      await exclusive(db, async (tx) => {
        const existing = input.id === undefined ? null : await tx.getFirstAsync<ProductRow>('SELECT * FROM products WHERE id = ?', id(input.id));
        if (input.id !== undefined && (!existing || existing.archived)) throw new Error('Select an active product. Reactivate an archived product before editing.');
        const brandId = input.brand ? await reference(tx, 'brands', input.brand) : null;
        const { categoryId, subcategoryId } = await resolveGrouping(tx, input.grouping);
        const storeId = input.savedStore === null ? null : await reference(tx, 'stores', input.savedStore);
        if (existing) {
          productId = existing.id;
          await tx.runAsync('UPDATE products SET name = ?, brand_id = ?, category_id = ?, subcategory_id = ? WHERE id = ?', label, brandId, categoryId, subcategoryId, productId);
        } else {
          productId = (await tx.runAsync('INSERT INTO products(name, brand_id, category_id, subcategory_id) VALUES (?, ?, ?, ?)', label, brandId, categoryId, subcategoryId)).lastInsertRowId;
        }
        if (code) {
          const owner = await tx.getFirstAsync<{ product_id: number }>('SELECT product_id FROM product_codes WHERE namespace = ? AND canonical_key = CAST(? AS TEXT)', code.namespace, new TextEncoder().encode(code.key));
          if (owner && owner.product_id !== productId) throw new Error('That code belongs to another product, including archived products. Open its details.');
          // Expo iOS truncates TEXT bindings and reads at NUL. Bind bytes and retain TEXT identity.
          if (!owner) await tx.runAsync('INSERT INTO product_codes(product_id, namespace, original_code, scanner_format, canonical_key) VALUES (?, ?, CAST(? AS TEXT), ?, CAST(? AS TEXT))', productId, code.namespace, new TextEncoder().encode(code.original), code.format, new TextEncoder().encode(code.key));
        }
        await writeSavedPrice(tx, existing ?? { id: productId, brand_id: brandId, category_id: categoryId, subcategory_id: subcategoryId, saved_price: null, saved_store_id: null, archived: 0 }, { kind: 'catalog', price, storeId, notInflation: input.notInflation === true }, clock());
      });
      return productId;
    },
    async listProducts(search = '', includeArchived = false): Promise<ProductSummary[]> {
      const rows = await db.getAllAsync<Omit<ProductSummary, 'archived'> & { archived: number }>(`SELECT p.id, p.name, b.name AS brand, p.archived
        FROM products p LEFT JOIN brands b ON b.id = p.brand_id WHERE (? = 1 OR p.archived = 0) ORDER BY p.name, p.id`, includeArchived);
      const key = search.trim().normalize('NFKC').toLocaleLowerCase('en-US');
      return rows.filter((row) => referenceNameKey(row.name).includes(key)).map((row) => ({ ...row, archived: row.archived === 1 }));
    },
    async lookupCode(input: CodeInput): Promise<ProductSummary | null> {
      const code = normalizeCode(input);
      const row = await db.getFirstAsync<Omit<ProductSummary, 'archived'> & { archived: number }>(`SELECT p.id, p.name, b.name AS brand, p.archived
        FROM product_codes code JOIN products p ON p.id = code.product_id LEFT JOIN brands b ON b.id = p.brand_id WHERE code.namespace = ? AND code.canonical_key = CAST(? AS TEXT)`, code.namespace, new TextEncoder().encode(code.key));
      return row ? { ...row, archived: row.archived === 1 } : null;
    },
    async getSubcategoryDetails(subcategoryId: number): Promise<SubcategoryDetails> {
      const selected = await db.getFirstAsync<SubcategoryRow>(`SELECT sub.id, sub.name, sub.name_key AS nameKey, sub.category_id AS categoryId, c.name AS category
        FROM subcategories sub JOIN categories c ON c.id = sub.category_id WHERE sub.id = ?`, id(subcategoryId));
      if (!selected) throw new Error('This subcategory no longer exists.');
      const [members, purchases] = await Promise.all([
        db.getAllAsync<Omit<ProductSummary, 'archived'> & { archived: number }>(`SELECT p.id, p.name, b.name AS brand, p.archived FROM products p
          LEFT JOIN brands b ON b.id = p.brand_id WHERE p.subcategory_id = ? ORDER BY p.name, p.id`, subcategoryId),
        db.getAllAsync<{ brandId: number | null; brand: string | null; productId: number; product: string; quantity: number; unitPrice: number }>(`SELECT p.brand_id AS brandId, b.name AS brand, p.product_id AS productId, pr.name AS product, p.quantity, p.unit_price AS unitPrice
          FROM purchases p JOIN products pr ON pr.id = p.product_id LEFT JOIN brands b ON b.id = p.brand_id
          WHERE p.subcategory_id = ? ORDER BY b.name, p.brand_id, pr.name, p.product_id, p.id`, subcategoryId),
      ]);
      const groups = new Map<number | null, { brandId: number | null; brand: string | null; total: bigint; products: Map<number, { productId: number; product: string; total: bigint }> }>();
      let total = 0n;
      for (const purchase of purchases) {
        const amount = BigInt(lineTotal(purchase.quantity, purchase.unitPrice));
        total += amount;
        let brand = groups.get(purchase.brandId);
        if (!brand) { brand = { brandId: purchase.brandId, brand: purchase.brand, total: 0n, products: new Map() }; groups.set(purchase.brandId, brand); }
        brand.total += amount;
        let product = brand.products.get(purchase.productId);
        if (!product) { product = { productId: purchase.productId, product: purchase.product, total: 0n }; brand.products.set(purchase.productId, product); }
        product.total += amount;
      }
      if (total > max) throw new Error('Subcategory spending exceeds the safe amount limit.');
      return { ...selected, products: members.map((product) => ({ ...product, archived: product.archived === 1 })), total: Number(total),
        brands: [...groups.values()].map((brand) => ({ ...brand, total: Number(brand.total), products: [...brand.products.values()].map((product) => ({ ...product, total: Number(product.total) })) })) };
    },
    async getProductDetails(productId: number): Promise<ProductDetails> {
      const product = await db.getFirstAsync<Omit<ProductDetails, 'codes' | 'history' | 'canExcludeSavedPrice' | 'priceFirstSet' | 'lastSavedPriceChanged' | 'archived'> & { archived: number }>(`SELECT p.id, p.name, b.name AS brand, p.brand_id AS brandId, p.archived,
        p.category_id AS categoryId, c.name AS category, p.subcategory_id AS subcategoryId, sub.name AS subcategory,
        p.saved_price AS savedPrice, p.saved_store_id AS savedStoreId, s.name AS savedStore
        FROM products p LEFT JOIN brands b ON b.id = p.brand_id LEFT JOIN subcategories sub ON sub.id = p.subcategory_id
        JOIN categories c ON c.id = COALESCE(p.category_id, sub.category_id) LEFT JOIN stores s ON s.id = p.saved_store_id WHERE p.id = ?`, id(productId));
      if (!product) throw new Error('This product no longer exists.');
      const codeRows = await db.getAllAsync<Omit<ProductCode, 'original' | 'key'> & { original: Uint8Array; key: Uint8Array }>('SELECT id, namespace, CAST(original_code AS BLOB) AS original, scanner_format AS format, CAST(canonical_key AS BLOB) AS key FROM product_codes WHERE product_id = ? ORDER BY id', productId);
      const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
      const codes = codeRows.map((row) => ({ ...row, original: decoder.decode(row.original), key: decoder.decode(row.key) }));
      const observations = await db.getAllAsync<Omit<PriceObservation, 'baseline' | 'included'> & { included: number }>(`SELECT h.id, h.price, h.store_id AS storeId, s.name AS store, h.source,
        h.effective_month AS effectiveMonth, h.effective_date AS effectiveDate, h.recorded_at AS recordedAt, h.included, h.source_purchase_id AS sourcePurchaseId
        FROM price_history h LEFT JOIN stores s ON s.id = h.store_id WHERE h.product_id = ? ORDER BY h.effective_month, h.effective_date IS NULL, h.effective_date, h.id`, productId);
      const saved = observations.filter((row) => row.source === 'saved_price').sort((a, b) => a.id - b.id);
      return { ...product, archived: product.archived === 1, codes, history: observations.map((row, position) => ({ ...row, included: row.included === 1, baseline: position === 0 })),
        canExcludeSavedPrice: await hasPredecessor(db, productId, localDate(clock())), priceFirstSet: saved[0]?.recordedAt ?? null, lastSavedPriceChanged: saved.at(-1)?.recordedAt ?? null };
    },
    async setProductArchived(productId: number, archived: boolean): Promise<void> {
      await exclusive(db, async (tx) => {
        const result = await tx.runAsync('UPDATE products SET archived = ? WHERE id = ?', archived, id(productId));
        if (!result.changes) throw new Error('This product no longer exists.');
      });
    },
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
          const { categoryId, subcategoryId } = await resolveGrouping(tx, grouping);
          const result = await tx.runAsync('INSERT INTO products(name, brand_id, category_id, subcategory_id) VALUES (?, ?, ?, ?)', productName, brandId, categoryId, subcategoryId);
          product = { id: result.lastInsertRowId, brand_id: brandId, category_id: categoryId, subcategory_id: subcategoryId, saved_price: null, saved_store_id: null, archived: 0 };
        }
        const storeId = await reference(tx, 'stores', input.store);
        const result = await tx.runAsync('INSERT INTO purchases(product_id, brand_id, store_id, category_id, subcategory_id, month, purchase_date, quantity, unit_price, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          product.id, product.brand_id, storeId, product.category_id, product.subcategory_id, month, purchaseDate, quantity, price, now.toISOString());
        purchaseId = result.lastInsertRowId;
        if (month === localDate(now).slice(0, 7)) await writeSavedPrice(tx, product, { kind: 'purchase', price, storeId, purchaseId, notInflation: input.notInflation === true }, now);
        await readMonth(tx, month);
      });
      return purchaseId;
    },
    async getPurchase(purchaseId: number): Promise<PurchaseDetails> {
      const purchase = await db.getFirstAsync<Omit<PurchaseDetails, 'lineTotal'>>(`SELECT p.id, p.product_id AS productId, pr.name AS product,
        p.brand_id AS brandId, b.name AS brand, p.category_id AS categoryId, c.name AS category, p.subcategory_id AS subcategoryId,
        sub.name AS subcategory, p.store_id AS storeId, s.name AS store, p.month, p.purchase_date AS purchaseDate, p.quantity, p.unit_price AS unitPrice
        FROM purchases p JOIN products pr ON pr.id = p.product_id LEFT JOIN brands b ON b.id = p.brand_id
        JOIN stores s ON s.id = p.store_id LEFT JOIN subcategories sub ON sub.id = p.subcategory_id
        JOIN categories c ON c.id = COALESCE(p.category_id, sub.category_id) WHERE p.id = ?`, id(purchaseId));
      if (!purchase) throw new Error('This purchase no longer exists.');
      return { ...purchase, lineTotal: lineTotal(purchase.quantity, purchase.unitPrice) };
    },
    async updatePurchase(purchaseId: number, input: PurchaseCorrection): Promise<void> {
      const month = validateMonth(input.month);
      const purchaseDate = validateDate(input.purchaseDate, month);
      const quantity = parseQuantity(input.quantity);
      const price = parseOMR(input.unitPrice);
      lineTotal(quantity, price);
      await exclusive(db, async (tx) => {
        const purchase = await tx.getFirstAsync<{ product_id: number; brand_id: number | null; category_id: number | null; subcategory_id: number | null; month: string }>(
          'SELECT product_id, brand_id, category_id, subcategory_id, month FROM purchases WHERE id = ?', id(purchaseId));
        if (!purchase) throw new Error('This purchase no longer exists.');
        const productId = id(input.productId);
        let brandId = purchase.brand_id;
        if (productId !== purchase.product_id) {
          const product = await tx.getFirstAsync<ProductRow>('SELECT * FROM products WHERE id = ?', productId);
          if (!product || product.archived) throw new Error('Select an active replacement product.');
          if (input.grouping === undefined) throw new Error('Confirm the replacement product grouping.');
          brandId = product.brand_id;
        }
        const { categoryId, subcategoryId } = input.grouping === undefined
          ? { categoryId: purchase.category_id, subcategoryId: purchase.subcategory_id } : await resolveGrouping(tx, input.grouping);
        const storeId = await reference(tx, 'stores', input.store);
        await tx.runAsync('UPDATE purchases SET product_id = ?, brand_id = ?, store_id = ?, category_id = ?, subcategory_id = ?, month = ?, purchase_date = ?, quantity = ?, unit_price = ? WHERE id = ?',
          productId, brandId, storeId, categoryId, subcategoryId, month, purchaseDate, quantity, price, purchaseId);
        await readMonth(tx, purchase.month);
        if (month !== purchase.month) await readMonth(tx, month);
      });
    },
    async deletePurchase(purchaseId: number): Promise<void> {
      await exclusive(db, async (tx) => {
        const purchase = await tx.getFirstAsync<{ month: string }>('SELECT month FROM purchases WHERE id = ?', id(purchaseId));
        if (!purchase) throw new Error('This purchase no longer exists.');
        await tx.runAsync('DELETE FROM purchases WHERE id = ?', purchaseId);
        await readMonth(tx, purchase.month);
      });
    },
    getMonth(month: string) { return readMonth(db, validateMonth(month)); },
    listProductPurchases(productId: number) { return readPurchases(db, 'product_id', id(productId)); },
    async listReferences(): Promise<References> {
      const [brands, categories, stores, subcategories] = await Promise.all([
        db.getAllAsync<ReferenceRow>('SELECT id, name, name_key AS nameKey FROM brands ORDER BY name_key'),
        db.getAllAsync<ReferenceRow>('SELECT id, name, name_key AS nameKey FROM categories ORDER BY name_key'),
        db.getAllAsync<ReferenceRow>('SELECT id, name, name_key AS nameKey FROM stores ORDER BY name_key'),
        db.getAllAsync<SubcategoryRow>(`SELECT sub.id, sub.name, sub.name_key AS nameKey, sub.category_id AS categoryId, c.name AS category
          FROM subcategories sub JOIN categories c ON c.id = sub.category_id ORDER BY c.name_key, sub.name_key, sub.id`),
      ]);
      return { brands, categories, stores, subcategories };
    },
  };
}
export type Grocery = ReturnType<typeof createGrocery>;
