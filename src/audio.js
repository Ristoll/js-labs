/**
 * Audio module for Dogfight.
 *
 * Owns the single shared Web Audio AudioContext used for both:
 *   - Decoding audio buffers during the loading screen (via loadAll in main.js)
 *   - Playback during the game (via simEvents listeners)
 *
 * The AudioContext is created lazily on the first call to getSharedAudioContext()
 * so that it is not created before a user gesture (browser autoplay policy).
 *
 * Subscribes to simulation events via the simEvents bus — the sim code
 * never imports this module (zero coupling in that direction).
 */

import { simEvents } from './sim/events.js';

/** @type {AudioContext|null} */
let audioCtx = null;

/**
 * Returns the single shared AudioContext, creating it on the first call.
 * Safe to call repeatedly — always returns the same instance.
 *
 * Used by:
 *  - main.js, which passes it to loadAll() so audio decoding and playback
 *    share one context (avoids the browser limit of ~6 concurrent AudioContexts).
 *  - playBuffer(), which needs the context to create source nodes.
 *
 * @returns {AudioContext}
 */
export function getSharedAudioContext() {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  return audioCtx;
}

/**
 * Plays a decoded AudioBuffer through the shared AudioContext.
 * Skipped when the context is still suspended (not yet unlocked by a user gesture).
 *
 * @param {AudioBuffer|undefined} buffer
 */
function playBuffer(buffer) {
  if (!buffer) return;
  const ctx = getSharedAudioContext();
  if (ctx.state === 'suspended') return;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.start(0);
}

/**
 * Sets up the audio module:
 *   1. Registers a one-time user-gesture listener that resumes the shared AudioContext.
 *   2. Subscribes to simEvents for 'fired', 'hit', 'exploded' and plays the
 *      corresponding pre-decoded AudioBuffer from gameAssets.sounds.
 *
 * Call this after loadAll() resolves so that gameAssets.sounds is populated.
 * The sim never imports this function; main.js calls it.
 *
 * @param {{ sounds: Object<string, AudioBuffer> }} gameAssets
 */
export function setupAudio(gameAssets) {
  const sounds = gameAssets?.sounds ?? {};

  // Unlock (resume) the shared AudioContext on the first user gesture.
  function unlock() {
    const ctx = getSharedAudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
  }
  window.addEventListener('click', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });

  // Subscribe to simulation events — no import of audio.js from sim code.
  simEvents.addEventListener('fired', () => {
    playBuffer(sounds.shoot);
  });

  simEvents.addEventListener('hit', () => {
    playBuffer(sounds.hit);
  });

  simEvents.addEventListener('exploded', () => {
    playBuffer(sounds.explosion);
  });
}

