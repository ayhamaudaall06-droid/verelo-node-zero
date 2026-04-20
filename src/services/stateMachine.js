import { getDatabase } from './db.js';

const ALLOWED_TRANSITIONS = {
  'ACQUIRED': ['INTENT_CAP'],
  'INTENT_CAP': ['QUALIFIED'],
  'QUALIFIED': ['CURATED_SELECTED', 'DYNAMIC_ASSEMBLING'],
  'CURATED_SELECTED': ['COMMITTED', 'DYNAMIC_ASSEMBLING'],
  'DYNAMIC_ASSEMBLING': ['PRODUCT_SELECTED', 'WATCHING_STREAM', 'CUSTOMIZING', 'COMMITTED'],
  'PRODUCT_SELECTED': ['WATCHING_STREAM', 'DYNAMIC_ASSEMBLING'],
  'WATCHING_STREAM': ['DYNAMIC_ASSEMBLING'],
  'CUSTOMIZING': ['VALIDATED', 'DYNAMIC_ASSEMBLING'],
  'VALIDATED': ['COMMITTED'],
  'COMMITTED': ['FULFILLMENT_BRIDGE']
};

class StateMachine {
  constructor(options = {}) {
    this.maxCacheSize = options.maxCacheSize || 100;
    this.archiveThreshold = options.archiveThreshold || 80;
    this.sessionCache = new Map();
    this.accessOrder = [];
    this.totalTransitions = 0;
    this.archivedCount = 0;
    this.emergencyMode = false;
    this.lastMemoryWarning = 0;
  }

  async _getSessionWithCache(sessionId) {
    if (this.sessionCache.has(sessionId)) {
      this._touchSession(sessionId);
      return this.sessionCache.get(sessionId);
    }
    const db = getDatabase();
    const session = await db.get(
      'SELECT state, branch_type, box_config_json, last_vector_clock, updated_at FROM current_sessions WHERE session_id = ?',
      [sessionId]
    );
    if (session) {
      this._addToCache(sessionId, session);
    }
    return session || null;
  }

  _touchSession(sessionId) {
    const idx = this.accessOrder.indexOf(sessionId);
    if (idx > -1) {
      this.accessOrder.splice(idx, 1);
    }
    this.accessOrder.push(sessionId);
  }

  _addToCache(sessionId, sessionData) {
    if (this.sessionCache.size >= this.maxCacheSize) {
      this._evictLRU();
    }
    if (this.sessionCache.size >= this.archiveThreshold) {
      this._logMemoryPressure();
    }
    this.sessionCache.set(sessionId, sessionData);
    this._touchSession(sessionId);
  }

  _evictLRU() {
    if (this.accessOrder.length === 0) return;
    const oldestId = this.accessOrder.shift();
    this.sessionCache.delete(oldestId);
  }

  _logMemoryPressure() {
    const now = Date.now();
    if (now - this.lastMemoryWarning < 60000) return;
    this.lastMemoryWarning = now;
    console.warn(`[SM MEMORY] Pressure: ${this.sessionCache.size}/${this.maxCacheSize}`);
    if (this.sessionCache.size >= this.maxCacheSize * 0.9) {
      this._asyncArchiveOldSessions();
    }
  }

  async _asyncArchiveOldSessions() {
    const db = getDatabase();
    const cutoff = Date.now() - (24 * 60 * 60 * 1000);
    try {
      const result = await db.run(
        'INSERT INTO archived_sessions SELECT * FROM current_sessions WHERE updated_at < ? AND state IN (?, ?)',
        [cutoff, 'COMMITTED', 'FULFILLMENT_BRIDGE']
      );
      if (result.changes > 0) {
        await db.run(
          'DELETE FROM current_sessions WHERE updated_at < ? AND state IN (?, ?)',
          [cutoff, 'COMMITTED', 'FULFILLMENT_BRIDGE']
        );
        this.archivedCount += result.changes;
        console.log(`[SM ARCHIVE] Archived ${result.changes} stale sessions`);
      }
    } catch (err) {
      console.error('[SM ARCHIVE] Failed:', err.message);
    }
  }

