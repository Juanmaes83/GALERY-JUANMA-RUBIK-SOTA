/**
 * Immersive Worlds — World State
 *
 * The authoritative *semantic* runtime state of the world.
 *
 *   WORLD STATE ≠ CAMERA STATE   (IW-ADR-002)
 *
 * There is no camera position, target, fov or pose in this object, and
 * `assertNoCameraState()` proves it. Where the visitor *is* semantically —
 * which Space, which arrival Anchor — lives here; where the camera happens to
 * be pointing this frame belongs to the camera authority.
 *
 * Explore Mode and Guided Experience both read and write *this* object
 * (IW-ADR-003). There is no second "guided world".
 *
 * No Three.js. No DOM.
 */

import { EVENTS } from '../core/event-bus.js';
import { HOTSPOT_STATE } from '../schema/types.js';

/** Keys that would mean World State had started owning the camera. */
const CAMERA_LEAK_KEYS = [
  'camera', 'cameraPose', 'position', 'rotation', 'quaternion',
  'target', 'lookAt', 'fov', 'yaw', 'pitch', 'pose'
];

export const EXPERIENCE_MODE = Object.freeze({
  EXPLORE: 'EXPLORE',
  GUIDED: 'GUIDED',
  AUTHOR: 'AUTHOR'
});

export class WorldState {
  /**
   * @param {{store:import('./world-store.js').WorldStore, bus:import('../core/event-bus.js').EventBus}} deps
   */
  constructor({ store, bus }) {
    this.store = store;
    this.bus = bus;

    /** Which Space the visitor is semantically in. */
    this.activeSpaceId = store.startSpaceId;
    /** Which Anchor the visitor last arrived at — semantic, not a pose. */
    this.arrivalAnchorId = store.require(store.startSpaceId).defaultSpawnAnchorId;
    /** Entity currently under inspection, or null. */
    this.focusedEntityId = null;
    /** Which experience mode is driving. Explore and Guided share this state object. */
    this.mode = EXPERIENCE_MODE.EXPLORE;
    /** Route being played, or null. */
    this.activeRouteId = null;
    /** Story step being played, or null. */
    this.activeStepId = null;

    /** @type {Map<string, keyof HOTSPOT_STATE>} hotspotId -> semantic state */
    this.hotspotStates = new Map();
    /** @type {Set<string>} entities the visitor has focused at least once, in either mode */
    this.visitedEntityIds = new Set();
    /** @type {Set<string>} spaces entered at least once */
    this.visitedSpaceIds = new Set([store.startSpaceId]);
    /** @type {Set<string>} portals traversed at least once */
    this.traversedPortalIds = new Set();

    for (const hotspot of store.hotspots) {
      this.hotspotStates.set(hotspot.id, hotspot.enabled === false ? HOTSPOT_STATE.HIDDEN : HOTSPOT_STATE.AVAILABLE);
    }

    this.revision = 0;
  }

  _changed(reason, detail = {}) {
    this.revision += 1;
    this.bus.emit(EVENTS.WORLD_STATE_CHANGED, { reason, revision: this.revision, ...detail });
  }

  setMode(mode) {
    if (this.mode === mode) return;
    const previous = this.mode;
    this.mode = mode;
    this._changed('mode', { previous, mode });
  }

  /** Semantic arrival in a Space. Camera relocation is a separate, explicit act. */
  enterSpace(spaceId, arrivalAnchorId) {
    const previousSpaceId = this.activeSpaceId;
    this.activeSpaceId = spaceId;
    this.arrivalAnchorId = arrivalAnchorId || this.store.require(spaceId).defaultSpawnAnchorId;
    this.visitedSpaceIds.add(spaceId);
    if (previousSpaceId && previousSpaceId !== spaceId) {
      this.bus.emit(EVENTS.SPACE_LEFT, { spaceId: previousSpaceId });
      // Focus belongs to the room you are standing in.
      //
      // Without this, a work stayed focused across a doorway and the label card
      // went on describing it from the next gallery: arriving in Galería B, the
      // visitor was told they were looking at a sculpture that is in Galería A.
      // It showed up first on a Back — the return moved camera, stop and counter
      // correctly while the card lagged — but it was never a Back defect. The
      // forward crossing did it too; nobody had looked.
      //
      // Fixing it here rather than in the Director is deliberate: a crossing is
      // a crossing whether the route drives it, a hotspot does, or the visitor
      // walks through in Explore, and the invariant is the same in all three.
      // A fix in the guided path would have left the other two wrong.
      const focused = this.focusedEntityId;
      if (focused) {
        const stillHere = (this.store.require(spaceId).entityRefs || []).includes(focused);
        if (!stillHere) this.setFocus(null);
      }
    }
    this.bus.emit(EVENTS.SPACE_ENTERED, { spaceId, arrivalAnchorId: this.arrivalAnchorId, previousSpaceId });
    this._changed('space', { spaceId, previousSpaceId });
  }

  setFocus(entityId) {
    if (this.focusedEntityId === entityId) return;
    const previous = this.focusedEntityId;
    if (previous) this.bus.emit(EVENTS.ENTITY_FOCUS_LEFT, { entityId: previous });
    this.focusedEntityId = entityId;
    if (entityId) {
      this.visitedEntityIds.add(entityId);
      this.bus.emit(EVENTS.ENTITY_FOCUSED, { entityId, mode: this.mode });
    }
    this._changed('focus', { entityId, previous });
  }

  setHotspotState(hotspotId, state) {
    const previous = this.hotspotStates.get(hotspotId);
    if (previous === state) return;
    this.hotspotStates.set(hotspotId, state);
    if (state === HOTSPOT_STATE.NEAR) this.bus.emit(EVENTS.HOTSPOT_NEAR, { hotspotId });
    if (previous === HOTSPOT_STATE.NEAR && state === HOTSPOT_STATE.AVAILABLE) {
      this.bus.emit(EVENTS.HOTSPOT_LEFT, { hotspotId });
    }
    this._changed('hotspot', { hotspotId, state, previous });
  }

  hotspotState(hotspotId) {
    return this.hotspotStates.get(hotspotId);
  }

  markPortalTraversed(portalId) {
    this.traversedPortalIds.add(portalId);
  }

  setRoute(routeId, stepId = null) {
    this.activeRouteId = routeId;
    this.activeStepId = stepId;
    this._changed('route', { routeId, stepId });
  }

  /** Serialisable snapshot for QA, comparison and the World Map. Still no camera. */
  snapshot() {
    return {
      worldId: this.store.id,
      revision: this.revision,
      mode: this.mode,
      activeSpaceId: this.activeSpaceId,
      arrivalAnchorId: this.arrivalAnchorId,
      focusedEntityId: this.focusedEntityId,
      activeRouteId: this.activeRouteId,
      activeStepId: this.activeStepId,
      visitedEntityIds: [...this.visitedEntityIds].sort(),
      visitedSpaceIds: [...this.visitedSpaceIds].sort(),
      traversedPortalIds: [...this.traversedPortalIds].sort(),
      hotspotStates: Object.fromEntries([...this.hotspotStates.entries()].sort())
    };
  }

  /**
   * Proof, not comment: World State holds nothing the camera owns.
   * The QA suite asserts this.
   */
  assertNoCameraState() {
    const leaked = Object.keys(this).filter((key) => CAMERA_LEAK_KEYS.includes(key));
    if (leaked.length) {
      throw new Error(`[IW] World State leaked camera ownership: ${leaked.join(', ')}`);
    }
    return true;
  }
}
