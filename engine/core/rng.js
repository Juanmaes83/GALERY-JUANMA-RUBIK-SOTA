/**
 * Immersive Worlds — Deterministic RNG
 *
 * Every visual or spatial decision that would otherwise be Math.random() goes
 * through here, so a named QA state renders identically on every run.
 * (IW-0 Constitution §23 — deterministic QA contract.)
 *
 * mulberry32: small, fast, adequate for content variation. Not cryptographic.
 */

export class DeterministicRNG {
  /** @param {number|string} seed */
  constructor(seed = 1) {
    this.seed = seed;
    this._state = hashSeed(seed);
  }

  /** @returns {number} float in [0,1) */
  next() {
    this._state |= 0;
    this._state = (this._state + 0x6d2b79f5) | 0;
    let t = Math.imul(this._state ^ (this._state >>> 15), 1 | this._state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** @returns {number} float in [min,max) */
  range(min, max) {
    return min + this.next() * (max - min);
  }

  /** @returns {number} integer in [min,max] */
  int(min, max) {
    return Math.floor(this.range(min, max + 1));
  }

  pick(array) {
    return array[this.int(0, array.length - 1)];
  }

  /** Independent stream derived from this seed — keeps subsystems from perturbing each other. */
  fork(label) {
    return new DeterministicRNG(`${this.seed}:${label}`);
  }

  reset() {
    this._state = hashSeed(this.seed);
  }
}

function hashSeed(seed) {
  if (typeof seed === 'number') return seed >>> 0;
  let h = 2166136261;
  const s = String(seed);
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
