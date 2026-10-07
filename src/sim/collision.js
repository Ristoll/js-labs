/**
 * Collision detection and resolution system.
 * Designed as a modular, swappable function taking the World
 * and emitting colliding pairs (a, b) for easy spatial hash upgrade in Lab 7.
 */

/**
 * Checks circle-circle collision between two entities with radius.
 * @param {import('./entity.js').Entity} a
 * @param {import('./entity.js').Entity} b
 * @returns {boolean}
 */
export function checkCircleCollision(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const distanceSq = dx * dx + dy * dy;
  const radiusSum = a.radius + b.radius;
  return distanceSq <= radiusSum * radiusSum;
}

/**
 * Finds all colliding entity pairs in the world using an O(n^2) pass.
 * Swappable interface: (world) -> [[a, b], ...]
 *
 * @param {import('./world.js').World} world
 * @returns {Array<[import('./entity.js').Entity, import('./entity.js').Entity]>}
 */
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

/**
 * Generator variant emitting collision pairs on the fly.
 * @param {import('./world.js').World} world
 * @returns {Generator<[import('./entity.js').Entity, import('./entity.js').Entity]>}
 */
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

/**
 * Resolves detected collisions:
 * - Bullet vs Asteroid: Bullet and Asteroid destroyed, emits 'asteroid-destroyed'.
 * - Ship vs Asteroid: Asteroid destroyed, Ship takes damage via #hp, emits 'ship-hit'.
 *
 * @param {import('./world.js').World} world
 * @param {Array<[import('./entity.js').Entity, import('./entity.js').Entity]>} collisions
 * @param {Function} [onEvent] Event callback for gameplay side effects
 */
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
      continue;
    }

    // 3. Ship vs Pickup (composition-based bonuses)
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
