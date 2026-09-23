import { createLoop } from './loop.js';
import { createInput } from './input.js';
import { createShip, integrate } from './sim/ship.js';
import { createArena, wrapAround } from './sim/arena.js';
import { setupCanvas } from './render/canvas.js';
import { drawBackground, drawShip, drawHud } from './render/draw.js';

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

// 4. Fixed-Timestep Game Loop (Decoupled Physics & Rendering)
const loop = createLoop({
  step: 1 / 60,

  simulate(dt) {
    // Retain previous state for render interpolation
    previousShip = ship;

    // Pure functional physics integration
    const nextShip = integrate(ship, input, dt);

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
