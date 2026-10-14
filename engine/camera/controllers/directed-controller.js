/**
 * Immersive Worlds — Directed camera controller
 *
 * The camera while a Guided Experience is running. The Experience Director
 * issues *shots* — a semantic subject plus a framing intent — and this
 * controller moves the camera between them.
 *
 * The Director never touches the camera itself (IW-ADR-007): it asks for a
 * shot, this controller executes it, and the authority still guarantees that
 * only this controller writes while DIRECTED is the owner.
 */

import { easeInOutCubic, vec3 } from '../framing.js';

/**
 * Departure → travel → arrival, as one reparametrisation of [0,1].
 *
 * `easeInOutCubic` over a whole move is why a 0.4 m reframe and an 11 m traverse
 * read as the same gesture at different speeds: it never stops accelerating or
 * decelerating, so there is no travel, only two halves of a swing. This holds a
 * constant-velocity middle whose share grows with `flat`, and eases only out of
 * rest and into rest.
 *
 * At `flat = 0` it *is* easeInOutCubic, so a micro reframe keeps the old feel.
 * At `flat → 1` it approaches a straight line with softened ends.
 *
 * k=0 returns exactly 0 and k=1 returns exactly 1 for every `flat`, which is what
 * makes the endpoint lock structural rather than a thing to remember.
 */
export function phased(k, flat = 0) {
  if (k <= 0) return 0;
  if (k >= 1) return 1;
  // Velocity is a smoothstep ramp up, a constant middle, and a ramp down. `r` is
  // the width of each ramp; `flat` shrinks it, growing the constant middle.
  const r = 0.5 * (1 - Math.min(Math.max(flat, 0), 0.98));
  // Area under the velocity profile must be exactly 1, or the move overshoots.
  const vMax = 1 / (1 - r);
  // Integral of smoothstep over [0,u].
  const S = (u) => u * u * u - (u * u * u * u) / 2;
  if (k < r) return vMax * r * S(k / r);
  if (k > 1 - r) return 1 - vMax * r * S((1 - k) / r);
  return vMax * (r * 0.5 + (k - r));
}


export class DirectedController {
  constructor(options = {}) {
    this.defaultTravelMs = options.defaultTravelMs ?? 2200;
    this._from = null;
    this._to = null;
    this._elapsed = 0;
    this._duration = 0;
    this._holdPose = null;
    this._reducedMotion = false;
    this._flat = 0;
    this._lead = 0;
    this._via = null;
    this._holdHeight = false;
    this.onShotComplete = null;
    this._completed = true;
  }

  setReducedMotion(reduced) {
    this._reducedMotion = reduced;
  }

  onGain(pose) {
    this._holdPose = { position: [...pose.position], target: [...pose.target], fov: pose.fov };
  }

  /**
   * @param {{position:number[], target:number[], fov?:number}} pose
   * @param {{travelMs?:number, flat?:number, lead?:number, via?:number[]|null, holdHeight?:boolean}} [options]
   */
  playShot(pose, options = {}) {
    const current = this._holdPose || { position: [...pose.position], target: [...pose.target], fov: pose.fov ?? 50 };
    this._from = { position: [...current.position], target: [...current.target], fov: current.fov };
    this._to = { position: [...pose.position], target: [...pose.target], fov: pose.fov ?? current.fov };

    // How the move is shaped. All three are pure reparametrisations or a curved
    // path through a midpoint: none of them can change where the move ends.
    this._flat = options.flat ?? 0;
    // Turn the head, then walk. The target runs the same curve on an earlier
    // clock, which is what stops the view sweeping the room at travel speed.
    this._lead = Math.min(Math.max(options.lead ?? 0, 0), 0.6);
    // A single control point is enough to round a path away from a corner. A
    // general solver would be a much larger answer to a much smaller question.
    this._via = options.via ? [...options.via] : null;
    // Long moves should not float: hold the departure height through travel and
    // resolve it on arrival.
    this._holdHeight = Boolean(options.holdHeight);

    const reduced = this._reducedMotion;
    if (reduced) {
      // Reduced motion is calmer and more direct, not a teleport. Spatial
      // continuity is the accommodation; removing it is the opposite of one.
      this._via = null;
      this._lead = 0;
      this._flat = 0;
      this._holdHeight = false;
    }
    const requested = options.travelMs ?? this.defaultTravelMs;
    this._duration = (reduced ? Math.min(requested * 0.34, 700) : requested) / 1000;
    this._elapsed = 0;
    this._completed = false;
  }

  /** Cut without travel — used for CUT portal behaviour inside a guided sequence. */
  snapTo(pose) {
    this._holdPose = { position: [...pose.position], target: [...pose.target], fov: pose.fov ?? this._holdPose?.fov ?? 50 };
    this._from = null;
    this._to = null;
    this._via = null;
    this._completed = true;
  }

  get isTravelling() {
    return this._to !== null && !this._completed;
  }

  update(dt, commit, pose) {
    if (!this._holdPose) this._holdPose = { position: [...pose.position], target: [...pose.target], fov: pose.fov };

    if (this._to) {
      this._elapsed += dt;
      const k = this._duration <= 0 ? 1 : Math.min(this._elapsed / this._duration, 1);
      const flat = this._flat || 0;
      const e = phased(k, flat);
      // The target's own clock, run ahead so the look arrives before the body.
      const lead = this._lead || 0;
      const eTarget = lead > 0 ? phased(Math.min(k / (1 - lead), 1), flat) : e;

      let position;
      if (this._via) {
        // Quadratic Bézier. At e=0 it is exactly `from`, at e=1 exactly `to`;
        // the control point can only bend the middle.
        const u = 1 - e;
        const a = u * u; const b = 2 * u * e; const c = e * e;
        position = [
          a * this._from.position[0] + b * this._via[0] + c * this._to.position[0],
          a * this._from.position[1] + b * this._via[1] + c * this._to.position[1],
          a * this._from.position[2] + b * this._via[2] + c * this._to.position[2]
        ];
      } else {
        position = vec3.lerp(this._from.position, this._to.position, e);
      }

      if (this._holdHeight) {
        // Height resolves late rather than drifting through the middle of the
        // room. Still exact at k=1.
        const hk = phased(Math.max((k - 0.55) / 0.45, 0), 0);
        position[1] = this._from.position[1] + (this._to.position[1] - this._from.position[1]) * hk;
      }

      this._holdPose = {
        position,
        target: vec3.lerp(this._from.target, this._to.target, eTarget),
        fov: this._from.fov + (this._to.fov - this._from.fov) * e
      };
      if (k >= 1 && !this._completed) {
        this._completed = true;
        this._to = null;
        this._from = null;
        this.onShotComplete?.();
      }
    }

    commit(this._holdPose);
  }

  onLose() {
    this._from = null;
    this._to = null;
  }
}
