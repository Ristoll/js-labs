import { WebSocketServer } from 'ws';
import { TokenBucket } from './rate-limiter.js';

export function setupWebSocket(server, roomManager, config) {
  // Pass maxPayload directly into WebSocketServer options
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: config.maxPayloadSize,
  });

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (url.pathname === '/ws') {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    } else {
      socket.destroy();
    }
  });

  // Ping/Pong Heartbeat Interval
  const heartbeatTimer = setInterval(() => {
    for (const ws of wss.clients) {
      if (ws.isAlive === false) {
        ws.missedPings = (ws.missedPings || 0) + 1;
        if (ws.missedPings >= config.heartbeatMaxMissed) {
          console.log(`[WS] Terminating inactive client (${ws.playerId || 'unauthenticated'})`);
          ws.terminate();
          continue;
        }
      } else {
        ws.missedPings = 0;
      }

      ws.isAlive = false;
      try {
        ws.ping();
      } catch (err) {
        ws.terminate();
      }
    }
  }, config.heartbeatIntervalMs);

  wss.on('close', () => {
    clearInterval(heartbeatTimer);
  });

  wss.on('connection', (ws, req) => {
    ws.isAlive = true;
    ws.missedPings = 0;
    ws.rateLimiter = new TokenBucket(config.rateLimitCapacity, config.rateLimitRefillRate);
    ws.joinedRoom = null;
    ws.playerId = null;
    ws.playerName = null;

    ws.on('pong', () => {
      ws.isAlive = true;
      ws.missedPings = 0;
    });

    // 5-second join timeout: Client must send a valid 'join' message within joinTimeoutMs
    const joinTimeout = setTimeout(() => {
      if (!ws.joinedRoom) {
        console.warn('[WS] Client failed to join room within timeout, closing connection.');
        ws.send(
          JSON.stringify({
            v: 1,
            type: 'error',
            payload: { message: 'Join timeout exceeded' },
          })
        );
        ws.close(4001, 'Join timeout');
      }
    }, config.joinTimeoutMs);

    ws.on('message', (data) => {
      // 1. Rate limiting check - close connection on abuse (code 1008 Policy Violation)
      if (!ws.rateLimiter.tryConsume(1)) {
        ws.send(
          JSON.stringify({
            v: 1,
            type: 'error',
            payload: { message: 'Rate limit exceeded' },
          })
        );
        ws.close(1008, 'Rate limit exceeded');
        return;
      }

      // 2. Message parsing
      let message;
      try {
        message = JSON.parse(data.toString());
      } catch {
        ws.send(
          JSON.stringify({
            v: 1,
            type: 'error',
            payload: { message: 'Invalid JSON' },
          })
        );
        ws.close(1007, 'Invalid JSON payload');
        return;
      }

      // 3. Strict protocol validation
      if (!message || typeof message !== 'object') {
        ws.send(
          JSON.stringify({
            v: 1,
            type: 'error',
            payload: { message: 'Message must be an object' },
          })
        );
        ws.close(1002, 'Protocol violation');
        return;
      }

      if (message.v !== 1) {
        ws.send(
          JSON.stringify({
            v: 1,
            type: 'error',
            payload: { message: `Unsupported protocol version: ${message.v}` },
          })
        );
        ws.close(1002, 'Unsupported protocol version');
        return;
      }

      const knownTypes = ['join', 'chat', 'leave'];
      if (!message.type || typeof message.type !== 'string' || !knownTypes.includes(message.type)) {
        ws.send(
          JSON.stringify({
            v: 1,
            type: 'error',
            payload: { message: `Unknown or invalid message type: ${message.type}` },
          })
        );
        ws.close(1002, 'Unknown message type');
        return;
      }

      // 4. Dispatch handlers
      try {
        switch (message.type) {
          case 'join':
            handleJoin(ws, message.payload, joinTimeout);
            break;
          case 'chat':
            handleChat(ws, message.payload);
            break;
          case 'leave':
            handleLeave(ws);
            break;
        }
      } catch (err) {
        ws.send(
          JSON.stringify({
            v: 1,
            type: 'error',
            payload: { message: err.message },
          })
        );
      }
    });

    ws.on('close', (code, reason) => {
      clearTimeout(joinTimeout);
      handleLeave(ws, reason ? reason.toString() : 'closed');
    });

    ws.on('error', (err) => {
      console.error('[WS] Socket error:', err.message);
      clearTimeout(joinTimeout);
      handleLeave(ws, 'socket_error');
    });
  });

  function handleJoin(ws, payload, joinTimeout) {
    if (ws.joinedRoom) {
      throw new Error('Already joined a room');
    }

    if (!payload || typeof payload !== 'object' || !payload.roomId || typeof payload.roomId !== 'string') {
      throw new Error('Missing or invalid roomId in payload');
    }

    const roomId = String(payload.roomId).trim();
    if (!roomId) {
      throw new Error('roomId cannot be empty');
    }

    let room = roomManager.getRoom(roomId);

    if (!room) {
      room = roomManager.createRoom({
        id: roomId,
        name: payload.roomName || `Sector ${roomId}`,
        maxPlayers: payload.maxPlayers || config.maxPlayersPerRoom,
      });
    }

    const playerId = `player-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const playerName = (payload.playerName && String(payload.playerName).trim()) || 'Pilot';

    const player = {
      id: playerId,
      name: playerName,
      ws,
      joinedAt: Date.now(),
    };

    room.addPlayer(player);

    ws.joinedRoom = room;
    ws.playerId = playerId;
    ws.playerName = playerName;
    clearTimeout(joinTimeout);

    // Confirm joined to player
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

  function handleChat(ws, payload) {
    if (!ws.joinedRoom) {
      throw new Error('Not in a room');
    }
    if (!payload || typeof payload !== 'object' || typeof payload.text !== 'string' || !payload.text.trim()) {
      throw new Error('Invalid chat text');
    }

    const text = String(payload.text).trim().slice(0, 500); // 500 char chat limit
    ws.joinedRoom.handleChat(ws.playerId, text);
  }

  function handleLeave(ws, reason = 'left') {
    if (ws.joinedRoom && ws.playerId) {
      ws.joinedRoom.removePlayer(ws.playerId, reason);
      ws.joinedRoom = null;
      ws.playerId = null;
    }
  }

  return wss;
}
