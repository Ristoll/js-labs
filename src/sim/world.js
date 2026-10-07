import { wrapAround } from './arena.js';

/**
 * World: Map-based Entity Manager for Dogfight.
 *
 * Implements:
 * - Map<number, Entity> storage for O(1) lookups and identity-safe indexing.
 * - Deferred despawn sweep (avoids mutating collections during active iteration).
 * - Generator-based iterator [Symbol.iterator] and *ofKind(kind) queries.
 */
export class World {
  /** @type {Map<number, import('./entity.js').Entity>} */
  #entities = new Map();

  /** @type {Set<number>} */
  #toDespawn = new Set();

  /**
   * Spawns an entity into the world.
   * @param {import('./entity.js').Entity} entity
   * @returns {import('./entity.js').Entity}
   */
  spawn(entity) {
    if (!entity || typeof entity.id !== 'number') {
      throw new Error('World.spawn requires an Entity with a valid numeric id.');
    }
    this.#entities.set(entity.id, entity);
    return entity;
  }

  /**
   * Schedules an entity for deferred despawn at the end of the simulation step.
   * @param {number|import('./entity.js').Entity} target Entity or entity id
   */
  despawn(target) {
    const id = typeof target === 'number' ? target : target?.id;
    if (typeof id === 'number') {
      const entity = this.#entities.get(id);
      if (entity) {
        entity.alive = false;
      }
      this.#toDespawn.add(id);
    }
  }

  /**
   * Retrieves an entity by id.
   * @param {number} id
   * @returns {import('./entity.js').Entity|undefined}
   */
  get(id) {
    return this.#entities.get(id);
  }

  /**
   * Checks if an entity exists by id.
   * @param {number} id
   * @returns {boolean}
   */
  has(id) {
    return this.#entities.has(id);
  }

  /**
   * Number of active entities currently in the world.
   * @returns {number}
   */
  get size() {
    return this.#entities.size;
  }

  /**
   * Direct iteration protocol over all active entities.
   * @returns {Iterator<import('./entity.js').Entity>}
   */
  *[Symbol.iterator]() {
    yield* this.#entities.values();
  }

  /**
   * Generator querying entities matching a specific kind without intermediate arrays.
   * @param {string} kind
   * @returns {Generator<import('./entity.js').Entity>}
   */
  *ofKind(kind) {
    for (const entity of this) {
      if (entity.kind === kind) {
        yield entity;
      }
    }
  }

  /**
   * Deferred sweep removing marked and dead entities from the Map store.
   */
  sweep() {
    // 1. Sweep entities explicitly queued in #toDespawn
    for (const id of this.#toDespawn) {
      this.#entities.delete(id);
    }
    this.#toDespawn.clear();

    // 2. Sweep entities whose alive flag became false during update (e.g. TTL expiration)
    for (const [id, entity] of this.#entities) {
      if (!entity.alive) {
        this.#entities.delete(id);
      }
    }
  }

  /**
   * Advances simulation for all entities by timestep dt, wraps boundaries,
   * and performs deferred sweep of dead objects.
   *
   * @param {number} dt Timestep in seconds
   * @param {Object} [inputs] Input reader ({ isDown })
   * @param {Object} [arena] Arena dimensions { width, height }
   */
  step(dt, inputs = null, arena = null) {
    // 1. Update all entities
    for (const entity of this) {
      if (!entity.alive) continue;

      if (entity.kind === 'ship') {
        entity.update(dt, inputs);
      } else {
        entity.update(dt, this);
      }

      // Toroidal boundary wrap
      if (arena) {
        wrapAround(entity, arena);
      }
    }

    // 2. Perform safe deferred sweep at the end of the physics step
    this.sweep();
  }

  /**
   * Creates an independent cloned snapshot of all entities in the world.
   * Used for render interpolation.
   * @returns {World}
   */
  clone() {
    const cloneWorld = new World();
    for (const entity of this) {
      cloneWorld.spawn(entity.clone());
    }
    return cloneWorld;
  }

  /**
   * Clears all entities from the world.
   */
  clear() {
    this.#entities.clear();
    this.#toDespawn.clear();
  }
}
