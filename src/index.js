import { readdirSync, existsSync } from 'fs';
import crypto from 'crypto';
import { getPresignedUploadUrl } from './services/r2Presign.js';
import { AccessToken } from 'livekit-server-sdk';
import { getActiveProduct } from './services/activeProductStore.js';
import express from 'express';
import { getActiveProduct } from './services/activeProductStore.js';
import express from 'express';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import dbModule from './services/db.js';
import apiRoutes from './routes/api.js';
import { startWhatsAppSyncWorker } from './services/whatsappSyncWorker.js';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

// ── 1. STATIC FILES (must be first, before API routes) ──
app.use(express.static(join(__dirname, '..', 'public')));

// Explicit fallback for live.html until static middleware is fully trusted
app.get('/live.html', (req, res) => {
app.get('/admin/products.html', (req, res) => {
  res.sendFile(join(__dirname, '..', 'public', 'admin', 'products.html'));
});  res.sendFile(join(__dirname, '..', 'public', 'live.html'));
});

// ── 2. PARSERS ──
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// ── 3. DATABASE ──
await dbModule.init();

// ── 4. HEALTH ─
// ── Redis (lazy — only connects if URL is valid) ──
let redisClient = null;
try {
  if (process.env.REDIS_URL && !process.env.REDIS_URL.includes("railway.internal")) {
    const { createClient } = await import("redis");
    redisClient = createClient({ url: process.env.REDIS_URL });
    redisClient.on("error", (err) => console.log("Redis Client Error", err));
    await redisClient.connect();
    console.log("[Redis] Connected");
  } else {
    console.log("[Redis] Skipped (local dev or missing URL)");
  }
} catch (e) {
  console.log("[Redis] Connection failed, continuing without cache");
}app.get('/api/active-product', async (req, res) => {
  const room = req.query.room || 'verelo-factory-1';
  try {
    const product = await getActiveProduct(room);
    if (!product) return res.status(404).json({ error: 'No active product' });
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'verelo-api', time: Date.now() }));
app.get('/ready', async (req, res) => {
  const dbOk = await dbModule.healthCheck().catch(() => false);
  res.status(dbOk ? 200 : 503).json({ status: dbOk ? 'ready' : 'not_ready', db: dbOk });
});

// ── 5. API ROUTES ──
app.use('/api', apiRoutes);

// ── ADMIN ROUTES ──

// Pre-signed URL for image upload (frontend asks backend, backend grants temporary access)
app.post('/api/admin/upload-url', async (req, res) => {
  const { filename, contentType } = req.body;
  if (!filename || !contentType) {
    return res.status(400).json({ error: 'filename and contentType required' });
  }
  try {
    const urlData = await getPresignedUploadUrl(filename, contentType);
    res.json(urlData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List categories
app.get('/api/admin/categories', async (req, res) => {
  const db = dbModule.db;
  const cats = await db.all(`SELECT * FROM categories WHERE is_active = 1 ORDER BY name`);
  res.json(cats);
});

// List products with category names
app.get('/api/admin/products', async (req, res) => {
  const db = dbModule.db;
  const products = await db.all(`
    SELECT p.*, c.name as category_name 
    FROM products p 
    LEFT JOIN categories c ON p.category_id = c.id 
    ORDER BY p.updated_at DESC
  `);
  res.json(products);
});

// Create product (ALWAYS draft — never goes live on creation)
app.post('/api/admin/products', async (req, res) => {
  const { sku, name, price, inventory_count, category_id, product_type, image_url } = req.body;
  if (!sku || !name || price === undefined) {
    return res.status(400).json({ error: 'sku, name, price required' });
  }
  const db = dbModule.db;
  try {
    const result = await db.run(
      `INSERT INTO products (id, sku, name, price, inventory_count, category_id, status, product_type, image_url, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?)`,
      [crypto.randomUUID(), sku, name, price, inventory_count || 0, category_id || null, product_type || 'partner_trending', image_url || 'https://verelo.app/placeholder-logo.png', Date.now(), Date.now()]
    );
    res.json({ id: result.lastID, status: 'draft', message: 'Product created as draft. Use PUSH TO STREAM to go live.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUSH TO STREAM (The protected action — separate from creation)
app.post('/api/admin/push-to-stream', async (req, res) => {
  const { product_id, room = 'verelo-factory-1' } = req.body;
  if (!product_id) return res.status(400).json({ error: 'product_id required' });
  
  const db = dbModule.db;
  const product = await db.get(`SELECT * FROM products WHERE id = ?`, [product_id]);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  if (product.status === 'vaulted') return res.status(400).json({ error: 'Cannot push vaulted product' });
  
  // 1. Update status to live
  await db.run(`UPDATE products SET status = 'live', updated_at = ? WHERE id = ?`, [Date.now(), product_id]);
  
  // 2. Micro-payload to LiveKit (ONLY product_id + status)
  const { updateRoomProductState } = await import('./services/livekitStateBridge.js');
  await updateRoomProductState(room, {
    id: product.id,
    sku: product.sku,
    box_type: 'standard',
    price: product.price,
    currency: 'USD',
    inventory: product.inventory_count,
    media_url: product.image_url
  });
  
  // 3. Cache in active_room_state for HTTP fallback
  const { setActiveProduct } = await import('./services/activeProductStore.js');
  await setActiveProduct(room, {
    id: product.id,
    sku: product.sku,
    box_type: 'standard',
    price: product.price,
    currency: 'USD',
    inventory: product.inventory_count,
    media_url: product.image_url,
    theme: product.product_type === 'verelo_exclusive' ? 'exclusive' : 'standard'
  });
  
  res.json({ success: true, product_id, sku: product.sku, status: 'live', room });
});


// ── 6. FALLBACK 404 ──
app.get('/debug/files', (req, res) => {
  const publicPath = join(__dirname, '..', 'public');
  const srcPath = __dirname;
  const rootPath = join(__dirname, '..');
  const result = {
    public_path: publicPath,
    public_exists: existsSync(publicPath),
    public_contents: existsSync(publicPath) ? readdirSync(publicPath) : [],
    src_path: srcPath,
    root_contents: existsSync(rootPath) ? readdirSync(rootPath) : []
  };
  res.json(result);
});
app.use((req, res) => {
  res.status(404).send(`Cannot GET ${req.path}`);
});

// ── 7. ERROR HANDLER ──
app.use((err, req, res, next) => {
  console.error('[Server Error]', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// ── 8. START ──
const PORT = process.env.PORT || 3000;
app.post('/api/token', async (req, res) => {
  const { room, identity } = req.body;
  if (!room) return res.status(400).json({ error: 'room required' });
  
  const at = new AccessToken(
    process.env.LIVEKIT_API_KEY,
    process.env.LIVEKIT_API_SECRET,
    { identity: identity || 'viewer-' + Math.random().toString(36).slice(2, 8) }
  );
  
  at.addGrant({
    roomJoin: true,
    room: room,
    canPublish: false,
    canSubscribe: true,
  });
  
  const token = await at.toJwt();
  res.json({ token, room });
});
app.listen(PORT, () => {
  console.log(`[API] Verelo Core on port ${PORT}`);
  console.log(`[ARCH] SQLite WAL + Queue Ready`);
  
  // Background workers
  startWhatsAppSyncWorker().catch(console.error);
});
