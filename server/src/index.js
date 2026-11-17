import process from 'node:process';
import { createServer } from './server.js';

const { server, config } = createServer();

// Global uncaught error guards:
// Never silently continue after an uncaughtException!
// An uncaught exception leaves the Node.js application in an unpredictable state.
// Log the error, perform immediate emergency cleanup, and exit with code 1.
process.on('uncaughtException', (err, origin) => {
  console.error(`[Process] CRITICAL: Uncaught Exception at ${origin}:`, err);
  // Attempt clean shutdown with a hard timeout safeguard
  try {
    server.close(() => {
      console.error('[Process] Server closed after uncaught exception. Exiting.');
      process.exit(1);
    });
  } catch (shutdownErr) {
    console.error('[Process] Error during emergency shutdown:', shutdownErr);
    process.exit(1);
  }

  // Force exit if server.close() hangs (e.g. open sockets)
  setTimeout(() => {
    console.error('[Process] Forcing exit after shutdown timeout.');
    process.exit(1);
  }, 1000).unref();
});

// Unhandled Promise Rejections:
// In Node.js 15+, unhandled rejections trigger unhandledRejection events and exit by default.
// Explicitly log and exit to prevent running in corrupted state.
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Process] CRITICAL: Unhandled Rejection at:', promise, 'reason:', reason);
  // Throwing causes it to be handled by uncaughtException for unified emergency teardown
  throw reason;
});

server.listen(config.port, config.host, () => {
  console.log(`[Server] Listening on http://${config.host}:${config.port}`);
  console.log(`[Server] Static files served from: ${config.staticDir}`);
  console.log(`[Server] Replays saved to: ${config.replaysDir}`);
});
