import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world.ts';
import { Ship } from '../src/sim/ship.ts';
import { Bullet } from '../src/sim/bullet.ts';
import { Asteroid } from '../src/sim/asteroid.ts';
import { Pickup } from '../src/sim/pickup.ts';
import { checkCircleCollision, findCollisions, resolveCollisions } from '../src/sim/collision.ts';

describe('collision', () => {
  it('checkCircleCollision: touching, overlapping, missing', () => {
    const a = new Ship({ x: 0, y: 0, radius: 10 });
    const bTouch = new Ship({ x: 20, y: 0, radius: 10 }); // distance == radiusSum
    const bOverlap = new Ship({ x: 10, y: 0, radius: 10 });
    const bMiss = new Ship({ x: 100, y: 0, radius: 10 });

    expect(checkCircleCollision(a, bTouch)).toBe(true);
    expect(checkCircleCollision(a, bOverlap)).toBe(true);
    expect(checkCircleCollision(a, bMiss)).toBe(false);
  });

  it('findCollisions returns all pairs', () => {
    const world = new World();
    world.spawn(new Ship({ id: 1, x: 0, y: 0, radius: 10 }));
    world.spawn(new Ship({ id: 2, x: 5, y: 0, radius: 10 }));
    world.spawn(new Ship({ id: 3, x: 100, y: 0, radius: 10 }));
    const pairs = findCollisions(world);
    expect(pairs.length).toBe(1);
    expect(pairs[0]![0].id).toBe(1);
    expect(pairs[0]![1].id).toBe(2);
  });

  it('bullet + asteroid destroys both', () => {
    const world = new World();
    const bullet = new Bullet({ id: 1, x: 0, y: 0, radius: 1, ownerId: 'p1' });
    const asteroid = new Asteroid({ id: 2, x: 2, y: 0, radius: 2 });
    world.spawn(bullet);
    world.spawn(asteroid);
    let score = 0;
    resolveCollisions(world, findCollisions(world), (e) => {
      if (e.type === 'asteroid-destroyed') score = e.score ?? 0;
    });
    expect(bullet.alive).toBe(false);
    expect(asteroid.alive).toBe(false);
    expect(score).toBe(100);
  });

  it('ship + asteroid damages ship', () => {
    const world = new World();
    const ship = new Ship({ id: 1, x: 0, y: 0, radius: 10, hp: 3 });
    const asteroid = new Asteroid({ id: 2, x: 10, y: 0, radius: 5 });
    world.spawn(ship);
    world.spawn(asteroid);
    let hit: any = null;
    resolveCollisions(world, findCollisions(world), (e) => {
      hit = e;
    });
    expect(ship.hp).toBe(2);
    expect(hit?.type).toBe('ship-hit');
    expect(hit?.destroyed).toBe(false);
  });

  it('ship hit with hp 1 is destroyed', () => {
    const world = new World();
    const ship = new Ship({ id: 1, x: 0, y: 0, radius: 10, hp: 1 });
    const asteroid = new Asteroid({ id: 2, x: 10, y: 0, radius: 5 });
    world.spawn(ship);
    world.spawn(asteroid);
    let destroyed = false;
    resolveCollisions(world, findCollisions(world), (e) => {
      if (e.type === 'ship-hit') destroyed = e.destroyed;
    });
    expect(ship.alive).toBe(false);
    expect(destroyed).toBe(true);
  });

  it('friendly fire: bullet from same owner does not hit owner ship', () => {
    const world = new World();
    const ship = new Ship({ id: 1, x: 0, y: 0, radius: 10, playerId: 'p1' });
    const bullet = new Bullet({ id: 2, x: 1, y: 0, radius: 1, ownerId: 'p1' });
    world.spawn(ship);
    world.spawn(bullet);
    resolveCollisions(world, findCollisions(world));
    expect(ship.alive).toBe(true);
    expect(bullet.alive).toBe(true);
  });

  it('enemy bullet damages ship (non-kill)', () => {
    const world = new World();
    const ship = new Ship({ id: 1, x: 0, y: 0, radius: 10, playerId: 'p1', hp: 3 });
    const bullet = new Bullet({ id: 2, x: 1, y: 0, radius: 1, ownerId: 'p2', damage: 1 });
    world.spawn(ship);
    world.spawn(bullet);
    resolveCollisions(world, findCollisions(world));
    expect(ship.hp).toBe(2);
    expect(bullet.alive).toBe(false);
  });

  it('enemy bullet with damage kills ship at zero hp', () => {
    const world = new World();
    const ship = new Ship({ id: 1, x: 0, y: 0, radius: 10, playerId: 'p1', hp: 2 });
    const bullet = new Bullet({ id: 2, x: 1, y: 0, radius: 1, ownerId: 'p2', damage: 2 });
    world.spawn(ship);
    world.spawn(bullet);
    let destroyed = false;
    resolveCollisions(world, findCollisions(world), (e) => {
      if (e.type === 'ship-shot') destroyed = e.destroyed;
    });
    expect(ship.hp).toBe(0);
    expect(ship.alive).toBe(false);
    expect(bullet.alive).toBe(false);
    expect(destroyed).toBe(true);
  });

  it('pickup collected marks pickup dead and emits event', () => {
    const world = new World();
    const ship = new Ship({ id: 1, x: 0, y: 0, radius: 10 });
    const pickup = new Pickup({ id: 2, x: 2, y: 0, radius: 5, type: 'shield' });
    world.spawn(ship);
    world.spawn(pickup);
    let collected: any = null;
    resolveCollisions(world, findCollisions(world), (e) => {
      collected = e;
    });
    expect(pickup.alive).toBe(false);
    expect(collected?.type).toBe('pickup-collected');
    expect(collected?.pickupType).toBe('shield');
  });
});
