import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world.ts';
import { Ship } from '../src/sim/ship.ts';
import { Asteroid } from '../src/sim/asteroid.ts';
import { Bullet } from '../src/sim/bullet.ts';
import { createArena } from '../src/sim/arena.ts';

describe('World', () => {
  it('spawn / get / has / size', () => {
    const world = new World();
    const ship = new Ship({ id: 1 });
    world.spawn(ship);
    expect(world.has(1)).toBe(true);
    expect(world.get(1)).toBe(ship);
    expect(world.size).toBe(1);
  });

  it('despawn marks dead then sweep removes', () => {
    const world = new World();
    const ship = new Ship({ id: 1 });
    world.spawn(ship);
    world.despawn(1);
    expect(ship.alive).toBe(false);
    expect(world.has(1)).toBe(true); // not swept yet
    world.sweep();
    expect(world.has(1)).toBe(false);
    expect(world.size).toBe(0);
  });

  it('iterator and ofKind', () => {
    const world = new World();
    world.spawn(new Ship({ id: 1 }));
    world.spawn(new Ship({ id: 2 }));
    world.spawn(new Asteroid({ id: 3 }));
    expect([...world].length).toBe(3);
    expect([...world.ofKind('ship')].length).toBe(2);
    expect([...world.ofKind('asteroid')].length).toBe(1);
  });

  it('step determinism: clone, step both, deep-equal', () => {
    const arena = createArena(1200, 800);
    const inputs = new Map<string, { thrust: boolean; turn: number }>([
      ['p1', { thrust: true, turn: 0.5 }],
    ]);

    const w1 = new World();
    w1.spawn(new Ship({ id: 1, playerId: 'p1' }));
    const w2 = w1.clone();

    w1.step(1 / 60, inputs, arena);
    w2.step(1 / 60, inputs, arena);

    const s1 = w1.toSnapshot();
    const s2 = w2.toSnapshot();
    expect(s1).toEqual(s2);
  });

  it('toSnapshot returns alive entities only', () => {
    const world = new World();
    const alive = new Ship({ id: 1, alive: true });
    const dead = new Ship({ id: 2, alive: false });
    world.spawn(alive);
    world.spawn(dead);
    const snaps = world.toSnapshot();
    expect(snaps.length).toBe(1);
    expect(snaps[0].id).toBe(1);
  });

  it('clear removes all entities', () => {
    const world = new World();
    world.spawn(new Ship({ id: 1 }));
    world.spawn(new Bullet({ id: 2 }));
    expect(world.size).toBe(2);
    world.clear();
    expect(world.size).toBe(0);
  });

  it('step applies wrap-around when arena given', () => {
    const arena = createArena(100, 100);
    const world = new World();
    const ship = new Ship({ id: 1, x: -10, y: 105, vx: 0, vy: 0 });
    world.spawn(ship);
    world.step(1, null, arena);
    const s = world.get(1)!;
    expect(s.x).toBeGreaterThanOrEqual(0);
    expect(s.x).toBeLessThan(100);
    expect(s.y).toBeGreaterThanOrEqual(0);
    expect(s.y).toBeLessThan(100);
  });

  it('fromSnapshot rebuilds a world from entity snapshots', () => {
    const snap: unknown[] = [
      { kind: 'ship', id: 1, x: 10, y: 20, vx: 1, vy: 2, angle: 0.5, radius: 16, alive: true, hp: 3, thrust: false, reverse: false, playerId: null },
      { kind: 'bullet', id: 2, x: 3, y: 4, vx: 10, vy: 0, angle: 0, radius: 3, alive: true, ttl: 1.0, damage: 1, ownerId: null },
      { kind: 'ship' }, // missing id → skipped
    ];
    const world = World.fromSnapshot(snap);
    expect(world.size).toBe(2);
    expect(world.get(1)!.kind).toBe('ship');
    expect(world.get(1)!.x).toBe(10);
    expect(world.get(1)!.y).toBe(20);
    expect(world.get(2)!.kind).toBe('bullet');
    expect(world.has(99)).toBe(false);
  });

  it('fromSnapshot throws on an unknown entity kind', () => {
    const snap: unknown[] = [{ kind: 'not-a-real-kind', id: 99 }];
    expect(() => World.fromSnapshot(snap)).toThrow();
  });
});
