import { Entity } from './entity.js';
import { Vector2 } from './vector.js';
import { Bullet } from './bullet.js';
import { HomingComponent } from './homing.js';

/**
 * Ship physics configuration constants.
 */
export const SHIP_CONFIG = {
  thrustPower: 380, // pixels/s^2 forward acceleration
  reversePower: 230, // pixels/s^2 reverse acceleration
  turnSpeed: Math.PI * 1.6, // radians/s (~288 deg/s for snappy handling)
  linearDrag: 0.45, // exponential damping coefficient (drift physics)
  maxSpeed: 450, // maximum velocity magnitude in pixels/s
  fireCooldown: 0.18, // seconds between shots
};

/**
 * Player Ship model extending Entity (strictly 1-level inheritance).
 */
export class Ship extends Entity {
  #hp = 3;

  /**
   * @param {Object} options
   * @param {number} [options.hp=3] Initial ship health points
   */
  constructor({
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
    this.thrust = thrust;
    this.reverse = reverse;
    this.cooldown = 0;
    this.rapidFireTimer = 0;
  }

  /**
   * Current health points (encapsulated via private field #hp).
   * @returns {number}
   */
  get hp() {
    return this.#hp;
  }

  /**
   * Reduces ship health by specified damage amount.
   * Marks alive = false when health reaches zero.
   * @param {number} [amount=1]
   * @returns {number} Remaining health points
   */
  takeDamage(amount = 1) {
    this.#hp = Math.max(0, this.#hp - amount);
    if (this.#hp <= 0) {
      this.alive = false;
    }
    return this.#hp;
  }

  /**
   * Resets ship state for safe respawn.
   * @param {number} x
   * @param {number} y
   * @param {number} [angle=-Math.PI / 2]
   */
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

  /**
   * Spawns a bullet from the ship's nose with inherited velocity.
   * Optionally equips a HomingComponent via composition.
   *
   * @param {Object} [world] Optional World instance to register the bullet
   * @param {boolean} [isHoming=false] Whether to attach homing behavior component
   * @returns {Bullet} The newly spawned bullet entity
   */
  fire(world = null, isHoming = false) {
    if (this.cooldown > 0) return null;

    // Nose position (26px forward along current heading)
    const nose = this.pos.add(Vector2.fromAngle(this.angle, 26));
    const speed = isHoming ? 440 : 520;
    const bulletVel = this.vel.add(Vector2.fromAngle(this.angle, speed));

    const homingComponent = isHoming
      ? new HomingComponent({
          targetSelector: 'asteroid',
          turnRate: Math.PI * 2.2,
          speed: 550,
          maxRange: 1000,
        })
      : null;

    const bullet = new Bullet({
      pos: nose,
      vel: bulletVel,
      angle: this.angle,
      ttl: isHoming ? 2.2 : 1.5,
      damage: 1,
      homing: homingComponent,
    });

    const cooldownMultiplier = this.rapidFireTimer > 0 ? 0.45 : 1.0;
    this.cooldown = SHIP_CONFIG.fireCooldown * cooldownMultiplier;

    if (world && typeof world.spawn === 'function') {
      world.spawn(bullet);
    }

    return bullet;
  }

  /**
   * Updates ship physics: rotation, thrust, reverse, drag, and speed clamping.
   * Calls super.update(dt) to advance position.
   *
   * @param {number} dt Timestep in seconds
   * @param {Object} [input] Input reader ({ isDown })
   * @param {Object} [config=SHIP_CONFIG] Physics constants override
   */
  update(dt, input = null, config = SHIP_CONFIG) {
    if (input) {
      // 1. Rotation handling
      let turn = 0;
      if (input.isDown('ArrowLeft') || input.isDown('KeyA')) {
        turn -= 1;
      }
      if (input.isDown('ArrowRight') || input.isDown('KeyD')) {
        turn += 1;
      }

      this.angle += turn * config.turnSpeed * dt;

      // Normalize angle to [-PI, PI]
      this.angle = Math.atan2(Math.sin(this.angle), Math.cos(this.angle));

      // 2. Thrust & Reverse handling along heading (angle 0 is +X)
      const isThrusting = input.isDown('ArrowUp') || input.isDown('KeyW') || input.isDown('Space');
      const isReversing = input.isDown('ArrowDown') || input.isDown('KeyS');

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

    // 3. Drag / Damping (framerate-independent exponential decay)
    const damping = Math.exp(-config.linearDrag * dt);
    this.vel = this.vel.scale(damping);

    // 4. Speed clamp
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

    // 5. Position integration delegated to Entity base class
    super.update(dt);
  }

  /**
   * Creates an independent copy of this Ship instance.
   * @returns {Ship}
   */
  clone() {
    const copy = new Ship({
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

/**
 * Factory function creating an initial Ship instance.
 */
export function createShip(options = {}) {
  return new Ship(options);
}

/**
 * Functional integration helper advancing ship state.
 *
 * @param {Ship|Object} ship Current ship state
 * @param {Object} input Input reader ({ isDown })
 * @param {number} dt Timestep in seconds
 * @param {Object} [config=SHIP_CONFIG] Physics constants override
 * @returns {Ship} Next ship state
 */
export function integrate(ship, input, dt, config = SHIP_CONFIG) {
  if (ship instanceof Ship) {
    ship.update(dt, input, config);
    return ship;
  }
  const instance = new Ship(ship);
  instance.update(dt, input, config);
  return instance;
}
