import process from 'node:process';
import { createServer } from './server.js';

// Global uncaught error guards
process.on('uncaughtException', (err) => {
  console.error('[Process] Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Process] Unhandled Rejection at:', promise, 'reason:', reason);
});

const { server, config } = createServer();

server.listen(config.port, config.host, () => {
  console.log(`[Server] Listening on http://${config.host}:${config.port}`);
  console.log(`[Server] Static files served from: ${config.staticDir}`);
  console.log(`[Server] Replays saved to: ${config.replaysDir}`);
});
