/**
 * Simulation event bus.
 *
 * A shared EventTarget that simulation code (Ship, collision resolver, etc.)
 * dispatches CustomEvents on, so that audio, HUD, and other subscriber modules
 * can react without the sim ever importing those modules.
 *
 * Events dispatched:
 *   'fired'    — a bullet was spawned  { detail: { shipId } }
 *   'hit'      — ship was struck by an asteroid  { detail: { shipId, hp } }
 *   'exploded' — an asteroid was destroyed by a bullet  { detail: { x, y } }
 */
export const simEvents = new EventTarget();

