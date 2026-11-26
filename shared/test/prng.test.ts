import { describe, expect, it } from 'vitest';
import { createMulberry32 } from '../src/prng.ts';

describe('mulberry32 PRNG', () => {
  it('same seed produces identical sequence', () => {
    const a = createMulberry32(42);
    const b = createMulberry32(42);
    const seqA = Array.from({ length: 100 }, () => a());
    const seqB = Array.from({ length: 100 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it('different seeds produce different sequences', () => {
    const a = createMulberry32(42);
    const c = createMulberry32(999);
    const seqA = Array.from({ length: 100 }, () => a());
    const seqC = Array.from({ length: 100 }, () => c());
    expect(seqA).not.toEqual(seqC);
  });

  it('values are within [0, 1)', () => {
    const prng = createMulberry32(1);
    for (let i = 0; i < 1000; i++) {
      const v = prng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('is deterministic across repeated calls', () => {
    const p1 = createMulberry32(7);
    const first = [p1(), p1(), p1()];
    const p2 = createMulberry32(7);
    const second = [p2(), p2(), p2()];
    expect(first).toEqual(second);
  });
});
