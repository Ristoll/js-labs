/**
 * shared/src/codec/binary.ts
 * Codec interface + typed binary codec over DataView (Lab 05 M4, Lab 06 M2).
 *
 * Wire format: [msgType:u8][version:u8][payload...]
 * The decoder is the validator: it checks lengths, ranges, and the version
 * byte, returning a typed message or throwing on malformed input.
 */
import { PROTOCOL_VERSION } from '../protocol/index.ts';
import type { AnyMessage } from '../protocol/index.ts';

/** One codec abstraction behind JSON and binary wire formats. */
export interface Codec {
  encode(message: unknown): string | ArrayBuffer;
  decode(data: string | ArrayBuffer): unknown;
}

export const BINARY_MSG_TYPE = Object.freeze({
  INPUT: 0x01,
  SNAPSHOT: 0x02,
  GENERIC_JSON: 0xff,
} as const);

export const BINARY_ENTITY_KIND = Object.freeze({
  SHIP: 1,
  BULLET: 2,
  ASTEROID: 3,
  PICKUP: 4,
} as const);

const KIND_NAME_TO_ID: ReadonlyMap<string, number> = new Map([
  ['ship', BINARY_ENTITY_KIND.SHIP],
  ['bullet', BINARY_ENTITY_KIND.BULLET],
  ['asteroid', BINARY_ENTITY_KIND.ASTEROID],
  ['pickup', BINARY_ENTITY_KIND.PICKUP],
]);

const KIND_ID_TO_NAME: ReadonlyMap<number, string> = new Map([
  [BINARY_ENTITY_KIND.SHIP, 'ship'],
  [BINARY_ENTITY_KIND.BULLET, 'bullet'],
  [BINARY_ENTITY_KIND.ASTEROID, 'asteroid'],
  [BINARY_ENTITY_KIND.PICKUP, 'pickup'],
]);

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

type InputPayload = {
  seq: number;
  tick?: number;
  thrust?: boolean;
  reverse?: boolean;
  turn?: number;
  fire?: boolean;
};

type SnapshotPayload = {
  tick: number;
  serverTime: number;
  lastProcessedSeq: Record<string, number>;
  entities: Array<Record<string, unknown>>;
};

type DecodedMessage = {
  v: number;
  type: 'input' | 'snapshot' | string;
  payload: InputPayload | SnapshotPayload | Record<string, unknown>;
};

function toArrayBuffer(data: ArrayBuffer | ArrayBufferView): ArrayBuffer {
  if (data instanceof ArrayBuffer) {
    return data.slice(0);
  }
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice().buffer;
}

function requireVersion(version: number): void {
  if (version !== PROTOCOL_VERSION) {
    throw new Error(
      `Unsupported protocol version: ${version} (expected ${PROTOCOL_VERSION})`
    );
  }
}

export class BinaryCodec implements Codec {
  static encode(message: AnyMessage): ArrayBuffer {
    const { v } = message;
    requireVersion(v);

    if (message.type === 'input') {
      return BinaryCodec.encodeInput(message);
    }

    if (message.type === 'snapshot') {
      return BinaryCodec.encodeSnapshot(message);
    }

    return BinaryCodec.encodeGeneric(message);
  }

  static decode(data: ArrayBuffer | ArrayBufferView): DecodedMessage {
    const buffer = toArrayBuffer(data);
    const view = new DataView(buffer);
    const byteLength = buffer.byteLength;

    if (byteLength < 2) {
      throw new Error('BinaryCodec.decode: payload too short');
    }

    const msgType = view.getUint8(0);
    const version = view.getUint8(1);
    requireVersion(version);

    if (msgType === BINARY_MSG_TYPE.INPUT) {
      return BinaryCodec.decodeInput(view);
    }

    if (msgType === BINARY_MSG_TYPE.SNAPSHOT) {
      return BinaryCodec.decodeSnapshot(view);
    }

    if (msgType === BINARY_MSG_TYPE.GENERIC_JSON) {
      const jsonBytes = new Uint8Array(buffer, 2, byteLength - 2);
      return JSON.parse(textDecoder.decode(jsonBytes)) as DecodedMessage; // JSON.parse returns any
    }

    throw new Error(`BinaryCodec.decode: unknown message type 0x${msgType.toString(16)}`);
  }

