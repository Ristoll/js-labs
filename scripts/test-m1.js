import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
  fetchJson,
  withRetry,
  loadJson,
  loadAll,
  loadAllSequential,
} from '../src/assets/loader.js';

// Setup Mock DOM and AudioContext for Node.js environment
globalThis.Image = class MockImage {
  constructor() {
    this.onload = null;
    this.onerror = null;
    this._src = '';
  }
  set src(val) {
    this._src = val;
    if (val === '') return;
    setTimeout(() => {
      if (this.onload) this.onload();
    }, 10);
  }
  get src() {
    return this._src;
  }
};

globalThis.URL.createObjectURL = (_blob) => `blob:mock/${Math.random().toString(36).slice(2)}`;
globalThis.URL.revokeObjectURL = () => {};

const mockAudioContext = {
  decodeAudioData: async (arrayBuffer) => ({
    sampleRate: 44100,
    length: arrayBuffer.byteLength / 2,
    duration: 0.1,
    numberOfChannels: 1,
  }),
};

// 1. Create a local test HTTP server to test network delays, 404, 500 retry, and static assets
let server500Hits = 0;
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Route: /api/flaky-500 (fails 2 times with 500, succeeds on 3rd attempt)
  if (url.pathname === '/api/flaky-500') {
    server500Hits++;
    if (server500Hits < 3) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Internal Server Error (transient)' }));
      return;
    }
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: true, attemptsRequired: server500Hits }));
    return;
  }

  // Route: /api/slow-asset?delay=100
  if (url.pathname === '/api/slow-asset') {
    const delay = parseInt(url.searchParams.get('delay') || '100', 10);
    setTimeout(() => {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ delayed: delay }));
    }, delay);
    return;
  }

  // Static files from public/
  const filePath = path.join(process.cwd(), 'public', url.pathname);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const delay = parseInt(url.searchParams.get('delay') || '0', 10);
    const ext = path.extname(filePath);
    const contentTypes = {
      '.json': 'application/json',
      '.png': 'image/png',
      '.wav': 'audio/wav',
    };
    const serve = () => {
      res.statusCode = 200;
      res.setHeader('Content-Type', contentTypes[ext] || 'application/octet-stream');
      fs.createReadStream(filePath).pipe(res);
    };

    if (delay > 0) {
      setTimeout(serve, delay);
    } else {
      serve();
    }
    return;
  }

  // 404 Not Found
  res.statusCode = 404;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ error: 'Not Found', url: req.url }));
});

