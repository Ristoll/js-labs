import process from 'node:process';
import { createServer } from './server.ts';

const { server, config } = createServer();

// Global uncaught error guards:
// Never silently continue after an uncaughtException!
process.on('uncaughtException', (err: unknown, origin: string | undefined) => {
  console.error(`[Process] CRITICAL: Uncaught Exception at ${origin}:`, err);
  try {
    server.close(() => {
      console.error('[Process] Server closed after uncaught exception. Exiting.');
      process.exit(1);
    });
  } catch (shutdownErr) {
    console.error('[Process] Error during emergency shutdown:', shutdownErr);
    process.exit(1);
  }

  setTimeout(() => {
    console.error('[Process] Forcing exit after shutdown timeout.');
    process.exit(1);
  }, 1000).unref();
});

process.on('unhandledRejection', (reason: unknown) => {
  console.error('[Process] CRITICAL: Unhandled Rejection at:', reason);
  throw reason;
});

server.listen(config.port, config.host, () => {
  console.log(`[Server] Listening on http://${config.host}:${config.port}`);
  console.log(`[Server] Static files served from: ${config.staticDir}`);
  console.log(`[Server] Replays saved to: ${config.replaysDir}`);
});
