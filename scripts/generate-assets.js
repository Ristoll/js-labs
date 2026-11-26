import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { Buffer } from 'node:buffer';

// 1. CRC32 table & function for PNG chunks
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);

  const toCrc = Buffer.concat([typeBuf, data]);
  const crcVal = crc32(toCrc);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crcVal, 0);

  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function createPng(width, height, pixelFn) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // 8 bits per channel
  ihdrData[9] = 6; // RGBA
  ihdrData[10] = 0; // Deflate
  ihdrData[11] = 0; // Filter
  ihdrData[12] = 0; // Non-interlaced
  const ihdrChunk = createChunk('IHDR', ihdrData);

  // Raw uncompressed scanlines: each row starts with 0 (no filter), then width * 4 bytes
  const rowLen = 1 + width * 4;
  const rawData = Buffer.alloc(rowLen * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowLen;
    rawData[rowOffset] = 0; // Filter None
    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      const [r, g, b, a] = pixelFn(x, y, width, height);
      rawData[pxOffset] = r;
      rawData[pxOffset + 1] = g;
      rawData[pxOffset + 2] = b;
      rawData[pxOffset + 3] = a;
    }
  }

  const idatCompressed = zlib.deflateSync(rawData);
  const idatChunk = createChunk('IDAT', idatCompressed);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([sig, ihdrChunk, idatChunk, iendChunk]);
}

// 2. PCM WAV Generator (16-bit Mono 44100Hz)
function createWav(durationSec, sampleFn) {
  const sampleRate = 44100;
  const numSamples = Math.floor(sampleRate * durationSec);
  const dataSize = numSamples * 2; // 16-bit = 2 bytes

  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF chunk descriptor
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);

  // 'fmt ' sub-chunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // subchunk1size = 16 for PCM
  buffer.writeUInt16LE(1, 20); // AudioFormat = 1 (PCM)
  buffer.writeUInt16LE(1, 22); // NumChannels = 1 (Mono)
  buffer.writeUInt32LE(sampleRate, 24); // SampleRate
  buffer.writeUInt32LE(sampleRate * 2, 28); // ByteRate = SampleRate * NumChannels * BitsPerSample/8
  buffer.writeUInt16LE(2, 32); // BlockAlign = NumChannels * BitsPerSample/8
  buffer.writeUInt16LE(16, 34); // BitsPerSample = 16

  // 'data' sub-chunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const s = Math.max(-1, Math.min(1, sampleFn(t, durationSec)));
    const sampleInt = Math.floor(s < 0 ? s * 32768 : s * 32767);
    buffer.writeInt16LE(sampleInt, 44 + i * 2);
  }

  return buffer;
}

// 3. Generate Directories and Files
const dirs = [
  'public/assets',
  'public/assets/sprites',
  'public/assets/sounds',
  'assets',
  'assets/sprites',
  'assets/sounds',
];

for (const d of dirs) {
  fs.mkdirSync(path.resolve(d), { recursive: true });
}

// Sprite: Ship (triangle with glowing cockpit)
const shipPng = createPng(32, 32, (x, y) => {
  const dy = y - 16;
  // Nose pointing right (towards +X)
  if (x >= 4 && x <= 28) {
    const halfWidth = ((28 - x) / 24) * 12;
    if (Math.abs(dy) <= halfWidth) {
      if (x >= 18 && Math.abs(dy) <= 3) {
        return [56, 189, 248, 255]; // Cockpit cyan
      }
      return [30, 41, 59, 255]; // Slate hull
    }
  }
  return [0, 0, 0, 0];
});

// Sprite: Asteroid (craggy rock circle)
const asteroidPng = createPng(32, 32, (x, y) => {
  const dx = x - 16;
  const dy = y - 16;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx);
  const noise = Math.sin(angle * 5) * 2 + Math.cos(angle * 3) * 1.5;
  if (dist <= 12 + noise) {
    const shade = Math.floor(100 + Math.sin(x * 0.5 + y * 0.5) * 30);
    return [shade, shade + 10, shade + 15, 255];
  }
  return [0, 0, 0, 0];
});

// Sprite: Bullet (bright laser bolt)
const bulletPng = createPng(16, 16, (x, y) => {
  const dx = x - 8;
  const dy = y - 8;
  if (Math.abs(dy) <= 2 && Math.abs(dx) <= 6) {
    if (Math.abs(dy) <= 1 && Math.abs(dx) <= 4) {
      return [255, 255, 255, 255]; // white core
    }
    return [56, 189, 248, 255]; // cyan glow
  }
  return [0, 0, 0, 0];
});

// Sounds
// 1. Shoot (laser chirp)
const shootWav = createWav(0.12, (t, dur) => {
  const freq = 900 * (1 - t / dur) + 200;
  return Math.sin(2 * Math.PI * freq * t) * (1 - t / dur);
});

// 2. Hit (thud)
const hitWav = createWav(0.1, (t, dur) => {
  const freq = 160 * (1 - t / dur) + 40;
  return Math.sin(2 * Math.PI * freq * t) * (1 - t / dur);
});

// 3. Explosion (noise + rumble)
const explosionWav = createWav(0.28, (t, dur) => {
  const decay = Math.exp((-4 * t) / dur);
  const rumble = Math.sin(2 * Math.PI * 65 * t) * 0.4;
  const noise = (Math.random() * 2 - 1) * 0.6;
  return (rumble + noise) * decay;
});

// Arena definition
const arenaJson = JSON.stringify(
  {
    name: 'Deep Space Arena',
    width: 1200,
    height: 800,
    maxAsteroids: 6,
    theme: 'deep-space',
  },
  null,
  2
);

// Manifest definition
const manifestObj = {
  sprites: {
    ship: '/assets/sprites/ship.png',
    asteroid: '/assets/sprites/asteroid.png',
    bullet: '/assets/sprites/bullet.png',
  },
  sounds: {
    shoot: '/assets/sounds/shoot.wav',
    hit: '/assets/sounds/hit.wav',
    explosion: '/assets/sounds/explosion.wav',
  },
  arena: '/assets/arena.json',
};
const manifestJson = JSON.stringify(manifestObj, null, 2);

function writeFiles(baseDir) {
  fs.writeFileSync(path.join(baseDir, 'sprites/ship.png'), shipPng);
  fs.writeFileSync(path.join(baseDir, 'sprites/asteroid.png'), asteroidPng);
  fs.writeFileSync(path.join(baseDir, 'sprites/bullet.png'), bulletPng);
  fs.writeFileSync(path.join(baseDir, 'sounds/shoot.wav'), shootWav);
  fs.writeFileSync(path.join(baseDir, 'sounds/hit.wav'), hitWav);
  fs.writeFileSync(path.join(baseDir, 'sounds/explosion.wav'), explosionWav);
  fs.writeFileSync(path.join(baseDir, 'arena.json'), arenaJson);
  fs.writeFileSync(path.join(baseDir, 'manifest.json'), manifestJson);
}

writeFiles('public/assets');
writeFiles('assets');

console.log('Successfully generated all game assets in public/assets and assets!');
