import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { dequeueInbound } from './queue.js';
import { getSession, saveSession } from './sessionStore.js';
import { isDuplicate, markProcessed } from './idempotencyStore.js';
import { detectIntent } from '../agents/intentEngine.js';
import {
  welcomeMessage, productListMessage, productCard,
  boxSummary, orderConfirmation, plainText
} from '../agents/messageFormatter.js';
import { sendMessage } from './whatsappSender.js';

const dbPath = process.env.DATABASE_PATH || join(process.cwd(), 'data', 'verelo.db');
const dbDir = dirname(dbPath);
if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true });

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL;');

function idempotencyKey(phone, messageId) {
  return `whatsapp:idempotency:${phone}:${messageId}`;
}

async function getProducts(limit = 5) {
  return db.prepare('SELECT * FROM products WHERE is_active = 1 ORDER BY created_at DESC LIMIT ?').all(limit);
}

async function findProductByQuery(query) {
  const all = db.prepare('SELECT * FROM products WHERE is_active = 1').all();
  const lower = query.toLowerCase();
  return all.find(p => p.name.toLowerCase().includes(lower) || p.sku?.toLowerCase() === lower);
}

async function findProductByIndex(index) {
  const all = db.prepare('SELECT * FROM products WHERE is_active = 1 ORDER BY created_at DESC').all();
  return all[index - 1] || null;
}

function calculateTotal(box) {
  return box.reduce((sum, item) => sum + parseFloat(item.price || 0), 0);
}

export async function processInboundMessage(payload) {
  const entry = payload.entry?.[0]?.changes?.[0]?.value;
  if (!entry || !entry.messages) return;

  const message = entry.messages[0];
  const phone = message.from;
  const messageId = message.id;
  const text = message.text?.body || '';
  const name = entry.contacts?.[0]?.profile?.name || 'there';

  const idemKey = idempotencyKey(phone, messageId);
  if (isDuplicate(idemKey)) {
    console.log(`[CommerceWorker] Duplicate ${messageId} — skipped`);
    return;
  }

  const session = await getSession(phone);
  const { intent, data } = detectIntent(text);
  let responsePayload = null;
  let actionResult = null;

  switch (intent) {
    case 'welcome':
    case 'help': {
      responsePayload = welcomeMessage(name);
      session.lastIntent = 'welcome';
      break;
    }
    case 'browse': {
      const products = await getProducts(5);
      responsePayload = products.length ? productListMessage(products) : plainText('No products available.');
      session.lastIntent = 'browse';
      session.lastProducts = products.map(p => ({ id: p.id, name: p.name, price: p.price, currency: p.currency }));
      break;
    }
    case 'select_by_index': {
      const product = await findProductByIndex(data.index);
      if (!product) responsePayload = plainText(`Product #${data.index} not found.`);
      else {
        responsePayload = productCard(product);
        session.lastProductId = product.id;
        session.lastIntent = 'view_product';
      }
      break;
    }
    case 'add_item': {
      let product = null;
      if (/^\d+$/.test(data.query)) product = await findProductByIndex(parseInt(data.query));
      else product = await findProductByQuery(data.query);
      if (!product) responsePayload = plainText(`"${data.query}" not found. Try "browse".`);
      else if (session.box.find(i => i.id === product.id)) responsePayload = plainText(`${product.name} already in box.`);
      else {
        session.box.push({ id: product.id, sku: product.sku, name: product.name, price: product.price, currency: product.currency || 'USD', image: product.primary_image });
        responsePayload = plainText(`✅ Added *${product.name}*. Type "box" or "checkout".`);
        session.lastIntent = 'add_item';
      }
      break;
    }
    case 'show_box': {
      if (session.box.length === 0) responsePayload = plainText('Box empty. Type "browse".');
      else {
        responsePayload = boxSummary(session.box, calculateTotal(session.box));
        session.lastIntent = 'show_box';
      }
      break;
    }
    case 'remove_item': {
      const idx = session.box.findIndex(i => i.name.toLowerCase().includes(data.query.toLowerCase()) || i.id === data.query);
      if (idx === -1) responsePayload = plainText(`"${data.query}" not in box.`);
      else {
        const removed = session.box.splice(idx, 1)[0];
        responsePayload = plainText(`🗑 Removed *${removed.name}*.`);
      }
      session.lastIntent = 'remove_item';
      break;
    }
    case 'checkout': {
      if (session.box.length === 0) {
        responsePayload = plainText('Box empty. Add products first.');
        break;
      }
      const total = calculateTotal(session.box);
      const currency = session.box[0]?.currency || 'USD';
      const orderId = 'ORD-' + Date.now().toString(36).toUpperCase();
      db.prepare(`INSERT INTO orders (id, items_json, total, currency, status, source, created_at) VALUES (?, ?, ?, ?, 'pending', 'whatsapp', ?)`)
        .run(orderId, JSON.stringify(session.box), total, currency, Math.floor(Date.now() / 1000));
      actionResult = { orderId, total, currency };
      responsePayload = orderConfirmation(orderId, total, currency);
      session.box = [];
      session.lastIntent = 'checkout';
      break;
    }
    case 'confirm': {
      responsePayload = plainText('Order processing. Updates coming soon.');
      session.lastIntent = 'confirm';
      break;
    }
    case 'cancel': {
      await clearSession(phone);
      responsePayload = plainText('Session ended. Type "hi" to restart.');
      return;
    }
    default: {
      responsePayload = plainText(`Try: "browse", "box", "checkout", or "help".`);
      session.lastIntent = 'unknown';
    }
  }

  if (responsePayload) await sendMessage(phone, responsePayload);
  session.history.push({ intent, text: text.slice(0, 100), at: Date.now() });
  if (session.history.length > 20) session.history.shift();
  await saveSession(phone, session);
  markProcessed(idemKey, intent, actionResult);
}

export async function startCommerceWorker() {
  console.log('[CommerceWorker] Starting...');
  while (true) {
    try {
      const payload = await dequeueInbound();
      if (payload) {
        await processInboundMessage(payload);
      } else {
        // No message, wait a bit before polling again
        await new Promise(r => setTimeout(r, 100));
      }
    } catch (err) {
      console.error('[CommerceWorker] Error:', err.message);
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}
