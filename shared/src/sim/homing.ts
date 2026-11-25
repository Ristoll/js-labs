import { Vector2 } from './vector.ts';
import type { Entity } from './entity.ts';

type HomingWorld = {
  readonly ofKind: (kind: string) => Iterable<Entity>;
};

export class HomingComponent {
  targetSelector: string | ((host: Entity, world: unknown) => Entity | null) = 'asteroid';
  turnRate = Math.PI * 1.6;
  speed = 480;
  maxRange = 900;
  target: Entity | null = null;

  constructor({
    targetSelector = 'asteroid',
    turnRate = Math.PI * 1.6,
    speed = 480,
    maxRange = 900,
  }: {
    targetSelector?: string | ((host: Entity, world: unknown) => Entity | null);
    turnRate?: number;
    speed?: number;
    maxRange?: number;
  } = {}) {
    this.targetSelector = targetSelector;
    this.turnRate = turnRate;
    this.speed = speed;
    this.maxRange = maxRange;
  }

  update(host: Entity, dt: number, world: HomingWorld | null): void {
    if (!host || !host.alive || !world) return;

    let bestDistSq = this.maxRange * this.maxRange;
    let closest: Entity | null = null;

    if (typeof this.targetSelector === 'function') {
      closest = this.targetSelector(host, world);
    } else {
      for (const candidate of world.ofKind(this.targetSelector)) {
        if (!candidate.alive || candidate.id === host.id) continue;
        const dx = candidate.x - host.x;
        const dy = candidate.y - host.y;
        const distSq = dx * dx + dy * dy;
        if (distSq < bestDistSq) {
          bestDistSq = distSq;
          closest = candidate;
        }
      }
    }

    this.target = closest;
    if (!this.target) return;

    const toTarget = this.target.pos.sub(host.pos);
    const desiredAngle = Math.atan2(toTarget.y, toTarget.x);

    const twoPi = Math.PI * 2;
    const diff = (desiredAngle - host.angle) % twoPi;
    const shortestAngle = ((diff + Math.PI * 3) % twoPi) - Math.PI;

    const maxTurn = this.turnRate * dt;
    const actualTurn = Math.max(-maxTurn, Math.min(maxTurn, shortestAngle));

    host.angle += actualTurn;
    host.angle = Math.atan2(Math.sin(host.angle), Math.cos(host.angle));

    const currentSpeed = this.speed || host.vel.length();
    host.vel = Vector2.fromAngle(host.angle, currentSpeed);
  }

  clone(): HomingComponent {
    return new HomingComponent({
      targetSelector: this.targetSelector,
      turnRate: this.turnRate,
      speed: this.speed,
      maxRange: this.maxRange,
    });
  }
}


