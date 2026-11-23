/**
 * Client WebSocket manager for Lab 04 & Lab 05
 */
export class GameSocket extends EventTarget {
  constructor(url) {
    super();
    this.url = url || (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
    this.ws = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.baseDelayMs = 500;
    this.maxDelayMs = 10000;
    this.reconnectTimer = null;
    this.sendQueue = [];
    this.isConnected = false;
    this.currentRoom = null;
    this.playerInfo = null;
    this.playerId = null;
    this.closedExplicitly = false;

    // Telemetry & metrics
    this.bytesIn = 0;
    this.bytesOut = 0;
    this.rtt = 0;
    this.lastServerTick = 0;
    this.lastSnapshotTime = 0;
  }

  connect() {
    this.closedExplicitly = false;
    try {
      this.ws = new WebSocket(this.url);
    } catch (_err) {
      this._scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.dispatchEvent(new CustomEvent('open'));

      if (this.currentRoom && this.playerInfo) {
        this.joinRoom(this.currentRoom, this.playerInfo.name);
      }

      this._flushQueue();
    };

    this.ws.onmessage = (event) => {
      const dataLen =
        typeof event.data === 'string' ? event.data.length : event.data.byteLength || 0;
      this.bytesIn += dataLen;

      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'joined') {
          this.playerId = msg.payload.playerId;
        } else if (msg.type === 'pong') {
          if (msg.payload && msg.payload.clientTime) {
            this.rtt = Date.now() - msg.payload.clientTime;
          }
        } else if (msg.type === 'snapshot') {
          this.lastServerTick = msg.payload.tick;
          this.lastSnapshotTime = performance.now();
        }

        if (msg.type) {
          this.dispatchEvent(new CustomEvent(msg.type, { detail: msg.payload }));
        }
        this.dispatchEvent(new CustomEvent('message', { detail: msg }));
      } catch (_err) {
        console.error('[GameSocket] Invalid JSON message received:', event.data);
      }
    };

    this.ws.onclose = (event) => {
      this.isConnected = false;
      this.dispatchEvent(new CustomEvent('close', { detail: event }));

      if (!this.closedExplicitly) {
        this._scheduleReconnect();
      }
    };

    this.ws.onerror = (_err) => {
      this.dispatchEvent(new CustomEvent('error', { detail: _err }));
    };
  }

  _scheduleReconnect() {
    if (this.reconnectTimer) return;
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.warn('[GameSocket] Max reconnect attempts reached.');
      this.dispatchEvent(new CustomEvent('reconnect_failed'));
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(
      this.maxDelayMs,
      this.baseDelayMs * Math.pow(2, this.reconnectAttempts - 1) + Math.random() * 200
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      console.log(`[GameSocket] Reconnecting (attempt ${this.reconnectAttempts})...`);
      this.connect();
    }, delay);
  }

  send(type, payload = {}) {
    const msg = JSON.stringify({
      v: 1,
      type,
      payload,
    });

    this.bytesOut += msg.length;

    if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(msg);
    } else {
      this.sendQueue.push(msg);
    }
  }

  _flushQueue() {
    while (
      this.sendQueue.length > 0 &&
      this.isConnected &&
      this.ws?.readyState === WebSocket.OPEN
    ) {
      const msg = this.sendQueue.shift();
      this.ws.send(msg);
    }
  }

  joinRoom(roomId, playerName) {
    this.currentRoom = roomId;
    this.playerInfo = { name: playerName };
    this.send('join', {
      roomId,
      playerName,
    });
  }

  sendChat(text) {
    this.send('chat', { text });
  }

  sendInput(payload) {
    this.send('input', payload);
  }

  sendPing(clientTime = Date.now()) {
    this.send('ping', { clientTime });
  }

  setLatency(config) {
    this.send('admin_latency', config);
  }

  leaveRoom() {
    this.send('leave', {});
    this.currentRoom = null;
  }

  close() {
    this.closedExplicitly = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
  }
}
