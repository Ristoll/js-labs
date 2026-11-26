# Lab 08 — Ship It: Milestones 1–4 (Production-ready process, Hardening, Container & pipeline, Launch & finish)

**Goal:** Make the Node/WebSocket server a production citizen (M1), harden it against abuse (M2), containerize + ship via tag-triggered CI (M3), and launch/finish (M4): PWA installability, uptime monitoring, product README, and release tags.

## What changed

**New files**
- `server/src/logger.ts` — `pino` structured JSON logger; `LOG_LEVEL`; `bindLogger()` child loggers bind `roomId`/`playerId`.
- `server/src/metrics.ts` — Prometheus `Registry` (`dogfight_ws_*`, `dogfight_process_rss_bytes`, `dogfight_event_loop_utilization`, `dogfight_tick_duration_seconds`) exposed via `GET /metrics`.
- `server/test/production.test.ts` — config fields + `/health`, `/ready`, `/metrics` (M1); origin rejection, per-IP cap, garbage-flood chaos (M2).
- `Dockerfile` — multi-stage `node:22-alpine` builder → runtime; non-root `appuser`; exec-form `CMD`; `HEALTHCHECK` on `/health`; `EXPOSE 3000`.
- `.dockerignore` — excludes `.git`, `node_modules/`, `coverage/`, `client/dist/`, `server/replays/`, `*.md`, Dockerfile/compose, tests.
- `docker-compose.yml` — `server` on `3000:3000`, `env_file: .env`, `NODE_ENV=production`, `/health` healthcheck, `restart: unless-stopped`.
- `client/public/manifest.json` — PWA manifest (name, short_name, start_url, standalone display, theme colors, icon).
- `client/public/sw.js` — minimal service worker (cache-first shell, skips `/ws`/`/api`/`/health`); `skipWaiting` + `clients.claim`.
- `.github/workflows/uptime.yml` — scheduled `*/5 * * * *` ping of `${HEALTH_URL}/health` (needs `HEALTH_URL` secret + deployed URL).
- `.github/workflows/ci.yml` — added `deploy` job on `refs/tags/v*`: GHCR build/push `ghcr.io/<owner>/dogfight:<tag>` + `:latest`, GHA cache, optional `DEPLOY_HOOK_URL` platform hook.

**Modified files**
- `server/src/config.ts` — zod schema + `ServerConfig` gains `ALLOWED_ORIGINS` (default `*`), `MAX_CONNECTIONS_PER_IP` (default `0`), `BUILD_VERSION` (default `null`).
- `server/src/server.ts` — pino logging; graceful `SIGTERM`/`SIGINT`: `server.close()` → WS close code `1001` + `'shutdown'` → flush rooms → `exit(0)`; `ready` flag → `/ready` returns `503` during shutdown.
- `server/src/api.ts` — `GET /health` includes `version`; new `GET /ready`; new `GET /metrics` (Prometheus text).
- `server/src/index.ts` — `uncaughtException`/`unhandledRejection` log stack via pino and exit non-zero; starts metrics sampling.
- `server/src/websocket.ts` — origin verification; per-IP cap; pino child loggers with `roomId`/`playerId`; messages/bytes/rejections to metrics.
- `server/src/bot-manager.ts` — fixed duplicate `ClientInput` type import.
- `client/src/version.ts` — fetches `/health`, exposes build version stamp.
- `client/src/main.ts` — loads version before `loop.start()`, passes `version` to `drawHud`.
- `client/src/render/draw.ts` — `drawHud` shows `v<version>` header + `ver:` row.
- `client/src/net/socket.ts` — exponential-backoff reconnect (`_scheduleReconnect`) for client-side chaos.
- `client/index.html` — `<title>` → "Dogfight — Multiplayer Space Arena"; `<link rel="manifest">`; `<link rel="icon">`; service-worker registration.
- `.env.example` — documents `LOG_LEVEL`, `ALLOWED_ORIGINS`, `MAX_CONNECTIONS_PER_IP`, `BUILD_VERSION`.
- `package.json` — adds `pino`, `prom-client` (server) and `@types/prom-client` (dev).

## Verification
- `npm run typecheck` — exit 0
- `npm run lint` — 0 errors (only pre-existing benchmark warnings)
- `npm test` — 177 passed / 20 files
- Docker image build + `<200 MB` size check: **deferred to CI** (Docker not installed locally).
- Deploy / public WSS URL / uptime monitor with real `HEALTH_URL`: **deferred** (requires a live platform deployment).

## Scope boundary
M1: config fields, `/health`+`/ready`, pino logging, `/metrics`, version stamp, graceful shutdown, crash-on-unknown.
M2: origin enforcement, per-IP cap, rate-limit/payload/slow-client limits under garbage flood, rejection metrics, reconnect-backoff client.
M3: multi-stage Dockerfile, non-root user, exec-form `CMD`, `HEALTHCHECK`, `.dockerignore`, `docker compose`, tag `v*` → GHCR build/push job in CI.
M4 (this session): PWA `manifest.json` + service worker + manifest/SW wiring in `index.html`; scheduled uptime-monitor workflow. 
Not yet done (M4 launch items needing a live URL + real users + tag): deploy image to platform, confirm public WSS URL works, heartbeats survive proxy idle timeout, `/health` version matches tag, uptime monitor active with real `HEALTH_URL`, PWA install tested on a phone, itch.io page (optional), two remote strangers played + anonymized RTT in README, README rewritten as product page (hero GIF, URL, how-to-play, architecture diagram, measurement tables, capacity+bottleneck, limitations, run-locally-in-3-commands, tag history, "what I'd do next"), demo video (3–5 min), 5-minute showcase, tags `lab-08` and `v1.0.0`.

Nothing committed or tagged.
