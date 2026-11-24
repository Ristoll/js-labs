import { Entity } from './entity.js';
import { Vector2 } from './vector.js';
import { Bullet } from './bullet.js';
import { simEvents } from './events.js';

export const SHIP_CONFIG = {
  thrustPower: 380,
  reversePower: 230,
  turnSpeed: Math.PI * 1.6,
  linearDrag: 0.45,
  maxSpeed: 450,
  fireCooldown: 0.18,
};

export class Ship extends Entity {
  #hp = 3;

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
      kind: 'ship',
    });

    this.#hp = hp;
    this.playerId = playerId;
    this.thrust = thrust;
    this.reverse = reverse;
    this.cooldown = 0;
    this.rapidFireTimer = 0;
  }

  get hp() {
    return this.#hp;
  }

  takeDamage(amount = 1) {
    this.#hp = Math.max(0, this.#hp - amount);
    if (this.#hp <= 0) {
      this.alive = false;
    }
    return this.#hp;
  }

  heal(amount = 3) {
    this.#hp = Math.min(3, this.#hp + amount);
    return this.#hp;
  }

  reset(x = 0, y = 0, angle = -Math.PI / 2) {
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

  fire(world = null, isHoming = false, bulletId = null) {
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
      ownerId: this.playerId || this.id,
    });

    const cooldownMultiplier = this.rapidFireTimer > 0 ? 0.45 : 1.0;
    this.cooldown = SHIP_CONFIG.fireCooldown * cooldownMultiplier;

    if (world && typeof world.spawn === 'function') {
      world.spawn(bullet);
    }

    if (simEvents && typeof simEvents.dispatchEvent === 'function') {
      try {
        simEvents.dispatchEvent(new CustomEvent('fired', { detail: { shipId: this.id } }));
      } catch (_e) {
        // ignore in non-DOM/test contexts
      }
    }

    return bullet;
  }

  update(dt, input = null, config = SHIP_CONFIG) {
    if (input) {
      let turn = 0;
      let isThrusting = false;
      let isReversing = false;

      // Support both structured network input ({ turn, thrust, reverse }) and keyboard input ({ isDown })
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

  toSnapshot() {
    return {
      ...super.toSnapshot(),
      playerId: this.playerId,
      hp: this.hp,
      thrust: this.thrust,
      reverse: this.reverse,
    };
  }

  static fromSnapshot(snap) {
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

  clone() {
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

export function createShip(options = {}) {
  return new Ship(options);
}

export function integrate(ship, input, dt, config = SHIP_CONFIG) {
  if (ship instanceof Ship) {
    ship.update(dt, input, config);
    return ship;
  }
  const instance = new Ship(ship);
  instance.update(dt, input, config);
  return instance;
}
