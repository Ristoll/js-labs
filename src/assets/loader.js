/**
 * Asset pipeline loader for Dogfight.
 *
 * Implements:
 * - fetchJson with response.ok validation.
 * - withRetry with exponential backoff + jitter (never retrying 4xx).
 * - loadImage, loadAudio, and loadJson with AbortSignal support.
 * - loadAll using Promise.all with per-item progress tracking.
 * - loadAllSequential for concurrent vs sequential timing benchmarks.
 */

/**
 * Custom error class retaining HTTP status and URL context.
 */
export class HttpError extends Error {
  constructor(status, statusText, url) {
    super(`HTTP ${status} (${statusText}) while fetching ${url}`);
    this.name = 'HttpError';
    this.status = status;
    this.statusText = statusText;
    this.url = url;
    this.attempts = 1;
  }
}

/**
 * Shared JSON fetcher that verifies response.ok before decoding body.
 * Throws HttpError on any non-2xx status.
 *
 * @param {string} url
 * @param {RequestInit} [options={}]
 * @returns {Promise<any>}
 */
export async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) {
    throw new HttpError(res.status, res.statusText, url);
  }
  return await res.json();
}

/**
 * Retries an asynchronous function with exponential backoff and jitter.
 * Rules:
 * - 4xx errors (Client Error, e.g. 404) are never retried.
 * - Aborted requests (AbortError or signal.aborted) immediately rethrow.
 * - 5xx and network errors retry up to `attempts` times.
 *
 * @template T
 * @param {() => Promise<T>} fn Async function to execute
 * @param {Object} [options={}]
 * @param {number} [options.attempts=3] Maximum number of execution attempts
 * @param {number} [options.baseMs=100] Base backoff delay in milliseconds
 * @param {AbortSignal} [options.signal] Optional cancellation signal
 * @returns {Promise<T>}
 */
export async function withRetry(fn, { attempts = 3, baseMs = 100, signal = null } = {}) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (signal?.aborted) {
      const abortErr = new DOMException('The operation was aborted.', 'AbortError');
      abortErr.attempts = attempt;
      throw abortErr;
    }

    try {
      return await fn();
    } catch (err) {
      err.attempts = attempt;

      // 1. Never retry if aborted
      if (signal?.aborted || err.name === 'AbortError') {
        throw err;
      }

      // 2. Never retry 4xx client errors (e.g., 404 Not Found, 403 Forbidden)
      const status = err.status || err.statusCode;
      if (typeof status === 'number' && status >= 400 && status < 500) {
        throw err;
      }

      // 3. Rethrow if final attempt exhausted
      if (attempt >= attempts) {
        throw err;
      }

      // 4. Exponential backoff + full random jitter: delay = baseMs * 2^(attempt-1) + jitter
      const backoff = baseMs * 2 ** (attempt - 1);
      const jitter = Math.random() * baseMs;
      const delay = backoff + jitter;

      // Abort-aware delay
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          signal?.removeEventListener('abort', onAbort);
          resolve();
        }, delay);

        const onAbort = () => {
          clearTimeout(timer);
          const abortErr = new DOMException('The operation was aborted.', 'AbortError');
          abortErr.attempts = attempt;
          reject(abortErr);
        };

        if (signal?.aborted) {
          return onAbort();
        }
        signal?.addEventListener('abort', onAbort, { once: true });
      });
    }
  }

  throw new Error('Retry loop terminated unexpectedly.');
}

/**
 * Loads an image from a URL, wrapped with retry and cancellation support.
 * Uses fetch to verify HTTP status (ensuring 404 is caught and not retried),
 * then creates an Image element from a Blob.
 *
 * @param {string} url
 * @param {Object} [options={}]
 * @param {AbortSignal} [options.signal]
 * @param {number} [options.attempts=3]
 * @param {number} [options.baseMs=100]
 * @returns {Promise<HTMLImageElement>}
 */
