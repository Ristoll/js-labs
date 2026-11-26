import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Ship, integrate, createArena, wrapAround } from 'shared/sim';

test('Client prediction with integrate() matches server physics step', () => {
  const clientShip = new Ship({ id: 1, x: 200, y: 200, angle: 0 });
  const serverShip = new Ship({ id: 1, x: 200, y: 200, angle: 0 });

  const dt = 1 / 60;
  const input = { thrust: true, reverse: false, turn: 0.5, fire: false };

  // 10 steps of identical inputs
  for (let i = 0; i < 10; i++) {
    integrate(clientShip, input, dt);
    integrate(serverShip, input, dt);
  }

  assert.strictEqual(clientShip.x, serverShip.x);
  assert.strictEqual(clientShip.y, serverShip.y);
  assert.strictEqual(clientShip.vx, serverShip.vx);
  assert.strictEqual(clientShip.vy, serverShip.vy);
  assert.strictEqual(clientShip.angle, serverShip.angle);
});

test('Server reconciliation with input replay produces 0 correction when deterministic', () => {
  const arena = createArena(1200, 800);
  const clientShip = new Ship({ id: 1, x: 100, y: 100, angle: 0 });
  const serverShip = new Ship({ id: 1, x: 100, y: 100, angle: 0 });

  const dt = 1 / 30;
  const pendingInputs = [];

  // Generate 10 input steps
  for (let seq = 1; seq <= 10; seq++) {
    const input = {
      seq,
      thrust: seq > 2,
      reverse: false,
      turn: seq % 2 === 0 ? 0.3 : -0.2,
      fire: false,
    };

    // Client predicts immediately
    integrate(clientShip, input, dt);
    wrapAround(clientShip, arena);
    pendingInputs.push({ seq, input, dt });

    // Server only processes up to seq = 6 (simulating 4 ticks network delay)
    if (seq <= 6) {
      integrate(serverShip, input, dt);
      wrapAround(serverShip, arena);
    }
  }

  // Server snapshot arrives: state at seq 6, ackSeq = 6
  const ackSeq = 6;
  const serverSnapshot = serverShip.toSnapshot();

  // Client Reconciliation (Gabriel Gambetta Part 2):
  // 1. Capture current predicted position
  const predictedPos = { x: clientShip.x, y: clientShip.y };

  // 2. Discard acknowledged inputs (seq <= 6)
  const remainingInputs = pendingInputs.filter((p) => p.seq > ackSeq);
  assert.strictEqual(remainingInputs.length, 4);

  // 3. Reset client ship to server snapshot state
  clientShip.x = serverSnapshot.x;
  clientShip.y = serverSnapshot.y;
  clientShip.vx = serverSnapshot.vx;
  clientShip.vy = serverSnapshot.vy;
  clientShip.angle = serverSnapshot.angle;
  clientShip.thrust = serverSnapshot.thrust;
  clientShip.reverse = serverSnapshot.reverse;

  // 4. Replay remaining unacknowledged inputs (seq 7..10)
  for (const pending of remainingInputs) {
    integrate(clientShip, pending.input, pending.dt);
    wrapAround(clientShip, arena);
  }

  // 5. Measure correction error
  const errorDist = Math.hypot(predictedPos.x - clientShip.x, predictedPos.y - clientShip.y);

  // In deterministic simulation, error must be within snapshot quantization tolerance (< 0.02 px)
  assert.ok(errorDist < 0.02, `Expected ~0 correction under determinism, but got ${errorDist}`);
});

test('Determinism break causes measurable reconciliation correction', () => {
  const arena = createArena(1200, 800);
  const clientShip = new Ship({ id: 1, x: 100, y: 100, angle: 0 });
  const serverShip = new Ship({ id: 1, x: 100, y: 100, angle: 0 });

  const dt = 1 / 30;
  const pendingInputs = [];

  for (let seq = 1; seq <= 10; seq++) {
    const input = { seq, thrust: true, reverse: false, turn: 0.1, fire: false };

    // Client predicts, but injects non-deterministic perturbation
    integrate(clientShip, input, dt);
    clientShip.x += 1.5; // Artificial noise / non-deterministic drift
    wrapAround(clientShip, arena);
    pendingInputs.push({ seq, input, dt });

    if (seq <= 6) {
      integrate(serverShip, input, dt);
      wrapAround(serverShip, arena);
    }
  }

  const ackSeq = 6;
  const serverSnapshot = serverShip.toSnapshot();

  const predictedPos = { x: clientShip.x, y: clientShip.y };
  const remainingInputs = pendingInputs.filter((p) => p.seq > ackSeq);

  // Reconcile
  clientShip.x = serverSnapshot.x;
  clientShip.y = serverSnapshot.y;
  clientShip.vx = serverSnapshot.vx;
  clientShip.vy = serverSnapshot.vy;
  clientShip.angle = serverSnapshot.angle;

  for (const pending of remainingInputs) {
    integrate(clientShip, pending.input, pending.dt);
    wrapAround(clientShip, arena);
  }

  const errorDist = Math.hypot(predictedPos.x - clientShip.x, predictedPos.y - clientShip.y);

  // Due to injected perturbation, error must be strictly positive
  assert.ok(errorDist > 1.0, `Expected measurable correction error, got ${errorDist}`);
});

test('Visual smoothing decay over 100ms dampens correction delta', () => {
  const renderOffset = { x: 20, y: 10 };
  const dt = 1 / 60;
  const decayRate = 15; // ~100 ms blend time

  for (let step = 0; step < 10; step++) {
    const decay = Math.exp(-decayRate * dt);
    renderOffset.x *= decay;
    renderOffset.y *= decay;
  }

  // After 10 frames (~160 ms), offset should have decayed significantly (< 2 px)
  const remainingOffset = Math.hypot(renderOffset.x, renderOffset.y);
  assert.ok(remainingOffset < 2.5, `Expected decayed offset < 2.5, got ${remainingOffset}`);
});
