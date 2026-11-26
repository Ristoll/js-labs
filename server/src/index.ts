import process from 'node:process';
import { createServer } from './server.ts';
import { log } from './logger.ts';
import { startSampling } from './metrics.ts';

const { server, config, roomManager } = createServer();

// Start production metrics sampling (RSS, event loop, players, rooms).
startSampling(roomManager);

// Global uncaught error guards:
// Never silently continue after an uncaughtException — log the stack and let
// the supervisor restart a clean process.
process.on('uncaughtException', (err: unknown, origin: string | undefined) => {
  log.error({ err, origin, event: 'uncaughtException' }, 'CRITICAL: Uncaught exception');
  server.close(() => {
    log.error({ event: 'uncaughtException-shutdown' }, 'Server closed after uncaught exception. Exiting.');
    process.exit(1);
  });
  setTimeout(() => {
    log.error({ event: 'uncaughtException-forced-exit' }, 'Forcing exit after shutdown timeout.');
    process.exit(1);
  }, 1000).unref();
});

process.on('unhandledRejection', (reason: unknown) => {
  log.error({ reason, event: 'unhandledRejection' }, 'CRITICAL: Unhandled rejection');
  throw reason;
});

server.listen(config.port, config.host, () => {
  log.info(
    { port: config.port, host: config.host, version: config.buildVersion },
    `Server listening on http://${config.host}:${config.port}`
  );
  log.info({ staticDir: config.staticDir }, 'Static files served from');
  log.info({ replaysDir: config.replaysDir }, 'Replays saved to');
});
