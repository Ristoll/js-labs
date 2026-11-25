import fs from 'node:fs';
import path from 'node:path';
import { streamReplayFile } from './streams.ts';
import type { ServerResponse, IncomingMessage } from 'node:http';
import type { RoomManager } from './room-manager.ts';
import type { ServerConfig } from './config.ts';

export interface ApiErrorBody {
  error: string;
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function writeJson(
  res: ServerResponse,
  statusCode: number,
  body: unknown,
  extraHeaders: Record<string, string> = {}
): void {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders });
  res.end(JSON.stringify(body));
}

/**
 * Handles all /api/* HTTP endpoints.
 */
export async function handleApi(
  req: IncomingMessage,
  res: ServerResponse,
  roomManager: RoomManager,
  config: ServerConfig
): Promise<void> {
  const url = new URL(req.url ?? '', `http://${req.headers.host ? (Array.isArray(req.headers.host) ? req.headers.host[0] : req.headers.host) : 'localhost'}`);
  const { pathname } = url;
  const method = (req.method ?? 'GET').toUpperCase();

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // 1. GET /health
  if (pathname === '/health' && method === 'GET') {
    writeJson(res, 200, {
      status: 'ok',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: Date.now(),
    });
    return;
  }

  // 1b. GET /api/stats
  if ((pathname === '/api/stats' || pathname === '/api/stats.json') && method === 'GET') {
    const matches = Array.from(roomManager.rooms.values())
      .map((r) => (r.match ? r.match.getStats() : null))
      .filter((m): m is NonNullable<typeof m> => m !== null);

    writeJson(res, 200, {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      totalRooms: roomManager.rooms.size,
      matches,
    }, { 'Cache-Control': 'no-cache, no-store' });
    return;
  }

  // 2. GET /api/rooms
  if (pathname === '/api/rooms' && method === 'GET') {
    const rooms = roomManager.listRooms();
    writeJson(res, 200, { rooms });
    return;
  }

  // Also support /api/rooms.json for backwards compatibility with client
  if (pathname === '/api/rooms.json' && method === 'GET') {
    const rooms = roomManager.listRooms();
    writeJson(res, 200, { rooms });
    return;
  }

  // 3. POST /api/rooms
  if (pathname === '/api/rooms' && method === 'POST') {
    let bodyStr = '';
    let bodySize = 0;
    let isPayloadTooLarge = false;

    req.on('data', (chunk: Buffer) => {
      if (isPayloadTooLarge) return;
      bodySize += chunk.length;
      if (bodySize > config.maxPayloadSize) {
        isPayloadTooLarge = true;
        if (!res.headersSent) {
          writeJson(res, 413, { error: 'Payload Too Large' });
        }
        req.destroy();
        return;
      }
      bodyStr += chunk.toString();
    });

    req.on('end', () => {
      if (isPayloadTooLarge || res.writableEnded) return;

      let body: Record<string, unknown> | null = null;
      try {
        body = bodyStr ? JSON.parse(bodyStr) : {};
      } catch {
        writeJson(res, 400, { error: 'Invalid JSON body' });
        return;
      }

      if (!body || !isString(body.name) || !body.name.trim()) {
        writeJson(res, 400, { error: 'Missing or invalid required field: name' });
        return;
      }

      const maxPlayersRaw = body.maxPlayers;
      let maxPlayers = config.maxPlayersPerRoom;
      if (maxPlayersRaw !== undefined && maxPlayersRaw !== null) {
        const parsed = Number(maxPlayersRaw);
        if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 32) {
          maxPlayers = parsed;
        } else {
          writeJson(res, 400, { error: 'Invalid maxPlayers (must be between 1 and 32)' });
          return;
        }
      }

      try {
        const room = roomManager.createRoom({
          id: isString(body.id) ? body.id : undefined,
          name: body.name.trim(),
          maxPlayers,
        });
        writeJson(res, 201, room.toJSON());
      } catch (err) {
        writeJson(res, 409, { error: err instanceof Error ? err.message : String(err) });
      }
    });

    req.on('error', (err) => {
      if (!res.headersSent) {
        writeJson(res, 400, { error: err instanceof Error ? err.message : String(err) });
      }
    });
    return;
  }

  // 4. GET /api/replays/:id
  const replayMatch = pathname.match(/^\/api\/replays\/([^/]+)$/);
  if (replayMatch && method === 'GET') {
    const replayId = decodeURIComponent(replayMatch[1] ?? '');
    if (replayId.includes('..') || replayId.includes('/') || replayId.includes('\\')) {
      writeJson(res, 403, { error: 'Forbidden: Invalid replay ID' });
      return;
    }

    const filename = replayId.endsWith('.ndjson') ? replayId : `${replayId}.ndjson`;
    const filePath = path.join(config.replaysDir, filename);

    if (!fs.existsSync(filePath)) {
      writeJson(res, 404, { error: 'Replay not found' });
      return;
    }

    streamReplayFile(filePath, res);
    return;
  }

  // 5. GET /api/slow (deliberate 300ms blocking CPU operation)
  if (pathname === '/api/slow' && method === 'GET') {
    const start = Date.now();
    while (Date.now() - start < 300) {
      // Busy wait
    }
    const elapsed = Date.now() - start;
    writeJson(res, 200, { message: 'Blocked event loop', elapsedMs: elapsed });
    return;
  }

  writeJson(res, 404, { error: 'API route not found' });
}
