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

export interface RetryOptions {
  attempts?: number;
  baseMs?: number;
  signal?: AbortSignal | null;
}

export interface AssetTask {
  kind: string;
  key: string;
  url: string;
  load: () => Promise<unknown>;
}

export interface LoadedAssets {
  sprites: Record<string, HTMLImageElement>;
  sounds: Record<string, AudioBuffer>;
  arena: unknown;
  audioContext: AudioContext | null;
  manifest: unknown;
}

interface RetryError extends Error {
  attempts?: number;
  status?: number;
  statusCode?: number;
}

/**
 * Custom error class retaining HTTP status and URL context.
 */
export class HttpError extends Error {
  status: number;
  statusText: string;
  url: string;
  attempts: number;

  constructor(status: number, statusText: string, url: string) {
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
 */
export async function fetchJson(url: string, options: RequestInit = {}): Promise<unknown> {
  const res = await fetch(url, options);
  if (!res.ok) {
    throw new HttpError(res.status, res.statusText, url);
  }
  return await res.json();
}

/**
 * Waits for a retry delay and rejects immediately if the caller aborts.
 */
export function waitForRetryDelay(
  delayMs: number,
  _attempt: number,
  signal: AbortSignal | null = null
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('The operation was aborted.', 'AbortError'));
      return;
    }

    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      reject(new DOMException('The operation was aborted.', 'AbortError'));
    };

    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, delayMs);

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Retries an asynchronous function with exponential backoff and jitter.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  { attempts = 3, baseMs = 100, signal = null }: RetryOptions = {}
): Promise<T> {
  const retry = async (attempt: number): Promise<T> => {
    // User explicitly aborted — stop immediately.
    if (signal?.aborted) {
      const abortErr = new DOMException('The operation was aborted.', 'AbortError') as RetryError;
      abortErr.attempts = attempt;
      throw abortErr;
    }

    try {
      return await fn();
    } catch (err) {
      const e = err as RetryError;
      e.attempts = attempt;

      // 1. User-triggered abort: stop immediately, no retry.
      if (signal?.aborted) {
        throw e;
      }

      // 2. Never retry 4xx client errors (e.g., 404 Not Found, 403 Forbidden)
      const status = e.status ?? e.statusCode;
      if (typeof status === 'number' && status >= 400 && status < 500) {
        throw e;
      }

      // 3. Rethrow if final attempt exhausted
      if (attempt >= attempts) {
        throw e;
      }

      // 4. Exponential backoff + full random jitter: delay = baseMs * 2^(attempt-1) + jitter
      const backoff = baseMs * 2 ** (attempt - 1);
      const jitter = Math.random() * baseMs;

      // Abort-aware delay — interrupts the wait if the user aborts during backoff.
      await waitForRetryDelay(backoff + jitter, attempt, signal);
      return retry(attempt + 1);
    }
  };

  return retry(1);
}

/**
 * Loads an image from a URL, wrapped with retry and cancellation support.
 */
