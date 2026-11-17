import { Entity } from './entity.js';
import { Vector2 } from './vector.js';

/**
 * Creates craggy polygon vertices for realistic asteroid visuals.
 */
function createAsteroidVertices(radius, count = 10) {
  const points = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    // Radial variance +/- 25% for rocky crags
    const r = radius * (0.75 + Math.random() * 0.5);
    points.push({
      x: Math.cos(a) * r,
      y: Math.sin(a) * r,
    });
  }
  return points;
}

/**
 * Asteroid obstacle entity drifting and tumbling through space.
 * Strictly 1-level inheritance (Asteroid extends Entity).
 */
export class Asteroid extends Entity {
  /**
   * @param {Object} options
   * @param {number} [options.angularVelocity] Tumble spin rate in rad/s
   * @param {number} [options.radius=24] Collision and visual radius
   * @param {Array<{x: number, y: number}>} [options.vertices] Procedural polygon outline
   */
  constructor({
    pos = null,
    vel = null,
    x = 0,
    y = 0,
    vx = 0,
    vy = 0,
    angle = 0,
    angularVelocity = (Math.random() - 0.5) * 1.4,
    radius = 24,
    vertices = null,
    alive = true,
    homing = null,
  } = {}) {
    super({
      pos,
      vel,
      x,
      y,
      vx,
      vy,
      angle,
      radius,
      alive,
      kind: 'asteroid',
    });

    this.angularVelocity = angularVelocity;
    this.vertices = vertices || createAsteroidVertices(radius);
    this.homing = homing;
  }

  /**
   * Rotates and moves asteroid by its drift velocity.
   * If homing component is attached via composition, tracks target.
   * @param {number} dt Timestep in seconds
   * @param {import('./world.js').World} [world] Optional world instance
   */
  update(dt, world = null) {
    if (this.homing && world) {
      this.homing.update(this, dt, world);
    }
    this.angle += this.angularVelocity * dt;
    super.update(dt);
  }

  /**
   * Creates an independent copy of this asteroid.
   * @returns {Asteroid}
   */
  clone() {
    return new Asteroid({
      pos: this.pos.clone(),
      vel: this.vel.clone(),
      angle: this.angle,
      angularVelocity: this.angularVelocity,
      radius: this.radius,
      vertices: this.vertices,
      alive: this.alive,
      homing: this.homing ? this.homing.clone() : null,
    });
  }

  /**
   * Helper factory creating a random asteroid within an arena.
   * @param {Object} arena
   * @param {Vector2} [avoidPos] Optional position to stay away from (e.g. player ship)
   * @returns {Asteroid}
   */
  static createRandom(arena, avoidPos = null) {
    let x = Math.random() * arena.width;
    let y = Math.random() * arena.height;

    // Ensure we don't spawn right on top of the player
    if (avoidPos) {
      let attempts = 0;
      while (Math.hypot(x - avoidPos.x, y - avoidPos.y) < 160 && attempts < 10) {
        x = Math.random() * arena.width;
        y = Math.random() * arena.height;
        attempts++;
      }
    }

    const speed = 25 + Math.random() * 55;
    const moveAngle = Math.random() * Math.PI * 2;
    const vel = Vector2.fromAngle(moveAngle, speed);
    const radius = 18 + Math.random() * 22;

    return new Asteroid({
      x,
      y,
      vel,
      radius,
      angle: Math.random() * Math.PI * 2,
    });
  }
}
