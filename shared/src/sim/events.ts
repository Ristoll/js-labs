/**
 * Shared simulation event bus using standard EventTarget.
 */
class SafeEventTarget {
  private readonly _listeners = new Map<string, Set<(event: Event) => void>>();

  addEventListener(type: string, callback: (event: Event) => void): void {
    let set = this._listeners.get(type);
    if (!set) {
      set = new Set();
      this._listeners.set(type, set);
    }
    set.add(callback);
  }

  removeEventListener(type: string, callback: (event: Event) => void): void {
    const set = this._listeners.get(type);
    if (set) {
      set.delete(callback);
    }
  }

  dispatchEvent(event: Event): boolean {
    const set = this._listeners.get(event.type);
    if (set) {
      for (const cb of set) {
        try {
          cb(event);
        } catch {
          // swallow listener errors so one bad listener cannot break the bus
        }
      }
    }
    return true;
  }
}

export const simEvents =
  typeof globalThis.EventTarget === 'function'
    ? new globalThis.EventTarget()
    : new SafeEventTarget();

