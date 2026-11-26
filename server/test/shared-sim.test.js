import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

test('shared package imports cleanly in Node without DOM', async () => {
  assert.strictEqual(typeof globalThis.window, 'undefined');
  assert.strictEqual(typeof globalThis.document, 'undefined');

  const shared = await import('shared');
  assert.ok(shared);
  assert.strictEqual(typeof shared.createMulberry32, 'function');
  assert.ok(shared.sim);
  assert.strictEqual(typeof shared.sim.Ship, 'function');
  assert.strictEqual(typeof shared.sim.World, 'function');
  assert.strictEqual(typeof shared.sim.integrate, 'function');
});

test('seeded mulberry32 PRNG is strictly deterministic', async () => {
  const { createMulberry32 } = await import('shared/prng');
  const prngA = createMulberry32(42);
  const prngB = createMulberry32(42);

  const seqA = Array.from({ length: 100 }, () => prngA());
  const seqB = Array.from({ length: 100 }, () => prngB());

  assert.deepStrictEqual(seqA, seqB);

  const prngC = createMulberry32(999);
  const seqC = Array.from({ length: 100 }, () => prngC());
  assert.notDeepStrictEqual(seqA, seqC);
});

test('simulation determinism: 1,000 steps produce identical hash', async () => {
  const { Ship, integrate } = await import('shared/sim');

  function runSim(_seed) {
    const ship = new Ship({
      id: 1,
      x: 100,
      y: 100,
      vx: 0,
      vy: 0,
      angle: 0,
    });

    const dt = 1 / 30;
    for (let step = 0; step < 1000; step++) {
      // Deterministic scripted inputs
      const input = {
        thrust: step % 3 !== 0,
        reverse: step % 7 === 0,
        turn: step % 2 === 0 ? 0.5 : -0.5,
      };
      integrate(ship, input, dt);
    }

    const state = JSON.stringify(ship.toSnapshot());
    const hash = crypto.createHash('sha256').update(state).digest('hex');
    return { state, hash };
  }

  const run1 = runSim(12345);
  const run2 = runSim(12345);

  assert.strictEqual(run1.state, run2.state);
  assert.strictEqual(run1.hash, run2.hash);
});

test('determinism breaks if random perturbation is introduced', async () => {
  const { Ship, integrate } = await import('shared/sim');

  function runSimWithNoise() {
    const ship = new Ship({ x: 100, y: 100, vx: 0, vy: 0, angle: 0 });
    const dt = 1 / 30;
    for (let step = 0; step < 1000; step++) {
      const input = {
        thrust: true,
        turn: 0.1 + (Math.random() - 0.5) * 0.01,
      };
      integrate(ship, input, dt);
    }
    const state = JSON.stringify(ship.toSnapshot());
    return crypto.createHash('sha256').update(state).digest('hex');
  }

  const hash1 = runSimWithNoise();
  const hash2 = runSimWithNoise();
  assert.notStrictEqual(hash1, hash2, 'Non-deterministic inputs must diverge');
});

test('protocol and codec round-trip validation', async () => {
  const { validateMessage, PROTOCOL_VERSION } = await import('shared/protocol');
  const { JsonCodec } = await import('shared/codec');

  const inputMsg = {
    v: PROTOCOL_VERSION,
    type: 'input',
    payload: {
      seq: 101,
      tick: 200,
      thrust: true,
      reverse: false,
      turn: 0.8,
      fire: false,
    },
  };

  const validation = validateMessage(inputMsg);
  assert.ok(validation.valid);

  const encoded = JsonCodec.encode(inputMsg);
  const decoded = JsonCodec.decode(encoded);
  assert.deepStrictEqual(decoded, inputMsg);
});