  async transition(sessionId, idempotencyKey, targetState, payload = {}, vectorClock = 0) {
    if (this.emergencyMode && !['COMMITTED', 'FULFILLMENT_BRIDGE'].includes(targetState)) {
      throw new Error('EMERGENCY_MODE: System under memory pressure, try again in 30s');
    }

    const db = getDatabase();
    
    const existing = await db.get(
      'SELECT to_state, vector_clock FROM state_events WHERE session_id = ? AND idempotency_key = ?',
      [sessionId, idempotencyKey]
    );
    
    if (existing) {
      return { status: 'IDEMPOTENT', state: existing.to_state, vector_clock: existing.vector_clock };
    }

    const current = await this._getSessionWithCache(sessionId);
    const fromState = current?.state || 'ACQUIRED';
    const currentVector = current?.last_vector_clock || 0;

    console.log(`[SM] ${sessionId}: ${fromState} -> ${targetState}`);

    if (!ALLOWED_TRANSITIONS[fromState]?.includes(targetState)) {
      throw new Error(`INVALID_TRANSITION: ${fromState} -> ${targetState}`);
    }

    let enrichedPayload = { ...payload };
    
    if (fromState === 'CURATED_SELECTED' && targetState === 'DYNAMIC_ASSEMBLING') {
      const boxId = payload.source_box_id || JSON.parse(current?.box_config_json || '{}').box_id;
      const boxData = await this.getBoxContents(boxId);
      
      enrichedPayload = {
        ...payload,
        inherited_from: boxId,
        inherited_items: boxData.map(item => ({ ...item, inherited: true, locked_price: item.unit_price })),
        inheritance_active: true,
        cart_items: boxData,
        branch_type: 'DYNAMIC'
      };
    }
    
    if (targetState === 'WATCHING_STREAM') {
      enrichedPayload.stream_start_time = Date.now();
      enrichedPayload.stream_active = true;
    }
    
    if (fromState === 'WATCHING_STREAM' && targetState === 'DYNAMIC_ASSEMBLING') {
      const prevPayload = JSON.parse(current?.box_config_json || '{}');
      if (prevPayload.stream_start_time) {
        enrichedPayload.stream_duration_ms = Date.now() - prevPayload.stream_start_time;
        enrichedPayload.stream_completed = true;
      }
    }

    const branchType = enrichedPayload.branch_type || 
                      (targetState === 'CURATED_SELECTED' ? 'CURATED' : current?.branch_type) ||
                      'CURATED';

    await db.run('BEGIN TRANSACTION');
    
    try {
      await db.run(
        'INSERT INTO state_events (session_id, idempotency_key, from_state, to_state, payload_json, vector_clock, timestamp_ms) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [sessionId, idempotencyKey, fromState, targetState, JSON.stringify(enrichedPayload), currentVector + 1, Date.now()]
      );

      await db.run(
        'INSERT OR REPLACE INTO current_sessions (session_id, state, branch_type, box_config_json, last_vector_clock, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        [sessionId, targetState, branchType, JSON.stringify(enrichedPayload), currentVector + 1, Date.now()]
      );

      await db.run('COMMIT');
      
      this._addToCache(sessionId, {
        state: targetState,
        branch_type: branchType,
        box_config_json: JSON.stringify(enrichedPayload),
        last_vector_clock: currentVector + 1,
        updated_at: Date.now()
      });

      this.totalTransitions++;
      if (this.totalTransitions % 100 === 0) {
        this._asyncArchiveOldSessions();
      }
      
      console.log(`[SM] Committed: ${sessionId} -> ${targetState}`);
      
      return {
        status: 'COMMITTED',
        state: targetState,
        vector_clock: currentVector + 1,
        inheritance_applied: enrichedPayload.inheritance_active || false,
        stream_metrics: enrichedPayload.stream_duration_ms || null,
        memory_stats: {
          cached: this.sessionCache.size,
          archived: this.archivedCount,
          pressure: this.sessionCache.size >= this.archiveThreshold ? 'HIGH' : 'NORMAL'
        }
      };
      
    } catch (err) {
      await db.run('ROLLBACK');
      console.error(`[SM] ROLLBACK: ${err.message}`);
      throw err;
    }
  }

  async getBoxContents(boxId) {
    const db = getDatabase();
    const box = await db.get('SELECT contents_json FROM box_registry WHERE box_id = ?', [boxId]);
    if (!box) throw new Error(`BOX_NOT_FOUND: ${boxId}`);
    try {
      return JSON.parse(box.contents_json);
    } catch {
      throw new Error(`INVALID_BOX_DATA: ${boxId}`);
    }
  }

  async getCurrentState(sessionId) {
    return await this._getSessionWithCache(sessionId);
  }

  getMemoryStats() {
    return {
      cached_sessions: this.sessionCache.size,
      max_cache_size: this.maxCacheSize,
      threshold: this.archiveThreshold,
      archived_total: this.archivedCount,
      emergency_mode: this.emergencyMode,
      lru_order_length: this.accessOrder.length
    };
  }

  async commit(sessionId, idempotencyKey, commitMode, voiceBuffer, vectorClock) {
    const { VoiceService } = await import('./voiceService.js');
    const voiceService = new VoiceService();
    const commitResult = await voiceService.processCommit(sessionId, commitMode, voiceBuffer);
    
    return await this.transition(
      sessionId,
      idempotencyKey,
      'COMMITTED',
      {
        commit_mode: commitResult.mode,
        voice_file_path: commitResult.file_path,
        commit_metadata: commitResult.metadata
      },
      vectorClock
    );
  }
}

export { StateMachine };
