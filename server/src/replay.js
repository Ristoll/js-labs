import fs from 'node:fs';
import readline from 'node:readline';

/**
 * Asynchronous generator that yields parsed JSON events line-by-line from an NDJSON replay file.
 * Uses streams to process arbitrarily large files without buffering them entirely in memory.
 *
 * @param {string} filePath Path to NDJSON file
 * @yields {object} Parsed event object
 */
export async function* createReplayGenerator(filePath) {
  const fileStream = fs.createReadStream(filePath, { encoding: 'utf8', highWaterMark: 64 * 1024 });

  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  try {
    for await (const line of rl) {
      const trimmed = line.trim();
      if (trimmed) {
        try {
          yield JSON.parse(trimmed);
        } catch (err) {
          throw new Error(`Corrupt NDJSON record: ${err.message}`, { cause: err });
        }
      }
    }
  } finally {
    rl.close();
    fileStream.destroy();
  }
}
