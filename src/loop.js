/**
 * Fixed-timestep game loop synchronized with display refresh rate.
 *
 * Implements Glenn Fiedler's accumulator pattern:
 * - Deterministic physics running at fixed frequency (step = 1/60s).
 * - Clamped frame delta to prevent spiral of death on lag spikes.
 * - Interpolation alpha in [0, 1) passed to render.
 * - Accurate performance metrics:
 *   frame, tick, delta, jitter, mode, steps/s, frames/s.
 * - Live hooks for Milestone 4 experiments (hitch injection, setInterval, variable step).
 */
export function createLoop({ step = 1 / 60, simulate, render, onFrame = null }) {
  let accumulator = 0;
  let last = 0;
  let animationId = null;
  let intervalId = null;
  let running = false;
  let frameCallback = onFrame;
  let customModeStatus = null;

  let totalTicks = 0;
  let totalFrames = 0;

  let stepsThisSec = 0;
  let framesThisSec = 0;
  let statsTimer = 0;

  let stepsPerSecond = 0;
  let framesPerSecond = 0;
  let lastFrameDuration = 0; // in milliseconds
  let prevFrameDuration = 0;
  let rollingJitter = 0; // in milliseconds

  // Milestone 4 Experiment flags
  let busyWaitEvery60 = false;
  let useSetInterval = false;
  let variableTimestep = false;

  function tick(now) {
    if (!running) return;

    if (last === 0) {
      last = now;
      statsTimer = now;
      prevFrameDuration = 1000 / 60;
    }

    const currentDeltaMs = now - last;
    const deltaSec = Math.max(0, currentDeltaMs / 1000);
    lastFrameDuration = currentDeltaMs;

    // Track frame-time jitter (moving deviation from previous frame delta)
    const frameJitter = Math.abs(currentDeltaMs - prevFrameDuration);
    rollingJitter = rollingJitter === 0 ? frameJitter : rollingJitter * 0.9 + frameJitter * 0.1;
    prevFrameDuration = currentDeltaMs;
    last = now;

    // Experiment 1: 100ms synchronous block every 60th frame
    if (busyWaitEvery60 && totalFrames % 60 === 0 && totalFrames > 0) {
      const freezeStart = performance.now();
      while (performance.now() < freezeStart + 100) {
        // Run-to-completion block on main thread
      }
    }

    // Experiment 3: Variable timestep (simulate(dt) once per frame without accumulator)
    if (variableTimestep) {
      const dt = Math.min(deltaSec, 0.25);
      simulate(dt);
      stepsThisSec++;
      totalTicks++;
      render(1, getStats());
    } else {
      // Clamped accumulator (max 0.25s / 250ms hitch)
      accumulator += Math.min(deltaSec, 0.25);

      while (accumulator >= step) {
        simulate(step);
        accumulator -= step;
        stepsThisSec++;
        totalTicks++;
      }

      const alpha = accumulator / step;
      render(alpha, getStats());
    }

    totalFrames++;
    framesThisSec++;

    // Compute rolling 1-second statistics
    if (now - statsTimer >= 1000) {
      stepsPerSecond = stepsThisSec;
      framesPerSecond = framesThisSec;
      stepsThisSec = 0;
      framesThisSec = 0;
      statsTimer = now;
    }

    // Hook for real frame measurement (Experiment 3) — executes strictly AFTER physics & render of this frame
    if (frameCallback) {
      frameCallback({
        dt: deltaSec,
        deltaMs: currentDeltaMs,
        timestamp: now,
        totalTicks,
        totalFrames,
      });
    }

    if (!useSetInterval && running) {
      animationId = requestAnimationFrame(tick);
    }
  }

  function start() {
    if (running) return;
    running = true;
    accumulator = 0;
    last = performance.now();
    statsTimer = last;
    stepsThisSec = 0;
    framesThisSec = 0;
    prevFrameDuration = 0;
    rollingJitter = 0;

    if (useSetInterval) {
      intervalId = setInterval(() => {
        tick(performance.now());
      }, 16);
    } else {
      animationId = requestAnimationFrame(tick);
    }
  }

  function stop() {
    running = false;
    if (animationId !== null) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
    last = 0;
  }

  function resetAccumulator() {
    accumulator = 0;
    last = performance.now();
  }

  function getModeString() {
    if (customModeStatus) return customModeStatus;
    if (busyWaitEvery60) return 'hitch (100ms/60f)';
    if (useSetInterval) return 'setInterval (16ms)';
    if (variableTimestep) return 'variable timestep';
    return 'fixed (60 Hz)';
  }

  function getStats() {
    return {
      stepsPerSecond,
      framesPerSecond,
      lastFrameDuration,
      delta: lastFrameDuration,
      frame: totalFrames,
      tick: totalTicks,
      jitter: rollingJitter,
      mode: getModeString(),
    };
  }

  function setBusyWait(enabled) {
    busyWaitEvery60 = Boolean(enabled);
  }

  function setUseSetInterval(enabled) {
    const shouldEnable = Boolean(enabled);
    if (useSetInterval === shouldEnable) return;
    useSetInterval = shouldEnable;
    if (running) {
      stop();
      start();
    }
  }

  function setVariableTimestep(enabled) {
    variableTimestep = Boolean(enabled);
  }

  function setOnFrame(callback) {
    frameCallback = callback;
  }

  function setCustomMode(status) {
    customModeStatus = status;
  }

  return {
    start,
    stop,
    resetAccumulator,
    getStats,
    setBusyWait,
    isBusyWait: () => busyWaitEvery60,
    setUseSetInterval,
    isUseSetInterval: () => useSetInterval,
    setVariableTimestep,
    isVariableTimestep: () => variableTimestep,
    setOnFrame,
    setCustomMode,
  };
}
