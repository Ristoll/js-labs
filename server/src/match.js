import { World, createArena, Ship, Asteroid, findCollisions, resolveCollisions } from 'shared/sim';
import { createMulberry32 } from 'shared/prng';
import { JsonCodec } from 'shared/codec';
import { PROTOCOL_VERSION, MESSAGE_TYPES } from 'shared/protocol';

export class Match {
  /**
   * @param {import('./room.js').Room} room
   * @param {object} [options]
   */
  constructor(room, options = {}) {
    this.room = room;
    this.tickRate = options.tickRate || 30;
    this.intervalMs = 1000 / this.tickRate;
    this.dt = 1 / this.tickRate;

    this.arena = createArena(1200, 800);
    this.world = new World();
    this.prng = createMulberry32(options.seed || 424242);

    this.tick = 0;
    this.isRunning = false;
    this.timer = null;
    this.nextTickTime = 0;
    this.lastTickTime = 0;

    // Performance & jitter metrics
    this.lastTickDuration = 0;
    this.avgTickDuration = 0;
    this.lastTickJitter = 0;
    this.avgTickJitter = 0;
    this.tickCount = 0;

    // Player inputs & acknowledgments
    // Map<string (playerId), Array<{ seq, tick, thrust, reverse, turn, fire }>>
    this.pendingInputs = new Map();
    // Map<string (playerId), number (last seq processed)>
    this.lastProcessedSeq = new Map();
    // Map<string (playerId), Ship>
    this.playerShips = new Map();

    // Latency simulation config
    this.latencyConfig = {
      delayMs: 0,
      jitterMs: 0,
      dropRate: 0,
    };

    this._initWorld();
  }

  _initWorld() {
    // Populate starting asteroids
    for (let i = 0; i < 5; i++) {
      this.world.spawn(Asteroid.createRandom(this.arena, null, this.prng));
    }
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.nextTickTime = performance.now() + this.intervalMs;
    this.lastTickTime = performance.now();
    this._scheduleNextTick();
  }

  stop() {
    this.isRunning = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.world.clear();
    this.playerShips.clear();
    this.pendingInputs.clear();
    this.lastProcessedSeq.clear();
  }

  _scheduleNextTick() {
    if (!this.isRunning) return;
    const now = performance.now();
    const delay = Math.max(0, this.nextTickTime - now);

    this.timer = setTimeout(() => {
      this._runTick();
    }, delay);
  }

  _runTick() {
    if (!this.isRunning) return;

    const tickStart = performance.now();
    const actualInterval = tickStart - this.lastTickTime;
    this.lastTickTime = tickStart;

    // Calculate jitter (|actual interval - expected interval|)
    this.lastTickJitter = Math.abs(actualInterval - this.intervalMs);

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
        // Replenish asteroid
        this.world.spawn(Asteroid.createRandom(this.arena, null, this.prng));
      }
    });

    // Handle destroyed player ships respawning safely after 2.0s
    for (const ship of this.playerShips.values()) {
      if (!ship.alive) {
        ship.respawnCooldown = (ship.respawnCooldown || 2.0) - this.dt;
        if (ship.respawnCooldown <= 0) {
          const angle = (this.playerShips.size * Math.PI) / 2 + Math.random() * 0.5;
          const x = 600 + Math.cos(angle) * 250;
          const y = 400 + Math.sin(angle) * 250;
          ship.reset(x, y, -Math.PI / 2);
          ship.respawnCooldown = 0;
        }
      }
    }

    // 4. Measure execution duration
    const tickEnd = performance.now();
    this.lastTickDuration = tickEnd - tickStart;

    // Exponential moving average for stats
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
    // Overrun guard: if tick took too long, reset target to prevent spiral of death
    if (this.nextTickTime < performance.now()) {
      this.nextTickTime = performance.now() + this.intervalMs;
    }

    this._scheduleNextTick();
  }

  _broadcastSnapshot() {
    const snapshotMsg = {
      v: PROTOCOL_VERSION,
      type: MESSAGE_TYPES.SNAPSHOT,
      payload: {
        tick: this.tick,
        serverTime: Date.now(),
        lastProcessedSeq: Object.fromEntries(this.lastProcessedSeq),
        entities: this.world.toSnapshot(),
      },
    };

    const encoded = JsonCodec.encode(snapshotMsg);

    for (const player of this.room.players.values()) {
      if (player.ws && player.ws.readyState === 1) {
        // OPEN
        this.sendWithLatency(player.ws, player, encoded);
      }
    }
  }

  addPlayer(player) {
    this.pendingInputs.set(player.id, []);
    this.lastProcessedSeq.set(player.id, 0);

    // Spawn player ship at safe position
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

  removePlayer(playerId) {
    const ship = this.playerShips.get(playerId);
    if (ship) {
      this.world.despawn(ship.id);
      this.playerShips.delete(playerId);
    }
    this.pendingInputs.delete(playerId);
    this.lastProcessedSeq.delete(playerId);
  }

  handleInput(playerId, payload) {
    // Inbound latency injector
    const { delayMs, jitterMs, dropRate } = this.latencyConfig;

    if (dropRate > 0 && Math.random() < dropRate) {
      // Packet dropped
      return;
    }

    const deliver = () => {
      const queue = this.pendingInputs.get(playerId);
      if (queue) {
        // Enforce max pending inputs per client to prevent memory bloating
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

  sendWithLatency(ws, player, messagePayload) {
    const { delayMs, jitterMs, dropRate } = this.latencyConfig;

    if (dropRate > 0 && Math.random() < dropRate) {
      return; // Dropped
    }

    const send = () => {
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

  setLatencyConfig({ delayMs = 0, jitterMs = 0, dropRate = 0 }) {
    this.latencyConfig = {
      delayMs: Math.max(0, Number(delayMs) || 0),
      jitterMs: Math.max(0, Number(jitterMs) || 0),
      dropRate: Math.max(0, Math.min(1, Number(dropRate) || 0)),
    };
  }

  getStats() {
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
