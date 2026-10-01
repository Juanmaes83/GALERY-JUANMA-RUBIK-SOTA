/**
 * Immersive Worlds — Crossing camera controller
 *
 * The camera while the visitor moves from one room to another. This is the
 * mechanism behind `CAMERA_AUTHORITY.TRANSITION`: for the length of a crossing
 * it is the single authoritative writer, so neither the outgoing Directed shot
 * nor the incoming Explore controller touches the camera while a doorway is
 * being passed. One writer, one continuous move, one room handoff.
 *
 * What it is not: a portal renderer. The Museum's rooms are genuinely adjacent
 * in one scene and the destination is already visible through the opening, so
 * there is nothing to project — the crossing is a *move*, and the only thing
 * this file knows how to do is move a camera well.
 *
 * Three legs on one clock:
 *
 *   APPROACH   square up to the aperture and aim through it
 *   THRESHOLD  pass exactly through the gate point; the room hands off here
 *   ARRIVAL    settle onto the pose the beat was authored to end on
 *
 * The endpoint is not negotiable. Every shaping term below — the bend, the
 * target lead, the aperture pin, the fov breath — is zero at k=1 by
 * construction, so the crossing can only choose *how* the camera arrives.
 *
 * No graphics library here. The pose is plain numbers.
 */

import { vec3 } from '../framing.js';
import { phased } from './directed-controller.js';

const AXIS_EPSILON = 1e-4;

/**
 * Smooth bump: 1 at the centre, 0 at both edges, with zero slope at the edges.
 * Used for every term that must vanish before the move ends.
 * @param {number} u signed distance from the centre, in units of the half-window
 */
function bump(u) {
  const a = Math.min(Math.abs(u), 1);
  const q = 1 - a * a;
  return q * q;
}

export class CrossingController {
  constructor(options = {}) {
    this.defaultTravelMs = options.defaultTravelMs ?? 2600;
    this._reducedMotion = false;
    this._holdPose = null;
    this._plan = null;
    this._elapsed = 0;
    this._duration = 0;
    this._completed = true;
    this._crossed = false;
    /** Filled while a crossing runs; read by QA rather than recomputed. */
    this.lastPlan = null;
  }

  setReducedMotion(reduced) {
    this._reducedMotion = reduced;
  }

  onGain(pose) {
    this._holdPose = { position: [...pose.position], target: [...pose.target], fov: pose.fov };
  }

  get isCrossing() {
    return this._plan !== null && !this._completed;
  }

