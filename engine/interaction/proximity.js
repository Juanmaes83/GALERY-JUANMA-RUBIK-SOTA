/**
 * Immersive Worlds — Proximity
 *
 * "Proximity is spatial, not UI-driven" (Constitution §15). A hotspot becomes
 * NEAR because the visitor is physically close to it, and only then may the
 * Scene Kit choose to show an affordance — the affordance never drives the
 * state.
 *
 * The visitor position is passed in rather than read from the camera: this
 * system observes where the visitor is, it does not own or write the camera.
 *
 * No Three.js. No DOM.
 */

import { EVENTS } from '../core/event-bus.js';
import { HOTSPOT_STATE } from '../schema/types.js';

export class ProximitySystem {
  /**
   * @param {{
   *   store: import('../world/world-store.js').WorldStore,
   *   state: import('../world/world-state.js').WorldState,
   *   bus: import('../core/event-bus.js').EventBus,
   *   sceneKit: import('../scenekit/scene-kit.js').SceneKit
   * }} deps
   */
  constructor({ store, state, bus, sceneKit }) {
    this.store = store;
    this.state = state;
    this.bus = bus;
    this.sceneKit = sceneKit;

    /** @type {{hotspot:object, position:number[], radius:number}[]} */
    this._active = [];
    this._nearestId = null;
    this._accumulator = 0;
    /** Proximity does not need 60 Hz. 12 Hz is imperceptible and much cheaper. */
    this.interval = 1 / 12;
  }

  /** Rebuild the candidate set when the active Space changes. */
  rebuild(spaceId) {
    const hadNearest = this._nearestId !== null;
    this._active = [];
    this._nearestId = null;
    // The previous room's nearest hotspot no longer exists here. Say so, or the
    // presentation keeps offering the old room's action until something else
    // happens to be near.
    if (hadNearest) this.bus.emit(EVENTS.WORLD_STATE_CHANGED, { reason: 'proximity', nearestHotspotId: null });
    for (const hotspot of this.store.hotspotsOf(spaceId)) {
      if (hotspot.enabled === false) continue;
      const anchorId = hotspot.anchorId || this.store.require(hotspot.entityId).anchorId;
      const pose = this.sceneKit.poseForAnchor(anchorId);
      if (!pose) continue;
      const radius =
        hotspot.triggerDistance ??
        (hotspot.interactionVolume?.shape === 'SPHERE'
          ? hotspot.interactionVolume.radius
          : Math.max(...(hotspot.interactionVolume?.size || [2, 2, 2])) / 2) ??
        2;
      this._active.push({ hotspot, position: pose.position, radius });
    }
  }

  /**
   * @param {number} dt
   * @param {[number,number,number]} visitorPosition
   * @param {[number,number,number]} [facing] where the visitor looks (any length)
   */
  update(dt, visitorPosition, facing = null) {
    this._accumulator += dt;
    if (this._accumulator < this.interval) return;
    this._accumulator = 0;

    let nearest = null;
    let nearestDistance = Infinity;

    for (const candidate of this._active) {
      // Distance on the floor plan. A door's anchor stands on the floor and a
      // painting's at eye height; counting that height as distance made every
      // door 1.6 m further away than it is, so a work beside a doorway always
      // won E over the door the visitor was facing (Breeze, Gallery B).
      const distance = Math.hypot(
        visitorPosition[0] - candidate.position[0],
        visitorPosition[2] - candidate.position[2]
      );
      const inside = distance <= candidate.radius;
      const current = this.state.hotspotState(candidate.hotspot.id);

      // VISITED and ACTIVE are sticky: proximity must not erase what the visitor did.
      if (current !== HOTSPOT_STATE.ACTIVE && current !== HOTSPOT_STATE.VISITED) {
        const next = inside ? HOTSPOT_STATE.NEAR : HOTSPOT_STATE.AVAILABLE;
        if (next !== current) {
          this.state.setHotspotState(candidate.hotspot.id, next);
          // Presentation observes semantic state; it never calculates distance.
          // This is the SceneKit seam declared by the base contract.
          this.sceneKit.setHotspotState(candidate.hotspot.id, next);
        }
      }
      // Which one E opens: the nearest *in front of* the visitor. In a corner
      // two works are in range; by distance alone, standing two metres from
      // one could name its neighbour on the side wall. A work straight ahead
      // counts at its distance, one at 90° at 1.5×, one behind at 2×. Range
      // (NEAR) is still plain distance.
      const cosine = facing ? facingCosine(visitorPosition, facing, candidate.position) : 1;
      const ranked = distance * (1.5 - 0.5 * cosine);
      // A work beside or behind the visitor is in range, but it is not the one
      // they mean: E must not open a painting they are not looking at. Doors
      // keep the plain rule, so a visitor can still back out through one.
      const eligible = !candidate.hotspot.entityId || cosine > 0.1;
      if (inside && eligible && ranked < nearestDistance) {
        nearest = candidate.hotspot;
        nearestDistance = ranked;
      }
    }

    const nearestId = nearest?.id || null;
    if (nearestId !== this._nearestId) {
      this._nearestId = nearestId;
      this.bus.emit(EVENTS.WORLD_STATE_CHANGED, { reason: 'proximity', nearestHotspotId: nearestId });
    }
  }

  /** The hotspot an "activate" input would trigger, or null. */
  get nearestHotspot() {
    return this._nearestId ? this.store.require(this._nearestId) : null;
  }

  /** QA evidence. */
  report() {
    return {
      candidates: this._active.length,
      nearest: this._nearestId,
      states: Object.fromEntries(this._active.map((c) => [c.hotspot.id, this.state.hotspotState(c.hotspot.id)]))
    };
  }
}

function facingCosine(from, facing, to) {
  const fx = facing[0]; const fz = facing[2];
  const tx = to[0] - from[0]; const tz = to[2] - from[2];
  const lf = Math.hypot(fx, fz); const lt = Math.hypot(tx, tz);
  if (lf < 1e-6 || lt < 1e-6) return 1;
  return (fx * tx + fz * tz) / (lf * lt);
}
