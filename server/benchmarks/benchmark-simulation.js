import process from 'node:process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { World } from '../../shared/src/sim/world.ts';
import { Ship } from '../../shared/src/sim/ship.ts';
import { Asteroid } from '../../shared/src/sim/asteroid.ts';
import { Bullet } from '../../shared/src/sim/bullet.ts';
import { Pickup } from '../../shared/src/sim/pickup.ts';
import { createArena } from '../../shared/src/sim/arena.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const resultsCsvPath = path.resolve(__dirname, 'simulation-results.csv');
const reportPath = path.resolve(__dirname, 'simulation-report.md');

const arena = createArena(1200, 800);
const STEP_DT = 1 / 60;
const BENCHMARK_SEC = 5;
const ENTITY_COUNTS = [100, 500, 1000, 2000];
const KINDS = ['ship', 'asteroid', 'bullet', 'pickup'];

function spawnEntities(world, count, seed) {
  const prng = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const perKind = Math.floor(count / KINDS.length);
  let id = 1;
  for (const kind of KINDS) {
    for (let i = 0; i < perKind; i++) {
      const x = prng() * arena.width;
      const y = prng() * arena.height;
      const vx = (prng() - 0.5) * 200;
      const vy = (prng() - 0.5) * 200;
      if (kind === 'ship') {
        world.spawn(new Ship({ id: id, x, y, vx, vy, playerId: 'p' + id }));
        id++;
      } else if (kind === 'asteroid') {
        world.spawn(new Asteroid({ id: id, x, y, vx, vy, radius: 20 + prng() * 20 }));
        id++;
      } else if (kind === 'bullet') {
        world.spawn(new Bullet({ id: id, x, y, vx, vy, ownerId: 'p' + id }));
        id++;
      } else {
        world.spawn(new Pickup({ id: id, x, y, type: 'shield' }));
        id++;
      }
    }
  }
  return id - 1;
}

function getRssBytes() {
  const usage = process.resourceUsage();
  return usage.maxRSS || 0;
}

async function runEntityCountBenchmark(count) {
  const world = new World();
  const lastId = spawnEntities(world, count, count * 7919);

  const inputs = new Map();
  for (let i = 1; i <= lastId; i++) {
    const e = world.get(i);
    if (e && e.kind === 'ship') {
      inputs.set(e.playerId ?? String(i), { thrust: true, turn: 0.1, fire: false, seq: i });
    }
  }

  const start = process.hrtime.bigint();
  let ticks = 0;
  const endTime = start + BigInt(BENCHMARK_SEC * 1_000_000_000);

  while (process.hrtime.bigint() < endTime) {
    world.step(STEP_DT, inputs, arena);
    ticks++;
  }

  const elapsedNs = process.hrtime.bigint() - start;
  const elapsedSec = Number(elapsedNs) / 1e9;
  const ticksPerSec = ticks / elapsedSec;
  const entitiesPerSec = (ticks * count) / elapsedSec;
  const rssBytes = getRssBytes();

  return {
    count,
    ticks,
    elapsedSec,
    ticksPerSec,
    entitiesPerSec,
    rssBytes,
    rssMB: (rssBytes / 1024 / 1024).toFixed(2),
  };
}

async function main() {
  console.log('===========================================================');
  console.log('Lab 07 — Engine / Simulation Performance Benchmark');
  console.log('===========================================================');
  console.log(`Step dt:       ${STEP_DT}s (60 Hz target)`);
  console.log(`Duration:      ${BENCHMARK_SEC}s per entity count`);
  console.log(`Entity counts: ${ENTITY_COUNTS.join(', ')}`);
  console.log('');

  const results = [];
  for (const count of ENTITY_COUNTS) {
    const r = await runEntityCountBenchmark(count);
    results.push(r);
    console.log(
      `[${count} entities] ${r.ticks.toLocaleString()} ticks in ${r.elapsedSec.toFixed(3)}s | ` +
        `${r.ticksPerSec.toFixed(1)} ticks/s | ${r.entitiesPerSec.toLocaleString()} entities/s | ` +
        `RSS ${r.rssMB} MB`
    );
  }

  const peak = results.reduce((a, b) => (b.rssBytes > a.rssBytes ? b : a), results[0]);
  const baseline = results[0];

  // Save CSV
  const csvHeader =
    'entity_count,ticks,elapsed_sec,ticks_per_sec,entities_per_sec,rss_bytes,rss_mb\n';
  const csvRows = results
    .map(
      (r) =>
        `${r.count},${r.ticks},${r.elapsedSec.toFixed(6)},${r.ticksPerSec.toFixed(2)},${r.entitiesPerSec.toFixed(0)},${r.rssBytes},${r.rssMB}`
    )
    .join('\n');
  fs.writeFileSync(resultsCsvPath, csvHeader + csvRows + '\n');
  console.log(`\n[Results] CSV saved: ${resultsCsvPath}`);

  // Save Markdown report
  const report = `# Lab 07 — Engine Performance Benchmark Report

## Test Environment
- **Runtime:** Node.js ${process.version}
- **Step dt:** ${STEP_DT}s (60 Hz target)
- **Benchmark duration:** ${BENCHMARK_SEC}s per entity count
- **Arena:** 1200x800 with wrap-around

## Results

| Entities | Ticks | Elapsed (s) | Ticks/s | Entities/s | RSS (MB) |
|----------|-------|-------------|---------|------------|----------|
${results
  .map(
    (r) =>
      `| ${r.count} | ${r.ticks.toLocaleString()} | ${r.elapsedSec.toFixed(3)} | ${r.ticksPerSec.toFixed(1)} | ${r.entitiesPerSec.toLocaleString()} | ${r.rssMB} |`
  )
  .join('\n')}

## Analysis

- **Baseline (${baseline.count} entities):** ${baseline.ticksPerSec.toFixed(1)} ticks/s, ${baseline.entitiesPerSec.toLocaleString()} entities/s
- **Peak (${peak.count} entities):** ${peak.rssMB} MB RSS
- **RSS growth:** ${((peak.rssBytes - baseline.rssBytes) / 1024 / 1024).toFixed(2)} MB from baseline to peak

## Generated Artifacts
- Raw measurements: \`simulation-results.csv\`

`;

  fs.writeFileSync(reportPath, report);
  console.log(`[Results] Markdown report saved: ${reportPath}`);
  console.log('\nBenchmark complete.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
