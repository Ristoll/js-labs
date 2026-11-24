import { wrapAround } from './arena.js';
import { Ship } from './ship.js';
import { Bullet } from './bullet.js';
import { Asteroid } from './asteroid.js';
import { Pickup } from './pickup.js';

export class World {
  /** @type {Map<number, import('./entity.js').Entity>} */
  #entities = new Map();

  /** @type {Set<number>} */
  #toDespawn = new Set();

  spawn(entity) {
    if (!entity || typeof entity.id !== 'number') {
      throw new Error('World.spawn requires an Entity with a valid numeric id.');
    }
    this.#entities.set(entity.id, entity);
    return entity;
  }

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

  get(id) {
    return this.#entities.get(id);
  }

  has(id) {
    return this.#entities.has(id);
  }

  get size() {
    return this.#entities.size;
  }

  *[Symbol.iterator]() {
    yield* this.#entities.values();
  }

  *ofKind(kind) {
    for (const entity of this) {
      if (entity.kind === kind) {
        yield entity;
      }
    }
  }

  sweep() {
    for (const id of this.#toDespawn) {
      this.#entities.delete(id);
    }
    this.#toDespawn.clear();

    for (const [id, entity] of this.#entities) {
      if (!entity.alive) {
        this.#entities.delete(id);
      }
    }
  }

  step(dt, inputs = null, arena = null) {
    for (const entity of this) {
      if (!entity.alive) continue;

      if (entity.kind === 'ship') {
        // If inputs is a map/object of per-ship/player inputs, pass appropriate input
        let shipInput = inputs;
        if (inputs && typeof inputs.get === 'function') {
          shipInput = inputs.get(entity.playerId || entity.id) || null;
        } else if (inputs && typeof inputs === 'object' && !inputs.isDown && !('turn' in inputs)) {
          shipInput = inputs[entity.playerId] || inputs[entity.id] || null;
        }
        entity.update(dt, shipInput);
      } else {
        entity.update(dt, this);
      }

      if (arena) {
        wrapAround(entity, arena);
      }
    }

    this.sweep();
  }

  toSnapshot() {
    const list = [];
    for (const entity of this) {
      if (entity.alive && typeof entity.toSnapshot === 'function') {
        list.push(entity.toSnapshot());
      }
    }
    return list;
  }

  static fromSnapshot(snapshotList) {
    const world = new World();
    if (!Array.isArray(snapshotList)) return world;

    for (const item of snapshotList) {
      let entity = null;
      switch (item.kind) {
        case 'ship':
          entity = Ship.fromSnapshot(item);
          break;
        case 'bullet':
          entity = Bullet.fromSnapshot(item);
          break;
        case 'asteroid':
          entity = Asteroid.fromSnapshot(item);
          break;
        case 'pickup':
          entity = Pickup.fromSnapshot(item);
          break;
        default:
          break;
      }
      if (entity) {
        world.spawn(entity);
      }
    }
    return world;
  }

  clone() {
    const cloneWorld = new World();
    for (const entity of this) {
      cloneWorld.spawn(entity.clone());
    }
    return cloneWorld;
  }

  clear() {
    this.#entities.clear();
    this.#toDespawn.clear();
  }
}
