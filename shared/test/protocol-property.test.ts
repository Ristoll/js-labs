import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { parseClientMessage, parseServerMessage, validateMessage, WS_CLOSE_CODES, MESSAGE_TYPES, PROTOCOL_VERSION } from '../src/protocol/index.ts';

const genValidJoin = fc.tuple(
  fc.string({ minLength: 1, maxLength: 20 }), // roomId
  fc.option(fc.string({ minLength: 1, maxLength: 20 })), // playerName (null = omitted)
).map(([roomId, playerName]) => {
  const payload: Record<string, unknown> = { roomId };
  if (playerName !== null) payload.playerName = playerName;
  return { v: PROTOCOL_VERSION, type: 'join' as const, payload };
});

const genValidInput = fc.tuple(
  fc.integer({ min: 0, max: 10_000 }), // seq
  fc.option(fc.integer({ min: 0, max: 10_000 })), // tick
  fc.option(fc.boolean()), // thrust
  fc.option(fc.boolean()), // reverse
  fc.option(fc.boolean()), // fire
  fc.option(fc.float({ min: -1, max: 1 })), // turn
).map(([seq, tick, thrust, reverse, fire, turn]) => {
  const payload: Record<string, unknown> = { seq };
  if (tick !== null) payload.tick = tick;
  if (thrust !== null) payload.thrust = thrust;
  if (reverse !== null) payload.reverse = reverse;
  if (fire !== null) payload.fire = fire;
  if (turn !== null && !Number.isNaN(turn)) payload.turn = turn;
  return { v: PROTOCOL_VERSION, type: 'input' as const, payload };
});

describe('protocol properties', () => {
  it('parseClientMessage accepts every generated valid message', () => {
    fc.assert(
      fc.property(fc.oneof(genValidJoin, genValidInput), (msg) => {
        const result = parseClientMessage(msg);
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value.type).toBe(msg.type);
          expect(result.value.v).toBe(PROTOCOL_VERSION);
        }
      }),
      { numRuns: 300 }
    );
  });

  it('parseClientMessage rejects mutations of a valid message', () => {
    fc.assert(
      fc.property(
        fc.oneof(genValidJoin, genValidInput),
        fc.integer({ min: 0, max: 2 }),
        (msg, kind) => {
          const mutated = { ...msg } as Record<string, unknown>;
          if (kind === 0) {
            mutated.v = 999; // bad version
          } else if (kind === 1) {
            mutated.type = 'not_a_real_type';
          } else {
            delete mutated.payload;
          }
          const result = parseClientMessage(mutated);
          expect(result.ok).toBe(false);
          if (!result.ok) {
            expect(result.code).toBeGreaterThanOrEqual(1000);
          }
        }
      ),
      { numRuns: 300 }
    );
  });

  it('non-object / malformed input returns protocol error (never throws)', () => {
    const junk: unknown[] = [null, undefined, 42, 'hello', [1, 2, 3], true, Symbol('x')];
    for (const bad of junk) {
      let threw = false;
      try {
        parseClientMessage(bad);
      } catch {
        threw = true;
      }
      expect(threw).toBe(false); // parseClientMessage never throws
      const result = parseClientMessage(bad);
      expect(result.ok).toBe(false);
      expect(result.code).toBe(WS_CLOSE_CODES.PROTOCOL_ERROR);
    }
  });

  it('validateMessage accepts valid and rejects invalid', () => {
    const valid = { v: 1, type: 'join', payload: { roomId: 'x' } };
    const r1 = validateMessage(valid);
    expect(r1.valid).toBe(true);

    const r2 = validateMessage({ v: 999, type: 'join', payload: {} });
    expect(r2.valid).toBe(false);
    expect(r2.code).toBe(WS_CLOSE_CODES.PROTOCOL_ERROR);

    // non-object → protocol error
    expect(validateMessage(null).valid).toBe(false);
    expect(validateMessage('nope').valid).toBe(false);
    expect(validateMessage([1, 2]).valid).toBe(false);

    // unknown type → protocol error
    const r3 = validateMessage({ v: 1, type: 'bogus', payload: {} });
    expect(r3.valid).toBe(false);
    expect(r3.code).toBe(WS_CLOSE_CODES.PROTOCOL_ERROR);

    // invalid input payload → invalid payload (1007)
    const r4 = validateMessage({ v: 1, type: 'input', payload: { seq: 'not-a-number' } });
    expect(r4.valid).toBe(false);
    expect(r4.code).toBe(WS_CLOSE_CODES.INVALID_PAYLOAD);

    // valid input
    const r5 = validateMessage({ v: 1, type: 'input', payload: { seq: 5, tick: 10, thrust: true } });
    expect(r5.valid).toBe(true);

    // other valid message types
    expect(validateMessage({ v: 1, type: 'chat', payload: { text: 'hi' } }).valid).toBe(true);
    expect(validateMessage({ v: 1, type: 'ping' }).valid).toBe(true);
    expect(validateMessage({ v: 1, type: 'leave', payload: { roomId: 'x' } }).valid).toBe(true);
    expect(validateMessage({ v: 1, type: 'set_codec', payload: { codec: 'binary' } }).valid).toBe(true);
  });

  it('parseServerMessage accepts valid and rejects invalid', () => {
    const ok = parseServerMessage({ v: 1, type: 'pong', payload: { clientTime: 1, serverTime: 2 } });
    expect(ok.ok).toBe(true);
    const bad = parseServerMessage({ v: 999, type: 'snapshot', payload: {} });
    expect(bad.ok).toBe(false);
    const notObj = parseServerMessage('nope');
    expect(notObj.ok).toBe(false);
  });
});
