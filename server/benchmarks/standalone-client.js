import http from 'node:http';
import process from 'node:process';

const port = process.argv[2] || 39821;
let downloadedBytes = 0;
const startTime = Date.now();

// Report downloaded bytes every 500ms
setInterval(() => {
  const elapsedMs = Date.now() - startTime;
  process.stdout.write(`CLIENT_METRIC elapsed=${elapsedMs} bytes=${downloadedBytes}\n`);
}, 500);

const req = http.get(`http://127.0.0.1:${port}/api/replays/synth-200mb`, (res) => {
  if (res.statusCode !== 200) {
    console.error(`CLIENT_ERROR: HTTP ${res.statusCode}`);
    process.exit(1);
  }

  let chunkCount = 0;
  res.on('data', (chunk) => {
    downloadedBytes += chunk.length;
    chunkCount++;

    // Throttling: Pause every 16 chunks (~1 MB) for 15ms to induce realistic bandwidth limit (~25 MB/s)
    if (chunkCount % 16 === 0) {
      res.pause();
      setTimeout(() => {
        res.resume();
      }, 15);
    }
  });

  res.on('end', () => {
    const elapsedSec = (Date.now() - startTime) / 1000;
    process.stdout.write(
      `CLIENT_COMPLETE bytes=${downloadedBytes} duration=${elapsedSec.toFixed(2)}\n`
    );
    setTimeout(() => process.exit(0), 100);
  });

  res.on('error', (err) => {
    console.error('CLIENT_STREAM_ERROR:', err);
    process.exit(1);
  });
});

req.on('error', (err) => {
  console.error('CLIENT_REQ_ERROR:', err);
  process.exit(1);
});
