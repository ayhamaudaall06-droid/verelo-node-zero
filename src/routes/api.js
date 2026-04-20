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

export default router;
