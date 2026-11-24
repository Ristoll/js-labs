/**
 * ============================================================================
 * BINARY PROTOCOL SPECIFICATION (Version 1) - Little-Endian Everywhere
 * ============================================================================
 *
 * All multi-byte numbers (Uint16, Int16, Uint32, Float32, Float64) are encoded
 * explicitly in LITTLE-ENDIAN byte order (DataView.*(offset, value, true)).
 *
 * ----------------------------------------------------------------------------
 * 1. MESSAGE HEADER (All Messages)
 * ----------------------------------------------------------------------------
 * Offset | Type   | Description
 * -------+--------+-----------------------------------------------------------
 * 0      | Uint8  | Message Type (1 = INPUT, 2 = SNAPSHOT, 255 = GENERIC_JSON)
 * 1      | Uint8  | Protocol Version (1)
 *
 * ----------------------------------------------------------------------------
 * 2. INPUT MESSAGE (Type = 0x01) - Fixed 13 Bytes
 * ----------------------------------------------------------------------------
 * Offset | Type   | Description
 * -------+--------+-----------------------------------------------------------
 * 0      | Uint8  | Message Type = 0x01
 * 1      | Uint8  | Protocol Version = 0x01
 * 2..5   | Uint32 | Sequence number (seq) [little-endian]
 * 6..9   | Uint32 | Current client tick estimation (tick) [little-endian]
 * 10     | Uint8  | Input Flags bitmask:
 *        |        |   bit 0 (0x01): thrust (1=true, 0=false)
 *        |        |   bit 1 (0x02): reverse (1=true, 0=false)
 *        |        |   bit 2 (0x04): fire (1=true, 0=false)
 * 11..12 | Int16  | Turn input: quantized as Math.round(turn * 10000) [little-endian]
 *        |        |   range [-10000, 10000] representing [-1.0, 1.0]
 *
 * ----------------------------------------------------------------------------
 * 3. SNAPSHOT MESSAGE (Type = 0x02) - Variable Length
 * ----------------------------------------------------------------------------
 * Offset | Type   | Description
 * -------+--------+-----------------------------------------------------------
 * 0      | Uint8  | Message Type = 0x02
 * 1      | Uint8  | Protocol Version = 0x01
 * 2..5   | Uint32 | Authoritative Server Tick (tick) [little-endian]
 * 6..13  | Float64| Server Timestamp in ms (serverTime) [little-endian]
 * 14..15 | Uint16 | ACK Count (number of player acknowledgment entries) [little-endian]
 *
 * For each ACK entry (i in [0, ACK Count - 1]):
 *   Offset | Type   | Description
 *   -------+--------+---------------------------------------------------------
 *   0      | Uint8  | Player ID byte length (L)
 *   1..L   | Uint8[]| Player ID UTF-8 string bytes
 *   L+1..4 | Uint32 | Last processed input sequence for this player (seq) [little-endian]
 *
 * Immediately following ACK entries:
 *   Offset | Type   | Description
 *   -------+--------+---------------------------------------------------------
 *   0..1   | Uint16 | Entity Count (N) [little-endian]
 *
 * For each Entity (j in [0, Entity Count - 1]):
 *   Base Entity Block (23 Bytes):
 *   Offset | Type   | Description
 *   -------+--------+---------------------------------------------------------
 *   0..1   | Uint16 | Entity ID [little-endian]
 *   2      | Uint8  | Kind Enum:
 *          |        |   1 = 'ship'
 *          |        |   2 = 'bullet'
 *          |        |   3 = 'asteroid'
 *          |        |   4 = 'pickup'
 *   3..6   | Float32| Position X [little-endian]
 *   7..10  | Float32| Position Y [little-endian]
 *   11..14 | Float32| Velocity X [little-endian]
 *   15..18 | Float32| Velocity Y [little-endian]
 *   19..20 | Int16  | Rotation Angle in 1/1000 radians [little-endian]:
 *          |        |   quantized as Math.round(angle * 1000)
 *          |        |   precision: +-0.001 rad (~0.057 deg), < 0.02 px visual error
 *   21     | Uint8  | Collision Radius (Math.round(radius))
 *   22     | Uint8  | Alive flag (1 = alive, 0 = dead)
 *
 *   Kind-Specific Entity Extension:
 *   If Kind == 1 ('ship'):
 *     23     | Uint8  | HP (0..255)
 *     24     | Uint8  | Ship Flags bitmask:
 *            |        |   bit 0 (0x01): thrust
 *            |        |   bit 1 (0x02): reverse
 *     25     | Uint8  | Player ID length (P)
 *     26..P  | Uint8[]| Player ID UTF-8 string bytes
 *
 *   If Kind == 2 ('bullet'):
 *     23..24 | Int16  | Time-to-live (ttl): quantized as Math.round(ttl * 100) [little-endian]
 *     25     | Uint8  | Damage
 *     26     | Uint8  | Owner Player ID length (O)
 *     27..O  | Uint8[]| Owner Player ID UTF-8 string bytes
 *
 *   If Kind == 3 ('asteroid'):
 *     23..24 | Int16  | Angular Velocity: quantized as Math.round(angularVel * 1000) [little-endian]
 *
 *   If Kind == 4 ('pickup'):
 *     23     | Uint8  | Pickup Type string byte length (T)
 *     24..T  | Uint8[]| Pickup Type UTF-8 string bytes (e.g., 'shield', 'rapid-fire')
 * ============================================================================
 */

