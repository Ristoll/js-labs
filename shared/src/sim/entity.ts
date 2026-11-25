import { Vector2 } from './vector.ts';
import { asEntityId, type EntityId } from '../types.ts';

export interface EntityOptions {
  id?: number | EntityId | null;
  pos?: Vector2 | null;
  vel?: Vector2 | null;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  angle?: number;
  radius?: number;
  alive?: boolean;
  kind?: string;
}

/**
 * Base Entity class for all simulation objects.
 */
export class Entity {
  static #nextId = 1;
  #id: EntityId;
  pos: Vector2;
  vel: Vector2;
  angle: number;
  radius: number;
  alive: boolean;
  kind: string;
  playerId?: string | null;

  static resetNextId(start = 1): void {
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
  }: EntityOptions = {}) {
    if (typeof id === 'number') {
      this.#id = asEntityId(id);
      if (id >= Entity.#nextId) {
        Entity.#nextId = id + 1;
      }
    } else {
      this.#id = asEntityId(Entity.#nextId++);
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

  get id(): EntityId {
    return this.#id;
  }

  get x(): number {
    return this.pos.x;
  }

  set x(value: number) {
    this.pos = new Vector2(value, this.pos.y);
  }

  get y(): number {
    return this.pos.y;
  }

  set y(value: number) {
    this.pos = new Vector2(this.pos.x, value);
  }

  get vx(): number {
    return this.vel.x;
  }

  set vx(value: number) {
    this.vel = new Vector2(value, this.vel.y);
  }

  get vy(): number {
    return this.vel.y;
  }

  set vy(value: number) {
    this.vel = new Vector2(this.vel.x, value);
  }

  update(dt: number, _context?: unknown): void {
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

  clone(): Entity {
    return new Entity({
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



