/**
 * Arena boundary definitions and toroidal wrap-around.
 */
export function createArena(width = 1200, height = 800) {
  return {
    width,
    height,
  };
}

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
