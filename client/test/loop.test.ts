import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createLoop } from '../src/loop.ts';

describe('accumulator loop', () => {
  let loop: ReturnType<typeof createLoop>;
  let simulateCalls: number[];
  let renderCalls: { alpha: number; count: number };

  beforeEach(() => {
    vi.useFakeTimers();
    simulateCalls = [];
    renderCalls = { alpha: 0, count: 0 };
    // Stub rAF (not used in setInterval mode, but keep it defined).
    vi.stubGlobal('requestAnimationFrame', () => 1 as unknown as number);
    vi.stubGlobal('cancelAnimationFrame', () => {});
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
    vi.useRealTimers();
    vi.unstubAllGlobals();
    loop.stop();
  });

  it('start runs frames and steps with fixed dt', () => {
    loop.setUseSetInterval(true);
    loop.start();
    vi.advanceTimersByTime(1000);
    loop.stop();
    // First tick sees a large delta and drains the accumulator with fixed steps.
    expect(simulateCalls.length).toBeGreaterThan(0);
    for (const dt of simulateCalls) {
      expect(dt).toBe(1 / 60);
    }
    expect(renderCalls.count).toBeGreaterThan(0);
  });

  it('render alpha is in [0, 1)', () => {
    loop.setUseSetInterval(true);
    loop.start();
    vi.advanceTimersByTime(1000);
    loop.stop();
    expect(renderCalls.alpha).toBeGreaterThanOrEqual(0);
    expect(renderCalls.alpha).toBeLessThan(1);
  });

  it('setVariableTimestep toggles mode', () => {
    expect(loop.isVariableTimestep()).toBe(false);
    loop.setVariableTimestep(true);
    expect(loop.isVariableTimestep()).toBe(true);
    loop.setVariableTimestep(false);
    expect(loop.isVariableTimestep()).toBe(false);
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

  it('setBusyWait / setUseSetInterval toggle flags', () => {
    loop.setBusyWait(true);
    expect(loop.isBusyWait()).toBe(true);
    loop.setBusyWait(false);
    expect(loop.isBusyWait()).toBe(false);

    loop.setUseSetInterval(true);
    expect(loop.isUseSetInterval()).toBe(true);
    loop.setUseSetInterval(false);
    expect(loop.isUseSetInterval()).toBe(false);
  });

  it('setOnFrame and setCustomMode work', () => {
    let called = false;
    loop.setOnFrame(() => {
      called = true;
    });
    loop.setCustomMode('custom');
    expect(loop.getStats().mode).toBe('custom');
    loop.setUseSetInterval(true);
    loop.start();
    vi.advanceTimersByTime(50);
    expect(called).toBe(true);
    loop.stop();
  });
});
