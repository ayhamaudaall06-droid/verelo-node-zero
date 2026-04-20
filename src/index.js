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
  res.sendFile(join(__dirname, '..', 'public', 'live.html'));
});

// ── 2. PARSERS ──
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// ── 3. DATABASE ──
await dbModule.init();

// ── 4. HEALTH ──
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
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'verelo-api', time: Date.now() }));
app.get('/ready', async (req, res) => {
  const dbOk = await dbModule.healthCheck().catch(() => false);
  res.status(dbOk ? 200 : 503).json({ status: dbOk ? 'ready' : 'not_ready', db: dbOk });
});

// ── 5. API ROUTES ──
app.use('/api', apiRoutes);

// ── 6. FALLBACK 404 ──
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
app.listen(PORT, () => {
  console.log(`[API] Verelo Core on port ${PORT}`);
  console.log(`[ARCH] SQLite WAL + Queue Ready`);
  
  // Background workers
  startWhatsAppSyncWorker().catch(console.error);
});
