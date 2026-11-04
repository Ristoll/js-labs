import { Entity } from './entity.js';
import { Vector2 } from './vector.js';

export const PICKUP_TYPES = {
  SHIELD: 'shield',
  RAPID_FIRE: 'rapidfire',
};

/**
 * Stationary, collidable bonus pickup entity.
 * Uses composition: behavior/effect attached as component data.
 * Strictly 1-level inheritance (Pickup extends Entity).
 */
export class Pickup extends Entity {
  /**
   * @param {Object} options
   * @param {string} [options.type='shield'] 'shield' | 'rapidfire'
   * @param {Object} [options.effect] Custom effect handler object
   * @param {number} [options.radius=14] Collision radius
   */
  constructor({
    pos = null,
    vel = null,
    x = 0,
    y = 0,
    angle = 0,
    type = PICKUP_TYPES.SHIELD,
    effect = null,
    radius = 14,
    alive = true,
  } = {}) {
    super({
      pos,
      vel: vel || Vector2.zero(),
      x,
      y,
      vx: 0,
      vy: 0,
      angle,
      radius,
      alive,
      kind: 'pickup',
    });

    this.type = type;
    this.pulseTime = 0;

    // Composition: effect behavior attached as data
    this.effect =
      effect ||
      (type === PICKUP_TYPES.SHIELD
        ? {
            name: 'Shield Repair',
            color: '#4ade80',
            apply(ship) {
              if (typeof ship.heal === 'function') {
                ship.heal(3);
              }
            },
          }
        : {
            name: 'Rapid Fire',
            color: '#facc15',
            duration: 8.0,
            apply(ship) {
              ship.rapidFireTimer = 8.0;
            },
          });
  }

  /**
   * Updates visual pulse phase and maintains stationary position.
   * @param {number} dt Timestep in seconds
   */
  update(dt) {
    this.pulseTime += dt;
    this.angle += dt * 1.5; // gentle decorative spin
    super.update(dt);
  }

  /**
   * Applies pickup bonus to ship.
   * @param {import('./ship.js').Ship} ship
   */
  applyTo(ship) {
    if (this.effect && typeof this.effect.apply === 'function') {
      this.effect.apply(ship);
    }
    this.alive = false;
  }

  /**
   * Clones pickup instance.
   * @returns {Pickup}
   */
  clone() {
    const copy = new Pickup({
      pos: this.pos.clone(),
      vel: this.vel.clone(),
      angle: this.angle,
      type: this.type,
      effect: this.effect,
      radius: this.radius,
      alive: this.alive,
    });
    copy.pulseTime = this.pulseTime;
    return copy;
  }

  /**
   * Spawns a random pickup within arena coordinates.
   * @param {Object} arena
   * @param {number} [x] Optional specific coordinate
   * @param {number} [y] Optional specific coordinate
   * @returns {Pickup}
   */
  static createRandom(arena, x = null, y = null) {
    const posX = x !== null ? x : 100 + Math.random() * (arena.width - 200);
    const posY = y !== null ? y : 100 + Math.random() * (arena.height - 200);
    const type = Math.random() > 0.5 ? PICKUP_TYPES.SHIELD : PICKUP_TYPES.RAPID_FIRE;

    return new Pickup({
      x: posX,
      y: posY,
      type,
    });
  }
}
