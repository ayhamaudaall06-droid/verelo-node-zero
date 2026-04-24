import 'dotenv/config';
import { readdirSync, existsSync, readFileSync } from 'fs';
import crypto from 'crypto';
import { getPresignedUploadUrl } from './services/r2Presign.js';
import { AccessToken } from 'livekit-server-sdk';
import { getActiveProduct } from './services/activeProductStore.js';
import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dbModule from './services/db.js';
import apiRoutes from './routes/api.js';
import { startCommerceWorker } from './services/whatsappCommerceWorker.js';
import { setActiveProduct, clearActiveProduct, getActiveProductFromDB } from './services/livekitProductBridge.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const publicPath = join(process.cwd(), 'public');

console.log('[Static] Serving from:', publicPath, '- exists:', existsSync(publicPath));

// ── MIDDLEWARE ──
app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// ── STATIC FILES ──
app.use(express.static(publicPath));

// ── API ROUTES ──
app.use('/api', apiRoutes);

// ── HEALTH ──
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── DEBUG ──
app.get('/debug/files', (req, res) => {
  const publicDir = join(process.cwd(), 'public');
  res.json({
    public_path: publicDir,
    public_exists: existsSync(publicDir),
    public_contents: existsSync(publicDir) ? readdirSync(publicDir) : [],
    admin_exists: existsSync(join(publicDir, 'admin')),
    admin_contents: existsSync(join(publicDir, 'admin')) ? readdirSync(join(publicDir, 'admin')) : []
  });
});

// ── LIVEKIT ROOM METADATA ──
app.post('/api/livekit/room-metadata', async (req, res) => {
  const { room, productId, action } = req.body;
  if (!room) return res.status(400).json({ error: 'room required' });
  
  if (action === 'clear') {
    const { clearFallbackProduct } = await import('./services/fallbackStore.js');
    clearFallbackProduct();
    const result = await clearActiveProduct(room);
    return res.json(result.ok ? result : { ok: true, fallback: true });
  }
  
  if (!productId) return res.status(400).json({ error: 'productId required' });
  
  const result = await setActiveProduct(room, productId);
  if (!result.ok) {
    const { setFallbackProduct } = await import('./services/fallbackStore.js');
    const db = new DatabaseSync(join(process.cwd(), 'data', 'verelo.db'));
    const p = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
    db.close();
    if (p) {
      let meta = {};
      try { meta = JSON.parse(p.metadata_json || '{}'); } catch {}
      setFallbackProduct({
        id: p.id, name: p.name, description: p.description,
        price: p.price, currency: p.currency, category: p.category,
        box_type: p.box_type, size: p.size, color: p.color,
        material: p.material, image: null,
        customization_options: meta.customization || []
      });
      return res.json({ ok: true, fallback: true, product: p.name });
    }
  }
  res.status(result.ok ? 200 : 500).json(result);
});

app.get('/api/livekit/room-metadata', async (req, res) => {
  const { room } = req.query;
  if (!room) return res.status(400).json({ error: 'room required' });
  res.json({ room, note: 'Use LiveKit client SDK to read metadata in real-time' });
});

// ── ACTIVE PRODUCT CACHE ──
let activeProductCache = null;
app.post('/api/active-product', (req, res) => {
  const { productId } = req.body;
  activeProductCache = getActiveProductFromDB(productId);
  res.json({ ok: true, product: activeProductCache });
});
app.get('/api/active-product', async (req, res) => {
  if (activeProductCache) return res.json({ product: activeProductCache });
  const { getFallbackProduct } = await import('./services/fallbackStore.js');
  const fb = getFallbackProduct();
  res.json({ product: fb });
});

