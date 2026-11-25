import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { BinaryCodec, JsonCodec, BINARY_MSG_TYPE } from '../src/codec/index.ts';
import { PROTOCOL_VERSION } from '../src/protocol/index.ts';

const genInputArb = fc.tuple(
  fc.integer({ min: 0, max: 1_000_000 }), // seq
  fc.integer({ min: 0, max: 10_000 }), // tick
  fc.boolean(), // thrust
  fc.boolean(), // reverse
  fc.boolean(), // fire
  fc.float({ min: -1, max: 1 }), // turn
).map(([seq, tick, thrust, reverse, fire, turn]) => ({
  v: PROTOCOL_VERSION,
  type: 'input' as const,
  payload: { seq, tick, thrust, reverse, fire, turn: (Object.is(turn, -0) || Number.isNaN(turn)) ? 0 : turn },
}));

describe('codec properties', () => {
  it('binary input round-trip preserves fields within tolerance', () => {
    fc.assert(
      fc.property(genInputArb, (msg) => {
        const encoded = BinaryCodec.encode(msg);
        expect(encoded).toBeInstanceOf(ArrayBuffer);
        expect(encoded.byteLength).toBe(13);

        const view = new DataView(encoded);
        expect(view.getUint8(0)).toBe(BINARY_MSG_TYPE.INPUT);
        expect(view.getUint8(1)).toBe(PROTOCOL_VERSION);
        expect(view.getUint32(2, true)).toBe(msg.payload.seq);
        expect(view.getUint32(6, true)).toBe(msg.payload.tick);

        const decoded = BinaryCodec.decode(encoded) as {
          v: number;
          type: string;
          payload: { seq: number; tick: number; thrust: boolean; reverse: boolean; fire: boolean; turn: number };
        };
        expect(decoded.v).toBe(PROTOCOL_VERSION);
        expect(decoded.type).toBe('input');
        expect(decoded.payload.seq).toBe(msg.payload.seq);
        expect(decoded.payload.tick).toBe(msg.payload.tick);
        expect(decoded.payload.thrust).toBe(msg.payload.thrust);
        expect(decoded.payload.reverse).toBe(msg.payload.reverse);
        expect(decoded.payload.fire).toBe(msg.payload.fire);
        expect(Math.abs(decoded.payload.turn - msg.payload.turn)).toBeLessThan(0.0002);
      }),
      { numRuns: 200 }
    );
  });

  it('binary input packet is exactly 13 bytes', () => {
    fc.assert(
      fc.property(genInputArb, (msg) => {
        expect(BinaryCodec.encode(msg).byteLength).toBe(13);
      }),
      { numRuns: 100 }
    );
  });

  it('garbage buffers throw typed Error, never crash', () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 0, maxLength: 64 }), (buf) => {
        let threw = false;
        let result: unknown = null;
        try {
          result = BinaryCodec.decode(buf);
        } catch (err) {
          threw = true;
          expect(err).toBeInstanceOf(Error);
        }
        if (!threw) {
          expect(result).toBeTruthy();
        }
      }),
      { numRuns: 200 }
    );

    // Explicitly short buffers hit the length guard
    expect(() => BinaryCodec.decode(new ArrayBuffer(0))).toThrow();
    expect(() => BinaryCodec.decode(new DataView(new ArrayBuffer(1)))).toThrow();

    // Wrong protocol version byte hits the version guard
    expect(() => BinaryCodec.decode(new ArrayBuffer(2))).toThrow(/Unsupported protocol version/);
    expect(() =>
      BinaryCodec.encode({ v: 999, type: 'input', payload: { seq: 1 } } as any),
    ).toThrow(/Unsupported protocol version/);
  });

  it('json round-trip preserves message exactly', () => {
    fc.assert(
      fc.property(genInputArb, (msg) => {
        const encoded = JsonCodec.encode(msg);
        const decoded = JsonCodec.decode(encoded);
        expect(decoded).toEqual(msg);
      }),
      { numRuns: 200 }
    );
  });

  it('binary snapshot is more compact than json', () => {
    const snapshot = {
      v: PROTOCOL_VERSION,
      type: 'snapshot',
      payload: {
        tick: 500,
        serverTime: 1711234567890,
        lastProcessedSeq: { p1: 10, p2: 12 },
        entities: [
          { id: 1, kind: 'ship', x: 200, y: 300, vx: 50, vy: 10, angle: 1.2, radius: 16, alive: true, hp: 3, thrust: true, reverse: false, playerId: 'p1' },
          { id: 2, kind: 'asteroid', x: 100, y: 100, vx: 5, vy: 5, angle: 0.1, radius: 25, alive: true, angularVelocity: 0.2 },
        ],
      },
    };
    const jsonBytes = Buffer.byteLength(JsonCodec.encode(snapshot));
    const binaryBytes = BinaryCodec.encode(snapshot).byteLength;
    expect(binaryBytes).toBeLessThan(jsonBytes * 0.3);
  });
});
