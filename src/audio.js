/**
 * Audio module for Dogfight.
 *
 * Owns the Web Audio AudioContext and plays decoded sound buffers.
 * Subscribes to simulation events via the simEvents bus — the sim code
 * never imports this module (zero coupling in that direction).
 *
 * Rules:
 *   - AudioContext is created lazily on first user gesture (click / keydown).
 *   - Decoded AudioBuffers come from gameAssets.sounds (decoded during loading screen).
 *   - Plays shoot/hit/explosion sounds by creating a fresh AudioBufferSourceNode
 *     each time (allows overlapping playback).
 */

import { simEvents } from './sim/events.js';

let audioCtx = null;

/**
 * Returns the shared AudioContext, creating it on first call.
 * Must only be called after a user gesture to avoid browser autoplay policy.
 * @returns {AudioContext}
 */
function getAudioCtx() {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  return audioCtx;
}

/**
 * Plays a decoded AudioBuffer through the shared AudioContext.
 * Safe to call before unlock — the context will be in 'suspended' state
 * and resume() is called on each user gesture anyway.
 *
 * @param {AudioBuffer|undefined} buffer
 */
function playBuffer(buffer) {
  if (!buffer) return;
  const ctx = getAudioCtx();
  if (ctx.state === 'suspended') return; // not yet unlocked
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.start(0);
}

/**
 * Sets up the audio module:
 *   1. Registers a one-time user-gesture listener that resumes the AudioContext.
 *   2. Subscribes to simEvents for 'fired', 'hit', 'exploded' and plays the
 *      corresponding pre-decoded AudioBuffer from gameAssets.sounds.
 *
 * The sim never imports this function; main.js calls it after loadAll resolves.
 *
 * @param {{ sounds: Object<string, AudioBuffer> }} gameAssets
 */
export function setupAudio(gameAssets) {
  const sounds = gameAssets?.sounds ?? {};

  // Unlock AudioContext on the first user gesture.
  function unlock() {
    const ctx = getAudioCtx();
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