  /**
   * Fly from wherever the camera stands, through an aperture, to an approved pose.
   *
   * @param {{position:number[], target:number[], fov?:number}} endPose
   *        The beat's frozen destination. Reached exactly.
   * @param {{
   *   gate: number[],            point inside the opening the path must pass through
   *   axis: number[],            unit vector pointing into the destination room
   *   travelMs?: number,
   *   flat?: number,             velocity-profile flatness, as in DirectedController
   *   lead?: number,             how far ahead the look runs
   *   holdHeight?: boolean,
   *   apertureFov?: number,      degrees of fov breath at the gate; 0 disables
   *   pin?: number,              0..1 how hard the look is held through the opening
   *   onProgress?: (report:{k:number, e:number, phase:string, atmosphere:number}) => void,
   *   onCrossPlane?: () => void, fired once, on the frame the threshold is passed
   *   onComplete?: () => void
   * }} options
   */
  playCrossing(endPose, options = {}) {
    const current = this._holdPose || {
      position: [...endPose.position], target: [...endPose.target], fov: endPose.fov ?? 50
    };
    const from = { position: [...current.position], target: [...current.target], fov: current.fov };
    const to = {
      position: [...endPose.position],
      target: [...endPose.target],
      fov: endPose.fov ?? current.fov
    };

    const axis = vec3.normalize(options.axis || [0, 0, 1]);
    const gate = options.gate ? [...options.gate] : null;

    // Where along the move the threshold sits. Splitting by *along-axis* distance
    // rather than at a fixed midpoint is what keeps a long approach from being
    // rushed and a short one from crawling.
    let s = 0.5;
    if (gate) {
      const dIn = (gate[0] - from.position[0]) * axis[0] + (gate[2] - from.position[2]) * axis[2];
      const dOut = (to.position[0] - gate[0]) * axis[0] + (to.position[2] - gate[2]) * axis[2];
      const total = dIn + dOut;
      if (total > AXIS_EPSILON) s = dIn / total;
      // A threshold at the very start or end of a move is not a crossing shape;
      // clamping keeps the aperture terms from degenerating into a step.
      s = Math.min(Math.max(s, 0.2), 0.8);
    }

    // A quadratic Bézier whose control point is *solved* so the curve passes
    // through the gate exactly at e = s. The alternative — bending toward the
    // gate and hoping — is how a camera ends up brushing a door jamb.
    let via = null;
    if (gate) {
      const w = 2 * (1 - s) * s;
      const a = (1 - s) * (1 - s);
      const c = s * s;
      via = [
        (gate[0] - a * from.position[0] - c * to.position[0]) / w,
        (gate[1] - a * from.position[1] - c * to.position[1]) / w,
        (gate[2] - a * from.position[2] - c * to.position[2]) / w
      ];
      // A solved control point can sit far outside the room when the departure
      // pose is almost on the threshold already. A straight line that misses the
      // gate slightly is the better failure than a curve through a wall.
      const reach = Math.hypot(via[0] - gate[0], via[2] - gate[2]);
      const span = Math.hypot(
        to.position[0] - from.position[0],
        to.position[2] - from.position[2]
      );
      if (reach > Math.max(span, 1) * 1.6) via = null;
    }

    const reduced = this._reducedMotion;
    // Reduced motion is a shorter, plainer crossing — not a teleport. The path
    // still goes through the doorway, because "which room am I in and how did I
    // get here" is exactly what the accommodation exists to protect.
    const plan = {
      from,
      to,
      via,
      gate,
      axis,
      s,
      flat: reduced ? 0 : (options.flat ?? 0.6),
      lead: reduced ? 0 : Math.min(Math.max(options.lead ?? 0.42, 0), 0.6),
      holdHeight: reduced ? false : Boolean(options.holdHeight ?? true),
      apertureFov: reduced ? 0 : (options.apertureFov ?? 0),
      pin: Math.min(Math.max(options.pin ?? 0.55, 0), 1),
      // How much of the post-gate travel is spent looking back at the threshold
      // just crossed. 0 restores the old behaviour exactly.
      recoil: reduced ? 0 : Math.min(Math.max(options.recoil ?? 0, 0), 1),
      onProgress: options.onProgress || null,
      onCrossPlane: options.onCrossPlane || null,
      onComplete: options.onComplete || null
    };

    // Every aperture term lives inside this window and vanishes at its edges, so
    // none of them can survive to k=1 and move the endpoint.
    plan.window = Math.min(0.22, s * 0.85, (1 - s) * 0.85);
    // Atmosphere changes room as the doorway is passed, not gradually across the
    // whole move: you are in one room, then in the other.
    plan.atmoHalf = Math.min(0.3, s, 1 - s);

    const requested = options.travelMs ?? this.defaultTravelMs;
    this._duration = (reduced ? Math.min(requested * 0.45, 1100) : requested) / 1000;
    this._plan = plan;
    this._elapsed = 0;
    this._completed = false;
    this._crossed = false;
    this.lastPlan = {
      s, via, gate, window: plan.window, durationMs: Math.round(this._duration * 1000),
      reduced, recoil: plan.recoil
    };
    return this.lastPlan;
  }

