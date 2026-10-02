/**
 * Immersive Worlds — Space Lifecycle
 *
 *   UNLOADED → PRELOADING → WARMING → READY → ACTIVE → COOLING → DISPOSED
 *
 * (Constitution §7 / IW-ADR-006. Pattern reference IW-REF-002 — room warmup and
 * working-set discipline. Concepts only; no code taken from any reference.)
 *
 * Two things make this worth having rather than "just build the room":
 *
 *   1. WARMING is a real state. A Space is not shown until its materials have
 *      been compiled, so entering a gallery does not stall on shader
 *      compilation the first time a wall comes into view.
 *   2. The working set is bounded: active Space + its graph neighbours + the
 *      Space we just left. Everything else is disposed. Constitution §19 calls
 *      this a hypothesis to test rather than a fixed policy, so the window is a
 *      constructor option and the manager reports what it actually did.
 *
 * This file drives the Scene Kit through the contract. It contains no Three.js.
 */

import { EVENTS } from '../core/event-bus.js';
import { SPACE_STATE } from '../schema/types.js';

export class SpaceLifecycle {
  /**
   * @param {{
   *   store: import('./world-store.js').WorldStore,
   *   graph: import('./world-graph.js').WorldGraph,
   *   bus: import('../core/event-bus.js').EventBus,
   *   sceneKit: import('../scenekit/scene-kit.js').SceneKit,
   *   context: import('../scenekit/scene-kit.js').SceneKitContext,
   *   keepPrevious?: boolean
   * }} deps
   */
  constructor({ store, graph, bus, sceneKit, context, keepPrevious = true }) {
    this.store = store;
    this.graph = graph;
    this.bus = bus;
    this.sceneKit = sceneKit;
    this.context = context;
    this.keepPrevious = keepPrevious;

    /** @type {Map<string, {state:string, handle:any, pending:Promise<any>|null, timings:Object}>} */
    this._slots = new Map();
    this._activeSpaceId = null;
    this._previousSpaceId = null;
    /** Set when an activation postponed its working-set reconcile — see settle(). */
    this._pendingWorkingSet = false;
    /** Every state transition, for QA evidence. */
    this.transitions = [];
  }

  stateOf(spaceId) {
    return this._slots.get(spaceId)?.state || SPACE_STATE.UNLOADED;
  }

  handleOf(spaceId) {
    return this._slots.get(spaceId)?.handle || null;
  }

  get activeSpaceId() {
    return this._activeSpaceId;
  }

  /** Spaces currently holding GPU resources — the measured working set. */
  get workingSet() {
    return [...this._slots.entries()]
      .filter(([, slot]) => slot.state !== SPACE_STATE.DISPOSED && slot.state !== SPACE_STATE.UNLOADED)
      .map(([id, slot]) => ({ spaceId: id, state: slot.state }));
  }

  _slot(spaceId) {
    let slot = this._slots.get(spaceId);
    if (!slot) {
      slot = { state: SPACE_STATE.UNLOADED, handle: null, pending: null, timings: {} };
      this._slots.set(spaceId, slot);
    }
    return slot;
  }

  _setState(spaceId, state) {
    const slot = this._slot(spaceId);
    const from = slot.state;
    slot.state = state;
    this.transitions.push({ spaceId, from, to: state, t: Math.round(performance.now()) });
    return slot;
  }

  /**
   * Bring a Space to READY (built + warmed) without showing it.
   * Safe to call repeatedly; concurrent calls share one promise.
   * @returns {Promise<void>}
   */
  async prepare(spaceId) {
    const slot = this._slot(spaceId);
    if (slot.state === SPACE_STATE.READY || slot.state === SPACE_STATE.ACTIVE) return;
    if (slot.pending) return slot.pending;

    slot.pending = (async () => {
      const space = this.store.require(spaceId);
      const startedAt = performance.now();

      this._setState(spaceId, SPACE_STATE.PRELOADING);
      this.bus.emit(EVENTS.SPACE_PRELOAD_REQUESTED, { spaceId });
      try {
        slot.handle = await this.sceneKit.buildSpace(space, this.context);
        slot.timings.build = Math.round(performance.now() - startedAt);

        const warmStartedAt = performance.now();
        this._setState(spaceId, SPACE_STATE.WARMING);
        await this.sceneKit.warmSpace(slot.handle, this.context);
        slot.timings.warm = Math.round(performance.now() - warmStartedAt);

        this._setState(spaceId, SPACE_STATE.READY);
        slot.timings.total = Math.round(performance.now() - startedAt);
        this.bus.emit(EVENTS.SPACE_READY, { spaceId, timings: { ...slot.timings } });
        this.bus.emit(EVENTS.ASSET_READY, { spaceId, kind: 'space' });
      } catch (error) {
        this._setState(spaceId, SPACE_STATE.UNLOADED);
        slot.handle = null;
        this.bus.emit(EVENTS.ASSET_ERROR, { spaceId, message: String(error?.message || error) });
        throw error;
      } finally {
        slot.pending = null;
      }
    })();

    return slot.pending;
  }

  /**
   * Make a Space the active one. Prepares it first if needed, deactivates the
   * outgoing Space, then re-evaluates the working set.
   * @returns {Promise<{spaceId:string, prepared:boolean, waitedMs:number}>}
   */
  async activate(spaceId, options = {}) {
    const startedAt = performance.now();
    const alreadyReady = this.stateOf(spaceId) === SPACE_STATE.READY;
    await this.prepare(spaceId);
    const waitedMs = Math.round(performance.now() - startedAt);
    this._activateNow(spaceId, options);
    return { spaceId, prepared: !alreadyReady, waitedMs };
  }

