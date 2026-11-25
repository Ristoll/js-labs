/**
 * Web Worker experiment (run here via Node worker_threads as the closest
 * server-side equivalent): updates a batch of entity positions
 * (x, y, vx, vy stored in a Float32Array) and transfers the buffer back.
 *
 * Message protocol:
 *  { op: 'update', buffer: Float32Array (transferred), count: number }
 *  response: { op: 'update', buffer: Float32Array (transferred back) }
 */
import { parentPort } from 'node:worker_threads';

function update(buffer, count) {
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

parentPort.on('message', ({ op, buffer, count }) => {
  if (op === 'update') {
    update(buffer, count);
    parentPort.postMessage({ op, buffer }, [buffer]);
  }
});
