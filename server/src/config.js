import process from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '127.0.0.1',
  staticDir: process.env.STATIC_DIR
    ? path.resolve(process.cwd(), process.env.STATIC_DIR)
    : path.resolve(__dirname, '../../client/dist'),
  maxPayloadSize: parseInt(process.env.MAX_PAYLOAD_SIZE || '65536', 10), // 64 KB
  maxPlayersPerRoom: parseInt(process.env.MAX_PLAYERS_PER_ROOM || '4', 10),
  maxRooms: parseInt(process.env.MAX_ROOMS || '100', 10),
  replaysDir: process.env.LOG_DIR
    ? path.resolve(process.cwd(), process.env.LOG_DIR)
    : path.resolve(__dirname, '../replays'),
  joinTimeoutMs: parseInt(process.env.JOIN_TIMEOUT_MS || '5000', 10),
  heartbeatIntervalMs: parseInt(process.env.HEARTBEAT_INTERVAL_MS || '15000', 10),
  heartbeatMaxMissed: parseInt(process.env.HEARTBEAT_MAX_MISSED || '2', 10),
  rateLimitCapacity: parseInt(process.env.RATE_LIMIT_CAPACITY || '20', 10),
  rateLimitRefillRate: parseInt(process.env.RATE_LIMIT_REFILL_RATE || '10', 10), // tokens/sec
  maxBufferedAmount: parseInt(process.env.MAX_BUFFERED_AMOUNT || '1048576', 10), // 1MB buffer limit
};
