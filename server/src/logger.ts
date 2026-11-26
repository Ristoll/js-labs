/**
 * Structured logger for the production server.
 *
 * Uses `pino` (JSON lines to stdout) so log collection platforms can ingest
 * `stdout` directly. Level is controlled by the `LOG_LEVEL` environment
 * variable (default `info`); set `LOG_LEVEL=debug` for verbose tracing.
 *
 * Child loggers bind `roomId`/`playerId` so a single match can be filtered
 * across all its log lines. Secrets and full message bodies are never logged.
 */
import pino from 'pino';

const level = (process.env.LOG_LEVEL ?? 'info') as
  | 'fatal'
  | 'error'
  | 'warn'
  | 'info'
  | 'debug'
  | 'trace'
  | 'silent';

export function createLogger(opts: { name?: string; level?: string } = {}) {
  return pino({
    level: opts.level ?? level,
    name: opts.name ?? 'dogfight-server',
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}

export const log = createLogger();

/** Bind request-scoped fields (roomId, playerId) onto a child logger. */
export function bindLogger(base: pino.Logger, fields: { roomId?: string; playerId?: string }) {
  const bound: Record<string, string> = {};
  if (fields.roomId) bound.roomId = fields.roomId;
  if (fields.playerId) bound.playerId = fields.playerId;
  return Object.keys(bound).length > 0 ? base.child(bound) : base;
}
