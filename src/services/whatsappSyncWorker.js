import dbModule from './db.js';

const CRITICAL_THRESHOLDS = [50, 20, 10, 5, 0];
const MIN_SYNC_INTERVAL_MS = 30000;
const MAX_ERRORS = 3;

const META_API_VERSION = 'v18.0';
const CATALOG_ID = process.env.META_CATALOG_ID;
const ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;

if (!CATALOG_ID || !ACCESS_TOKEN) {
  console.warn('[WhatsApp Sync] Missing META_CATALOG_ID or META_ACCESS_TOKEN. Worker idle.');
}

export async function enqueueWhatsAppSync({ productId, syncType, priority = 1, payload }) {
  const db = dbModule.db;
  await db.run(
    `INSERT INTO whatsapp_sync_queue (product_id, sync_type, priority, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [productId, syncType, priority, JSON.stringify(payload), Math.floor(Date.now() / 1000)]
  );
  console.log(`[WhatsApp Queue] ${syncType} for ${productId} (P${priority})`);
}

export async function startWhatsAppSyncWorker() {
  if (!CATALOG_ID || !ACCESS_TOKEN) return;
  console.log('[WhatsApp Sync] Worker started. Polling every 30s.');
  while (true) {
    try { await processBatch(); } catch (err) { console.error('[WhatsApp Sync]', err.message); }
    await new Promise(r => setTimeout(r, MIN_SYNC_INTERVAL_MS));
  }
}

async function processBatch() {
  const db = dbModule.db;
  const now = Math.floor(Date.now() / 1000);

  const jobs = await db.all(
    `SELECT * FROM whatsapp_sync_queue 
     WHERE processed_at IS NULL AND error_count < ?
     ORDER BY priority DESC, created_at ASC LIMIT 20`,
    [MAX_ERRORS]
  );
  if (jobs.length === 0) return;

  const deduped = new Map();
  for (const job of jobs) deduped.set(`${job.product_id}:${job.sync_type}`, job);

  for (const job of deduped.values()) {
    try {
      const payload = JSON.parse(job.payload_json);
      if (job.sync_type === 'inventory') {
        const inv = payload.inventory_count;
        const isCritical = CRITICAL_THRESHOLDS.includes(inv) || job.priority >= 9;
        if (!isCritical) {
          await db.run(`UPDATE whatsapp_sync_queue SET processed_at = ? WHERE id = ?`, [now, job.id]);
          continue;
        }
      }
      await syncToMetaCommerceAPI(job.product_id, job.sync_type, payload);
      await db.run(`UPDATE whatsapp_sync_queue SET processed_at = ? WHERE id = ?`, [now, job.id]);
      console.log(`[WhatsApp Sync] ✅ ${job.product_id}`);
    } catch (err) {
      console.error(`[WhatsApp Sync] ❌ ${job.product_id}:`, err.message);
      await db.run(
        `UPDATE whatsapp_sync_queue SET error_count = error_count + 1,
         processed_at = CASE WHEN error_count + 1 >= ? THEN ? ELSE NULL END WHERE id = ?`,
        [MAX_ERRORS, now, job.id]
      );
    }
  }
}

async function syncToMetaCommerceAPI(productId, syncType, payload) {
  const db = dbModule.db;
  const mapping = await db.get(`SELECT wa_product_id FROM whatsapp_catalog WHERE product_id = ?`, [productId]);
  if (!mapping?.wa_product_id) throw new Error(`No WA mapping for ${productId}`);

  const url = `https://graph.facebook.com/${META_API_VERSION}/${mapping.wa_product_id}`;
  const body = {};
  if (syncType === 'inventory') body.availability = payload.inventory_count > 0 ? 'in stock' : 'out of stock';
  if (syncType === 'price') body.price = `${payload.price} ${payload.currency || 'USD'}`;
  if (syncType === 'full') Object.assign(body, payload);

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Meta ${res.status}: ${err.error?.message || JSON.stringify(err)}`);
  }
}
