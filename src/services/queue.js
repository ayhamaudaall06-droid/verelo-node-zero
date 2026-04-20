import { createClient } from 'redis';
import { z } from 'zod';

const redis = createClient({ 
  url: process.env.REDIS_URL || 'redis://localhost:6379' 
});

redis.on('error', (err) => console.error('[REDIS] Connection error:', err));
await redis.connect();

// Outbound WhatsApp queue schema
const OutboundSchema = z.object({
  to: z.string(),
  type: z.enum(['text', 'interactive', 'template']),
  body: z.string(),
  metadata: z.object({}).optional()
});

export const outQueue = {
  async add(job) {
    const validated = OutboundSchema.parse(job);
    await redis.lPush('whatsapp:outbound', JSON.stringify(validated));
    console.log(`[QUEUE:OUT] Job queued for ${validated.to}`);
  },
  
  async get() {
    // brPop returns [key, element] or null
    const result = await redis.brPop('whatsapp:outbound', 0);
    return result ? JSON.parse(result.element) : null;
  }
};

// Inbound processor
export const inQueue = {
  async add(message) {
    await redis.lPush('whatsapp:inbound', JSON.stringify(message));
  },
  
  async process(handler) {
    console.log('[QUEUE:IN] Inbound processor started');
    while (true) {
      try {
        // brPop with timeout 0 waits indefinitely
        const result = await redis.brPop('whatsapp:inbound', 0);
        if (result) {
          const data = JSON.parse(result.element);
          await handler(data).catch(console.error);
        }
      } catch (err) {
        console.error('[QUEUE:IN] Processing error:', err);
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  }
};

export async function healthCheck() {
  try {
    await redis.ping();
    return true;
  } catch {
    return false;
  }
}

export default redis;
