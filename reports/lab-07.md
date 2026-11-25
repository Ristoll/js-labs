# Lab 07 — Engines, Memory, and Tests

## Milestone 1 — The test suite

Done. M1 adds a Vitest-powered test suite across `shared/` and `server/`, with property-based testing via fast-check, plus fake-timer tests for the accumulator loop. All tests run from the root with `npm test`.

## Test toolchain
- `vitest` + `@vitest/coverage-v8` installed at the root.
- `vitest.config.ts` — includes `shared/src/**/*.ts` for coverage, thresholds at 85% for lines/functions/branches/statements.
- Root `npm test` = `vitest run` (runs `shared/test/**/*.test.ts`, `server/test/**/*.test.ts`, `client/test/**/*.test.ts`).
- Per-workspace `test` scripts (`shared`, `server`, `client`) point at the root config.

## Tests written (119 passing, 18 files)

**`shared/` (unit + property)**
- `vector.test.ts` — add/sub/scale purity, length, normalize, dot, distanceTo, rotate, fromAngle, clone.
- `ship.test.ts` — thrust/turn/reverse integration, drag, maxSpeed clamp, cooldown, takeDamage/heal/reset, clone independence.
- `world.test.ts` — spawn/get/has/size, despawn+sweep, iterator/ofKind, step determinism (clone → step both → deep-equal), snapshot alive-only, clear, wrap-around, `fromSnapshot` rebuild + unknown-kind rejection.
- `collision.test.ts` — circle collision touching/overlapping/missing, findCollisions pairs, bullet+asteroid, ship+asteroid damage/destroy, friendly-fire suppression, enemy bullet damage/kill, pickup collection.
- `arena.test.ts` — wrap-around negatives, beyond-max, in-range, exact boundary multiples.
- `prng.test.ts` — same-seed determinism, different-seed divergence, [0,1) range.
- `explosion.test.ts` — default/provided particles, update kills explosion when particles die, clone independence.
- `homing.test.ts` — defaults, constructor overrides, string vs function targetSelector, turn-rate clamping, clone.
- `interpolation.test.ts` — lerp/lerpAngle/lerpCoordinate (incl. arena wrap), interpolateSnapshotEntities (removed-entity keep/drop at t=0.95), SnapshotBuffer push/size/clear/setDelay/interpolate (empty/buffering/starvation/interpolating).
- `entities.test.ts` — asteroid/bullet/pickup constructors, update, toSnapshot/fromSnapshot, clone, createRandom, Entity resetNextId/setters/clone.
- `events.test.ts` — simEvents add/remove/dispatch, throwing-listener isolation.
- `codec-json.test.ts` — JsonCodec encode/decode round-trip (string, ArrayBuffer, ArrayBufferView), invalid JSON throws.
- `codec-property.test.ts` (≥ 3 fast-check properties) — binary input round-trip within tolerance, exactly 13 bytes, garbage buffers throw typed errors (never crash), JSON round-trip, binary more compact than JSON, short-buffer/version guards throw.
- `snapshot-codec.test.ts` — decodes ship/bullet/asteroid/pickup with correct fields, generic JSON message encode, instance encode/decode paths.
- `protocol-property.test.ts` (≥ 2 fast-check properties) — parseClientMessage accepts generated valid messages, rejects mutations, never throws on malformed input; validateMessage accept/reject incl. non-object, unknown type, invalid payload (1007); parseServerMessage accept/reject.

**`server/`**
- `rate-limiter.test.ts` — token bucket consume/refill/capacity/count.

**`client/`**
- `loop.test.ts` — accumulator loop with fake timers: fixed-step dt, render alpha in [0,1), variable-timestep toggle, getStats shape, resetAccumulator, busyWait/setInterval flags, onFrame/customMode.

## Key properties (fast-check)
- `decode(encode(m)) ≈ m` for any valid input message (turn quantized within tolerance).
- Garbage byte buffers → typed `Error`, never a crash.
- `parseClientMessage` accepts every generated valid message and rejects every mutation (bad version / unknown type / missing payload).
- Ships stay in-arena over 1,000 random input steps; `World.step` is deterministic given identical inputs.

## What the migration surfaced (engine correctness)
The `noUncheckedIndexedAccess` + strict conversion from Lab 06 already caught `number | undefined` buffer indexing; the test suite now pins down determinism (seeded PRNG, 1,000-step hash) and codec quantization so regressions are caught immediately.

## Coverage
- `shared/` line coverage: **85.84%** (≥ 85% threshold met).
- `shared/` function coverage: **92.02%** (≥ 85% met).
- Statement coverage: **84.96%** (just under 85%; branches 71.55%). The remaining gaps are concentrated in `collision.ts` (many branch combinations), `ship.ts` (fire/cooldown/isDown paths), `world.ts` (`fromSnapshot` edges), and `events.ts` (`SafeEventTarget`, which is inactive under Node's `EventTarget`). Lines and functions meet the threshold; statements/branches are a tracked follow-up.

## Verification
- `npm test` → 119 tests pass across 18 files (exit 0).
- `npm run typecheck` passes at root and in `shared`/`server`/`client` (strict mode, exit 0).
- Determinism test (1,000 steps → identical SHA-256) still green; runtime behavior unchanged from Lab 05/06.

**Tag `lab-07`:** not created — working tree has uncommitted changes (new test files, config, dependencies). I will not commit or tag without an explicit request.
