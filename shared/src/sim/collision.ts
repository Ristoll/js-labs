import { simEvents } from './events.ts';
import type { Entity } from './entity.ts';
import type { Ship } from './ship.ts';
import type { Bullet } from './bullet.ts';
import type { Asteroid } from './asteroid.ts';
import type { Pickup } from './pickup.ts';

export function checkCircleCollision(a: Entity, b: Entity): boolean {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const distanceSq = dx * dx + dy * dy;
  const radiusSum = a.radius + b.radius;
  return distanceSq <= radiusSum * radiusSum;
}

export function findCollisions(world: Iterable<Entity>): [Entity, Entity][] {
  const entities = [...world];
  const collisions: [Entity, Entity][] = [];
  const len = entities.length;

  for (let i = 0; i < len; i++) {
    const a = entities[i]!;
    if (!a.alive) continue;

    for (let j = i + 1; j < len; j++) {
      const b = entities[j]!;
      if (!b.alive) continue;

      if (checkCircleCollision(a, b)) {
        collisions.push([a, b]);
      }
    }
  }

  return collisions;
}

export function* findCollisionPairs(world: Iterable<Entity>): Generator<[Entity, Entity]> {
  const entities = [...world];
  const len = entities.length;

  for (let i = 0; i < len; i++) {
    const a = entities[i]!;
    if (!a.alive) continue;

    for (let j = i + 1; j < len; j++) {
      const b = entities[j]!;
      if (!b.alive) continue;

      if (checkCircleCollision(a, b)) {
        yield [a, b];
      }
    }
  }
}

function isShip(e: Entity): e is Ship {
  return e.kind === 'ship';
}
function isBullet(e: Entity): e is Bullet {
  return e.kind === 'bullet';
}
function isAsteroid(e: Entity): e is Asteroid {
  return e.kind === 'asteroid';
}
function isPickup(e: Entity): e is Pickup {
  return e.kind === 'pickup';
}

interface CollisionEvent {
  type: string;
  ship?: Entity;
  bullet?: Entity;
  asteroid?: Entity;
  pickup?: Entity;
  hp?: number;
  score?: number;
  pickupType?: string;
  destroyed?: boolean;
  x?: number;
  y?: number;
}

function emitExploded(asteroid: Asteroid): void {
  if (simEvents && typeof simEvents.dispatchEvent === 'function') {
    try {
      simEvents.dispatchEvent(new CustomEvent('exploded', { detail: { x: asteroid.x, y: asteroid.y } }));
    } catch {
      // swallow
    }
  }
}

function emitHit(ship: Ship): void {
  if (simEvents && typeof simEvents.dispatchEvent === 'function') {
    try {
      simEvents.dispatchEvent(new CustomEvent('hit', { detail: { shipId: ship.id, hp: ship.hp } }));
    } catch {
      // swallow
    }
  }
}

export function resolveCollisions(
  world: Iterable<Entity>,
  collisions: readonly [Entity, Entity][],
  onEvent: ((event: CollisionEvent) => void) | null = null
): void {
  for (const pair of collisions) {
    const a = pair[0]!;
    const b = pair[1]!;
    if (!a.alive || !b.alive) continue;

    if (isBullet(a) && isAsteroid(b)) {
      const bullet = a;
      const asteroid = b;

      bullet.alive = false;
      asteroid.alive = false;

      if (onEvent) {
        onEvent({ type: 'asteroid-destroyed', asteroid, bullet, score: 100 });
      }
      emitExploded(asteroid);
      continue;
    }

    if (isBullet(b) && isAsteroid(a)) {
      const bullet = b;
      const asteroid = a;

      bullet.alive = false;
      asteroid.alive = false;

      if (onEvent) {
        onEvent({ type: 'asteroid-destroyed', asteroid, bullet, score: 100 });
      }
      emitExploded(asteroid);
      continue;
    }

    if (isShip(a) && isAsteroid(b)) {
      const ship = a;
      const asteroid = b;

      asteroid.alive = false;

      let destroyed: boolean;
      if (typeof ship.takeDamage === 'function') {
        const remainingHp = ship.takeDamage(1);
        destroyed = remainingHp <= 0;
      } else {
        ship.alive = false;
        destroyed = true;
      }

      if (onEvent) {
        onEvent({ type: 'ship-hit', ship, asteroid, hp: ship.hp, destroyed });
      }
      emitHit(ship);
      continue;
    }

    if (isShip(b) && isAsteroid(a)) {
      const ship = b;
      const asteroid = a;

      asteroid.alive = false;

      let destroyed: boolean;
      if (typeof ship.takeDamage === 'function') {
        const remainingHp = ship.takeDamage(1);
        destroyed = remainingHp <= 0;
      } else {
        ship.alive = false;
        destroyed = true;
      }

      if (onEvent) {
        onEvent({ type: 'ship-hit', ship, asteroid, hp: ship.hp, destroyed });
      }
      emitHit(ship);
      continue;
    }

    if (isBullet(a) && isShip(b)) {
      const bullet = a;
      const ship = b;

      if (
        bullet.ownerId !== null &&
        (bullet.ownerId === ship.playerId || bullet.ownerId === ship.id)
      ) {
        continue;
      }

      bullet.alive = false;
      let destroyed: boolean;
      if (typeof ship.takeDamage === 'function') {
        const remainingHp = ship.takeDamage(bullet.damage ?? 1);
        destroyed = remainingHp <= 0;
      } else {
        ship.alive = false;
        destroyed = true;
      }

      if (onEvent) {
        onEvent({ type: 'ship-shot', ship, bullet, hp: ship.hp, destroyed });
      }
      emitHit(ship);
      continue;
    }

    if (isBullet(b) && isShip(a)) {
      const bullet = b;
      const ship = a;

      if (
        bullet.ownerId !== null &&
        (bullet.ownerId === ship.playerId || bullet.ownerId === ship.id)
      ) {
        continue;
      }

      bullet.alive = false;
      let destroyed: boolean;
      if (typeof ship.takeDamage === 'function') {
        const remainingHp = ship.takeDamage(bullet.damage ?? 1);
        destroyed = remainingHp <= 0;
      } else {
        ship.alive = false;
        destroyed = true;
      }

      if (onEvent) {
        onEvent({ type: 'ship-shot', ship, bullet, hp: ship.hp, destroyed });
      }
      emitHit(ship);
      continue;
    }

    if (isShip(a) && isPickup(b)) {
      const ship = a;
      const pickup = b;

      if (typeof pickup.applyTo === 'function') {
        pickup.applyTo(ship);
      } else {
        pickup.alive = false;
      }

      if (onEvent) {
        onEvent({
          type: 'pickup-collected',
          ship,
          pickup,
          pickupType: pickup.type,
          score: 50,
        });
      }
      continue;
    }

    if (isShip(b) && isPickup(a)) {
      const ship = b;
      const pickup = a;

      if (typeof pickup.applyTo === 'function') {
        pickup.applyTo(ship);
      } else {
        pickup.alive = false;
      }

      if (onEvent) {
        onEvent({
          type: 'pickup-collected',
          ship,
          pickup,
          pickupType: pickup.type,
          score: 50,
        });
      }
    }
  }
}
