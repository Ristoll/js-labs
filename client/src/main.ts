import { createLoop } from './loop.ts';
import { createInput } from './input.ts';
import { Ship, integrate } from './sim/ship.ts';
import { Asteroid } from './sim/asteroid.ts';
import { Explosion } from './sim/explosion.ts';
import { Pickup } from './sim/pickup.ts';
import { World } from './sim/world.ts';
import { createArena, wrapAround } from './sim/arena.ts';
import { SnapshotBuffer } from './sim/interpolation.ts';
import { findCollisions, resolveCollisions } from './sim/collision.ts';
import { Vector2 } from './sim/vector.ts';
import { setupCanvas } from './render/canvas.ts';
import { drawBackground, drawWorld, drawHud } from './render/draw.ts';
import { loadAll } from './assets/loader.ts';
import { drawLoadingScreen } from './render/loading.ts';
import { setupAudio, getSharedAudioContext } from './audio.ts';
import { Lobby } from './lobby/lobby.ts';
import { setupLobbyUI } from './lobby/lobby-ui.ts';
import { GameSocket } from './net/socket.ts';
import { NetgraphUI } from './net/netgraph.ts';
import {
  toggleExperiment1,
  toggleExperiment2,
  toggleExperiment3,
  runExperiment3Measurement,
  setupM1ExperimentUI,
} from './experiments.ts';

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
ship.renderOffset = { x: 0, y: 0 };
world.spawn(ship);
populateAsteroids(5);
world.spawn(Pickup.createRandom(arena));

let previousWorld = world.clone();

// Multiplayer network state (Lab 05)
let isMultiplayer = false;
let myPlayerId = null;
let inputSeq = 1;
let pendingInputs = [];
let netgraph = null;
let breakDeterminismActive = false;
const snapshotBuffer = new SnapshotBuffer(66.67);

window.breakDeterminism = (active) => {
  breakDeterminismActive = typeof active === 'boolean' ? active : !breakDeterminismActive;
  console.log(`[Netcode] Determinism break active: ${breakDeterminismActive}`);
  return breakDeterminismActive;
};

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
    if (isMultiplayer && ship) {
      // Retain previous state of the entire world for render interpolation
      previousWorld = world.clone();

      // Sample current player input
      let turn = 0;
      if (input.isDown('ArrowLeft') || input.isDown('KeyA')) {
        turn -= 1;
      }
      if (input.isDown('ArrowRight') || input.isDown('KeyD')) {
        turn += 1;
      }
      const thrust = Boolean(
        input.isDown('ArrowUp') || input.isDown('KeyW') || input.isDown('Space')
      );
      const reverse = Boolean(input.isDown('ArrowDown') || input.isDown('KeyS'));
      const fire = Boolean(input.isDown('Space') || input.isDown('KeyF'));

      const inputPacket = {
        seq: inputSeq++,
        tick: multiplayerSocket?.lastServerTick || 0,
        thrust,
        reverse,
        turn,
        fire,
      };

      if (multiplayerSocket && multiplayerSocket.isConnected) {
        multiplayerSocket.sendInput(inputPacket);
      }

      // Buffer unacknowledged input for reconciliation replay
      pendingInputs.push({ seq: inputPacket.seq, input: inputPacket, dt });
      netgraph?.setPendingInputs(pendingInputs.length);

      // --- M2: Client-Side Prediction ---
      // Apply input to own ship immediately with shared integrate()
      integrate(ship, inputPacket, dt);

      // Determinism-break experiment: inject non-deterministic drift if active
      if (breakDeterminismActive) {
        ship.x += (Math.random() - 0.5) * 8;
        ship.y += (Math.random() - 0.5) * 8;
      }

      wrapAround(ship, arena);

      // Local bullet prediction (fire immediately)
      if (inputPacket.fire) {
        ship.fire(world, false);
      }

      // Smooth decay of visual offset over ~100 ms
      if (ship.renderOffset) {
        const decay = Math.exp(-15 * dt);
        ship.renderOffset.x *= decay;
        ship.renderOffset.y *= decay;
        if (Math.hypot(ship.renderOffset.x, ship.renderOffset.y) < 0.05) {
          ship.renderOffset.x = 0;
          ship.renderOffset.y = 0;
        }
      }

      // --- M3: Remote Entity Interpolation ---
      const interp = snapshotBuffer.interpolate(performance.now(), arena);
      netgraph?.setInterpStatus(interp.status, snapshotBuffer.interpolationDelay);

      if (interp.entities && interp.entities.length > 0) {
        for (const rent of interp.entities) {
          // Skip local predicted ship
          if (ship && (rent.playerId === myPlayerId || rent.id === ship.id)) {
            continue;
          }

          // Local bullet reconciliation: if a server bullet matches our predicted bullet, replace it
          if (rent.kind === 'bullet' && rent.ownerId === myPlayerId) {
            for (const b of world.ofKind('bullet')) {
              if (b.ownerId === myPlayerId && b.id !== rent.id) {
                world.despawn(b.id);
                break;
              }
            }
          }

          const existing = world.get(rent.id);
          if (existing) {
            existing.x = rent.x;
            existing.y = rent.y;
            existing.vx = rent.vx;
            existing.vy = rent.vy;
            existing.angle = rent.angle;
            existing.alive = rent.alive;
            if (existing.kind === 'ship') {
              existing.thrust = rent.thrust;
              existing.reverse = rent.reverse;
              if (typeof rent.hp === 'number') existing.heal(rent.hp - existing.hp);
            }
          } else {
            const spawned = World.fromSnapshot([rent]).get(rent.id);
            if (spawned) {
              world.spawn(spawned);
            }
          }
        }

        // Handle entities disappearing / destroyed between snapshots
        const interpIds = new Set(interp.entities.map((e) => e.id));
        for (const ent of world) {
          if (ship && ent.id === ship.id) continue;
          if (ent.kind === 'bullet' && ent.ownerId === myPlayerId && ent.ttl > 0) continue;
          if (!interpIds.has(ent.id)) {
            world.despawn(ent.id);
          }
        }
        world.sweep();
      }

      return;
    }

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
    drawWorld(ctx, world, previousWorld, alpha, arena, gameAssets?.sprites);

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

