import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream';
import { MatchLogTransform } from './streams.ts';
import { Match } from './match.ts';
import type { WebSocket } from 'ws';
import type { ClientInput } from './match.ts';

export interface Player {
  id: string;
  name: string;
  ws?: WebSocket;
  joinedAt: number;
  preferredCodec: 'json' | 'binary' | null;
  isBot?: boolean;
}

export interface RoomOptions {
  id: string;
  name: string;
  maxPlayers?: number;
  replaysDir: string | null;
  maxBufferedAmount?: number;
}

export interface RoomEvents {
  error: [unknown];
  empty: [{ roomId: string }];
  join: [{ roomId: string; player: { id: string; name: string }; playerCount: number }];
  leave: [{ roomId: string; player: { id: string; name: string }; reason: string; playerCount: number }];
  chat: [{ roomId: string; sender: { id: string; name: string }; text: string }];
}

export interface RoomSummary {
  id: string;
  name: string;
  players: number;
  maxPlayers: number;
  status: 'full' | 'open';
  arena: string;
  createdAt: number;
}

export class Room extends EventEmitter<RoomEvents> {
  readonly id: string;
  readonly name: string;
  readonly maxPlayers: number;
  readonly maxBufferedAmount: number;
  readonly createdAt: number;
  readonly replaysDir: string | null;
  readonly players = new Map<string, Player>();

  match: Match | null = null;
  private logFile: string | null = null;
  private transformStream: MatchLogTransform | null = null;
  private fileWriteStream: fs.WriteStream | null = null;
  private _pipelinePromise: Promise<Error | null> | null = null;
  private _isClosed = false;
  private _logQueue: { type: string; timestamp: number; data: Record<string, unknown> }[] = [];
  private _isFlushingLogQueue = false;
  private _logBackpressure = false;

  constructor({
    id,
    name,
    maxPlayers = 4,
    replaysDir = null,
    maxBufferedAmount = 1048576,
  }: RoomOptions) {
    super();
    this.id = id;
    this.name = name;
    this.maxPlayers = maxPlayers;
    this.maxBufferedAmount = maxBufferedAmount;
    this.createdAt = Date.now();
    this.replaysDir = replaysDir;

    this.match = new Match(this);
    this.match.start();

    this._initMatchLog();
  }