  /**
   * Activate a Space that is already READY, on this call, with no await.
   *
   * A crossing hands the room over on the frame the camera passes the threshold,
   * and `activate` cannot do that: even with nothing to load, its `await` defers
   * the swap by a microtask, so for one frame the visitor is through the doorway
   * and World State still says they are in the room behind them. Measured — the
   * active Space read as the origin room on the frame after the handoff.
   *
   * Requiring READY is the point. The caller must already have paid for the room
   * before the move started; if it has not, that is a bug to surface, not a stall
   * to hide inside a crossing.
   */
  activateReady(spaceId, options = {}) {
    const state = this.stateOf(spaceId);
    if (state !== SPACE_STATE.READY && state !== SPACE_STATE.ACTIVE) {
      throw new Error(`[IW] activateReady("${spaceId}") needs a READY Space, found ${state}`);
    }
    this._activateNow(spaceId, options);
    return { spaceId, prepared: false, waitedMs: 0 };
  }

  _activateNow(spaceId, options = {}) {
    if (this._activeSpaceId && this._activeSpaceId !== spaceId) {
      const outgoing = this._slots.get(this._activeSpaceId);
      if (outgoing?.handle) {
        this.sceneKit.deactivateSpace(outgoing.handle);
        this._setState(this._activeSpaceId, SPACE_STATE.COOLING);
      }
      this._previousSpaceId = this._activeSpaceId;
    }

    const slot = this._slot(spaceId);
    this.sceneKit.activateSpace(slot.handle);
    this._setState(spaceId, SPACE_STATE.ACTIVE);
    this._activeSpaceId = spaceId;

    // Building and throwing away rooms is the most expensive thing this class
    // does. During a crossing the camera is mid-flight, so a caller can ask for
    // the working set to be reconciled after the move instead of inside it — a
    // dropped frame at the threshold is exactly the frame the visitor is
    // watching.
    if (options.deferWorkingSet) this._pendingWorkingSet = true;
    else this._reconcileWorkingSet();
    this._reconcilePresence();
  }

  /** Run the reconcile that `activate({deferWorkingSet:true})` postponed. */
  settle() {
    if (!this._pendingWorkingSet) return false;
    this._pendingWorkingSet = false;
    this._reconcileWorkingSet();
    this._reconcilePresence();
    return true;
  }

  /**
   * Bring a Space to READY *and* make it perceptible from where the visitor
   * stands. A crossing needs the destination lit and standing before the camera
   * starts moving toward it; arriving is not when you find out whether the room
   * is there.
   */
  async preview(spaceId) {
    await this.prepare(spaceId);
    this._reconcilePresence();
    return this.stateOf(spaceId);
  }

  /**
   * Tell the Scene Kit how present each loaded Space is.
   *
   * A Space one CONTINUOUS or CUT portal away is ADJACENT: the visitor can see
   * into it through the opening, and during a continuous traversal both rooms
   * legitimately coexist. A Space reachable only by TELEPORT is not visible
   * from here, because there is no line of sight to it — the semantics of the
   * Portal decide, not the renderer.
   */
  _reconcilePresence() {
    const adjacent = new Set();
    for (const portal of this.graph.exits(this._activeSpaceId)) {
      if (portal.transitionBehaviour !== 'TELEPORT') adjacent.add(portal.toSpaceId);
    }
    for (const [spaceId, slot] of this._slots) {
      if (!slot.handle || spaceId === this._activeSpaceId) continue;
      this.sceneKit.setSpacePresence?.(slot.handle, adjacent.has(spaceId) ? 'ADJACENT' : 'HIDDEN');
    }
  }

  /**
   * Preload the Spaces the visitor could plausibly reach next, and dispose the
   * ones they cannot. Called after every activation.
   */
  _reconcileWorkingSet() {
    const keep = new Set([this._activeSpaceId]);
    for (const neighbour of this.graph.neighbours(this._activeSpaceId)) keep.add(neighbour);
    if (this.keepPrevious && this._previousSpaceId) keep.add(this._previousSpaceId);

    for (const [spaceId, slot] of this._slots) {
      if (keep.has(spaceId)) continue;
      if (slot.state === SPACE_STATE.DISPOSED || slot.state === SPACE_STATE.UNLOADED) continue;
      this.dispose(spaceId);
    }

    // Prefetch neighbours reachable through EAGER / ON_APPROACH portals.
    for (const portal of this.graph.exits(this._activeSpaceId)) {
      if (portal.prefetchPolicy === 'LAZY') continue;
      const state = this.stateOf(portal.toSpaceId);
      if (state === SPACE_STATE.UNLOADED) {
        this.prepare(portal.toSpaceId)
          .then(() => this._reconcilePresence())
          .catch(() => {
            /* surfaced through asset:error; a failed prefetch must not break the active space */
          });
      }
    }
  }

  dispose(spaceId) {
    const slot = this._slots.get(spaceId);
    if (!slot || !slot.handle) return;
    this.sceneKit.disposeSpace(slot.handle);
    slot.handle = null;
    this._setState(spaceId, SPACE_STATE.DISPOSED);
    this.bus.emit(EVENTS.SPACE_DISPOSED, { spaceId });
  }

  disposeAll() {
    for (const spaceId of [...this._slots.keys()]) this.dispose(spaceId);
    this._activeSpaceId = null;
    this._previousSpaceId = null;
  }

  /** QA evidence: what was built, warmed, kept and thrown away. */
  report() {
    return {
      activeSpaceId: this._activeSpaceId,
      previousSpaceId: this._previousSpaceId,
      workingSet: this.workingSet,
      timings: Object.fromEntries([...this._slots].map(([id, slot]) => [id, { ...slot.timings }])),
      transitions: this.transitions.slice(-40)
    };
  }
}
