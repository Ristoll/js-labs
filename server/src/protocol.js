/**
 * server/src/protocol.js
 * Versioned WebSocket message schemas and validation.
 */
import { PROTOCOL_VERSION, WS_CLOSE_CODES, validateInputPayload } from 'shared/protocol';

export { PROTOCOL_VERSION, WS_CLOSE_CODES };

export const INCOMING_TYPES = Object.freeze({
  JOIN: 'join',
  CHAT: 'chat',
  LEAVE: 'leave',
  INPUT: 'input',
  PING: 'ping',
  ADMIN_LATENCY: 'admin_latency',
});

export const OUTGOING_TYPES = Object.freeze({
  JOINED: 'joined',
  ROSTER: 'roster',
  CHAT: 'chat',
  ERROR: 'error',
  SNAPSHOT: 'snapshot',
  PONG: 'pong',
});

/**
 * Validates an incoming parsed WebSocket message.
 * @param {unknown} msg
 * @returns {{ valid: boolean, code?: number, error?: string, value?: { v: number, type: string, payload: any } }}
 */
export function validateMessage(msg) {
  if (!msg || typeof msg !== 'object' || Array.isArray(msg)) {
    return {
      valid: false,
      code: WS_CLOSE_CODES.PROTOCOL_ERROR,
      error: 'Message must be a non-null object',
    };
  }

  // 1. Protocol Version
  if (msg.v !== PROTOCOL_VERSION) {
    return {
      valid: false,
      code: WS_CLOSE_CODES.PROTOCOL_ERROR,
      error: `Unsupported protocol version: ${msg.v} (expected ${PROTOCOL_VERSION})`,
    };
  }

  // 2. Message Type
  if (typeof msg.type !== 'string' || !Object.values(INCOMING_TYPES).includes(msg.type)) {
    return {
      valid: false,
      code: WS_CLOSE_CODES.PROTOCOL_ERROR,
      error: `Unknown or invalid message type: ${msg.type}`,
    };
  }

  // 3. Payload validation per type
  const { type, payload } = msg;

  if (type === INCOMING_TYPES.LEAVE) {
    return { valid: true, value: msg };
  }

  if (type === INCOMING_TYPES.PING) {
    return { valid: true, value: msg };
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {
      valid: false,
      code: WS_CLOSE_CODES.INVALID_PAYLOAD,
      error: `Payload for '${type}' must be an object`,
    };
  }

  if (type === INCOMING_TYPES.JOIN) {
    if (!payload.roomId || typeof payload.roomId !== 'string' || !payload.roomId.trim()) {
      return {
        valid: false,
        code: WS_CLOSE_CODES.INVALID_PAYLOAD,
        error: "Join payload requires non-empty string 'roomId'",
      };
    }
    if (payload.playerName !== undefined && typeof payload.playerName !== 'string') {
      return {
        valid: false,
        code: WS_CLOSE_CODES.INVALID_PAYLOAD,
        error: "Join payload 'playerName' must be a string",
      };
    }
    if (payload.maxPlayers !== undefined) {
      if (!Number.isInteger(payload.maxPlayers) || payload.maxPlayers < 1) {
        return {
          valid: false,
          code: WS_CLOSE_CODES.INVALID_PAYLOAD,
          error: "Join payload 'maxPlayers' must be a positive integer",
        };
      }
    }
    return { valid: true, value: msg };
  }

  if (type === INCOMING_TYPES.CHAT) {
    if (typeof payload.text !== 'string' || !payload.text.trim()) {
      return {
        valid: false,
        code: WS_CLOSE_CODES.INVALID_PAYLOAD,
        error: "Chat payload requires non-empty string 'text'",
      };
    }
    if (payload.text.length > 1000) {
      return {
        valid: false,
        code: WS_CLOSE_CODES.INVALID_PAYLOAD,
        error: 'Chat message text exceeds maximum length (1000 characters)',
      };
    }
    return { valid: true, value: msg };
  }

  if (type === INCOMING_TYPES.INPUT) {
    const val = validateInputPayload(payload);
    if (!val.valid) {
      return {
        valid: false,
        code: WS_CLOSE_CODES.INVALID_PAYLOAD,
        error: val.error,
      };
    }
    return { valid: true, value: { ...msg, payload: val.sanitized } };
  }

  if (type === INCOMING_TYPES.ADMIN_LATENCY) {
    return { valid: true, value: msg };
  }

  return { valid: true, value: msg };
}
