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
    this._active = [];
    this._nearestId = null;
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
   */
  update(dt, visitorPosition) {
    this._accumulator += dt;
    if (this._accumulator < this.interval) return;
    this._accumulator = 0;

    let nearest = null;
    let nearestDistance = Infinity;

    for (const candidate of this._active) {
      const distance = Math.hypot(
        visitorPosition[0] - candidate.position[0],
        visitorPosition[1] - candidate.position[1],
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
      if (inside && distance < nearestDistance) {
        nearest = candidate.hotspot;
        nearestDistance = distance;
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
