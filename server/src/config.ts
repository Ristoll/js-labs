/**
 * Server configuration, zod-validated from environment with defaults (Lab 06 M3).
 */
import process from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const EnvSchema = z.object({
  PORT: z.string().optional(),
  HOST: z.string().optional(),
  STATIC_DIR: z.string().optional(),
  MAX_PAYLOAD_SIZE: z.string().optional(),
  MAX_PLAYERS_PER_ROOM: z.string().optional(),
  MAX_ROOMS: z.string().optional(),
  LOG_DIR: z.string().optional(),
  JOIN_TIMEOUT_MS: z.string().optional(),
  HEARTBEAT_INTERVAL_MS: z.string().optional(),
  HEARTBEAT_MAX_MISSED: z.string().optional(),
  RATE_LIMIT_CAPACITY: z.string().optional(),
  RATE_LIMIT_REFILL_RATE: z.string().optional(),
  MAX_BUFFERED_AMOUNT: z.string().optional(),
});

type RawEnv = z.infer<typeof EnvSchema>;

export interface ServerConfig {
  port: number;
  host: string;
  staticDir: string;
  maxPayloadSize: number;
  maxPlayersPerRoom: number;
  maxRooms: number;
  replaysDir: string;
  joinTimeoutMs: number;
  heartbeatIntervalMs: number;
  heartbeatMaxMissed: number;
  rateLimitCapacity: number;
  rateLimitRefillRate: number;
  maxBufferedAmount: number;
}

function parsePositiveInt(val: string | undefined, name: string, defaultVal: number): number {
  if (val === undefined || val === '') return defaultVal;
  const num = Number(val);
  if (!Number.isInteger(num) || num <= 0) {
    throw new Error(`Invalid configuration: ${name} must be a positive integer, got "${val}"`);
  }
  return num;
}

function parsePort(val: string | undefined, defaultVal = 3000): number {
  if (val === undefined || val === '') return defaultVal;
  const port = Number(val);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid configuration: PORT must be between 0 and 65535, got "${val}"`);
  }
  return port;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): ServerConfig {
  const port = parsePort(env.PORT, 3000);
  const host = env.HOST ?? '127.0.0.1';
  const staticDir = env.STATIC_DIR
    ? path.resolve(process.cwd(), env.STATIC_DIR)
    : path.resolve(__dirname, '../../client/dist');
  const maxPayloadSize = parsePositiveInt(env.MAX_PAYLOAD_SIZE, 'MAX_PAYLOAD_SIZE', 65536);
  const maxPlayersPerRoom = parsePositiveInt(
    env.MAX_PLAYERS_PER_ROOM,
    'MAX_PLAYERS_PER_ROOM',
    4
  );
  const maxRooms = parsePositiveInt(env.MAX_ROOMS, 'MAX_ROOMS', 100);
  const replaysDir = env.LOG_DIR
    ? path.resolve(process.cwd(), env.LOG_DIR)
    : path.resolve(__dirname, '../replays');
  const joinTimeoutMs = parsePositiveInt(env.JOIN_TIMEOUT_MS, 'JOIN_TIMEOUT_MS', 5000);
  const heartbeatIntervalMs = parsePositiveInt(
    env.HEARTBEAT_INTERVAL_MS,
    'HEARTBEAT_INTERVAL_MS',
    15000
  );
  const heartbeatMaxMissed = parsePositiveInt(env.HEARTBEAT_MAX_MISSED, 'HEARTBEAT_MAX_MISSED', 2);
  const rateLimitCapacity = parsePositiveInt(env.RATE_LIMIT_CAPACITY, 'RATE_LIMIT_CAPACITY', 20);
  const rateLimitRefillRate = parsePositiveInt(
    env.RATE_LIMIT_REFILL_RATE,
    'RATE_LIMIT_REFILL_RATE',
    10
  );
  const maxBufferedAmount = parsePositiveInt(
    env.MAX_BUFFERED_AMOUNT,
    'MAX_BUFFERED_AMOUNT',
    1048576
  );

  return {
    port,
    host,
    staticDir,
    maxPayloadSize,
    maxPlayersPerRoom,
    maxRooms,
    replaysDir,
    joinTimeoutMs,
    heartbeatIntervalMs,
    heartbeatMaxMissed,
    rateLimitCapacity,
    rateLimitRefillRate,
    maxBufferedAmount,
  };
}

export const config: ServerConfig = loadConfig();
