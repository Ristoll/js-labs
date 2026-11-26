import { describe, expect, it } from 'vitest';
import { Ship, integrate, SHIP_CONFIG, createShip } from '../src/sim/ship.ts';
import { Vector2 } from '../src/sim/vector.ts';
import { Bullet } from '../src/sim/bullet.ts';

describe('Ship / integrate', () => {
  it('integrate applies thrust forward along angle', () => {
    const ship = new Ship({ x: 0, y: 0, angle: 0 });
    const out = integrate(ship, { thrust: true }, 1 / 60);
    expect(out.vx).toBeGreaterThan(0);
    expect(out.vy).toBeCloseTo(0, 6);
  });

  it('integrate turn changes angle clamped to [-1, 1]', () => {
    const ship = new Ship({ x: 0, y: 0, angle: 0 });
    const out = integrate(ship, { turn: 1 }, 1 / 60);
    expect(out.angle).toBeCloseTo(SHIP_CONFIG.turnSpeed / 60, 6);
  });

  it('integrate reverse decelerates', () => {
    const ship = new Ship({ x: 0, y: 0, angle: 0, vx: 100 });
    const before = ship.vx;
    const out = integrate(ship, { reverse: true }, 1 / 60);
    expect(out.vx).toBeLessThan(before);
  });

  it('drag reduces speed over time', () => {
    const ship = new Ship({ x: 0, y: 0, vx: 100 });
    const out = integrate(ship, null, 1);
    expect(out.vx).toBeLessThan(100);
    expect(out.vx).toBeGreaterThan(0);
  });

  it('maxSpeed clamp', () => {
    const ship = new Ship({ x: 0, y: 0, vx: 900, vy: 0 });
    const out = integrate(ship, null, 1);
    expect(out.vx).toBeCloseTo(SHIP_CONFIG.maxSpeed, 6);
  });

  it('fire returns null while on cooldown', () => {
    const ship = new Ship();
    ship.cooldown = 0.5;
    expect(ship.fire(null)).toBeNull();
  });

  it('takeDamage kills at zero hp', () => {
    const ship = new Ship({ hp: 1 });
    ship.takeDamage(1);
    expect(ship.hp).toBe(0);
    expect(ship.alive).toBe(false);
  });

  it('heal caps at max hp', () => {
    const ship = new Ship({ hp: 1 });
    expect(ship.heal(10)).toBe(3);
  });

  it('reset restores defaults', () => {
    const ship = new Ship({ x: 5, y: 5, hp: 1 });
    ship.takeDamage(1);
    ship.reset(10, 20);
    expect(ship.x).toBe(10);
    expect(ship.y).toBe(20);
    expect(ship.hp).toBe(3);
    expect(ship.alive).toBe(true);
  });

  it('clone is independent and preserves hp/cooldown', () => {
    const ship = new Ship({ id: 7, hp: 2 });
    ship.cooldown = 0.3;
    const copy = ship.clone();
    expect(copy.id).toBe(7);
    expect(copy.hp).toBe(2);
    expect(copy.cooldown).toBe(0.3);
    expect(copy).not.toBe(ship);
  });

  it('fire creates a bullet when not on cooldown', () => {
    const world = { spawn: (b: unknown) => void 0 };
    const ship = new Ship({ id: 1, x: 0, y: 0, angle: 0, playerId: 'p1' });
    const bullet = ship.fire(world);
    expect(bullet).not.toBeNull();
    expect(bullet!.ownerId).toBe('p1');
    expect(ship.cooldown).toBeGreaterThan(0);
  });

  it('update with isDown function turns right and thrusts', () => {
    const ship = new Ship({ x: 0, y: 0, angle: 0 });
    const input = { isDown: (key: string) => key === 'ArrowRight' || key === 'KeyD' };
    const out = integrate(ship, input, 1 / 60);
    expect(out.angle).toBeGreaterThan(0);
  });

  it('update decays cooldown and rapidFireTimer', () => {
    const ship = new Ship({ id: 1 });
    ship.cooldown = 0.5;
    ship.rapidFireTimer = 0.3;
    integrate(ship, null, 0.1);
    expect(ship.cooldown).toBeCloseTo(0.4, 6);
    expect(ship.rapidFireTimer).toBeCloseTo(0.2, 6);
  });

  it('integrate with plain ShipOptions constructs a new ship', () => {
    const out = integrate({ x: 5, y: 5, angle: 0 } as any, null, 1 / 60);
    expect(out.x).toBe(5);
    expect(out.y).toBe(5);
  });

  it('createShip builds a ship', () => {
    const s = createShip({ id: 9, hp: 2 });
    expect(s.id).toBe(9);
    expect(s.hp).toBe(2);
  });

  it('bullet.update calls homing.update when homing set and world given', () => {
    const bullet = new Bullet({ id: 1, x: 0, y: 0, radius: 3 });
    let called = false;
    bullet.homing = { update: () => { called = true; }, clone: () => null } as any;
    bullet.update(0.01, {} as any);
    expect(called).toBe(true);
  });

  it('bullet.fromSnapshot uses defaults for missing optional fields', () => {
    const b = Bullet.fromSnapshot({ id: 5, x: 1, y: 2 } as any);
    expect(b.ttl).toBe(1.4);
    expect(b.damage).toBe(1);
    expect(b.alive).toBe(true);
    expect(b.ownerId).toBeNull();
  });
});
