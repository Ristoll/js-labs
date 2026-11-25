import { Entity } from './entity.ts';
import { Vector2 } from './vector.ts';
import { Bullet } from './bullet.ts';
import type { ShipSnapshot } from '../types.ts';
import { simEvents } from './events.ts';

export const SHIP_CONFIG = {
  thrustPower: 380,
  reversePower: 230,
  turnSpeed: Math.PI * 1.6,
  linearDrag: 0.45,
  maxSpeed: 450,
  fireCooldown: 0.18,
} as const;

export interface ShipInput {
  turn?: number;
  thrust?: boolean;
  reverse?: boolean;
  fire?: boolean;
  isDown?: (key: string) => boolean;
}

export interface ShipOptions {
  id?: number | null;
  playerId?: string | null;
  pos?: Vector2 | null;
  vel?: Vector2 | null;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  angle?: number;
  thrust?: boolean;
  reverse?: boolean;
  radius?: number;
  alive?: boolean;
  hp?: number;
}

interface WorldLike {
  spawn?: (entity: Entity) => unknown;
}

export class Ship extends Entity {
  #hp = 3;
  override playerId: string | null;
  thrust: boolean;
  reverse: boolean;
  cooldown = 0;
  rapidFireTimer = 0;

  constructor({
    id = null,
    playerId = null,
    pos = null,
    vel = null,
    x = 0,
    y = 0,
    vx = 0,
    vy = 0,
    angle = 0,
    thrust = false,
    reverse = false,
    radius = 16,
    alive = true,
    hp = 3,
  }: ShipOptions = {}) {
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
      kind: 'ship',
    });

    this.#hp = hp;
    this.playerId = playerId;
    this.thrust = thrust;
    this.reverse = reverse;
    this.cooldown = 0;
    this.rapidFireTimer = 0;
  }

  get hp(): number {
    return this.#hp;
  }

  takeDamage(amount = 1): number {
    this.#hp = Math.max(0, this.#hp - amount);
    if (this.#hp <= 0) {
      this.alive = false;
    }
    return this.#hp;
  }

  heal(amount = 3): number {
    this.#hp = Math.min(3, this.#hp + amount);
    return this.#hp;
  }

  reset(x = 0, y = 0, angle = -Math.PI / 2): void {
    this.x = x;
    this.y = y;
    this.vel = Vector2.zero();
    this.angle = angle;
    this.thrust = false;
    this.reverse = false;
    this.cooldown = 0;
    this.rapidFireTimer = 0;
    this.#hp = 3;
    this.alive = true;
  }

  fire(world: WorldLike | null = null, isHoming = false, bulletId: number | null = null): Bullet | null {
    if (this.cooldown > 0) return null;

    const nose = this.pos.add(Vector2.fromAngle(this.angle, 26));
    const speed = isHoming ? 440 : 520;
    const bulletVel = this.vel.add(Vector2.fromAngle(this.angle, speed));

    const bullet = new Bullet({
      id: bulletId,
      pos: nose,
      vel: bulletVel,
      angle: this.angle,
      ttl: isHoming ? 2.2 : 1.5,
      damage: 1,
      ownerId: this.playerId ?? this.id,
    });

    const cooldownMultiplier = this.rapidFireTimer > 0 ? 0.45 : 1.0;
    this.cooldown = SHIP_CONFIG.fireCooldown * cooldownMultiplier;

    if (world?.spawn) {
      world.spawn(bullet);
    }

    if (simEvents && typeof simEvents.dispatchEvent === 'function') {
      try {
        simEvents.dispatchEvent(new CustomEvent('fired', { detail: { shipId: this.id } }));
      } catch {
        // ignore in non-DOM/test contexts
      }
    }

    return bullet;
  }

  override update(dt: number, input: ShipInput | null = null, config: typeof SHIP_CONFIG = SHIP_CONFIG): void {
    if (input) {
      let turn = 0;
      let isThrusting = false;
      let isReversing = false;

      if (typeof input.turn === 'number' || typeof input.thrust === 'boolean') {
        turn = typeof input.turn === 'number' ? Math.max(-1, Math.min(1, input.turn)) : 0;
        isThrusting = Boolean(input.thrust);
        isReversing = Boolean(input.reverse);
      } else if (typeof input.isDown === 'function') {
        if (input.isDown('ArrowLeft') || input.isDown('KeyA')) {
          turn -= 1;
        }
        if (input.isDown('ArrowRight') || input.isDown('KeyD')) {
          turn += 1;
        }
        isThrusting = input.isDown('ArrowUp') || input.isDown('KeyW') || input.isDown('Space');
        isReversing = input.isDown('ArrowDown') || input.isDown('KeyS');
      }

      this.angle += turn * config.turnSpeed * dt;
      this.angle = Math.atan2(Math.sin(this.angle), Math.cos(this.angle));

      this.thrust = Boolean(isThrusting);
      this.reverse = Boolean(isReversing);

      if (this.thrust) {
        const acceleration = Vector2.fromAngle(this.angle, config.thrustPower * dt);
        this.vel = this.vel.add(acceleration);
      } else if (this.reverse) {
        const deceleration = Vector2.fromAngle(this.angle, -config.reversePower * dt);
        this.vel = this.vel.add(deceleration);
      }
    }

    const damping = Math.exp(-config.linearDrag * dt);
    this.vel = this.vel.scale(damping);

    const speed = this.vel.length();
    if (speed > config.maxSpeed) {
      this.vel = this.vel.scale(config.maxSpeed / speed);
    }

    if (this.cooldown > 0) {
      this.cooldown = Math.max(0, this.cooldown - dt);
    }

    if (this.rapidFireTimer > 0) {
      this.rapidFireTimer = Math.max(0, this.rapidFireTimer - dt);
    }

    super.update(dt);
  }

  override toSnapshot(): ShipSnapshot {
    return {
      id: this.id,
      kind: 'ship',
      x: Number(this.x.toFixed(2)),
      y: Number(this.y.toFixed(2)),
      vx: Number(this.vx.toFixed(2)),
      vy: Number(this.vy.toFixed(2)),
      angle: Number(this.angle.toFixed(4)),
      radius: this.radius,
      alive: this.alive,
      playerId: this.playerId,
      hp: this.hp,
      thrust: this.thrust,
      reverse: this.reverse,
    };
  }

  static fromSnapshot(snap: Partial<ShipSnapshot> & { id: number; x: number; y: number }): Ship {
    return new Ship({
      id: snap.id,
      playerId: snap.playerId,
      x: snap.x,
      y: snap.y,
      vx: snap.vx,
      vy: snap.vy,
      angle: snap.angle,
      radius: snap.radius,
      alive: snap.alive,
      hp: snap.hp ?? 3,
      thrust: snap.thrust ?? false,
      reverse: snap.reverse ?? false,
    });
  }

  override clone(): Ship {
    const copy = new Ship({
      id: this.id,
      playerId: this.playerId,
      pos: this.pos.clone(),
      vel: this.vel.clone(),
      angle: this.angle,
      thrust: this.thrust,
      reverse: this.reverse,
      radius: this.radius,
      alive: this.alive,
      hp: this.#hp,
    });
    copy.cooldown = this.cooldown;
    copy.rapidFireTimer = this.rapidFireTimer;
    return copy;
  }
}

export function createShip(options: ShipOptions = {}): Ship {
  return new Ship(options);
}

export function integrate(
  ship: Ship | ShipOptions,
  input: ShipInput | null,
  dt: number,
  config: typeof SHIP_CONFIG = SHIP_CONFIG
): Ship {
  if (ship instanceof Ship) {
    ship.update(dt, input, config);
    return ship;
  }
  const instance = new Ship(ship);
  instance.update(dt, input, config);
  return instance;
}


