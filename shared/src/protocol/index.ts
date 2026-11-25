/**
 * shared/src/protocol.ts
 * Single source of truth for the wire protocol (Lab 06 M2).
 *
 * zod schemas are defined once and their TypeScript types are inferred
 * (`z.infer<typeof Schema>`). Incoming `unknown` data is parsed at the
 * boundary with `safeParse` — validation never throws.
 *
 * Lab 4's hand-rolled validator is replaced by these schemas.
 */
import { z } from 'zod';

export const PROTOCOL_VERSION = 1;

export const MESSAGE_TYPES = Object.freeze({
  JOIN: 'join',
  LEAVE: 'leave',
  CHAT: 'chat',
  INPUT: 'input',
  PING: 'ping',
  ADMIN_LATENCY: 'admin_latency',
  SET_CODEC: 'set_codec',
  JOINED: 'joined',
  ROSTER: 'roster',
  SNAPSHOT: 'snapshot',
  PONG: 'pong',
  ERROR: 'error',
} as const);

export type MessageType = (typeof MESSAGE_TYPES)[keyof typeof MESSAGE_TYPES];

export const WS_CLOSE_CODES = Object.freeze({
  NORMAL_CLOSURE: 1000,
  GOING_AWAY: 1001,
  PROTOCOL_ERROR: 1002,
  UNSUPPORTED_DATA: 1003,
  INVALID_PAYLOAD: 1007,
  POLICY_VIOLATION: 1008,
  MESSAGE_TOO_BIG: 1009,
  JOIN_TIMEOUT: 4001,
} as const);

export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; code: number; error: string };

export function okResult<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function errResult(code: number, error: string): Result<never> {
  return { ok: false, code, error };
}

/** Re-exported branded id / tick / seq types. */
import { asEntityId, asTick, asSeq, type EntityId, type Tick, type Seq } from '../types.ts';
export { asEntityId, asTick, asSeq };
export type { EntityId, Tick, Seq };

// ┌──────────────────────────────────────────────────────────────┐
// │ Client → Server message schemas                              │
// └──────────────────────────────────────────────────────────────┘

export const ClientJoinSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  type: z.literal(MESSAGE_TYPES.JOIN),
  payload: z.object({
    roomId: z.string().min(1),
    playerName: z.string().optional(),
    maxPlayers: z.number().int().positive().optional(),
    codec: z.enum(['json', 'binary']).optional(),
  }),
});

export const ClientChatSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  type: z.literal(MESSAGE_TYPES.CHAT),
  payload: z.object({
    text: z.string().min(1).max(1000),
  }),
});

export const ClientLeaveSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  type: z.literal(MESSAGE_TYPES.LEAVE),
  payload: z.object({}),
});

export const ClientInputSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  type: z.literal(MESSAGE_TYPES.INPUT),
  payload: z.object({
    seq: z.number().int().nonnegative(),
    tick: z.number().int().nonnegative().optional(),
    thrust: z.boolean().optional(),
    reverse: z.boolean().optional(),
    turn: z.number().min(-1).max(1).optional(),
    fire: z.boolean().optional(),
  }),
});

export const ClientPingSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  type: z.literal(MESSAGE_TYPES.PING),
  payload: z.object({
    clientTime: z.number().optional(),
  }),
});

export const ClientAdminLatencySchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  type: z.literal(MESSAGE_TYPES.ADMIN_LATENCY),
  payload: z.object({
    delayMs: z.number().nonnegative().optional(),
    jitterMs: z.number().nonnegative().optional(),
    dropRate: z.number().min(0).max(1).optional(),
  }),
});

export const ClientSetCodecSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  type: z.literal(MESSAGE_TYPES.SET_CODEC),
  payload: z.object({
    codec: z.enum(['json', 'binary']),
  }),
});

export const ClientMessageSchema = z.discriminatedUnion('type', [
  ClientJoinSchema,
  ClientChatSchema,
  ClientLeaveSchema,
  ClientInputSchema,
  ClientPingSchema,
  ClientAdminLatencySchema,
  ClientSetCodecSchema,
]);

/** Inferred from the zod schema — one source of truth. */
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

// ┌──────────────────────────────────────────────────────────────┐
// │ Server → Client message schemas                              │
// └──────────────────────────────────────────────────────────────┘

export const ServerJoinedSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  type: z.literal(MESSAGE_TYPES.JOINED),
  payload: z.object({
    roomId: z.string(),
    playerId: z.string(),
    playerName: z.string(),
    maxPlayers: z.number().int().positive(),
  }),
});

export const ServerRosterSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  type: z.literal(MESSAGE_TYPES.ROSTER),
  payload: z.object({
    players: z.array(z.object({ id: z.string(), name: z.string() })),
  }),
});

export const ServerSnapshotSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  type: z.literal(MESSAGE_TYPES.SNAPSHOT),
  payload: z.object({
    tick: z.number().int(),
    serverTime: z.number(),
    lastProcessedSeq: z.record(z.string(), z.number().int()),
    entities: z.array(z.record(z.string(), z.unknown())),
  }),
});

export const ServerPongSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  type: z.literal(MESSAGE_TYPES.PONG),
  payload: z.object({
    clientTime: z.number(),
    serverTime: z.number(),
  }),
});

export const ServerErrorSchema = z.object({
  v: z.literal(PROTOCOL_VERSION),
  type: z.literal(MESSAGE_TYPES.ERROR),
  payload: z.object({
    message: z.string(),
  }),
});

export const ServerMessageSchema = z.discriminatedUnion('type', [
  ServerJoinedSchema,
  ServerRosterSchema,
  ServerSnapshotSchema,
  ServerPongSchema,
  ServerErrorSchema,
]);

