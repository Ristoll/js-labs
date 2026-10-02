import { createLoop } from './loop.js';
import { createInput } from './input.js';
import { createShip, integrate } from './sim/ship.js';
import { createArena, wrapAround } from './sim/arena.js';
import { setupCanvas } from './render/canvas.js';
import { drawBackground, drawShip, drawHud } from './render/draw.js';
import {
  toggleExperiment1,
  toggleExperiment2,
  toggleExperiment3,
  runExperiment3Measurement,
} from './experiments.js';

// 1. Setup Canvas and Viewport
const canvasElement = document.getElementById('game-canvas');
let arena = createArena(window.innerWidth || 1200, window.innerHeight || 800);

const { ctx } = setupCanvas(canvasElement, ({ width, height }) => {
  arena = createArena(width, height);
});

// 2. Setup Input Handling (Encapsulated in Closures)
const input = createInput(window);

// 3. Initialize Ship State (Pure Plain Data Object)
let ship = createShip({
  x: arena.width / 2,
  y: arena.height / 2,
  vx: 0,
  vy: 0,
  angle: -Math.PI / 2, // Start facing upwards
  thrust: false,
});
let previousShip = { ...ship };

// Experiment 3 Live Measurement Flight Controls
let testThrustActive = false;
let testUnwrappedX = 0;
let testPhysicsSteps = 0;
let testSimTime = 0;
let testTargetSteps = Infinity;
let testTargetSimTime = Infinity;

const testControls = {
  startTest({ targetSteps = Infinity, targetSimTime = Infinity } = {}) {
    // Reset to pristine identical starting state
    ship = createShip({
      x: 80,
      y: arena.height / 2,
      vx: 0,
      vy: 0,
      angle: 0, // Pointing strictly +X for clean 1D trajectory measurement
      thrust: true,
      reverse: false,
    });
    previousShip = { ...ship };

    // Reset metric accumulators
    testUnwrappedX = 0;
    testPhysicsSteps = 0;
    testSimTime = 0;
    testTargetSteps = targetSteps;
    testTargetSimTime = targetSimTime;
    testThrustActive = true;
  },

  stopTest() {
    testThrustActive = false;
    testTargetSteps = Infinity;
    testTargetSimTime = Infinity;
    if (ship) {
      ship = { ...ship, thrust: false };
    }
  },

  getShipData() {
    return {
      ship,
      unwrappedX: testUnwrappedX,
      physicsSteps: testPhysicsSteps,
      simTime: testSimTime,
    };
  },
};

// 4. Fixed-Timestep Game Loop (Decoupled Physics & Rendering)
const loop = createLoop({
  step: 1 / 60,

  simulate(dt) {
    // Retain previous state for render interpolation
    previousShip = ship;

    const shouldTestThrust =
      testThrustActive &&
      testPhysicsSteps < testTargetSteps &&
      testSimTime < testTargetSimTime;

    // During automated live testing, inject dedicated forward thrust
    const activeInput = shouldTestThrust
      ? { isDown: (code) => code === 'ArrowUp' || code === 'KeyW' }
      : input;

    // Pure functional physics integration
    const nextShip = integrate(ship, activeInput, dt);

    if (shouldTestThrust) {
      testUnwrappedX += nextShip.vx * dt;
      testPhysicsSteps++;
      testSimTime += dt;
    }

    // Toroidal wrap-around boundaries
    ship = wrapAround(nextShip, arena);
  },

  render(alpha, stats) {
    // 1. Background grid, nebulae, and starfield
    drawBackground(ctx, arena.width, arena.height, performance.now());

    // 2. Interpolated high-visibility player ship
    drawShip(ctx, ship, previousShip, alpha, arena);

    // 3. Performance telemetry HUD (steps/s, frames/s, frame ms)
    drawHud(ctx, stats);
  },
});

// Start the game loop
loop.start();

// Milestone 4 Experiments (Results printed in Console)
const btn1 = document.getElementById('btn-exp-1');
const btn2 = document.getElementById('btn-exp-2');
const btn3 = document.getElementById('btn-exp-3');
const btn3Base = document.getElementById('btn-exp-3-base');
const btn3Throt = document.getElementById('btn-exp-3-throttle');

btn1?.addEventListener('click', () => toggleExperiment1(loop, btn1));
btn2?.addEventListener('click', () => toggleExperiment2(loop, btn2));
btn3?.addEventListener('click', () => toggleExperiment3(loop, btn3));

btn3Base?.addEventListener('click', () =>
  runExperiment3Measurement({
    loop,
    buttonElement: btn3Base,
    isThrottled: false,
    testControls,
  })
);

btn3Throt?.addEventListener('click', () =>
  runExperiment3Measurement({
    loop,
    buttonElement: btn3Throt,
    isThrottled: true,
    testControls,
  })
);
