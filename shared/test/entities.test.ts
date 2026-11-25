import { describe, expect, it } from 'vitest';
import { Asteroid, createAsteroidVertices } from '../src/sim/asteroid.ts';
import { Bullet } from '../src/sim/bullet.ts';
import { Pickup, PICKUP_TYPES } from '../src/sim/pickup.ts';
import { Entity } from '../src/sim/entity.ts';
import { Vector2 } from '../src/sim/vector.ts';

describe('Asteroid', () => {
  it('createAsteroidVertices returns count points', () => {
    const verts = createAsteroidVertices(24, 8, () => 0.5);
    expect(verts.length).toBe(8);
  });

  it('constructor sets angularVelocity and vertices', () => {
    const a = new Asteroid({ id: 1, x: 10, y: 20, radius: 30, angularVelocity: 0.7 });
    expect(a.angularVelocity).toBe(0.7);
    expect(a.radius).toBe(30);
    expect(a.vertices.length).toBeGreaterThan(0);
  });

  it('update rotates angle and moves', () => {
    const a = new Asteroid({ id: 1, x: 0, y: 0, vx: 10, vy: 0, angularVelocity: 1 });
    const before = a.angle;
    a.update(0.1, null);
    expect(a.angle).not.toBe(before);
    expect(a.x).toBe(1);
  });

  it('toSnapshot / fromSnapshot round-trip', () => {
    const a = new Asteroid({ id: 5, x: 3, y: 4, angularVelocity: 0.25, radius: 18 });
    const snap = a.toSnapshot();
    const restored = Asteroid.fromSnapshot(snap as any);
    expect(restored.id).toBe(5);
    expect(restored.x).toBe(3);
    expect(restored.y).toBe(4);
    expect(restored.angularVelocity).toBe(0.25);
    expect(restored.radius).toBe(18);
  });

  it('clone is independent', () => {
    const a = new Asteroid({ id: 9, x: 1, y: 1, angularVelocity: 0.5 });
    const c = a.clone();
    expect(c).not.toBe(a);
    expect(c.id).toBe(9);
    expect(c.vertices).toBe(a.vertices);
  });

  it('createRandom stays in arena', () => {
    const arena = { width: 1000, height: 600 };
    const a = Asteroid.createRandom(arena, null, () => 0.5);
    expect(a.x).toBeGreaterThanOrEqual(0);
    expect(a.x).toBeLessThan(1000);
    expect(a.y).toBeGreaterThanOrEqual(0);
    expect(a.y).toBeLessThan(600);
  });
});

describe('Bullet', () => {
  it('update reduces ttl and dies', () => {
    const b = new Bullet({ id: 1, x: 0, y: 0, ttl: 0.1 });
    b.update(0.05, null);
    expect(b.ttl).toBeCloseTo(0.05, 6);
    expect(b.alive).toBe(true);
    b.update(0.1, null);
    expect(b.alive).toBe(false);
  });

  it('toSnapshot / fromSnapshot round-trip', () => {
    const b = new Bullet({ id: 2, x: 5, y: 6, ttl: 0.8, damage: 2, ownerId: 'p1' });
    const snap = b.toSnapshot();
    const restored = Bullet.fromSnapshot(snap as any);
    expect(restored.id).toBe(2);
    expect(restored.ttl).toBe(0.8);
    expect(restored.damage).toBe(2);
    expect(restored.ownerId).toBe('p1');
  });

  it('clone', () => {
    const b = new Bullet({ id: 3, x: 1, y: 1, damage: 5, ownerId: 'p2' });
    const c = b.clone();
    expect(c).not.toBe(b);
    expect(c.damage).toBe(5);
    expect(c.ownerId).toBe('p2');
  });
});

describe('Pickup', () => {
  it('default type is shield', () => {
    const p = new Pickup({ id: 1 });
    expect(p.type).toBe(PICKUP_TYPES.SHIELD);
  });

  it('applyTo heals ship then marks dead', () => {
    const p = new Pickup({ id: 1, type: PICKUP_TYPES.SHIELD });
    let healed = 0;
    const s = { hp: 1, heal: (n: number) => { healed = n; } };
    p.applyTo(s as any);
    expect(healed).toBe(3);
    expect(p.alive).toBe(false);
  });

  it('rapid fire pickup sets rapidFireTimer', () => {
    const p = new Pickup({ id: 2, type: PICKUP_TYPES.RAPID_FIRE });
    const ship: any = { rapidFireTimer: 0 };
    p.applyTo(ship);
    expect(ship.rapidFireTimer).toBe(8);
  });

  it('update advances pulseTime and angle', () => {
    const p = new Pickup({ id: 3 });
    const before = p.pulseTime;
    p.update(0.5);
    expect(p.pulseTime).toBeGreaterThan(before);
    expect(p.angle).toBe(0.75); // 0.5 * 1.5
  });

  it('createRandom picks a type', () => {
    const arena = { width: 1000, height: 600 };
    const p = Pickup.createRandom(arena, null, null, () => 0.8);
    expect(p.type).toBe(PICKUP_TYPES.SHIELD); // 0.8 > 0.5 → shield
    const p2 = Pickup.createRandom(arena, null, null, () => 0.2);
    expect(p2.type).toBe(PICKUP_TYPES.RAPID_FIRE); // 0.2 <= 0.5 → rapidfire
  });

  it('toSnapshot / fromSnapshot round-trip', () => {
    const p = new Pickup({ id: 7, x: 9, y: 8, type: 'shield' });
    const snap = p.toSnapshot();
    const restored = Pickup.fromSnapshot(snap as any);
    expect(restored.id).toBe(7);
    expect(restored.type).toBe('shield');
  });
});

describe('Entity', () => {
  it('resetNextId and id assignment', () => {
    Entity.resetNextId(100);
    const a = new Entity({ id: 5 });
    const b = new Entity({}); // auto id
    expect(a.id).toBe(5);
    expect(b.id).toBe(100);
    Entity.resetNextId(1);
  });

  it('position setters create new vectors', () => {
    const e = new Entity({ x: 1, y: 2, vx: 3, vy: 4 });
    e.x = 10;
    e.y = 20;
    e.vx = 30;
    e.vy = 40;
    expect(e.x).toBe(10);
    expect(e.y).toBe(20);
    expect(e.vx).toBe(30);
    expect(e.vy).toBe(40);
  });

  it('clone', () => {
    const e = new Entity({ id: 7, x: 1, y: 2, radius: 9, kind: 'custom' });
    const c = e.clone();
    expect(c).not.toBe(e);
    expect(c.id).toBe(7);
    expect(c.x).toBe(1);
    expect(c.kind).toBe('custom');
  });
});
