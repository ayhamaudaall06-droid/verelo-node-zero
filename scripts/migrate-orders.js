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

console.log('[Migrate] Connected to', dbPath);

db.exec(`
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
`);

db.exec(`CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);`);

console.log('[Migrate] ✅ Orders table ready');
db.close();
