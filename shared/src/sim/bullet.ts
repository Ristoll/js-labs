import { Entity, type EntityOptions } from './entity.ts';
import type { BulletSnapshot } from '../types.ts';

export interface BulletOptions extends EntityOptions {
  ttl?: number;
  damage?: number;
  homing?: {
    update: (bullet: Bullet, dt: number, world: unknown) => void;
    clone: () => BulletOptions['homing'];
  } | null;
  ownerId?: string | number | null;
}

export class Bullet extends Entity {
  ttl: number;
  maxTtl: number;
  damage: number;
  homing: {
    update: (bullet: Bullet, dt: number, world: unknown) => void;
    clone: () => BulletOptions['homing'];
  } | null;
  ownerId: string | number | null;

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
  }: BulletOptions = {}) {
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

  override update(dt: number, world: unknown = null): void {
    if (this.homing && world) {
      this.homing.update(this, dt, world);
    }
    this.ttl -= dt;
    if (this.ttl <= 0) {
      this.alive = false;
    }
    super.update(dt);
  }

  override toSnapshot(): BulletSnapshot {
    const base = super.toSnapshot();
    return {
      kind: 'bullet',
      id: base.id,
      x: base.x,
      y: base.y,
      vx: base.vx,
      vy: base.vy,
      angle: base.angle,
      radius: base.radius,
      alive: base.alive,
      ttl: Number(this.ttl.toFixed(2)),
      damage: this.damage,
      ownerId: this.ownerId,
    };
  }

  static fromSnapshot(
    snap: Partial<BulletSnapshot> & { id: number; x: number; y: number }
  ): Bullet {
    return new Bullet({
      id: snap.id,
      x: snap.x,
      y: snap.y,
      vx: snap.vx ?? 0,
      vy: snap.vy ?? 0,
      angle: snap.angle ?? 0,
      radius: snap.radius ?? 3,
      ttl: snap.ttl ?? 1.4,
      damage: snap.damage ?? 1,
      alive: snap.alive ?? true,
      ownerId: snap.ownerId ?? null,
    });
  }

  override clone(): Bullet {
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


