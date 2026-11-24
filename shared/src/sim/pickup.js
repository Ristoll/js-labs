import { Entity } from './entity.js';
import { Vector2 } from './vector.js';

export const PICKUP_TYPES = {
  SHIELD: 'shield',
  RAPID_FIRE: 'rapidfire',
};

export class Pickup extends Entity {
  constructor({
    id = null,
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
      id,
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

  update(dt) {
    this.pulseTime += dt;
    this.angle += dt * 1.5;
    super.update(dt);
  }

  applyTo(ship) {
    if (this.effect && typeof this.effect.apply === 'function') {
      this.effect.apply(ship);
    }
    this.alive = false;
  }

  toSnapshot() {
    return {
      ...super.toSnapshot(),
      type: this.type,
    };
  }

  static fromSnapshot(snap) {
    return new Pickup({
      id: snap.id,
      x: snap.x,
      y: snap.y,
      angle: snap.angle,
      radius: snap.radius,
      alive: snap.alive,
      type: snap.type ?? PICKUP_TYPES.SHIELD,
    });
  }

  clone() {
    const copy = new Pickup({
      id: this.id,
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

  static createRandom(arena, x = null, y = null, prng = Math.random) {
    const posX = x !== null ? x : 100 + prng() * (arena.width - 200);
    const posY = y !== null ? y : 100 + prng() * (arena.height - 200);
    const type = prng() > 0.5 ? PICKUP_TYPES.SHIELD : PICKUP_TYPES.RAPID_FIRE;

    return new Pickup({
      x: posX,
      y: posY,
      type,
    });
  }
}
