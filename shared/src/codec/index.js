/**
 * Serialization codec.
 * Milestone 1 uses JSON encoding/decoding.
 * Milestone 4 will add binary DataView codec.
 */
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

export const defaultCodec = JsonCodec;
