import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SnapshotBuffer, interpolateSnapshotEntities, lerpAngle } from 'shared/sim';

test('SnapshotBuffer accurately brackets renderTime and computes factor t', () => {
  const buffer = new SnapshotBuffer(100); // 100 ms in the past

  // Push 3 snapshots at t = 1000, 1033, 1066
  buffer.push({ tick: 1, entities: [{ id: 10, kind: 'ship', x: 100, y: 100, angle: 0 }] }, 1000);
  buffer.push({ tick: 2, entities: [{ id: 10, kind: 'ship', x: 150, y: 120, angle: 0.5 }] }, 1033);
  buffer.push({ tick: 3, entities: [{ id: 10, kind: 'ship', x: 200, y: 140, angle: 1.0 }] }, 1066);

  // Render at now = 1140 -> renderTime = 1140 - 100 = 1040 ms
  // Should bracket between S(1033) and S(1066)
  const result = buffer.interpolate(1140);
  assert.strictEqual(result.status, 'interpolating');
  assert.strictEqual(result.s0Tick, 2);
  assert.strictEqual(result.s1Tick, 3);

  // Expected t = (1040 - 1033) / (1066 - 1033) = 7 / 33 ~= 0.212
  assert.ok(Math.abs(result.t - 7 / 33) < 0.01);

  // Interpolated ship position: x = 150 + 50 * (7/33) ~= 160.6
  const ship = result.entities.find((e) => e.id === 10);
  assert.ok(ship);
  assert.ok(ship.x > 150 && ship.x < 200);
});

test('SnapshotBuffer handles buffer underrun and starvation gracefully', () => {
  const buffer = new SnapshotBuffer(100);
  buffer.push({ tick: 10, entities: [{ id: 1, x: 50, y: 50 }] }, 2000);

  // now = 2050 -> renderTime = 1950 (older than oldest snapshot at 2000)
  const underrun = buffer.interpolate(2050);
  assert.strictEqual(underrun.status, 'buffering');
  assert.strictEqual(underrun.t, 0);

  // now = 2300 -> renderTime = 2200 (newer than newest snapshot at 2000)
  const starvation = buffer.interpolate(2300);
  assert.strictEqual(starvation.status, 'starvation');
  assert.strictEqual(starvation.t, 1);
});

test('interpolateSnapshotEntities handles toroidal wrap-around boundaries correctly', () => {
  const arena = { width: 1200, height: 800 };

  // Ship crossing boundary: from x = 1190 to x = 10 (moved forward by 20 px across wrap boundary)
  const e0 = [{ id: 1, kind: 'ship', x: 1190, y: 400, angle: 0 }];
  const e1 = [{ id: 1, kind: 'ship', x: 10, y: 400, angle: 0 }];

  // At midpoint t = 0.5, position must be x = 1200 == 0, NOT x = 600 (center screen snap)
  const interpolated = interpolateSnapshotEntities(e0, e1, 0.5, arena);
  assert.strictEqual(interpolated.length, 1);

  const ship = interpolated[0];
  // 1190 + 10 (half of 20px delta) = 1200 % 1200 = 0
  assert.ok(ship.x === 0 || ship.x === 1200 || Math.abs(ship.x) < 2);
});

test('lerpAngle unwraps shortest circular arc across -PI <-> PI', () => {
  // From 3.10 rad (~177 deg) to -3.10 rad (~-177 deg)
  // Shortest arc is turning +6 deg across the boundary, NOT -354 deg spin
  const fromAngle = 3.1;
  const toAngle = -3.1;

  const midAngle = lerpAngle(fromAngle, toAngle, 0.5);
  // Midpoint should be +/- PI (or 3.14159)
  assert.ok(
    Math.abs(Math.abs(midAngle) - Math.PI) < 0.05,
    `Expected midAngle near +/- PI, got ${midAngle}`
  );
});

test('interpolateSnapshotEntities handles appearing and disappearing entities', () => {
  const s0 = [
    { id: 1, kind: 'ship', x: 100, y: 100 },
    { id: 2, kind: 'asteroid', x: 300, y: 300 }, // Will disappear in s1 (destroyed)
  ];

  const s1 = [
    { id: 1, kind: 'ship', x: 110, y: 105 },
    { id: 3, kind: 'bullet', x: 120, y: 100 }, // Appeared in s1
  ];

  // At t = 0.5:
  const mid = interpolateSnapshotEntities(s0, s1, 0.5);
  const ids = new Set(mid.map((e) => e.id));

  // Ship 1 is interpolated
  assert.ok(ids.has(1));
  // Bullet 3 (newly spawned) is visible
  assert.ok(ids.has(3));
  // Asteroid 2 was alive at s0 and is transitioning out at t = 0.5
  assert.ok(ids.has(2));

  // At t = 1.0 (fully reached S1):
  const end = interpolateSnapshotEntities(s0, s1, 1.0);
  const endIds = new Set(end.map((e) => e.id));
  assert.ok(endIds.has(1));
  assert.ok(endIds.has(3));
  assert.ok(!endIds.has(2), 'Despawned asteroid must not exist at t = 1.0');
});
