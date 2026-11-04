import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const replaysDir = path.resolve(__dirname, '../replays');
const targetFile = path.join(replaysDir, 'synth-200mb.ndjson');
const targetBytes = 205 * 1024 * 1024; // 205 MB to ensure >= 200MB

fs.mkdirSync(replaysDir, { recursive: true });

console.log(`Generating >= 200 MB synthetic match log at: ${targetFile}`);

const writeStream = fs.createWriteStream(targetFile, { highWaterMark: 1024 * 1024 });

let writtenBytes = 0;
let eventIndex = 0;
const startTs = 1700000000000;

function writeNext() {
  let canContinue = true;
  while (canContinue && writtenBytes < targetBytes) {
    eventIndex++;
    const sampleRecord = {
      seq: eventIndex,
      type: eventIndex % 5 === 0 ? 'fire' : eventIndex % 7 === 0 ? 'hit' : 'pos_update',
      roomId: 'bench-room-alpha',
      timestamp: startTs + eventIndex * 16,
      data: {
        entityId: (eventIndex % 4) + 1,
        x: Math.sin(eventIndex) * 500,
        y: Math.cos(eventIndex) * 500,
        vx: (eventIndex % 3) * 10,
        vy: (eventIndex % 4) * 10,
        hp: 3 - (eventIndex % 3),
        payloadDetails: 'payload-padding-string-for-streaming-benchmark-purposes-1234567890-abcdefghijklmnopqrstuvwxyz',
      },
    };

    const line = JSON.stringify(sampleRecord) + '\n';
    const buf = Buffer.from(line);
    writtenBytes += buf.length;

    canContinue = writeStream.write(buf);
  }

  if (writtenBytes < targetBytes) {
    writeStream.once('drain', writeNext);
  } else {
    writeStream.end(() => {
      console.log(`Successfully generated ${(writtenBytes / 1024 / 1024).toFixed(2)} MB (${writtenBytes} bytes, ${eventIndex} events).`);
    });
  }
}

writeNext();
