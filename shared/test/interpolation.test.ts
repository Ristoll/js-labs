import { describe, expect, it } from 'vitest';
import {
  lerp,
  lerpAngle,
  lerpCoordinate,
  interpolateSnapshotEntities,
  SnapshotBuffer,
} from '../src/sim/interpolation.ts';
import type { EntitySnapshot } from '../src/types.ts';

const shipSnap = (id: number, x: number, y: number, angle = 0): EntitySnapshot => ({
  kind: 'ship',
  id,
  x,
  y,
  vx: 0,
  vy: 0,
  angle,
  radius: 16,
  alive: true,
  hp: 3,
  thrust: false,
  reverse: false,
  playerId: null,
});

describe('interpolation lerp', () => {
  it('lerp', () => {
    expect(lerp(0, 10, 0.5)).toBe(5);
    expect(lerp(0, 10, 0)).toBe(0);
    expect(lerp(0, 10, 1)).toBe(10);
  });

  it('lerpAngle wraps shortest path', () => {
    expect(lerpAngle(0, Math.PI / 2, 0.5)).toBeCloseTo(Math.PI / 4, 6);
    expect(lerpAngle(0, -Math.PI / 2, 0.5)).toBeCloseTo(-Math.PI / 4, 6);
    expect(lerpAngle(0, Math.PI * 2, 0.5)).toBeCloseTo(0, 6);
  });

  it('lerpCoordinate wraps across arena boundary', () => {
    // no boundary: plain lerp
    expect(lerpCoordinate(0, 10, 0.5, 0)).toBe(5);
    // boundary wrap: from 990 to 20 on width 1000 -> midpoint wraps to 5
    expect(lerpCoordinate(990, 20, 0.5, 1000)).toBeCloseTo(5, 6);
    // boundary <= 0 falls back to lerp
    expect(lerpCoordinate(0, 10, 0.5, -1)).toBe(5);
  });
});

describe('interpolateSnapshotEntities', () => {
  it('interpolates matching ids and passes through new entities', () => {
    const e0 = [shipSnap(1, 0, 0), shipSnap(2, 100, 100)];
    const e1 = [shipSnap(1, 10, 10), shipSnap(3, 50, 50)];
    const result = interpolateSnapshotEntities(e0, e1, 0.5, null);
    const byId = new Map(result.map((e) => [e.id, e]));
    expect(byId.get(1)!.x).toBe(5);
    expect(byId.get(1)!.y).toBe(5);
    // t=0.5 < 0.95, so removed entity id 2 is kept
    expect(byId.get(2)).toBeDefined();
    expect(byId.get(3)!.x).toBe(50);
  });

  it('keeps removed entity when t < 0.95', () => {
    const e0 = [shipSnap(1, 0, 0)];
    const e1: EntitySnapshot[] = [];
    const result = interpolateSnapshotEntities(e0, e1, 0.5, null);
    expect(result.length).toBe(1);
    expect(result[0].id).toBe(1);
  });

  it('drops removed entity when t >= 0.95', () => {
    const e0 = [shipSnap(1, 0, 0)];
    const e1: EntitySnapshot[] = [];
    const result = interpolateSnapshotEntities(e0, e1, 0.95, null);
    expect(result.length).toBe(0);
  });
});

describe('SnapshotBuffer', () => {
  const baseTime = 1000;

  it('starts empty, push increases size, clear resets', () => {
    const buf = new SnapshotBuffer();
    expect(buf.size).toBe(0);
    buf.push({ timestamp: baseTime, tick: 1, entities: [] });
    expect(buf.size).toBe(1);
    buf.clear();
    expect(buf.size).toBe(0);
  });

  it('setDelay clamps negative to 0', () => {
    const buf = new SnapshotBuffer();
    buf.setDelay(-5);
    expect((buf as any).interpolationDelay).toBe(0);
    buf.setDelay(100);
    expect((buf as any).interpolationDelay).toBe(100);
    buf.push({ timestamp: baseTime, tick: 1, entities: [shipSnap(1, 0, 0)] }, baseTime);
    const r = buf.interpolate(baseTime - 1000);
    expect(r.status).toBe('buffering');
  });

  it('interpolate empty returns empty', () => {
    const buf = new SnapshotBuffer();
    expect(buf.interpolate(1000).status).toBe('empty');
  });

  it('interpolate buffering when render time before first frame', () => {
    const buf = new SnapshotBuffer();
    buf.push({ timestamp: baseTime, tick: 1, entities: [shipSnap(1, 0, 0)] }, baseTime);
    const r = buf.interpolate(baseTime - 100);
    expect(r.status).toBe('buffering');
    expect(r.entities.length).toBe(1);
  });

  it('interpolate starvation when render time after latest', () => {
    const buf = new SnapshotBuffer();
    buf.push({ timestamp: baseTime, tick: 1, entities: [shipSnap(1, 0, 0)] }, baseTime);
    const r = buf.interpolate(baseTime + 1000);
    expect(r.status).toBe('starvation');
    expect(r.t).toBe(1);
  });

  it('interpolate interpolating between two frames', () => {
    const buf = new SnapshotBuffer(0); // no delay
    buf.push({ timestamp: baseTime, tick: 1, entities: [shipSnap(1, 0, 0)] }, baseTime);
    buf.push({ timestamp: baseTime + 100, tick: 2, entities: [shipSnap(1, 100, 100)] }, baseTime + 100);
    const r = buf.interpolate(baseTime + 50);
    expect(r.status).toBe('interpolating');
    expect(r.t).toBe(0.5);
    expect(r.s0Tick).toBe(1);
    expect(r.s1Tick).toBe(2);
    expect(r.entities[0].x).toBe(50);
  });
});
