// src/services/livekitProductBridge.js
import { RoomServiceClient } from 'livekit-server-sdk';
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbDir = join(__dirname, '..', '..', 'data');
const dbPath = join(dbDir, 'verelo.db');

if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL;');

const LIVEKIT_URL = process.env.LIVEKIT_URL || 'wss://verelo.livekit.cloud';
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || '';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || '';

const roomService = new RoomServiceClient(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

/**
 * Set the active product for a LiveKit room.
 * This writes product metadata into the room so all participants receive it.
 */
export async function setActiveProduct(roomName, productId) {
  if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    console.warn('[LiveKitBridge] Missing credentials — metadata not synced');
    return { ok: false, error: 'Missing LiveKit credentials' };
  }

  // Fetch product with media
  const product = db.prepare(`
    SELECT p.*, pm.url as primary_image
    FROM products p
    LEFT JOIN product_media pm ON pm.product_id = p.id AND pm.is_primary = 1
    WHERE p.id = ? AND p.is_active = 1
  `).get(productId);

  if (!product) {
    return { ok: false, error: 'Product not found or inactive' };
  }

  // Parse metadata_json
  let meta = {};
  try { meta = JSON.parse(product.metadata_json || '{}'); } catch {}

  const payload = {
    verelo_product: {
      id: product.id,
      sku: product.sku,
      name: product.name,
      description: product.description,
      price: product.price,
      currency: product.currency,
      category: product.category,
      box_type: product.box_type,
      size: product.size,
      color: product.color,
      material: product.material,
      image: product.primary_image,
      customization_options: meta.customization || [],
      updated_at: Date.now()
    }
  };

  try {
    await roomService.updateRoomMetadata(roomName, JSON.stringify(payload));
    
    // Log to sync_state
    db.prepare(`
      INSERT INTO sync_state (product_id, target_platform, status, payload_hash, synced_at)
      VALUES (?, 'livekit', 'synced', ?, ?)
    `).run(productId, product.id, Math.floor(Date.now() / 1000));
    
    console.log(`[LiveKitBridge] Product "${product.name}" pushed to room "${roomName}"`);
    return { ok: true, product: payload.verelo_product };
  } catch (err) {
    console.error('[LiveKitBridge] Failed to update room metadata:', err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Clear active product from room (when stream ends).
 */
export async function clearActiveProduct(roomName) {
  if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) return { ok: false };
  
  try {
    await roomService.updateRoomMetadata(roomName, JSON.stringify({ verelo_product: null }));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Get currently active product for a room (fallback read from DB if needed).
 */
export function getActiveProductFromDB(productId) {
  return db.prepare(`
    SELECT p.*, pm.url as primary_image
    FROM products p
    LEFT JOIN product_media pm ON pm.product_id = p.id AND pm.is_primary = 1
    WHERE p.id = ? AND p.is_active = 1
  `).get(productId);
}

export { db };