  update(dt, commit, pose) {
    if (!this._holdPose) {
      this._holdPose = { position: [...pose.position], target: [...pose.target], fov: pose.fov };
    }

    const plan = this._plan;
    if (plan) {
      this._elapsed += dt;
      const k = this._duration <= 0 ? 1 : Math.min(this._elapsed / this._duration, 1);
      const e = phased(k, plan.flat);
      const eTarget = plan.lead > 0
        ? phased(Math.min(k / (1 - plan.lead), 1), plan.flat)
        : e;

      let position;
      if (plan.via) {
        const u = 1 - e;
        const a = u * u; const b = 2 * u * e; const c = e * e;
        position = [
          a * plan.from.position[0] + b * plan.via[0] + c * plan.to.position[0],
          a * plan.from.position[1] + b * plan.via[1] + c * plan.to.position[1],
          a * plan.from.position[2] + b * plan.via[2] + c * plan.to.position[2]
        ];
      } else {
        position = vec3.lerp(plan.from.position, plan.to.position, e);
      }

      if (plan.holdHeight) {
        const hk = phased(Math.max((k - 0.55) / 0.45, 0), 0);
        position[1] = plan.from.position[1] + (plan.to.position[1] - plan.from.position[1]) * hk;
      }

      let target = vec3.lerp(plan.from.target, plan.to.target, eTarget);
      let fov = plan.from.fov + (plan.to.fov - plan.from.fov) * e;

      // Through the aperture, look through the aperture. Without this the view
      // lerps between two room-interior targets and sweeps the door jamb at
      // exactly the moment the visitor most needs to read where they are going.
      // THE REVERSE-FACING EXIT AND RECOIL.
      //
      // Past the gate the camera is already travelling away from the threshold
      // and into the destination — that part was always here. What was missing
      // is that it never turned round to look at what it had just come through,
      // so World B simply appeared ahead and the crossing ended at the first
      // valid frame in it.
      //
      // Looking back for the first part of the exit produces the whole of the
      // source's signature at once: the reverse side of the portal is the first
      // thing seen in the new world, it is large because the camera is still
      // close to it, and it shrinks while the destination reveals around it
      // because the camera is receding. Recoil, reveal and spatial continuity
      // are one move, not three effects.
      //
      // Crucially this touches only where the camera *looks*. The position path
      // is untouched and the look blends back to the authored target before the
      // move ends, so the approved destination pose is preserved by
      // construction rather than by care.
      if (plan.gate && plan.recoil > 0 && e > plan.s) {
        const after = (e - plan.s) / Math.max(1 - plan.s, 1e-4);
        // Hold the look on the threshold, then release it. `recoil` is how much
        // of the exit is spent facing backwards; the rest turns into the room.
        const hold = Math.min(Math.max(plan.recoil, 0), 0.95);
        const release = after <= hold ? 0 : (after - hold) / Math.max(1 - hold, 1e-4);
        // Smoothstep out, so the head turn reads as a decision rather than a snap.
        const back = 1 - (release * release * (3 - 2 * release));
        if (back > 0) {
          const reverse = [plan.gate[0], plan.gate[1], plan.gate[2]];
          target = vec3.lerp(target, reverse, back);
        }
      }

      if (plan.gate && plan.window > 0) {
        const weight = plan.pin * bump((e - plan.s) / plan.window);
        if (weight > 0) {
          const through = [
            plan.gate[0] + plan.axis[0] * 3.5,
            plan.gate[1],
            plan.gate[2] + plan.axis[2] * 3.5
          ];
          target = vec3.lerp(target, through, weight);
        }
        if (plan.apertureFov !== 0) {
          fov += plan.apertureFov * bump((e - plan.s) / plan.window);
        }
      }

      this._holdPose = { position, target, fov };

      // Callbacks are collected, not called. Both of them can reach code that
      // changes who owns the camera — the handoff activates a Space, completion
      // gives the camera back — and this frame has not written its pose yet. Ask
      // for the camera to be handed over mid-update and the very next line is a
      // controller committing under an authority it no longer holds, which the
      // authority correctly refuses.
      const fire = [];

      if (!this._crossed && e >= plan.s) {
        this._crossed = true;
        if (plan.onCrossPlane) fire.push(plan.onCrossPlane);
      }

      if (plan.onProgress) {
        const atmosphere = plan.atmoHalf > 0
          ? Math.min(Math.max((e - (plan.s - plan.atmoHalf)) / (2 * plan.atmoHalf), 0), 1)
          : (e >= plan.s ? 1 : 0);
        plan.onProgress({
          k,
          e,
          atmosphere: atmosphere * atmosphere * (3 - 2 * atmosphere),
          phase: this._crossed ? (k >= 1 ? 'ARRIVAL' : 'HANDOFF') : 'APPROACH'
        });
      }

      if (k >= 1 && !this._completed) {
        this._completed = true;
        this._plan = null;
        // Land on the authored pose itself, not on the last sample of a curve.
        // Floating point should never be the reason a frozen beat moved.
        this._holdPose = {
          position: [...plan.to.position],
          target: [...plan.to.target],
          fov: plan.to.fov
        };
        if (!this._crossed) {
          this._crossed = true;
          if (plan.onCrossPlane) fire.push(plan.onCrossPlane);
        }
        if (plan.onComplete) fire.push(plan.onComplete);
      }

      commit(this._holdPose);
      for (const callback of fire) callback();
      return;
    }

    commit(this._holdPose);
  }

  onLose() {
    this._plan = null;
    this._completed = true;
  }
}
