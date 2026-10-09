const monthCheck = (column: string) => `length(${column}) = 7 AND ${column} GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]' AND substr(${column}, 1, 4) BETWEEN '0001' AND '9999' AND substr(${column}, 6, 2) BETWEEN '01' AND '12'`;
const amountCheck = (column: string) => `typeof(${column}) = 'integer' AND ${column} BETWEEN 0 AND 9007199254740991`;

export const migrations = [
  `CREATE TABLE brands (id INTEGER PRIMARY KEY, name TEXT NOT NULL CHECK(length(trim(name)) > 0), name_key TEXT NOT NULL UNIQUE CHECK(length(name_key) > 0));
   CREATE TABLE categories (id INTEGER PRIMARY KEY, name TEXT NOT NULL CHECK(length(trim(name)) > 0), name_key TEXT NOT NULL UNIQUE CHECK(length(name_key) > 0));
   CREATE TABLE stores (id INTEGER PRIMARY KEY, name TEXT NOT NULL CHECK(length(trim(name)) > 0), name_key TEXT NOT NULL UNIQUE CHECK(length(name_key) > 0));
   CREATE TABLE subcategories (
     id INTEGER PRIMARY KEY, category_id INTEGER NOT NULL REFERENCES categories(id),
     name TEXT NOT NULL CHECK(length(trim(name)) > 0), name_key TEXT NOT NULL CHECK(length(name_key) > 0),
     primary_brand_id INTEGER REFERENCES brands(id), UNIQUE(category_id, name_key)
   );
   CREATE TABLE products (
     id INTEGER PRIMARY KEY, name TEXT NOT NULL CHECK(length(trim(name)) > 0), brand_id INTEGER REFERENCES brands(id),
     category_id INTEGER REFERENCES categories(id), subcategory_id INTEGER REFERENCES subcategories(id),
     saved_price INTEGER CHECK(saved_price IS NULL OR (${amountCheck('saved_price')})), saved_store_id INTEGER REFERENCES stores(id),
     archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0, 1)),
     CHECK((category_id IS NOT NULL) != (subcategory_id IS NOT NULL))
   );
   CREATE TABLE product_codes (
     id INTEGER PRIMARY KEY, product_id INTEGER NOT NULL REFERENCES products(id),
     namespace TEXT NOT NULL CHECK(namespace IN ('retail', 'qr')),
     original_code TEXT NOT NULL CHECK(length(original_code) > 0), scanner_format TEXT,
     canonical_key TEXT NOT NULL CHECK(length(canonical_key) > 0), UNIQUE(namespace, canonical_key),
     CHECK(namespace != 'qr' OR length(CAST(original_code AS BLOB)) <= 4096)
   );
   CREATE TABLE purchases (
     id INTEGER PRIMARY KEY, product_id INTEGER NOT NULL REFERENCES products(id), brand_id INTEGER REFERENCES brands(id),
     store_id INTEGER NOT NULL REFERENCES stores(id), category_id INTEGER REFERENCES categories(id), subcategory_id INTEGER REFERENCES subcategories(id),
     month TEXT NOT NULL CHECK(${monthCheck('month')}), purchase_date TEXT,
     quantity INTEGER NOT NULL CHECK(typeof(quantity) = 'integer' AND quantity BETWEEN 1 AND 9007199254740991),
     unit_price INTEGER NOT NULL CHECK(${amountCheck('unit_price')}), created_at TEXT NOT NULL,
     CHECK((category_id IS NOT NULL) != (subcategory_id IS NOT NULL)),
     CHECK(unit_price = 0 OR quantity <= 9007199254740991 / unit_price),
     CHECK(purchase_date IS NULL OR (length(purchase_date) = 10 AND purchase_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND substr(purchase_date, 1, 7) = month AND date(purchase_date, '+0 days') IS NOT NULL AND date(purchase_date, '+0 days') = purchase_date))
   );
   CREATE TABLE price_history (
     id INTEGER PRIMARY KEY, product_id INTEGER NOT NULL REFERENCES products(id),
     price INTEGER NOT NULL CHECK(${amountCheck('price')}), store_id INTEGER REFERENCES stores(id),
     source TEXT NOT NULL CHECK(source IN ('saved_price', 'receipt')),
     effective_month TEXT NOT NULL CHECK(${monthCheck('effective_month')}), effective_date TEXT,
     recorded_at TEXT NOT NULL, included INTEGER NOT NULL DEFAULT 1 CHECK(included IN (0, 1)),
     source_purchase_id INTEGER UNIQUE REFERENCES purchases(id) ON DELETE SET NULL,
     CHECK(effective_date IS NULL OR (length(effective_date) = 10 AND effective_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND substr(effective_date, 1, 7) = effective_month AND date(effective_date, '+0 days') IS NOT NULL AND date(effective_date, '+0 days') = effective_date))
   );
   CREATE INDEX purchases_month ON purchases(month);
   CREATE INDEX history_product ON price_history(product_id, effective_month, effective_date, id);`,
  `CREATE TABLE product_codes_v2 (
     id INTEGER PRIMARY KEY, product_id INTEGER NOT NULL REFERENCES products(id),
     namespace TEXT NOT NULL CHECK(namespace IN ('retail', 'qr')),
     original_code TEXT NOT NULL CHECK(length(CAST(original_code AS BLOB)) > 0), scanner_format TEXT,
     canonical_key TEXT NOT NULL CHECK(length(CAST(canonical_key AS BLOB)) > 0), UNIQUE(namespace, canonical_key),
     CHECK(namespace != 'qr' OR length(CAST(original_code AS BLOB)) <= 4096)
   );
   INSERT INTO product_codes_v2(id, product_id, namespace, original_code, scanner_format, canonical_key)
     SELECT id, product_id, namespace, original_code, scanner_format, canonical_key FROM product_codes;
   DROP TABLE product_codes;
   ALTER TABLE product_codes_v2 RENAME TO product_codes;`,
];
