import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { streamReplayFile } from './streams.js';

/**
 * Handles all /api/* HTTP endpoints.
 */
export async function handleApi(req, res, roomManager, config) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const { pathname } = url;
  const method = req.method.toUpperCase();

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
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status: 'ok',
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        timestamp: Date.now(),
      })
    );
    return;
  }

  // 1b. GET /api/stats
  if ((pathname === '/api/stats' || pathname === '/api/stats.json') && method === 'GET') {
    const matches = Array.from(roomManager.rooms.values())
      .map((r) => (r.match ? r.match.getStats() : null))
      .filter(Boolean);

    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-cache, no-store',
    });
    res.end(
      JSON.stringify({
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        totalRooms: roomManager.rooms.size,
        matches,
      })
    );
    return;
  }

  // 2. GET /api/rooms
  if (pathname === '/api/rooms' && method === 'GET') {
    const rooms = roomManager.listRooms();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(rooms));
    return;
  }

  // Also support /api/rooms.json for backwards compatibility with client
  if (pathname === '/api/rooms.json' && method === 'GET') {
    const rooms = roomManager.listRooms();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(rooms));
    return;
  }

  // 3. POST /api/rooms
  if (pathname === '/api/rooms' && method === 'POST') {
    let bodyStr = '';
    let bodySize = 0;
    let isPayloadTooLarge = false;

    req.on('data', (chunk) => {
      if (isPayloadTooLarge) return;
      bodySize += chunk.length;
      if (bodySize > config.maxPayloadSize) {
        isPayloadTooLarge = true;
        if (!res.headersSent) {
          res.writeHead(413, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Payload Too Large' }));
        }
        // Destroy the request stream after sending the 413 response
        req.destroy();
        return;
      }
      bodyStr += chunk;
    });

    req.on('end', () => {
      if (isPayloadTooLarge || res.writableEnded) return;

      let body;
      try {
        body = bodyStr ? JSON.parse(bodyStr) : {};
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON body' }));
        return;
      }

      // Validation
      if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing or invalid required field: name' }));
        return;
      }

      const maxPlayers = body.maxPlayers ? parseInt(body.maxPlayers, 10) : config.maxPlayersPerRoom;
      if (isNaN(maxPlayers) || maxPlayers < 1 || maxPlayers > 32) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid maxPlayers (must be between 1 and 32)' }));
        return;
      }

      try {
        const room = roomManager.createRoom({
          id: body.id,
          name: body.name.trim(),
          maxPlayers,
        });
        res.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(room.toJSON()));
      } catch (err) {
        res.writeHead(409, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });

    req.on('error', (err) => {
      if (!res.headersSent) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 4. GET /api/replays/:id
  const replayMatch = pathname.match(/^\/api\/replays\/([^/]+)$/);
  if (replayMatch && method === 'GET') {
    const replayId = decodeURIComponent(replayMatch[1]);
    // Path traversal check on replayId
    if (replayId.includes('..') || replayId.includes('/') || replayId.includes('\\')) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Forbidden: Invalid replay ID' }));
      return;
    }

    const filename = replayId.endsWith('.ndjson') ? replayId : `${replayId}.ndjson`;
    const filePath = path.join(config.replaysDir, filename);

    if (!fs.existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Replay not found' }));
      return;
    }

    streamReplayFile(filePath, res);
    return;
  }

  // 5. GET /api/slow (deliberate 300ms blocking CPU operation)
  if (pathname === '/api/slow' && method === 'GET') {
    const start = Date.now();
    // Synchronously block the event loop for 300ms
    while (Date.now() - start < 300) {
      // Busy wait
    }
    const elapsed = Date.now() - start;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Blocked event loop', elapsedMs: elapsed }));
    return;
  }

  // Not an API route or method not allowed
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'API route not found' }));
}
