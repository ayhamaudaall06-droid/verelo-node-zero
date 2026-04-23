// === ADD THESE IMPORTS AT THE TOP of src/index.js ===
import { setActiveProduct, clearActiveProduct, getActiveProductFromDB } from './services/livekitProductBridge.js';

// === ADD THESE ROUTES BEFORE app.listen() ===

// ── LIVEKIT ROOM METADATA ──
app.post('/api/livekit/room-metadata', async (req, res) => {
  const { room, productId, action } = req.body;
  if (!room) return res.status(400).json({ error: 'room required' });
  
  if (action === 'clear') {
    const result = await clearActiveProduct(room);
    return res.json(result);
  }
  
  if (!productId) return res.status(400).json({ error: 'productId required' });
  const result = await setActiveProduct(room, productId);
  res.status(result.ok ? 200 : 500).json(result);
});

app.get('/api/livekit/room-metadata', async (req, res) => {
  const { room } = req.query;
  if (!room) return res.status(400).json({ error: 'room required' });
  
  // Read back from LiveKit (optional, for verification)
  res.json({ room, note: 'Use LiveKit client SDK to read metadata in real-time' });
});

// ── ACTIVE PRODUCT (lightweight polling fallback) ──
let activeProductCache = null;

app.post('/api/active-product', (req, res) => {
  const { productId } = req.body;
  activeProductCache = getActiveProductFromDB(productId);
  res.json({ ok: true, product: activeProductCache });
});

app.get('/api/active-product', (req, res) => {
  res.json({ product: activeProductCache });
});

// ── BOX / ORDER (Single Box Logic) ──
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
  
  // Stub: enqueue WhatsApp notification
  console.log(`[WhatsApp Stub] Would notify customer about order ${req.params.id}`);
  
  res.json({ ok: true, order, whatsapp_status: 'queued' });
});
