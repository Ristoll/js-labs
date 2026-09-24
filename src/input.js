/**
 * Input manager encapsulating keyboard state within function closures.
 *
 * Keeps key state strictly private without relying on classes or global variables.
 * Provides both continuous state (isDown) and edge-triggered detection (justPressed).
 */
export function createInput(target = window) {
  const down = new Set();
  const justPressedSet = new Set();

  const GAME_KEYS = new Set([
    'ArrowUp',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
    'KeyW',
    'KeyA',
    'KeyS',
    'KeyD',
    'Space',
  ]);

  function onKeyDown(e) {
    if (GAME_KEYS.has(e.code)) {
      e.preventDefault();
    }

    if (!down.has(e.code)) {
      justPressedSet.add(e.code);
    }
    down.add(e.code);
  }

  function onKeyUp(e) {
    if (GAME_KEYS.has(e.code)) {
      e.preventDefault();
    }
    down.delete(e.code);
  }

  function onBlur() {
    down.clear();
    justPressedSet.clear();
  }

  target.addEventListener('keydown', onKeyDown);
  target.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);

  return {
    isDown(code) {
      return down.has(code);
    },

    justPressed(code) {
      const pressed = justPressedSet.has(code);
      justPressedSet.delete(code);
      return pressed;
    },

    resetJustPressed() {
      justPressedSet.clear();
    },

    cleanup() {
      target.removeEventListener('keydown', onKeyDown);
      target.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      down.clear();
      justPressedSet.clear();
    },
  };
}
