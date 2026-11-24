import { Entity } from './entity.js';
import { Vector2 } from './vector.js';

function createAsteroidVertices(radius, count = 10, prng = Math.random) {
  const points = [];
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

export class Asteroid extends Entity {
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
      radius,
      alive,
      kind: 'asteroid',
    });

    this.angularVelocity = angularVelocity;
    this.vertices = vertices || createAsteroidVertices(radius);
    this.homing = homing;
  }

  update(dt, world = null) {
    if (this.homing && world) {
      this.homing.update(this, dt, world);
    }
    this.angle += this.angularVelocity * dt;
    super.update(dt);
  }

  toSnapshot() {
    return {
      ...super.toSnapshot(),
      angularVelocity: Number(this.angularVelocity.toFixed(4)),
    };
  }

  static fromSnapshot(snap) {
    return new Asteroid({
      id: snap.id,
      x: snap.x,
      y: snap.y,
      vx: snap.vx,
      vy: snap.vy,
      angle: snap.angle,
      radius: snap.radius,
      alive: snap.alive,
      angularVelocity: snap.angularVelocity ?? 0.5,
    });
  }

  clone() {
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

  static createRandom(arena, avoidPos = null, prng = Math.random) {
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
