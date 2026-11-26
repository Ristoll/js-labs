import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { World } from '../src/sim/world.ts';
import { Ship } from '../src/sim/ship.ts';
import { createArena } from '../src/sim/arena.ts';

const arena = createArena(1200, 800);

const genShipInput = fc.tuple(
  fc.boolean(), // thrust
  fc.boolean(), // reverse
  fc.float({ min: -1, max: 1 }), // turn
  fc.boolean(), // fire
).map(([thrust, reverse, turn, fire]) => ({
  thrust,
  reverse,
  turn: Number.isNaN(turn) ? 0 : turn,
  fire,
}));

describe('simulation invariants', () => {
  it('ships stay in-arena over 1,000 random input steps', () => {
    fc.assert(
      fc.property(genShipInput, (_input) => {
        const world = new World();
        world.spawn(new Ship({ id: 1, x: 600, y: 400 }));
        const inputs: Record<string, unknown> = { '1': _input };
        for (let step = 0; step < 1000; step++) {
          world.step(1 / 60, inputs, arena);
        }
        const ship = world.get(1);
        expect(ship).toBeDefined();
        if (ship) {
          expect(ship.x).toBeGreaterThanOrEqual(0);
          expect(ship.x).toBeLessThan(arena.width);
          expect(ship.y).toBeGreaterThanOrEqual(0);
          expect(ship.y).toBeLessThan(arena.height);
        }
      }),
      { numRuns: 50 }
    );
  });

  it('World.step is deterministic given same inputs', () => {
    const inputs = new Map<string, { thrust: boolean; turn: number }>([
      ['p1', { thrust: true, turn: 0.5 }],
    ]);

    const build = () => {
      const w = new World();
      w.spawn(new Ship({ id: 1, playerId: 'p1', x: 100, y: 100 }));
      return w;
    };

    const w1 = build();
    const w2 = build();
    for (let i = 0; i < 500; i++) {
      w1.step(1 / 60, inputs, arena);
      w2.step(1 / 60, inputs, arena);
    }
    expect(w1.toSnapshot()).toEqual(w2.toSnapshot());
  });

  it('reconciliation-like pure reset+replay is stable', () => {
    const w1 = new World();
    w1.spawn(new Ship({ id: 1, x: 100, y: 100 }));
    const w2 = w1.clone();
    w1.step(1 / 60, null, arena);
    w2.step(1 / 60, null, arena);
    expect(w1.toSnapshot()).toEqual(w2.toSnapshot());
  });
});
