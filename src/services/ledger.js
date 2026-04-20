import { getDatabase } from './db.js';

class Ledger {
  constructor() {
    this.enabled = false;
    this.pendingBuffer = [];
    this.batchSize = 10;
    this.flushInterval = null;
    this.lastFlush = Date.now();
  }

  async init(forceEnable = false) {
    if (forceEnable || process.env.LEDGER_ENABLED === 'true') {
      this.enabled = true;
      this._startAutoFlush();
      console.log('[LEDGER] EXPERIMENTAL MODE: Active');
    } else {
      console.log('[LEDGER] SHADOW MODE: Buffered, not recording');
    }
    return this;
  }

  async record(type, payload, sessionId) {
    const entry = {
      type,
      session_id: sessionId,
      payload_hash: this._hashPayload(payload),
      timestamp_ms: Date.now(),
      vector_clock: payload.vector_clock || 0,
      status: this.enabled ? 'PENDING_CONFIRMATION' : 'BUFFERED'
    };

    if (this.enabled) {
      await this._persistToDB(entry);
      this.pendingBuffer.push(entry);
      if (this.pendingBuffer.length >= this.batchSize) {
        await this._flushBatch();
      }
      return { hash: entry.payload_hash, status: 'PENDING', experimental: true };
    }

    this.pendingBuffer.push(entry);
    if (this.pendingBuffer.length > 1000) {
      this.pendingBuffer = this.pendingBuffer.slice(-500);
    }
    return null;
  }

  async _persistToDB(entry) {
    const db = getDatabase();
    try {
      await db.run(
        'INSERT INTO ledger_entries (type, session_id, payload_hash, timestamp_ms, vector_clock, status) VALUES (?, ?, ?, ?, ?, ?)',
        [entry.type, entry.session_id, entry.payload_hash, entry.timestamp_ms, entry.vector_clock, entry.status]
      );
    } catch (err) {
      console.error('[LEDGER] DB persist failed:', err.message);
    }
  }

  _startAutoFlush() {
    this.flushInterval = setInterval(() => {
      if (this.pendingBuffer.length > 0) {
        this._flushBatch().catch(err => console.error('[LEDGER] Auto-flush failed:', err.message));
      }
    }, 30000);
  }

  async _flushBatch() {
    const batch = this.pendingBuffer.splice(0, this.batchSize);
    if (batch.length === 0) return;
    const db = getDatabase();
    for (const entry of batch) {
      await db.run(
        'UPDATE ledger_entries SET status = ?, confirmed_at = ? WHERE payload_hash = ?',
        ['CONFIRMED', Date.now(), entry.payload_hash]
      );
    }
    this.lastFlush = Date.now();
    console.log(`[LEDGER] Flushed ${batch.length} entries`);
  }

  _hashPayload(payload) {
    const str = JSON.stringify(payload, Object.keys(payload).sort());
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash = hash & hash;
    }
    return '0x' + Math.abs(hash).toString(16).padStart(16, '0');
  }

  getPendingCount() {
    return this.pendingBuffer.length;
  }

  async getStats() {
    if (!this.enabled) {
      return { status: 'SHADOW_MODE', pending_buffered: this.pendingBuffer.length };
    }
    const db = getDatabase();
    const stats = await db.get(
      'SELECT COUNT(*) as total_entries, SUM(CASE WHEN status = ? THEN 1 ELSE 0 END) as confirmed FROM ledger_entries',
      ['CONFIRMED']
    );
    return { status: 'EXPERIMENTAL_ACTIVE', ...stats, last_flush: this.lastFlush };
  }

  async shutdown() {
    if (this.flushInterval) clearInterval(this.flushInterval);
    if (this.enabled && this.pendingBuffer.length > 0) await this._flushBatch();
  }
}

export { Ledger };
