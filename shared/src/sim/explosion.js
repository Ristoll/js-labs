import { Entity } from './entity.js';

export class Explosion extends Entity {
  constructor({
    id = null,
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
    prng = Math.random,
  } = {}) {
    super({
      id,
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
        const particleAngle = prng() * Math.PI * 2;
        const speed = 20 + prng() * maxSpeed;
        const particleTtl = ttl * (0.6 + prng() * 0.4);

        return {
          x: 0,
          y: 0,
          vx: Math.cos(particleAngle) * speed,
          vy: Math.sin(particleAngle) * speed,
          size: 1.5 + prng() * 2.5,
          color: colors[Math.floor(prng() * colors.length)],
          ttl: particleTtl,
          maxTtl: particleTtl,
        };
      });
    }
  }

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

  clone() {
    const clonedParticles = this.particles.map((p) => ({ ...p }));
    return new Explosion({
      id: this.id,
      pos: this.pos.clone(),
      vel: this.vel.clone(),
      angle: this.angle,
      ttl: this.ttl,
      particles: clonedParticles,
      alive: this.alive,
    });
  }
}
