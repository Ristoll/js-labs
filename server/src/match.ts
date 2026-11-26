import { World, createArena, Ship, Asteroid, findCollisions, resolveCollisions } from 'shared/sim';
import { createMulberry32 } from 'shared/prng';
import { JsonCodec, BinaryCodec } from 'shared/codec';
import { PROTOCOL_VERSION, MESSAGE_TYPES } from 'shared/protocol';
import type { AnyMessage } from 'shared/protocol';
import type { WebSocket } from 'ws';
import type { Arena } from '../../shared/src/types.ts';
import type { Player, Room } from './room.ts';

export type ClientInput = {
  seq: number;
  tick?: number;
  thrust?: boolean;
  reverse?: boolean;
  turn?: number;
  fire?: boolean;
};

export interface MatchStats {
  roomId: string;
  tick: number;
  tickRate: number;
  intervalMs: number;
  avgTickDurationMs: number;
  lastTickDurationMs: number;
  avgTickJitterMs: number;
  lastTickJitterMs: number;
  entitiesCount: number;
  playersCount: number;
  latencyConfig: { delayMs: number; jitterMs: number; dropRate: number };
}

export class Match {
  readonly room: Room;
  readonly tickRate: number;
  readonly intervalMs: number;
  readonly dt: number;

  arena: Arena;
  readonly world: World;
  readonly prng: ReturnType<typeof createMulberry32>;

  tick = 0;
  isRunning = false;
  timer: ReturnType<typeof setTimeout> | null = null;
  nextTickTime = 0;
  lastTickTime = 0;

  lastTickDuration = 0;
  avgTickDuration = 0;
  lastTickJitter = 0;
  avgTickJitter = 0;
  tickCount = 0;

  readonly pendingInputs = new Map<string, ClientInput[]>();
  readonly lastProcessedSeq = new Map<string, number>();
  readonly playerShips = new Map<string, Ship>();
  readonly respawnCooldowns = new Map<number, number>(); // ship id -> seconds remaining

  /** Hooks invoked at the start of each tick, before inputs are processed. Used by bots. */
  readonly preTickHandlers = new Array<(nowMs: number) => void>();

  latencyConfig = {
    delayMs: 0,
    jitterMs: 0,
    dropRate: 0,
  };

  constructor(room: Room, options: { tickRate?: number; seed?: number } = {}) {
    this.room = room;
    this.tickRate = options.tickRate ?? 30;
    this.intervalMs = 1000 / this.tickRate;
    this.dt = 1 / this.tickRate;

    this.arena = createArena(1200, 800);
    this.world = new World();
    this.prng = createMulberry32(options.seed ?? 424242);

    this._initWorld();
  }

  _initWorld(): void {
    for (let i = 0; i < 5; i++) {
      this.world.spawn(Asteroid.createRandom(this.arena, null, this.prng));
    }
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.nextTickTime = performance.now() + this.intervalMs;
    this.lastTickTime = performance.now();
    this._scheduleNextTick();
  }

  stop(): void {
    this.isRunning = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.world.clear();
    this.playerShips.clear();
    this.pendingInputs.clear();
    this.lastProcessedSeq.clear();
    this.respawnCooldowns.clear();
  }

  _scheduleNextTick(): void {
    if (!this.isRunning) return;
    const now = performance.now();
    const delay = Math.max(0, this.nextTickTime - now);

    this.timer = setTimeout(() => {
      this._runTick();
    }, delay);
  }

  _runTick(): void {
    if (!this.isRunning) return;

    const tickStart = performance.now();
    const actualInterval = tickStart - this.lastTickTime;
    this.lastTickTime = tickStart;

    // 0. Let registered pre-tick handlers (e.g. bots) inject inputs for this tick.
    this.preTickHandlers.forEach((handler) => {
      try {
        handler(tickStart);
      } catch (err) {
        console.error('[Match] Pre-tick handler threw:', err instanceof Error ? err.message : String(err));
      }
    });

    this.tick++;
    this.tickCount++;

    // 1. Process pending inputs per player
    for (const [playerId, queue] of this.pendingInputs) {
      const ship = this.playerShips.get(playerId);
      if (!ship || !ship.alive) {
        queue.length = 0;
        continue;
      }

      while (queue.length > 0) {
        const input = queue.shift();
        if (!input) continue;
        ship.update(this.dt, input);
        if (input.fire) {
          ship.fire(this.world);
        }
        this.lastProcessedSeq.set(playerId, input.seq);
      }
    }

    // 2. Advance non-ship simulation entities & bounds
    this.world.step(this.dt, null, this.arena);

    // 3. Resolve collisions
    const collisions = findCollisions(this.world);
    resolveCollisions(this.world, collisions, (event) => {
      if (event.type === 'asteroid-destroyed') {
        this.world.spawn(Asteroid.createRandom(this.arena, null, this.prng));
      }
    });

    // Handle destroyed player ships respawning safely after 2.0s
    for (const ship of this.playerShips.values()) {
      if (!ship.alive) {
        const id = ship.id;
        const remaining = (this.respawnCooldowns.get(id) ?? 2.0) - this.dt;
        if (remaining <= 0) {
          const angle = (this.playerShips.size * Math.PI) / 2 + Math.random() * 0.5;
          const x = 600 + Math.cos(angle) * 250;
          const y = 400 + Math.sin(angle) * 250;
          ship.reset(x, y, -Math.PI / 2);
          this.respawnCooldowns.delete(id);
        } else {
          this.respawnCooldowns.set(id, remaining);
        }
      }
    }

    // 4. Measure execution duration
    const tickEnd = performance.now();
    this.lastTickDuration = tickEnd - tickStart;

    const alpha = 0.1;
    this.avgTickDuration =
      this.avgTickDuration === 0
        ? this.lastTickDuration
        : this.avgTickDuration * (1 - alpha) + this.lastTickDuration * alpha;

    this.avgTickJitter =
      this.avgTickJitter === 0
        ? this.lastTickJitter
        : this.avgTickJitter * (1 - alpha) + this.lastTickJitter * alpha;

    // 5. Broadcast authoritative snapshot
    this._broadcastSnapshot();

    // 6. Schedule next absolute tick time
    this.nextTickTime += this.intervalMs;
    if (this.nextTickTime < performance.now()) {
      this.nextTickTime = performance.now() + this.intervalMs;
    }

    this._scheduleNextTick();
  }

