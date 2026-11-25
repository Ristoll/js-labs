import { Worker } from 'node:worker_threads';
import { performance } from 'node:perf_hooks';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workerPath = path.resolve(__dirname, 'worker.js');
const resultsCsvPath = path.resolve(__dirname, 'worker-results.csv');
const reportPath = path.resolve(__dirname, 'worker-report.md');

const ITERATIONS = 200;
const COUNTS = [100, 1000, 10000, 100000];

function makeBuffer(count) {
  const buf = new Float32Array(count * 4);
  for (let i = 0; i < count * 4; i += 4) {
    buf[i] = Math.random() * 1200;
    buf[i + 1] = Math.random() * 800;
    buf[i + 2] = (Math.random() - 0.5) * 200;
    buf[i + 3] = (Math.random() - 0.5) * 200;
  }
  return buf;
}

function updateInline(buffer, count) {
  const dt = 1 / 60;
  const W = 1200;
  const H = 800;
  for (let i = 0; i < count; i++) {
    const base = i * 4;
    let x = buffer[base];
    let y = buffer[base + 1];
    const vx = buffer[base + 2];
    const vy = buffer[base + 3];
    x += vx * dt;
    y += vy * dt;
    if (x < 0) x += W;
    if (x >= W) x -= W;
    if (y < 0) y += H;
    if (y >= H) y -= H;
    buffer[base] = x;
    buffer[base + 1] = y;
  }
}

function measureInline(count) {
  const buffer = makeBuffer(count);
  // warmup
  for (let i = 0; i < 10; i++) updateInline(buffer, count);
  const start = performance.now();
  for (let i = 0; i < ITERATIONS; i++) updateInline(buffer, count);
  const end = performance.now();
  return (end - start) / ITERATIONS; // ms per iteration
}

function measureWorker(count) {
  return new Promise((resolve, reject) => {
    const buffer = makeBuffer(count);
    const worker = new Worker(workerPath);
    let resolved = false;
    // warmup
    let warmup = 10;
    const doWarmup = () => {
      if (warmup-- <= 0) {
        startMeasure();
        return;
      }
      const b = buffer.slice(); // copy for warmup (don't transfer the real one yet)
      worker.postMessage({ op: 'update', buffer: b, count }, [b]);
    };
    const startMeasure = () => {
      const start = performance.now();
      let remaining = ITERATIONS;
      worker.on('message', ({ op, buffer: buf }) => {
        if (op !== 'update') return;
        remaining--;
        if (remaining > 0) {
          // transfer the returned buffer back for next iteration
          worker.postMessage({ op: 'update', buffer: buf, count }, [buf]);
        } else {
          const end = performance.now();
          worker.terminate();
          resolved = true;
          resolve((end - start) / ITERATIONS);
        }
      });
      worker.on('error', reject);
      // kick off first iteration (transfer the original)
      worker.postMessage({ op: 'update', buffer, count }, [buffer]);
    };
    doWarmup();
  });
}

async function main() {
  console.log('===========================================================');
  console.log('Lab 07 — Web Worker Experiment (entity position update)');
  console.log('===========================================================');
  console.log(`Comparing inline update vs worker round-trip (transferable Float32Array).`);
  console.log(`Iterations per measurement: ${ITERATIONS}`);
  console.log('');

  const results = [];
  for (const count of COUNTS) {
    const inlineMs = measureInline(count);
    const workerMs = await measureWorker(count);
    const overheadMs = workerMs - inlineMs;
    const win = workerMs < inlineMs * 0.9; // worker must be >10% faster to count as a win
    results.push({ count, inlineMs, workerMs, overheadMs, win });
    console.log(
      `[Worker] N=${count.toLocaleString()} inline=${inlineMs.toFixed(3)}ms/iter ` +
        `worker=${workerMs.toFixed(3)}ms/iter overhead=${overheadMs.toFixed(3)}ms ` +
        `win=${win}`
    );
  }

  const go = results.some((r) => r.win);
  const csvHeader =
    'entity_count,inline_ms_per_iter,worker_ms_per_iter,overhead_ms,worker_wins\n';
  const csvRows = results
    .map(
      (r) =>
        `${r.count},${r.inlineMs.toFixed(4)},${r.workerMs.toFixed(4)},${r.overheadMs.toFixed(4)},${r.win}`
    )
    .join('\n');
  fs.writeFileSync(resultsCsvPath, csvHeader + csvRows + '\n');

  const report = `# Lab 07 — Web Worker Experiment Report

## Question
Does moving the entity position-update subsystem to a worker (with a
transferable "Float32Array") save main-thread time vs. the message-passing
overhead?

## Method
- Workload: Euler integrate + wrap N entities (x, y, vx, vy in a "Float32Array").
- Inline baseline: update on the main thread.
- Worker: postMessage the buffer with transfer (zero-copy), worker updates and posts it back.
- Measure average ms per iteration over ${ITERATIONS} iterations after warmup.

## Results

| Entities | Inline (ms/iter) | Worker (ms/iter) | Overhead (ms/iter) | Worker wins? |
|----------|------------------|------------------|--------------------|--------------|
${results
  .map(
    (r) =>
      `| ${r.count.toLocaleString()} | ${r.inlineMs.toFixed(3)} | ${r.workerMs.toFixed(3)} | ${r.overheadMs.toFixed(3)} | ${r.win ? 'yes' : 'no'} |`
  )
  .join('\n')}

## Decision

**Go/No-Go: ${go ? 'GO (worker wins for at least one size)' : 'NO-GO (worker never wins)'}**

## Reasoning
Transferring a "Float32Array" is zero-copy for the payload, but each
round-trip still pays:
- thread hop + message dispatch,
- "postMessage" structured-clone of the message envelope,
- two "postMessage" calls per iteration (there and back).

For a cheap per-entity update (~flops), that overhead dominates unless the
per-entity work is substantial *or* the buffer is huge enough that the
main-thread cost itself becomes a frame hitch. ${go ? 'In this experiment the worker was faster at some sizes, so offloading this subsystem is justified.' : 'In this experiment the worker was never faster, so the subsystem stays on the main thread — pooling/allocation-free updates are the better optimization.'}

## Generated Artifacts
- Raw measurements: \`worker-results.csv\`

`;

  fs.writeFileSync(reportPath, report);
  console.log(`\n[Worker] Go/No-Go: ${go ? 'GO' : 'NO-GO'}`);
  console.log(`[Worker] CSV saved: ${resultsCsvPath}`);
  console.log(`[Worker] Report saved: ${reportPath}`);
  console.log('Worker experiment complete.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
