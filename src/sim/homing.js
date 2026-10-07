import { Vector2 } from './vector.js';

/**
 * Homing steering behavior component.
 * Implemented via composition: attaches to any Entity (Bullet, Asteroid, Drone)
 * without sub-classing or complicating the inheritance hierarchy.
 */
export class HomingComponent {
  /**
   * @param {Object} options
   * @param {string|Function} [options.targetSelector='asteroid'] Kind of target to seek
   * @param {number} [options.turnRate=Math.PI * 1.6] Maximum steering turn rate in rad/s
   * @param {number} [options.speed=480] Forward tracking speed in px/s
   * @param {number} [options.maxRange=900] Acquisition radius
   */
  constructor({
    targetSelector = 'asteroid',
    turnRate = Math.PI * 1.6,
    speed = 480,
    maxRange = 900,
  } = {}) {
    this.targetSelector = targetSelector;
    this.turnRate = turnRate;
    this.speed = speed;
    this.maxRange = maxRange;
    this.target = null;
  }

  /**
   * Steers host entity heading and velocity smoothly towards target.
   * @param {import('./entity.js').Entity} host Host entity containing this component
   * @param {number} dt Timestep in seconds
   * @param {import('./world.js').World} world World containing potential targets
   */
  update(host, dt, world) {
    if (!host || !host.alive || !world) return;

    // 1. Target acquisition: locate closest valid entity
    let bestDistSq = this.maxRange * this.maxRange;
    let closest = null;

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

    // 2. Desired heading vector
    const toTarget = this.target.pos.sub(host.pos);
    const desiredAngle = Math.atan2(toTarget.y, toTarget.x);

    // 3. Shortest-arc circular angle delta
    const twoPi = Math.PI * 2;
    const diff = (desiredAngle - host.angle) % twoPi;
    const shortestAngle = ((diff + Math.PI * 3) % twoPi) - Math.PI;

    // 4. Smooth angular steering clamped to turn rate
    const maxTurn = this.turnRate * dt;
    const actualTurn = Math.max(-maxTurn, Math.min(maxTurn, shortestAngle));

    host.angle += actualTurn;
    host.angle = Math.atan2(Math.sin(host.angle), Math.cos(host.angle));

    // 5. Align velocity along adjusted heading
    const currentSpeed = this.speed || host.vel.length();
    host.vel = Vector2.fromAngle(host.angle, currentSpeed);
  }

  /**
   * Clones component for state interpolation.
   * @returns {HomingComponent}
   */
  clone() {
    return new HomingComponent({
      targetSelector: this.targetSelector,
      turnRate: this.turnRate,
      speed: this.speed,
      maxRange: this.maxRange,
    });
  }
}

