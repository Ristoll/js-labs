/**
 * Serialization codecs for Lab 05.
 * Milestone 1 introduced JsonCodec.
 * Milestone 4 introduces high-performance DataView BinaryCodec.
 */
import { BinaryCodec, BINARY_MSG_TYPE, BINARY_ENTITY_KIND } from './binary.js';

export class JsonCodec {
  static encode(message) {
    return JSON.stringify(message);
  }

  static decode(data) {
    if (typeof data === 'string') {
      return JSON.parse(data);
    }
    if (data instanceof ArrayBuffer) {
      const text = new TextDecoder().decode(data);
      return JSON.parse(text);
    }
    if (ArrayBuffer.isView(data)) {
      const text = new TextDecoder().decode(data);
      return JSON.parse(text);
    }
    // Node.js Buffer or raw string
    return JSON.parse(String(data));
  }
}

export { BinaryCodec, BINARY_MSG_TYPE, BINARY_ENTITY_KIND };
export const defaultCodec = BinaryCodec;
