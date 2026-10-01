/**
 * Immersive Worlds — Runtime
 *
 * The composition root of the World Engine. It owns subsystem construction,
 * update order and disposal, and it is the only place where subsystems learn
 * about each other — through explicit ports, never by reaching into internals.
 *
 * What the Runtime is NOT: it is not a renderer, not a Scene Kit, not an app.
 * It never imports a graphics library. Everything visual arrives as an injected
 * Scene Kit that satisfies the contract in engine/scenekit/scene-kit.js.
 *
 * Update order is deliberate and stable:
 *
 *   clock → experience → camera authority → proximity → scene kit → render
 *
 *   • the experience decides what should be happening;
 *   • the camera authority resolves who owns the camera and writes it once;
 *   • proximity observes the resulting visitor position;
 *   • the Scene Kit reacts to semantics it was told about;
 *   • the host renders.
 *
 * Per-frame state deliberately does not travel through the event bus
 * (Constitution §8, last rule).
 */

import { Clock } from './clock.js';
import { EVENTS, EventBus } from './event-bus.js';
import { DeterministicRNG } from './rng.js';
import { QualityManager } from './device-tier.js';
import { WorldStore } from '../world/world-store.js';
import { WorldGraph } from '../world/world-graph.js';
import { WorldState, EXPERIENCE_MODE } from '../world/world-state.js';
import { SpaceLifecycle } from '../world/space-lifecycle.js';
import { CameraAuthority, clonePose } from '../camera/camera-authority.js';
import { ExploreController } from '../camera/controllers/explore-controller.js';
import { FocusController } from '../camera/controllers/focus-controller.js';
import { DirectedController } from '../camera/controllers/directed-controller.js';
import { CrossingController } from '../camera/controllers/crossing-controller.js';
import { AuthorController } from '../camera/controllers/author-controller.js';
import { ProximitySystem } from '../interaction/proximity.js';
import { ActionDispatch } from '../interaction/action-dispatch.js';
import { ExperienceDirector } from '../experience/experience-director.js';
import { buildTourManifest } from '../experience/tour-manifest.js';
import { assertSceneKitContract } from '../scenekit/scene-kit.js';
import { ACTION, CAMERA_AUTHORITY, HOTSPOT_STATE, TRANSITION_BEHAVIOUR } from '../schema/types.js';

