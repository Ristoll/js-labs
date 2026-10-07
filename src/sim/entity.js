import { Vector2 } from './vector.js';

/**
 * Base Entity class for all game objects.
 * Uses private static counter for unique entity identification.
 */
export class Entity {
  static #nextId = 1;
  #id = Entity.#nextId++;

  /**
   * @param {Object} options
   * @param {Vector2|number} [options.pos] Position vector or x coordinate
   * @param {Vector2|number} [options.vel] Velocity vector or vx coordinate
   * @param {number} [options.x=0]
   * @param {number} [options.y=0]
   * @param {number} [options.vx=0]
   * @param {number} [options.vy=0]
   * @param {number} [options.angle=0] Heading angle in radians
   * @param {number} [options.radius=10] Collision radius
   * @param {boolean} [options.alive=true] Liveness flag
   * @param {string} [options.kind='entity'] Discriminator kind
   */
  constructor({
    pos = null,
    vel = null,
    x = 0,
    y = 0,
    vx = 0,
    vy = 0,
    angle = 0,
    radius = 10,
    alive = true,
    kind = 'entity',
  } = {}) {
    if (pos instanceof Vector2) {
      this.pos = pos;
    } else {
      this.pos = new Vector2(x, y);
    }

    if (vel instanceof Vector2) {
      this.vel = vel;
    } else {
      this.vel = new Vector2(vx, vy);
    }

    this.angle = angle;
    this.radius = radius;
    this.alive = alive;
    this.kind = kind;
  }

  /**
   * Unique entity ID.
   * @returns {number}
   */
  get id() {
    return this.#id;
  }

  // Compatibility accessors for legacy code and renderer
  get x() {
    return this.pos.x;
  }

  set x(value) {
    this.pos = new Vector2(value, this.pos.y);
  }

  get y() {
    return this.pos.y;
  }

  set y(value) {
    this.pos = new Vector2(this.pos.x, value);
  }

  get vx() {
    return this.vel.x;
  }

  set vx(value) {
    this.vel = new Vector2(value, this.vel.y);
  }

  get vy() {
    return this.vel.y;
  }

  set vy(value) {
    this.vel = new Vector2(this.vel.x, value);
  }

  /**
   * Advances entity position by velocity * dt.
   * @param {number} dt Delta time in seconds
   */
  update(dt) {
    this.pos = this.pos.add(this.vel.scale(dt));
  }

  /**
   * Clones this entity's state into a new instance.
   * @returns {Entity}
   */
  clone() {
    return new this.constructor({
      pos: this.pos.clone(),
      vel: this.vel.clone(),
      angle: this.angle,
      radius: this.radius,
      alive: this.alive,
      kind: this.kind,
    });
  }
}