// ── BOX / ORDER ──
app.post('/api/order', (req, res) => {
  const { items, customer, customization, total, room } = req.body;
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items required' });
  }
  const orderId = 'ORD-' + Date.now().toString(36).toUpperCase();
  const db = new DatabaseSync(join(process.cwd(), 'data', 'verelo.db'));
  db.prepare(`
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
    )
  `).run();
  db.prepare(`
    INSERT INTO orders (id, items_json, customer_json, customization_json, total, currency, status, source, room)
    VALUES (?, ?, ?, ?, ?, ?, 'pending', 'live', ?)
  `).run(
    orderId,
    JSON.stringify(items),
    JSON.stringify(customer || {}),
    JSON.stringify(customization || {}),
    total || 0,
    items[0]?.currency || 'USD',
    room || null
  );
  db.close();
  res.json({ ok: true, orderId, status: 'pending', message: 'Order created. Await confirmation.' });
});

app.get('/api/order/:id', (req, res) => {
  const db = new DatabaseSync(join(process.cwd(), 'data', 'verelo.db'));
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  db.close();
  if (!order) return res.status(404).json({ error: 'Order not found' });
  res.json(order);
});

app.post('/api/order/:id/confirm', (req, res) => {
  const db = new DatabaseSync(join(process.cwd(), 'data', 'verelo.db'));
  db.prepare(`UPDATE orders SET status = 'confirmed', confirmed_at = (strftime('%s','now')) WHERE id = ?`).run(req.params.id);
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  db.close();
  console.log(`[WhatsApp Stub] Would notify customer about order ${req.params.id}`);
  res.json({ ok: true, order, whatsapp_status: 'queued' });
});

// ── HTML ROUTES ──
app.get('/', (req, res) => res.sendFile(join(publicPath, 'index.html')));
app.get('/index.html', (req, res) => res.sendFile(join(publicPath, 'index.html')));
app.get('/admin.html', (req, res) => res.sendFile(join(publicPath, 'admin.html')));
app.get('/live.html', (req, res) => res.sendFile(join(publicPath, 'live.html')));

// ── PRODUCTS API ──
app.get('/api/products', (req, res) => {
  const db = new DatabaseSync(join(process.cwd(), 'data', 'verelo.db'));
  const isActive = req.query.is_active;
  let rows;
  if (isActive !== undefined) {
    rows = db.prepare('SELECT * FROM products WHERE is_active = ?').all(isActive);
  } else {
    rows = db.prepare('SELECT * FROM products').all();
  }
  db.close();
  res.json({ products: rows });
});

// ── LIVEKIT TOKEN ──
app.get('/api/voice/listen', async (req, res) => {
  const { room } = req.query;
  if (!room) return res.status(400).json({ error: 'room required' });
  const at = new AccessToken(
    process.env.LIVEKIT_API_KEY,
    process.env.LIVEKIT_API_SECRET,
    { identity: 'viewer-' + Math.random().toString(36).slice(2, 8) }
  );
  at.addGrant({ roomJoin: true, room: room, canPublish: false, canSubscribe: true });
  const token = await at.toJwt();
  res.json({ token, room });
});

// ── 404 / ERROR ──
app.use((req, res) => res.status(404).send(`Cannot GET ${req.path}`));
app.use((err, req, res, next) => {
  console.error('[Server Error]', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// ── AUTO-SEED DEMO PRODUCT (if empty) ──
async function seedIfEmpty() {
  const db = dbModule.db;
  const count = await db.get('SELECT COUNT(*) as c FROM products');
  if (count.c === 0) {
    await db.run(
      `INSERT INTO products (id, sku, name, description, price, currency, category, box_type, inventory_count, is_active, metadata_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      'PROD-001',
      'COFFEE-001',
      'Ethiopian Yirgacheffe',
      'Single-origin light roast, 250g',
      24.00,
      'USD',
      'coffee',
      'trending',
      50,
      1,
      '{"size":"250g","material":"beans","customization":["grind_size","roast_level"]}',
      Math.floor(Date.now() / 1000),
      Math.floor(Date.now() / 1000)
    );
    console.log('[Seed] Demo product created');
  } else {
    console.log('[Seed] Products already exist:', count.c);
  }
}

// ── START ──
const PORT = process.env.PORT || 8080;
(async () => {
  await dbModule.init();
  await seedIfEmpty();
  app.listen(PORT, () => {
    console.log(`[API] Verelo Core Live on ${PORT}`);
    startCommerceWorker().catch(console.error);
  });
})();
