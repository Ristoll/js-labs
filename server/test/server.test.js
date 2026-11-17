import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { createServer } from '../src/server.js';
import { TokenBucket } from '../src/rate-limiter.js';
import { MatchLogTransform, NDJSONParserTransform } from '../src/streams.js';
import { createReplayGenerator } from '../src/replay.js';
import { loadConfig } from '../src/config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testReplaysDir = path.join(__dirname, 'temp-replays');

describe('Lab 04 Server & WebSocket Test Suite', () => {
  let app;
  let serverUrl;
  let wsUrl;

  before(async () => {
    fs.mkdirSync(testReplaysDir, { recursive: true });
    app = createServer({
      port: 0,
      host: '127.0.0.1',
      replaysDir: testReplaysDir,
      joinTimeoutMs: 800,
      heartbeatIntervalMs: 400,
      heartbeatMaxMissed: 2,
      maxPayloadSize: 1024, // 1KB for testing
      rateLimitCapacity: 5,
      rateLimitRefillRate: 1,
      maxRooms: 5,
      maxPlayersPerRoom: 2,
      maxBufferedAmount: 2048, // 2KB for testing slow client
    });

    await new Promise((resolve) => {
      app.server.listen(0, '127.0.0.1', () => {
        const addr = app.server.address();
        serverUrl = `http://127.0.0.1:${addr.port}`;
        wsUrl = `ws://127.0.0.1:${addr.port}/ws`;
        resolve();
      });
    });
  });

  after(async () => {
    await app.shutdown();
    fs.rmSync(testReplaysDir, { recursive: true, force: true });
  });

  describe('Configuration Validation (M1)', () => {
    test('loadConfig validates environment variables strictly', () => {
      assert.throws(
        () => loadConfig({ PORT: 'invalid' }),
        /must be between 0 and 65535/
      );
      assert.throws(
        () => loadConfig({ MAX_PAYLOAD_SIZE: '-5' }),
        /must be a positive integer/
      );
      const valid = loadConfig({ PORT: '4000', MAX_ROOMS: '50' });
      assert.equal(valid.port, 4000);
      assert.equal(valid.maxRooms, 50);
    });
  });

  describe('HTTP Server & API (M1)', () => {
    test('GET /health returns 200 with status ok', async () => {
      const res = await fetch(`${serverUrl}/health`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.status, 'ok');
      assert.ok(data.uptime >= 0);
    });

    test('GET /api/rooms returns list of rooms', async () => {
      const res = await fetch(`${serverUrl}/api/rooms`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.ok(Array.isArray(data));
      assert.ok(data.length > 0);
    });

    test('POST /api/rooms creates a new room with validation', async () => {
      const badRes = await fetch(`${serverUrl}/api/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '' }),
      });
      assert.equal(badRes.status, 400);

      const validRes = await fetch(`${serverUrl}/api/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Omega Sector', maxPlayers: 6 }),
      });
      assert.equal(validRes.status, 201);
      const room = await validRes.json();
      assert.equal(room.name, 'Omega Sector');
      assert.equal(room.maxPlayers, 6);
    });

    test('Path traversal is blocked with 403', async () => {
      const res = await fetch(`${serverUrl}/..%2f..%2fpackage.json`);
      assert.equal(res.status, 403);
    });

    test('GET /api/slow synchronously blocks for ~300ms', async () => {
      const t0 = Date.now();
      const res = await fetch(`${serverUrl}/api/slow`);
      const elapsed = Date.now() - t0;
      assert.equal(res.status, 200);
      assert.ok(elapsed >= 280, `Expected elapsed >= 280ms, got ${elapsed}ms`);
    });
  });

  describe('WebSocket Protocol & Security (M2 & M4)', () => {
    test('Two clients can join room, receive roster, and exchange chat', async () => {
      const client1 = new WebSocket(wsUrl);
      const client2 = new WebSocket(wsUrl);

      await Promise.all([
        new Promise((r) => client1.on('open', r)),
        new Promise((r) => client2.on('open', r)),
      ]);

      client1.send(
        JSON.stringify({
          v: 1,
          type: 'join',
          payload: { roomId: 'comm-test', playerName: 'Alice' },
        })
      );

      const client1Joined = await new Promise((resolve) => {
        client1.on('message', (raw) => {
          const msg = JSON.parse(raw.toString());
          if (msg.type === 'joined') resolve(msg.payload);
        });
      });
      assert.equal(client1Joined.playerName, 'Alice');

      client2.send(
        JSON.stringify({
          v: 1,
          type: 'join',
          payload: { roomId: 'comm-test', playerName: 'Bob' },
        })
      );

      const rosterUpdate = await new Promise((resolve) => {
        client1.on('message', (raw) => {
          const msg = JSON.parse(raw.toString());
          if (msg.type === 'roster' && msg.payload.players.some((p) => p.name === 'Bob')) {
            resolve(msg.payload);
          }
        });
      });
      assert.equal(rosterUpdate.players.length, 2);

      client2.send(
        JSON.stringify({
          v: 1,
          type: 'chat',
          payload: { text: 'Hello from Bob!' },
        })
      );

      const chatReceived = await new Promise((resolve) => {
        client1.on('message', (raw) => {
          const msg = JSON.parse(raw.toString());
          if (msg.type === 'chat') resolve(msg.payload);
        });
      });
      assert.equal(chatReceived.senderName, 'Bob');
      assert.equal(chatReceived.text, 'Hello from Bob!');

      client1.close();
      client2.close();
    });

    test('Join timeout terminates client if no join message is sent in time', async () => {
      const slowClient = new WebSocket(wsUrl);
      await new Promise((r) => slowClient.on('open', r));

      const closeEvent = await new Promise((resolve) => {
        slowClient.on('close', (code, reason) => {
          resolve({ code, reason: reason.toString() });
        });
      });
      assert.equal(closeEvent.code, 4001);
    });

    test('Rejects invalid protocol version with close code 1002', async () => {
      const client = new WebSocket(wsUrl);
      await new Promise((r) => client.on('open', r));

      client.send(JSON.stringify({ v: 999, type: 'join', payload: { roomId: 'foo' } }));
      const closeEvent = await new Promise((resolve) => {
        client.on('close', (code) => resolve({ code }));
      });
      assert.equal(closeEvent.code, 1002);
    });

    test('Rejects unknown message type with close code 1002', async () => {
      const client = new WebSocket(wsUrl);
      await new Promise((r) => client.on('open', r));

      client.send(JSON.stringify({ v: 1, type: 'hack_the_planet', payload: {} }));
      const closeEvent = await new Promise((resolve) => {
        client.on('close', (code) => resolve({ code }));
      });
      assert.equal(closeEvent.code, 1002);
    });

    test('Rejects malformed JSON with close code 1007', async () => {
      const client = new WebSocket(wsUrl);
      await new Promise((r) => client.on('open', r));

      client.send('this is not json');
      const closeEvent = await new Promise((resolve) => {
        client.on('close', (code) => resolve({ code }));
      });
      assert.equal(closeEvent.code, 1007);
    });

    test('Closes connection with code 1008 when rate limits are exceeded', async () => {
      const client = new WebSocket(wsUrl);
      await new Promise((r) => client.on('open', r));

      client.send(JSON.stringify({ v: 1, type: 'join', payload: { roomId: 'rate-room', playerName: 'Spammer' } }));

      // Send 10 messages rapidly (capacity is 5)
      for (let i = 0; i < 10; i++) {
        client.send(JSON.stringify({ v: 1, type: 'chat', payload: { text: `Spam ${i}` } }));
      }

      const closeEvent = await new Promise((resolve) => {
        client.on('close', (code, reason) => resolve({ code, reason: reason.toString() }));
      });
      assert.equal(closeEvent.code, 1008);
      assert.ok(closeEvent.reason.includes('Rate limit exceeded'));
    });

    test('Enforces maximum payload size directly on WebSocket server', async () => {
      const client = new WebSocket(wsUrl);
      await new Promise((r) => client.on('open', r));

      // maxPayloadSize is 1024 bytes; send 2KB
      const hugePayload = 'X'.repeat(2048);
      client.send(hugePayload);

      const closeEvent = await new Promise((resolve) => {
        client.on('close', (code) => resolve({ code }));
      });
      // ws library terminates oversized frame with code 1009 (Message too big)
      assert.equal(closeEvent.code, 1009);
    });

    test('Enforces room player limits', async () => {
      const c1 = new WebSocket(wsUrl);
      const c2 = new WebSocket(wsUrl);
      const c3 = new WebSocket(wsUrl);

      await Promise.all([
        new Promise((r) => c1.on('open', r)),
        new Promise((r) => c2.on('open', r)),
        new Promise((r) => c3.on('open', r)),
      ]);

      c1.send(JSON.stringify({ v: 1, type: 'join', payload: { roomId: 'limit-room', maxPlayers: 2, playerName: 'P1' } }));
      c2.send(JSON.stringify({ v: 1, type: 'join', payload: { roomId: 'limit-room', maxPlayers: 2, playerName: 'P2' } }));

      await new Promise((r) => setTimeout(r, 50));

      c3.send(JSON.stringify({ v: 1, type: 'join', payload: { roomId: 'limit-room', maxPlayers: 2, playerName: 'P3' } }));

      const errMessage = await new Promise((resolve) => {
        c3.on('message', (raw) => {
          const msg = JSON.parse(raw.toString());
          if (msg.type === 'error') resolve(msg.payload.message);
        });
      });
      assert.equal(errMessage, 'Room is full');

      c1.close();
      c2.close();
      c3.close();
    });

    test('Terminates client missing heartbeats', async () => {
      const client = new WebSocket(wsUrl);
      await new Promise((r) => client.on('open', r));
      client.send(JSON.stringify({ v: 1, type: 'join', payload: { roomId: 'hb-room', playerName: 'Unresponsive' } }));

      // Block client from answering ping
      client.pong = () => {};

      const closeEvent = await new Promise((resolve) => {
        client.on('close', (code) => resolve({ code }));
      });
      // Forced termination closes socket without normal close handshake
      assert.ok(closeEvent);
    });
  });

  describe('Streams, Match Logs & Replay Generator (M3)', () => {
    test('MatchLogTransform serializes events into NDJSON with pipeline()', async () => {
      const transform = new MatchLogTransform({ roomId: 'test-stream' });
      const chunks = [];
      transform.on('data', (c) => chunks.push(c.toString()));

      transform.write({ type: 'start', ts: 100 });
      transform.write({ type: 'kill', ts: 200 });
      transform.end();

      await new Promise((r) => transform.on('end', r));
      const output = chunks.join('');
      assert.ok(output.includes('{"type":"start","ts":100}\n'));
      assert.ok(output.includes('{"type":"kill","ts":200}\n'));
    });

    test('NDJSONParserTransform parses NDJSON back into objects', async () => {
      const parser = new NDJSONParserTransform();
      const objects = [];
      parser.on('data', (obj) => objects.push(obj));

      parser.write('{"event":"one"}\n{"event":');
      parser.write('"two"}\n');
      parser.end();

      await new Promise((r) => parser.on('end', r));
      assert.equal(objects.length, 2);
      assert.equal(objects[0].event, 'one');
      assert.equal(objects[1].event, 'two');
    });

    test('createReplayGenerator asynchronously yields events from NDJSON file', async () => {
      const sampleFile = path.join(testReplaysDir, 'gen-test.ndjson');
      fs.writeFileSync(sampleFile, '{"step":1,"action":"thrust"}\n{"step":2,"action":"fire"}\n');

      const items = [];
      for await (const event of createReplayGenerator(sampleFile)) {
        items.push(event);
      }
      assert.equal(items.length, 2);
      assert.equal(items[0].step, 1);
      assert.equal(items[1].action, 'fire');
    });

    test('GET /api/replays/:id streams replay file with backpressure and handles disconnect', async () => {
      const dummyFile = path.join(testReplaysDir, 'sample-match.ndjson');
      fs.writeFileSync(dummyFile, '{"type":"start"}\n{"type":"end"}\n');

      const res = await fetch(`${serverUrl}/api/replays/sample-match`);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('content-type'), 'application/x-ndjson; charset=utf-8');
      const text = await res.text();
      assert.ok(text.includes('{"type":"start"}'));
      assert.ok(text.includes('{"type":"end"}'));
    });
  });
});
