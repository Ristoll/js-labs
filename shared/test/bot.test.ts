import { describe, expect, it } from 'vitest';
import { Bot } from '../src/ai/bot.ts';
import { Ship } from '../src/sim/ship.ts';
import { World } from '../src/sim/world.ts';
import { Asteroid } from '../src/sim/asteroid.ts';
import { createArena } from '../src/sim/arena.ts';

describe('Bot', () => {
  const arena = createArena(1200, 800);

  function makeWorldWithTarget(): World {
    const world = new World();
    world.spawn(new Ship({ id: 1, x: 100, y: 100, playerId: 'p1' }));
    world.spawn(new Asteroid({ id: 2, x: 500, y: 500, radius: 20 }));
    return world;
  }

  it('produces a valid ShipInput each tick', () => {
    const bot = new Bot({ id: 'b1', name: 'Bot 1' });
    const world = makeWorldWithTarget();
    const ship = world.get(1)!;
    const input = bot.think(ship, world, 0);

    expect(typeof input.thrust).toBe('boolean');
    expect(typeof input.reverse).toBe('boolean');
    expect(typeof input.turn).toBe('number');
    expect(typeof input.fire).toBe('boolean');
    expect(input.turn).toBeGreaterThanOrEqual(-1);
    expect(input.turn).toBeLessThanOrEqual(1);
  });

  it('is deterministic: same state => same input', () => {
    const make = () => {
      const b = new Bot({ id: 'b1', name: 'Bot 1', seed: 7 });
      const w = makeWorldWithTarget();
      return { b, w, ship: w.get(1)! };
    };
    const a = make();
    const b = make();
    const inputsA = [0, 100, 200, 300].map((t) => a.b.think(a.ship, a.w, t));
    const inputsB = [0, 100, 200, 300].map((t) => b.b.think(b.ship, b.w, t));
    expect(inputsA).toEqual(inputsB);
  });

  it('different seeds produce different behavior', () => {
    const b1 = new Bot({ id: 'b1', name: 'A', seed: 1, behavior: 'wander', reactIntervalMs: 0 });
    const b2 = new Bot({ id: 'b2', name: 'B', seed: 999, behavior: 'wander', reactIntervalMs: 0 });
    const world = new World();
    world.spawn(new Ship({ id: 1, x: 100, y: 100, playerId: 'p1' }));
    const ship = world.get(1)!;
    const seq1 = Array.from({ length: 50 }, (_, i) => b1.think(ship, world, i * 10).turn);
    const seq2 = Array.from({ length: 50 }, (_, i) => b2.think(ship, world, i * 10).turn);
    expect(seq1).not.toEqual(seq2);
  });

  it('evade behavior reverses when close to target', () => {
    const bot = new Bot({ id: 'b1', name: 'E', seed: 2, behavior: 'evade', reactIntervalMs: 0 });
    const world = new World();
    world.spawn(new Ship({ id: 1, x: 100, y: 100, playerId: 'p1' }));
    world.spawn(new Asteroid({ id: 2, x: 105, y: 100, radius: 20 })); // very close
    const ship = world.get(1)!;
    const input = bot.think(ship, world, 0);
    expect(typeof input.reverse).toBe('boolean');
    expect(typeof input.thrust).toBe('boolean');
    expect(typeof input.fire).toBe('boolean');
  });

  it('wander produces bounded turn when no target', () => {
    const bot = new Bot({ id: 'b1', name: 'W', seed: 3, behavior: 'wander', reactIntervalMs: 0 });
    const world = new World();
    world.spawn(new Ship({ id: 1, x: 100, y: 100, playerId: 'p1' }));
    const ship = world.get(1)!;
    const input = bot.think(ship, world, 0);
    expect(input.turn).toBeGreaterThanOrEqual(-0.1);
    expect(input.turn).toBeLessThanOrEqual(0.1);
  });
});
