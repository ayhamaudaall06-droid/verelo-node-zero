class VereloApp {
  constructor() {
    this.sessionId = 'pwa_' + crypto.randomUUID();
    this.vectorClock = 0;
    this.state = 'ACQUIRED';
    this.cart = [];
    this.currentProduct = null;
    this.ws = null;
    this.catalogData = [];
    
    // Wait for DOM ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.init());
    } else {
      this.init();
    }
  }

  init() {
    console.log('[PWA] Initializing...');
    this.connectWebSocket();
    this.bindEvents();
    this.updateUI();
    console.log('[PWA] Session:', this.sessionId);
  }

  connectWebSocket() {
    this.ws = new WebSocket('ws://localhost:1884');
    this.ws.binaryType = 'arraybuffer';
    this.ws.onopen = () => console.log('[PWA] WS connected');
    this.ws.onerror = (e) => console.error('[PWA] WS error:', e);
  }

  async api(endpoint, body) {
    try {
      const res = await fetch(`/api${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      return res.json();
    } catch (err) {
      console.error('[PWA] API error:', err);
      return { error: err.message };
    }
  }

  bindEvents() {
    console.log('[PWA] Binding events...');
    
    const bind = (id, fn) => {
      const btn = document.getElementById(id);
      if (btn) {
        btn.addEventListener('click', fn);
        console.log(`[PWA] Bound ${id}`);
      } else {
        console.warn(`[PWA] Button not found: ${id}`);
      }
    };

    bind('btn-start', () => this.startJourney());
    bind('btn-curated', () => this.selectCurated());
    bind('btn-dynamic', () => this.selectDynamic());
    bind('btn-buy', () => this.buyNow());
    bind('btn-customize', () => this.customizeBox());
    bind('btn-open-catalog', (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('[PWA] Catalog button clicked');
      this.openCatalog();
    });
    bind('btn-close-catalog', () => this.closeCatalog());
    bind('btn-back-catalog', () => this.closeCatalog());
    bind('btn-watch-live', () => this.enterStream());
    bind('btn-add-direct', () => this.addCurrentProduct(false));
    bind('btn-add-from-stream', () => this.addCurrentProduct(true));
    bind('btn-leave-stream', () => this.leaveStream());
    bind('btn-done', () => this.doneBuilding());

    const holdBtn = document.getElementById('btn-hold');
    if (holdBtn) {
      holdBtn.addEventListener('mousedown', () => this.startHold());
      holdBtn.addEventListener('mouseup', () => this.endHold());
      holdBtn.addEventListener('touchstart', () => this.startHold());
      holdBtn.addEventListener('touchend', () => this.endHold());
    }

    bind('btn-voice', () => this.toggleVoice());
  }

  showView(viewId) {
    console.log(`[PWA] Switching to view: ${viewId}`);
    document.querySelectorAll('.state-view').forEach(v => v.classList.remove('active'));
    const view = document.getElementById(viewId);
    if (view) {
      view.classList.add('active');
      console.log(`[PWA] View ${viewId} activated`);
    } else {
      console.error(`[PWA] View not found: ${viewId}`);
    }
  }

  async transition(targetState, payload = {}) {
    console.log(`[PWA] Transitioning to ${targetState}`);
    const result = await this.api('/state/transition', {
      session_id: this.sessionId,
      idempotency_key: `step_${Date.now()}`,
      target_state: targetState,
      payload: payload,
      vector_clock: this.vectorClock
    });
    
    if (result.error) {
      console.error('[PWA] Transition error:', result.error);
      return result;
    }
    
    if (result.vector_clock) this.vectorClock = result.vector_clock;
    if (result.state) this.state = result.state;
    
    console.log(`[PWA] Now in state: ${this.state}`);
    this.updateUI();
    return result;
  }

  updateUI() {
    // Map state to view
    const viewMap = {
      'ACQUIRED': 'view-acquired',
      'INTENT_CAP': 'view-acquired',
      'QUALIFIED': 'view-qualified',
      'CURATED_SELECTED': 'view-curated',
      'PRODUCT_SELECTED': 'view-product',
      'WATCHING_STREAM': 'view-stream',
      'DYNAMIC_ASSEMBLING': 'view-dynamic',
      'CUSTOMIZING': 'view-dynamic',
      'VALIDATED': 'view-validated',
      'COMMITTED': 'view-committed'
    };
    
    const viewId = viewMap[this.state] || 'view-acquired';
    
    // Only auto-switch if we're not in catalog or stream (manual views)
    if (this.state !== 'PRODUCT_SELECTED' && this.state !== 'WATCHING_STREAM') {
      this.showView(viewId);
    }
    
    const indicator = document.getElementById('state-indicator');
    if (indicator) indicator.textContent = `State: ${this.state}`;
  }

  async startJourney() {
    await this.transition('INTENT_CAP');
    await this.transition('QUALIFIED');
  }

  async selectCurated() {
    await this.transition('CURATED_SELECTED', { box_id: 'box_morning_001' });
    this.cart = [
      { id: 'coffee_001', name: 'Single Origin Coffee', price: 1500, inherited: true },
      { id: 'choco_001', name: 'Dark Chocolate', price: 800, inherited: true }
    ];
  }

  async selectDynamic() {
    console.log('[PWA] Select Dynamic clicked');
    await this.transition('DYNAMIC_ASSEMBLING');
    this.cart = [];
    this.updateDynamicCart();
    // Small delay to ensure transition completes
    setTimeout(() => this.openCatalog(), 100);
  }

  async customizeBox() {
    const result = await this.transition('DYNAMIC_ASSEMBLING', { source_box_id: 'box_morning_001' });
    if (result.inheritance_applied) {
      this.cart = [
        { id: 'coffee_001', name: 'Single Origin Coffee', price: 1500, inherited: true },
        { id: 'choco_001', name: 'Dark Chocolate', price: 800, inherited: true }
      ];
    }
    this.updateDynamicCart();
    setTimeout(() => this.openCatalog(), 100);
  }

  // CATALOG
  async openCatalog() {
    console.log('[PWA] Opening catalog...');
    
    // Show catalog view immediately (loading state)
    this.showView('view-catalog');
    
    try {
      const res = await fetch('/api/catalog/search?q=coffee&branch=dynamic');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      this.catalogData = data.results || [];
      console.log(`[PWA] Loaded ${this.catalogData.length} products`);
    } catch (err) {
      console.error('[PWA] Failed to load catalog:', err);
      // Use fallback data
      this.catalogData = [
        { sku_id: 'coffee_001', name: 'Single Origin Coffee', price: 1500, is_live: true, camera_location: 'Coffee Station' },
        { sku_id: 'choco_001', name: 'Dark Chocolate', price: 800, is_live: false }
      ];
    }
    
    this.renderCatalog();
  }

  closeCatalog() {
    this.showView('view-dynamic');
    this.updateDynamicCart();
  }

  renderCatalog() {
    const container = document.getElementById('product-list');
    if (!container) return;
    
    if (this.catalogData.length === 0) {
      container.innerHTML = '<div style="text-align: center; padding: 40px;">No products available</div>';
      return;
    }
    
    container.innerHTML = this.catalogData.map(p => `
      <div class="sketch-box" style="padding: 15px; cursor: pointer; margin-bottom: 10px;" onclick="app.selectProduct('${p.sku_id}')">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <div style="font-size: 20px; font-weight: bold;">${p.name}</div>
            <div style="font-size: 16px; opacity: 0.8;">${p.price} JOD</div>
          </div>
          <div>
            ${p.is_live ? '<span style="color: #4ade80; font-size: 12px; border: 1px solid #4ade80; padding: 5px 10px; border-radius: 10px;">● LIVE</span>' : ''}
          </div>
        </div>
      </div>
    `).join('');
    
    const preview = document.getElementById('catalog-cart-preview');
    if (preview) {
      const total = this.cart.reduce((s, i) => s + i.price, 0);
      preview.innerHTML = `<div style="text-align: right; font-family: Permanent Marker; font-size: 20px;">Cart: ${this.cart.length} items (${total} JOD)</div>`;
    }
  }

  async selectProduct(skuId) {
    console.log(`[PWA] Selected product: ${skuId}`);
    const product = this.catalogData.find(p => p.sku_id === skuId);
    if (!product) return;
    
    this.currentProduct = product;
    await this.transition('PRODUCT_SELECTED', { sku_id: skuId });
    
    document.getElementById('product-name').textContent = product.name;
    document.getElementById('product-price').textContent = product.price + ' JOD';
    
    const liveBadge = document.getElementById('live-badge');
    const watchBtn = document.getElementById('btn-watch-live');
    
    if (product.is_live) {
      liveBadge.style.display = 'block';
      document.getElementById('camera-location').textContent = product.camera_location || 'Factory Floor';
      watchBtn.style.display = 'block';
    } else {
      liveBadge.style.display = 'none';
      watchBtn.style.display = 'none';
    }
    
    this.showView('view-product');
  }

  async enterStream() {
    if (!this.currentProduct) return;
    console.log('[PWA] Entering stream...');
    
    await this.transition('WATCHING_STREAM');
    
    document.getElementById('stream-product-info').innerHTML = `
      <div style="color: #fff; font-size: 18px;">${this.currentProduct.name}</div>
      <div style="color: #4ade80; font-size: 14px;">Factory Live Stream</div>
    `;
    
    this.showView('view-stream');
  }

  async addCurrentProduct(fromStream = false) {
    if (!this.currentProduct) return;
    console.log(`[PWA] Adding product (fromStream: ${fromStream})`);
    
    this.cart.push({
      id: this.currentProduct.sku_id,
      name: this.currentProduct.name,
      price: this.currentProduct.price,
      inherited: false,
      fromStream: fromStream
    });
    
    await this.transition('DYNAMIC_ASSEMBLING');
    this.showView('view-dynamic');
    this.updateDynamicCart();
  }

  async leaveStream() {
    await this.transition('DYNAMIC_ASSEMBLING');
    this.showView('view-dynamic');
  }

  updateDynamicCart() {
    const container = document.getElementById('dynamic-cart');
    if (!container) return;
    
    if (this.cart.length === 0) {
      container.innerHTML = '<div style="color: #666; text-align: center; padding: 20px;">Your box is empty. Add items from catalog.</div>';
    } else {
      container.innerHTML = this.cart.map((item, i) => `
        <div class="cart-item ${item.inherited ? 'inherited' : ''}">
          <span>${item.fromStream ? '📹 ' : ''}${item.inherited ? '✨ ' : '+ '}${item.name}</span>
          <span>${item.price} JOD ${!item.inherited ? `<button onclick="app.removeItem(${i})" style="margin-left:10px;">×</button>` : ''}</span>
        </div>
      `).join('');
    }
    this.broadcastDesign();
  }

  removeItem(index) {
    this.cart.splice(index, 1);
    this.updateDynamicCart();
  }

  broadcastDesign() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const color = this.cart.length > 0 ? [0x3A, 0x2B, 0x1C, 0xFF] : [0xFF, 0xFF, 0xFF, 0x00];
    this.ws.send(new Uint8Array([0x01, 0xAB, 0xCD, ...color, 0x00]));
    
    const layer = document.getElementById('twin-color');
    if (layer) layer.style.background = `rgba(${color.join(',')})`;
  }

  async doneBuilding() {
    await this.transition('CUSTOMIZING');
    await this.transition('VALIDATED');
    this.renderFinalCart();
  }

  async buyNow() {
    await this.transition('CUSTOMIZING');
    await this.transition('VALIDATED');
    await this.commit('SILENT');
  }

  renderFinalCart() {
    const container = document.getElementById('final-cart');
    if (!container) return;
    const total = this.cart.reduce((s, i) => s + i.price, 0);
    container.innerHTML = this.cart.map(item => `
      <div class="cart-item ${item.inherited ? 'inherited' : ''}">
        <span>${item.fromStream ? '📹 ' : ''}${item.name}</span>
        <span>${item.price} JOD</span>
      </div>
    `).join('') + `
      <div style="text-align: right; margin-top: 10px; font-size: 24px; font-family: Permanent Marker;">
        Total: ${total} JOD
      </div>
    `;
  }

  startHold() {
    const progress = document.getElementById('hold-progress');
    if (progress) {
      progress.style.transition = 'width 3s linear';
      progress.style.width = '100%';
    }
    this.holdTimer = setTimeout(() => this.commit('SILENT'), 3000);
  }

  endHold() {
    clearTimeout(this.holdTimer);
    const progress = document.getElementById('hold-progress');
    if (progress) {
      progress.style.transition = 'width 0.2s';
      progress.style.width = '0%';
    }
  }

  async toggleVoice() {
    const btn = document.getElementById('btn-voice');
    if (!btn) return;
    
    if (this.mediaRecorder?.state === 'recording') {
      this.mediaRecorder.stop();
      btn.classList.remove('recording');
      return;
    }
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaRecorder = new MediaRecorder(stream);
      const chunks = [];
      
      this.mediaRecorder.ondataavailable = e => chunks.push(e.data);
      this.mediaRecorder.onstop = async () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const buffer = await blob.arrayBuffer();
        this.commit('VOICE', new Uint8Array(buffer));
        stream.getTracks().forEach(t => t.stop());
      };
      
      this.mediaRecorder.start();
      btn.classList.add('recording');
      setTimeout(() => this.toggleVoice(), 5000);
    } catch (err) {
      alert('Mic access required for voice commit');
    }
  }

  async commit(mode, voiceBuffer = null) {
    const result = await this.api('/commit', {
      session_id: this.sessionId,
      mode: mode,
      voice_buffer: voiceBuffer ? Array.from(voiceBuffer) : null,
      vector_clock: this.vectorClock
    });
    
    if (result.status === 'COMMITTED') {
      this.state = 'COMMITTED';
      this.vectorClock = result.vector_clock;
      this.updateUI();
      const details = document.getElementById('order-details');
      if (details) {
        const streamItems = this.cart.filter(i => i.fromStream).length;
        details.innerHTML = `
          <div>Order #${result.vector_clock}</div>
          <div>Mode: ${mode}</div>
          <div>Items: ${this.cart.length} (${streamItems} from live stream)</div>
        `;
      }
    }
  }
}

const app = new VereloApp();
window.app = app;
