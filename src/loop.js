/**
 * Fixed-timestep game loop synchronized with display refresh rate.
 *
 * Implements Glenn Fiedler's accumulator pattern:
 * - Deterministic physics running at fixed frequency (step = 1/60s).
 * - Clamped frame delta to prevent spiral of death on lag spikes.
 * - Interpolation alpha in [0, 1) passed to render.
 * - Accurate performance metrics (steps/s, frames/s, frame time).
 */
export function createLoop({ step = 1 / 60, simulate, render }) {
  let accumulator = 0;
  let last = 0;
  let animationId = null;
  let running = false;

  let stepsThisSec = 0;
  let framesThisSec = 0;
  let statsTimer = 0;

  let stepsPerSecond = 0;
  let framesPerSecond = 0;
  let lastFrameDuration = 0; // in milliseconds

  function frame(now) {
    if (!running) return;

    if (last === 0) {
      last = now;
      statsTimer = now;
    }

    const deltaSec = Math.max(0, (now - last) / 1000);
    lastFrameDuration = now - last;
    last = now;

    // Clamped accumulator (max 0.25s / 250ms hitch)
    accumulator += Math.min(deltaSec, 0.25);

    while (accumulator >= step) {
      simulate(step);
      accumulator -= step;
      stepsThisSec++;
    }

    const alpha = accumulator / step;
    render(alpha, getStats());

    framesThisSec++;

    // Compute rolling 1-second statistics
    if (now - statsTimer >= 1000) {
      stepsPerSecond = stepsThisSec;
      framesPerSecond = framesThisSec;
      stepsThisSec = 0;
      framesThisSec = 0;
      statsTimer = now;
    }

    animationId = requestAnimationFrame(frame);
  }

  function start() {
    if (running) return;
    running = true;
    accumulator = 0;
    last = performance.now();
    statsTimer = last;
    stepsThisSec = 0;
    framesThisSec = 0;

    animationId = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    if (animationId !== null) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
    last = 0;
  }

  function getStats() {
    return {
      stepsPerSecond,
      framesPerSecond,
      lastFrameDuration,
    };
  }

  return {
    start,
    stop,
    getStats,
  };
}
