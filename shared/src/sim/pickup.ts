import { Entity, type EntityOptions } from './entity.ts';
import { Vector2 } from './vector.ts';
import type { PickupSnapshot } from '../types.ts';
import type { Ship } from './ship.ts';

export const PICKUP_TYPES = {
  SHIELD: 'shield',
  RAPID_FIRE: 'rapidfire',
} as const;

export type PickupType = (typeof PICKUP_TYPES)[keyof typeof PICKUP_TYPES];

export interface PickupEffect {
  readonly name: string;
  readonly color: string;
  readonly duration?: number;
  apply: (ship: Ship) => void;
}

export interface PickupOptions extends EntityOptions {
  type?: string;
  effect?: PickupEffect | null;
}

export class Pickup extends Entity {
  type: string;
  pulseTime: number;
  effect: PickupEffect;

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
  }: PickupOptions = {}) {
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
            apply(ship: Ship) {
              if (typeof ship.heal === 'function') {
                ship.heal(3);
              }
            },
          }
        : {
            name: 'Rapid Fire',
            color: '#facc15',
            duration: 8.0,
            apply(ship: Ship) {
              ship.rapidFireTimer = 8.0;
            },
          });
  }

  override update(dt: number): void {
    this.pulseTime += dt;
    this.angle += dt * 1.5;
    super.update(dt);
  }

  applyTo(ship: Ship): void {
    if (this.effect && typeof this.effect.apply === 'function') {
      this.effect.apply(ship);
    }
    this.alive = false;
  }

  override toSnapshot(): PickupSnapshot {
    const base = super.toSnapshot();
    return {
      kind: 'pickup',
      id: base.id,
      x: base.x,
      y: base.y,
      vx: base.vx,
      vy: base.vy,
      angle: base.angle,
      radius: base.radius,
      alive: base.alive,
      type: this.type,
    };
  }

  static fromSnapshot(
    snap: Partial<PickupSnapshot> & { id: number; x: number; y: number }
  ): Pickup {
    return new Pickup({
      id: snap.id,
      x: snap.x,
      y: snap.y,
      angle: snap.angle ?? 0,
      radius: snap.radius ?? 14,
      alive: snap.alive ?? true,
      type: snap.type ?? PICKUP_TYPES.SHIELD,
    });
  }

  override clone(): Pickup {
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

  static createRandom(
    arena: { readonly width: number; readonly height: number },
    x: number | null = null,
    y: number | null = null,
    prng: () => number = Math.random
  ): Pickup {
    const posX = x ?? 100 + prng() * (arena.width - 200);
    const posY = y ?? 100 + prng() * (arena.height - 200);
    const type = prng() > 0.5 ? PICKUP_TYPES.SHIELD : PICKUP_TYPES.RAPID_FIRE;

    return new Pickup({
      x: posX,
      y: posY,
      type,
    });
  }
}


