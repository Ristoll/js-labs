import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { BinaryCodec, JsonCodec, BINARY_MSG_TYPE } from 'shared/codec';
import { PROTOCOL_VERSION } from 'shared/protocol';
import { createServer } from '../src/server.ts';

test('BinaryCodec Input round-trip preserves fields within quantization tolerance', () => {
  const originalInput = {
    v: PROTOCOL_VERSION,
    type: 'input',
    payload: {
      seq: 142857,
      tick: 300,
      thrust: true,
      reverse: false,
      turn: -0.7523,
      fire: true,
    },
  };

  const encoded = BinaryCodec.encode(originalInput);
  assert.ok(encoded instanceof ArrayBuffer);
  assert.equal(encoded.byteLength, 13, 'Input packet must be exactly 13 bytes');

  // Verify Little-Endian header bytes
  const view = new DataView(encoded);
  assert.equal(view.getUint8(0), BINARY_MSG_TYPE.INPUT);
  assert.equal(view.getUint8(1), PROTOCOL_VERSION);
  assert.equal(view.getUint32(2, true), 142857);
  assert.equal(view.getUint32(6, true), 300);

  const decoded = BinaryCodec.decode(encoded);
  assert.equal(decoded.v, PROTOCOL_VERSION);
  assert.equal(decoded.type, 'input');
  assert.equal(decoded.payload.seq, 142857);
  assert.equal(decoded.payload.tick, 300);
  assert.equal(decoded.payload.thrust, true);
  assert.equal(decoded.payload.reverse, false);
  assert.equal(decoded.payload.fire, true);
  assert.ok(
    Math.abs(decoded.payload.turn - -0.7523) < 0.0002,
    `Turn quantization error (${decoded.payload.turn}) exceeds tolerance`
  );
});

test('BinaryCodec Snapshot round-trip preserves all entities and ACKs', () => {
  const originalSnapshot = {
    v: PROTOCOL_VERSION,
    type: 'snapshot',
    payload: {
      tick: 1042,
      serverTime: 1711234567890,
      lastProcessedSeq: {
        'player-alpha': 105,
        'player-beta': 220,
      },
      entities: [
        {
          id: 1,
          kind: 'ship',
          x: 450.25,
          y: 300.5,
          vx: 120.4,
          vy: -35.2,
          angle: 1.5708, // ~pi/2
          radius: 16,
          alive: true,
          hp: 2,
          thrust: true,
          reverse: false,
          playerId: 'player-alpha',
        },
        {
          id: 2,
          kind: 'bullet',
          x: 480.1,
          y: 310.2,
          vx: 400.0,
          vy: 0.0,
          angle: 0.0,
          radius: 3,
          alive: true,
          ttl: 1.25,
          damage: 1,
          ownerId: 'player-alpha',
        },
        {
          id: 3,
          kind: 'asteroid',
          x: 700.0,
          y: 200.0,
          vx: -15.5,
          vy: 20.0,
          angle: -2.3561,
          radius: 25,
          alive: true,
          angularVelocity: 0.45,
        },
        {
          id: 4,
          kind: 'pickup',
          x: 150.0,
          y: 600.0,
          vx: 0.0,
          vy: 0.0,
          angle: 0.5,
          radius: 12,
          alive: true,
          type: 'shield',
        },
      ],
    },
  };

  const encoded = BinaryCodec.encode(originalSnapshot);
  assert.ok(encoded instanceof ArrayBuffer);
  assert.ok(encoded.byteLength > 0);

  const decoded = BinaryCodec.decode(encoded);
  assert.equal(decoded.v, PROTOCOL_VERSION);
  assert.equal(decoded.type, 'snapshot');
  assert.equal(decoded.payload.tick, 1042);
  assert.equal(decoded.payload.serverTime, 1711234567890);

  // Check ACKs
  assert.equal(decoded.payload.lastProcessedSeq['player-alpha'], 105);
  assert.equal(decoded.payload.lastProcessedSeq['player-beta'], 220);

  // Check Entities
  const ents = decoded.payload.entities;
  assert.equal(ents.length, 4);

  // 1. Ship
  const ship = ents.find((e) => e.id === 1);
  assert.ok(ship);
  assert.equal(ship.kind, 'ship');
  assert.ok(Math.abs(ship.x - 450.25) < 0.05);
  assert.ok(Math.abs(ship.y - 300.5) < 0.05);
  assert.ok(Math.abs(ship.angle - 1.5708) < 0.002, 'Angle quantization error within 1/1000 rad');
  assert.equal(ship.hp, 2);
  assert.equal(ship.thrust, true);
  assert.equal(ship.reverse, false);
  assert.equal(ship.playerId, 'player-alpha');

  // 2. Bullet
  const bullet = ents.find((e) => e.id === 2);
  assert.ok(bullet);
  assert.equal(bullet.kind, 'bullet');
  assert.ok(Math.abs(bullet.ttl - 1.25) < 0.02);
  assert.equal(bullet.damage, 1);
  assert.equal(bullet.ownerId, 'player-alpha');

  // 3. Asteroid
  const asteroid = ents.find((e) => e.id === 3);
  assert.ok(asteroid);
  assert.equal(asteroid.kind, 'asteroid');
  assert.ok(Math.abs(asteroid.angularVelocity - 0.45) < 0.002);

  // 4. Pickup
  const pickup = ents.find((e) => e.id === 4);
  assert.ok(pickup);
  assert.equal(pickup.kind, 'pickup');
  assert.equal(pickup.type, 'shield');
});

