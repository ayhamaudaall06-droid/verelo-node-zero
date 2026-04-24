import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import redis from './queue.js';
import { getSession, saveSession } from './sessionStore.js';
import { isDuplicate, markProcessed } from './idempotencyStore.js';
import { detectIntent } from '../agents/intentEngine.js';
import {
  welcomeMessage, productListMessage, productCard,
  boxSummary, orderConfirmation, plainText
} from '../agents/messageFormatter.js';
import { sendMessage } from './whatsappSender.js';

const dbPath = process.env.DATABASE_PATH || join(process.cwd(), 'data', 'verelo.db');

// CRITICAL: Create directory BEFORE opening DB
const dbDir = dirname(dbPath);
if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true });

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL;');

// Idempotency key: phone + messageId (Meta guarantees unique message IDs)
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

  // 1. Idempotency check
  const idemKey = idempotencyKey(phone, messageId);
  if (isDuplicate(idemKey)) {
    console.log(`[CommerceWorker] Duplicate message ${messageId} — skipped`);
    return;
  }

  // 2. Load session
  const session = await getSession(phone);

  // 3. Detect intent
  const { intent, data } = detectIntent(text);

  // 4. Act + Respond
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
      if (products.length === 0) {
        responsePayload = plainText('No products available right now. Check back soon!');
      } else {
        responsePayload = productListMessage(products);
        session.lastIntent = 'browse';
        session.lastProducts = products.map(p => ({ id: p.id, name: p.name, price: p.price, currency: p.currency }));
      }
      break;
    }

    case 'select_by_index': {
      const product = await findProductByIndex(data.index);
      if (!product) {
        responsePayload = plainText(`I couldn't find product #${data.index}. Try "browse" to see the list.`);
      } else {
        responsePayload = productCard(product);
        session.lastProductId = product.id;
        session.lastIntent = 'view_product';
      }
      break;
    }

    case 'add_item': {
      let product = null;
      if (/^\d+$/.test(data.query)) {
        product = await findProductByIndex(parseInt(data.query));
      } else {
        product = await findProductByQuery(data.query);
      }
      
      if (!product) {
        responsePayload = plainText(`I couldn't find "${data.query}". Try "browse" to see available products.`);
      } else if (session.box.find(i => i.id === product.id)) {
        responsePayload = plainText(`${product.name} is already in your box.`);
      } else {
        session.box.push({
          id: product.id,
          sku: product.sku,
          name: product.name,
          price: product.price,
          currency: product.currency || 'USD',
          image: product.primary_image
        });
        responsePayload = plainText(`✅ Added *${product.name}* to your box.\n\nType "box" to view or "checkout" to order.`);
        session.lastIntent = 'add_item';
      }
      break;
    }

    case 'show_box': {
      if (session.box.length === 0) {
        responsePayload = plainText('Your box is empty. Type "browse" to shop.');
      } else {
        const total = calculateTotal(session.box);
        responsePayload = boxSummary(session.box, total);
        session.lastIntent = 'show_box';
      }
      break;
    }

    case 'remove_item': {
      const idx = session.box.findIndex(i => 
        i.name.toLowerCase().includes(data.query.toLowerCase()) || 
        i.id === data.query
      );
      if (idx === -1) {
        responsePayload = plainText(`I don't see "${data.query}" in your box.`);
      } else {
        const removed = session.box.splice(idx, 1)[0];
        responsePayload = plainText(`🗑 Removed *${removed.name}* from your box.`);
      }
      session.lastIntent = 'remove_item';
      break;
    }

    case 'checkout': {
      if (session.box.length === 0) {
        responsePayload = plainText('Your box is empty. Add products first with "browse".');
        break;
      }
      
      const total = calculateTotal(session.box);
      const currency = session.box[0]?.currency || 'USD';
      const orderId = 'ORD-' + Date.now().toString(36).toUpperCase();
      
      db.prepare(`
        INSERT INTO orders (id, items_json, total, currency, status, source, created_at)
        VALUES (?, ?, ?, ?, 'pending', 'whatsapp', ?)
      `).run(
        orderId,
        JSON.stringify(session.box),
        total,
        currency,
        Math.floor(Date.now() / 1000)
      );
      
      actionResult = { orderId, total, currency };
      responsePayload = orderConfirmation(orderId, total, currency);
      session.box = []; // Clear box after order
      session.lastIntent = 'checkout';
      break;
    }

    case 'confirm': {
      responsePayload = plainText('Your order is being processed. You\'ll receive updates here.');
      session.lastIntent = 'confirm';
      break;
    }

    case 'cancel': {
      await clearSession(phone);
      responsePayload = plainText('Session ended. Type "hi" anytime to start again.');
      return; // Don't save session
    }

    default: {
      responsePayload = plainText(`I'm not sure what you mean. Try:\n• "browse" — see products\n• "box" — view your items\n• "checkout" — place order\n• "help" — full commands`);
      session.lastIntent = 'unknown';
    }
  }

  // 5. Send response
  if (responsePayload) {
    await sendMessage(phone, responsePayload);
  }

  // 6. Save session + mark processed
  session.history.push({ intent, text: text.slice(0, 100), at: Date.now() });
  if (session.history.length > 20) session.history.shift();
  await saveSession(phone, session);
  markProcessed(idemKey, intent, actionResult);
}

// Worker loop
export async function startCommerceWorker() {
  console.log('[CommerceWorker] Starting WhatsApp commerce worker...');
  
  while (true) {
    try {
      const job = await redis.brPop('whatsapp:inbound', 0);
      if (job && job.element) {
        const payload = JSON.parse(job.element);
        await processInboundMessage(payload);
      }
    } catch (err) {
      console.error('[CommerceWorker] Error:', err.message);
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}