export class Runtime {
  /**
   * @param {{
   *   world: import('../schema/types.js').World,
   *   sceneKit: import('../scenekit/scene-kit.js').SceneKit,
   *   viewport: () => {aspect:number, vfov:number},
   *   seed?: number|string,
   *   tier?: string,
   *   env?: object,
   *   reducedMotion?: boolean,
   *   mode?: 'EXPERIENCE'|'AUTHOR'
   * }} options
   */
  constructor(options) {
    const {
      world, sceneKit, viewport,
      seed = 'immersive-worlds-v1', tier, env,
      reducedMotion = false, mode = 'EXPERIENCE'
    } = options;

    assertSceneKitContract(sceneKit);

    this.hostMode = mode;
    this.reducedMotion = reducedMotion;
    this.viewport = viewport;

    this.bus = new EventBus({ recordHistory: true });
    this.clock = new Clock();
    this.rng = new DeterministicRNG(seed);
    this.quality = new QualityManager({ bus: this.bus, tier, env });

    this.store = new WorldStore(world);
    this.graph = new WorldGraph(this.store);
    this.state = new WorldState({ store: this.store, bus: this.bus });
    this.state.assertNoCameraState();

    this.sceneKit = sceneKit;
    this.sceneKitContext = {
      store: this.store,
      quality: this.quality.policy,
      rng: this.rng,
      bus: this.bus,
      hasBudget: (used) => used < this.quality.policy.warmupBudgetMs
    };

    this.spaces = new SpaceLifecycle({
      store: this.store,
      graph: this.graph,
      bus: this.bus,
      sceneKit: this.sceneKit,
      context: this.sceneKitContext
    });

    // -- camera ---------------------------------------------------------------
    this.explore = new ExploreController();
    this.focus = new FocusController();
    this.directed = new DirectedController();
    // The camera while a doorway is being passed. It is a registered authority
    // rather than a mode of the Directed controller because a crossing outlives
    // the beat that starts it and belongs to neither room.
    this.crossing = new CrossingController();
    this.author = new AuthorController();
    this.focus.setReducedMotion(reducedMotion);
    this.directed.setReducedMotion(reducedMotion);
    this.crossing.setReducedMotion(reducedMotion);

    this.camera = new CameraAuthority({ bus: this.bus, reducedMotion });
    this.camera
      .register(CAMERA_AUTHORITY.EXPLORE, this.explore)
      .register(CAMERA_AUTHORITY.FOCUS, this.focus)
      .register(CAMERA_AUTHORITY.DIRECTED, this.directed)
      .register(CAMERA_AUTHORITY.TRANSITION, this.crossing)
      .register(CAMERA_AUTHORITY.AUTHOR, this.author);
    this.camera._owner = mode === 'AUTHOR' ? CAMERA_AUTHORITY.AUTHOR : CAMERA_AUTHORITY.EXPLORE;

    // -- interaction ----------------------------------------------------------
    this.actions = new ActionDispatch({ bus: this.bus });
    this.proximity = new ProximitySystem({
      store: this.store,
      state: this.state,
      bus: this.bus,
      sceneKit: this.sceneKit
    });
    this._registerActions();

    // -- experience -----------------------------------------------------------
    this.experience = new ExperienceDirector({
      store: this.store,
      state: this.state,
      bus: this.bus,
      reducedMotion,
      ports: {
        framingFor: (subjectRef, intent, options) => this.framingFor(subjectRef, intent, options),
        stageGuide: (staging) => this.stageGuide(staging),
        stageVisitor: (staging) => this.sceneKit.setVisitorStaging?.(staging),
        guideSettled: () => this.sceneKit.guideSettled?.() !== false,
        playShot: (pose, opts) => this.directed.playShot(pose, opts),
        snapTo: (pose) => this.directed.snapTo(pose),
        currentPose: () => clonePose(this.camera.pose),
        subjectPoint: (subjectRef) => this.sceneKit.subjectPoint?.(subjectRef) ?? null,
        pathWaypoint: (from, to, context) => this.sceneKit.pathWaypoint?.(from, to, context) ?? null,
        crossingActive: () => this.crossing.isCrossing,
        requestAuthority: (authority, opts) => this.camera.request(authority, opts),
        dispatch: (action, context) => this.actions.dispatch(action, context),
        viewport: () => this.viewport()
      }
    });

    /** Pose the visitor stood at before Focus or a guided route took over. */
    this._exploreReturnPose = null;
    this._running = false;
    this._rafHandle = null;
    this._frameTimes = [];
    this.onFrame = null;

    // A crossing holds two things it must give back: the Scene Kit's atmosphere,
    // and the lifecycle's deferred working-set reconcile. Losing the camera is the
    // definitive end of a crossing, whether it landed or was abandoned, so that is
    // where they are released. The frame loop checks too, but a release that only
    // happens if someone keeps stepping frames is a release that fails in exactly
    // the situation it exists for.
    this.bus.on(EVENTS.CAMERA_AUTHORITY_CHANGED, ({ from }) => {
      if (from === CAMERA_AUTHORITY.TRANSITION) this._releaseCrossingHolds();
    });

    this.bus.on(EVENTS.QUALITY_TIER_CHANGED, ({ policy }) => {
      this.sceneKitContext.quality = policy;
      this.sceneKit.applyQuality(policy);
    });
  }

  /* == actions =============================================================== */

  _registerActions() {
    this.actions
      .register(ACTION.FOCUS_ENTITY, (action, context) => this.focusEntity(action.target, action.params, context))
      .register(ACTION.RELEASE_FOCUS, () => this.releaseFocus())
      .register(ACTION.OPEN_INFO, (action) => {
        this.state.setFocus(action.target);
        return { info: this.store.require(action.target).content };
      })
      .register(ACTION.PLAY_MEDIA, (action) => {
        this.bus.emit(EVENTS.AUDIO_CUE, { cue: 'entity-media', entityId: action.target });
        return this.focusEntity(action.target, action.params);
      })
      .register(ACTION.ACTIVATE_PORTAL, (action, context) => this.traversePortal(action.target, context))
      .register(ACTION.START_ROUTE, (action) => this.startRoute(action.target))
      .register(ACTION.TRIGGER_STORY, (action) => {
        const step = this.store.require(action.target);
        return this.startRoute(this._routeContaining(step.chapterId));
      })
      .register(ACTION.SET_STATE, (action) => {
        const { hotspotId, state } = action.params || {};
        if (hotspotId && state) this.state.setHotspotState(hotspotId, state);
        return true;
      });
  }

