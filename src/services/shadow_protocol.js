import dbModule from './db.js';
import { updateRoomProductState } from './livekitStateBridge.js';
import { enqueueWhatsAppSync } from './whatsappSyncWorker.js';
import { setActiveProduct } from './activeProductStore.js';

const DEFAULT_ROOM = 'verelo-factory-1';

export const BOX_TYPES = ['trending', 'factory', 'limited', 'vault'];

export class ShadowProtocol {
  constructor(boxId, phoneNumber = 'test_user') {
    this.boxId = boxId;
    this.phoneNumber = phoneNumber;
  }

  async getBoxState() {
    const db = dbModule.db;
    const products = await db.all(
      `SELECT * FROM products WHERE box_type = ? AND is_active = 1 ORDER BY updated_at DESC LIMIT 10`,
      [this.boxId]
    );
    return {
      box_id: this.boxId,
      products,
      count: products.length
    };
  }
}

export async function evaluateBoxTransition(product) {
  const previousBox = product.box_type;
  let newBox = previousBox;

  if (product.inventory_count <= 0) {
    newBox = 'vault';
  } else if (product.inventory_count <= 5) {
    newBox = 'limited';
  } else if (product.view_count > 1000 && product.box_type === 'factory') {
    newBox = 'trending';
  }

  if (newBox !== previousBox) {
    const db = dbModule.db;
    await db.run(
      `UPDATE products SET box_type = ?, updated_at = ? WHERE id = ?`,
      [newBox, Date.now(), product.id]
    );
    console.log(`[Shadow] ${product.id}: ${previousBox} → ${newBox}`);
  }

  return { ...product, box_type: newBox, previous_box: previousBox };
}

export async function onProductStateChange(product, previousBoxType = null) {
  const box = product.box_type || 'factory';

  // 1. HTTP Fallback (for empty rooms / late joiners)
  await setActiveProduct(DEFAULT_ROOM, {
    id: product.id,
    sku: product.sku,
    box_type: box,
    price: product.price,
    currency: product.currency || 'USD',
    inventory: product.inventory_count,
    media_url: product.primary_media_url || product.cdn_url,
    theme: box === 'limited' ? 'urgency' : box === 'trending' ? 'trending' : 'standard'
  });

  // 2. LiveKit persistent metadata
  await updateRoomProductState(DEFAULT_ROOM, {
    id: product.id,
    sku: product.sku,
    box_type: box,
    price: product.price,
    currency: product.currency || 'USD',
    inventory: product.inventory_count,
    media_url: product.primary_media_url || product.cdn_url
  });

  // 3. WhatsApp debounced sync
  const criticalInv = [50, 20, 10, 5, 0].includes(product.inventory_count);
  const premiumBox = box === 'limited' || box === 'vault';

  if (criticalInv || premiumBox) {
    await enqueueWhatsAppSync({
      productId: product.id,
      syncType: 'inventory',
      priority: criticalInv ? 9 : 5,
      payload: {
        inventory_count: product.inventory_count,
        price: product.price,
        currency: product.currency || 'USD'
      }
    });
  }
}
