import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbDir = join(__dirname, '..', 'data');
const dbPath = join(dbDir, 'verelo.db');

if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true });

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL;');

function tableExists(name) {
  return db.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name=?`).get(name) !== undefined;
}

function colExists(table, col) {
  return db.prepare(`SELECT 1 FROM pragma_table_info(?) WHERE name=?`).get(table, col) !== undefined;
}

console.log('[Migrate] Connected to', dbPath);

if (!tableExists('products')) {
  db.exec(`CREATE TABLE products (
    id TEXT PRIMARY KEY, sku TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
    description TEXT, price DECIMAL(10,2) NOT NULL, currency TEXT DEFAULT 'USD',
    category TEXT, box_type TEXT CHECK(box_type IN ('trending','factory','limited','vault')),
    inventory_count INTEGER DEFAULT 0, is_active BOOLEAN DEFAULT 1,
    metadata_json TEXT, created_at INTEGER, updated_at INTEGER
  );`);
  console.log('[Migrate] Created products');
}

const genCols = [
  { name: 'size', expr: `json_extract(metadata_json, '$.size')` },
  { name: 'color', expr: `json_extract(metadata_json, '$.color')` },
  { name: 'material', expr: `json_extract(metadata_json, '$.material')` },
  { name: 'ai_generated', expr: `CASE WHEN json_extract(metadata_json, '$.source')='ai' THEN 1 ELSE 0 END` }
];

for (const c of genCols) {
  if (!colExists('products', c.name)) {
    db.exec(`ALTER TABLE products ADD COLUMN ${c.name} TEXT GENERATED ALWAYS AS (${c.expr}) VIRTUAL;`);
    console.log(`[Migrate] Generated column: ${c.name}`);
  } else {
    console.log(`[Migrate] Already exists: ${c.name}`);
  }
}

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_products_box ON products(box_type, is_active) WHERE is_active=1;
  CREATE INDEX IF NOT EXISTS idx_products_category ON products(category, box_type);
  CREATE INDEX IF NOT EXISTS idx_products_size ON products(size) WHERE size IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_products_ai ON products(ai_generated) WHERE ai_generated=1;
`);

if (!tableExists('product_media')) {
  db.exec(`CREATE TABLE product_media (
    id TEXT PRIMARY KEY, product_id TEXT REFERENCES products(id) ON DELETE CASCADE,
    type TEXT CHECK(type IN ('image','video','3d')), url TEXT NOT NULL, cdn_url TEXT,
    sort_order INTEGER DEFAULT 0, is_primary BOOLEAN DEFAULT 0,
    asset_source TEXT CHECK(asset_source IN ('physical_photo','ai_character','ai_lifestyle','video_render')),
    platform_whitelist TEXT DEFAULT 'all'
  );`);
  console.log('[Migrate] Created product_media');
} else {
  if (!colExists('product_media', 'asset_source')) {
    db.exec(`ALTER TABLE product_media ADD COLUMN asset_source TEXT CHECK(asset_source IN ('physical_photo','ai_character','ai_lifestyle','video_render'));`);
  }
  if (!colExists('product_media', 'platform_whitelist')) {
    db.exec(`ALTER TABLE product_media ADD COLUMN platform_whitelist TEXT DEFAULT 'all';`);
  }
}

db.exec(`CREATE INDEX IF NOT EXISTS idx_media_product ON product_media(product_id, sort_order);`);

if (!tableExists('sync_state')) {
  db.exec(`CREATE TABLE sync_state (
    id INTEGER PRIMARY KEY AUTOINCREMENT, product_id TEXT,
    target_platform TEXT CHECK(target_platform IN ('whatsapp','livekit','web','shadow')),
    status TEXT CHECK(status IN ('pending','synced','failed')), payload_hash TEXT,
    error_log TEXT, synced_at INTEGER
  );`);
}
db.exec(`CREATE INDEX IF NOT EXISTS idx_sync_pending ON sync_state(status, target_platform) WHERE status='pending';`);

if (!tableExists('whatsapp_catalog')) {
  db.exec(`CREATE TABLE whatsapp_catalog (
    product_id TEXT PRIMARY KEY REFERENCES products(id),
    wa_product_id TEXT, wa_catalog_id TEXT, sync_status TEXT, last_wa_sync INTEGER
  );`);
}

if (!tableExists('whatsapp_sync_queue')) {
  db.exec(`CREATE TABLE whatsapp_sync_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT, product_id TEXT NOT NULL,
    sync_type TEXT CHECK(sync_type IN ('inventory','price','full')),
    priority INTEGER DEFAULT 0, payload_json TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s','now')), processed_at INTEGER, error_count INTEGER DEFAULT 0
  );`);
}
db.exec(`CREATE INDEX IF NOT EXISTS idx_whatsapp_queue_pending ON whatsapp_sync_queue(processed_at, priority, created_at) WHERE processed_at IS NULL;`);

console.log('[Migrate] ✅ Complete');
db.close();
