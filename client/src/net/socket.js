/**
 * Client WebSocket manager for Lab 04
 *
 * Implements:
 * - Connection lifecycle with automatic reconnect (exponential backoff + jitter)
 * - Message queue while disconnected
 * - Heartbeat responses (browser handles ping/pong under the hood, but also support app-level)
 * - EventTarget-based event dispatching
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
    this.closedExplicitly = false;
  }

  connect() {
    this.closedExplicitly = false;
    try {
      this.ws = new WebSocket(this.url);
    } catch (err) {
      this._scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.dispatchEvent(new CustomEvent('open'));

      // If we were previously in a room, re-join
      if (this.currentRoom && this.playerInfo) {
        this.joinRoom(this.currentRoom, this.playerInfo.name);
      }

      // Flush send queue
      this._flushQueue();
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type) {
          this.dispatchEvent(new CustomEvent(msg.type, { detail: msg.payload }));
        }
        this.dispatchEvent(new CustomEvent('message', { detail: msg }));
      } catch (err) {
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

    this.ws.onerror = (err) => {
      this.dispatchEvent(new CustomEvent('error', { detail: err }));
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
    // Exponential backoff + jitter
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

    if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(msg);
    } else {
      this.sendQueue.push(msg);
    }
  }

  _flushQueue() {
    while (this.sendQueue.length > 0 && this.isConnected && this.ws?.readyState === WebSocket.OPEN) {
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
