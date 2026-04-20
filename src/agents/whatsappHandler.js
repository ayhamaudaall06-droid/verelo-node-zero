import { outQueue } from '../services/queue.js';
import crypto from 'crypto';

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_ID;

export async function sendMessage(to, text, context = {}) {
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: to,
    type: 'text',
    text: { body: text }
  };

  await outQueue.add({
    to,
    type: 'text',
    body: text,
    metadata: { ...payload, ...context }
  });
}

export async function verifyWebhook(mode, token, challenge) {
  const verifyToken = process.env.WEBHOOK_VERIFY_TOKEN;
  if (mode === 'subscribe' && token === verifyToken) {
    return challenge;
  }
  throw new Error('Webhook verification failed');
}

export function parseInboundMessage(body) {
  const entry = body.entry?.[0];
  const change = entry?.changes?.[0];
  const value = change?.value;
  const message = value?.messages?.[0];
  
  if (!message) return null;

  return {
    id: message.id,
    from: message.from,
    timestamp: message.timestamp,
    type: message.type,
    text: message.text?.body || null,
    context: message.context || null,
    raw: message
  };
}
