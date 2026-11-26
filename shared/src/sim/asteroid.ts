import { Entity, type EntityOptions } from './entity.ts';
import { Vector2 } from './vector.ts';
import type { AsteroidSnapshot } from '../types.ts';

export interface Vertex {
  readonly x: number;
  readonly y: number;
}

export function createAsteroidVertices(
  radius: number,
  count = 10,
  prng: () => number = Math.random
): readonly Vertex[] {
  const points: Vertex[] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const r = radius * (0.75 + prng() * 0.5);
    points.push({
      x: Math.cos(a) * r,
      y: Math.sin(a) * r,
    });
  }
  return points;
}

export interface AsteroidOptions extends EntityOptions {
  angularVelocity?: number;
  vertices?: readonly Vertex[] | null;
  homing?: {
    update: (asteroid: Asteroid, dt: number, world: unknown) => void;
    clone: () => AsteroidOptions['homing'];
  } | null;
}

export class Asteroid extends Entity {
  angularVelocity: number;
  vertices: readonly Vertex[];
  homing: {
    update: (asteroid: Asteroid, dt: number, world: unknown) => void;
    clone: () => AsteroidOptions['homing'];
  } | null;

  constructor({
    id = null,
    pos = null,
    vel = null,
    x = 0,
    y = 0,
    vx = 0,
    vy = 0,
    angle = 0,
    angularVelocity = 0.5,
    radius = 24,
    vertices = null,
    alive = true,
    homing = null,
  }: AsteroidOptions = {}) {
    super({
      id,
      pos,
      vel,
      x,
      y,
      vx,
      vy,
      angle,
      radius,
      alive,
      kind: 'asteroid',
    });

    this.angularVelocity = angularVelocity;
    this.vertices = vertices || createAsteroidVertices(radius);
    this.homing = homing;
  }

  override update(dt: number, world: unknown = null): void {
    if (this.homing && world) {
      this.homing.update(this, dt, world);
    }
    this.angle += this.angularVelocity * dt;
    super.update(dt);
  }

  override toSnapshot(): AsteroidSnapshot {
    const base = super.toSnapshot();
    return {
      kind: 'asteroid',
      id: base.id,
      x: base.x,
      y: base.y,
      vx: base.vx,
      vy: base.vy,
      angle: base.angle,
      radius: base.radius,
      alive: base.alive,
      angularVelocity: Number(this.angularVelocity.toFixed(4)),
    };
  }

  static fromSnapshot(
    snap: Partial<AsteroidSnapshot> & { id: number; x: number; y: number }
  ): Asteroid {
    return new Asteroid({
      id: snap.id,
      x: snap.x,
      y: snap.y,
      vx: snap.vx ?? 0,
      vy: snap.vy ?? 0,
      angle: snap.angle ?? 0,
      radius: snap.radius ?? 24,
      alive: snap.alive ?? true,
      angularVelocity: snap.angularVelocity ?? 0.5,
    });
  }

  override clone(): Asteroid {
    return new Asteroid({
      id: this.id,
      pos: this.pos.clone(),
      vel: this.vel.clone(),
      angle: this.angle,
      angularVelocity: this.angularVelocity,
      radius: this.radius,
      vertices: this.vertices,
      alive: this.alive,
      homing: this.homing ? this.homing.clone() : null,
    });
  }

  static createRandom(
    arena: { readonly width: number; readonly height: number },
    avoidPos: { readonly x: number; readonly y: number } | null = null,
    prng: () => number = Math.random
  ): Asteroid {
    let x = prng() * arena.width;
    let y = prng() * arena.height;

    if (avoidPos) {
      let attempts = 0;
      while (Math.hypot(x - avoidPos.x, y - avoidPos.y) < 160 && attempts < 10) {
        x = prng() * arena.width;
        y = prng() * arena.height;
        attempts++;
      }
    }

    const speed = 25 + prng() * 55;
    const moveAngle = prng() * Math.PI * 2;
    const vel = Vector2.fromAngle(moveAngle, speed);
    const radius = 18 + prng() * 22;
    const angularVelocity = (prng() - 0.5) * 1.4;

    return new Asteroid({
      x,
      y,
      vel,
      radius,
      angle: prng() * Math.PI * 2,
      angularVelocity,
      vertices: createAsteroidVertices(radius, 10, prng),
    });
  }
}


