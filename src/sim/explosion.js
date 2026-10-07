import { Entity } from './entity.js';

/**
 * Explosion entity spawning a collection of short-lived particle objects.
 * Strictly 1-level inheritance (Explosion extends Entity).
 */
export class Explosion extends Entity {
  /**
   * @param {Object} options
   * @param {number} [options.count=24] Number of particle sparks
   * @param {number} [options.maxSpeed=180] Peak velocity of particles
   * @param {number} [options.ttl=0.6] Base lifespan of explosion in seconds
   * @param {Array<Object>} [options.particles] Pre-existing particles array for cloning
   */
  constructor({
    pos = null,
    vel = null,
    x = 0,
    y = 0,
    vx = 0,
    vy = 0,
    angle = 0,
    count = 24,
    maxSpeed = 180,
    ttl = 0.6,
    particles = null,
    alive = true,
  } = {}) {
    super({
      pos,
      vel,
      x,
      y,
      vx,
      vy,
      angle,
      radius: 0,
      alive,
      kind: 'explosion',
    });

    this.ttl = ttl;
    this.maxTtl = ttl;

    if (particles) {
      this.particles = particles;
    } else {
      const colors = ['#ffffff', '#fef08a', '#f97316', '#ef4444', '#38bdf8'];
      this.particles = Array.from({ length: count }, () => {
        const particleAngle = Math.random() * Math.PI * 2;
        const speed = 20 + Math.random() * maxSpeed;
        const particleTtl = ttl * (0.6 + Math.random() * 0.4);

        return {
          x: 0,
          y: 0,
          vx: Math.cos(particleAngle) * speed,
          vy: Math.sin(particleAngle) * speed,
          size: 1.5 + Math.random() * 2.5,
          color: colors[Math.floor(Math.random() * colors.length)],
          ttl: particleTtl,
          maxTtl: particleTtl,
        };
      });
    }
  }

  /**
   * Updates all internal particles and cleans up when all particles expire.
   * @param {number} dt Timestep in seconds
   */
  update(dt) {
    let hasAlive = false;

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (p.ttl > 0) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.ttl -= dt;
        if (p.ttl > 0) {
          hasAlive = true;
        }
      }
    }

    if (!hasAlive) {
      this.alive = false;
    }
  }

  /**
   * Clones explosion with independent copies of particle objects.
   * @returns {Explosion}
   */
  clone() {
    const clonedParticles = this.particles.map((p) => ({ ...p }));
    return new Explosion({
      pos: this.pos.clone(),
      vel: this.vel.clone(),
      angle: this.angle,
      ttl: this.ttl,
      particles: clonedParticles,
      alive: this.alive,
    });
  }
}
