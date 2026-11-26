import { describe, expect, it } from 'vitest';
import { Explosion } from '../src/sim/explosion.ts';
import { Vector2 } from '../src/sim/vector.ts';

describe('Explosion', () => {
  it('constructs with default particles using prng', () => {
    const prng = () => 0.5;
    const explosion = new Explosion({ x: 10, y: 20, count: 4, maxSpeed: 100, ttl: 0.6, prng });
    expect(explosion.kind).toBe('explosion');
    expect(explosion.radius).toBe(0);
    expect(explosion.ttl).toBe(0.6);
    expect(explosion.maxTtl).toBe(0.6);
    expect(explosion.particles.length).toBe(4);
    expect(explosion.alive).toBe(true);
  });

  it('uses provided particles when given', () => {
    const particles = [{ x: 1, y: 2, vx: 3, vy: 4, size: 2, color: '#ff0000', ttl: 0.5, maxTtl: 0.5 }];
    const explosion = new Explosion({ x: 5, y: 5, particles, alive: false });
    expect(explosion.particles).toEqual(particles);
    expect(explosion.alive).toBe(false);
  });

  it('update moves alive particles and kills explosion when all dead', () => {
    const explosion = new Explosion({
      x: 0, y: 0, count: 1, maxSpeed: 100, ttl: 0.1, maxTtl: 0.1,
      prng: () => 0,
    });
    // particle ttl = 0.1 * (0.6 + 0) = 0.06
    explosion.update(0.02);
    expect(explosion.particles[0].ttl).toBeCloseTo(0.04, 6);
    expect(explosion.alive).toBe(true);
    explosion.update(0.05); // ttl goes negative
    expect(explosion.alive).toBe(false);
  });

  it('update does nothing when already dead', () => {
    const explosion = new Explosion({ count: 1, ttl: 0.01, prng: () => 0 });
    explosion.update(1); // kill it
    expect(explosion.alive).toBe(false);
    const xBefore = explosion.particles[0].x;
    explosion.update(1);
    expect(explosion.particles[0].x).toBe(xBefore);
    expect(explosion.alive).toBe(false);
  });

  it('clone produces independent copy with cloned particles', () => {
    const explosion = new Explosion({ x: 3, y: 4, count: 2, prng: () => 0.5 });
    const clone = explosion.clone();
    expect(clone).not.toBe(explosion);
    expect(clone.particles.length).toBe(2);
    expect(clone.pos).not.toBe(explosion.pos);
    expect(clone.particles[0]).not.toBe(explosion.particles[0]);
    expect(clone.ttl).toBe(explosion.ttl);
  });
});
