import { describe, expect, it } from 'vitest';
import { wrapAround, createArena } from '../src/sim/arena.ts';

describe('arena wrap-around', () => {
  const arena = createArena(100, 100);

  it('wraps negative x and y into range', () => {
    const e: { x: number; y: number } = { x: -5, y: -10 };
    wrapAround(e, arena);
    expect(e.x).toBe(95);
    expect(e.y).toBe(90);
  });

  it('wraps beyond max x and y into range', () => {
    const e: { x: number; y: number } = { x: 105, y: 205 };
    wrapAround(e, arena);
    expect(e.x).toBe(5);
    expect(e.y).toBe(5);
  });

  it('keeps in-range values unchanged', () => {
    const e: { x: number; y: number } = { x: 50, y: 50 };
    wrapAround(e, arena);
    expect(e.x).toBe(50);
    expect(e.y).toBe(50);
  });

  it('handles exact boundary multiples', () => {
    const e: { x: number; y: number } = { x: 100, y: -100 };
    wrapAround(e, arena);
    expect(e.x).toBe(0);
    expect(e.y).toBe(0);
  });
});
