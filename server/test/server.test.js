import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { createServer } from '../src/server.js';
import { TokenBucket } from '../src/rate-limiter.js';
import { MatchLogTransform, NDJSONParserTransform } from '../src/streams.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testReplaysDir = path.join(__dirname, 'temp-replays');

describe('Lab 04 Server & WebSocket Test Suite', () => {
  let app;
  let serverUrl;
  let wsUrl;

  before(async () => {
    fs.mkdirSync(testReplaysDir, { recursive: true });
    app = createServer({
      port: 0, // OS assigned random port
      host: '127.0.0.1',
      replaysDir: testReplaysDir,
      joinTimeoutMs: 1000, // fast timeout for tests
      heartbeatIntervalMs: 500,
      heartbeatMaxMissed: 2,
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
    await new Promise((resolve) => {
      app.wss.close(() => {
        app.server.close(() => {
          resolve();
        });
      });
    });
    fs.rmSync(testReplaysDir, { recursive: true, force: true });
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
      // 1. Invalid payload
      const badRes = await fetch(`${serverUrl}/api/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '' }),
      });
      assert.equal(badRes.status, 400);

      // 2. Valid room creation
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

  describe('WebSocket Protocol & Rooms (M2 & M4)', () => {
    test('Two clients can join room, receive roster, and exchange chat', async () => {
      const client1 = new WebSocket(wsUrl);
      const client2 = new WebSocket(wsUrl);

      await Promise.all([
        new Promise((r) => client1.on('open', r)),
        new Promise((r) => client2.on('open', r)),
      ]);

      // Client 1 joins test-room
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

      // Client 2 joins test-room
      client2.send(
        JSON.stringify({
          v: 1,
          type: 'join',
          payload: { roomId: 'comm-test', playerName: 'Bob' },
        })
      );

      // Client 1 should receive roster update containing Bob
      const rosterUpdate = await new Promise((resolve) => {
        client1.on('message', (raw) => {
          const msg = JSON.parse(raw.toString());
          if (msg.type === 'roster' && msg.payload.players.some((p) => p.name === 'Bob')) {
            resolve(msg.payload);
          }
        });
      });
      assert.equal(rosterUpdate.players.length, 2);

      // Client 2 sends chat, client 1 receives it
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

    test('TokenBucket rate limiter throttles burst messages', () => {
      const bucket = new TokenBucket(5, 5); // 5 capacity, 5 refill/sec
      for (let i = 0; i < 5; i++) {
        assert.equal(bucket.tryConsume(1), true);
      }
      // 6th consume should fail immediately
      assert.equal(bucket.tryConsume(1), false);
    });
  });

  describe('Streams & Replays (M3)', () => {
    test('MatchLogTransform serializes events into NDJSON', async () => {
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

    test('GET /api/replays/:id streams replay file with backpressure', async () => {
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
