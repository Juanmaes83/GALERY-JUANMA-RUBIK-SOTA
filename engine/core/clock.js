/**
 * Immersive Worlds — Clock
 *
 * One time source for the whole runtime. Subsystems never read performance.now()
 * themselves, so a deterministic QA run can drive time by hand
 * (IW-0 Constitution §17 — "global experience time source").
 */

export class Clock {
  /**
   * `maxDelta` exists to absorb a *stall* — a tab that was hidden, a process
   * that was suspended — not a slow frame.
   *
   * It was 0.1 s, which is not a stall: it is a perfectly ordinary frame on
   * software rendering or a weak phone. Every frame longer than that had its
   * excess silently discarded, so narrative time ran at a fraction of real time
   * and the whole guided visit played in slow motion: authored durations
   * stretched two to three times, the guide was still walking during shots that
   * needed her standing still, and a work was narrated before its composition
   * had arrived. None of it showed up in QA, because QA drives time by hand.
   *
   * Half a second is the honest line. A frame slower than two per second is not
   * a frame any more; anything above that is real elapsed time and the
   * experience is entitled to it.
   */
  constructor({ maxDelta = 0.5 } = {}) {
    this.elapsed = 0;
    this.delta = 0;
    this.frame = 0;
    this.maxDelta = maxDelta;
    this._last = null;
    this._manual = false;
  }

  /** Drive from wall clock. @param {number} now milliseconds */
  tick(now) {
    if (this._manual) return this.delta;
    if (this._last === null) this._last = now;
    const raw = (now - this._last) / 1000;
    this._last = now;
    this.delta = Math.min(Math.max(raw, 0), this.maxDelta);
    this.elapsed += this.delta;
    this.frame += 1;
    return this.delta;
  }

  /**
   * Come back from a stall without charging the experience for it.
   *
   * A hidden tab stops firing frames entirely, and the gap on return is not
   * time the visitor spent in the room. Dropping the baseline makes the resume
   * cost nothing, which is what the clamp was really for — so the clamp itself
   * no longer has to double as a frame-rate limiter.
   */
  resume() {
    this._last = null;
  }

  /** Deterministic mode: QA advances time in fixed steps. */
  useManualTime(enabled = true) {
    this._manual = enabled;
  }

  /** @param {number} dt seconds */
  advance(dt) {
    this.delta = dt;
    this.elapsed += dt;
    this.frame += 1;
    return dt;
  }

  reset() {
    this.elapsed = 0;
    this.delta = 0;
    this.frame = 0;
    this._last = null;
  }
}