// 5. Asynchronous Asset Loading & Loading Screen (Milestone 1)
export let gameAssets = null;

async function initGame() {
  drawLoadingScreen(ctx, arena.width, arena.height, {
    progress: 0,
    statusText: 'Connecting to asset server...',
  });

  try {
    gameAssets = await loadAll('/assets/manifest.json', {
      onProgress: (progress, info) => {
        drawLoadingScreen(ctx, arena.width, arena.height, {
          progress,
          statusText: `Loaded ${info.key} (${info.done}/${info.total})`,
        });
      },
    });

    drawLoadingScreen(ctx, arena.width, arena.height, {
      progress: 1.0,
      statusText: 'All assets loaded! Starting simulation...',
    });

    // Wire audio module to simulation events (after assets are decoded)
    setupAudio(gameAssets);

    // M3/M4 — Show lobby; start game only after player joins.
    const joinData = await showLobbyAndWaitForJoin();

    // Connect WebSocket & Join Room
    initMultiplayer(joinData);

    // Start simulation loop once assets are ready and player has joined
    loop.start();
  } catch (err) {
    console.error('Failed to load assets:', err);
    drawLoadingScreen(ctx, arena.width, arena.height, {
      progress: 0,
      error: err,
      statusText: 'Asset loading failed.',
    });

    // Interactive retry listener
    const retryHandler = () => {
      window.removeEventListener('keydown', keyHandler);
      canvasElement.removeEventListener('click', retryHandler);
      initGame();
    };
    const keyHandler = (e) => {
      if (e.code === 'Space' || e.code === 'KeyR') {
        retryHandler();
      }
    };
    window.addEventListener('keydown', keyHandler, { once: true });
    canvasElement.addEventListener('click', retryHandler, { once: true });
  }
}

/**
 * Shows the lobby screen and returns a Promise that resolves when the player
 * clicks "Join" on a room. Stops the Lobby's periodic refresh (abort-on-leave)
 * the moment the player commits.
 *
 * @returns {Promise<{ room: Object, playerName: string }>}
 */
function showLobbyAndWaitForJoin() {
  const lobby = new Lobby();
  const lobbyUI = setupLobbyUI(lobby);

  lobbyUI.show();
  lobby.start(); // begins periodic refresh with AbortSignal.timeout per request

  return new Promise((resolve) => {
    lobby.addEventListener('joined', (e) => {
      // lobby.join() already called lobby.stop() — no orphaned requests
      lobbyUI.hide();
      resolve(e.detail);
    });
  });
}