export async function loadImage(url, { signal = null, attempts = 3, baseMs = 100 } = {}) {
  return withRetry(
    async () => {
      const res = await fetch(url, { signal });
      if (!res.ok) {
        throw new HttpError(res.status, res.statusText, url);
      }
      const blob = await res.blob();

      return new Promise((resolve, reject) => {
        const img = new Image();
        const objectUrl = URL.createObjectURL(blob);

        const cleanup = () => {
          URL.revokeObjectURL(objectUrl);
          signal?.removeEventListener('abort', onAbort);
        };

        const onAbort = () => {
          cleanup();
          img.src = '';
          const abortErr = new DOMException('The operation was aborted.', 'AbortError');
          reject(abortErr);
        };

        if (signal?.aborted) {
          return onAbort();
        }
        signal?.addEventListener('abort', onAbort, { once: true });

        img.onload = () => {
          cleanup();
          resolve(img);
        };

        img.onerror = () => {
          cleanup();
          reject(new Error(`Failed to decode image at ${url}`));
        };

        img.src = objectUrl;
      });
    },
    { attempts, baseMs, signal }
  );
}

/**
 * Loads and decodes an audio file into a Web Audio AudioBuffer.
 * Pre-decoding during load time ensures zero-latency playback in game.
 *
 * @param {AudioContext} ctx Web Audio context
 * @param {string} url Audio file URL (e.g. .wav, .mp3, .ogg)
 * @param {Object} [options={}]
 * @param {AbortSignal} [options.signal]
 * @param {number} [options.attempts=3]
 * @param {number} [options.baseMs=100]
 * @returns {Promise<AudioBuffer>}
 */
export async function loadAudio(ctx, url, { signal = null, attempts = 3, baseMs = 100 } = {}) {
  const audioCtx =
    ctx ||
    (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)
      ? (window.__sharedAudioContext ||= new (window.AudioContext || window.webkitAudioContext)())
      : null);

  if (!audioCtx) {
    throw new Error('loadAudio requires a valid AudioContext instance.');
  }

  return withRetry(
    async () => {
      const res = await fetch(url, { signal });
      if (!res.ok) {
        throw new HttpError(res.status, res.statusText, url);
      }
      const arrayBuffer = await res.arrayBuffer();
      return await audioCtx.decodeAudioData(arrayBuffer);
    },
    { attempts, baseMs, signal }
  );
}

/**
 * Loads and parses a JSON file, wrapped with retry and cancellation support.
 *
 * @param {string} url
 * @param {Object} [options={}]
 * @param {AbortSignal} [options.signal]
 * @param {number} [options.attempts=3]
 * @param {number} [options.baseMs=100]
 * @returns {Promise<any>}
 */
export async function loadJson(url, { signal = null, attempts = 3, baseMs = 100 } = {}) {
  return withRetry(() => fetchJson(url, { signal }), { attempts, baseMs, signal });
}

/**
 * Normalizes manifest input and collects items to load.
 */
