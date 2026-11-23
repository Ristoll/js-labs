export const PROTOCOL_VERSION = 1;

export const MESSAGE_TYPES = Object.freeze({
  // Client -> Server
  JOIN: 'join',
  LEAVE: 'leave',
  CHAT: 'chat',
  INPUT: 'input',
  PING: 'ping',
  ADMIN_LATENCY: 'admin_latency',

  // Server -> Client
  JOINED: 'joined',
  ROSTER: 'roster',
  SNAPSHOT: 'snapshot',
  PONG: 'pong',
  ERROR: 'error',
});

export const WS_CLOSE_CODES = Object.freeze({
  NORMAL_CLOSURE: 1000,
  GOING_AWAY: 1001,
  PROTOCOL_ERROR: 1002,
  UNSUPPORTED_DATA: 1003,
  INVALID_PAYLOAD: 1007,
  POLICY_VIOLATION: 1008,
  MESSAGE_TOO_BIG: 1009,
  JOIN_TIMEOUT: 4001,
});

/**
 * Validates an incoming input payload from a client.
 * { seq, tick, thrust, reverse, turn, fire }
 *
 * @param {unknown} payload
 * @returns {{ valid: boolean, error?: string, sanitized?: object }}
 */
export function validateInputPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { valid: false, error: 'Input payload must be an object' };
  }

  const { seq, tick, thrust, reverse, turn, fire } = payload;

  if (typeof seq !== 'number' || !Number.isInteger(seq) || seq < 0) {
    return { valid: false, error: 'seq must be a non-negative integer' };
  }

  const sanitized = {
    seq,
    tick: typeof tick === 'number' && Number.isInteger(tick) && tick >= 0 ? tick : 0,
    thrust: Boolean(thrust),
    reverse: Boolean(reverse),
    turn: typeof turn === 'number' ? Math.max(-1, Math.min(1, turn)) : 0,
    fire: Boolean(fire),
  };

  return { valid: true, sanitized };
}

/**
 * Universal validator for incoming WebSocket messages.
 *
 * @param {unknown} msg
 * @returns {{ valid: boolean, code?: number, error?: string, value?: any }}
 */
export function validateMessage(msg) {
  if (!msg || typeof msg !== 'object' || Array.isArray(msg)) {
    return {
      valid: false,
      code: WS_CLOSE_CODES.PROTOCOL_ERROR,
      error: 'Message must be an object',
    };
  }

  if (msg.v !== PROTOCOL_VERSION) {
    return {
      valid: false,
      code: WS_CLOSE_CODES.PROTOCOL_ERROR,
      error: `Unsupported protocol version: ${msg.v} (expected ${PROTOCOL_VERSION})`,
    };
  }

  if (typeof msg.type !== 'string' || !Object.values(MESSAGE_TYPES).includes(msg.type)) {
    return {
      valid: false,
      code: WS_CLOSE_CODES.PROTOCOL_ERROR,
      error: `Unknown message type: ${msg.type}`,
    };
  }

  const { type, payload } = msg;

  if (type === MESSAGE_TYPES.INPUT) {
    const inputVal = validateInputPayload(payload);
    if (!inputVal.valid) {
      return {
        valid: false,
        code: WS_CLOSE_CODES.INVALID_PAYLOAD,
        error: inputVal.error,
      };
    }
    return { valid: true, value: { ...msg, payload: inputVal.sanitized } };
  }

  return { valid: true, value: msg };
}
