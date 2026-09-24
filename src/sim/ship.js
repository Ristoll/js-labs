/**
 * Pure simulation model for the player ship.
 *
 * Ship state is a plain JavaScript object:
 * { x, y, vx, vy, angle, thrust }
 *
 * All simulation functions are pure: (state, input, dt) -> nextState.
 * Zero DOM, window, or canvas dependencies.
 */

export const SHIP_CONFIG = {
  thrustPower: 380, // pixels/s^2 forward acceleration
  reversePower: 230, // pixels/s^2 reverse acceleration
  turnSpeed: Math.PI * 1.6, // radians/s (~288 deg/s for snappy handling)
  linearDrag: 0.45, // exponential damping coefficient (drift physics)
  maxSpeed: 450, // maximum velocity magnitude in pixels/s
};

/**
 * Creates an initial ship plain data object.
 */
export function createShip({
  x = 0,
  y = 0,
  vx = 0,
  vy = 0,
  angle = 0,
  thrust = false,
  reverse = false,
} = {}) {
  return {
    x,
    y,
    vx,
    vy,
    angle,
    thrust,
    reverse,
  };
}

/**
 * Pure integration function advancing the ship by timestep dt.
 *
 * @param {Object} ship Current ship state
 * @param {Object} input Input reader ({ isDown })
 * @param {number} dt Timestep in seconds
 * @param {Object} config Physics constants override
 * @returns {Object} New ship state
 */
export function integrate(ship, input, dt, config = SHIP_CONFIG) {
  let { x, y, vx, vy, angle } = ship;

  // 1. Rotation handling
  let turn = 0;
  if (input.isDown('ArrowLeft') || input.isDown('KeyA')) {
    turn -= 1;
  }
  if (input.isDown('ArrowRight') || input.isDown('KeyD')) {
    turn += 1;
  }

  angle += turn * config.turnSpeed * dt;

  // Normalize angle to [-PI, PI]
  angle = Math.atan2(Math.sin(angle), Math.cos(angle));

  // 2. Thrust & Reverse handling along heading (angle 0 is +X)
  const isThrusting = input.isDown('ArrowUp') || input.isDown('KeyW') || input.isDown('Space');
  const isReversing = input.isDown('ArrowDown') || input.isDown('KeyS');

  if (isThrusting) {
    const ax = Math.cos(angle) * config.thrustPower;
    const ay = Math.sin(angle) * config.thrustPower;

    vx += ax * dt;
    vy += ay * dt;
  } else if (isReversing) {
    // Reverse thrust / retro-rockets
    const ax = -Math.cos(angle) * config.reversePower;
    const ay = -Math.sin(angle) * config.reversePower;

    vx += ax * dt;
    vy += ay * dt;
  }

  // 3. Drag / Damping (framerate-independent exponential decay)
  const damping = Math.exp(-config.linearDrag * dt);
  vx *= damping;
  vy *= damping;

  // 4. Speed clamp
  const speed = Math.hypot(vx, vy);
  if (speed > config.maxSpeed) {
    const scale = config.maxSpeed / speed;
    vx *= scale;
    vy *= scale;
  }

  // 5. Position integration
  x += vx * dt;
  y += vy * dt;

  return {
    x,
    y,
    vx,
    vy,
    angle,
    thrust: isThrusting,
    reverse: isReversing,
  };
}
