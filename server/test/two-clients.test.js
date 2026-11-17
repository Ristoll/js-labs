import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { createServer } from '../src/server.js';

describe('Lab 04 M2 Two Clients Live Verification', () => {
  let app;
  let wsUrl;

  before(async () => {
    app = createServer({
      port: 0,
      host: '127.0.0.1',
    });

    await new Promise((resolve) => {
      app.server.listen(0, '127.0.0.1', () => {
        const addr = app.server.address();
        wsUrl = `ws://127.0.0.1:${addr.port}/ws`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise((resolve) => {
      app.wss.close(() => {
        app.server.close(resolve);
      });
    });
  });

  test('Two clients join the same room, see each other in roster, and exchange chat messages', async () => {
    const ws1 = new WebSocket(wsUrl);
    const ws2 = new WebSocket(wsUrl);

    await Promise.all([
      new Promise((r) => ws1.on('open', r)),
      new Promise((r) => ws2.on('open', r)),
    ]);

    // Client 1 joins 'sector-4'
    ws1.send(
      JSON.stringify({ v: 1, type: 'join', payload: { roomId: 'sector-4', playerName: 'Viper' } })
    );

    // Client 2 joins 'sector-4'
    ws2.send(
      JSON.stringify({ v: 1, type: 'join', payload: { roomId: 'sector-4', playerName: 'Phoenix' } })
    );

    // Verify Client 1 receives roster with both players
    const rosterForClient1 = await new Promise((resolve) => {
      ws1.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'roster' && msg.payload.players.length === 2) {
          resolve(msg.payload.players);
        }
      });
    });

    assert.ok(rosterForClient1.some((p) => p.name === 'Viper'));
    assert.ok(rosterForClient1.some((p) => p.name === 'Phoenix'));

    // Client 1 sends chat
    ws1.send(JSON.stringify({ v: 1, type: 'chat', payload: { text: 'Engaging targets!' } }));

    // Client 2 receives chat
    const chatForClient2 = await new Promise((resolve) => {
      ws2.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'chat') {
          resolve(msg.payload);
        }
      });
    });

    assert.equal(chatForClient2.senderName, 'Viper');
    assert.equal(chatForClient2.text, 'Engaging targets!');

    ws1.close();
    ws2.close();
  });
});
