import { describe, expect, it } from 'vitest';
import { Ship, integrate, SHIP_CONFIG } from '../src/sim/ship.ts';
import { Vector2 } from '../src/sim/vector.ts';

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
});
