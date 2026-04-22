import { readdirSync, existsSync, readFileSync } from 'fs';
import crypto from 'crypto';
import { getPresignedUploadUrl } from './services/r2Presign.js';
import { AccessToken } from 'livekit-server-sdk';
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
const publicPath = join(process.cwd(), 'public');

console.log('[Static] Serving from:', publicPath, '- exists:', existsSync(publicPath));

// ── STATIC FILES ──
app.use(express.static(publicPath));

// Explicit HTML routes (guaranteed to work regardless of static middleware)
app.get('/live.html', (req, res) => {
  res.sendFile(join(publicPath, 'live.html'));
});

app.get('/admin/products.html', (req, res) => {
  try {
    const html = readFileSync(join(publicPath, 'admin', 'products.html'), 'utf8');
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (e) {
    res.status(500).send('Admin File Missing: ' + e.message);
  }
});

app.get('/admin', (req, res) => res.redirect('/admin/products.html'));

// ── PARSERS ──
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// ── DATABASE ──
await dbModule.init();

// ── HEALTH ──
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'verelo-api', time: Date.now() }));
app.get('/ready', async (req, res) => {
  const dbOk = await dbModule.healthCheck().catch(() => false);
  res.status(dbOk ? 200 : 503).json({ status: dbOk ? 'ready' : 'not_ready', db: dbOk });
});

// ── ADMIN API ──
app.post('/api/admin/upload-url', async (req, res) => {
  const { filename, contentType } = req.body;
  if (!filename || !contentType) return res.status(400).json({ error: 'filename and contentType required' });
  try {
    const urlData = await getPresignedUploadUrl(filename, contentType);
    res.json(urlData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/categories', async (req, res) => {
  const db = dbModule.db;
  const cats = await db.all(`SELECT * FROM categories WHERE is_active = 1 ORDER BY name`);
  res.json(cats);
});

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

app.post('/api/admin/products', async (req, res) => {
  const { sku, name, price, inventory_count, category_id, product_type, image_url } = req.body;
  if (!sku || !name || price === undefined) return res.status(400).json({ error: 'sku, name, price required' });
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

app.post('/api/admin/push-to-stream', async (req, res) => {
  const { product_id, room = 'verelo-factory-1' } = req.body;
  if (!product_id) return res.status(400).json({ error: 'product_id required' });
  
  const db = dbModule.db;
  const product = await db.get(`SELECT * FROM products WHERE id = ?`, [product_id]);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  if (product.status === 'vaulted') return res.status(400).json({ error: 'Cannot push vaulted product' });
  
  await db.run(`UPDATE products SET status = 'live', updated_at = ? WHERE id = ?`, [Date.now(), product_id]);
  
  const { updateRoomProductState } = await import('./services/livekitStateBridge.js');
  await updateRoomProductState(room, {
    id: product.id, sku: product.sku, box_type: 'standard',
    price: product.price, currency: 'USD',
    inventory: product.inventory_count, media_url: product.image_url
  });
  
  const { setActiveProduct } = await import('./services/activeProductStore.js');
  await setActiveProduct(room, {
    id: product.id, sku: product.sku, box_type: 'standard',
    price: product.price, currency: 'USD',
    inventory: product.inventory_count, media_url: product.image_url,
    theme: product.product_type === 'verelo_exclusive' ? 'exclusive' : 'standard'
  });
  
  const { enqueueWhatsAppSync } = await import('./services/whatsappSyncWorker.js');
  await enqueueWhatsAppSync({
    productId: product.id, syncType: 'full', priority: 9,
    payload: { inventory_count: product.inventory_count, price: product.price, currency: product.currency || 'USD' }
  });
  
  res.json({ success: true, product_id, sku: product.sku, status: 'live', room });
});

// ── API ROUTES ──
app.use('/api', apiRoutes);

// ── ACTIVE PRODUCT ──
app.get('/api/active-product', async (req, res) => {
  const room = req.query.room || 'verelo-factory-1';
  try {
    const product = await getActiveProduct(room);
    if (!product) return res.status(404).json({ error: 'No active product' });
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── TOKEN ──
app.post('/api/token', async (req, res) => {
  const { room, identity } = req.body;
  if (!room) return res.status(400).json({ error: 'room required' });
  const at = new AccessToken(
    process.env.LIVEKIT_API_KEY,
    process.env.LIVEKIT_API_SECRET,
    { identity: identity || 'viewer-' + Math.random().toString(36).slice(2, 8) }
  );
  at.addGrant({ roomJoin: true, room: room, canPublish: false, canSubscribe: true });
  const token = await at.toJwt();
  res.json({ token, room });
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

// ── 404 ──
app.use((req, res) => res.status(404).send(`Cannot GET ${req.path}`));

// ── ERROR ──
app.use((err, req, res, next) => {
  console.error('[Server Error]', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// ── START ──
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`[API] Verelo Core Live on ${PORT}`);
  startWhatsAppSyncWorker().catch(console.error);
});