let multiplayerSocket = null;

function initMultiplayer({ room, playerName }) {
  const hud = document.getElementById('multiplayer-hud');
  const rosterList = document.getElementById('roster-list');
  const chatMessages = document.getElementById('chat-messages');
  const chatForm = document.getElementById('chat-form');
  const chatInput = document.getElementById('chat-input');

  if (hud) hud.classList.remove('hidden');

  const socket = new GameSocket();
  multiplayerSocket = socket;
  socket.connect();

  netgraph = new NetgraphUI(socket);
  netgraph.onInterpDelayChange = (delay) => {
    snapshotBuffer.setDelay(delay);
  };
  netgraph.show();

  socket.addEventListener('open', () => {
    socket.joinRoom(room.id, playerName);
  });

  socket.addEventListener('joined', (e) => {
    myPlayerId = e.detail.playerId;
    if (ship) {
      ship.playerId = myPlayerId;
    }
    isMultiplayer = true;
  });

  socket.addEventListener('snapshot', (e) => {
    const { lastProcessedSeq, entities } = e.detail;

    // Push into M3 snapshot interpolation buffer
    snapshotBuffer.push(e.detail, performance.now());

    // 1. Acknowledge processed input sequences
    if (lastProcessedSeq && myPlayerId && typeof lastProcessedSeq[myPlayerId] === 'number') {
      const ack = lastProcessedSeq[myPlayerId];
      pendingInputs = pendingInputs.filter((p) => p.seq > ack);
      netgraph?.setPendingInputs(pendingInputs.length);
    }

    // 2. Locate our authoritative ship state in snapshot
    const serverShipSnap = entities.find(
      (ent) => ent.kind === 'ship' && (ent.playerId === myPlayerId || (ship && ent.id === ship.id))
    );

    if (serverShipSnap && ship) {
      // Capture current predicted position before server correction
      const predictedX = ship.x;
      const predictedY = ship.y;

      // Reset local ship physics to the server's authoritative state
      ship.x = serverShipSnap.x;
      ship.y = serverShipSnap.y;
      ship.vx = serverShipSnap.vx;
      ship.vy = serverShipSnap.vy;
      ship.angle = serverShipSnap.angle;
      ship.thrust = serverShipSnap.thrust;
      ship.reverse = serverShipSnap.reverse;
      ship.alive = serverShipSnap.alive;

      // Re-apply (replay) all remaining unacknowledged inputs in chronological order
      for (const pending of pendingInputs) {
        integrate(ship, pending.input, pending.dt);
        wrapAround(ship, arena);
      }

      // Measure reconciliation correction error
      const errorX = predictedX - ship.x;
      const errorY = predictedY - ship.y;
      const errorDist = Math.hypot(errorX, errorY);
      netgraph?.setCorrection(errorDist);

      // Smooth correction over ~100 ms to eliminate visual popping
      if (!ship.renderOffset) {
        ship.renderOffset = { x: 0, y: 0 };
      }

      if (errorDist > 0.05 && errorDist < 120) {
        ship.renderOffset.x += errorX;
        ship.renderOffset.y += errorY;
      } else if (errorDist >= 120) {
        // Large deviation (teleport/respawn) -> snap immediately
        ship.renderOffset.x = 0;
        ship.renderOffset.y = 0;
      }
    }
  });

  socket.addEventListener('roster', (e) => {
    const { players } = e.detail;
    if (rosterList) {
      rosterList.innerHTML = players
        .map((p) => `<li class="roster-item">${p.name || 'Pilot'}</li>`)
        .join('');
    }
  });

  socket.addEventListener('chat', (e) => {
    const { senderName, text } = e.detail;
    if (chatMessages) {
      const msgEl = document.createElement('div');
      msgEl.className = 'chat-msg';
      msgEl.innerHTML = `<span class="chat-author">${senderName}:</span><span>${text}</span>`;
      chatMessages.appendChild(msgEl);
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
  });

  if (chatForm && chatInput) {
    chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = chatInput.value.trim();
      if (text) {
        socket.sendChat(text);
        chatInput.value = '';
      }
    });
  }
}

initGame();

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

// Lab 03 — Milestone 1 Experiment Panel
setupM1ExperimentUI();
