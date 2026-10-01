/**
 * Immersive Worlds — Event Bus
 *
 * Implements the event vocabulary contract (IW-0 Constitution §8).
 *
 * Rules enforced here:
 *   - only names declared in EVENTS may be emitted (typos become errors, not silence);
 *   - events are facts or requests, never UI instructions;
 *   - per-frame state is NOT routed through this bus (see Runtime.update).
 *
 * No Three.js. No DOM.
 */

/** Canonical event names. Extending this list is an architectural act, not a convenience. */
export const EVENTS = Object.freeze({
  WORLD_READY: 'world:ready',
  WORLD_STATE_CHANGED: 'world:state-changed',

  SPACE_PRELOAD_REQUESTED: 'space:preload-requested',
  SPACE_READY: 'space:ready',
  SPACE_ENTERED: 'space:entered',
  SPACE_LEFT: 'space:left',
  SPACE_DISPOSED: 'space:disposed',

  ENTITY_FOCUSED: 'entity:focused',
  ENTITY_FOCUS_LEFT: 'entity:focus-left',

  HOTSPOT_NEAR: 'hotspot:near',
  HOTSPOT_LEFT: 'hotspot:left',
  HOTSPOT_ACTIVATED: 'hotspot:activated',

  PORTAL_REQUESTED: 'portal:requested',
  PORTAL_ENTERED: 'portal:entered',

  ROUTE_STARTED: 'route:started',
  ROUTE_STEP: 'route:step',
  ROUTE_COMPLETED: 'route:completed',

  EXPERIENCE_STARTED: 'experience:started',
  EXPERIENCE_PAUSED: 'experience:paused',
  EXPERIENCE_RESUMED: 'experience:resumed',
  EXPERIENCE_COMPLETED: 'experience:completed',

  SHOT_STARTED: 'shot:started',
  SHOT_COMPLETED: 'shot:completed',

  CAMERA_AUTHORITY_CHANGED: 'camera:authority-changed',

  AUDIO_CUE: 'audio:cue',
  NARRATION_CUE: 'narration:cue',

  QUALITY_TIER_CHANGED: 'quality:tier-changed',

  ASSET_READY: 'asset:ready',
  ASSET_ERROR: 'asset:error'
});

const KNOWN = new Set(Object.values(EVENTS));

export class EventBus {
  constructor({ recordHistory = false, historyLimit = 500 } = {}) {
    /** @type {Map<string, Set<Function>>} */
    this._handlers = new Map();
    this._recordHistory = recordHistory;
    this._historyLimit = historyLimit;
    /** @type {{name:string, payload:any, t:number}[]} */
    this.history = [];
    this._emitting = 0;
  }

  /** @returns {() => void} unsubscribe */
  on(name, handler) {
    assertKnown(name);
    let set = this._handlers.get(name);
    if (!set) {
      set = new Set();
      this._handlers.set(name, set);
    }
    set.add(handler);
    return () => set.delete(handler);
  }

  once(name, handler) {
    const off = this.on(name, (payload) => {
      off();
      handler(payload);
    });
    return off;
  }

  emit(name, payload = {}) {
    assertKnown(name);
    if (this._recordHistory) {
      this.history.push({ name, payload, t: this.history.length });
      if (this.history.length > this._historyLimit) this.history.shift();
    }
    const set = this._handlers.get(name);
    if (!set || set.size === 0) return;
    this._emitting += 1;
    try {
      // Copy so handlers may unsubscribe during dispatch.
      for (const handler of [...set]) handler(payload);
    } finally {
      this._emitting -= 1;
    }
  }

  clear() {
    this._handlers.clear();
    this.history.length = 0;
  }
}

function assertKnown(name) {
  if (!KNOWN.has(name)) {
    throw new Error(
      `[IW] Unknown event "${name}". Declare it in engine/core/event-bus.js EVENTS before use.`
    );
  }
}
