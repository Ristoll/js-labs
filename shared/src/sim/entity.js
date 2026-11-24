import { Vector2 } from './vector.js';

/**
 * Base Entity class for all simulation objects.
 */
export class Entity {
  static #nextId = 1;
  #id;

  static resetNextId(start = 1) {
    Entity.#nextId = start;
  }

  constructor({
    id = null,
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
    if (typeof id === 'number') {
      this.#id = id;
      if (id >= Entity.#nextId) {
        Entity.#nextId = id + 1;
      }
    } else {
      this.#id = Entity.#nextId++;
    }

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

  get id() {
    return this.#id;
  }

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

  update(dt) {
    this.pos = this.pos.add(this.vel.scale(dt));
  }

  toSnapshot() {
    return {
      id: this.id,
      kind: this.kind,
      x: Number(this.x.toFixed(2)),
      y: Number(this.y.toFixed(2)),
      vx: Number(this.vx.toFixed(2)),
      vy: Number(this.vy.toFixed(2)),
      angle: Number(this.angle.toFixed(4)),
      radius: this.radius,
      alive: this.alive,
    };
  }

  clone() {
    return new this.constructor({
      id: this.id,
      pos: this.pos.clone(),
      vel: this.vel.clone(),
      angle: this.angle,
      radius: this.radius,
      alive: this.alive,
      kind: this.kind,
    });
  }
}
