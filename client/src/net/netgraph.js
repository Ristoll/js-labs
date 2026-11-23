/**
 * Netgraph and Latency Injector UI controller for Lab 05.
 */
export class NetgraphUI {
  constructor(socket) {
    this.socket = socket;
    this.container = document.getElementById('netgraph-overlay');
    this.rttEl = document.getElementById('net-rtt');
    this.tickEl = document.getElementById('net-tick');
    this.snapAgeEl = document.getElementById('net-snap-age');
    this.bandwidthEl = document.getElementById('net-bandwidth');
    this.pendingEl = document.getElementById('net-pending');
    this.correctionEl = document.getElementById('net-correction');

    this.valDelayEl = document.getElementById('val-delay');
    this.valJitterEl = document.getElementById('val-jitter');
    this.valDropEl = document.getElementById('val-drop');

    this.sliderDelay = document.getElementById('slider-delay');
    this.sliderJitter = document.getElementById('slider-jitter');
    this.sliderDrop = document.getElementById('slider-drop');

    this.presetButtons = document.querySelectorAll('.net-btn');
    this.minimizeBtn = document.getElementById('btn-toggle-netgraph');
    this.bodyEl = document.getElementById('netgraph-body');

    this.lastBytesIn = 0;
    this.lastBytesOut = 0;
    this.lastBwTime = performance.now();
    this.bwDownKbps = 0;
    this.bwUpKbps = 0;

    this.pendingInputCount = 0;
    this.correctionMagnitude = 0;

    this._setupControls();
    this._startMetricsLoop();
  }

  show() {
    if (this.container) {
      this.container.classList.remove('hidden');
    }
  }

  hide() {
    if (this.container) {
      this.container.classList.add('hidden');
    }
  }

  setPendingInputs(count) {
    this.pendingInputCount = count;
  }

  setCorrection(px) {
    this.correctionMagnitude = px;
  }

  _setupControls() {
    if (this.minimizeBtn && this.bodyEl) {
      this.minimizeBtn.addEventListener('click', () => {
        this.bodyEl.classList.toggle('hidden');
        this.minimizeBtn.textContent = this.bodyEl.classList.contains('hidden') ? '+' : '_';
      });
    }

    const applyFromSliders = () => {
      const delayMs = Number(this.sliderDelay?.value || 0);
      const jitterMs = Number(this.sliderJitter?.value || 0);
      const dropRate = Number(this.sliderDrop?.value || 0) / 100;

      if (this.valDelayEl) this.valDelayEl.textContent = delayMs;
      if (this.valJitterEl) this.valJitterEl.textContent = jitterMs;
      if (this.valDropEl) this.valDropEl.textContent = Math.round(dropRate * 100);

      this.socket.setLatency({ delayMs, jitterMs, dropRate });
    };

    this.sliderDelay?.addEventListener('input', applyFromSliders);
    this.sliderJitter?.addEventListener('input', applyFromSliders);
    this.sliderDrop?.addEventListener('input', applyFromSliders);

    this.presetButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        this.presetButtons.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');

        const delay = Number(btn.dataset.delay || 0);
        const jitter = Number(btn.dataset.jitter || 0);
        const drop = Number(btn.dataset.drop || 0);

        if (this.sliderDelay) this.sliderDelay.value = delay;
        if (this.sliderJitter) this.sliderJitter.value = jitter;
        if (this.sliderDrop) this.sliderDrop.value = Math.round(drop * 100);

        if (this.valDelayEl) this.valDelayEl.textContent = delay;
        if (this.valJitterEl) this.valJitterEl.textContent = jitter;
        if (this.valDropEl) this.valDropEl.textContent = Math.round(drop * 100);

        this.socket.setLatency({ delayMs: delay, jitterMs: jitter, dropRate: drop });
      });
    });

    // Default Milestone 1 recommendation: 100 ms latency preset
    setTimeout(() => {
      this.socket.setLatency({ delayMs: 100, jitterMs: 0, dropRate: 0 });
    }, 500);
  }

  _startMetricsLoop() {
    // Ping timer (RTT)
    setInterval(() => {
      if (this.socket.isConnected) {
        this.socket.sendPing(Date.now());
      }
    }, 1000);

    // Bandwidth and UI update timer (every 500 ms)
    setInterval(() => {
      const now = performance.now();
      const dt = (now - this.lastBwTime) / 1000;

      if (dt > 0) {
        const deltaIn = this.socket.bytesIn - this.lastBytesIn;
        const deltaOut = this.socket.bytesOut - this.lastBytesOut;

        this.bwDownKbps = deltaIn / 1024 / dt;
        this.bwUpKbps = deltaOut / 1024 / dt;

        this.lastBytesIn = this.socket.bytesIn;
        this.lastBytesOut = this.socket.bytesOut;
        this.lastBwTime = now;
      }

      this.updateUI();
    }, 250);
  }

  updateUI() {
    if (this.rttEl) {
      this.rttEl.textContent = `${this.socket.rtt} ms`;
    }

    if (this.tickEl) {
      this.tickEl.textContent = `#${this.socket.lastServerTick || 0} (30 Hz)`;
    }

    if (this.snapAgeEl) {
      const age = this.socket.lastSnapshotTime
        ? Math.max(0, Math.round(performance.now() - this.socket.lastSnapshotTime))
        : 0;
      this.snapAgeEl.textContent = `${age} ms`;
    }

    if (this.bandwidthEl) {
      this.bandwidthEl.textContent = `↓ ${this.bwDownKbps.toFixed(1)} KB/s | ↑ ${this.bwUpKbps.toFixed(1)} KB/s`;
    }

    if (this.pendingEl) {
      this.pendingEl.textContent = String(this.pendingInputCount);
    }

    if (this.correctionEl) {
      this.correctionEl.textContent = `${this.correctionMagnitude.toFixed(1)} px (No Pred)`;
    }
  }
}
