import dbModule from './db.js';

let cache = null;

async function ensureTable() {
  const db = dbModule.db;
  await db.run(`
    CREATE TABLE IF NOT EXISTS active_room_state (
      room_name TEXT PRIMARY KEY,
      product_id TEXT,
      metadata_json TEXT,
      updated_at INTEGER
    )
  `);
}

export async function setActiveProduct(roomName, productState) {
  await ensureTable();
  const db = dbModule.db;
  const payload = {
    active_product_id: productState.id,
    sku: productState.sku,
    box_type: productState.box_type,
    price: productState.price,
    currency: productState.currency || 'USD',
    inventory: productState.inventory,
    primary_media_url: productState.media_url,
    theme: productState.theme || 'standard'
  };
  cache = { roomName, ...payload };
  await db.run(
    `INSERT INTO active_room_state (room_name, product_id, metadata_json, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(room_name) DO UPDATE SET
     product_id = excluded.product_id,
     metadata_json = excluded.metadata_json,
     updated_at = excluded.updated_at`,
    [roomName, productState.id, JSON.stringify(payload), Date.now()]
  );
}

export async function getActiveProduct(roomName) {
  if (cache && cache.roomName === roomName) return cache;
  await ensureTable();
  const db = dbModule.db;
  const row = await db.get(`SELECT * FROM active_room_state WHERE room_name = ?`, [roomName]);
  if (!row) return null;
  return { roomName: row.room_name, ...JSON.parse(row.metadata_json), updatedAt: row.updated_at };
}
