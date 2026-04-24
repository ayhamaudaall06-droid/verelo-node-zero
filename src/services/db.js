import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DATABASE_PATH || join(process.cwd(), 'data', 'verelo.db');

const dbDir = dirname(dbPath);
if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true });

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL;');

// ── SCHEMA ──
db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    sku TEXT UNIQUE,
    name TEXT,
    description TEXT,
    price REAL,
    currency TEXT DEFAULT 'USD',
    category TEXT,
    box_type TEXT,
    size TEXT,
    color TEXT,
    material TEXT,
    metadata_json TEXT,
    status TEXT DEFAULT 'draft',
    is_active INTEGER DEFAULT 1,
    created_at INTEGER,
    updated_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS product_media (
    id TEXT PRIMARY KEY,
    product_id TEXT,
    url TEXT,
    type TEXT DEFAULT 'image',
    is_primary INTEGER DEFAULT 0,
    created_at INTEGER,
    FOREIGN KEY (product_id) REFERENCES products(id)
  );

  CREATE TABLE IF NOT EXISTS sync_state (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id TEXT,
    target_platform TEXT,
    status TEXT,
    payload_hash TEXT,
    synced_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS box_registry (
    id TEXT PRIMARY KEY,
    customer_phone TEXT,
    items_json TEXT,
    total REAL,
    currency TEXT,
    status TEXT DEFAULT 'open',
    created_at INTEGER,
    updated_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    items_json TEXT NOT NULL,
    customer_json TEXT,
    customization_json TEXT,
    total DECIMAL(10,2),
    currency TEXT DEFAULT 'USD',
    status TEXT DEFAULT 'pending',
    source TEXT DEFAULT 'live',
    room TEXT,
    created_at INTEGER DEFAULT (strftime('%s','now')),
    confirmed_at INTEGER,
    whatsapp_notified INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS idempotency_keys (
    key TEXT PRIMARY KEY,
    action TEXT NOT NULL,
    result_json TEXT,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );

  CREATE TABLE IF NOT EXISTS whatsapp_sync_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT,
    payload_json TEXT,
    priority INTEGER DEFAULT 0,
    processed_at INTEGER,
    error_count INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  );
`);

export function seedIfEmpty() {
  try {
    const count = db.prepare('SELECT COUNT(*) as c FROM products').get();
    if (count.c > 0) {
      console.log(`[Seed] Products already exist: ${count.c}`);
      return;
    }

    console.log('[Seed] No products — seeding 22 demo items...');
    const now = Math.floor(Date.now() / 1000);
    
    db.exec('BEGIN TRANSACTION');
    
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO products (id, sku, name, description, price, currency, category, box_type, status, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    for (let i = 1; i <= 22; i++) {
      stmt.run(
        `prod-${i}`,
        `SKU-${1000 + i}`,
        `Verelo Item ${i}`,
        `Factory-direct product ${i}`,
        49.99,
        'USD',
        'standard',
        'partner_trending',
        'live',
        1,
        now,
        now
      );
    }
    
    db.exec('COMMIT');
    console.log('[Seed] 22 products seeded.');
  } catch (err) {
    console.error('[Seed Error]', err.message);
    try { db.exec('ROLLBACK'); } catch {}
  }
}

export function init() {
  seedIfEmpty();
}

export default { db, init, seedIfEmpty };
export { db };
