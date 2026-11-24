/**
 * Shared snapshot interpolation routines for Lab 05 M3.
 */

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function lerpAngle(from, to, t) {
  const twoPi = Math.PI * 2;
  const diff = (to - from) % twoPi;
  const shortest = ((diff + Math.PI * 3) % twoPi) - Math.PI;
  return from + shortest * t;
}

export function lerpCoordinate(from, to, t, boundary) {
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

/**
 * Interpolates entity states between two snapshot frames.
 *
 * @param {Array<object>} entities0 Snapshot S0 entities
 * @param {Array<object>} entities1 Snapshot S1 entities
 * @param {number} t Interpolation factor in [0, 1]
 * @param {object} [arena] Arena boundaries { width, height }
 * @returns {Array<object>}
 */
export function interpolateSnapshotEntities(entities0, entities1, t, arena = null) {
  const map0 = new Map((entities0 || []).map((e) => [e.id, e]));
  const map1 = new Map((entities1 || []).map((e) => [e.id, e]));

  const result = [];
  const arenaWidth = arena?.width || 0;
  const arenaHeight = arena?.height || 0;

  // 1. Entities present in S1 (persisted or newly appeared)
  for (const [id, e1] of map1) {
    const e0 = map0.get(id);

    if (e0) {
      // Entity exists in both snapshots: interpolate position & angle
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
      // Entity appeared in S1: show at S1 position
      result.push({ ...e1 });
    }
  }

  // 2. Entities present in S0 but missing in S1 (destroyed / despawned)
  // If interpolation factor t < 1, entity was still existing during part of the bracket
  for (const [id, e0] of map0) {
    if (!map1.has(id) && t < 0.95) {
      result.push({ ...e0 });
    }
  }

  return result;
}

/**
 * Snapshot sliding-window interpolation buffer.
 */
export class SnapshotBuffer {
  /**
   * @param {number} [interpolationDelay=66.67] Delay in milliseconds (2 ticks at 30 Hz)
   * @param {number} [maxBufferSize=60] Maximum snapshots retained in memory
   */
  constructor(interpolationDelay = 66.67, maxBufferSize = 60) {
    this.interpolationDelay = interpolationDelay;
    this.maxBufferSize = maxBufferSize;
    this.buffer = [];
  }

  push(snapshot, timestamp = performance.now()) {
    if (!snapshot || !Array.isArray(snapshot.entities)) return;

    const entry = {
      timestamp,
      serverTime: snapshot.serverTime || timestamp,
      tick: snapshot.tick || 0,
      entities: snapshot.entities,
      lastProcessedSeq: snapshot.lastProcessedSeq || {},
    };

    this.buffer.push(entry);

    if (this.buffer.length > 1 && this.buffer[this.buffer.length - 2].timestamp > timestamp) {
      this.buffer.sort((a, b) => a.timestamp - b.timestamp);
    }

    while (this.buffer.length > this.maxBufferSize) {
      this.buffer.shift();
    }
  }

  setDelay(delayMs) {
    this.interpolationDelay = Math.max(0, Number(delayMs) || 0);
  }

  clear() {
    this.buffer.length = 0;
  }

  get size() {
    return this.buffer.length;
  }

  /**
   * Evaluates interpolated world entities at renderTime = now - interpolationDelay.
   *
   * @param {number} [now=performance.now()]
   * @param {object} [arena]
   * @returns {{ status: string, entities: Array<object>, t: number, s0Tick?: number, s1Tick?: number }}
   */
  interpolate(now = performance.now(), arena = null) {
    if (this.buffer.length === 0) {
      return { status: 'empty', entities: [], t: 0 };
    }

    const renderTime = now - this.interpolationDelay;

    // Buffer underrun: renderTime is older than our oldest stored snapshot
    if (renderTime <= this.buffer[0].timestamp) {
      return {
        status: 'buffering',
        entities: this.buffer[0].entities,
        t: 0,
        s0Tick: this.buffer[0].tick,
        s1Tick: this.buffer[0].tick,
      };
    }

    // Buffer starvation: renderTime is ahead of our newest snapshot (network jitter/stall)
    const latest = this.buffer[this.buffer.length - 1];
    if (renderTime >= latest.timestamp) {
      return {
        status: 'starvation',
        entities: latest.entities,
        t: 1,
        s0Tick: latest.tick,
        s1Tick: latest.tick,
      };
    }

    // Find bracketing snapshots: S0 <= renderTime <= S1
    let s0 = this.buffer[0];
    let s1 = latest;

    for (let i = 0; i < this.buffer.length - 1; i++) {
      if (this.buffer[i].timestamp <= renderTime && renderTime <= this.buffer[i + 1].timestamp) {
        s0 = this.buffer[i];
        s1 = this.buffer[i + 1];
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