  _broadcastSnapshot(): void {
    const snapshotMsg: AnyMessage = {
      v: PROTOCOL_VERSION,
      type: MESSAGE_TYPES.SNAPSHOT,
      payload: {
        tick: this.tick,
        serverTime: Date.now(),
        lastProcessedSeq: Object.fromEntries(this.lastProcessedSeq),
        entities: this.world.toSnapshot(),
      },
    };

    let binaryData: ArrayBuffer | null = null;
    let jsonData: string | null = null;

    for (const player of this.room.players.values()) {
      const ws = player.ws;
      if (!ws || ws.readyState !== 1) {
        continue; // OPEN
      }

      const useBinary = player.preferredCodec === 'binary';

      let dataToSend: string | ArrayBuffer;
      if (useBinary) {
        if (!binaryData) {
          binaryData = BinaryCodec.encode(snapshotMsg);
        }
        dataToSend = binaryData;
      } else {
        if (!jsonData) {
          jsonData = JsonCodec.encode(snapshotMsg);
        }
        dataToSend = jsonData;
      }

      this.sendWithLatency(ws, player, dataToSend);
    }
  }

  addPlayer(player: Player): void {
    this.pendingInputs.set(player.id, []);
    this.lastProcessedSeq.set(player.id, 0);

    const angle = (this.playerShips.size * Math.PI) / 2;
    const x = 600 + Math.cos(angle) * 200;
    const y = 400 + Math.sin(angle) * 200;

    const ship = new Ship({
      playerId: player.id,
      x,
      y,
      angle: -Math.PI / 2,
    });

    this.world.spawn(ship);
    this.playerShips.set(player.id, ship);
  }

  removePlayer(playerId: string): void {
    const ship = this.playerShips.get(playerId);
    if (ship) {
      this.world.despawn(ship.id);
      this.playerShips.delete(playerId);
      this.respawnCooldowns.delete(ship.id);
    }
    this.pendingInputs.delete(playerId);
    this.lastProcessedSeq.delete(playerId);
  }

  handleInput(playerId: string, payload: ClientInput): void {
    const { delayMs, jitterMs, dropRate } = this.latencyConfig;

    if (dropRate > 0 && Math.random() < dropRate) {
      return; // Packet dropped
    }

    const deliver = (): void => {
      const queue = this.pendingInputs.get(playerId);
      if (queue) {
        if (queue.length < 60) {
          queue.push(payload);
        }
      }
    };

    if (delayMs > 0 || jitterMs > 0) {
      const jitter = jitterMs > 0 ? (Math.random() * 2 - 1) * jitterMs : 0;
      const totalDelay = Math.max(0, delayMs + jitter);
      setTimeout(deliver, totalDelay);
    } else {
      deliver();
    }
  }

  sendWithLatency(ws: WebSocket, player: Player, messagePayload: string | ArrayBuffer): void {
    const { delayMs, jitterMs, dropRate } = this.latencyConfig;

    if (dropRate > 0 && Math.random() < dropRate) {
      return; // Dropped
    }

    const send = (): void => {
      this.room._safeSend(ws, player, messagePayload);
    };

    if (delayMs > 0 || jitterMs > 0) {
      const jitter = jitterMs > 0 ? (Math.random() * 2 - 1) * jitterMs : 0;
      const totalDelay = Math.max(0, delayMs + jitter);
      setTimeout(send, totalDelay);
    } else {
      send();
    }
  }

  setLatencyConfig({ delayMs = 0, jitterMs = 0, dropRate = 0 }: { delayMs?: number; jitterMs?: number; dropRate?: number }): void {
    this.latencyConfig = {
      delayMs: Math.max(0, Number(delayMs) || 0),
      jitterMs: Math.max(0, Number(jitterMs) || 0),
      dropRate: Math.max(0, Math.min(1, Number(dropRate) || 0)),
    };
  }

  getStats(): MatchStats {
    return {
      roomId: this.room.id,
      tick: this.tick,
      tickRate: this.tickRate,
      intervalMs: Number(this.intervalMs.toFixed(2)),
      avgTickDurationMs: Number(this.avgTickDuration.toFixed(3)),
      lastTickDurationMs: Number(this.lastTickDuration.toFixed(3)),
      avgTickJitterMs: Number(this.avgTickJitter.toFixed(3)),
      lastTickJitterMs: Number(this.lastTickJitter.toFixed(3)),
      entitiesCount: this.world.size,
      playersCount: this.playerShips.size,
      latencyConfig: { ...this.latencyConfig },
    };
  }
}
