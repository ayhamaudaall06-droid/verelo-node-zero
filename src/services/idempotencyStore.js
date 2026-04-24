import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';

const dbPath = process.env.DATABASE_PATH || join(process.cwd(), 'data', 'verelo.db');

// CRITICAL: Create directory BEFORE opening DB
const dbDir = dirname(dbPath);
if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true });

const db = new DatabaseSync(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS idempotency_keys (
    key TEXT PRIMARY KEY,
    action TEXT NOT NULL,
    result_json TEXT,
    created_at INTEGER DEFAULT (strftime('%s','now'))
  )
`);

export function isDuplicate(key) {
  const row = db.prepare('SELECT 1 FROM idempotency_keys WHERE key = ?').get(key);
  return !!row;
}

export function markProcessed(key, action, result) {
  try {
    db.prepare('INSERT INTO idempotency_keys (key, action, result_json) VALUES (?, ?, ?)')
      .run(key, action, JSON.stringify(result || {}));
  } catch (e) {
    // Key already exists — ignore
  }
}