import { PROTOCOL_VERSION } from '../protocol/index.js';

export const BINARY_MSG_TYPE = Object.freeze({
  INPUT: 0x01,
  SNAPSHOT: 0x02,
  GENERIC_JSON: 0xff,
});

export const BINARY_ENTITY_KIND = Object.freeze({
  SHIP: 1,
  BULLET: 2,
  ASTEROID: 3,
  PICKUP: 4,
});

const KIND_NAME_TO_ID = Object.freeze({
  ship: BINARY_ENTITY_KIND.SHIP,
  bullet: BINARY_ENTITY_KIND.BULLET,
  asteroid: BINARY_ENTITY_KIND.ASTEROID,
  pickup: BINARY_ENTITY_KIND.PICKUP,
});

const KIND_ID_TO_NAME = Object.freeze({
  [BINARY_ENTITY_KIND.SHIP]: 'ship',
  [BINARY_ENTITY_KIND.BULLET]: 'bullet',
  [BINARY_ENTITY_KIND.ASTEROID]: 'asteroid',
  [BINARY_ENTITY_KIND.PICKUP]: 'pickup',
});

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export class BinaryCodec {
  /**
   * Encodes a protocol message into an ArrayBuffer using DataView.
   *
   * @param {object} msg
   * @returns {ArrayBuffer}
   */
  static encode(msg) {
    if (!msg || typeof msg !== 'object') {
      throw new Error('BinaryCodec.encode requires an object message');
    }

    if (msg.type === 'input') {
      return BinaryCodec.encodeInput(msg);
    }

    if (msg.type === 'snapshot') {
      return BinaryCodec.encodeSnapshot(msg);
    }

    // Generic fallback for infrequent messages (join, chat, etc.)
    return BinaryCodec.encodeGeneric(msg);
  }

  /**
   * Encodes an input message into a fixed 13-byte ArrayBuffer.
   *
   * @param {object} msg
   * @returns {ArrayBuffer}
   */
  static encodeInput(msg) {
    const payload = msg.payload || {};
    const buffer = new ArrayBuffer(13);
    const view = new DataView(buffer);

    view.setUint8(0, BINARY_MSG_TYPE.INPUT);
    view.setUint8(1, msg.v || PROTOCOL_VERSION);
    view.setUint32(2, payload.seq || 0, true); // Little-endian
    view.setUint32(6, payload.tick || 0, true); // Little-endian

    let flags = 0;
    if (payload.thrust) flags |= 0x01;
    if (payload.reverse) flags |= 0x02;
    if (payload.fire) flags |= 0x04;
    view.setUint8(10, flags);

    const clampedTurn = Math.max(-1, Math.min(1, Number(payload.turn) || 0));
    const quantizedTurn = Math.round(clampedTurn * 10000);
    view.setInt16(11, quantizedTurn, true); // Little-endian

    return buffer;
  }

  /**
   * Encodes a snapshot message into a compact ArrayBuffer.
   *
   * @param {object} msg
   * @returns {ArrayBuffer}
   */
  static encodeSnapshot(msg) {
    const payload = msg.payload || {};
    const tick = payload.tick || 0;
    const serverTime = payload.serverTime || Date.now();
    const lastProcessedSeq = payload.lastProcessedSeq || {};
    const entities = payload.entities || [];

    // Pre-calculate exact byte size
    const ackEntries = Object.entries(lastProcessedSeq).map(([id, seq]) => {
      const bytes = textEncoder.encode(String(id));
      return { idBytes: bytes, seq: Number(seq) || 0 };
    });

    let byteLength = 16; // 1 msgType + 1 v + 4 tick + 8 serverTime + 2 ackCount
    for (const ack of ackEntries) {
      byteLength += 1 + ack.idBytes.length + 4; // 1 len + string + 4 seq
    }

    byteLength += 2; // entityCount

    const preparedEntities = entities.map((ent) => {
      const kindId = KIND_NAME_TO_ID[ent.kind] || 0;
      let extraBytes = 0;
      let strBytes = null;

      if (kindId === BINARY_ENTITY_KIND.SHIP) {
        strBytes = textEncoder.encode(String(ent.playerId || ''));
        extraBytes = 1 + 1 + 1 + strBytes.length; // hp(1) + flags(1) + pLen(1) + pStr
      } else if (kindId === BINARY_ENTITY_KIND.BULLET) {
        strBytes = textEncoder.encode(String(ent.ownerId || ''));
        extraBytes = 2 + 1 + 1 + strBytes.length; // ttl(2) + damage(1) + oLen(1) + oStr
      } else if (kindId === BINARY_ENTITY_KIND.ASTEROID) {
        extraBytes = 2; // angularVelocity(2)
      } else if (kindId === BINARY_ENTITY_KIND.PICKUP) {
        strBytes = textEncoder.encode(String(ent.type || ''));
        extraBytes = 1 + strBytes.length; // typeLen(1) + typeStr
      }

      byteLength += 23 + extraBytes;
      return { ent, kindId, strBytes };
    });

    const buffer = new ArrayBuffer(byteLength);
    const view = new DataView(buffer);
    const uint8View = new Uint8Array(buffer);

    let offset = 0;
    view.setUint8(offset++, BINARY_MSG_TYPE.SNAPSHOT);
    view.setUint8(offset++, msg.v || PROTOCOL_VERSION);
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

    view.setUint16(offset, preparedEntities.length, true);
    offset += 2;

    for (const { ent, kindId, strBytes } of preparedEntities) {
      view.setUint16(offset, ent.id & 0xffff, true);
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

      // Quantized angle in 1/1000 radians
      const rawAngle = Number(ent.angle) || 0;
      const quantizedAngle = Math.round(rawAngle * 1000);
      view.setInt16(offset, quantizedAngle, true);
      offset += 2;

      view.setUint8(offset++, Math.max(0, Math.min(255, Math.round(ent.radius || 10))));
      view.setUint8(offset++, ent.alive ? 1 : 0);

      if (kindId === BINARY_ENTITY_KIND.SHIP) {
        view.setUint8(offset++, Math.max(0, Math.min(255, ent.hp ?? 3)));
        let shipFlags = 0;
        if (ent.thrust) shipFlags |= 0x01;
        if (ent.reverse) shipFlags |= 0x02;
        view.setUint8(offset++, shipFlags);

        const pLen = Math.min(255, strBytes.length);
        view.setUint8(offset++, pLen);
        uint8View.set(strBytes.subarray(0, pLen), offset);
        offset += pLen;
      } else if (kindId === BINARY_ENTITY_KIND.BULLET) {
        const ttlQuantized = Math.round((Number(ent.ttl) || 0) * 100);
        view.setInt16(offset, ttlQuantized, true);
        offset += 2;
        view.setUint8(offset++, Math.max(0, Math.min(255, ent.damage ?? 1)));

        const oLen = Math.min(255, strBytes.length);
        view.setUint8(offset++, oLen);
        uint8View.set(strBytes.subarray(0, oLen), offset);
        offset += oLen;
      } else if (kindId === BINARY_ENTITY_KIND.ASTEROID) {
        const angVelQuantized = Math.round((Number(ent.angularVelocity) || 0) * 1000);
        view.setInt16(offset, angVelQuantized, true);
        offset += 2;
      } else if (kindId === BINARY_ENTITY_KIND.PICKUP) {
        const tLen = Math.min(255, strBytes.length);
        view.setUint8(offset++, tLen);
        uint8View.set(strBytes.subarray(0, tLen), offset);
        offset += tLen;
      }
    }

    return buffer;
  }

  /**
   * Encodes non-gameplay messages (join, chat, etc.) as a binary UTF-8 JSON envelope.
   *
   * @param {object} msg
   * @returns {ArrayBuffer}
   */
  static encodeGeneric(msg) {
    const jsonStr = JSON.stringify(msg);
    const jsonBytes = textEncoder.encode(jsonStr);
    const buffer = new ArrayBuffer(2 + jsonBytes.length);
    const view = new DataView(buffer);
    view.setUint8(0, BINARY_MSG_TYPE.GENERIC_JSON);
    view.setUint8(1, msg.v || PROTOCOL_VERSION);
    new Uint8Array(buffer, 2).set(jsonBytes);
    return buffer;
  }

  /**
   * Decodes an ArrayBuffer or TypedArray/Buffer into a protocol message object.
   *
   * @param {ArrayBuffer | ArrayBufferView | string} data
   * @returns {object}
   */
  static decode(data) {
    if (typeof data === 'string') {
      return JSON.parse(data);
    }

    let buffer;
    let byteOffset;
    let byteLength;

    if (data instanceof ArrayBuffer) {
      buffer = data;
      byteOffset = 0;
      byteLength = data.byteLength;
    } else if (ArrayBuffer.isView(data)) {
      buffer = data.buffer;
      byteOffset = data.byteOffset;
      byteLength = data.byteLength;
    } else {
      return JSON.parse(String(data));
    }

    if (byteLength < 2) {
      throw new Error('BinaryCodec.decode: payload too short');
    }

    const view = new DataView(buffer, byteOffset, byteLength);
    const msgType = view.getUint8(0);
    const version = view.getUint8(1);

    if (msgType === BINARY_MSG_TYPE.INPUT) {
      if (byteLength < 13) {
        throw new Error('BinaryCodec.decode: malformed input packet (expected 13 bytes)');
      }

      const seq = view.getUint32(2, true);
      const tick = view.getUint32(6, true);
      const flags = view.getUint8(10);
      const turnRaw = view.getInt16(11, true);

      return {
        v: version,
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

    if (msgType === BINARY_MSG_TYPE.SNAPSHOT) {
      const tick = view.getUint32(2, true);
      const serverTime = view.getFloat64(6, true);
      const ackCount = view.getUint16(14, true);

      let offset = 16;
      const lastProcessedSeq = {};

      for (let i = 0; i < ackCount; i++) {
        const idLen = view.getUint8(offset++);
        const idBytes = new Uint8Array(buffer, byteOffset + offset, idLen);
        const playerId = textDecoder.decode(idBytes);
        offset += idLen;
        const seq = view.getUint32(offset, true);
        offset += 4;
        lastProcessedSeq[playerId] = seq;
      }

      const entityCount = view.getUint16(offset, true);
      offset += 2;
      const entities = [];

      for (let j = 0; j < entityCount; j++) {
        const id = view.getUint16(offset, true);
        offset += 2;
        const kindId = view.getUint8(offset++);
        const kind = KIND_ID_TO_NAME[kindId] || 'entity';

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

        const ent = {
          id,
          kind,
          x,
          y,
          vx,
          vy,
          angle,
          radius,
          alive,
        };

        if (kindId === BINARY_ENTITY_KIND.SHIP) {
          ent.hp = view.getUint8(offset++);
          const shipFlags = view.getUint8(offset++);
          ent.thrust = Boolean(shipFlags & 0x01);
          ent.reverse = Boolean(shipFlags & 0x02);

          const pLen = view.getUint8(offset++);
          const pBytes = new Uint8Array(buffer, byteOffset + offset, pLen);
          ent.playerId = textDecoder.decode(pBytes);
          offset += pLen;
        } else if (kindId === BINARY_ENTITY_KIND.BULLET) {
          const ttlQuantized = view.getInt16(offset, true);
          offset += 2;
          ent.ttl = Number((ttlQuantized / 100).toFixed(2));
          ent.damage = view.getUint8(offset++);

          const oLen = view.getUint8(offset++);
          const oBytes = new Uint8Array(buffer, byteOffset + offset, oLen);
          ent.ownerId = textDecoder.decode(oBytes);
          offset += oLen;
        } else if (kindId === BINARY_ENTITY_KIND.ASTEROID) {
          const angVelQuantized = view.getInt16(offset, true);
          offset += 2;
          ent.angularVelocity = Number((angVelQuantized / 1000).toFixed(4));
        } else if (kindId === BINARY_ENTITY_KIND.PICKUP) {
          const tLen = view.getUint8(offset++);
          const tBytes = new Uint8Array(buffer, byteOffset + offset, tLen);
          ent.type = textDecoder.decode(tBytes);
          offset += tLen;
        }

        entities.push(ent);
      }

      return {
        v: version,
        type: 'snapshot',
        payload: {
          tick,
          serverTime,
          lastProcessedSeq,
          entities,
        },
      };
    }

    if (msgType === BINARY_MSG_TYPE.GENERIC_JSON) {
      const jsonBytes = new Uint8Array(buffer, byteOffset + 2, byteLength - 2);
      const jsonStr = textDecoder.decode(jsonBytes);
      return JSON.parse(jsonStr);
    }

    // Fallback: decode as UTF-8 string and JSON parse
    const text = textDecoder.decode(new Uint8Array(buffer, byteOffset, byteLength));
    return JSON.parse(text);
  }
}
