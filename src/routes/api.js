import { Router } from 'express';
import { parseInboundMessage } from '../agents/whatsappHandler.js';
import redis from '../services/queue.js';

const router = Router();
const VERIFY_TOKEN = 'verelo_webhook_secret_2026';

router.get('/webhook/whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  
  console.log('[WEBHOOK] Mode:', mode);
  console.log('[WEBHOOK] Token received:', JSON.stringify(token));
  console.log('[WEBHOOK] Token expected:', JSON.stringify(VERIFY_TOKEN));
  console.log('[WEBHOOK] Challenge:', challenge);
  console.log('[WEBHOOK] Match:', token === VERIFY_TOKEN);
  
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('[WEBHOOK] ✅ VERIFIED');
    return res.status(200).send(challenge);
  }
  
  console.log('[WEBHOOK] ❌ REJECTED - Sending 403');
  res.sendStatus(403);
});

router.post('/webhook/whatsapp', async (req, res) => {
  res.sendStatus(200);
  const message = parseInboundMessage(req.body);
  if (!message) return;
  await redis.lPush('whatsapp:inbound', JSON.stringify(message));
  console.log(`[API] Queued from ${message.from}`);
});


// ── PRODUCTS API ──
import { DatabaseSync } from 'node:sqlite';
import { join } from 'path';

const dbPath = join(process.cwd(), 'data', 'verelo.db');

router.get('/products', (req, res) => {
  const db = new DatabaseSync(dbPath);
  const isActive = req.query.is_active;
  let rows;
  if (isActive !== undefined) {
    rows = db.prepare('SELECT * FROM products WHERE is_active = ?').all(Number(isActive));
  } else {
    rows = db.prepare('SELECT * FROM products').all();
  }
  // Attach primary image
  rows.forEach(p => {
    const img = db.prepare('SELECT url FROM product_media WHERE product_id = ? AND is_primary = 1 LIMIT 1').get(p.id);
    p.primary_image = img ? img.url : null;
  });
  db.close();
  res.json({ products: rows });
});

router.get('/products/:id', (req, res) => {
  const db = new DatabaseSync(dbPath);
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!product) { db.close(); return res.status(404).json({ error: 'Not found' }); }
  const media = db.prepare('SELECT * FROM product_media WHERE product_id = ? ORDER BY sort_order').all(req.params.id);
  db.close();
  res.json({ product, media });
});

router.post('/products', (req, res) => {
  const db = new DatabaseSync(dbPath);
  const { id, sku, name, description, price, currency, category, box_type, inventory_count, is_active, metadata_json } = req.body;
  db.prepare(`
    INSERT INTO products (id, sku, name, description, price, currency, category, box_type, inventory_count, is_active, metadata_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, sku, name, description, price, currency || 'USD', category, box_type, inventory_count || 0, is_active || 1, metadata_json || '{}', Math.floor(Date.now()/1000), Math.floor(Date.now()/1000));
  db.close();
  res.json({ ok: true, id });
});

router.post('/products/:id/media', (req, res) => {
  const db = new DatabaseSync(dbPath);
  const { id, type, url, cdn_url, sort_order, is_primary, asset_source } = req.body;
  db.prepare(`
    INSERT INTO product_media (id, product_id, type, url, cdn_url, sort_order, is_primary, asset_source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, req.params.id, type || 'image', url, cdn_url || null, sort_order || 0, is_primary || 0, asset_source || 'physical_photo');
  db.close();
  res.json({ ok: true });
});

export default router;