  _routeContaining(chapterId) {
    const route = this.store.routes.find((candidate) => (candidate.chapterRefs || []).includes(chapterId));
    if (!route) throw new Error(`[IW] no route contains chapter "${chapterId}"`);
    return route.id;
  }

  /* == lifecycle ============================================================= */

  /** Build the start Space, place the visitor and announce readiness. */
  async start() {
    await this.spaces.activate(this.store.startSpaceId);
    this._onSpaceActivated(this.store.startSpaceId, this.state.arrivalAnchorId);

    if (this.hostMode === 'AUTHOR') {
      const bounds = this.store.require(this.store.startSpaceId).bounds;
      this.author.framePoint([bounds.origin[0], bounds.origin[1] + 1.4, bounds.origin[2]], Math.max(...bounds.size));
    }

    this.bus.emit(EVENTS.WORLD_READY, {
      worldId: this.store.id,
      spaceId: this.store.startSpaceId,
      tier: this.quality.tier
    });
    return this;
  }

  _onSpaceActivated(spaceId, arrivalAnchorId) {
    const space = this.store.require(spaceId);
    const anchorId = arrivalAnchorId || space.defaultSpawnAnchorId;
    const spawn = this.sceneKit.poseForAnchor(anchorId);

    this.explore.setNavigationVolume(this.sceneKit.navigationVolume(spaceId));
    if (spawn) this.explore.placeAt(spawn.position, spawn.normal);
    this.proximity.rebuild(spaceId);
  }

  /* == semantic operations =================================================== */

  /**
   * Focus an entity. This is the single path used by an Explore hotspot, by a
   * guided story step and by the QA harness — one behaviour, three callers.
   */
  focusEntity(entityId, params = {}, context = {}) {
    const entity = this.store.require(entityId);
    this.state.setFocus(entityId);
    this.sceneKit.setEntityFocused(entityId, true);

    for (const hotspotId of entity.interaction?.hotspotRefs || []) {
      this.state.setHotspotState(hotspotId, HOTSPOT_STATE.VISITED);
    }

    // A guided shot focuses the *world*, but the camera stays with the Director.
    // The Director says so explicitly; this used to also refuse the camera for
    // *any* focus while a route was running, which silently broke the one case
    // that legitimately wants it — a visitor entering Collection Browse from a
    // guided beat. The symptom was the label changing to the next work while the
    // camera kept showing the previous one.
    if (params.camera === false) {
      return { entityId, camera: this.camera.owner };
    }

    // Entering Collection Browse from inside the tour. The origin is remembered
    // once, on the way in, so that stepping through five works still returns to
    // the beat the visitor left — and the route is paused so the tour cannot
    // advance underneath someone who is looking at something else.
    if (this.state.mode === EXPERIENCE_MODE.GUIDED && !this._browseOrigin) {
      this._browseOrigin = {
        stepId: this.experience.currentStep?.id || null,
        tourStepId: this.experience.currentTourStep?.id || null,
        index: this.experience.index,
        transport: this.experience.transport
      };
      this.experience.pause();
      // Pure artwork presentation: the guide is not part of it.
      this.stageGuide(null);
    }

    const pose = this.framingFor(entityId, 'FOCUS');
    this._exploreReturnPose = clonePose(this.camera.pose);
    this.focus.setSubject(pose);
    this.camera.request(CAMERA_AUTHORITY.FOCUS, {
      reason: `focus:${entityId}`,
      durationMs: this.reducedMotion ? 0 : 900,
      endPose: pose,
      restore: 'ADOPT_INCOMING'
    });
    this.bus.emit(EVENTS.HOTSPOT_ACTIVATED, { hotspotId: context.sourceId || null, entityId });
    return { entityId, camera: CAMERA_AUTHORITY.FOCUS };
  }

