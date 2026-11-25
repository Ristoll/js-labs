/**
 * Shared snapshot interpolation routines for Lab 05 M3.
 */
import type { EntitySnapshot } from '../types.ts';

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function lerpAngle(from: number, to: number, t: number): number {
  const twoPi = Math.PI * 2;
  const diff = (to - from) % twoPi;
  const shortest = ((diff + Math.PI * 3) % twoPi) - Math.PI;
  return from + shortest * t;
}

export function lerpCoordinate(from: number, to: number, t: number, boundary: number): number {
  if (!boundary || boundary <= 0) return lerp(from, to, t);

  const half = boundary / 2;
  let delta = to - from;

  if (delta > half) {
    delta -= boundary;
  } else if (delta < -half) {
    delta += boundary;
  }

  const result = from + delta * t;
  return ((result % boundary) + boundary) % boundary;
}

export function interpolateSnapshotEntities(
  entities0: readonly EntitySnapshot[],
  entities1: readonly EntitySnapshot[],
  t: number,
  arena: { readonly width: number; readonly height: number } | null = null
): EntitySnapshot[] {
  const map0 = new Map((entities0 || []).map((e) => [e.id, e]));
  const map1 = new Map((entities1 || []).map((e) => [e.id, e]));

  const result: EntitySnapshot[] = [];
  const arenaWidth = arena?.width || 0;
  const arenaHeight = arena?.height || 0;

  for (const [id, e1] of map1) {
    const e0 = map0.get(id);

    if (e0) {
      const x = lerpCoordinate(e0.x, e1.x, t, arenaWidth);
      const y = lerpCoordinate(e0.y, e1.y, t, arenaHeight);
      const angle = lerpAngle(e0.angle, e1.angle, t);

      result.push({
        ...e1,
        x: Number(x.toFixed(2)),
        y: Number(y.toFixed(2)),
        angle: Number(angle.toFixed(4)),
      });
    } else {
      result.push({ ...e1 });
    }
  }

  for (const [id, e0] of map0) {
    if (!map1.has(id) && t < 0.95) {
      result.push({ ...e0 });
    }
  }

  return result;
}

export interface SnapshotFrame {
  readonly timestamp: number;
  readonly tick: number;
  readonly entities: EntitySnapshot[];
  readonly serverTime?: number;
  readonly lastProcessedSeq?: Record<string, number>;
}

export class SnapshotBuffer {
  interpolationDelay: number;
  maxBufferSize: number;
  buffer: SnapshotFrame[];

  constructor(interpolationDelay = 66.67, maxBufferSize = 60) {
    this.interpolationDelay = interpolationDelay;
    this.maxBufferSize = maxBufferSize;
    this.buffer = [];
  }

  push(snapshot: SnapshotFrame, timestamp = performance.now()): void {
    if (!snapshot || !Array.isArray(snapshot.entities)) return;

    const entry: SnapshotFrame = {
      timestamp,
      serverTime: snapshot.serverTime ?? timestamp,
      tick: snapshot.tick ?? 0,
      entities: snapshot.entities,
      lastProcessedSeq: snapshot.lastProcessedSeq ?? {},
    };

    this.buffer.push(entry);

    if (
      this.buffer.length > 1 &&
      this.buffer[this.buffer.length - 2]!.timestamp > timestamp
    ) {
      this.buffer.sort((a, b) => a.timestamp - b.timestamp);
    }

    while (this.buffer.length > this.maxBufferSize) {
      this.buffer.shift();
    }
  }

  setDelay(delayMs: unknown): void {
    this.interpolationDelay = Math.max(0, Number(delayMs) || 0);
  }

  clear(): void {
    this.buffer.length = 0;
  }

  get size(): number {
    return this.buffer.length;
  }

  interpolate(
    now = performance.now(),
    arena: { readonly width: number; readonly height: number } | null = null
  ): {
    status: string;
    entities: EntitySnapshot[];
    t: number;
    s0Tick?: number;
    s1Tick?: number;
  } {
    if (this.buffer.length === 0) {
      return { status: 'empty', entities: [], t: 0 };
    }

    const renderTime = now - this.interpolationDelay;

    if (renderTime <= this.buffer[0]!.timestamp) {
      return {
        status: 'buffering',
        entities: this.buffer[0]!.entities,
        t: 0,
        s0Tick: this.buffer[0]!.tick,
        s1Tick: this.buffer[0]!.tick,
      };
    }

    const latest = this.buffer[this.buffer.length - 1]!;
    if (renderTime >= latest.timestamp) {
      return {
        status: 'starvation',
        entities: latest.entities,
        t: 1,
        s0Tick: latest.tick,
        s1Tick: latest.tick,
      };
    }

    let s0 = this.buffer[0]!;
    let s1 = latest;

    for (let i = 0; i < this.buffer.length - 1; i++) {
      if (this.buffer[i]!.timestamp <= renderTime && renderTime <= this.buffer[i + 1]!.timestamp) {
        s0 = this.buffer[i]!;
        s1 = this.buffer[i + 1]!;
        break;
      }
    }

    const span = s1.timestamp - s0.timestamp;
    const t = span > 0 ? Math.max(0, Math.min(1, (renderTime - s0.timestamp) / span)) : 1;

    const entities = interpolateSnapshotEntities(s0.entities, s1.entities, t, arena);

    return {
      status: 'interpolating',
      entities,
      t,
      s0Tick: s0.tick,
      s1Tick: s1.tick,
    };
  }
}


