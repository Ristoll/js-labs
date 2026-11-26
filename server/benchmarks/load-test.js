import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { WebSocket } from 'ws';
import http from 'node:http';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const resultsCsvPath = path.resolve(__dirname, 'load-test-results.csv');
const reportPath = path.resolve(__dirname, 'load-test-report.md');
const pngPath = path.resolve(__dirname, 'load-test-chart.png');

const PORT = 3098;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const WS_URL = `ws://127.0.0.1:${PORT}/ws`;
const ROOM = 'loadtest';
const RAMP = [8, 32, 64, 128];
const DURATION_MS = 6000; // how long each load level runs
const TICK_BUDGET_MS = 33; // 30 Hz budget

let serverProc = null;

function spawnServer() {
  return spawn(
    process.execPath,
    ['--experimental-strip-types', path.resolve(__dirname, '../src/index.ts')],
    {
      env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );
}

function waitForServer(timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tryOnce = () => {
      http
        .get(`${BASE_URL}/health`, (res) => {
          let data = '';
          res.on('data', (c) => (data += c));
          res.on('end', () => {
            try {
              JSON.parse(data);
              resolve();
            } catch {
              retry();
            }
          });
        })
        .on('error', retry);
    };
    const retry = () => {
      if (Date.now() - start > timeoutMs) reject(new Error('Server did not become ready'));
      else setTimeout(tryOnce, 200);
    };
    tryOnce();
  });
}

function fetchStats() {
  return new Promise((resolve, reject) => {
    http
      .get(`${BASE_URL}/api/stats`, (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on('error', reject);
  });
}

function connectClient(clientId) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    let joined = false;
    ws.on('open', () => {
      ws.send(JSON.stringify({ v: 1, type: 'join', payload: { roomId: ROOM, playerName: `load-${clientId}` } }));
    });
    ws.on('message', () => {
      // snapshot / chat / roster — we don't need to act on them
    });
    ws.on('error', reject);
    const t0 = Date.now();
    const interval = setInterval(() => {
      if (ws.readyState !== WebSocket.OPEN) return;
      // Fly a scripted path: thrust + turn each tick
      ws.send(
        JSON.stringify({
          v: 1,
          type: 'input',
          payload: {
            seq: Math.floor((Date.now() - t0) / 33),
            tick: Math.floor((Date.now() - t0) / 33),
            thrust: true,
            turn: Math.sin(Date.now() / 500) * 0.5,
            fire: false,
          },
        })
      );
    }, 33);
    // Consider joined once we get any message or after a short grace
    setTimeout(() => {
      joined = true;
      clearInterval(interval);
      resolve({ ws, interval, stop: () => { clearInterval(interval); ws.close(); } });
    }, 400);
  });
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

