import { Transform, pipeline } from 'node:stream';
import fs from 'node:fs';
import type { ServerResponse } from 'node:http';

export interface MatchLogEvent {
  readonly type: string;
  readonly timestamp: number;
  readonly data: Record<string, unknown>;
}

function asError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

/**
 * Object-mode Transform stream:
 * Takes JavaScript event objects and serializes them into NDJSON lines.
 */
export class MatchLogTransform extends Transform {
  readonly roomId: string;

  constructor(options: { roomId?: string } = {}) {
    super({ ...options, objectMode: true });
    this.roomId = options.roomId ?? 'unknown';
  }

  override _transform(chunk: Buffer | string, encoding: BufferEncoding, callback: (err?: Error | null, data?: unknown) => void): void {
    try {
      const line = JSON.stringify(chunk) + '\n';
      callback(null, line);
    } catch (err) {
      callback(asError(err));
    }
  }
}

/**
 * Parses NDJSON stream into JSON array or stream.
 */
export class NDJSONParserTransform extends Transform {
  private _buffer = '';

  constructor(options = {}) {
    super({ ...options, objectMode: true });
  }

  override _transform(chunk: Buffer | string, encoding: BufferEncoding, callback: (err?: Error | null) => void): void {
    this._buffer += chunk.toString();
    const lines = this._buffer.split('\n');
    this._buffer = lines.pop() ?? ''; // keep last incomplete line

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed) {
        try {
          this.push(JSON.parse(trimmed));
        } catch (err) {
          return callback(asError(err));
        }
      }
    }
    callback();
  }

  override _flush(callback: (err?: Error | null) => void): void {
    const trimmed = this._buffer.trim();
    if (trimmed) {
      try {
        this.push(JSON.parse(trimmed));
      } catch (err) {
        return callback(asError(err));
      }
    }
    callback();
  }
}

/**
 * Helper to stream an existing match log file to an HTTP response with backpressure.
 */
export function streamReplayFile(filePath: string, res: ServerResponse, onDisconnect?: () => void): void {
  const readStream = fs.createReadStream(filePath, { highWaterMark: 64 * 1024 });

  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');

  // Handle client disconnection / abort
  res.on('close', () => {
    if (!res.writableEnded) {
      readStream.destroy();
      if (onDisconnect) onDisconnect();
    }
  });

  pipeline(readStream, res, (err) => {
    if (err && err.code !== 'ERR_STREAM_PREMATURE_CLOSE') {
      console.error('[ReplayStream] Pipeline error:', err);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Stream error' }));
      }
    }
  });
}