async function runTests() {
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;
  console.log(`Test server running at ${baseUrl}`);

  try {
    console.log('\n--- TEST 1: fetchJson & response.ok check ---');
    const validJson = await fetchJson(`${baseUrl}/assets/arena.json`);
    console.log('✓ Valid JSON loaded:', validJson.name);

    let caught404 = false;
    try {
      await fetchJson(`${baseUrl}/assets/nonexistent.json`);
    } catch (err) {
      caught404 = true;
      console.log(`✓ 404 correctly thrown: status=${err.status}, message="${err.message}"`);
      if (err.status !== 404) {
        throw new Error('Expected err.status === 404', { cause: err });
      }
    }
    if (!caught404) {
      throw new Error('fetchJson did not throw on 404');
    }

    console.log('\n--- TEST 2: withRetry 500 Transient Failure (Retried with Backoff) ---');
    server500Hits = 0;
    const retryStart = performance.now();
    const flakyResult = await withRetry(() => fetchJson(`${baseUrl}/api/flaky-500`), {
      attempts: 3,
      baseMs: 50,
    });
    const retryDuration = performance.now() - retryStart;
    console.log(
      `✓ 500 error successfully recovered on attempt ${flakyResult.attemptsRequired} in ${retryDuration.toFixed(1)}ms`
    );
    if (flakyResult.attemptsRequired !== 3) {
      throw new Error('Retry did not execute 3 attempts');
    }

    console.log('\n--- TEST 3: withRetry 404 Client Error (NEVER Retried) ---');
    let retry404Attempts = 0;
    try {
      await withRetry(
        () => {
          retry404Attempts++;
          return fetchJson(`${baseUrl}/assets/nonexistent-sprite.png`);
        },
        { attempts: 3, baseMs: 50 }
      );
    } catch (err) {
      console.log(`✓ 404 thrown immediately after ${retry404Attempts} attempt(s) (no retry loops)`);
      if (retry404Attempts !== 1) {
        throw new Error('404 error was retried, but must NEVER be retried!', { cause: err });
      }
    }

    console.log('\n--- TEST 4: AbortSignal Cancellation ---');
    const abortCtrl = new AbortController();
    setTimeout(() => abortCtrl.abort(), 20);

    let caughtAbort = false;
    try {
      await loadJson(`${baseUrl}/api/slow-asset?delay=300`, { signal: abortCtrl.signal });
    } catch (err) {
      caughtAbort = true;
      console.log(`✓ Request aborted: name=${err.name}`);
      if (err.name !== 'AbortError') {
        throw new Error(`Expected AbortError, got ${err.name}`, { cause: err });
      }
    }
    if (!caughtAbort) {
      throw new Error('AbortController did not abort in-flight request');
    }

    console.log('\n--- TEST 5: loadAll with Promise.all and Per-Item Progress ---');
    const progressReports = [];
    const manifest = {
      sprites: {
        ship: `${baseUrl}/assets/sprites/ship.png?delay=80`,
        asteroid: `${baseUrl}/assets/sprites/asteroid.png?delay=80`,
        bullet: `${baseUrl}/assets/sprites/bullet.png?delay=80`,
      },
      sounds: {
        shoot: `${baseUrl}/assets/sounds/shoot.wav?delay=80`,
        hit: `${baseUrl}/assets/sounds/hit.wav?delay=80`,
        explosion: `${baseUrl}/assets/sounds/explosion.wav?delay=80`,
      },
      arena: `${baseUrl}/assets/arena.json?delay=80`,
    };

    const concurrentStart = performance.now();
    const assets = await loadAll(manifest, {
      audioContext: mockAudioContext,
      onProgress: (p, info) => {
        progressReports.push({ progress: p, done: info.done, total: info.total, key: info.key });
      },
    });
    const concurrentDuration = performance.now() - concurrentStart;

    console.log(
      `✓ All 7 items loaded concurrently via Promise.all in ${concurrentDuration.toFixed(1)}ms`
    );
    console.log(`✓ Progress events emitted: ${progressReports.length}`);
    console.log(
      `✓ First progress: ${Math.round(progressReports[0].progress * 100)}%, Last progress: ${Math.round(progressReports[progressReports.length - 1].progress * 100)}%`
    );
    if (Object.keys(assets.sprites).length !== 3) {
      throw new Error('Missing sprites in assets');
    }
    if (Object.keys(assets.sounds).length !== 3) {
      throw new Error('Missing sounds in assets');
    }
    if (!assets.arena) {
      throw new Error('Missing arena in assets');
    }

    console.log('\n--- TEST 6: Sequential Loading Benchmark (loadAllSequential) ---');
    const sequentialStart = performance.now();
    await loadAllSequential(manifest, {
      audioContext: mockAudioContext,
    });
    const sequentialDuration = performance.now() - sequentialStart;
    console.log(`✓ All 7 items loaded sequentially in ${sequentialDuration.toFixed(1)}ms`);

    const speedup = (sequentialDuration / concurrentDuration).toFixed(2);
    console.log(`\n========================================================`);
    console.log(`PERFORMANCE COMPARISON (7 items with 80ms network latency):`);
    console.log(`Concurrent (Promise.all):      ${concurrentDuration.toFixed(1)} ms`);
    console.log(`Sequential (await per item):   ${sequentialDuration.toFixed(1)} ms`);
    console.log(`Speedup factor:                ${speedup}x faster`);
    console.log(`========================================================\n`);

    console.log('ALL MILESTONE 1 AUTOMATED TESTS PASSED!');
  } finally {
    server.close();
  }
}

runTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
