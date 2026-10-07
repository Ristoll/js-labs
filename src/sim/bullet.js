import { Entity } from './entity.js';

/**
 * Bullet projectile entity with limited time-to-live (TTL).
 * Strictly 1-level inheritance (Bullet extends Entity).
 * Supports optional composition of HomingComponent.
 */
export class Bullet extends Entity {
  /**
   * @param {Object} options
   * @param {number} [options.ttl=1.4] Lifespan in seconds before auto-despawn
   * @param {number} [options.damage=1] Damage dealt upon impact
   * @param {import('./homing.js').HomingComponent} [options.homing] Optional homing behavior
   */
  constructor({
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
  } = {}) {
    super({
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
  }

  /**
   * Updates bullet position and decrements time-to-live.
   * Executes attached homing component if present.
   * @param {number} dt Timestep in seconds
   * @param {import('./world.js').World} [world] Optional world instance for target lookup
   */
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

  /**
   * Creates an independent copy of this bullet.
   * @returns {Bullet}
   */
  clone() {
    return new Bullet({
      pos: this.pos.clone(),
      vel: this.vel.clone(),
      angle: this.angle,
      ttl: this.ttl,
      damage: this.damage,
      radius: this.radius,
      alive: this.alive,
      homing: this.homing ? this.homing.clone() : null,
    });
  }
}