  /**
   * Leave focus. The visitor returns to exactly where they were standing —
   * PRESERVE_OWN means the Explore controller reinstates its own kept pose
   * rather than adopting wherever the focus camera happened to end up.
   */
  /**
   * Leave Focus.
   *
   * The camera only comes back to the visitor if the visitor is the one who
   * should have it. During a guided route the Director owns the camera, and a
   * step that releases focus — every step following a FOCUS beat, including the
   * portal step at a threshold — was handing it to EXPLORE anyway. The visible
   * result was that crossing a doorway mid-tour dropped you out of the guided
   * camera and stood you at the arrival spawn: a doorway that behaved like a
   * scene reset, which is exactly what this pass exists to remove.
   */
  releaseFocus() {
    if (!this.state.focusedEntityId) return false;
    const entityId = this.state.focusedEntityId;
    this.sceneKit.setEntityFocused(entityId, false);
    this.state.setFocus(null);

    // Leaving Collection Browse: back to the exact beat it was entered from,
    // with its authored shot and its guide restaged. The browsed work never
    // became the tour's position, so there is nothing to unwind in World State —
    // only the camera and the guide to put back.
    if (this._browseOrigin && this.experience.transport !== 'IDLE') {
      const origin = this._browseOrigin;
      this._browseOrigin = null;
      this._exploreReturnPose = null;
      this.experience.reapplyCurrentShot();
      if (origin.transport === 'PLAYING') this.experience.resume();
      return true;
    }

    if (this.state.mode === EXPERIENCE_MODE.GUIDED) return true;

    this.camera.request(CAMERA_AUTHORITY.EXPLORE, {
      reason: 'focus:release',
      durationMs: this.reducedMotion ? 0 : 700,
      endPose: this._exploreReturnPose || undefined,
      restore: 'PRESERVE_OWN'
    });
    this._exploreReturnPose = null;
    return true;
  }

  /**
   * Traverse a Portal. The Portal owns the connection and the semantic
   * transition behaviour; it owns no trigger — getting here was somebody else's
   * job (a Hotspot action, or a guided step).
   */
  async traversePortal(portalId, context = {}) {
    const portal = this.store.require(portalId);
    this.bus.emit(EVENTS.PORTAL_REQUESTED, { portalId, from: portal.fromSpaceId, to: portal.toSpaceId });

    if (this.state.focusedEntityId) this.releaseFocus();

    // A caller that decided this portal is a crossing gets a crossing, provided
    // the Portal's own semantics allow one. A TELEPORT has no line of sight to
    // fly through and a CUT was authored as a cut; neither is a continuity
    // failure to be fixed here.
    if (context.crossing
      && portal.transitionBehaviour !== TRANSITION_BEHAVIOUR.TELEPORT
      && portal.transitionBehaviour !== TRANSITION_BEHAVIOUR.CUT) {
      const flown = await this._flyCrossing(portal, context.crossing, context);
      if (flown) return flown;
      // Falling through is deliberate: a crossing that cannot be planned — no
      // opening, no destination framing — must still get the visitor into the
      // next room. A cut is a worse crossing, not a broken one.
    }

    const activation = await this.spaces.activate(portal.toSpaceId);
    this.state.enterSpace(portal.toSpaceId, portal.destinationSpawnId);
    this.state.markPortalTraversed(portalId);
    this._onSpaceActivated(portal.toSpaceId, portal.destinationSpawnId);

    const spawn = this.sceneKit.poseForAnchor(portal.destinationSpawnId);
    const arrivalPose = spawn
      ? {
          position: [spawn.position[0], spawn.position[1] + this.explore.eyeHeight, spawn.position[2]],
          target: [
            spawn.position[0] + spawn.normal[0],
            spawn.position[1] + this.explore.eyeHeight,
            spawn.position[2] + spawn.normal[2]
          ],
          fov: this.explore.fov
        }
      : null;

    if (this.state.mode === EXPERIENCE_MODE.GUIDED) {
      // The Director keeps the camera; a portal inside a tour is a cut it owns.
      if (arrivalPose) this.directed.snapTo(arrivalPose);
    } else if (arrivalPose) {
      const instant =
        this.reducedMotion || portal.transitionBehaviour === TRANSITION_BEHAVIOUR.CUT;
      this.camera.request(CAMERA_AUTHORITY.EXPLORE, {
        reason: `portal:${portalId}`,
        durationMs: instant ? 0 : 650,
        endPose: arrivalPose,
        restore: 'ADOPT_INCOMING'
      });
    }

    this.bus.emit(EVENTS.PORTAL_ENTERED, {
      portalId,
      spaceId: portal.toSpaceId,
      behaviour: portal.transitionBehaviour,
      preparedOnDemand: activation.prepared,
      waitedMs: activation.waitedMs,
      source: context.source || null
    });
    return { spaceId: portal.toSpaceId, waitedMs: activation.waitedMs };
  }

