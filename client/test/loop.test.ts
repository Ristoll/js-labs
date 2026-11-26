import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createLoop } from '../src/loop.ts';

type RafCallback = (now: number) => void;

describe('accumulator loop', () => {
  let loop: ReturnType<typeof createLoop>;
  let simulateCalls: number[];
  let renderCalls: { alpha: number; count: number };
  let rafCb: RafCallback | null;
  let now = 0;

  beforeEach(() => {
    now = 0;
    simulateCalls = [];
    renderCalls = { alpha: 0, count: 0 };
    rafCb = null;
    vi.stubGlobal('performance', { now: () => now });
    vi.stubGlobal('requestAnimationFrame', (cb: RafCallback) => {
      rafCb = cb;
      return 1 as unknown as number;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {
      rafCb = null;
    });
    loop = createLoop({
      step: 1 / 60,
      simulate: (dt: number) => {
        simulateCalls.push(dt);
      },
      render: (alpha: number) => {
        renderCalls.alpha = alpha;
        renderCalls.count += 1;
      },
    });
  });

  afterEach(() => {
    loop.stop();
    vi.unstubAllGlobals();
  });

  const advance = (ms = 1000) => {
    now += ms;
    rafCb?.(now);
  };

  it('start runs frames and steps with fixed dt', () => {
    loop.start();
    // First tick initializes `last` (delta 0); second tick runs the accumulator.
    advance();
    advance();
    loop.stop();
    expect(simulateCalls.length).toBeGreaterThan(0);
    for (const dt of simulateCalls) {
      expect(dt).toBe(1 / 60);
    }
    expect(renderCalls.count).toBeGreaterThan(0);
  });

  it('render alpha is in [0, 1)', () => {
    loop.start();
    advance();
    advance();
    loop.stop();
    expect(renderCalls.alpha).toBeGreaterThanOrEqual(0);
    expect(renderCalls.alpha).toBeLessThan(1);
  });

  it('getStats returns expected shape', () => {
    const stats = loop.getStats();
    expect(stats).toHaveProperty('framesPerSecond');
    expect(stats).toHaveProperty('stepsPerSecond');
    expect(stats).toHaveProperty('mode');
    expect(typeof stats.mode).toBe('string');
  });

  it('resetAccumulator does not throw', () => {
    loop.start();
    loop.resetAccumulator();
    expect(loop.getStats().tick).toBeGreaterThanOrEqual(0);
    loop.stop();
  });

  it('setOnFrame and setCustomMode work', () => {
    let called = false;
    loop.setOnFrame(() => {
      called = true;
    });
    loop.setCustomMode('custom');
    expect(loop.getStats().mode).toBe('custom');
    loop.start();
    advance(50);
    expect(called).toBe(true);
    loop.stop();
  });
});
