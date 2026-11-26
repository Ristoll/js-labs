/**
 * Deterministic seeded 32-bit pseudo-random number generator (mulberry32).
 * Returns float in [0, 1).
 */
export type PRNG = () => number;

export function createMulberry32(seed: number = 12345): PRNG {
  let a = seed >>> 0;
  return function mulberry32(): number {
    a = Math.trunc(a + 0x6d2b79f5);
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