  private static encodeInput(msg: { payload: InputPayload; v: number }): ArrayBuffer {
    const payload = msg.payload;
    const buffer = new ArrayBuffer(13);
    const view = new DataView(buffer);

    view.setUint8(0, BINARY_MSG_TYPE.INPUT);
    view.setUint8(1, msg.v);
    view.setUint32(2, payload.seq || 0, true);
    view.setUint32(6, payload.tick || 0, true);

    let flags = 0;
    if (payload.thrust) flags |= 0x01;
    if (payload.reverse) flags |= 0x02;
    if (payload.fire) flags |= 0x04;
    view.setUint8(10, flags);

    const clampedTurn = Math.max(-1, Math.min(1, Number(payload.turn) || 0));
    const quantizedTurn = Math.round(clampedTurn * 10000);
    view.setInt16(11, quantizedTurn, true);

    return buffer;
  }

  private static encodeSnapshot(msg: { payload: SnapshotPayload; v: number }): ArrayBuffer {
    const payload = msg.payload;
    const tick = payload.tick || 0;
    const serverTime = payload.serverTime || Date.now();
    const lastProcessedSeq = payload.lastProcessedSeq || {};
    const entities = payload.entities || [];

    const ackEntries = Object.entries(lastProcessedSeq).map(([id, seq]) => ({
      idBytes: textEncoder.encode(String(id)),
      seq: Number(seq) || 0,
    }));

    let byteLength = 16;
    for (const ack of ackEntries) {
      byteLength += 1 + ack.idBytes.length + 4;
    }
    byteLength += 2;

    const prepared = entities.map((ent) => {
      const kind = String(ent.kind);
      const kindId = KIND_NAME_TO_ID.get(kind) ?? 0;
      let strBytes: Uint8Array | null = null;
      let extraBytes = 0;

      if (kindId === BINARY_ENTITY_KIND.SHIP) {
        strBytes = textEncoder.encode(String(ent.playerId ?? ''));
        extraBytes = 1 + 1 + 1 + strBytes.length;
      } else if (kindId === BINARY_ENTITY_KIND.BULLET) {
        strBytes = textEncoder.encode(String(ent.ownerId ?? ''));
        extraBytes = 2 + 1 + 1 + strBytes.length;
      } else if (kindId === BINARY_ENTITY_KIND.ASTEROID) {
        extraBytes = 2;
      } else if (kindId === BINARY_ENTITY_KIND.PICKUP) {
        strBytes = textEncoder.encode(String(ent.type ?? ''));
        extraBytes = 1 + strBytes.length;
      }

      byteLength += 23 + extraBytes;
      return { ent, kindId, strBytes };
    });

    const buffer = new ArrayBuffer(byteLength);
    const view = new DataView(buffer);
    const uint8View = new Uint8Array(buffer);

    let offset = 0;
    view.setUint8(offset++, BINARY_MSG_TYPE.SNAPSHOT);
    view.setUint8(offset++, msg.v);
    view.setUint32(offset, tick, true);
    offset += 4;
    view.setFloat64(offset, serverTime, true);
    offset += 8;

    view.setUint16(offset, ackEntries.length, true);
    offset += 2;

    for (const ack of ackEntries) {
      const idLen = Math.min(255, ack.idBytes.length);
      view.setUint8(offset++, idLen);
      uint8View.set(ack.idBytes.subarray(0, idLen), offset);
      offset += idLen;
      view.setUint32(offset, ack.seq, true);
      offset += 4;
    }

    view.setUint16(offset, prepared.length, true);
    offset += 2;

    for (const { ent, kindId, strBytes } of prepared) {
      view.setUint16(offset, Number(ent.id) & 0xffff, true);
      offset += 2;
      view.setUint8(offset++, kindId);
      view.setFloat32(offset, Number(ent.x) || 0, true);
      offset += 4;
      view.setFloat32(offset, Number(ent.y) || 0, true);
      offset += 4;
      view.setFloat32(offset, Number(ent.vx) || 0, true);
      offset += 4;
      view.setFloat32(offset, Number(ent.vy) || 0, true);
      offset += 4;

      const quantizedAngle = Math.round((Number(ent.angle) || 0) * 1000);
      view.setInt16(offset, quantizedAngle, true);
      offset += 2;

      view.setUint8(offset++, Math.max(0, Math.min(255, Math.round(Number(ent.radius) || 10))));
      view.setUint8(offset++, Boolean(ent.alive) ? 1 : 0);

      if (kindId === BINARY_ENTITY_KIND.SHIP) {
        view.setUint8(offset++, Math.max(0, Math.min(255, Number(ent.hp) ?? 3)));
        let shipFlags = 0;
        if (Boolean(ent.thrust)) shipFlags |= 0x01;
        if (Boolean(ent.reverse)) shipFlags |= 0x02;
        view.setUint8(offset++, shipFlags);

        const pLen = Math.min(255, strBytes?.length ?? 0);
        view.setUint8(offset++, pLen);
        if (strBytes) uint8View.set(strBytes.subarray(0, pLen), offset);
        offset += pLen;
      } else if (kindId === BINARY_ENTITY_KIND.BULLET) {
        const ttlQuantized = Math.round((Number(ent.ttl) || 0) * 100);
        view.setInt16(offset, ttlQuantized, true);
        offset += 2;
        view.setUint8(offset++, Math.max(0, Math.min(255, Number(ent.damage) ?? 1)));

        const oLen = Math.min(255, strBytes?.length ?? 0);
        view.setUint8(offset++, oLen);
        if (strBytes) uint8View.set(strBytes.subarray(0, oLen), offset);
        offset += oLen;
      } else if (kindId === BINARY_ENTITY_KIND.ASTEROID) {
        const angVelQuantized = Math.round((Number(ent.angularVelocity) || 0) * 1000);
        view.setInt16(offset, angVelQuantized, true);
        offset += 2;
      } else if (kindId === BINARY_ENTITY_KIND.PICKUP) {
        const tLen = Math.min(255, strBytes?.length ?? 0);
        view.setUint8(offset++, tLen);
        if (strBytes) uint8View.set(strBytes.subarray(0, tLen), offset);
        offset += tLen;
      }
    }

    return buffer;
  }

