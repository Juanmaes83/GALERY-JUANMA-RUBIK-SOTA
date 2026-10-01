/**
 * Immersive Worlds — Camera Authority
 *
 * The single most important lesson carried out of Casebook V4
 * (IW-DEC-026 / IW-ADR-002):
 *
 *   AT ANY FRAME THERE IS EXACTLY ONE AUTHORITATIVE CAMERA CONTROLLER.
 *
 * This is enforced, not requested. Each frame the authority mints a one-shot
 * write token and hands it to exactly one controller. A controller writes the
 * camera by calling `commit(token, pose)`. A token is invalid:
 *
 *   - if it belongs to a previous frame        (a controller cached it)
 *   - if it has already been used this frame   (two writes in one frame)
 *   - if its owner is no longer authoritative  (a controller kept writing after handoff)
 *
 * Any of those throws. A subsystem cannot quietly fight the camera; it fails
 * immediately, in the frame where the mistake was made.
 *
 * Ownership handoff is explicit and can be smoothed: during a transition the
 * *authority itself* owns the camera and interpolates. Neither the outgoing nor
 * the incoming controller writes during that window — which is precisely the
 * moment where two-writer bugs are usually born.
 *
 * The pose is plain numbers. No Three.js here; the render host applies the pose
 * to whatever camera object it owns. That keeps this file unit-testable.
 */

import { CAMERA_AUTHORITY } from '../schema/types.js';
import { EVENTS } from '../core/event-bus.js';
import { easeInOutCubic, vec3 } from './framing.js';

/**
 * @typedef {Object} CameraPose
 * @property {[number,number,number]} position
 * @property {[number,number,number]} target
 * @property {number} fov  degrees
 */

/**
 * @typedef {Object} CameraController
 * @property {(pose:CameraPose, info:{reason:string, restore:string})=>void} [onGain]
 * @property {(info:{to:string})=>void} [onLose]
 * @property {(dt:number, commit:(pose:CameraPose)=>void, pose:CameraPose)=>void} update
 */

export class CameraAuthority {
  /**
   * @param {{bus:import('../core/event-bus.js').EventBus, pose?:CameraPose, reducedMotion?:boolean}} deps
   */
  constructor({ bus, pose, reducedMotion = false }) {
    this.bus = bus;
    this.reducedMotion = reducedMotion;

    /** @type {CameraPose} the one authoritative pose */
    this.pose = pose || { position: [0, 1.62, 4], target: [0, 1.5, 0], fov: 50 };

    /** @type {Map<string, CameraController>} */
    this._controllers = new Map();
    this._owner = null;
    this._frame = 0;
    this._token = null;
    this._tokenUsed = false;

    /** @type {{from:string,to:string,elapsed:number,duration:number,startPose:CameraPose,endPose:CameraPose,restore:string,reason:string}|null} */
    this._transition = null;

    /** Every attempted violation, kept for QA evidence rather than swallowed. */
    this.violations = [];
    /** Ownership history — the audit trail a reviewer can read. */
    this.history = [];
  }

  /** @param {keyof CAMERA_AUTHORITY} name */
  register(name, controller) {
    if (!CAMERA_AUTHORITY[name]) throw new Error(`[IW] unknown camera authority "${name}"`);
    if (typeof controller?.update !== 'function') {
      throw new Error(`[IW] camera controller "${name}" has no update()`);
    }
    this._controllers.set(name, controller);
    if (!this._owner) this._owner = name;
    return this;
  }

  get owner() {
    return this._transition ? CAMERA_AUTHORITY.TRANSITION : this._owner;
  }

  get isTransitioning() {
    return this._transition !== null;
  }

