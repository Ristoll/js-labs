import { Transform, pipeline } from 'node:stream';
import fs from 'node:fs';

/**
 * Object-mode Transform stream:
 * Takes JavaScript event objects and serializes them into NDJSON lines.
 */
export class MatchLogTransform extends Transform {
  constructor(options = {}) {
    super({ ...options, objectMode: true });
    this.roomId = options.roomId || 'unknown';
  }

  _transform(chunk, encoding, callback) {
    try {
      const line = JSON.stringify(chunk) + '\n';
      callback(null, line);
    } catch (err) {
      callback(err);
    }
  }
}

/**
 * Parses NDJSON stream into JSON array or stream.
 */
export class NDJSONParserTransform extends Transform {
  constructor(options = {}) {
    super({ ...options, objectMode: true });
    this._buffer = '';
  }

  _transform(chunk, encoding, callback) {
    this._buffer += chunk.toString();
    const lines = this._buffer.split('\n');
    this._buffer = lines.pop(); // keep last incomplete line

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed) {
        try {
          this.push(JSON.parse(trimmed));
        } catch (err) {
          return callback(err);
        }
      }
    }
    callback();
  }

  _flush(callback) {
    const trimmed = this._buffer.trim();
    if (trimmed) {
      try {
        this.push(JSON.parse(trimmed));
      } catch (err) {
        return callback(err);
      }
    }
    callback();
  }
}

/**
 * Helper to stream an existing match log file to an HTTP response with backpressure.
 */
export function streamReplayFile(filePath, res, onDisconnect) {
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