  private static encodeGeneric(message: AnyMessage): ArrayBuffer {
    const jsonStr = JSON.stringify(message);
    const jsonBytes = textEncoder.encode(jsonStr);
    const buffer = new ArrayBuffer(2 + jsonBytes.length);
    const view = new DataView(buffer);
    view.setUint8(0, BINARY_MSG_TYPE.GENERIC_JSON);
    view.setUint8(1, Number(message.v) || PROTOCOL_VERSION);
    new Uint8Array(buffer, 2).set(jsonBytes);
    return buffer;
  }

  private static decodeInput(view: DataView): DecodedMessage {
    const seq = view.getUint32(2, true);
    const tick = view.getUint32(6, true);
    const flags = view.getUint8(10);
    const turnRaw = view.getInt16(11, true);

    return {
      v: view.getUint8(1),
      type: 'input',
      payload: {
        seq,
        tick,
        thrust: Boolean(flags & 0x01),
        reverse: Boolean(flags & 0x02),
        fire: Boolean(flags & 0x04),
        turn: Number((turnRaw / 10000).toFixed(4)),
      },
    };
  }

  private static decodeSnapshot(view: DataView): DecodedMessage {
    const byteLength = view.buffer.byteLength;
    const tick = view.getUint32(2, true);
    const serverTime = view.getFloat64(6, true);
    const ackCount = view.getUint16(14, true);

    let offset = 16;
    const lastProcessedSeq: Record<string, number> = {};

    for (let i = 0; i < ackCount; i++) {
      if (offset + 1 > byteLength) {
        throw new Error('BinaryCodec.decode: truncated snapshot ACK section');
      }
      const idLen = view.getUint8(offset++);
      if (offset + idLen + 4 > byteLength) {
        throw new Error('BinaryCodec.decode: truncated snapshot ACK entry');
      }
      const idBytes = new Uint8Array(view.buffer, view.byteOffset + offset, idLen);
      const playerId = textDecoder.decode(idBytes);
      offset += idLen;
      const seq = view.getUint32(offset, true);
      offset += 4;
      lastProcessedSeq[playerId] = seq;
    }

    if (offset + 2 > byteLength) {
      throw new Error('BinaryCodec.decode: truncated snapshot entity count');
    }
    const entityCount = view.getUint16(offset, true);
    offset += 2;
    const entities: Record<string, unknown>[] = [];

    for (let j = 0; j < entityCount; j++) {
      if (offset + 23 > byteLength) {
        throw new Error('BinaryCodec.decode: truncated snapshot entity');
      }
      const id = view.getUint16(offset, true);
      offset += 2;
      const kindId = view.getUint8(offset++);
      const kind = KIND_ID_TO_NAME.get(kindId) ?? 'entity';

      const x = Number(view.getFloat32(offset, true).toFixed(2));
      offset += 4;
      const y = Number(view.getFloat32(offset, true).toFixed(2));
      offset += 4;
      const vx = Number(view.getFloat32(offset, true).toFixed(2));
      offset += 4;
      const vy = Number(view.getFloat32(offset, true).toFixed(2));
      offset += 4;

      const quantizedAngle = view.getInt16(offset, true);
      offset += 2;
      const angle = Number((quantizedAngle / 1000).toFixed(4));

      const radius = view.getUint8(offset++);
      const alive = view.getUint8(offset++) === 1;

      const ent: Record<string, unknown> = { id, kind, x, y, vx, vy, angle, radius, alive };

      if (kindId === BINARY_ENTITY_KIND.SHIP) {
        ent.hp = view.getUint8(offset++);
        const shipFlags = view.getUint8(offset++);
        ent.thrust = Boolean(shipFlags & 0x01);
        ent.reverse = Boolean(shipFlags & 0x02);

        const pLen = view.getUint8(offset++);
        const pBytes = new Uint8Array(view.buffer, view.byteOffset + offset, pLen);
        ent.playerId = textDecoder.decode(pBytes);
        offset += pLen;
      } else if (kindId === BINARY_ENTITY_KIND.BULLET) {
        const ttlQuantized = view.getInt16(offset, true);
        offset += 2;
        ent.ttl = Number((ttlQuantized / 100).toFixed(2));
        ent.damage = view.getUint8(offset++);

        const oLen = view.getUint8(offset++);
        const oBytes = new Uint8Array(view.buffer, view.byteOffset + offset, oLen);
        ent.ownerId = textDecoder.decode(oBytes);
        offset += oLen;
      } else if (kindId === BINARY_ENTITY_KIND.ASTEROID) {
        const angVelQuantized = view.getInt16(offset, true);
        offset += 2;
        ent.angularVelocity = Number((angVelQuantized / 1000).toFixed(4));
      } else if (kindId === BINARY_ENTITY_KIND.PICKUP) {
        const tLen = view.getUint8(offset++);
        const tBytes = new Uint8Array(view.buffer, view.byteOffset + offset, tLen);
        ent.type = textDecoder.decode(tBytes);
        offset += tLen;
      }

      entities.push(ent);
    }

    return {
      v: view.getUint8(1),
      type: 'snapshot',
      payload: { tick, serverTime, lastProcessedSeq, entities },
    };
  }

  encode(message: AnyMessage): string | ArrayBuffer {
    return BinaryCodec.encode(message);
  }

  decode(data: string | ArrayBuffer | ArrayBufferView): unknown {
    if (typeof data === 'string') {
      return JSON.parse(data);
    }
    return BinaryCodec.decode(data);
  }
}

export type Snapshot = AnyMessage;
