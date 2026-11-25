import { Entity } from './entity.ts';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  ttl: number;
  maxTtl: number;
}

export interface ExplosionOptions {
  id?: number | null;
  pos?: import('./vector.ts').Vector2 | null;
  vel?: import('./vector.ts').Vector2 | null;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  angle?: number;
  count?: number;
  maxSpeed?: number;
  ttl?: number;
  particles?: Particle[] | null;
  alive?: boolean;
  prng?: () => number;
}

export class Explosion extends Entity {
  ttl: number;
  maxTtl: number;
  particles: Particle[];

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
  }: ExplosionOptions = {}) {
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
          color: colors[Math.floor(prng() * colors.length)]!,
          ttl: particleTtl,
          maxTtl: particleTtl,
        };
      });
    }
  }

  override update(dt: number): void {
    let hasAlive = false;

    for (const p of this.particles) {
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

  override clone(): Explosion {
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


