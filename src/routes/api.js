import { Router } from 'express';
import crypto from 'crypto';
import redis from '../services/queue.js';

const router = Router();
const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN || 'verelo_webhook_secret_2026';
const APP_SECRET = process.env.META_APP_SECRET || '';

// ── Signature Validation ──
function verifySignature(payload, signature) {
  if (!signature || !APP_SECRET) return false;
  const expected = crypto
    .createHmac('sha256', APP_SECRET)
    .update(payload, 'utf8')
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(signature.replace('sha256=', ''), 'hex'),
    Buffer.from(expected, 'hex')
  );
}

// ── WhatsApp Verification (Meta handshake) ──
router.get('/webhook/whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('[WEBHOOK] ✅ VERIFIED');
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// ── WhatsApp Inbound (Async ACK + Signature Check + Queue) ──
router.post('/webhook/whatsapp', async (req, res) => {
  // 1. ACK immediately
  res.sendStatus(200);
  
  // 2. Validate signature
  const signature = req.headers['x-hub-signature-256'] || '';
  const payload = JSON.stringify(req.body);
  
  if (!verifySignature(payload, signature)) {
    console.warn('[WEBHOOK] ❌ Invalid signature — rejected');
    return;
  }
  
  // 3. Parse and queue
  try {
    const body = req.body;
    if (body.object === 'whatsapp_business_account') {
      await redis.lPush('whatsapp:inbound', JSON.stringify(body));
      console.log(`[WEBHOOK] ✅ Queued signed message from ${body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.from}`);
    }
  } catch (err) {
    console.error('[WEBHOOK] Queue error:', err.message);
  }
});

// ── PRODUCTS API ──
import { DatabaseSync } from 'node:sqlite';
import { join } from 'path';

const dbPath = process.env.DATABASE_PATH || join(process.cwd(), 'data', 'verelo.db');

router.get('/products', (req, res) => {
  const db = new DatabaseSync(dbPath);
  const isActive = req.query.is_active;
  let rows;
  if (isActive !== undefined) {
    rows = db.prepare('SELECT * FROM products WHERE is_active = ?').all(Number(isActive));
  } else {
    rows = db.prepare('SELECT * FROM products').all();
  }
  db.close();
  res.json({ products: rows });
});

export default router;