export async function loadImage(
  url: string,
  { signal = null, attempts = 3, baseMs = 100 }: RetryOptions = {}
): Promise<HTMLImageElement> {
  return withRetry(
    async () => {
      const res = await fetch(url, { signal });
      if (!res.ok) {
        throw new HttpError(res.status, res.statusText, url);
      }
      const blob = await res.blob();

      return new Promise<HTMLImageElement>((resolve, reject) => {
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
          onAbort();
          return;
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
 */
export async function loadAudio(
  ctx: AudioContext | null,
  url: string,
  { signal = null, attempts = 3, baseMs = 100 }: RetryOptions = {}
): Promise<AudioBuffer> {
  const audioCtx = resolveAudioContext(ctx);

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
 */
export async function loadJson(
  url: string,
  { signal = null, attempts = 3, baseMs = 100 }: RetryOptions = {}
): Promise<unknown> {
  return withRetry(() => fetchJson(url, { signal }), { attempts, baseMs, signal });
}

function resolveAudioContext(ctx: AudioContext | null): AudioContext | null {
  if (ctx) return ctx;
  if (typeof window === 'undefined') return null;
  const win = window as Window & typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
    __sharedAudioContext?: AudioContext;
  };
  const Ctor = win.AudioContext ?? win.webkitAudioContext;
  if (!Ctor) return null;

  win.__sharedAudioContext ??= new Ctor();
  return win.__sharedAudioContext;
}

/**
 * Normalizes manifest input and collects items to load.
 */
function prepareManifestTasks(
  manifest: Record<string, unknown>,
  { audioContext, signal, delayMs = 0 }: { audioContext: AudioContext | null; signal: AbortSignal | null; delayMs?: number }
): AssetTask[] {
  const tasks: AssetTask[] = [];

  const appendDelay = (url: string): string => {
    if (!delayMs || delayMs <= 0) return url;
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}delay=${delayMs}`;
  };

  // 1. Sprites
  if (manifest.sprites) {
    for (const [key, rawUrl] of Object.entries(manifest.sprites as Record<string, string>)) {
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
    for (const [key, rawUrl] of Object.entries(manifest.sounds as Record<string, string>)) {
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
 */
export async function loadAll(
  manifestOrUrl: string | Record<string, unknown>,
  { audioContext = null, onProgress = null, signal = null, delayMs = 0 }: {
    audioContext?: AudioContext | null;
    onProgress?: ((progress: number, info: { done: number; total: number; key: string; kind: string; url: string }) => void) | null;
    signal?: AbortSignal | null;
    delayMs?: number;
  } = {}
): Promise<LoadedAssets> {
  const ctx = resolveAudioContext(audioContext);

  const manifest: Record<string, unknown> = typeof manifestOrUrl === 'string'
    ? await loadJson(manifestOrUrl, { signal }) as Record<string, unknown>
    : manifestOrUrl;

  const tasks = prepareManifestTasks(manifest, { audioContext: ctx, signal, delayMs });
  const total = tasks.length;
  let done = 0;

  if (total === 0) {
    if (onProgress) onProgress(1.0, { done: 0, total: 0, key: '', kind: '', url: '' });
    return { sprites: {}, sounds: {}, arena: null, audioContext: ctx, manifest };
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
  const assets: LoadedAssets = {
    sprites: {},
    sounds: {},
    arena: null,
    audioContext: ctx,
    manifest,
  };

  for (const item of loadedItems) {
    if (item.kind === 'sprites') {
      assets.sprites[item.key] = item.result as HTMLImageElement;
    } else if (item.kind === 'sounds') {
      assets.sounds[item.key] = item.result as AudioBuffer;
    } else if (item.kind === 'arena') {
      assets.arena = item.result;
    }
  }

  return assets;
}

/**
 * Loads all assets sequentially (one await after another) for benchmarking against Promise.all.
 */
export async function loadAllSequential(
  manifestOrUrl: string | Record<string, unknown>,
  { audioContext = null, onProgress = null, signal = null, delayMs = 0 }: {
    audioContext?: AudioContext | null;
    onProgress?: ((progress: number, info: any) => void) | null;
    signal?: AbortSignal | null;
    delayMs?: number;
  } = {}
): Promise<LoadedAssets> {
  const ctx = resolveAudioContext(audioContext);

  const manifest = typeof manifestOrUrl === 'string'
    ? await loadJson(manifestOrUrl, { signal }) as Record<string, unknown>
    : manifestOrUrl;

  const tasks = prepareManifestTasks(manifest, { audioContext: ctx, signal, delayMs });
  const total = tasks.length;
  let done = 0;

  const assets: LoadedAssets = {
    sprites: {},
    sounds: {},
    arena: null,
    audioContext: ctx,
    manifest,
  };

  await Promise.all(tasks.map(async (task) => {
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
      assets.sprites[task.key] = result as HTMLImageElement;
    } else if (task.kind === 'sounds') {
      assets.sounds[task.key] = result as AudioBuffer;
    } else if (task.kind === 'arena') {
      assets.arena = result;
    }
  }));

  return assets;
}