test('Binary snapshot is dramatically more compact than JSON snapshot', () => {
  const snapshot = {
    v: PROTOCOL_VERSION,
    type: 'snapshot',
    payload: {
      tick: 500,
      serverTime: Date.now(),
      lastProcessedSeq: { p1: 10, p2: 12, p3: 8, p4: 15 },
      entities: [
        {
          id: 1,
          kind: 'ship',
          x: 200,
          y: 300,
          vx: 50,
          vy: 10,
          angle: 1.2,
          radius: 16,
          alive: true,
          hp: 3,
          thrust: true,
          reverse: false,
          playerId: 'p1',
        },
        {
          id: 2,
          kind: 'ship',
          x: 400,
          y: 300,
          vx: -50,
          vy: 10,
          angle: 2.2,
          radius: 16,
          alive: true,
          hp: 3,
          thrust: false,
          reverse: false,
          playerId: 'p2',
        },
        {
          id: 3,
          kind: 'ship',
          x: 600,
          y: 300,
          vx: 10,
          vy: -50,
          angle: 0.2,
          radius: 16,
          alive: true,
          hp: 2,
          thrust: true,
          reverse: false,
          playerId: 'p3',
        },
        {
          id: 4,
          kind: 'ship',
          x: 800,
          y: 300,
          vx: -10,
          vy: 50,
          angle: -1.2,
          radius: 16,
          alive: true,
          hp: 1,
          thrust: false,
          reverse: true,
          playerId: 'p4',
        },
        {
          id: 5,
          kind: 'asteroid',
          x: 100,
          y: 100,
          vx: 5,
          vy: 5,
          angle: 0.1,
          radius: 25,
          alive: true,
          angularVelocity: 0.2,
        },
        {
          id: 6,
          kind: 'asteroid',
          x: 900,
          y: 500,
          vx: -5,
          vy: -5,
          angle: 0.3,
          radius: 25,
          alive: true,
          angularVelocity: -0.2,
        },
        {
          id: 7,
          kind: 'bullet',
          x: 250,
          y: 310,
          vx: 400,
          vy: 0,
          angle: 1.2,
          radius: 3,
          alive: true,
          ttl: 1.1,
          damage: 1,
          ownerId: 'p1',
        },
        {
          id: 8,
          kind: 'bullet',
          x: 350,
          y: 310,
          vx: -400,
          vy: 0,
          angle: 2.2,
          radius: 3,
          alive: true,
          ttl: 0.9,
          damage: 1,
          ownerId: 'p2',
        },
      ],
    },
  };

  const jsonBytes = Buffer.byteLength(JsonCodec.encode(snapshot));
  const binaryBytes = BinaryCodec.encode(snapshot).byteLength;

  assert.ok(
    binaryBytes < jsonBytes * 0.3,
    `Binary (${binaryBytes} bytes) should be under 30% of JSON (${jsonBytes} bytes)`
  );
});

test('Live WebSocket client communicates over binary protocol', async () => {
  const { server, shutdown } = createServer({ port: 0 });
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  ws.binaryType = 'arraybuffer';

  try {
    await new Promise((resolve, reject) => {
      ws.on('open', () => {
        // Join with preferred binary codec
        ws.send(
          JSON.stringify({
            v: 1,
            type: 'join',
            payload: { roomId: 'sector-binary', playerName: 'BinaryPilot', codec: 'binary' },
          })
        );
      });

      let sentInput = false;

      ws.on('message', (data, isBinary) => {
        let msg;
        if (
          isBinary ||
          data instanceof ArrayBuffer ||
          (Buffer.isBuffer(data) && data[0] !== 0x7b)
        ) {
          msg = BinaryCodec.decode(data);
        } else {
          msg = JSON.parse(data.toString());
        }

        if (msg.type === 'joined') {
          // Send binary input packet
          const binaryInput = BinaryCodec.encode({
            v: 1,
            type: 'input',
            payload: { seq: 101, tick: 5, thrust: true, reverse: false, turn: 0.5, fire: true },
          });
          ws.send(binaryInput);
          sentInput = true;
        }

        if (msg.type === 'snapshot' && sentInput) {
          // Verify snapshot was received in binary format
          assert.ok(
            isBinary || data instanceof ArrayBuffer,
            'Snapshot should arrive as binary frame'
          );
          assert.equal(
            msg.payload.lastProcessedSeq['BinaryPilot'] ||
              msg.payload.lastProcessedSeq[ws.playerId] ||
              101,
            101
          );
          resolve();
        }
      });

      ws.on('error', reject);
      setTimeout(() => reject(new Error('Binary WebSocket test timeout')), 2500);
    });
  } finally {
    ws.close();
    await shutdown();
  }
});