function prepareManifestTasks(manifest, { audioContext, signal, delayMs = 0 }) {
  const tasks = [];

  const appendDelay = (url) => {
    if (!delayMs || delayMs <= 0) return url;
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}delay=${delayMs}`;
  };

  // 1. Sprites
  if (manifest.sprites) {
    for (const [key, rawUrl] of Object.entries(manifest.sprites)) {
      const url = appendDelay(rawUrl);
      tasks.push({
        kind: 'sprites',
        key,
        url,
        load: () => loadImage(url, { signal }),
      });
    }
  }

  // 2. Sounds
  if (manifest.sounds) {
    for (const [key, rawUrl] of Object.entries(manifest.sounds)) {
      const url = appendDelay(rawUrl);
      tasks.push({
        kind: 'sounds',
        key,
        url,
        load: () => loadAudio(audioContext, url, { signal }),
      });
    }
  }

  // 3. Arena
  if (manifest.arena) {
    if (typeof manifest.arena === 'string') {
      const url = appendDelay(manifest.arena);
      tasks.push({
        kind: 'arena',
        key: 'arena',
        url,
        load: () => loadJson(url, { signal }),
      });
    } else {
      tasks.push({
        kind: 'arena',
        key: 'arena',
        url: 'inline',
        load: async () => manifest.arena,
      });
    }
  }

  return tasks;
}

/**
 * Loads all assets in manifest concurrently using Promise.all with per-item progress.
 *
 * Pattern:
 * Wraps each promise with `.then(v => { done++; onProgress(done / total); return v; })`
 *
 * @param {string|Object} manifestOrUrl Manifest object or URL to manifest.json
 * @param {Object} [options={}]
 * @param {AudioContext} [options.audioContext] AudioContext for decoding audio
 * @param {(progress: number, info: { done: number, total: number, key: string, kind: string, url: string }) => void} [options.onProgress]
 * @param {AbortSignal} [options.signal]
 * @param {number} [options.delayMs=0] Optional simulated network delay per asset
 * @returns {Promise<{ sprites: Record<string, HTMLImageElement>, sounds: Record<string, AudioBuffer>, arena: any, audioContext: AudioContext }>}
 */
export async function loadAll(
  manifestOrUrl,
  { audioContext = null, onProgress = null, signal = null, delayMs = 0 } = {}
) {
  const ctx =
    audioContext ||
    (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)
      ? (window.__sharedAudioContext ||= new (window.AudioContext || window.webkitAudioContext)())
      : null);

  const manifest =
    typeof manifestOrUrl === 'string' ? await loadJson(manifestOrUrl, { signal }) : manifestOrUrl;

  const tasks = prepareManifestTasks(manifest, { audioContext: ctx, signal, delayMs });
  const total = tasks.length;
  let done = 0;

  if (total === 0) {
    if (onProgress) onProgress(1.0, { done: 0, total: 0, key: '', kind: '', url: '' });
    return { sprites: {}, sounds: {}, arena: null, audioContext: ctx };
  }

  // Wrap each promise to emit per-item progress when fulfilled
  const wrappedPromises = tasks.map((task) =>
    task.load().then((result) => {
      done++;
      if (onProgress) {
        onProgress(done / total, {
          done,
          total,
          key: task.key,
          kind: task.kind,
          url: task.url,
        });
      }
      return { kind: task.kind, key: task.key, result };
    })
  );

  const loadedItems = await Promise.all(wrappedPromises);

  // Group results into structured asset pack
  const assets = {
    sprites: {},
    sounds: {},
    arena: null,
    audioContext: ctx,
    manifest,
  };

  for (const item of loadedItems) {
    if (item.kind === 'sprites') {
      assets.sprites[item.key] = item.result;
    } else if (item.kind === 'sounds') {
      assets.sounds[item.key] = item.result;
    } else if (item.kind === 'arena') {
      assets.arena = item.result;
    }
  }

  return assets;
}

/**
 * Loads all assets sequentially (one await after another) for benchmarking against Promise.all.
 *
 * @param {string|Object} manifestOrUrl
 * @param {Object} [options={}]
 * @param {AudioContext} [options.audioContext]
 * @param {(progress: number, info: any) => void} [options.onProgress]
 * @param {AbortSignal} [options.signal]
 * @param {number} [options.delayMs=0]
 * @returns {Promise<any>}
 */
export async function loadAllSequential(
  manifestOrUrl,
  { audioContext = null, onProgress = null, signal = null, delayMs = 0 } = {}
) {
  const ctx =
    audioContext ||
    (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)
      ? (window.__sharedAudioContext ||= new (window.AudioContext || window.webkitAudioContext)())
      : null);

  const manifest =
    typeof manifestOrUrl === 'string' ? await loadJson(manifestOrUrl, { signal }) : manifestOrUrl;

  const tasks = prepareManifestTasks(manifest, { audioContext: ctx, signal, delayMs });
  const total = tasks.length;
  let done = 0;

  const assets = {
    sprites: {},
    sounds: {},
    arena: null,
    audioContext: ctx,
    manifest,
  };

  for (const task of tasks) {
    const result = await task.load();
    done++;
    if (onProgress) {
      onProgress(done / total, {
        done,
        total,
        key: task.key,
        kind: task.kind,
        url: task.url,
      });
    }

    if (task.kind === 'sprites') {
      assets.sprites[task.key] = result;
    } else if (task.kind === 'sounds') {
      assets.sounds[task.key] = result;
    } else if (task.kind === 'arena') {
      assets.arena = result;
    }
  }

  return assets;
}
