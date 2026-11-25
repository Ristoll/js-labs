import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world.ts';
import { Ship } from '../src/sim/ship.ts';
import { Bullet } from '../src/sim/bullet.ts';
import { Asteroid } from '../src/sim/asteroid.ts';
import { Pickup } from '../src/sim/pickup.ts';
import { checkCircleCollision, findCollisions, findCollisionPairs, resolveCollisions } from '../src/sim/collision.ts';
import { Entity } from '../src/sim/entity.ts';

class FakeShip extends Entity {
  kind = 'ship';
  constructor({ x = 0, y = 0, radius = 10, alive = true, id }: { x?: number; y?: number; radius?: number; alive?: boolean; id?: number }) {
    super({ x, y, radius, alive, id, kind: 'ship' });
  }
}

class FakePickup extends Entity {
  kind = 'pickup';
  type = 'shield';
  constructor({ x = 0, y = 0, radius = 6, alive = true, id }: { x?: number; y?: number; radius?: number; alive?: boolean; id?: number }) {
    super({ x, y, radius, alive, id, kind: 'pickup' });
  }
}

describe('collision extended', () => {
  it('findCollisionPairs yields colliding pairs', () => {
    const world = new World();
    world.spawn(new Ship({ id: 1, x: 0, y: 0, radius: 10 }));
    world.spawn(new Ship({ id: 2, x: 5, y: 0, radius: 10 }));
    world.spawn(new Ship({ id: 3, x: 100, y: 0, radius: 10 }));
    const pairs = [...findCollisionPairs(world)];
    expect(pairs.length).toBe(1);
    expect(pairs[0][0].id).toBe(1);
    expect(pairs[0][1].id).toBe(2);
  });

  it('bullet (b) hits asteroid (a)', () => {
    const world = new World();
    const asteroid = new Asteroid({ id: 1, x: 0, y: 0, radius: 24 });
    const bullet = new Bullet({ id: 2, x: 1, y: 0, radius: 1, ownerId: 'p1' });
    world.spawn(asteroid);
    world.spawn(bullet);
    let score = 0;
    resolveCollisions(world, findCollisions(world), (e) => {
      if (e.type === 'asteroid-destroyed') score = e.score ?? 0;
    });
    expect(asteroid.alive).toBe(false);
    expect(bullet.alive).toBe(false);
    expect(score).toBe(100);
  });

  it('ship (b) hits asteroid (a)', () => {
    const world = new World();
    const asteroid = new Asteroid({ id: 1, x: 0, y: 0, radius: 24 });
    const ship = new Ship({ id: 2, x: 10, y: 0, radius: 10, hp: 3 });
    world.spawn(asteroid);
    world.spawn(ship);
    let hit: any = null;
    resolveCollisions(world, findCollisions(world), (e) => { hit = e; });
    expect(asteroid.alive).toBe(false);
    expect(ship.hp).toBe(2);
    expect(hit?.type).toBe('ship-hit');
    expect(hit?.destroyed).toBe(false);
  });

  it('ship (b) hit with hp 1 is destroyed', () => {
    const world = new World();
    const asteroid = new Asteroid({ id: 1, x: 0, y: 0, radius: 24 });
    const ship = new Ship({ id: 2, x: 10, y: 0, radius: 10, hp: 1 });
    world.spawn(asteroid);
    world.spawn(ship);
    let destroyed = false;
    resolveCollisions(world, findCollisions(world), (e) => {
      if (e.type === 'ship-hit') destroyed = e.destroyed;
    });
    expect(ship.alive).toBe(false);
    expect(destroyed).toBe(true);
  });

  it('bullet (b) hits ship (a)', () => {
    const world = new World();
    const ship = new Ship({ id: 1, x: 0, y: 0, radius: 10, playerId: 'p1', hp: 3 });
    const bullet = new Bullet({ id: 2, x: 1, y: 0, radius: 1, ownerId: 'p2', damage: 1 });
    world.spawn(ship);
    world.spawn(bullet);
    resolveCollisions(world, findCollisions(world));
    expect(ship.hp).toBe(2);
    expect(bullet.alive).toBe(false);
  });

  it('bullet (b) friendly fire does not hit owner ship (a)', () => {
    const world = new World();
    const ship = new Ship({ id: 1, x: 0, y: 0, radius: 10, playerId: 'p1' });
    const bullet = new Bullet({ id: 2, x: 1, y: 0, radius: 1, ownerId: 'p1' });
    world.spawn(ship);
    world.spawn(bullet);
    resolveCollisions(world, findCollisions(world));
    expect(ship.alive).toBe(true);
    expect(bullet.alive).toBe(true);
  });

  it('ship (b) hits pickup (a)', () => {
    const world = new World();
    const pickup = new Pickup({ id: 1, x: 0, y: 0, radius: 5, type: 'shield' });
    const ship = new Ship({ id: 2, x: 2, y: 0, radius: 10 });
    world.spawn(pickup);
    world.spawn(ship);
    let collected: any = null;
    resolveCollisions(world, findCollisions(world), (e) => { collected = e; });
    expect(pickup.alive).toBe(false);
    expect(collected?.type).toBe('pickup-collected');
    expect(collected?.pickupType).toBe('shield');
  });

  it('ship-hit falls back to ship.alive = false when takeDamage missing', () => {
    const asteroid = new Asteroid({ id: 1, x: 0, y: 0, radius: 24 });
    const fakeShip = new FakeShip({ x: 10, y: 0, radius: 10, id: 2 });
    // (asteroid is a, fakeShip is b) → ship-b hits asteroid-a else-branch
    let destroyed: any = null;
    resolveCollisions([asteroid, fakeShip] as unknown as Iterable<Entity>, [[asteroid, fakeShip]] as any, (e) => {
      destroyed = e.destroyed;
    });
    expect(fakeShip.alive).toBe(false);
    expect(destroyed).toBe(true);
  });

  it('ship-shot falls back to ship.alive = false when takeDamage missing', () => {
    const fakeShip = new FakeShip({ x: 0, y: 0, radius: 10, id: 1 });
    const bullet = new Bullet({ id: 2, x: 1, y: 0, radius: 1, ownerId: 'p2', damage: 1 });
    // (fakeShip is a, bullet is b) → bullet-b hits ship-a else-branch
    let destroyed: any = null;
    resolveCollisions([fakeShip, bullet] as unknown as Iterable<Entity>, [[fakeShip, bullet]] as any, (e) => {
      destroyed = e.destroyed;
    });
    expect(fakeShip.alive).toBe(false);
    expect(bullet.alive).toBe(false);
    expect(destroyed).toBe(true);
  });

  it('pickup-collected falls back to pickup.alive = false when applyTo missing', () => {
    const fakePickup = new FakePickup({ x: 0, y: 0, radius: 5, id: 1 });
    const ship = new Ship({ id: 2, x: 2, y: 0, radius: 10 });
    // delete applyTo to force else branch
    delete (fakePickup as any).applyTo;
    // (ship is a, fakePickup is b) → ship-a hits pickup-b
    let collected: any = null;
    resolveCollisions([ship, fakePickup] as unknown as Iterable<Entity>, [[ship, fakePickup]] as any, (e) => {
      collected = e;
    });
    expect(fakePickup.alive).toBe(false);
    expect(collected?.type).toBe('pickup-collected');
  });

  it('ship-b hits pickup-a (reverse order)', () => {
    const fakePickup = new FakePickup({ x: 0, y: 0, radius: 5, id: 1 });
    const ship = new Ship({ id: 2, x: 2, y: 0, radius: 10 });
    // (fakePickup is a, ship is b) → ship-b hits pickup-a
    let collected: any = null;
    resolveCollisions([fakePickup, ship] as unknown as Iterable<Entity>, [[fakePickup, ship]] as any, (e) => {
      collected = e;
    });
    expect(fakePickup.alive).toBe(false);
    expect(collected?.type).toBe('pickup-collected');
  });

  it('bullet-a hits asteroid-b with no onEvent', () => {
    const world = new World();
    const bullet = new Bullet({ id: 1, x: 0, y: 0, radius: 1, ownerId: 'p1' });
    const asteroid = new Asteroid({ id: 2, x: 2, y: 0, radius: 24 });
    world.spawn(bullet);
    world.spawn(asteroid);
    resolveCollisions(world, findCollisions(world));
    expect(bullet.alive).toBe(false);
    expect(asteroid.alive).toBe(false);
  });

  it('ship-a hits asteroid-b damages ship', () => {
    const world = new World();
    const ship = new Ship({ id: 1, x: 0, y: 0, radius: 10, hp: 3 });
    const asteroid = new Asteroid({ id: 2, x: 10, y: 0, radius: 24 });
    world.spawn(ship);
    world.spawn(asteroid);
    resolveCollisions(world, findCollisions(world));
    expect(asteroid.alive).toBe(false);
    expect(ship.hp).toBe(2);
  });

  it('bullet-a hits ship-b damages ship', () => {
    const world = new World();
    const bullet = new Bullet({ id: 1, x: 0, y: 0, radius: 1, ownerId: 'p2', damage: 1 });
    const ship = new Ship({ id: 2, x: 1, y: 0, radius: 10, playerId: 'p1', hp: 3 });
    world.spawn(bullet);
    world.spawn(ship);
    resolveCollisions(world, findCollisions(world));
    expect(ship.hp).toBe(2);
    expect(bullet.alive).toBe(false);
  });

  it('bullet-a hits ship-b friendly fire does not hit', () => {
    const world = new World();
    const bullet = new Bullet({ id: 1, x: 0, y: 0, radius: 1, ownerId: 'p1' });
    const ship = new Ship({ id: 2, x: 1, y: 0, radius: 10, playerId: 'p1' });
    world.spawn(bullet);
    world.spawn(ship);
    resolveCollisions(world, findCollisions(world));
    expect(ship.alive).toBe(true);
    expect(bullet.alive).toBe(true);
  });

  it('pickup applyTo branch with real pickup and no onEvent', () => {
    const world = new World();
    const ship = new Ship({ id: 1, x: 0, y: 0, radius: 10, hp: 1 });
    const pickup = new Pickup({ id: 2, x: 2, y: 0, radius: 5, type: 'shield' });
    world.spawn(ship);
    world.spawn(pickup);
    resolveCollisions(world, findCollisions(world));
    expect(pickup.alive).toBe(false);
    expect(ship.hp).toBe(3); // healed by shield applyTo
  });

  it('bullet-a hits asteroid-b with onEvent', () => {
    const world = new World();
    const bullet = new Bullet({ id: 1, x: 0, y: 0, radius: 1, ownerId: 'p1' });
    const asteroid = new Asteroid({ id: 2, x: 2, y: 0, radius: 24 });
    world.spawn(bullet);
    world.spawn(asteroid);
    let score = 0;
    resolveCollisions(world, findCollisions(world), (e) => {
      if (e.type === 'asteroid-destroyed') score = e.score ?? 0;
    });
    expect(score).toBe(100);
  });

  it('ship-a hits asteroid-b with onEvent', () => {
    const world = new World();
    const ship = new Ship({ id: 1, x: 0, y: 0, radius: 10, hp: 3 });
    const asteroid = new Asteroid({ id: 2, x: 10, y: 0, radius: 24 });
    world.spawn(ship);
    world.spawn(asteroid);
    let hit: any = null;
    resolveCollisions(world, findCollisions(world), (e) => { hit = e; });
    expect(hit?.type).toBe('ship-hit');
    expect(ship.hp).toBe(2);
  });

  it('ship-a without takeDamage falls back to alive = false', () => {
    const fakeShip = new FakeShip({ x: 0, y: 0, radius: 10, id: 1 });
    const asteroid = new Asteroid({ id: 2, x: 10, y: 0, radius: 24 });
    // (fakeShip is a, asteroid is b) → ship-a hits asteroid-b takeDamage else
    let destroyed: any = null;
    resolveCollisions([fakeShip, asteroid] as unknown as Iterable<Entity>, [[fakeShip, asteroid]] as any, (e) => {
      destroyed = e.destroyed;
    });
    expect(fakeShip.alive).toBe(false);
    expect(destroyed).toBe(true);
  });

  it('bullet-a hits ship-b with onEvent', () => {
    const world = new World();
    const bullet = new Bullet({ id: 1, x: 0, y: 0, radius: 1, ownerId: 'p2', damage: 1 });
    const ship = new Ship({ id: 2, x: 1, y: 0, radius: 10, playerId: 'p1', hp: 3 });
    world.spawn(bullet);
    world.spawn(ship);
    let hit: any = null;
    resolveCollisions(world, findCollisions(world), (e) => { hit = e; });
    expect(hit?.type).toBe('ship-shot');
    expect(ship.hp).toBe(2);
  });

  it('bullet-a hits ship-b without takeDamage falls back', () => {
    const fakeShip = new FakeShip({ x: 1, y: 0, radius: 10, id: 2 });
    const bullet = new Bullet({ id: 1, x: 0, y: 0, radius: 1, ownerId: 'p2', damage: 1 });
    // (bullet is a, fakeShip is b) → bullet-a hits ship-b takeDamage else
    let destroyed: any = null;
    resolveCollisions([bullet, fakeShip] as unknown as Iterable<Entity>, [[bullet, fakeShip]] as any, (e) => {
      destroyed = e.destroyed;
    });
    expect(fakeShip.alive).toBe(false);
    expect(bullet.alive).toBe(false);
    expect(destroyed).toBe(true);
  });
});
