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

  // 1. Table Creation
  await db.exec(`
    CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE);
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY, sku TEXT UNIQUE, name TEXT, price REAL, 
      inventory_count INTEGER DEFAULT 0, category_id INTEGER, 
      status TEXT DEFAULT 'draft', product_type TEXT, image_url TEXT, 
      created_at INTEGER, updated_at INTEGER,
      FOREIGN KEY(category_id) REFERENCES categories(id)
    );
    CREATE TABLE IF NOT EXISTS whatsapp_sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL, 
      product_id TEXT, sync_type TEXT, priority INTEGER DEFAULT 0, 
      payload TEXT, status TEXT DEFAULT 'pending', created_at INTEGER DEFAULT (unixepoch())
    );
  `);

  await seed();
  console.log('[DB] Verelo Node Zero: Tables initialized and seeded.');
  return db;
}

async function seed() {
  // Seed Categories
  const cats = ['Home Essentials', 'Wellness', 'Quick Kitchen', 'Collections'];
  for (const name of cats) {
    await db.run('INSERT OR IGNORE INTO categories (name) VALUES (?)', name);
  }

  // Seed 22 Products if empty
  const count = await db.get('SELECT COUNT(*) as c FROM products');
  if (count.c === 0) {
    console.log('[DB] Empty table detected. Seeding 22 products...');
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

export default { init, get db() { return db; } };
