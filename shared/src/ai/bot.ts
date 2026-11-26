import { Ship } from '../sim/ship.ts';
import { World } from '../sim/world.ts';
import type { ShipInput } from '../sim/ship.ts';
import type { Entity } from '../sim/entity.ts';

export type BotBehavior = 'chase' | 'evade' | 'wander';

export interface BotOptions {
  id: string;
  name: string;
  seed?: number;
  behavior?: BotBehavior;
  fireRate?: number; // 0..1 probability of firing each tick when a target is in range
  reactIntervalMs?: number; // how often (ms) the bot recomputes its target
}

/**
 * Server-side AI player. Produces a `ShipInput` each tick from the current
 * world state, using the same `ShipInput` interface as a human client, so the
 * server cannot distinguish bot input from human input.
 *
 * The bot is deterministic given its seed: same world state + same seed ->
 * same input. This keeps replays reproducible and makes bot behavior easy to
 * reason about in tests.
 */
export class Bot {
  readonly id: string;
  readonly name: string;
  readonly behavior: BotBehavior;
  readonly fireRate: number;
  readonly reactIntervalMs: number;

  private prng: () => number;
  private lastReactTime = 0;
  private cachedInput: ShipInput = { thrust: false, reverse: false, turn: 0, fire: false };

  constructor({
    id,
    name,
    seed = 424242,
    behavior = 'chase',
    fireRate = 0.15,
    reactIntervalMs = 100,
  }: BotOptions) {
    this.id = id;
    this.name = name;
    this.behavior = behavior;
    this.fireRate = fireRate;
    this.reactIntervalMs = reactIntervalMs;
    this.prng = createSeededPrng(seed);
  }

  /** Produce the input for this tick based on current world state. Called once per match tick. */
  think(ship: Ship, world: World, nowMs: number): ShipInput {
    // Only recompute the target periodically; between reactions reuse the cached
    // input (with thrust maintained) so the bot doesn't jitter every frame.
    if (nowMs - this.lastReactTime >= this.reactIntervalMs) {
      this.lastReactTime = nowMs;
      this.cachedInput = this.computeInput(ship, world);
    }

    return { ...this.cachedInput };
  }

  private computeInput(ship: Ship, world: World): ShipInput {
    const input: ShipInput = { thrust: false, reverse: false, turn: 0, fire: false };

    const target = this.pickTarget(ship, world);

    if (target) {
      const dx = target.x - ship.x;
      const dy = target.y - ship.y;
      const dist = Math.hypot(dx, dy);
      const desiredAngle = Math.atan2(dy, dx);

      // Turn toward target (shortest angular distance).
      let turn = this.wrapAngle(desiredAngle - ship.angle);
      // Clamp turn rate.
      const maxTurn = 0.15;
      turn = Math.max(-maxTurn, Math.min(maxTurn, turn));
      input.turn = turn;

      // Thrust when facing roughly toward the target and within range.
      const facing = Math.cos(this.wrapAngle(desiredAngle - ship.angle));
      if (dist > 60 && facing > 0.5) {
        input.thrust = true;
      } else if (dist <= 60) {
        input.thrust = false; // close enough: stop and shoot
        input.reverse = this.behavior === 'evade' && this.prng() < 0.3;
      }

      if (this.behavior === 'evade') {
        input.reverse = dist < 120 && this.prng() < 0.4;
      }

      // Fire with some probability when aligned and in range.
      if (dist < 300 && facing > 0.85 && this.prng() < this.fireRate) {
        input.fire = true;
      }
    } else {
      // No target: wander with small random turns.
      input.turn = (this.prng() - 0.5) * 0.2;
      input.thrust = this.prng() < 0.4;
    }

    return input;
  }

  private pickTarget(ship: Ship, world: World): { x: number; y: number } | null {
    let best: { x: number; y: number } | null = null;
    let bestDist = Infinity;

    for (const entity of world) {
      if (!entity.alive) continue;
      if (entity.kind === 'ship' && entity.playerId === ship.playerId) continue; // skip self
      if (entity.kind !== 'ship' && entity.kind !== 'asteroid') continue;

      const dx = entity.x - ship.x;
      const dy = entity.y - ship.y;
      const dist = Math.hypot(dx, dy);

      if (dist < bestDist) {
        bestDist = dist;
        best = { x: entity.x, y: entity.y };
      }
    }

    return best;
  }

  private wrapAngle(a: number): number {
    while (a > Math.PI) a -= 2 * Math.PI;
    while (a < -Math.PI) a += 2 * Math.PI;
    return a;
  }
}

function createSeededPrng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}
