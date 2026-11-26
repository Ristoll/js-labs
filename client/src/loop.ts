/**
 * Fixed-timestep game loop synchronized with display refresh rate.
 *
 * Implements Glenn Fiedler's accumulator pattern:
 * - Deterministic physics running at fixed frequency (step = 1/60s).
 * - Clamped frame delta to prevent spiral of death on lag spikes.
 * - Interpolation alpha in [0, 1) passed to render.
 * - Accurate performance metrics:
 *   frame, tick, delta, jitter, mode, steps/s, frames/s.
 */
export function createLoop({ step = 1 / 60, simulate, render, onFrame = null }) {
  let accumulator = 0;
  let last = 0;
  let animationId = null;
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

    // Hook for real frame measurement — executes strictly AFTER physics & render of this frame
    if (frameCallback) {
      frameCallback({
        dt: deltaSec,
        deltaMs: currentDeltaMs,
        timestamp: now,
        totalTicks,
        totalFrames,
      });
    }

    if (running) {
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

    animationId = requestAnimationFrame(tick);
  }

  function stop() {
    running = false;
    if (animationId !== null) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
    last = 0;
  }

  function resetAccumulator() {
    accumulator = 0;
    last = performance.now();
  }

  function getModeString() {
    if (customModeStatus) return customModeStatus;
    return 'fixed (60 Hz)';
  }

  function getStats() {
    const timeSinceLastFrame = last > 0 ? performance.now() - last : 0;
    const currentFps = timeSinceLastFrame > 1200 ? 0 : framesPerSecond;
    const currentSteps = timeSinceLastFrame > 1200 ? 0 : stepsPerSecond;

    return {
      stepsPerSecond: currentSteps,
      framesPerSecond: currentFps,
      lastFrameDuration,
      delta: lastFrameDuration,
      frame: totalFrames,
      tick: totalTicks,
      jitter: rollingJitter,
      mode: getModeString(),
    };
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
    setOnFrame,
    setCustomMode,
  };
}