  /**
   * Walk the visitor through a doorway instead of cutting them through it.
   *
   * The order here is the whole point, and it is not the order the cut used:
   *
   *   1. the destination is built, warmed and made visible *before* anything moves
   *   2. the aperture is measured and the arrival pose resolved against it
   *   3. TRANSITION takes the camera — one writer for the whole crossing
   *   4. the room handoff fires on the frame the camera passes the threshold
   *   5. the camera lands on the arrival pose and hands authority back
   *
   * Step 1 is what makes the *first* crossing look like the second one. The cut
   * built the destination while the visitor was already notionally in it, so the
   * first pass paid for the build with a stall and every later pass did not.
   *
   * This resolves as soon as the crossing is in flight, not when it lands: the
   * beat that started it waits on `crossingActive`, and blocking the action here
   * would stall the Director's clock behind its own camera move.
   *
   * @returns {Promise<object|null>} null when no crossing could be planned
   */
  async _flyCrossing(portal, intent, context = {}) {
    const fromSpaceId = this.state.activeSpaceId;
    const eyeHeight = this.explore.eyeHeight;

    // 1 — the destination stands and is lit before the camera commits to it.
    const warmStartedAt = performance.now();
    await this.spaces.preview(portal.toSpaceId);
    const warmedMs = Math.round(performance.now() - warmStartedAt);

    // 2 — WHERE, and the endpoint. The arrival pose is the ordinary framing the
    // beat would have asked for anyway; the crossing may choose the path to it
    // and nothing else.
    const threshold = this.sceneKit.thresholdFor?.(portal.id, { eyeHeight });
    const arrivalPose = this.framingFor(portal.toSpaceId, 'PORTAL', {});
    if (!threshold || !arrivalPose) return null;

    const from = clonePose(this.camera.pose);
    const legIn = Math.hypot(
      threshold.gate[0] - from.position[0], threshold.gate[2] - from.position[2]
    );
    const legOut = Math.hypot(
      arrivalPose.position[0] - threshold.gate[0], arrivalPose.position[2] - threshold.gate[2]
    );
    const travelMs = Math.min(
      Math.max(((legIn + legOut) / (intent.speed || 1.35)) * 1000, intent.min || 2000),
      intent.max || 5000
    );

    // 3 — one writer. The Directed shot that was running is dropped here, not
    // left to argue with the crossing over the same frames.
    this.camera.request(CAMERA_AUTHORITY.TRANSITION, {
      reason: `crossing:${portal.id}`, restore: 'ADOPT_INCOMING'
    });

    const resumeAuthority = this.state.mode === EXPERIENCE_MODE.GUIDED
      ? CAMERA_AUTHORITY.DIRECTED
      : CAMERA_AUTHORITY.EXPLORE;

    // Each room owns its fog, background and exposure, and activating one
    // applies them in a single frame. Held here, they resolve across the
    // doorway instead — the crossing is not finished being continuous if the
    // light cuts.
    this.sceneKit.setAtmosphereLock?.(true);
    this._crossingHolds = true;

    let crossedAt = null;
    let plan = null;
    plan = this.crossing.playCrossing(arrivalPose, {
      gate: threshold.gate,
      axis: threshold.axis,
      travelMs,
      flat: intent.flat,
      lead: intent.lead,
      holdHeight: intent.holdHeight,
      apertureFov: intent.apertureFov,
      pin: intent.pin,
      recoil: intent.recoil,
      onProgress: ({ atmosphere, e }) => {
        this.sceneKit.blendAtmosphere?.(fromSpaceId, portal.toSpaceId, atmosphere);
        // The threshold treatment rides the same clock. It is a visual layer and
        // cannot reach the camera, the endpoint or the handoff — it only decides
        // what the aperture looks like while it is being passed.
        this.sceneKit.setThresholdProgress?.(threshold, e);
        // Variant D needs to know which rooms it is between, because with one
        // scene graph the destination pass masks by group rather than by scene.
        this.sceneKit.setPortalProgress?.(threshold, e, {
          fromSpaceId, toSpaceId: portal.toSpaceId, crossAt: plan?.s ?? 0.66
        });
      },
      // 4 — the handoff. Which room you are in changes when you pass through the
      // opening, which is both the truthful moment and the invisible one.
      onCrossPlane: () => {
        crossedAt = Math.round(performance.now());
        // Synchronously, on this frame. The room was paid for before the move
        // started precisely so that this moment costs nothing and cannot slip.
        // The working set is reconciled after the move instead: disposing two
        // rooms is the most expensive thing the lifecycle does, and this is the
        // frame the visitor is looking hardest at.
        this.spaces.activateReady(portal.toSpaceId, { deferWorkingSet: true });
        this.state.enterSpace(portal.toSpaceId, portal.destinationSpawnId);
        this.state.markPortalTraversed(portal.id);
        this._onSpaceActivated(portal.toSpaceId, portal.destinationSpawnId);
        this.bus.emit(EVENTS.PORTAL_ENTERED, {
          portalId: portal.id,
          spaceId: portal.toSpaceId,
          behaviour: portal.transitionBehaviour,
          preparedOnDemand: warmedMs > 0,
          waitedMs: warmedMs,
          crossing: true,
          source: context.source || null
        });
      },
      // 5 — land, release the atmosphere onto the destination exactly, give the
      // camera back.
      onComplete: () => {
        this.sceneKit.setThresholdProgress?.(threshold, 1);
        this.sceneKit.setPortalProgress?.(threshold, 1, { fromSpaceId, toSpaceId: portal.toSpaceId });
        // Exact, not almost: the blend is applied at 1 before the holds go, so the
        // destination's own atmosphere is what the room is left with.
        this.sceneKit.blendAtmosphere?.(fromSpaceId, portal.toSpaceId, 1);
        this._releaseCrossingHolds();
        this.camera.request(resumeAuthority, {
          reason: `crossing:${portal.id}:landed`, restore: 'ADOPT_INCOMING'
        });
        this.bus.emit(EVENTS.PORTAL_ENTERED, {
          portalId: portal.id, spaceId: portal.toSpaceId, phase: 'LANDED', crossing: true
        });
      }
    });

    return {
      spaceId: portal.toSpaceId,
      waitedMs: warmedMs,
      // The Director reads this and does not write the camera for this beat.
      cameraHandled: true,
      crossing: { ...plan, travelMs, warmedMs, crossedAt, threshold: threshold.portalId }
    };
  }