  /**
   * Hand the camera to another controller.
   *
   * @param {keyof CAMERA_AUTHORITY} name
   * @param {{
   *   reason?: string,
   *   durationMs?: number,
   *   endPose?: CameraPose,
   *   restore?: 'ADOPT_INCOMING'|'PRESERVE_OWN'
   * }} [options]
   *
   * `restore` is the difference between the two legitimate return behaviours in
   * Constitution §14:
   *   PRESERVE_OWN   — leaving Focus: the visitor is put back exactly where they
   *                    stood (rule 3, deterministic return).
   *   ADOPT_INCOMING — leaving a directed sequence: the experience deliberately
   *                    chose a new pose to leave the visitor in (rule 4).
   */
  request(name, options = {}) {
    if (!this._controllers.has(name)) throw new Error(`[IW] no camera controller registered for "${name}"`);
    const { reason = 'unspecified', endPose = null, restore = 'ADOPT_INCOMING' } = options;
    if (name === this._owner && !this._transition) return false;

    const durationMs = this.reducedMotion ? 0 : (options.durationMs ?? 0);
    const from = this._owner;

    this._controllers.get(from)?.onLose?.({ to: name });
    this.history.push({ from, to: name, reason, durationMs, frame: this._frame });
    this.bus?.emit(EVENTS.CAMERA_AUTHORITY_CHANGED, { from, to: name, reason });

    if (durationMs > 0 && endPose) {
      this._transition = {
        from,
        to: name,
        elapsed: 0,
        duration: durationMs / 1000,
        startPose: clonePose(this.pose),
        endPose: clonePose(endPose),
        restore,
        reason
      };
      // Ownership is already conceptually the target's; the authority just drives
      // the camera until the transition finishes.
      this._owner = name;
      return true;
    }

    this._owner = name;
    if (endPose) this.pose = clonePose(endPose);
    this._controllers.get(name)?.onGain?.(clonePose(this.pose), { reason, restore });
    return true;
  }

  /**
   * Advance one frame. Exactly one writer is possible by construction.
   * @param {number} dt seconds
   */
  update(dt) {
    this._frame += 1;
    this._tokenUsed = false;

    if (this._transition) {
      const t = this._transition;
      t.elapsed += dt;
      const k = t.duration <= 0 ? 1 : Math.min(t.elapsed / t.duration, 1);
      const e = easeInOutCubic(k);
      this.pose = {
        position: vec3.lerp(t.startPose.position, t.endPose.position, e),
        target: vec3.lerp(t.startPose.target, t.endPose.target, e),
        fov: t.startPose.fov + (t.endPose.fov - t.startPose.fov) * e
      };
      if (k >= 1) {
        const { to, reason, restore } = t;
        this._transition = null;
        this._controllers.get(to)?.onGain?.(clonePose(this.pose), { reason, restore });
      }
      return this.pose;
    }

    const controller = this._controllers.get(this._owner);
    if (!controller) return this.pose;

    const token = { frame: this._frame, owner: this._owner };
    this._token = token;
    const commit = (pose) => this._commit(token, pose);
    controller.update(dt, commit, clonePose(this.pose));
    this._token = null;
    return this.pose;
  }

  _commit(token, pose) {
    if (!token || token !== this._token) {
      return this._violation('stale or foreign write token', token);
    }
    if (token.frame !== this._frame) {
      return this._violation(`token from frame ${token.frame} used on frame ${this._frame}`, token);
    }
    if (token.owner !== this._owner) {
      return this._violation(`"${token.owner}" wrote the camera while "${this._owner}" was authoritative`, token);
    }
    if (this._tokenUsed) {
      return this._violation(`two camera writes in frame ${this._frame}`, token);
    }
    this._tokenUsed = true;
    this.pose = {
      position: [...pose.position],
      target: [...pose.target],
      fov: pose.fov ?? this.pose.fov
    };
    return this.pose;
  }

  _violation(message, token) {
    const record = { message, frame: this._frame, owner: this._owner, token: token?.owner ?? null };
    this.violations.push(record);
    throw new Error(`[IW] camera authority violation — ${message}`);
  }

  /** QA evidence. `violations: 0` is the assertion that the invariant held. */
  report() {
    return {
      owner: this.owner,
      frame: this._frame,
      transitioning: this.isTransitioning,
      violations: this.violations.length,
      violationDetail: this.violations.slice(-5),
      history: this.history.slice(-12),
      pose: clonePose(this.pose)
    };
  }
}

export function clonePose(pose) {
  return { position: [...pose.position], target: [...pose.target], fov: pose.fov };
}
