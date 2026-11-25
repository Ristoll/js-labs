import http from 'node:http';
import process from 'node:process';
import { config } from './config.ts';
import type { ServerConfig } from './config.ts';
import { RoomManager } from './room-manager.ts';
import { handleApi } from './api.ts';
import { serveStatic } from './static.ts';
import { setupWebSocket } from './websocket.ts';

export interface ServerHandle {
  server: http.Server;
  wss: ReturnType<typeof setupWebSocket>;
  roomManager: RoomManager;
  config: ServerConfig;
  shutdown: () => Promise<void>;
}

export function createServer(customConfig: Partial<ServerConfig> = {}): ServerHandle {
  const mergedConfig: ServerConfig = { ...config, ...customConfig };
  const roomManager = new RoomManager({
    maxRooms: mergedConfig.maxRooms,
    defaultMaxPlayers: mergedConfig.maxPlayersPerRoom,
    replaysDir: mergedConfig.replaysDir,
    maxBufferedAmount: mergedConfig.maxBufferedAmount,
  });

  try {
    roomManager.createRoom({ id: 'alpha', name: 'Alpha Sector', maxPlayers: 4 });
    roomManager.createRoom({ id: 'beta', name: 'Beta Nebula', maxPlayers: 4 });
    roomManager.createRoom({ id: 'gamma', name: 'Gamma Rift', maxPlayers: 2 });
  } catch {
    // Ignore if already exists in tests
  }

  const server = http.createServer((req, res) => {
    const host = req.headers.host ? (Array.isArray(req.headers.host) ? req.headers.host[0] : req.headers.host) : 'localhost';
    const url = new URL(req.url ?? '/', `http://${host}`);

    if (url.pathname.startsWith('/api') || url.pathname === '/health') {
      handleApi(req, res, roomManager, mergedConfig);
      return;
    }

    const served = serveStatic(req, res, mergedConfig.staticDir);
    if (!served) {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Not Found' }));
    }
  });

  const wss = setupWebSocket(server, roomManager, mergedConfig);

  let isClosing = false;
  async function shutdown(): Promise<void> {
    if (isClosing) return;
    isClosing = true;
    console.log('\n[Server] Graceful shutdown initiated...');

    await new Promise<void>((resolve) => {
      server.close(() => {
        console.log('[Server] HTTP server stopped accepting connections.');
        resolve();
      });
    });

    for (const ws of wss.clients) {
      try {
        ws.close(1001, 'Server shutting down');
      } catch {
        ws.terminate();
      }
    }

    await new Promise<void>((resolve) => {
      wss.close(() => {
        console.log('[Server] WebSocket server closed.');
        resolve();
      });
    });

    await roomManager.closeAll();
    console.log('[Server] All rooms closed and match logs flushed.');
  }

  const onSigint = async () => {
    await shutdown();
    process.exit(0);
  };
  const onSigterm = async () => {
    await shutdown();
    process.exit(0);
  };

  process.once('SIGINT', onSigint);
  process.once('SIGTERM', onSigterm);

  return { server, wss, roomManager, config: mergedConfig, shutdown };
}
