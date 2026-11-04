/**
 * Lobby data layer for Dogfight.
 *
 * Implements:
 * - class Lobby extends EventTarget
 * - refresh() — fetches /api/rooms with AbortSignal.timeout; dispatches 'roomsChanged'
 * - join(roomId, playerName) — dispatches 'joined' with room config and player name
 * - start() — begins periodic refresh every REFRESH_INTERVAL_MS
 * - stop() — cancels the periodic refresh (aborts in-flight request); no orphaned requests
 *
 * Events dispatched:
 *   'roomsChanged' — { detail: { rooms: Room[] } }
 *   'error'        — { detail: { message: string } }
 *   'joined'       — { detail: { room: Room, playerName: string } }
 */

const ROOMS_URL = '/api/rooms.json';
const REFRESH_INTERVAL_MS = 5000;
const REQUEST_TIMEOUT_MS = 4000;

export class Lobby extends EventTarget {
  /** @type {Room[]|null} */
  #rooms = null;

  /** @type {AbortController|null} — controls the currently in-flight fetch */
  #fetchController = null;

  /** @type {number|null} — setInterval handle */
  #intervalId = null;

  /** @type {boolean} */
  #active = false;

  /**
   * Fetches the current room list from /api/rooms.json.
   * Uses AbortSignal.timeout for per-request timeout.
   * Cancellable via stop().
   * On success dispatches 'roomsChanged'; on error dispatches 'error'.
   */
  async refresh() {
    // Cancel any still-running fetch from a previous refresh cycle.
    if (this.#fetchController) {
      this.#fetchController.abort();
    }
    this.#fetchController = new AbortController();

    // Combine our manual abort (stop()) with a per-request timeout.
    const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);

    // AbortSignal.any is available in modern browsers; fall back to manual wiring.
    let combinedSignal;
    if (typeof AbortSignal.any === 'function') {
      combinedSignal = AbortSignal.any([this.#fetchController.signal, timeoutSignal]);
    } else {
      // Fallback: listen to timeout signal and forward the abort.
      combinedSignal = this.#fetchController.signal;
      timeoutSignal.addEventListener('abort', () => {
        this.#fetchController?.abort(timeoutSignal.reason);
      });
    }

    try {
      const res = await fetch(ROOMS_URL, { signal: combinedSignal });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} (${res.statusText}) — ${ROOMS_URL}`);
      }
      this.#rooms = await res.json();
      this.dispatchEvent(new CustomEvent('roomsChanged', { detail: { rooms: this.#rooms } }));
    } catch (err) {
      if (err.name === 'AbortError') {
        // Intentional cancellation (stop() was called or timeout fired) — silently ignore.
        return;
      }
      this.dispatchEvent(
        new CustomEvent('error', {
          detail: { message: err.message },
        })
      );
    } finally {
      this.#fetchController = null;
    }
  }

  /**
   * Starts periodic refresh of the room list.
   * Calls refresh() immediately, then every REFRESH_INTERVAL_MS.
   * Safe to call multiple times — only one interval is active at a time.
   */
  start() {
    if (this.#active) return;
    this.#active = true;
    this.refresh();
    this.#intervalId = setInterval(() => this.refresh(), REFRESH_INTERVAL_MS);
  }

  /**
   * Stops periodic refresh and aborts any in-flight request.
   * Must be called when the player leaves the lobby to prevent orphaned requests.
   */
  stop() {
    this.#active = false;
    if (this.#intervalId !== null) {
      clearInterval(this.#intervalId);
      this.#intervalId = null;
    }
    if (this.#fetchController) {
      this.#fetchController.abort();
      this.#fetchController = null;
    }
  }

  /**
   * Joins a room by roomId.
   * Stops the periodic refresh (abort-on-leave) and dispatches 'joined'.
   *
   * @param {string} roomId
   * @param {string} playerName
   */
  join(roomId, playerName) {
    const room = this.#rooms?.find((r) => r.id === roomId);
    if (!room) {
      this.dispatchEvent(
        new CustomEvent('error', {
          detail: { message: `Room "${roomId}" not found in current list.` },
        })
      );
      return;
    }
    // Abort-on-leave: stop refresh the moment the player commits to joining.
    this.stop();
    this.dispatchEvent(new CustomEvent('joined', { detail: { room, playerName } }));
  }

  /** @returns {Room[]|null} Last successfully fetched room list */
  get rooms() {
    return this.#rooms;
  }
}

