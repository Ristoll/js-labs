import { createLoop } from './loop.js';
import { createInput } from './input.js';
import { Ship } from './sim/ship.js';
import { Asteroid } from './sim/asteroid.js';
import { Explosion } from './sim/explosion.js';
import { Pickup } from './sim/pickup.js';
import { World } from './sim/world.js';
import { createArena } from './sim/arena.js';
import { findCollisions, resolveCollisions } from './sim/collision.js';
import { Vector2 } from './sim/vector.js';
import { setupCanvas } from './render/canvas.js';
import { drawBackground, drawWorld, drawHud } from './render/draw.js';
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

// 3. Initialize World and Combat State
const world = new World();
let score = 0;
let respawnTimer = 0;

function populateAsteroids(count = 5) {
  for (let i = 0; i < count; i++) {
    world.spawn(Asteroid.createRandom(arena, ship?.pos));
  }
}

function findSafeSpawnPos(targetArena, targetWorld, minDistance = 160) {
  for (let attempt = 0; attempt < 25; attempt++) {
    const x = 100 + Math.random() * (targetArena.width - 200);
    const y = 100 + Math.random() * (targetArena.height - 200);
    let isSafe = true;

    for (const asteroid of targetWorld.ofKind('asteroid')) {
      if (Math.hypot(asteroid.x - x, asteroid.y - y) < minDistance) {
        isSafe = false;
        break;
      }
    }

    if (isSafe) {
      return new Vector2(x, y);
    }
  }

  return new Vector2(targetArena.width / 2, targetArena.height / 2);
}

let ship = new Ship({
  x: arena.width / 2,
  y: arena.height / 2,
  vx: 0,
  vy: 0,
  angle: -Math.PI / 2, // Start facing upwards
  thrust: false,
});
world.spawn(ship);
populateAsteroids(5);
world.spawn(Pickup.createRandom(arena));

let previousWorld = world.clone();

// --- DEMONSTRATION OF THE `this` BUG (Section 2) ---
// Naive bug:
//   canvasElement.addEventListener('pointerdown', ship.fire);
// When invoked by the DOM event system, `this` evaluates to the event target (canvasElement),
// causing `this.pos` inside fire() to fail with:
//   TypeError: Cannot read properties of undefined (reading 'pos')
//
// Solution 1 (Lexical arrow wrapper - chosen):
canvasElement.addEventListener('pointerdown', () => {
  if (ship.alive) {
    ship.fire(world);
  }
});
// Alternative Solution 2: canvasElement.addEventListener('pointerdown', ship.fire.bind(ship, world));
// Alternative Solution 3: defining `fire = (world) => { ... }` as an instance arrow field on Ship.

// Experiment 3 Live Measurement Flight Controls
let testThrustActive = false;
let testUnwrappedX = 0;
let testPhysicsSteps = 0;
let testSimTime = 0;
let testTargetSteps = Infinity;
let testTargetSimTime = Infinity;

const testControls = {
  startTest({ targetSteps = Infinity, targetSimTime = Infinity } = {}) {
    // Isolate ship for pure 1D trajectory benchmarking
    world.clear();
    score = 0;
    respawnTimer = 0;

    // Reset to pristine identical starting state
    ship = new Ship({
      x: 80,
      y: arena.height / 2,
      vx: 0,
      vy: 0,
      angle: 0, // Pointing strictly +X for clean 1D trajectory measurement
      thrust: true,
      reverse: false,
    });
    world.spawn(ship);
    previousWorld = world.clone();

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
      ship.thrust = false;
    }
    // Re-populate asteroids and pickup for normal sandbox play
    if ([...world.ofKind('asteroid')].length === 0) {
      populateAsteroids(5);
    }
    if ([...world.ofKind('pickup')].length === 0) {
      world.spawn(Pickup.createRandom(arena));
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
    // Retain previous state of the entire world for render interpolation
    previousWorld = world.clone();

    // Handle 2-second ship respawn countdown when destroyed
    if (!ship.alive && respawnTimer > 0) {
      respawnTimer -= dt;
      if (respawnTimer <= 0) {
        const safePos = findSafeSpawnPos(arena, world, 160);
        ship.reset(safePos.x, safePos.y);
        world.spawn(ship);
      }
    }

    const shouldTestThrust =
      testThrustActive && testPhysicsSteps < testTargetSteps && testSimTime < testTargetSimTime;

    // During automated live testing, inject dedicated forward thrust
    const activeInput = shouldTestThrust
      ? { isDown: (code) => code === 'ArrowUp' || code === 'KeyW' }
      : input;

    // Firing logic:
    // - Space or KeyF fires standard high-velocity blaster
    // - KeyE fires homing missile (composition-based HomingComponent)
    if (ship.alive && !shouldTestThrust) {
      if (activeInput.isDown('KeyE')) {
        ship.fire(world, true);
      } else if (activeInput.isDown('Space') || activeInput.isDown('KeyF')) {
        ship.fire(world, false);
      }
    }

    // Advance simulation of all entities (ship, bullets, asteroids, explosions) & wrap boundaries
    world.step(dt, activeInput, arena);

    // Collision detection and resolution (swappable modular system)
    if (!shouldTestThrust) {
      const collisions = findCollisions(world);
      resolveCollisions(world, collisions, (event) => {
        if (event.type === 'asteroid-destroyed') {
          score += event.score;
          world.spawn(
            new Explosion({
              x: event.asteroid.x,
              y: event.asteroid.y,
              count: 22,
              maxSpeed: 190,
            })
          );
          // Spawn replacement asteroid to maintain challenge
          world.spawn(Asteroid.createRandom(arena, ship.alive ? ship.pos : null));

          // 35% chance to drop bonus pickup
          if (Math.random() < 0.35) {
            world.spawn(Pickup.createRandom(arena, event.asteroid.x, event.asteroid.y));
          }
        } else if (event.type === 'ship-hit') {
          world.spawn(
            new Explosion({
              x: event.asteroid.x,
              y: event.asteroid.y,
              count: 20,
              maxSpeed: 170,
            })
          );
          world.spawn(
            new Explosion({
              x: event.ship.x,
              y: event.ship.y,
              count: 14,
              maxSpeed: 120,
              ttl: 0.35,
            })
          );

          if (event.destroyed) {
            respawnTimer = 2.0;
            world.spawn(
              new Explosion({
                x: event.ship.x,
                y: event.ship.y,
                count: 36,
                maxSpeed: 240,
                ttl: 0.8,
              })
            );
            world.despawn(ship.id);
          }
        } else if (event.type === 'pickup-collected') {
          score += event.score;
          world.spawn(
            new Explosion({
              x: event.pickup.x,
              y: event.pickup.y,
              count: 16,
              maxSpeed: 140,
              ttl: 0.5,
            })
          );
        }
      });
    }

    if (shouldTestThrust) {
      testUnwrappedX += ship.vx * dt;
      testPhysicsSteps++;
      testSimTime += dt;
    }
  },

  render(alpha, stats) {
    // 1. Background grid, nebulae, and starfield
    drawBackground(ctx, arena.width, arena.height, performance.now());

    // 2. Interpolated world entities (player ship, laser bullets, asteroids, explosions)
    drawWorld(ctx, world, previousWorld, alpha, arena);

    // 3. Performance & Combat telemetry HUD (score, HP, steps/s, frames/s, frame ms)
    drawHud(ctx, {
      ...stats,
      score,
      hp: ship.hp,
      respawnTimer,
      shipAlive: ship.alive,
      rapidFireTimer: ship.rapidFireTimer,
    });
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
