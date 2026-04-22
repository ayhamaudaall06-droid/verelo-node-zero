import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DATABASE_URL || join(__dirname, '../../data/verelo.db');

let db = null;

async function init() {
  const dataDir = dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  db = await open({ filename: DB_PATH, driver: sqlite3.Database });
  await db.exec('PRAGMA journal_mode = WAL;');
  await db.exec('PRAGMA foreign_keys = ON;');

  // ── Helper: ensure column exists ──
  async function ensureColumn(table, col, def) {
    const info = await db.all(`PRAGMA table_info(${table})`);
    if (!info.find(c => c.name === col)) {
      await db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
      console.log(`[DB] Added column ${table}.${col}`);
    }
  }

  // ── 1. CATEGORIES ──
  await db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      is_active BOOLEAN DEFAULT 1
    )
  `);

  const catCount = await db.get(`SELECT COUNT(*) as c FROM categories`);
  if (catCount.c === 0) {
    const cats = ['Verelo Home Essentials', 'Verelo Wellness', 'Verelo Quick Kitchen', 'Verelo Comfort & Care'];
    for (const c of cats) await db.run(`INSERT OR IGNORE INTO categories (name) VALUES (?)`, [c]);
    console.log('[DB] Seeded categories');
  }

  // ── 2. PRODUCTS (create + migrate) ──
  await db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      sku TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      created_at INTEGER,
      updated_at INTEGER
    )
  `);
  await ensureColumn('products', 'description', 'TEXT');
  await ensureColumn('products', 'currency', "TEXT DEFAULT 'USD'");
  await ensureColumn('products', 'category', 'TEXT');
  await ensureColumn('products', 'box_type', "TEXT CHECK(box_type IN ('trending','factory','limited','vault'))");
  await ensureColumn('products', 'inventory_count', 'INTEGER DEFAULT 0');
  await ensureColumn('products', 'is_active', 'BOOLEAN DEFAULT 1');
  await ensureColumn('products', 'metadata_json', 'TEXT');
  await ensureColumn('products', 'category_id', 'INTEGER');
  await ensureColumn('products', 'status', "TEXT DEFAULT 'draft'");
  await ensureColumn('products', 'product_type', "TEXT DEFAULT 'partner_trending'");
  await ensureColumn('products', 'image_url', "TEXT DEFAULT 'https://verelo.app/placeholder-logo.png'");

  // Generated columns (SQLite 3.31+)
  const genCols = [
    { name: 'size', expr: `json_extract(metadata_json, '$.size')` },
    { name: 'color', expr: `json_extract(metadata_json, '$.color')` },
    { name: 'material', expr: `json_extract(metadata_json, '$.material')` },
    { name: 'ai_generated', expr: `CASE WHEN json_extract(metadata_json, '$.source') = 'ai' THEN 1 ELSE 0 END` }
  ];
  for (const col of genCols) {
    try { await db.exec(`ALTER TABLE products ADD COLUMN ${col.name} TEXT GENERATED ALWAYS AS (${col.expr}) VIRTUAL`); }
    catch (e) { /* exists */ }
  }

  await db.exec(`CREATE INDEX IF NOT EXISTS idx_products_box ON products(box_type, is_active) WHERE is_active = 1`);
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_products_category ON products(category, box_type)`);

  // ── 3. PRODUCT MEDIA ──
  await db.exec(`
    CREATE TABLE IF NOT EXISTS product_media (
      id TEXT PRIMARY KEY,
      product_id TEXT REFERENCES products(id) ON DELETE CASCADE,
      url TEXT NOT NULL,
      created_at INTEGER
    )
  `);
  await ensureColumn('product_media', 'type', "TEXT CHECK(type IN ('image','video','3d'))");
  await ensureColumn('product_media', 'cdn_url', 'TEXT');
  await ensureColumn('product_media', 'sort_order', 'INTEGER DEFAULT 0');
  await ensureColumn('product_media', 'is_primary', 'BOOLEAN DEFAULT 0');
  await ensureColumn('product_media', 'asset_source', "TEXT CHECK(asset_source IN ('physical_photo','ai_character','ai_lifestyle','video_render'))");
  await ensureColumn('product_media', 'platform_whitelist', "TEXT DEFAULT 'all'");
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_media_product ON product_media(product_id, sort_order)`);

  // ── 4. WHATSAPP SYNC QUEUE ──
  await db.exec(`
    CREATE TABLE IF NOT EXISTS whatsapp_sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id TEXT NOT NULL,
      created_at INTEGER
    )
  `);
  await ensureColumn('whatsapp_sync_queue', 'sync_type', "TEXT CHECK(sync_type IN ('inventory','price','full'))");
  await ensureColumn('whatsapp_sync_queue', 'priority', 'INTEGER DEFAULT 0');
  await ensureColumn('whatsapp_sync_queue', 'payload_json', 'TEXT NOT NULL');
  await ensureColumn('whatsapp_sync_queue', 'processed_at', 'INTEGER');
  await ensureColumn('whatsapp_sync_queue', 'error_count', 'INTEGER DEFAULT 0');
  await db.exec(`CREATE INDEX IF NOT EXISTS idx_whatsapp_queue_pending ON whatsapp_sync_queue(processed_at, priority, created_at) WHERE processed_at IS NULL`);

  // ── 5. WHATSAPP CATALOG ──
  await db.exec(`
    CREATE TABLE IF NOT EXISTS whatsapp_catalog (
      product_id TEXT PRIMARY KEY REFERENCES products(id),
      wa_product_id TEXT,
      wa_catalog_id TEXT,
      sync_status TEXT,
      last_wa_sync INTEGER
    )
  `);

  // ── 6. ACTIVE ROOM STATE ──
  await db.exec(`
    CREATE TABLE IF NOT EXISTS active_room_state (
      room_name TEXT PRIMARY KEY,
      product_id TEXT,
      metadata_json TEXT,
      updated_at INTEGER
    )
  `);

  // ── 7. USER STATES ──
  await db.exec(`
    CREATE TABLE IF NOT EXISTS user_states (
      user_id TEXT PRIMARY KEY,
      lane TEXT CHECK(lane IN ('INTAKE', 'FAST', 'GUIDED', 'DEEP_BROWSE')),
      step INTEGER DEFAULT 0,
      context TEXT DEFAULT '{}',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  console.log('[DB] Verelo Node Zero: Schema migrated and ready.');
  return db;
}

async function getState(userId) {
  if (!db) throw new Error('Database not initialized');
  const row = await db.get('SELECT * FROM user_states WHERE user_id = ?', userId);
  if (!row) return null;
  return { userId: row.user_id, lane: row.lane, step: row.step, context: JSON.parse(row.context) };
}

async function saveState(userId, state) {
  if (!db) throw new Error('Database not initialized');
  await db.run(
    `INSERT INTO user_states (user_id, lane, step, context, updated_at)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(user_id) DO UPDATE SET
     lane = excluded.lane, step = excluded.step, context = excluded.context, updated_at = excluded.updated_at`,
    [userId, state.lane, state.step, JSON.stringify(state.context)]
  );
}

async function healthCheck() {
  if (!db) return false;
  try { await db.get('SELECT 1'); return true; } catch { return false; }
}

async function close() {
  if (db) await db.close();
}

export default { init, getState, saveState, healthCheck, close, get db() { return db; } };
