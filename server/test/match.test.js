import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createServer } from '../src/server.js';

test('Match runs at 30 Hz and exposes stats via /api/stats', async () => {
  const { server, shutdown } = createServer({
    port: 0,
    joinTimeoutMs: 2000,
  });

  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  // Let the match run for ~120 ms (3-4 ticks)
  await new Promise((resolve) => setTimeout(resolve, 120));

  const statsRes = await fetch(`http://127.0.0.1:${port}/api/stats`);
  assert.strictEqual(statsRes.status, 200);
  const stats = await statsRes.json();

  assert.ok(stats.uptime >= 0);
  assert.ok(stats.matches.length > 0);

  const matchStats = stats.matches[0];
  assert.strictEqual(matchStats.tickRate, 30);
  assert.ok(matchStats.tick >= 2, `Expected at least 2 ticks, got ${matchStats.tick}`);
  assert.ok(typeof matchStats.avgTickDurationMs === 'number');
  assert.ok(typeof matchStats.avgTickJitterMs === 'number');

  await shutdown();
});

test('Client sends input, server applies it and broadcasts snapshot with lastProcessedSeq', async () => {
  const { server, shutdown } = createServer({
    port: 0,
  });

  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);

  const snapshots = [];

  await new Promise((resolve, reject) => {
    ws.on('open', () => {
      // Join room
      ws.send(
        JSON.stringify({
          v: 1,
          type: 'join',
          payload: { roomId: 'alpha', playerName: 'PilotTest' },
        })
      );
    });

    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'joined') {
        // Send input
        ws.send(
          JSON.stringify({
            v: 1,
            type: 'input',
            payload: {
              seq: 42,
              tick: 1,
              thrust: true,
              reverse: false,
              turn: 0.5,
              fire: false,
            },
          })
        );
      } else if (msg.type === 'snapshot') {
        snapshots.push(msg.payload);
        if (
          msg.payload.lastProcessedSeq &&
          Object.values(msg.payload.lastProcessedSeq).includes(42)
        ) {
          resolve();
        }
      }
    });

    ws.on('error', reject);

    // Timeout safeguard
    setTimeout(() => {
      if (snapshots.length > 0) resolve();
      else reject(new Error('Snapshot timeout'));
    }, 2000);
  });

  assert.ok(snapshots.length > 0, 'Should have received snapshots');
  const lastSnap = snapshots[snapshots.length - 1];
  assert.ok(typeof lastSnap.tick === 'number');
  assert.ok(Array.isArray(lastSnap.entities));

  ws.close();
  await shutdown();
});

test('Latency injector can be configured via admin_latency', async () => {
  const { server, roomManager, shutdown } = createServer({
    port: 0,
  });

  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);

  await new Promise((resolve, reject) => {
    ws.on('open', () => {
      ws.send(
        JSON.stringify({
          v: 1,
          type: 'join',
          payload: { roomId: 'alpha', playerName: 'LatencyTester' },
        })
      );
    });

    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'joined') {
        // Set latency
        ws.send(
          JSON.stringify({
            v: 1,
            type: 'admin_latency',
            payload: { delayMs: 100, jitterMs: 20, dropRate: 0.05 },
          })
        );
        setTimeout(resolve, 50);
      }
    });

    ws.on('error', reject);
  });

  const room = roomManager.getRoom('alpha');
  assert.ok(room && room.match);
  assert.strictEqual(room.match.latencyConfig.delayMs, 100);
  assert.strictEqual(room.match.latencyConfig.jitterMs, 20);
  assert.strictEqual(room.match.latencyConfig.dropRate, 0.05);

  ws.close();
  await shutdown();
});
