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
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  db = await open({
    filename: DB_PATH,
    driver: sqlite3.Database
  });

  await db.exec('PRAGMA journal_mode = WAL;');
  await db.exec('PRAGMA foreign_keys = ON;');

  // 1. User States
  await db.exec(`
    CREATE TABLE IF NOT EXISTS user_states (
      user_id TEXT PRIMARY KEY,
      lane TEXT CHECK(lane IN ('INTAKE', 'FAST', 'GUIDED', 'DEEP_BROWSE')),
      step INTEGER DEFAULT 0,
      context TEXT DEFAULT '{}',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 2. WhatsApp Sync Queue
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

  // 3. Categories
  await db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    )
  `);

  // 4. Products (The missing piece)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      sku TEXT UNIQUE,
      name TEXT,
      price REAL,
      inventory_count INTEGER DEFAULT 0,
      category_id INTEGER,
      status TEXT DEFAULT 'draft',
      product_type TEXT,
      image_url TEXT,
      created_at INTEGER,
      updated_at INTEGER,
      FOREIGN KEY(category_id) REFERENCES categories(id)
    )
  `);

  console.log('[DB] SQLite fully initialized with all tables');
  return db;
}

async function getState(userId) {
  if (!db) throw new Error('Database not initialized');
  return await db.get('SELECT * FROM user_states WHERE user_id = ?', userId);
}

async function saveState(userId, state) {
  if (!db) throw new Error('Database not initialized');
  await db.run(
    'INSERT INTO user_states (user_id, lane, step, context) VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET lane=excluded.lane, step=excluded.step, context=excluded.context',
    [userId, state.lane, state.step, JSON.stringify(state.context)]
  );
}

async function healthCheck() {
  if (!db) return false;
  try { await db.get('SELECT 1'); return true; } catch { return false; }
}

export default { init, getState, saveState, healthCheck, get db() { return db; } };
