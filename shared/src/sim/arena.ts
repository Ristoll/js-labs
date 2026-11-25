/**
 * Arena boundary definitions and toroidal wrap-around.
 */
import type { Arena } from '../types.ts';

export function createArena(width = 1200, height = 800): Arena {
  return {
    width,
    height,
    halfWidth: width / 2,
    halfHeight: height / 2,
  };
}

export interface WrapTarget {
  x: number;
  y: number;
}

export function wrapAround<T extends WrapTarget>(
  entity: T,
  arena: { readonly width: number; readonly height: number }
): T {
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


