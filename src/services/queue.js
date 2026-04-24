let redis = null;

async function getRedis() {
  if (redis) return redis;
  if (!process.env.REDIS_URL) return null;
  try {
    const { createClient } = await import('redis');
    redis = createClient({ url: process.env.REDIS_URL });
    redis.on('error', (err) => console.error('[REDIS] Connection error:', err));
    await redis.connect();
    return redis;
  } catch (e) {
    console.log('[Redis] Queue unavailable, using SQLite fallback');
    return null;
  }
}

export async function enqueueOutbound(message) {
  const r = await getRedis();
  if (!r) {
    console.log('[Queue] Redis unavailable, skipping outbound enqueue');
    return;
  }
  const validated = validateMessage(message);
  if (!validated) return;
  await r.lPush('whatsapp:outbound', JSON.stringify(validated));
}

export async function dequeueOutbound() {
  const r = await getRedis();
  if (!r) return null;
  const result = await r.brPop('whatsapp:outbound', 0);
  return result ? JSON.parse(result.element) : null;
}

export async function enqueueInbound(message) {
  const r = await getRedis();
  if (!r) {
    console.log('[Queue] Redis unavailable, skipping inbound enqueue');
    return;
  }
  await r.lPush('whatsapp:inbound', JSON.stringify(message));
}

export async function dequeueInbound() {
  const r = await getRedis();
  if (!r) return null;
  const result = await r.brPop('whatsapp:inbound', 0);
  return result ? JSON.parse(result.element) : null;
}

export async function healthCheck() {
  const r = await getRedis();
  if (!r) return false;
  try {
    await r.ping();
    return true;
  } catch {
    return false;
  }
}

function validateMessage(msg) {
  if (!msg || typeof msg !== 'object') return null;
  if (!msg.to || !msg.body) return null;
  return msg;
}

export default { enqueueOutbound, dequeueOutbound, enqueueInbound, dequeueInbound, healthCheck };

// Legacy compatibility export for whatsappHandler.js
export const outQueue = {
  add: enqueueOutbound
};
