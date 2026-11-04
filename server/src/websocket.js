import { WebSocketServer } from 'ws';
import { TokenBucket } from './rate-limiter.js';

export function setupWebSocket(server, roomManager, config) {
  const wss = new WebSocketServer({ noServer: true });

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

    // 5-second join timeout: Client must send a valid 'join' message within 5s
    const joinTimeout = setTimeout(() => {
      if (!ws.joinedRoom) {
        console.warn('[WS] Client failed to join room within 5s timeout, closing connection.');
        ws.send(
          JSON.stringify({
            v: 1,
            type: 'error',
            payload: { message: 'Join timeout exceeded (5s limit)' },
          })
        );
        ws.close(4001, 'Join timeout');
      }
    }, config.joinTimeoutMs);

    ws.on('message', (data) => {
      // 1. Payload size check
      if (data.length > config.maxPayloadSize) {
        ws.send(
          JSON.stringify({
            v: 1,
            type: 'error',
            payload: { message: 'Payload size exceeded' },
          })
        );
        ws.close(1009, 'Message too big');
        return;
      }

      // 2. Token-bucket rate limiting
      if (!ws.rateLimiter.tryConsume(1)) {
        ws.send(
          JSON.stringify({
            v: 1,
            type: 'error',
            payload: { message: 'Rate limit exceeded' },
          })
        );
        return;
      }

      // 3. Message parsing & validation
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
        return;
      }

      if (!message || typeof message !== 'object' || message.v !== 1 || !message.type) {
        ws.send(
          JSON.stringify({
            v: 1,
            type: 'error',
            payload: { message: 'Invalid protocol version or missing type' },
          })
        );
        return;
      }

      // Dispatch handlers
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
          default:
            ws.send(
              JSON.stringify({
                v: 1,
                type: 'error',
                payload: { message: `Unknown message type: ${message.type}` },
              })
            );
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

    if (!payload || !payload.roomId) {
      throw new Error('Missing roomId in payload');
    }

    const roomId = String(payload.roomId);
    let room = roomManager.getRoom(roomId);

    if (!room) {
      // If room doesn't exist, create it if room creation allowed
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
    if (!payload || typeof payload.text !== 'string' || !payload.text.trim()) {
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