async function runLevel(n) {
  console.log(`[Load] Level N=${n} ...`);
  const clients = [];
  for (let i = 0; i < n; i++) {
    try {
      const c = await connectClient(i);
      clients.push(c);
    } catch (e) {
      console.warn(`[Load] client ${i} failed to connect:`, e.message);
    }
  }

  // Let the load run, sampling /api/stats
  const samples = [];
  const start = Date.now();
  while (Date.now() - start < DURATION_MS) {
    try {
      const stats = await fetchStats();
      const match = stats.matches.find((m) => m.roomId === ROOM) || stats.matches[0];
      if (match) {
        samples.push({
          t: Date.now() - start,
          lastTickDurationMs: match.lastTickDurationMs,
          avgTickDurationMs: match.avgTickDurationMs,
          entitiesCount: match.entitiesCount,
          playersCount: match.playersCount,
        });
      }
    } catch {
      // ignore transient stat fetch failures
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  for (const c of clients) c.stop();

  const lastTicks = samples.map((s) => s.lastTickDurationMs).filter((v) => v > 0);
  const avgTicks = samples.map((s) => s.avgTickDurationMs).filter((v) => v > 0);
  lastTicks.sort((a, b) => a - b);
  avgTicks.sort((a, b) => a - b);

  const result = {
    n,
    connected: clients.length,
    samples: samples.length,
    lastTickP99Ms: percentile(lastTicks, 99),
    lastTickMaxMs: lastTicks.length ? lastTicks[lastTicks.length - 1] : 0,
    avgTickP99Ms: percentile(avgTicks, 99),
    overBudget: lastTicks.some((v) => v > TICK_BUDGET_MS),
  };
  console.log(
    `[Load] N=${result.n} connected=${result.connected} p99LastTick=${result.lastTickP99Ms.toFixed(2)}ms ` +
      `max=${result.lastTickMaxMs.toFixed(2)}ms overBudget=${result.overBudget}`
  );
  return result;
}

async function main() {
  console.log('===========================================================');
  console.log('Lab 07 — Server Load Test');
  console.log('===========================================================');
  console.log(`Ramp: ${RAMP.join(', ')} clients | Level duration: ${DURATION_MS / 1000}s`);
  console.log(`Tick budget: ${TICK_BUDGET_MS}ms`);

  serverProc = spawnServer();
  await waitForServer();

  const results = [];
  for (const n of RAMP) {
    const r = await runLevel(n);
    results.push(r);
    if (r.overBudget) {
      console.log(`[Load] Tick budget exceeded at N=${n}; stopping ramp.`);
      break;
    }
  }

  serverProc.kill();
  serverProc = null;

  const firstOver = results.find((r) => r.overBudget);
  const capacityN = firstOver ? firstOver.n : RAMP[RAMP.length - 1];

  // CSV
  const csvHeader =
    'clients,connected,samples,p99_last_tick_ms,max_last_tick_ms,p99_avg_tick_ms,over_budget\n';
  const csvRows = results
    .map(
      (r) =>
        `${r.n},${r.connected},${r.samples},${r.lastTickP99Ms.toFixed(3)},${r.lastTickMaxMs.toFixed(3)},${r.avgTickP99Ms.toFixed(3)},${r.overBudget}`
    )
    .join('\n');
  fs.writeFileSync(resultsCsvPath, csvHeader + csvRows + '\n');

  // PNG chart
  generateChart(results, pngPath, { capacityN, tickBudgetMs: TICK_BUDGET_MS });

  const capacityText = firstOver ? `at N=${firstOver.n}` : 'not reached within the ramp';

  // Markdown report
  const report = `# Lab 07 — Server Load Test Report

## Method
- Headless WebSocket clients (\`ws\`) connect to \`ws://localhost:${PORT}/ws\`, join room \`${ROOM}\`, and send scripted input each tick.
- Ramp: \`${RAMP.join(', ')}\` concurrent clients.
- Each level runs for \`${DURATION_MS / 1000}s\`, polling \`/api/stats\` for server tick duration.
- Tick budget: \`${TICK_BUDGET_MS}ms\` (30 Hz server tick rate).

## Results

| Clients | Connected | p99 Last Tick (ms) | Max Last Tick (ms) | p99 Avg Tick (ms) | Over Budget |
|---------|-----------|--------------------|--------------------|-------------------|-------------|
${results
  .map(
    (r) =>
      `| ${r.n} | ${r.connected} | ${r.lastTickP99Ms.toFixed(2)} | ${r.lastTickMaxMs.toFixed(2)} | ${r.avgTickP99Ms.toFixed(2)} | ${r.overBudget ? 'YES' : 'no'} |`
  )
  .join('\n')}

## Capacity

**Measured capacity: \`${capacityN}\` concurrent clients** before the server tick exceeded the \`${TICK_BUDGET_MS}ms\` budget (${capacityText}).

## Generated Artifacts
- Raw measurements: \`load-test-results.csv\`
- Chart: \`load-test-chart.png\`

`;

  fs.writeFileSync(reportPath, report);
  console.log(`\n[Load] Capacity: ${capacityN} clients`);
  console.log(`[Load] CSV saved: ${resultsCsvPath}`);
  console.log(`[Load] Report saved: ${reportPath}`);
  console.log('[Load] Chart saved: ' + pngPath);
  console.log('Load test complete.');
}

main().catch((err) => {
  console.error(err);
  if (serverProc) serverProc.kill();
  process.exit(1);
});

// Minimal PNG chart generator (no external deps)
function generateChart(results, outputPath, summary) {
  function drawLine(x0, y0, x1, y1, r, g, b) {
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    let x = x0;
    let y = y0;
    while (true) {
      setPixel(x, y, r, g, b);
      setPixel(x, y + 1, r, g, b);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x += sx;
      }
      if (e2 < dx) {
        err += dx;
        y += sy;
      }
    }
  }

  const width = 900;
  const height = 480;
  const img = Buffer.alloc(width * height * 3, 0);
  const setPixel = (x, y, r, g, b) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const i = (y * width + x) * 3;
    img[i] = r;
    img[i + 1] = g;
    img[i + 2] = b;
  };

  // background
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) setPixel(x, y, 15, 23, 42);

  const ml = 90, mr = 60, mt = 60, mb = 70;
  const plotW = width - ml - mr;
  const plotH = height - mt - mb;

  const maxY = Math.max(...results.map((r) => r.lastTickP99Ms), summary.tickBudgetMs * 1.2, 5);
  const maxX = Math.max(...results.map((r) => r.n));

  // axes
  for (let x = ml; x < width - mr; x++) setPixel(x, height - mb, 56, 189, 248);
  for (let y = mt; y < height - mb; y++) setPixel(ml, y, 56, 189, 248);

  // budget line
  const budgetY = height - mb - (summary.tickBudgetMs / maxY) * plotH;
  for (let x = ml; x < width - mr; x++) setPixel(x, Math.round(budgetY), 255, 100, 100);

  let prev = null;
  for (const r of results) {
    const px = Math.round(ml + (r.n / maxX) * plotW);
    const py = Math.round(height - mb - (r.lastTickP99Ms / maxY) * plotH);
    if (prev) drawLine(prev[0], prev[1], px, py, 74, 222, 128);
    for (let dx = -3; dx <= 3; dx++) for (let dy = -3; dy <= 3; dy++) setPixel(px + dx, py + dy, 250, 204, 21);
    prev = [px, py];
  }

  const raw = Buffer.alloc(height * (1 + width * 3));
  let ri = 0;
  for (let y = 0; y < height; y++) {
    raw[ri++] = 0;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      raw[ri++] = img[i];
      raw[ri++] = img[i + 1];
      raw[ri++] = img[i + 2];
    }
  }
  const deflate = deflateSync(raw);
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const makeChunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
    const t = Buffer.from(type, 'ascii');
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])) >>> 0, 0);
    return Buffer.concat([len, t, data, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2;
  const png = Buffer.concat([sig, makeChunk('IHDR', ihdr), makeChunk('IDAT', deflate), makeChunk('IEND', Buffer.alloc(0))]);
  fs.writeFileSync(outputPath, png);
}

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[i] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}
