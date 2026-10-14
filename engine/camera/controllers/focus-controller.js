/**
 * Immersive Worlds — Focus camera controller
 *
 * Temporary inspection authority (Glossary: "Focus"). It holds the pose the
 * Scene Kit measured for the subject and allows a small, bounded parallax so
 * inspection feels alive without becoming a second navigation mode.
 *
 * It never decides when focus ends. Leaving focus is an explicit authority
 * handoff requested by the interaction layer, with restore PRESERVE_OWN, which
 * is what makes the return deterministic.
 */

import { clamp, vec3 } from '../framing.js';

export class FocusController {
  constructor(options = {}) {
    this.parallax = options.parallax ?? 0.12;   // metres of lateral drift at full pointer deflection
    this.settle = options.settle ?? 6;          // approach rate, 1/s
    this.fov = options.fov ?? 42;               // slightly longer lens than Explore: less distortion on detail

    this.basePose = null;
    this._current = null;
    /** 0 = the framing the Scene Kit measured, 1 = pushed all the way in. */
    this.zoom = 0;
    this.maxZoom = options.maxZoom ?? 0.55;
    /** @type {{x:number,y:number}} normalised pointer, -1..1 */
    this.pointer = { x: 0, y: 0 };
    this._reducedMotion = false;
  }

  setReducedMotion(reduced) {
    this._reducedMotion = reduced;
  }

  /** Given by the interaction layer, measured by the Scene Kit. */
  setSubject({ position, target, fov }) {
    this.basePose = {
      position: [...position],
      target: [...target],
      fov: fov ?? this.fov
    };
    this._current = null;
    this.zoom = 0;
  }

  /**
   * Inspection zoom. It dollies along the line the Scene Kit measured rather
   * than narrowing the lens, so the visitor moves closer to the surface instead
   * of the work being magnified — the difference between examining a painting
   * and looking at a photograph of it.
   */
  setZoom(zoom) {
    this.zoom = clamp(zoom, 0, 1);
    return this.zoom;
  }

  onGain(pose) {
    this._current = this._current || { position: [...pose.position], target: [...pose.target], fov: pose.fov };
  }

  update(dt, commit, pose) {
    if (!this.basePose) {
      commit(pose);
      return;
    }
    if (!this._current) {
      this._current = { position: [...pose.position], target: [...pose.target], fov: pose.fov };
    }

    const drift = this._reducedMotion ? 0 : this.parallax;
    const right = lateral(this.basePose.position, this.basePose.target);

    // Dolly toward the subject by up to maxZoom of the measured distance.
    const t = this.zoom * this.maxZoom;
    const base = vec3.lerp(this.basePose.position, this.basePose.target, t);

    const wanted = {
      position: [
        base[0] + right[0] * this.pointer.x * drift,
        base[1] - this.pointer.y * drift * 0.6,
        base[2] + right[2] * this.pointer.x * drift
      ],
      target: [...this.basePose.target],
      fov: this.basePose.fov
    };

    const k = clamp(1 - Math.exp(-dt * this.settle), 0, 1);
    this._current = {
      position: vec3.lerp(this._current.position, wanted.position, k),
      target: vec3.lerp(this._current.target, wanted.target, k),
      fov: this._current.fov + (wanted.fov - this._current.fov) * k
    };

    commit(this._current);
  }

  onLose() {
    this._current = null;
    this.pointer = { x: 0, y: 0 };
  }
}

/** Unit vector pointing right of the view direction, on the horizontal plane. */
function lateral(position, target) {
  const dir = vec3.normalize([target[0] - position[0], 0, target[2] - position[2]]);
  return [dir[2], 0, -dir[0]];
}
