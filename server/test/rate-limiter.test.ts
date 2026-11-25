import { describe, expect, it } from 'vitest';
import { TokenBucket } from '../src/rate-limiter.ts';

describe('TokenBucket rate limiter', () => {
  it('starts full and consumes tokens', () => {
    const tb = new TokenBucket(3, 10);
    expect(tb.tryConsume(1)).toBe(true);
    expect(tb.tryConsume(1)).toBe(true);
    expect(tb.tryConsume(1)).toBe(true);
    expect(tb.tryConsume(1)).toBe(false); // exhausted
  });

  it('refills tokens over time', () => {
    const tb = new TokenBucket(2, 4); // 4 tokens/sec
    tb.tryConsume(2);
    expect(tb.tryConsume(1)).toBe(false);
    // advance ~500ms -> 2 tokens refilled
    const now = Date.now;
    let fake = now();
    Date.now = () => fake as unknown as number;
    try {
      fake += 250; // 1 token
      expect(tb.tryConsume(1)).toBe(true);
      fake += 250; // 1 more token
      expect(tb.tryConsume(1)).toBe(true);
      expect(tb.tryConsume(1)).toBe(false);
    } finally {
      Date.now = now;
    }
  });

  it('capacity caps refill', () => {
    const tb = new TokenBucket(5, 1000);
    tb.tryConsume(5);
    // simulate lots of time passing; should not exceed capacity
    const now = Date.now;
    let fake = now();
    Date.now = () => fake as unknown as number;
    try {
      fake += 10_000;
      tb.refill();
      expect(tb.tryConsume(5)).toBe(true);
      expect(tb.tryConsume(1)).toBe(false);
    } finally {
      Date.now = now;
    }
  });

  it('consume count greater than one', () => {
    const tb = new TokenBucket(10, 10);
    expect(tb.tryConsume(3)).toBe(true);
    expect(tb.tryConsume(3)).toBe(true);
    expect(tb.tryConsume(3)).toBe(true); // 9 used, 1 left
    expect(tb.tryConsume(3)).toBe(false); // only 1 left, need 3
    expect(tb.tryConsume(1)).toBe(true); // last token
    expect(tb.tryConsume(1)).toBe(false); // exhausted
  });

  it('defaults: capacity 20, refill 10', () => {
    const tb = new TokenBucket();
    expect(tb.capacity).toBe(20);
    expect(tb.refillRate).toBe(10);
    expect(tb.tokens).toBe(20);
  });
});
