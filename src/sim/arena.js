/**
 * Arena boundary definitions and wrap-around toroidal geometry.
 *
 * All functions are pure and free of DOM or canvas dependencies.
 */

export function createArena(width = 1200, height = 800) {
  return {
    width,
    height,
  };
}

/**
 * Pure wrap-around function ensuring the entity remains within arena bounds.
 *
 * @param {Object} entity Any entity with { x, y }
 * @param {Object} arena Arena dimensions { width, height }
 * @returns {Object} New entity state wrapped within bounds
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

  if (x === entity.x && y === entity.y) {
    return entity;
  }

  return {
    ...entity,
    x,
    y,
  };
}