export type ServerMessage = z.infer<typeof ServerMessageSchema>;

export const AnyMessageSchema = z.discriminatedUnion('type', [
  ...ClientMessageSchema.options,
  ...ServerMessageSchema.options,
]);

export type AnyMessage = z.infer<typeof AnyMessageSchema>;

/** ValidatedMessage shape kept for Lab 4/5 consumers; now zod-backed. */
export interface ValidatedMessage {
  valid: boolean;
  code?: number;
  error?: string;
  value?: Record<string, unknown>;
}

/**
 * Parse raw inbound `unknown` data into a typed `ClientMessage`.
 * Never throws: invalid input yields an `ok: false` Result.
 */
export function parseClientMessage(data: unknown): Result<ClientMessage> {
  // Must be an object; malformed/non-object payloads are protocol errors.
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return errResult(WS_CLOSE_CODES.PROTOCOL_ERROR, 'Invalid client message');
  }

  const m = data as Record<string, unknown>;

  // Protocol version mismatch is a protocol error, not a payload error.
  if (m.v !== PROTOCOL_VERSION) {
    return errResult(
      WS_CLOSE_CODES.PROTOCOL_ERROR,
      `Unsupported protocol version: ${m.v} (expected ${PROTOCOL_VERSION})`,
    );
  }

  if (typeof m.type !== 'string') {
    return errResult(WS_CLOSE_CODES.PROTOCOL_ERROR, 'Invalid client message: missing type');
  }

  const knownTypes = new Set(Object.values(MESSAGE_TYPES));
  if (!knownTypes.has(m.type as (typeof MESSAGE_TYPES)[keyof typeof MESSAGE_TYPES])) {
    return errResult(WS_CLOSE_CODES.PROTOCOL_ERROR, `Unknown message type: ${m.type}`);
  }

  // Validate the full message shape (including payload field constraints).
  const parsed = ClientMessageSchema.safeParse(m);
  if (!parsed.success) {
    return errResult(
      WS_CLOSE_CODES.INVALID_PAYLOAD,
      `Invalid client message: ${parsed.error.issues[0]?.message ?? 'unknown'}`,
    );
  }
  return okResult(parsed.data);
}

/**
 * Parse a server message. Never throws.
 */
export function parseServerMessage(data: unknown): Result<ServerMessage> {
  const parsed = ServerMessageSchema.safeParse(data);
  if (!parsed.success) {
    return errResult(WS_CLOSE_CODES.PROTOCOL_ERROR, 'Invalid server message');
  }
  return okResult(parsed.data);
}

/**
 * Legacy validator retained for Lab 4/5 consumers. Reimplemented on top of
 * zod so it never throws and cannot drift from the schema.
 */
export function validateMessage(msg: unknown): ValidatedMessage {
  if (!msg || typeof msg !== 'object' || Array.isArray(msg)) {
    return {
      valid: false,
      code: WS_CLOSE_CODES.PROTOCOL_ERROR,
      error: 'Message must be a non-null object',
    };
  }

  const m = msg as Record<string, unknown>; // narrow unknown wire message to an object

  if (m.v !== PROTOCOL_VERSION) {
    return {
      valid: false,
      code: WS_CLOSE_CODES.PROTOCOL_ERROR,
      error: `Unsupported protocol version: ${m.v} (expected ${PROTOCOL_VERSION})`,
    };
  }

  if (
    typeof m.type !== 'string' ||
    (m.type !== MESSAGE_TYPES.JOIN &&
      m.type !== MESSAGE_TYPES.LEAVE &&
      m.type !== MESSAGE_TYPES.CHAT &&
      m.type !== MESSAGE_TYPES.INPUT &&
      m.type !== MESSAGE_TYPES.PING &&
      m.type !== MESSAGE_TYPES.ADMIN_LATENCY &&
      m.type !== MESSAGE_TYPES.SET_CODEC)
  ) {
    return {
      valid: false,
      code: WS_CLOSE_CODES.PROTOCOL_ERROR,
      error: `Unknown message type: ${m.type}`,
    };
  }

  const { type, payload } = m;

  switch (type) {
    case MESSAGE_TYPES.INPUT: {
      const parsed = ClientInputSchema.shape.payload.safeParse(payload);
      if (!parsed.success) {
        return {
          valid: false,
          code: WS_CLOSE_CODES.INVALID_PAYLOAD,
          error: `Invalid input payload: ${parsed.error.issues[0]?.message ?? 'unknown'}`,
        };
      }
      return {
        valid: true,
        value: { ...m, payload: parsed.data },
      };
    }

    case MESSAGE_TYPES.JOIN: {
      const parsed = ClientJoinSchema.shape.payload.safeParse(payload);
      if (!parsed.success) {
        return {
          valid: false,
          code: WS_CLOSE_CODES.INVALID_PAYLOAD,
          error: `Invalid join payload: ${parsed.error.issues[0]?.message ?? 'unknown'}`,
        };
      }
      return {
        valid: true,
        value: { ...m, payload: parsed.data },
      };
    }

    case MESSAGE_TYPES.CHAT: {
      const parsed = ClientChatSchema.shape.payload.safeParse(payload);
      if (!parsed.success) {
        return {
          valid: false,
          code: WS_CLOSE_CODES.INVALID_PAYLOAD,
          error: `Invalid chat payload: ${parsed.error.issues[0]?.message ?? 'unknown'}`,
        };
      }
      return {
        valid: true,
        value: { ...m, payload: parsed.data },
      };
    }

    default:
      return { valid: true, value: m };
  }
}
