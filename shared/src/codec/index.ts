/**
 * shared/src/codec/index.ts
 * Codec interface with JSON and binary implementations (Lab 06 M2).
 */
import { BinaryCodec, BINARY_MSG_TYPE, BINARY_ENTITY_KIND } from './binary.ts';
import type { Codec } from './binary.ts';

export type { Codec };

export class JsonCodec implements Codec {
  static encode(message: unknown): string {
    return JSON.stringify(message);
  }

  static decode(data: unknown): unknown {
    if (typeof data === 'string') {
      return JSON.parse(data);
    }
    if (data instanceof ArrayBuffer) {
      return JSON.parse(new TextDecoder().decode(data));
    }
    if (ArrayBuffer.isView(data)) {
      return JSON.parse(new TextDecoder().decode(data));
    }
    return JSON.parse(String(data));
  }

  encode(message: unknown): string | ArrayBuffer {
    return JsonCodec.encode(message);
  }

  decode(data: string | ArrayBuffer): unknown {
    return JsonCodec.decode(data);
  }
}

export const defaultCodec: Codec = new BinaryCodec();

export { BinaryCodec, BINARY_MSG_TYPE, BINARY_ENTITY_KIND };
