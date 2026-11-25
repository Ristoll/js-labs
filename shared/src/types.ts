/**
 * Branded types, discriminated unions, and shared simulation types for Lab 06.
 */

declare const EntityIdBrand: unique symbol;
export type EntityId = number & { readonly [EntityIdBrand]: true };
declare const TickBrand: unique symbol;
export type Tick = number & { readonly [TickBrand]: true };
declare const SeqBrand: unique symbol;
export type Seq = number & { readonly [SeqBrand]: true };

/** Single justified cast: branded-type constructor. */
function brand<T>(n: number): T {
  return n as T; // branded-type constructor (EntityId / Tick / Seq)
}
export function asEntityId(n: number): EntityId {
  return brand<EntityId>(n);
}
export function asTick(n: number): Tick {
  return brand<Tick>(n);
}
export function asSeq(n: number): Seq {
  return brand<Seq>(n);
}

export type ShipSnapshot = {
  kind: 'ship';
  id: EntityId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  radius: number;
  alive: boolean;
  hp: number;
  thrust: boolean;
  reverse: boolean;
  playerId: string | null;
};

export type BulletSnapshot = {
  kind: 'bullet';
  id: EntityId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  radius: number;
  alive: boolean;
  ttl: number;
  damage: number;
  ownerId: string | number | null;
};

export type AsteroidSnapshot = {
  kind: 'asteroid';
  id: EntityId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  radius: number;
  alive: boolean;
  angularVelocity: number;
};

export type PickupSnapshot = {
  kind: 'pickup';
  id: EntityId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  radius: number;
  alive: boolean;
  type: string;
};

export type EntitySnapshot =
  | ShipSnapshot
  | BulletSnapshot
  | AsteroidSnapshot
  | PickupSnapshot;

export type InputPayload = {
  seq: Seq | number;
  tick?: Tick | number;
  thrust?: boolean;
  reverse?: boolean;
  turn?: number;
  fire?: boolean;
};

export type Arena = {
  readonly width: number;
  readonly height: number;
  readonly halfWidth: number;
  readonly halfHeight: number;
};

/** Exhaustiveness guard: any switch that reaches this is a compile-time error. */
export function assertNever(x: never): never {
  throw new Error(`Unexpected object: ${String(x)}`);
}


