import { simEvents } from './events.js';

export function checkCircleCollision(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const distanceSq = dx * dx + dy * dy;
  const radiusSum = a.radius + b.radius;
  return distanceSq <= radiusSum * radiusSum;
}

export function findCollisions(world) {
  const entities = [...world];
  const collisions = [];
  const len = entities.length;

  for (let i = 0; i < len; i++) {
    const a = entities[i];
    if (!a.alive) continue;

    for (let j = i + 1; j < len; j++) {
      const b = entities[j];
      if (!b.alive) continue;

      if (checkCircleCollision(a, b)) {
        collisions.push([a, b]);
      }
    }
  }

  return collisions;
}

export function* findCollisionPairs(world) {
  const entities = [...world];
  const len = entities.length;

  for (let i = 0; i < len; i++) {
    const a = entities[i];
    if (!a.alive) continue;

    for (let j = i + 1; j < len; j++) {
      const b = entities[j];
      if (!b.alive) continue;

      if (checkCircleCollision(a, b)) {
        yield [a, b];
      }
    }
  }
}

export function resolveCollisions(world, collisions, onEvent = null) {
  for (const [a, b] of collisions) {
    if (!a.alive || !b.alive) continue;

    const isBulletA = a.kind === 'bullet';
    const isBulletB = b.kind === 'bullet';
    const isAsteroidA = a.kind === 'asteroid';
    const isAsteroidB = b.kind === 'asteroid';
    const isShipA = a.kind === 'ship';
    const isShipB = b.kind === 'ship';

    // 1. Bullet vs Asteroid
    if ((isBulletA && isAsteroidB) || (isBulletB && isAsteroidA)) {
      const bullet = isBulletA ? a : b;
      const asteroid = isAsteroidA ? a : b;

      bullet.alive = false;
      asteroid.alive = false;

      if (onEvent) {
        onEvent({
          type: 'asteroid-destroyed',
          asteroid,
          bullet,
          score: 100,
        });
      }
      if (simEvents && typeof simEvents.dispatchEvent === 'function') {
        try {
          simEvents.dispatchEvent(
            new CustomEvent('exploded', { detail: { x: asteroid.x, y: asteroid.y } })
          );
        } catch (_e) {}
      }
      continue;
    }

    // 2. Ship vs Asteroid
    if ((isShipA && isAsteroidB) || (isShipB && isAsteroidA)) {
      const ship = isShipA ? a : b;
      const asteroid = isAsteroidA ? a : b;

      asteroid.alive = false;

      let destroyed;
      if (typeof ship.takeDamage === 'function') {
        const remainingHp = ship.takeDamage(1);
        destroyed = remainingHp <= 0;
      } else {
        ship.alive = false;
        destroyed = true;
      }

      if (onEvent) {
        onEvent({
          type: 'ship-hit',
          ship,
          asteroid,
          hp: ship.hp,
          destroyed,
        });
      }
      if (simEvents && typeof simEvents.dispatchEvent === 'function') {
        try {
          simEvents.dispatchEvent(
            new CustomEvent('hit', { detail: { shipId: ship.id, hp: ship.hp } })
          );
        } catch (_e) {}
      }
      continue;
    }

    // 3. Bullet vs Ship (dogfight pvp)
    if ((isBulletA && isShipB) || (isBulletB && isShipA)) {
      const bullet = isBulletA ? a : b;
      const ship = isShipA ? a : b;

      // Don't hit yourself with your own bullet
      if (
        bullet.ownerId !== null &&
        (bullet.ownerId === ship.playerId || bullet.ownerId === ship.id)
      ) {
        continue;
      }

      bullet.alive = false;
      let destroyed;
      if (typeof ship.takeDamage === 'function') {
        const remainingHp = ship.takeDamage(bullet.damage || 1);
        destroyed = remainingHp <= 0;
      } else {
        ship.alive = false;
        destroyed = true;
      }

      if (onEvent) {
        onEvent({
          type: 'ship-shot',
          ship,
          bullet,
          hp: ship.hp,
          destroyed,
        });
      }
      if (simEvents && typeof simEvents.dispatchEvent === 'function') {
        try {
          simEvents.dispatchEvent(
            new CustomEvent('hit', { detail: { shipId: ship.id, hp: ship.hp } })
          );
        } catch (_e) {}
      }
      continue;
    }

    // 4. Ship vs Pickup
    const isPickupA = a.kind === 'pickup';
    const isPickupB = b.kind === 'pickup';
    if ((isShipA && isPickupB) || (isShipB && isPickupA)) {
      const ship = isShipA ? a : b;
      const pickup = isPickupA ? a : b;

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
