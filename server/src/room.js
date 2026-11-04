import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { MatchLogTransform } from './streams.js';

export class Room extends EventEmitter {
  /**
   * @param {object} options
   * @param {string} options.id
   * @param {string} options.name
   * @param {number} [options.maxPlayers=4]
   * @param {string} [options.replaysDir]
   */
  constructor({ id, name, maxPlayers = 4, replaysDir = null }) {
    super();
    this.id = id;
    this.name = name;
    this.maxPlayers = maxPlayers;
    this.createdAt = Date.now();
    this.players = new Map(); // id -> { id, name, ws, joinedAt }
    this.replaysDir = replaysDir;

    // Set up match log streaming if replaysDir is provided
    this.logFile = null;
    this.logStream = null;
    this.transformStream = null;
    this._initMatchLog();
  }

  _initMatchLog() {
    if (!this.replaysDir) return;
    try {
      fs.mkdirSync(this.replaysDir, { recursive: true });
      this.logFile = path.join(this.replaysDir, `${this.id}.ndjson`);
      this.transformStream = new MatchLogTransform({ roomId: this.id });
      this.fileWriteStream = fs.createWriteStream(this.logFile, { flags: 'a' });
      this.transformStream.pipe(this.fileWriteStream);

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

  broadcast(message, senderWs = null) {
    const payload = typeof message === 'string' ? message : JSON.stringify(message);
    for (const player of this.players.values()) {
      if (player.ws && player.ws !== senderWs && player.ws.readyState === 1) { // 1 = OPEN
        // Slow-client backpressure check
        if (player.ws.bufferedAmount > 1048576) { // 1MB threshold
          console.warn(`[Room ${this.id}] Client ${player.name} buffer bloated (${player.ws.bufferedAmount}), dropping or disconnecting`);
          player.ws.close(1008, 'Slow client buffer exceeded');
          continue;
        }
        player.ws.send(payload);
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

    // Broadcast to ALL players in the room
    const payload = JSON.stringify(message);
    for (const player of this.players.values()) {
      if (player.ws && player.ws.readyState === 1) {
        player.ws.send(payload);
      }
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

    // Broadcast chat to all players in the room
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
      if (player.ws && player.ws.readyState === 1) {
        player.ws.send(payload);
      }
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

  close() {
    if (this._isClosed) return;
    this._isClosed = true;
    this.logEvent('room_closed', { roomId: this.id });
    if (this.transformStream && !this.transformStream.destroyed && !this.transformStream.writableEnded) {
      this.transformStream.end();
    }
  }
}
