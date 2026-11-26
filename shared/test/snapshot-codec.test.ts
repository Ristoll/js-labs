import { describe, expect, it } from 'vitest';
import { BinaryCodec, BINARY_MSG_TYPE, BINARY_ENTITY_KIND } from '../src/codec/index.ts';
import { PROTOCOL_VERSION } from '../src/protocol/index.ts';

function makeSnapshot(entities: any[]) {
  return {
    v: PROTOCOL_VERSION,
    type: 'snapshot',
    payload: {
      tick: 1042,
      serverTime: 1711234567890,
      lastProcessedSeq: { 'player-alpha': 105 },
      entities,
    },
  };
}

describe('BinaryCodec snapshot decode (all entity kinds)', () => {
  it('decodes ship, bullet, asteroid, pickup entities', () => {
    const msg = makeSnapshot([
      {
        id: 1, kind: 'ship', x: 450.25, y: 300.5, vx: 120.4, vy: -35.2, angle: 1.5708,
        radius: 16, alive: true, hp: 2, thrust: true, reverse: false, playerId: 'player-alpha',
      },
      {
        id: 2, kind: 'bullet', x: 480.1, y: 310.2, vx: 400, vy: 0, angle: 0,
        radius: 3, alive: true, ttl: 1.25, damage: 1, ownerId: 'player-alpha',
      },
      {
        id: 3, kind: 'asteroid', x: 700, y: 200, vx: -15.5, vy: 20, angle: -2.3561,
        radius: 25, alive: true, angularVelocity: 0.45,
      },
      {
        id: 4, kind: 'pickup', x: 150, y: 600, vx: 0, vy: 0, angle: 0.5,
        radius: 12, alive: true, type: 'shield',
      },
    ]);

    const encoded = BinaryCodec.encode(msg);
    expect(encoded).toBeInstanceOf(ArrayBuffer);
    const view = new DataView(encoded);
    expect(view.getUint8(0)).toBe(BINARY_MSG_TYPE.SNAPSHOT);
    expect(view.getUint8(1)).toBe(PROTOCOL_VERSION);

    const decoded = BinaryCodec.decode(encoded) as any;
    expect(decoded.v).toBe(PROTOCOL_VERSION);
    expect(decoded.type).toBe('snapshot');
    expect(decoded.payload.tick).toBe(1042);
    expect(decoded.payload.lastProcessedSeq['player-alpha']).toBe(105);
    expect(decoded.payload.entities.length).toBe(4);

    const byId = new Map(decoded.payload.entities.map((e: any) => [e.id, e]));
    const ship = byId.get(1);
    expect(ship.kind).toBe('ship');
    expect(ship.hp).toBe(2);
    expect(ship.playerId).toBe('player-alpha');

    const bullet = byId.get(2);
    expect(bullet.kind).toBe('bullet');
    expect(bullet.ttl).toBeCloseTo(1.25, 1);
    expect(bullet.damage).toBe(1);

    const asteroid = byId.get(3);
    expect(asteroid.kind).toBe('asteroid');
    expect(asteroid.angularVelocity).toBeCloseTo(0.45, 1);

    const pickup = byId.get(4);
    expect(pickup.kind).toBe('pickup');
    expect(pickup.type).toBe('shield');
  });

  it('encodes a generic JSON message and decodes strings', () => {
    const generic = { v: PROTOCOL_VERSION, type: 'chat', payload: { text: 'hi' } };
    const encoded = BinaryCodec.encode(generic);
    expect(encoded).toBeInstanceOf(ArrayBuffer);
    const view = new DataView(encoded);
    expect(view.getUint8(0)).toBe(BINARY_MSG_TYPE.GENERIC_JSON);
    expect(view.getUint8(1)).toBe(PROTOCOL_VERSION);

    // decode a JSON string via the instance decoder
    const decoded = (new BinaryCodec()).decode(JSON.stringify(generic)) as any;
    expect(decoded.type).toBe('chat');
  });

  it('instance encode / decode paths work', () => {
    const msg = { v: PROTOCOL_VERSION, type: 'ping' };
    const encoded = (new BinaryCodec()).encode(msg);
    expect(encoded).toBeInstanceOf(ArrayBuffer);
    const decoded = (new BinaryCodec()).decode(encoded) as any;
    expect(decoded.type).toBe('ping');
  });
});
