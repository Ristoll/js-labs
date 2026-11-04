import http from 'node:http';
import process from 'node:process';
import { config } from './config.js';
import { RoomManager } from './room-manager.js';
import { handleApi } from './api.js';
import { serveStatic } from './static.js';
import { setupWebSocket } from './websocket.js';

export function createServer(customConfig = {}) {
  const mergedConfig = { ...config, ...customConfig };
  const roomManager = new RoomManager({
    maxRooms: mergedConfig.maxRooms,
    defaultMaxPlayers: mergedConfig.maxPlayersPerRoom,
    replaysDir: mergedConfig.replaysDir,
  });

  // Pre-populate some default rooms for lobbies if empty
  try {
    roomManager.createRoom({ id: 'alpha', name: 'Alpha Sector', maxPlayers: 4 });
    roomManager.createRoom({ id: 'beta', name: 'Beta Nebula', maxPlayers: 4 });
    roomManager.createRoom({ id: 'gamma', name: 'Gamma Rift', maxPlayers: 2 });
  } catch (err) {
    // Ignore if already exists in tests
  }

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    // API routes: /api/* or /health
    if (url.pathname.startsWith('/api') || url.pathname === '/health') {
      handleApi(req, res, roomManager, mergedConfig);
      return;
    }

    // Static files from client dist
    const served = serveStatic(req, res, mergedConfig.staticDir);
    if (!served) {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Not Found' }));
    }
  });

  const wss = setupWebSocket(server, roomManager, mergedConfig);

  let isClosing = false;
  function shutdown() {
    if (isClosing) return;
    isClosing = true;
    console.log('\n[Server] Graceful shutdown initiated...');

    // Close WebSocket connections gracefully with code 1001 (Going away)
    for (const ws of wss.clients) {
      try {
        ws.close(1001, 'Server shutting down');
      } catch (e) {
        ws.terminate();
      }
    }
    wss.close();

    // Close all rooms and match log streams
    roomManager.closeAll();

    // Close HTTP server
    server.close(() => {
      console.log('[Server] HTTP server closed cleanly.');
      process.exit(0);
    });

    // Force close after 5 seconds if lingering connections exist
    setTimeout(() => {
      console.error('[Server] Forcing shutdown after timeout.');
      process.exit(1);
    }, 5000).unref();
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return { server, wss, roomManager, config: mergedConfig, shutdown };
}
