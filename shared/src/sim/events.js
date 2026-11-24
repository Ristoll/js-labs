/**
 * Shared simulation event bus using standard EventTarget.
 */
class SafeEventTarget {
  constructor() {
    this._listeners = new Map();
  }

  addEventListener(type, callback) {
    if (!this._listeners.has(type)) {
      this._listeners.set(type, new Set());
    }
    this._listeners.get(type).add(callback);
  }

  removeEventListener(type, callback) {
    const set = this._listeners.get(type);
    if (set) {
      set.delete(callback);
    }
  }

  dispatchEvent(event) {
    const set = this._listeners.get(event.type);
    if (set) {
      for (const cb of set) {
        try {
          cb(event);
        } catch {}
      }
    }
    return true;
  }
}

export const simEvents =
  typeof globalThis.EventTarget === 'function'
    ? new globalThis.EventTarget()
    : new SafeEventTarget();
