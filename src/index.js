import { readdirSync, existsSync, readFileSync } from 'fs';
import crypto from 'crypto';
import { getPresignedUploadUrl } from './services/r2Presign.js';
import { AccessToken } from 'livekit-server-sdk';
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

// ── 1. STATIC FILES ──
const publicPath = join(process.cwd(), 'public');
app.use(express.static(publicPath));
console.log('[Static] Serving from:', publicPath, '- exists:', existsSync(publicPath));
app.get('/admin/products.html', (req, res) => {
  try {
    const html = readFileSync(join(publicPath, 'admin', 'products.html'), 'utf8');
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (e) { res.status(500).send('Admin File Missing'); }
});

app.get('/admin', (req, res) => res.redirect('/admin/products.html'));

// ── 2. PARSERS ──
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── 3. DATABASE & API ──
await dbModule.init();

// Explicit Admin API route to guarantee product loading
app.get('/api/admin/products', async (req, res) => {
  try {
    const products = await dbModule.db.all('SELECT * FROM products ORDER BY created_at DESC');
    res.json(products);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/admin/push-to-stream', async (req, res) => {
  const { product_id, room = 'verelo-factory-1' } = req.body;
  if (!product_id) return res.status(400).json({ error: 'product_id required' });
  
  const db = dbModule.db;
  const product = await db.get(`SELECT * FROM products WHERE id = ?`, [product_id]);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  if (product.status === 'vaulted') return res.status(400).json({ error: 'Cannot push vaulted product' });
  
  // 1. Update status to live
  await db.run(`UPDATE products SET status = 'live', updated_at = ? WHERE id = ?`, [Date.now(), product_id]);
  
  // 2. LiveKit micro-payload
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
  
  // 3. HTTP fallback cache
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
  
  // 4. Enqueue WhatsApp Meta Catalog sync (Universal ID)
  const { enqueueWhatsAppSync } = await import('./services/whatsappSyncWorker.js');
  await enqueueWhatsAppSync({
    productId: product.id,
    syncType: 'full',
    priority: 9,
    payload: {
      inventory_count: product.inventory_count,
      price: product.price,
      currency: product.currency || 'USD'
    }
  });
  
  res.json({ success: true, product_id, sku: product.sku, status: 'live', room });
});

app.use('/api', apiRoutes);
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// ── 4. WORKER ──
startWhatsAppSyncWorker();

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`[API] Verelo Core Live on ${PORT}`));