  /**
   * Give back what a crossing held, whether it landed or was abandoned.
   *
   * Idempotent on purpose: it is reached from the crossing's own completion, from
   * the authority handing the camera on, and from the frame loop, and none of
   * those can know which of the others got there first.
   */
  _releaseCrossingHolds() {
    if (!this._crossingHolds) return;
    this._crossingHolds = false;
    this.sceneKit.setAtmosphereLock?.(false);
    this.spaces.settle();
  }

  /**
   * The works in the active Space a visitor can inspect, in the order they are
   * authored. This is what "next work" means — it is a property of the World,
   * not of the UI.
   */
  focusableInSpace(spaceId = this.state.activeSpaceId) {
    return this.store.entitiesOf(spaceId).filter((entity) => entity.interaction?.focusable);
  }

  /**
   * Move focus to the next or previous work without walking back into the room.
   *
   * It goes through the ordinary FOCUS_ENTITY action, so stepping through a
   * gallery in detail view leaves exactly the same trace in World State as
   * walking up to each work would.
   *
   * @param {number} delta +1 next, -1 previous
   */
  focusNeighbour(delta = 1) {
    const works = this.focusableInSpace();
    if (!works.length) return null;
    const current = works.findIndex((entity) => entity.id === this.state.focusedEntityId);
    const next = works[(current + delta + works.length) % works.length];
    if (!next || next.id === this.state.focusedEntityId) return null;

    // Keep the pose the visitor will return to: stepping through five works
    // must still put them back where they entered the first one.
    const keepReturn = this._exploreReturnPose;
    this.sceneKit.setEntityFocused(this.state.focusedEntityId, false);
    this.actions.dispatch(
      { type: ACTION.FOCUS_ENTITY, target: next.id },
      { source: 'HOTSPOT', sourceId: 'detail-navigation' }
    );
    this._exploreReturnPose = keepReturn || this._exploreReturnPose;
    return next.id;
  }

