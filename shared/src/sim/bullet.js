import { Entity } from './entity.js';

export class Bullet extends Entity {
  constructor({
    id = null,
    pos = null,
    vel = null,
    x = 0,
    y = 0,
    vx = 0,
    vy = 0,
    angle = 0,
    ttl = 1.4,
    damage = 1,
    radius = 3,
    alive = true,
    homing = null,
    ownerId = null,
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
      kind: 'bullet',
    });

    this.ttl = ttl;
    this.maxTtl = ttl;
    this.damage = damage;
    this.homing = homing;
    this.ownerId = ownerId;
  }

  update(dt, world = null) {
    if (this.homing && world) {
      this.homing.update(this, dt, world);
    }
    this.ttl -= dt;
    if (this.ttl <= 0) {
      this.alive = false;
    }
    super.update(dt);
  }

  toSnapshot() {
    return {
      ...super.toSnapshot(),
      ttl: Number(this.ttl.toFixed(2)),
      damage: this.damage,
      ownerId: this.ownerId,
    };
  }

  static fromSnapshot(snap) {
    return new Bullet({
      id: snap.id,
      x: snap.x,
      y: snap.y,
      vx: snap.vx,
      vy: snap.vy,
      angle: snap.angle,
      radius: snap.radius,
      ttl: snap.ttl ?? 1.4,
      damage: snap.damage ?? 1,
      alive: snap.alive ?? true,
      ownerId: snap.ownerId ?? null,
    });
  }

  clone() {
    return new Bullet({
      id: this.id,
      pos: this.pos.clone(),
      vel: this.vel.clone(),
      angle: this.angle,
      ttl: this.ttl,
      damage: this.damage,
      radius: this.radius,
      alive: this.alive,
      homing: this.homing ? this.homing.clone() : null,
      ownerId: this.ownerId,
    });
  }
}
