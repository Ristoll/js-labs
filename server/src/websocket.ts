import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';
import { TokenBucket } from './rate-limiter.ts';
import { parseClientMessage, WS_CLOSE_CODES } from './protocol.ts';
import { BinaryCodec } from 'shared/codec';
import type { RoomManager } from './room-manager.ts';
import type { ServerConfig } from './config.ts';
import type { Server } from 'node:http';
import type { Room } from './room.ts';

interface WsState {
  isAlive: boolean;
  missedPings: number;
  playerId: string | null;
  playerName: string | null;
  joinedRoom: Room | null;
  rateLimiter?: TokenBucket;
  preferredCodec?: 'json' | 'binary' | null;
}

function firstByteOf(data: Buffer | ArrayBuffer | ArrayBufferView): number {
  if (Buffer.isBuffer(data)) {
    return data.length > 0 ? (data[0] ?? 0) : 0;
  }
  if (data instanceof ArrayBuffer) {
    return data.byteLength > 0 ? (new Uint8Array(data)[0] ?? 0) : 0;
  }
  return data.byteLength > 0 ? (new Uint8Array(data.buffer, data.byteOffset, data.byteLength)[0] ?? 0) : 0;
}

export function setupWebSocket(server: Server, roomManager: RoomManager, config: ServerConfig) {
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: config.maxPayloadSize,
  });

  // Per-connection state (kept off the WebSocket object to avoid type augmentation).
  const wsState = new Map<WebSocket, WsState>();

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '', `http://${req.headers.host ? (Array.isArray(req.headers.host) ? req.headers.host[0] : req.headers.host) : 'localhost'}`);
    if (url.pathname === '/ws') {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    } else {
      socket.destroy();
    }
  });

  const heartbeatTimer = setInterval(() => {
    for (const ws of wss.clients) {
      const state = wsState.get(ws);
      if (!state) continue;
      if (state.isAlive === false) {
        state.missedPings += 1;
        if (state.missedPings >= config.heartbeatMaxMissed) {
          console.log(`[WS] Terminating inactive client (${state.playerId ?? 'unauthenticated'})`);
          ws.terminate();
          continue;
        }
      } else {
        state.missedPings = 0;
      }

      state.isAlive = false;
      try {
        ws.ping();
      } catch {
        ws.terminate();
      }
    }
  }, config.heartbeatIntervalMs);

  wss.on('close', () => {
    clearInterval(heartbeatTimer);
  });

  wss.on('connection', (ws, req) => {
    const state: WsState = {
      isAlive: true,
      missedPings: 0,
      playerId: null,
      playerName: null,
      joinedRoom: null,
      rateLimiter: new TokenBucket(config.rateLimitCapacity ?? 20, config.rateLimitRefillRate ?? 10),
    };
    wsState.set(ws, state);

    ws.on('pong', () => {
      state.isAlive = true;
      state.missedPings = 0;
    });

    const joinTimeout = setTimeout(() => {
      if (!state.joinedRoom) {
        console.warn('[WS] Client failed to join room within timeout, closing connection.');
        ws.send(
          JSON.stringify({
            v: 1,
            type: 'error',
            payload: { message: 'Join timeout exceeded' },
          })
        );
        ws.close(WS_CLOSE_CODES.JOIN_TIMEOUT, 'Join timeout');
      }
    }, config.joinTimeoutMs);

    ws.on('message', (data, isBinary) => {
      const s = wsState.get(ws);
      if (!s || !s.rateLimiter) {
        ws.close(WS_CLOSE_CODES.POLICY_VIOLATION, 'No session');
        return;
      }
      if (!s.rateLimiter.tryConsume(1)) {
        ws.send(
          JSON.stringify({
            v: 1,
            type: 'error',
            payload: { message: 'Rate limit exceeded' },
          })
        );
        ws.close(WS_CLOSE_CODES.POLICY_VIOLATION, 'Rate limit exceeded');
        return;
      }

      let message: unknown;
      try {
        const isBinaryBuffer =
          typeof data !== 'string' &&
          (Buffer.isBuffer(data) || data instanceof ArrayBuffer || ArrayBuffer.isView(data)) &&
          data.byteLength > 0;

        if (isBinaryBuffer && firstByteOf(data) !== 0x7b) {
          message = BinaryCodec.decode(data);
          s.preferredCodec = 'binary';
        } else {
          message = JSON.parse(typeof data === 'string' ? data : data.toString());
          if (!s.preferredCodec) {
            s.preferredCodec = 'json';
          }
        }
      } catch {
        console.warn('[WS] Malformed JSON rejected from socket');
        ws.send(
          JSON.stringify({
            v: 1,
            type: 'error',
            payload: { message: 'Invalid JSON' },
          })
        );
        ws.close(WS_CLOSE_CODES.INVALID_PAYLOAD, 'Invalid JSON payload');
        return;
      }

      const parsed = parseClientMessage(message);
      if (!parsed.ok) {
        console.warn(`[WS] Invalid message rejected: ${parsed.error}`);
        ws.send(
          JSON.stringify({
            v: 1,
            type: 'error',
            payload: { message: parsed.error },
          })
        );
        ws.close(parsed.code ?? WS_CLOSE_CODES.PROTOCOL_ERROR, parsed.error);
        return;
      }

      try {
        switch (parsed.value.type) {
          case 'join':
            handleJoin(ws, parsed.value.payload, joinTimeout, state);
            break;
          case 'chat':
            handleChat(ws, parsed.value.payload, state);
            break;
          case 'input':
            handleInput(ws, parsed.value.payload, state);
            break;
          case 'admin_latency':
            handleAdminLatency(ws, parsed.value.payload, state);
            break;
          case 'ping':
            handlePing(ws, parsed.value.payload);
            break;
          case 'leave':
            handleLeave(ws, state);
            break;
          case 'set_codec':
            if (parsed.value.payload.codec) {
              s.preferredCodec = parsed.value.payload.codec;
            }
            break;
        }
      } catch (err) {
        const closeCode = (err as { code?: number })?.code ?? WS_CLOSE_CODES.PROTOCOL_ERROR;
        console.error(`[WS] Error dispatching ${parsed.value.type}:`, err instanceof Error ? err.message : String(err));
        ws.send(
          JSON.stringify({
            v: 1,
            type: 'error',
            payload: { message: err instanceof Error ? err.message : String(err) },
          })
        );
        ws.close(closeCode, err instanceof Error ? err.message : String(err));
      }
    });

    ws.on('close', (code, reason) => {
      clearTimeout(joinTimeout);
      handleLeave(ws, state, reason ? reason.toString() : 'closed');
    });

    ws.on('error', (err) => {
      console.error('[WS] Socket error:', err instanceof Error ? err.message : String(err));
      clearTimeout(joinTimeout);
      handleLeave(ws, state, 'socket_error');
    });
  });

  function handleJoin(
    ws: WebSocket,
    payload: { roomId: string; playerName?: string; maxPlayers?: number; codec?: 'json' | 'binary' },
    joinTimeout: ReturnType<typeof setTimeout>,
    state: WsState
  ): void {
    const s = wsState.get(ws);
    if (!s || s.joinedRoom) {
      throw new Error('Already joined a room');
    }

    const roomId = String(payload.roomId).trim();
    if (!roomId) {
      const err = new Error('roomId is required');
      (err as { code?: number }).code = WS_CLOSE_CODES.INVALID_PAYLOAD;
      throw err;
    }

    let room = roomManager.getRoom(roomId);

    if (!room) {
      room = roomManager.createRoom({
        id: roomId,
        name: payload.playerName ?? `Sector ${roomId}`,
        maxPlayers: payload.maxPlayers ?? config.maxPlayersPerRoom,
      });
    }

    const playerId = `player-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const playerName = (payload.playerName && String(payload.playerName).trim()) || 'Pilot';

    const player = {
      id: playerId,
      name: playerName,
      ws,
      joinedAt: Date.now(),
      preferredCodec: payload.codec ?? null,
    };

    room.addPlayer(player);

    s.joinedRoom = room;
    s.playerId = playerId;
    s.playerName = playerName;
    if (payload.codec === 'binary') {
      s.preferredCodec = 'binary';
    } else if (payload.codec === 'json') {
      s.preferredCodec = 'json';
    }
    clearTimeout(joinTimeout);

    ws.send(
      JSON.stringify({
        v: 1,
        type: 'joined',
        payload: {
          roomId: room.id,
          playerId,
          playerName,
          maxPlayers: room.maxPlayers,
        },
      })
    );
  }

  function handleChat(ws: WebSocket, payload: { text: string }, state: WsState): void {
    if (!state.joinedRoom) {
      throw new Error('Not in a room');
    }

    const text = String(payload.text).trim().slice(0, 500);
    state.joinedRoom.handleChat(state.playerId ?? '', text);
  }

  function handleInput(
    ws: WebSocket,
    payload: { seq: number; tick?: number; thrust?: boolean; reverse?: boolean; turn?: number; fire?: boolean },
    state: WsState
  ): void {
    if (state.joinedRoom && state.playerId) {
      state.joinedRoom.handleInput(state.playerId, payload);
    }
  }

  function handleAdminLatency(
    ws: WebSocket,
    payload: { delayMs?: number; jitterMs?: number; dropRate?: number },
    state: WsState
  ): void {
    if (state.joinedRoom) {
      state.joinedRoom.handleAdminLatency(payload);
    }
  }

  function handlePing(ws: WebSocket, payload: { clientTime?: number }): void {
    ws.send(
      JSON.stringify({
        v: 1,
        type: 'pong',
        payload: {
          clientTime: payload?.clientTime ?? 0,
          serverTime: Date.now(),
        },
      })
    );
  }

  function handleLeave(ws: WebSocket, state: WsState, reason = 'left'): void {
    if (state.joinedRoom && state.playerId) {
      state.joinedRoom.removePlayer(state.playerId, reason);
      state.joinedRoom = null;
      state.playerId = null;
    }
  }

  return wss;
}