  /**
   * How close the detail view is pushed in, 0 = authored framing, 1 = as close
   * as the work allows. The camera authority is untouched: this only changes
   * what the FOCUS controller asks for.
   */
  setDetailZoom(zoom) {
    this.focus.setZoom(zoom);
    return this.focus.zoom;
  }

  /** Activate whichever hotspot the visitor is standing next to. */
  activateNearest() {
    const hotspot = this.proximity.nearestHotspot;
    if (!hotspot) return null;
    this.state.setHotspotState(hotspot.id, HOTSPOT_STATE.ACTIVE);
    this.sceneKit.setHotspotState(hotspot.id, HOTSPOT_STATE.ACTIVE);
    const action = { ...hotspot.action, target: hotspot.action.target ?? hotspot.entityId };
    return this.actions.dispatch(action, { source: 'HOTSPOT', sourceId: hotspot.id });
  }

  startRoute(routeId) {
    this._exploreReturnPose = clonePose(this.camera.pose);
    this.experience.start(routeId, { returnPose: this._exploreReturnPose });
    return routeId;
  }

  exitRoute() {
    this._browseOrigin = null;
    this.experience.exit({ restorePose: true, reason: 'visitor-exit' });
  }

  /**
   * Whether the visitor is browsing the collection from inside a guided beat.
   *
   * The two previous/next controls mean different things — beat vs artwork —
   * and this is what lets the HUD say which one is live instead of showing the
   * same arrows for both.
   */
  get isBrowsingCollection() {
    return Boolean(this._browseOrigin);
  }

  /** Where Collection Browse will return to. Null when not browsing. */
  get browseOrigin() {
    return this._browseOrigin ? { ...this._browseOrigin } : null;
  }

  /** The world's primary route. One today; named rather than indexed by hand. */
  get defaultRouteId() {
    return this.store.all('ROUTE')[0]?.id || null;
  }

  /**
   * The canonical numbered tour, available before the route has ever run.
   *
   * A panel has to draw the sequence at boot, and a test has to assert it
   * without starting anything. Both read this; neither invents an order.
   */
  get tour() {
    const routeId = this.experience.routeId || this.defaultRouteId;
    if (!routeId) return null;
    if (this.experience.manifest?.routeId === routeId) return this.experience.manifest;
    if (this._tourManifest?.routeId !== routeId) {
      this._tourManifest = buildTourManifest(this.store, routeId);
    }
    return this._tourManifest;
  }

  /**
   * Go to a canonical Tour Step, starting the route if it is not running.
   *
   * One door for all three navigation intents, so the panel, the keyboard and a
   * test cannot reach the tour by three different paths.
   */
  async goToTourStep(tourStepId) {
    if (this.experience.transport === 'IDLE') {
      this.startRoute(this.defaultRouteId);
      this.experience.pause();
    }
    return this.experience.seekToTourStep(tourStepId);
  }

  /**
   * Return to the previous Tour Stop.
   *
   * Separate from `goToTourStep` on purpose. That is deterministic destination
   * recovery and reaches any stop by replaying the route; this is the visitor's
   * Back, and it must not restart anything. When the previous stop is in another
   * room, or was never reached going forwards, this reports false rather than
   * quietly falling back to a replay — a cross-room return is a different move
   * and pretending otherwise is the defect this was built to remove.
   *
   * @returns {boolean} whether the return was performed
   */
  goBackOneStop() {
    return this.experience.back();
  }

  /** Whether a Back is available from where the visitor stands. */
  get canGoBack() {
    return this.experience.canGoBack;
  }

