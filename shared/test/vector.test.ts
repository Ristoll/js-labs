import { describe, expect, it } from 'vitest';
import { Vector2 } from '../src/sim/vector.ts';

describe('Vector2', () => {
  it('constructs with defaults and provided values', () => {
    const zero = new Vector2();
    expect(zero.x).toBe(0);
    expect(zero.y).toBe(0);

    const v = new Vector2(3, 4);
    expect(v.x).toBe(3);
    expect(v.y).toBe(4);
  });

  it('add / sub / scale are pure and return new vectors', () => {
    const a = new Vector2(1, 2);
    const b = new Vector2(3, 4);
    expect(a.add(b)).toEqual(new Vector2(4, 6));
    expect(a.sub(b)).toEqual(new Vector2(-2, -2));
    expect(a.scale(2)).toEqual(new Vector2(2, 4));
    expect(a.x).toBe(1); // unchanged (immutable)
    expect(a.y).toBe(2);
  });

  it('length and normalize', () => {
    const v = new Vector2(3, 4);
    expect(v.length()).toBe(5);
    const n = v.normalize();
    expect(n.x).toBeCloseTo(0.6);
    expect(n.y).toBeCloseTo(0.8);
    expect(new Vector2(0, 0).normalize()).toEqual(new Vector2(0, 0));
  });

  it('dot and distanceTo', () => {
    const a = new Vector2(1, 2);
    const b = new Vector2(4, 6);
    expect(a.dot(b)).toBe(16);
    expect(a.distanceTo(b)).toBe(5);
  });

  it('rotate / fromAngle', () => {
    const v = new Vector2(1, 0);
    const r = v.rotate(Math.PI / 2);
    expect(r.x).toBeCloseTo(0, 6);
    expect(r.y).toBeCloseTo(1, 6);

    const from = Vector2.fromAngle(0, 5);
    expect(from).toEqual(new Vector2(5, 0));
  });

  it('clone is independent', () => {
    const a = new Vector2(1, 2);
    const c = a.clone();
    expect(c).toEqual(a);
    expect(c).not.toBe(a);
  });
});
