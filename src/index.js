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
const publicPath = join(__dirname, '..', 'public');
app.use(express.static(publicPath));

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

app.use('/api', apiRoutes);
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// ── 4. WORKER ──
startWhatsAppSyncWorker();

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`[API] Verelo Core Live on ${PORT}`));
