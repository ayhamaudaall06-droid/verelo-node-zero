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
  await db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

  // Nuclear option: reset schema if env var set (one-time use)
  if (process.env.RESET_DB === 'true') {
    console.warn("[DB] RESET_DB detected — dropping all tables for fresh schema");
    await db.exec(`DROP TABLE IF EXISTS products`);
    await db.exec(`DROP TABLE IF EXISTS product_media`);
    await db.exec(`DROP TABLE IF EXISTS whatsapp_sync_queue`);
    await db.exec(`DROP TABLE IF EXISTS whatsapp_catalog`);
    await db.exec(`DROP TABLE IF EXISTS active_room_state`);
    await db.exec(`DROP TABLE IF EXISTS categories`);
    await db.exec(`DROP TABLE IF EXISTS sync_state`);
  }
  // 1. Categories
  await db.exec(`CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE);`);

  // 2. Products
  await db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY, sku TEXT UNIQUE, name TEXT, price REAL, 
      inventory_count INTEGER DEFAULT 0, category_id INTEGER, 
      status TEXT DEFAULT 'draft', product_type TEXT, image_url TEXT, 
      created_at INTEGER, updated_at INTEGER,
      FOREIGN KEY(category_id) REFERENCES categories(id)
    );
  `);

  // 3. WhatsApp Sync Queue (Full Schema with processed_at)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS whatsapp_sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT, 
      session_id TEXT NOT NULL, 
      product_id TEXT, 
      sync_type TEXT, 
      priority INTEGER DEFAULT 0, 
      payload TEXT, 
      status TEXT DEFAULT 'pending', 
      error_count INTEGER DEFAULT 0,
      error_message TEXT,
      created_at INTEGER DEFAULT (unixepoch()),
      processed_at INTEGER
    )
  `);

  // 4. User States
  await db.exec(`
    CREATE TABLE IF NOT EXISTS user_states (
      user_id TEXT PRIMARY KEY,
      lane TEXT CHECK(lane IN ('INTAKE', 'FAST', 'GUIDED', 'DEEP_BROWSE')),
      step INTEGER DEFAULT 0,
      context TEXT DEFAULT '{}',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await seed();
  console.log('[DB] Verelo Node Zero: Full schema initialized and seeded.');
  return db;
}

async function seed() {
  const cats = ['Home Essentials', 'Wellness', 'Quick Kitchen', 'Collections'];
  for (const name of cats) {
    await db.run('INSERT OR IGNORE INTO categories (name) VALUES (?)', name);
  }

  const count = await db.get('SELECT COUNT(*) as c FROM products');
  if (count.c === 0) {
    console.log('[DB] Seeding 22 products...');
    for (let i = 1; i <= 22; i++) {
      const id = `prod-${String(i).padStart(3, '0')}`;
      await db.run(
        `INSERT INTO products (id, sku, name, price, status, product_type, image_url, created_at) 
         VALUES (?, ?, ?, ?, 'draft', 'verelo_exclusive', ?, ?)`,
        [id, `VER-${i}`, `Verelo Item ${i}`, 49.99, 'https://verelo.app/placeholder-logo.png', Date.now()]
      );
    }
  }
}

export default { 
  init, 
  get db() { return db; },
  getState: async (id) => db.get('SELECT * FROM user_states WHERE user_id = ?', id),
  saveState: async (id, s) => db.run('INSERT INTO user_states (user_id, lane, step, context) VALUES (?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET lane=excluded.lane, step=excluded.step, context=excluded.context', [id, s.lane, s.step, JSON.stringify(s.context)]),
  healthCheck: async () => { try { await db.get('SELECT 1'); return true; } catch { return false; } }
};
