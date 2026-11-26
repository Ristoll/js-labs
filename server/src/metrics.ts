/**
 * Production metrics exposed on `/metrics` (Prometheus text format).
 *
 * Counters accumulate forever; gauges are refreshed by `startSampling()`.
 * All metrics are prefixed `dogfight_`. Rejections carry a `reason` label so
 * abuse (rate limits, invalid payloads, origin blocks) can be graphed.
 */
import { Registry, Counter, Gauge, Histogram } from 'prom-client';

export const register = new Registry();

// ---- Counters ----
export const messagesTotal = new Counter({
  name: 'dogfight_ws_messages_total',
  help: 'Total WebSocket messages received/sent',
  labelNames: ['direction'],
  registers: [register],
});

export const bytesTotal = new Counter({
  name: 'dogfight_ws_bytes_total',
  help: 'Total WebSocket bytes received/sent',
  labelNames: ['direction'],
  registers: [register],
});

export const rejectionsTotal = new Counter({
  name: 'dogfight_ws_rejections_total',
  help: 'Total WebSocket connections closed for policy reasons',
  labelNames: ['reason'],
  registers: [register],
});

// ---- Gauges ----
export const playersGauge = new Gauge({
  name: 'dogfight_ws_players',
  help: 'Currently connected players',
  registers: [register],
});

export const roomsGauge = new Gauge({
  name: 'dogfight_ws_rooms',
  help: 'Currently open rooms',
  registers: [register],
});

export const rssGauge = new Gauge({
  name: 'dogfight_process_rss_bytes',
  help: 'Resident set size of the server process',
  registers: [register],
});

export const eventLoopUtilizationGauge = new Gauge({
  name: 'dogfight_event_loop_utilization',
  help: 'Estimated event-loop utilization (0 = idle, 1 = saturated)',
  registers: [register],
});

// ---- Histogram ----
export const tickDurationSeconds = new Histogram({
  name: 'dogfight_tick_duration_seconds',
  help: 'Duration of a single simulation tick',
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1],
  registers: [register],
});

export function setPlayers(n: number) {
  playersGauge.set(n);
}

export function setRooms(n: number) {
  roomsGauge.set(n);
}

export function incMessages(direction: 'in' | 'out') {
  messagesTotal.inc({ direction });
}

export function addBytes(direction: 'in' | 'out', n: number) {
  bytesTotal.inc({ direction }, n);
}

export function incRejection(reason: string) {
  rejectionsTotal.inc({ reason });
}

export function observeTick(seconds: number) {
  tickDurationSeconds.observe(seconds);
}

let samplingInterval: NodeJS.Timeout | null = null;

let lastLoopSample = { hrtime: process.hrtime(), idle: 0 };
function sampleEventLoop() {
  const now = process.hrtime();
  const elapsedSec = (now[0] - lastLoopSample.hrtime[0]) + (now[1] - lastLoopSample.hrtime[1]) / 1e9;
  // Crude utilization estimate: if the loop is keeping up, scheduled work is sparse.
  const lag = Math.max(0, elapsedSec - 1);
  const util = lag === 0 ? 0 : Math.min(1, lag / (lag + 1));
  eventLoopUtilizationGauge.set(util);
  lastLoopSample = now;
}

export function startSampling(roomManager: { rooms: Map<string, unknown> }, intervalMs = 1000) {
  if (samplingInterval) return;
  samplingInterval = setInterval(() => {
    try {
      roomsGauge.set(roomManager.rooms.size);
      rssGauge.set(process.memoryUsage().rss);
      sampleEventLoop();
    } catch {
      // Sampling must never crash the process.
    }
  }, intervalMs);
  samplingInterval.unref();
}

export function stopSampling() {
  if (samplingInterval) {
    clearInterval(samplingInterval);
    samplingInterval = null;
  }
}

export async function getMetrics(): Promise<string> {
  return register.metrics();
}
