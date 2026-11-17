import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream';
import { MatchLogTransform } from './streams.js';

export class Room extends EventEmitter {
  /**
   * @param {object} options
   * @param {string} options.id
   * @param {string} options.name
   * @param {number} [options.maxPlayers=4]
   * @param {string} [options.replaysDir]
   * @param {number} [options.maxBufferedAmount=1048576]
   */
  constructor({ id, name, maxPlayers = 4, replaysDir = null, maxBufferedAmount = 1048576 }) {
    super();
    this.id = id;
    this.name = name;
    this.maxPlayers = maxPlayers;
    this.maxBufferedAmount = maxBufferedAmount;
    this.createdAt = Date.now();
    this.players = new Map(); // id -> { id, name, ws, joinedAt }
    this.replaysDir = replaysDir;

    // Set up match log streaming if replaysDir is provided
    this.logFile = null;
    this.transformStream = null;
    this.fileWriteStream = null;
    this._pipelinePromise = null;
    this._isClosed = false;

    this._initMatchLog();
  }

  _initMatchLog() {
    if (!this.replaysDir) return;
    try {
      fs.mkdirSync(this.replaysDir, { recursive: true });
      this.logFile = path.join(this.replaysDir, `${this.id}.ndjson`);
      this.transformStream = new MatchLogTransform({ roomId: this.id });
      this.fileWriteStream = fs.createWriteStream(this.logFile, { flags: 'a' });

      // Use pipeline() for robust match log writing with error handling
      this._pipelinePromise = new Promise((resolve, reject) => {
        pipeline(this.transformStream, this.fileWriteStream, (err) => {
          if (err) {
            console.error(`[Room ${this.id}] Match log pipeline error:`, err);
            reject(err);
          } else {
            resolve();
          }
        });
      });

      this.logEvent('room_created', {
        roomId: this.id,
        name: this.name,
        maxPlayers: this.maxPlayers,
      });
    } catch (err) {
      console.error(`[Room ${this.id}] Failed to init match log:`, err);
    }
  }

  logEvent(type, data) {
    if (this.transformStream && !this.transformStream.destroyed && !this.transformStream.writableEnded) {
      this.transformStream.write({
        type,
        timestamp: Date.now(),
        data,
      });
    }
  }

  addPlayer(player) {
    if (this.players.size >= this.maxPlayers) {
      throw new Error('Room is full');
    }
    if (this.players.has(player.id)) {
      throw new Error('Player already in room');
    }

    this.players.set(player.id, player);

    this.logEvent('player_joined', {
      playerId: player.id,
      name: player.name,
    });

    this.emit('join', {
      roomId: this.id,
      player: { id: player.id, name: player.name },
      playerCount: this.players.size,
    });

    this.broadcastRoster();
  }

  removePlayer(playerId, reason = 'left') {
    const player = this.players.get(playerId);
    if (!player) return null;

    this.players.delete(playerId);

    this.logEvent('player_left', {
      playerId,
      name: player.name,
      reason,
    });

    this.emit('leave', {
      roomId: this.id,
      player: { id: player.id, name: player.name },
      reason,
      playerCount: this.players.size,
    });

    this.broadcastRoster();

    if (this.players.size === 0) {
      this.emit('empty', { roomId: this.id });
      this.close();
    }

    return player;
  }

  _safeSend(ws, player, payload) {
    if (!ws || ws.readyState !== 1) return; // 1 = OPEN
    if (ws.bufferedAmount > this.maxBufferedAmount) {
      console.warn(`[Room ${this.id}] Client ${player.name} buffer bloated (${ws.bufferedAmount} bytes), terminating slow client.`);
      ws.close(1008, 'Slow client buffer exceeded');
      return;
    }
    ws.send(payload);
  }

  broadcast(message, senderWs = null) {
    const payload = typeof message === 'string' ? message : JSON.stringify(message);
    for (const player of this.players.values()) {
      if (player.ws && player.ws !== senderWs) {
        this._safeSend(player.ws, player, payload);
      }
    }
  }

  broadcastRoster() {
    const roster = Array.from(this.players.values()).map((p) => ({
      id: p.id,
      name: p.name,
    }));

    const message = {
      v: 1,
      type: 'roster',
      payload: {
        roomId: this.id,
        players: roster,
        maxPlayers: this.maxPlayers,
      },
    };

    const payload = JSON.stringify(message);
    for (const player of this.players.values()) {
      this._safeSend(player.ws, player, payload);
    }
  }

  handleChat(senderId, text) {
    const sender = this.players.get(senderId);
    if (!sender) return;

    this.logEvent('chat', {
      playerId: senderId,
      name: sender.name,
      text,
    });

    this.emit('chat', {
      roomId: this.id,
      sender: { id: senderId, name: sender.name },
      text,
    });

    const chatMsg = {
      v: 1,
      type: 'chat',
      payload: {
        senderId,
        senderName: sender.name,
        text,
        timestamp: Date.now(),
      },
    };

    const payload = JSON.stringify(chatMsg);
    for (const player of this.players.values()) {
      this._safeSend(player.ws, player, payload);
    }
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      players: this.players.size,
      maxPlayers: this.maxPlayers,
      status: this.players.size >= this.maxPlayers ? 'full' : 'open',
      arena: '/assets/arena.json',
      createdAt: this.createdAt,
    };
  }

  async close() {
    if (this._isClosed) return;
    this._isClosed = true;
    this.logEvent('room_closed', { roomId: this.id });
    if (this.transformStream && !this.transformStream.destroyed && !this.transformStream.writableEnded) {
      this.transformStream.end();
    }
    if (this._pipelinePromise) {
      await this._pipelinePromise.catch(() => {});
    }
  }
}
