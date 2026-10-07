/**
 * Arena boundary definitions and wrap-around toroidal geometry.
 *
 * All functions are pure simulation utilities free of DOM or canvas dependencies.
 */

export function createArena(width = 1200, height = 800) {
  return {
    width,
    height,
  };
}

/**
 * Wrap-around function ensuring the entity remains within arena bounds.
 * Preserves entity class instances and prototype delegations.
 *
 * @param {Object} entity Any entity with { x, y }
 * @param {Object} arena Arena dimensions { width, height }
 * @returns {Object} Wrapped entity
 */
export function wrapAround(entity, arena) {
  let { x, y } = entity;
  const { width, height } = arena;

  if (width > 0) {
    x = ((x % width) + width) % width;
  }

  if (height > 0) {
    y = ((y % height) + height) % height;
  }

  entity.x = x;
  entity.y = y;
  return entity;
}
