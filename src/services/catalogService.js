import { getDatabase } from './db.js';

class CatalogService {
  constructor() {
    // In-memory hot cache
    this.trendCache = new Map();
    this.streamCache = new Map();
  }

  async getProductWithStream(skuId) {
    const db = getDatabase();
    
    // Get product from catalog_mirror
    const product = await db.get(
      'SELECT * FROM catalog_mirror WHERE sku_id = ?',
      [skuId]
    );
    
    if (!product) return null;
    
    // Check for active stream
    const stream = await db.get(
      'SELECT * FROM stream_registry WHERE sku_id = ? AND status = ?',
      [skuId, 'LIVE']
    );
    
    return {
      ...product,
      live_stream: stream ? {
        stream_id: stream.stream_id,
        url: stream.webrtc_url || stream.rtmp_url,
        camera_location: stream.camera_location,
        is_live: true,
        protocol: stream.webrtc_url ? 'webrtc' : 'rtmp'
      } : null,
      decision_point: stream ? 'DUAL' : 'DIRECT_ONLY'
    };
  }

  async searchProducts(query, branchType) {
    const db = getDatabase();
    const results = [];
    
    const rows = await db.all(
      'SELECT * FROM catalog_mirror WHERE name LIKE ? OR category LIKE ? LIMIT 20',
      [`%${query}%`, `%${query}%`]
    );
    
    for (const product of rows) {
      const stream = await db.get(
        'SELECT stream_id, camera_location, status FROM stream_registry WHERE sku_id = ? AND status = ?',
        [product.sku_id, 'LIVE']
      );
      
      results.push({
        ...product,
        is_live: !!stream,
        camera_location: stream?.camera_location || null
      });
    }
    
    return results;
  }

  async getLiveStreams() {
    const db = getDatabase();
    return await db.all(
      'SELECT * FROM stream_registry WHERE status = ?',
      ['LIVE']
    );
  }

  async recordStreamJoin(sessionId, streamId, skuId) {
    const db = getDatabase();
    await db.run(
      `INSERT INTO stream_sessions (session_id, stream_id, sku_id, joined_at)
       VALUES (?, ?, ?, ?)`,
      [sessionId, streamId, skuId, Date.now()]
    );
  }

  async recordStreamLeave(sessionId, addedToBox = false) {
    const db = getDatabase();
    await db.run(
      `UPDATE stream_sessions 
       SET left_at = ?, added_to_box = ?
       WHERE session_id = ? AND left_at IS NULL`,
      [Date.now(), addedToBox, sessionId]
    );
  }
}

export { CatalogService };
export default CatalogService;
