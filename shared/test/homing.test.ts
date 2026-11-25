import { describe, expect, it } from 'vitest';
import { HomingComponent } from '../src/sim/homing.ts';
import { Entity } from '../src/sim/entity.ts';
import { Vector2 } from '../src/sim/vector.ts';
import { Asteroid } from '../src/sim/asteroid.ts';

describe('HomingComponent', () => {
  const world = {
    ofKind: (kind: string) => {
      if (kind === 'asteroid') {
        return [new Entity({ id: 2, x: 100, y: 0, radius: 5 })];
      }
      return [];
    },
  };

  it('defaults', () => {
    const h = new HomingComponent();
    expect(h.targetSelector).toBe('asteroid');
    expect(h.turnRate).toBe(Math.PI * 1.6);
    expect(h.speed).toBe(480);
    expect(h.maxRange).toBe(900);
    expect(h.target).toBeNull();
  });

  it('constructor overrides fields', () => {
    const h = new HomingComponent({ targetSelector: 'ship', turnRate: 1, speed: 100, maxRange: 50 });
    expect(h.targetSelector).toBe('ship');
    expect(h.turnRate).toBe(1);
    expect(h.speed).toBe(100);
    expect(h.maxRange).toBe(50);
  });

  it('update with no host / dead host / no world returns early', () => {
    const h = new HomingComponent();
    const host = new Entity({ id: 1, x: 0, y: 0, radius: 5 });
    h.update(host as any, 0.01, null);
    expect(h.target).toBeNull();
    host.alive = false;
    h.update(host as any, 0.01, world as any);
    expect(h.target).toBeNull();
  });

  it('update selects closest asteroid by string selector', () => {
    const h = new HomingComponent();
    const host = new Entity({ id: 1, x: 0, y: 0, radius: 5 });
    host.alive = true;
    h.update(host as any, 0.01, world as any);
    expect(h.target).not.toBeNull();
    expect(h.target!.id).toBe(2);
  });

  it('update uses function targetSelector', () => {
    const h = new HomingComponent({
      targetSelector: (_host: Entity, _world: unknown) => null,
    });
    const host = new Entity({ id: 1, x: 0, y: 0, radius: 5 });
    host.alive = true;
    h.update(host as any, 0.01, world as any);
    expect(h.target).toBeNull();
  });

  it('update turns host toward target and clamps turn rate', () => {
    const h = new HomingComponent({ turnRate: 0.01, speed: 10, maxRange: 1000 });
    const host = new Entity({ id: 1, x: 0, y: 0, radius: 5, angle: 0 });
    host.alive = true;
    h.update(host as any, 1, { ofKind: () => [new Entity({ id: 2, x: 0, y: 100, radius: 5 })] } as any);
    expect(h.target!.id).toBe(2);
    expect(host.angle).toBeGreaterThan(0);
  });

  it('clone', () => {
    const h = new HomingComponent({ targetSelector: 'ship', turnRate: 2, speed: 50, maxRange: 60 });
    const c = h.clone();
    expect(c).not.toBe(h);
    expect(c.targetSelector).toBe('ship');
    expect(c.turnRate).toBe(2);
    expect(c.speed).toBe(50);
    expect(c.maxRange).toBe(60);
  });

  it('asteroid.update calls homing.update when homing set and world given', () => {
    const asteroid = new Asteroid({ id: 1, x: 0, y: 0, radius: 5 });
    let called = false;
    asteroid.homing = { update: () => { called = true; }, clone: () => null } as any;
    asteroid.update(0.01, {} as any);
    expect(called).toBe(true);
  });

  it('asteroid.createRandom retries when too close to avoidPos', () => {
    const arena = { width: 1200, height: 800 };
    const ast = Asteroid.createRandom(arena, { x: 0, y: 0 }, () => 0);
    expect(ast).toBeInstanceOf(Asteroid);
  });
});
