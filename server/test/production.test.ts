import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import WebSocket from 'ws';
import { loadConfig } from '../src/config.ts';
import { createServer } from '../src/server.ts';
import { register } from '../src/metrics.ts';

describe('Lab 08 M1 — Production-ready process', () => {
  let server: Awaited<ReturnType<typeof createServer>>;
  let baseUrl: string;

  beforeAll(async () => {
    server = createServer({
      port: 0,
      host: '127.0.0.1',
      buildVersion: 'test-sha-1234',
    });
    await new Promise<void>((resolve) => {
      server.server.listen(0, '127.0.0.1', () => {
        const addr = server.server.address();
        baseUrl = `http://127.0.0.1:${(addr as { port: number }).port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await server.shutdown();
  });

  describe('Zod config', () => {
    it('parses ALLOWED_ORIGINS, MAX_CONNECTIONS_PER_IP, BUILD_VERSION', () => {
      const cfg = loadConfig({
        ALLOWED_ORIGINS: 'https://example.com, https://app.example.com',
        MAX_CONNECTIONS_PER_IP: '25',
        BUILD_VERSION: 'sha-abcdef',
      });
      expect(cfg.allowedOrigins).toEqual(['https://example.com', 'https://app.example.com']);
      expect(cfg.maxConnectionsPerIp).toBe(25);
      expect(cfg.buildVersion).toBe('sha-abcdef');
    });

    it('defaults ALLOWED_ORIGINS to allow-all, MAX_CONNECTIONS_PER_IP unlimited, buildVersion null', () => {
      const cfg = loadConfig({});
      expect(cfg.allowedOrigins).toEqual(['*']);
      expect(cfg.maxConnectionsPerIp).toBe(0);
      expect(cfg.buildVersion).toBeNull();
    });
  });

  describe('HTTP endpoints', () => {
    it('GET /health returns ok with build version', async () => {
      const res = await fetch(`${baseUrl}/health`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('ok');
      expect(body.version).toBe('test-sha-1234');
      expect(typeof body.uptime).toBe('number');
    });

    it('GET /ready returns ready while running', async () => {
      const res = await fetch(`${baseUrl}/ready`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('ready');
      expect(body.version).toBe('test-sha-1234');
    });

    it('GET /metrics returns Prometheus text with dogfight metrics', async () => {
      const res = await fetch(`${baseUrl}/metrics`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/plain');
      const text = await res.text();
      expect(text).toContain('dogfight_ws_players');
      expect(text).toContain('dogfight_ws_rooms');
      expect(text).toContain('dogfight_process_rss_bytes');
      expect(text).toContain('dogfight_event_loop_utilization');
      expect(text).toContain('dogfight_tick_duration_seconds');
    });
  });

  describe('M2 — Hardening', () => {
    const waitState = (ws: WebSocket, target: number, timeoutMs = 4000): Promise<boolean> =>
      new Promise((resolve) => {
        const t = setTimeout(() => resolve(false), timeoutMs);
        const onChange = () => {
          if (ws.readyState === target) {
            clearTimeout(t);
            resolve(true);
          }
        };
        ws.once('open', onChange);
        ws.once('close', onChange);
        ws.once('error', onChange);
      });

    describe('Origin verification', () => {
      it('rejects a WebSocket whose Origin is not in ALLOWED_ORIGINS', async () => {
        const originServer = createServer({
          port: 0,
          host: '127.0.0.1',
          allowedOrigins: 'http://localhost',
          buildVersion: 'origin-test',
        });
        await new Promise<void>((resolve) => {
          originServer.server.listen(0, '127.0.0.1', resolve);
        });
        const port = (originServer.server.address() as { port: number }).port;

        const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, {
          headers: { origin: 'http://evil.com' },
        });
        // Should never open; be destroyed at upgrade.
        const opened = await waitState(ws, WebSocket.OPEN);
        expect(opened).toBe(false);
        ws.removeAllListeners();
        await originServer.shutdown();
      });

      it('allows a WebSocket whose Origin is in ALLOWED_ORIGINS', async () => {
        const ws = new WebSocket(`ws://127.0.0.1:${(server.server.address() as { port: number }).port}/ws`, {
          headers: { origin: 'http://localhost' },
        });
        const opened = await waitState(ws, WebSocket.OPEN);
        expect(opened).toBe(true);
        ws.close(1000);
        await waitState(ws, WebSocket.CLOSED);
      });
    });

    describe('Per-IP connection cap', () => {
      it('rejects connections beyond MAX_CONNECTIONS_PER_IP', async () => {
        const capped = createServer({
          port: 0,
          host: '127.0.0.1',
          maxConnectionsPerIp: 1,
          buildVersion: 'cap-test',
        });
        await new Promise<void>((resolve) => {
          capped.server.listen(0, '127.0.0.1', resolve);
        });
        const capPort = (capped.server.address() as { port: number }).port;

        const first = new WebSocket(`ws://127.0.0.1:${capPort}/ws`);
        await new Promise<void>((resolve) => first.once('open', resolve));

        const second = new WebSocket(`ws://127.0.0.1:${capPort}/ws`);
        const closed = await waitState(second, WebSocket.CLOSED, 4000);
        expect(closed).toBe(true);

        first.close();
        await capped.shutdown();
      });
    });

    describe('Garbage flood chaos', () => {
      it('closes a garbage-spamming client, counts rejections, and does not crash', async () => {
        const ws = new WebSocket(`ws://127.0.0.1:${(server.server.address() as { port: number }).port}/ws`);
        await new Promise<void>((resolve) => ws.once('open', resolve));

        // Join a room so the socket has a session.
        ws.send(JSON.stringify({ v: 1, type: 'join', payload: { roomId: 'chaos-room', playerName: 'Spammer' } }));
        await new Promise((r) => ws.once('message', r));

        // Flood garbage frames faster than the rate limit refills.
        for (let i = 0; i < 200; i++) {
          ws.send(`garbage-frame-${i} not json at all {{{`);
        }

        const closed = await waitState(ws, WebSocket.CLOSED, 6000);
        expect(closed).toBe(true);

        // Metrics should have recorded at least one rejection.
        const text = await register.metrics();
        expect(text).toContain('dogfight_ws_rejections_total');
      });
    });
  });
});
