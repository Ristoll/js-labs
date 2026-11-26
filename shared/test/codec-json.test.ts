import { describe, expect, it } from 'vitest';
import { JsonCodec } from '../src/codec/index.ts';

describe('JsonCodec', () => {
  it('encode / decode a JSON message round-trips', () => {
    const msg = { v: 1, type: 'join', payload: { roomId: 'sector', playerName: 'Pilot' } };
    const encoded = JsonCodec.encode(msg);
    expect(typeof encoded).toBe('string');
    const decoded = JsonCodec.decode(encoded);
    expect(decoded).toEqual(msg);
  });

  it('decode accepts an ArrayBuffer', () => {
    const msg = { v: 1, type: 'ping' };
    const encoded = JsonCodec.encode(msg);
    const ab = new TextEncoder().encode(encoded).buffer as ArrayBuffer;
    const decoded = JsonCodec.decode(ab);
    expect(decoded).toEqual(msg);
  });

  it('decode accepts an ArrayBufferView', () => {
    const msg = { v: 1, type: 'ping' };
    const encoded = JsonCodec.encode(msg);
    const view = new TextEncoder().encode(encoded);
    const decoded = JsonCodec.decode(view);
    expect(decoded).toEqual(msg);
  });

  it('decode throws on invalid JSON', () => {
    expect(() => JsonCodec.decode('{not json')).toThrow();
  });
});