  _initMatchLog(): void {
    if (!this.replaysDir) return;
    try {
      fs.mkdirSync(this.replaysDir, { recursive: true });
      this.logFile = path.join(this.replaysDir, `${this.id}.ndjson`);
      this.transformStream = new MatchLogTransform({ roomId: this.id });
      this.fileWriteStream = fs.createWriteStream(this.logFile, { flags: 'a' });

      this.transformStream.on('error', (err) => {
        console.error(`[Room ${this.id}] MatchLogTransform stream error:`, err);
        this.emit('error', err);
      });

      this.fileWriteStream.on('error', (err) => {
        console.error(`[Room ${this.id}] Match log fileWriteStream error:`, err);
        this.emit('error', err);
      });

      this.transformStream.on('drain', () => {
        this._logBackpressure = false;
        this._flushLogQueue();
      });

      this._pipelinePromise = new Promise((resolve) => {
        pipeline(this.transformStream!, this.fileWriteStream!, (err) => {
          if (err) {
            console.error(`[Room ${this.id}] Match log pipeline error:`, err);
            this.emit('error', err);
            resolve(err);
          } else {
            resolve(null);
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

  logEvent(type: string, data: Record<string, unknown>): void {
    if (this._isClosed) return;
    const event = {
      type,
      timestamp: Date.now(),
      data,
    };

    if (
      !this.transformStream ||
      this.transformStream.destroyed ||
      this.transformStream.writableEnded
    ) {
      return;
    }

    if (this._logBackpressure || this._logQueue.length > 0) {
      if (this._logQueue.length < 5000) {
        this._logQueue.push(event);
      } else {
        console.warn(`[Room ${this.id}] Match log queue full (5000 items), dropping event ${type}`);
      }
      return;
    }

    try {
      const canWriteMore = this.transformStream.write(event);
      if (!canWriteMore) {
        this._logBackpressure = true;
      }
    } catch (err) {
      console.error(`[Room ${this.id}] Error writing event to match log:`, err);
    }
  }

  _flushLogQueue(): void {
    if (this._isFlushingLogQueue) return;
    this._isFlushingLogQueue = true;

    try {
      while (this._logQueue.length > 0 && !this._logBackpressure) {
        if (
          !this.transformStream ||
          this.transformStream.destroyed ||
          this.transformStream.writableEnded
        ) {
          this._logQueue.length = 0;
          break;
        }

        const nextEvent = this._logQueue.shift();
        if (!nextEvent) break;
        const canWriteMore = this.transformStream.write(nextEvent);
        if (!canWriteMore) {
          this._logBackpressure = true;
          break;
        }
      }
    } catch (err) {
      console.error(`[Room ${this.id}] Error flushing log queue:`, err);
    } finally {
      this._isFlushingLogQueue = false;
    }
  }

  addPlayer(player: Player): void {
    if (this.players.size >= this.maxPlayers) {
      throw new Error('Room is full');
    }
    if (this.players.has(player.id)) {
      throw new Error('Player already in room');
    }

    this.players.set(player.id, player);
    this.match?.addPlayer(player);

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

  removePlayer(playerId: string, reason = 'left'): Player | null {
    const player = this.players.get(playerId);
    if (!player) return null;

    this.players.delete(playerId);
    this.match?.removePlayer(playerId);

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

  _safeSend(ws: WebSocket | undefined, player: Player, payload: string | ArrayBuffer): void {
    if (!ws || ws.readyState !== 1) return; // 1 = OPEN
    if (ws.bufferedAmount > this.maxBufferedAmount) {
      console.warn(
        `[Room ${this.id}] Client ${player.name} buffer bloated (${ws.bufferedAmount} bytes), terminating slow client.`
      );
      ws.close(1008, 'Slow client buffer exceeded');
      return;
    }
    if (payload instanceof ArrayBuffer) {
      ws.send(Buffer.from(payload), { binary: true });
    } else if (ArrayBuffer.isView(payload)) {
      ws.send(Buffer.from(payload.buffer, payload.byteOffset, payload.byteLength), {
        binary: true,
      });
    } else {
      ws.send(payload);
    }
  }

  broadcast(message: string | Record<string, unknown>, senderWs: WebSocket | null = null): void {
    const payload = typeof message === 'string' ? message : JSON.stringify(message);
    for (const player of this.players.values()) {
      if (player.ws && player.ws !== senderWs) {
        this._safeSend(player.ws, player, payload);
      }
    }
  }

  broadcastRoster(): void {
    const roster = Array.from(this.players.values()).map((p) => ({
      id: p.id,
      name: p.name,
    }));

    const message = {
      v: 1,
      type: 'roster' as const,
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

  handleInput(playerId: string, payload: ClientInput): void {
    this.match?.handleInput(playerId, payload);
  }

  handleAdminLatency(payload: { delayMs?: number; jitterMs?: number; dropRate?: number }): void {
    this.match?.setLatencyConfig(payload);
  }

  handleChat(senderId: string, text: string): void {
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
      type: 'chat' as const,
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

  toJSON(): RoomSummary {
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

  async close(): Promise<void> {
    if (this._isClosed) return;
    this._isClosed = true;

    this.match?.stop();

    // Enqueue final closure event
    this._logQueue.push({
      type: 'room_closed',
      timestamp: Date.now(),
      data: { roomId: this.id },
    });

    // Flush any pending events in queue while respecting stream backpressure
    if (
      this.transformStream &&
      !this.transformStream.destroyed &&
      !this.transformStream.writableEnded
    ) {
      const stream = this.transformStream;
      while (this._logQueue.length > 0) {
        const item = this._logQueue.shift();
        if (!item) break;
        let canWriteMore: boolean;
        try {
          canWriteMore = stream.write(item);
        } catch {
          break;
        }

        if (!canWriteMore) {
          await new Promise<void>((resolve) => {
            const onDrain = () => {
              cleanup();
              resolve();
            };
            const onClose = () => {
              cleanup();
              resolve();
            };
            const cleanup = () => {
              stream.removeListener('drain', onDrain);
              stream.removeListener('close', onClose);
              stream.removeListener('error', onClose);
            };
            stream.once('drain', onDrain);
            stream.once('close', onClose);
            stream.once('error', onClose);
          });
        }
      }

      stream.end();
    }

    if (this._pipelinePromise) {
      await this._pipelinePromise.catch(() => {});
    }
  }
}
