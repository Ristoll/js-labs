import { wrapAround } from './arena.ts';
import { Ship } from './ship.ts';
import { Bullet } from './bullet.ts';
import { Asteroid } from './asteroid.ts';
import { Pickup } from './pickup.ts';
import { assertNever } from '../types.ts';
import type { Entity } from './entity.ts';
import type { Arena, EntitySnapshot } from '../types.ts';
import type { ShipInput } from './ship.ts';

function isEntitySnapshot(raw: unknown): raw is EntitySnapshot {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return false;
  }
  const r = raw as Record<string, unknown>; // narrow unknown snapshot to a record
  return typeof r.kind === 'string' && typeof r.id === 'number';
}

type Inputs = Map<string, ShipInput> | Record<string, ShipInput>;

export class World {
  #entities = new Map<number, Entity>();
  #toDespawn = new Set<number>();

  spawn(entity: Entity): Entity {
    if (!entity || typeof entity.id !== 'number') {
      throw new Error('World.spawn requires an Entity with a valid numeric id.');
    }
    this.#entities.set(entity.id, entity);
    return entity;
  }

  despawn(target: number | Entity): void {
    const id = typeof target === 'number' ? target : target?.id;
    if (typeof id === 'number') {
      const entity = this.#entities.get(id);
      if (entity) {
        entity.alive = false;
      }
      this.#toDespawn.add(id);
    }
  }

  get(id: number): Entity | undefined {
    return this.#entities.get(id);
  }

  has(id: number): boolean {
    return this.#entities.has(id);
  }

  get size(): number {
    return this.#entities.size;
  }

  *[Symbol.iterator](): IterableIterator<Entity> {
    yield* this.#entities.values();
  }

  *ofKind(kind: string): IterableIterator<Entity> {
    for (const entity of this.#entities.values()) {
      if (entity.kind === kind) {
        yield entity;
      }
    }
  }

  sweep(): void {
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

  step(dt: number, inputs: Inputs | null = null, arena: Arena | null = null): void {
    for (const entity of this.#entities.values()) {
      if (!entity.alive) continue;

      let shipInput: ShipInput | null = null;
      if (inputs) {
        const key = entity.playerId ?? String(entity.id);
        if (inputs instanceof Map) {
          shipInput = inputs.get(key) ?? null;
        } else {
          shipInput = inputs[key] ?? null;
        }
      }

      if (entity.kind === 'ship') {
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

  toSnapshot(): Array<{
    id: number;
    kind: string;
    x: number;
    y: number;
    vx: number;
    vy: number;
    angle: number;
    radius: number;
    alive: boolean;
  }> {
    const list: Array<{
      id: number;
      kind: string;
      x: number;
      y: number;
      vx: number;
      vy: number;
      angle: number;
      radius: number;
      alive: boolean;
    }> = [];
    for (const entity of this.#entities.values()) {
      if (entity.alive && typeof entity.toSnapshot === 'function') {
        list.push(entity.toSnapshot());
      }
    }
    return list;
  }

  static fromSnapshot(snapshotList: readonly unknown[]): World {
    const world = new World();
    if (!Array.isArray(snapshotList)) return world;

    for (const raw of snapshotList) {
      if (!isEntitySnapshot(raw)) continue;
      const item = raw;
      let entity: Entity | null = null;
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
          assertNever(item);
      }
      if (entity) {
        world.spawn(entity);
      }
    }
    return world;
  }

  clone(): World {
    const cloneWorld = new World();
    for (const entity of this.#entities.values()) {
      cloneWorld.spawn(entity.clone());
    }
    return cloneWorld;
  }

  clear(): void {
    this.#entities.clear();
    this.#toDespawn.clear();
  }
}