  /**
   * Stage the guide, or dismiss it with `null`.
   *
   * Presentation, not World State — but it goes through the runtime rather than
   * letting callers reach into the Scene Kit. A QA state that poked the kit
   * directly had no owner, so anything that later dismissed the guide silently
   * emptied that state and its evidence could not be trusted.
   */
  stageGuide(staging) {
    this._guideStaging = staging || null;
    this.sceneKit.setGuideStaging?.(this._guideStaging);
    return this._guideStaging;
  }

  /**
   * Ask the Scene Kit to measure a framing for a subject and intent.
   *
   * `options` carries staging the kit may need to compose the shot — an
   * accompanied shot has to know where the guide is standing. It is passed
   * alongside the viewport rather than stored anywhere: the engine is asking a
   * question, not holding presentation state.
   */
  framingFor(subjectRef, intent, options = {}) {
    const viewport = { ...this.viewport(), ...options, intent };
    const kind = this.store.kindOf(subjectRef);
    if (kind === 'SPACE') return this.sceneKit.framingForSpace(subjectRef, viewport);
    return this.sceneKit.framingForEntity(subjectRef, viewport);
  }

  /* == frame ================================================================= */

  /** @param {number} dt seconds */
  step(dt) {
    this.experience.update(dt);
    const pose = this.camera.update(dt);
    // A crossing that is abandoned rather than completed — the visitor presses
    // Escape halfway through a doorway — never runs its own completion, and the
    // two things it holds are both things that stay wrong silently: the
    // atmosphere would freeze mid-blend, and two rooms would stay resident.
    if (this._crossingHolds && !this.crossing.isCrossing) this._releaseCrossingHolds();
    this.proximity.update(dt, pose.position);
    this.sceneKit.update(dt, this.clock.elapsed);
    this.onFrame?.(pose, dt);
    return pose;
  }

  startLoop() {
    if (this._running) return;
    this._running = true;
    // A hidden tab stops rendering; the time it was away is not time the
    // visitor spent in the room, so the clock forgets it rather than charging
    // the running step for it.
    if (typeof document !== 'undefined' && !this._visibilityBound) {
      this._visibilityBound = () => { if (!document.hidden) this.clock.resume(); };
      document.addEventListener('visibilitychange', this._visibilityBound);
    }
    const tick = (now) => {
      if (!this._running) return;
      const frameStart = performance.now();
      const dt = this.clock.tick(now);
      this.step(dt);
      this._frameTimes.push(performance.now() - frameStart);
      if (this._frameTimes.length > 240) this._frameTimes.shift();
      this._rafHandle = requestAnimationFrame(tick);
    };
    this._rafHandle = requestAnimationFrame(tick);
  }

  stopLoop() {
    this._running = false;
    if (this._visibilityBound && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this._visibilityBound);
      this._visibilityBound = null;
    }
    if (this._rafHandle) cancelAnimationFrame(this._rafHandle);
    this._rafHandle = null;
  }

  dispose() {
    this.stopLoop();
    this.spaces.disposeAll();
    this.bus.clear();
  }

  /* == evidence ============================================================== */

  frameStats() {
    if (!this._frameTimes.length) return { samples: 0 };
    const sorted = [...this._frameTimes].sort((a, b) => a - b);
    const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
    return {
      samples: sorted.length,
      meanMs: Number(mean.toFixed(2)),
      p50Ms: Number(sorted[Math.floor(sorted.length * 0.5)].toFixed(2)),
      p95Ms: Number(sorted[Math.floor(sorted.length * 0.95)].toFixed(2)),
      maxMs: Number(sorted[sorted.length - 1].toFixed(2))
    };
  }

  report() {
    return {
      world: { id: this.store.id, title: this.store.title, schemaVersion: this.store.schemaVersion },
      mode: this.hostMode,
      quality: { tier: this.quality.tier, policy: this.quality.policy },
      state: this.state.snapshot(),
      camera: this.camera.report(),
      spaces: this.spaces.report(),
      proximity: this.proximity.report(),
      experience: this.experience.report(),
      actions: this.actions.summary(),
      render: this.sceneKit.renderStats(),
      frame: this.frameStats()
    };
  }
}

export { EXPERIENCE_MODE };
