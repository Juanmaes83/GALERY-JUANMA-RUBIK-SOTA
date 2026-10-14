/**
 * Immersive Worlds — Experience Director
 *
 * Guided Experience: chapters, story steps, shots and cues.
 *
 * Two contracts matter more than any feature here:
 *
 *   1. The Director *orchestrates*; it does not own subsystem internals
 *      (IW-ADR-007). It never writes the camera, never builds a Space, never
 *      touches a material. It asks, through the ports below.
 *
 *   2. Explore and Guided drive the SAME World State (IW-ADR-003). There is no
 *      "guided copy" of the world: a work focused during the tour is in the
 *      visitor's visited set afterwards, and a portal traversed by the tour is
 *      the same traversal the visitor could have made on foot.
 *
 * Transport is deliberately thin — play, pause, resume, skip, exit. A seekable
 * authored timeline is SHOULD LATER (Constitution §16) and is not built here.
 *
 * No Three.js. No DOM.
 */

import { EVENTS } from '../core/event-bus.js';
import { ACTION, CAMERA_AUTHORITY, SHOT_INTENT } from '../schema/types.js';
import { EXPERIENCE_MODE } from '../world/world-state.js';
import { buildTourManifest } from './tour-manifest.js';

/**
 * @typedef {Object} ExperiencePorts
 * @property {(subjectRef:string, intent:string)=>{position:number[],target:number[],fov?:number}} framingFor
 * @property {(pose:object, options:{travelMs:number})=>void} playShot
 * @property {(pose:object)=>void} snapTo
 * @property {(authority:string, options:object)=>void} requestAuthority
 * @property {(action:object, context:object)=>any} dispatch
 * @property {()=>{aspect:number, vfov:number}} viewport
 */

export const TRANSPORT = Object.freeze({
  IDLE: 'IDLE',
  PLAYING: 'PLAYING',
  PAUSED: 'PAUSED',
  COMPLETED: 'COMPLETED'
});

export class ExperienceDirector {
  /**
   * @param {{
   *   store: import('../world/world-store.js').WorldStore,
   *   state: import('../world/world-state.js').WorldState,
   *   bus: import('../core/event-bus.js').EventBus,
   *   ports: ExperiencePorts,
   *   reducedMotion?: boolean
   * }} deps
   */
  constructor({ store, state, bus, ports, reducedMotion = false }) {
    this.store = store;
    this.state = state;
    this.bus = bus;
    this.ports = ports;
    this.reducedMotion = reducedMotion;
    /**
     * How unhurried the travel is, as a multiplier on every move's clock.
     *
     * 1 is the authored pace. An author may ask for calmer or brisker; they may
     * not ask for a different destination, and this cannot give them one — the
     * pose is resolved before this is applied.
     */
    this._pacing = 1;

    this.transport = TRANSPORT.IDLE;
    this.routeId = null;
    /** @type {import('../schema/types.js').StoryStep[]} */
    this.steps = [];
    this.index = -1;
    this.stepElapsed = 0;
    /** Pose the visitor was left in before the tour started, when we choose to restore it. */
    this._returnPose = null;
    /** The Space that pose was measured in. Outside it, the pose means nothing. */
    this._returnSpaceId = null;
    /** Canonical numbered tour, grouped from the same step array. */
    this.manifest = null;
    /** Set while a seek is replaying beats, so `update` does not race it. */
    this._seeking = false;
    /** A cross-room Back waiting for its crossing to land. */
    this._pendingReturn = null;
  }

  get currentStep() {
    return this.steps[this.index] || null;
  }

  /* == canonical tour ======================================================= */

  /**
   * The numbered Tour Step the current beat belongs to.
   *
   * "Where am I" is answered at the granularity the visitor perceives, not at
   * the granularity the Director executes. A lead, an accompanied shot and a
   * yield are three beats of one moment, and reporting them as three positions
   * is what turns a guided visit into a slide deck.
   */
  get currentTourStep() {
    const beatId = this.currentStep?.id;
    if (!beatId || !this.manifest) return null;
    const ownerId = this.manifest.beatOwner.get(beatId);
    return this.manifest.steps.find((step) => step.id === ownerId) || null;
  }

  /** 1-based canonical position, or 0 when no route is running. */
  get tourOrder() {
    return this.currentTourStep?.order || 0;
  }

  get tourTotal() {
    return this.manifest?.steps.length || 0;
  }

  /**
   * Go to a canonical Tour Step by its id.
   *
   * Truthful about what it is: **reconstruction, not seek.** The route is an
   * authored forward timeline (Constitution §16 keeps a seekable one as SHOULD
   * LATER), so reaching step 05 means executing beats 1..n with their dwell
   * removed — portals really are traversed, spaces really are built, the guide
   * really walks. Going backwards restarts and replays.
   *
   * It awaits each beat's own pending work rather than sleeping a fixed
   * interval, so it is as fast as the world can actually be rebuilt and it
   * cannot land a shot against geometry that does not exist yet.
   *
   * @param {string} tourStepId
   * @returns {Promise<boolean>} whether the step was reached
   */
  async seekToTourStep(tourStepId) {
    if (!this.manifest) return false;
    const target = this.manifest.steps.find((step) => step.id === tourStepId);
    if (!target) return false;

    const alreadyAhead = this.transport === TRANSPORT.IDLE
      || this.transport === TRANSPORT.COMPLETED
      || this.index > target.firstBeatIndex;
    if (alreadyAhead) {
      this.start(this.routeId || this._lastRouteId, { returnPose: this._returnPose });
    }

    this._seeking = true;
    this.pause();
    try {
      // Bounded by the route's own length: a beat that refuses to advance must
      // not spin here forever.
      for (let guard = 0; guard <= this.steps.length; guard += 1) {
        if (this.index >= target.firstBeatIndex) break;
        await this._advanceAndSettle();
      }
    } finally {
      this._seeking = false;
    }
    this.stepElapsed = 0;
    return this.index === target.firstBeatIndex;
  }

  /**
   * Re-apply the current beat's shot, guide staging and camera authority.
   *
   * Used when something borrowed the camera from inside a beat — Collection
   * Browse — and has to give it back to exactly the composition the visitor
   * left, rather than to a generic explore pose.
   */
  reapplyCurrentShot() {
    const step = this.currentStep;
    if (!step) return false;
    this.ports.requestAuthority(CAMERA_AUTHORITY.DIRECTED, { reason: `route:${this.routeId}:resume` });
    this._applyShot(step);
    return true;
  }

  get pacing() { return this._pacing; }

  /**
   * @param {number} value 0.6 (brisk) … 2 (unhurried).
   *
   * Clamped rather than trusted: a config is data, and a hand-edited 40 would
   * leave a visitor watching a camera crawl with no way out.
   */
  set pacing(value) {
    const n = Number(value);
    this._pacing = Number.isFinite(n) ? Math.min(Math.max(n, 0.6), 2) : 1;
  }

  /**
   * Which transition family carries us from the previous beat to this one.
   *
   * Semantics first. Only the last case consults geometry, and only to separate a
   * neighbouring encounter from a cross-zone one — a distinction the world does not
   * currently declare, so distance stands in as evidence for it until it does.
   */
  _transitionFamily(previous, step) {
    if (!previous) return null;

    // Leaving the room is not a kind of moving around it. A portal beat is the
    // only beat whose destination is somewhere the visitor is not yet standing,
    // and that is a difference in meaning, not in distance.
    if (step.shotIntent === SHOT_INTENT.PORTAL) return TRANSITION.CROSSING;

    // A threshold destination is a threshold approach, whatever the distance.
    if (!step.subjectRef || this.store.kindOf(step.subjectRef) === 'SPACE') {
      return TRANSITION.THRESHOLD;
    }

    const sameSubject = previous.subjectRef === step.subjectRef;
    if (sameSubject) {
      // Inspecting a free-standing piece is the one same-subject move that is
      // about turning the object rather than reframing it.
      //
      // `kindOf` answers the *category* — ENTITY, SPACE — not the entity's own
      // kind, so asking it for 'SCULPTURE' silently never matched and every
      // sculpture beat classified as a micro reframing. The measured family map
      // is what caught it: zero orbits on a route that plainly contains one.
      const entity = this.store.entities.find((e) => e.id === step.subjectRef);
      const inspecting = entity?.kind === 'SCULPTURE'
        && (step.shotIntent === SHOT_INTENT.DETAIL || step.shotIntent === SHOT_INTENT.CONTEMPLATION);
      return inspecting ? TRANSITION.ORBIT : TRANSITION.MICRO;
    }

    // Different subject: neighbouring encounter, or a crossing of the room.
    const from = this.ports.subjectPoint?.(previous.subjectRef);
    const to = this.ports.subjectPoint?.(step.subjectRef);
    if (!from || !to) return TRANSITION.LOCAL;
    const apart = Math.hypot(to[0] - from[0], to[2] - from[2]);
    return apart > 5 ? TRANSITION.TRAVERSE : TRANSITION.LOCAL;
  }

  /** Next canonical Tour Step. Cheap: it is forward, so it just replays beats. */
  async nextTourStep() {
    const next = this.currentTourStep?.nextId;
    return next ? this.seekToTourStep(next) : false;
  }

  /** Previous canonical Tour Step. Restarts and replays — see `seekToTourStep`. */
  async previousTourStep() {
    const previous = this.currentTourStep?.previousId;
    return previous ? this.seekToTourStep(previous) : false;
  }

  /**
   * Advance one beat and wait for whatever that beat had to build.
   *
   * `_advance` fires an Action that may be a Portal traversal; its promise is
   * the only honest signal that the next shot can be framed. Waiting on it is
   * what lets a seek run at machine speed without the fixed sleeps the QA
   * states had to use from outside.
   */
  async _advanceAndSettle() {
    const before = this.index;
    this._advance();
    if (this._pendingStep) {
      try { await this._pendingStep; } catch { /* already reported as ASSET_ERROR */ }
    }
    // Yield so a shot queued in a microtask has landed — as a microtask, not a
    // timer.
    //
    // A timer callback queues behind the render loop, so this line cost whatever
    // one frame costs. Measured on the software rasteriser the QA environment
    // uses: `setTimeout(0)` took 1989.7 ms with the loop running and 4.2 ms with
    // it stopped, which is where ~68 s of a 28-beat seek was going — 99.95% of it,
    // against 33 ms of actual work. A microtask is 0.008 ms and drains exactly
    // what this line is here to drain, because anything queued as a microtask
    // before it runs before the continuation.
    //
    // The seek is no longer coupled to frame time at all, which matters beyond
    // the harness: on any slow frame, in any browser, this was seek latency.
    await Promise.resolve();
    return this.index !== before;
  }

  get progress() {
    if (!this.steps.length || this.index < 0) return 0;
    return (this.index + Math.min(this.stepElapsed / Math.max(this.currentStep?.duration || 1, 0.001), 1)) / this.steps.length;
  }

  /**
   * @param {string} routeId
   * @param {{returnPose?:object}} [options]
   */
  start(routeId, options = {}) {
    const route = this.store.require(routeId);
    this.routeId = routeId;
    this._lastRouteId = routeId;
    this.steps = this.store.routeSteps(routeId);
    if (!this.steps.length) throw new Error(`[IW] route "${routeId}" has no story steps`);
    // Grouped from the very array above, so the numbered tour and the executed
    // timeline cannot be two different sequences.
    this.manifest = buildTourManifest(this.store, routeId);

    this._returnPose = options.returnPose || null;
    // A pose is only meaningful in the Space it was measured in. Remember which
    // one, so exiting can tell "put the visitor back where they were standing"
    // apart from "put the visitor at coordinates that belong to another room".
    this._returnSpaceId = this.state.activeSpaceId;
    this.index = -1;
    this.stepElapsed = 0;
    this.transport = TRANSPORT.PLAYING;

    this.state.setMode(EXPERIENCE_MODE.GUIDED);
    this.state.setRoute(routeId, null);
    this.ports.requestAuthority(CAMERA_AUTHORITY.DIRECTED, { reason: `route:${routeId}` });

    this.bus.emit(EVENTS.ROUTE_STARTED, { routeId, title: route.title, steps: this.steps.length });
    this.bus.emit(EVENTS.EXPERIENCE_STARTED, { routeId });
    this._advance();
    return this;
  }

  pause() {
    if (this.transport !== TRANSPORT.PLAYING) return;
    this.transport = TRANSPORT.PAUSED;
    this.bus.emit(EVENTS.EXPERIENCE_PAUSED, { routeId: this.routeId, stepId: this.currentStep?.id });
  }

  resume() {
    if (this.transport !== TRANSPORT.PAUSED) return;
    this.transport = TRANSPORT.PLAYING;
    this.bus.emit(EVENTS.EXPERIENCE_RESUMED, { routeId: this.routeId, stepId: this.currentStep?.id });
  }

  next() {
    if (this.transport === TRANSPORT.IDLE || this.transport === TRANSPORT.COMPLETED) return;
    this._advance();
  }

  /**
   * The Tour Stop before the one the visitor is on, or null at the first.
   *
   * Deliberately the *stop*, not the beat. A stop is the unit the visitor
   * perceives — an artwork, a room, a moment — and the route reaches each one
   * through several beats they experience as one arrival. Offering "previous
   * beat" would step backwards through machinery nobody was shown.
   */
  get previousTourStepId() {
    return this.currentTourStep?.previousId || null;
  }

  /**
   * The beat that holds a stop's settled contemplation.
   *
   * A stop is a small sequence — the guide leads, accompanies, then withdraws
   * and leaves the visitor with the work. The last of those is the composition
   * the stop exists to deliver, and it is the one whose framing does not depend
   * on where a walking guide happens to be. Preferring it in that order is how
   * the canonical pose is *derived from the approved forward experience* rather
   * than invented: it is the shot the tour already ends each stop on.
   */
  _settleBeat(step) {
    const ORDER = [SHOT_INTENT.CONTEMPLATION, SHOT_INTENT.FOCUS, SHOT_INTENT.ACCOMPANIED,
      SHOT_INTENT.DETAIL, SHOT_INTENT.OVERVIEW];
    const beats = step.beatIds.map((id) => this.steps.find((b) => b.id === id)).filter(Boolean);
    for (const intent of ORDER) {
      const found = [...beats].reverse().find((b) => b.shotIntent === intent);
      if (found) return found;
    }
    return beats[beats.length - 1] || beats[0] || null;
  }

  /**
   * A stop's canonical settled pose — single-valued, by contract.
   *
   * Resolved from the settle beat's own framing, which takes a subject and an
   * intent and nothing else. That is what makes it deterministic: two visits
   * cannot disagree, because nothing about the journey is an input.
   *
   * The measured problem this replaces: a stop's arrival used to be read from
   * whichever pose the opening LEAD beat resolved to, and LEAD framing derives
   * from where the guide is standing mid-walk. Two ordinary forward arrivals at
   * one stop came out 2.5 m apart. A return can only be as reproducible as the
   * destination it aims at.
   *
   * @returns {{pose:object, beat:object, guide:object|null, visitor:object|null}|null}
   */
  canonicalSettle(stopId) {
    if (!this.manifest) return null;
    const step = this.manifest.steps.find((s) => s.id === stopId);
    if (!step) return null;
    const beat = this._settleBeat(step);
    if (!beat?.subjectRef) return null;
    const pose = this.ports.framingFor(beat.subjectRef, beat.shotIntent, {
      guideAnchorId: beat.guide?.anchorId,
      visitorAnchorId: beat.visitor?.anchorId
    });
    if (!pose) return null;
    return {
      pose,
      beat,
      beatIndex: this.steps.indexOf(beat),
      spaceId: step.spaceId,
      guide: beat.guide ? { ...beat.guide, subjectRef: beat.guide.subjectRef || beat.subjectRef } : null,
      visitor: beat.visitor ? { ...beat.visitor, subjectRef: beat.visitor.subjectRef || beat.subjectRef } : null
    };
  }

  /**
   * Whether going back is possible from here without replaying the route.
   *
   * Same room is always possible once the stop resolves. Another room is
   * possible when the world authors a way back into it — which the Museum does
   * for every CONTINUOUS connection. A one-way TELEPORT is not a doorway a
   * visitor can walk back through, so it does not count.
   */
  get canGoBack() {
    const previousId = this.previousTourStepId;
    if (!previousId) return false;
    const settle = this.canonicalSettle(previousId);
    if (!settle) return false;
    if (settle.spaceId === this.state.activeSpaceId) return true;
    const portals = this.store.portalsOf(this.state.activeSpaceId) || [];
    return portals.some((p) => p.toSpaceId === settle.spaceId
      && p.transitionBehaviour !== 'TELEPORT' && p.transitionBehaviour !== 'CUT');
  }

  /**
   * Return to the previous Tour Stop's canonical settled pose.
   *
   * SEEK AND BACK ARE DIFFERENT THINGS, and this is the second one.
   * `seekToTourStep` recovers a destination deterministically by replaying the
   * route from its start, which is right for tooling and wrong for a visitor:
   * measured, going back one stop inside a single room replayed seven beats,
   * re-crossed the lobby portal and re-entered the room the visitor was already
   * standing in. The endpoint was correct every time; the experience was a
   * restarted tour.
   *
   * So this does not travel through the route. It resolves the target stop's
   * canonical settled pose — the same composition the forward tour settles that
   * stop on — stages the guide as that beat authors it, and flies there on a
   * LOCAL family. The route index lands on the settle beat, so SIGUIENTE
   * continues to the next stop exactly as it would have.
   *
   *   FORWARD SETTLE = BACK RETURN
   *
   * It returns false rather than guessing when the previous stop is in another
   * room. A cross-room return has a doorway in it and is a different move.
   *
   * @returns {boolean} whether the return was performed
   */
  back() {
    if (!this.manifest || this.transport === TRANSPORT.IDLE) return false;
    const previousId = this.previousTourStepId;
    if (!previousId) return false;
    const settle = this.canonicalSettle(previousId);
    if (!settle) return false;
    if (settle.spaceId !== this.state.activeSpaceId) {
      return this._returnAcrossRooms(previousId, settle);
    }
    return this._returnToSettle(previousId, settle);
  }

  /**
   * Go back to a stop in another room, through the doorway.
   *
   * The world already authors the return portal — every CONTINUOUS connection in
   * the Museum has its counterpart, `portal.gallery-b-gallery-a` beside
   * `portal.gallery-a-gallery-b` — so a reverse crossing is not a new visual
   * behaviour to invent. It is the approved T6 crossing, run on the portal that
   * already points the other way.
   *
   * That is what keeps the human-preferred forward baseline safe: the forward
   * crossing's portal record, threshold, shader treatment and endpoint are not
   * touched, read or reconfigured here. This traverses a different portal, which
   * has always had its own threshold, and the forward path cannot regress
   * because nothing on it is involved.
   *
   * The crossing resolves as soon as it is in flight rather than when it lands,
   * so the settled composition cannot be applied inline — writing the camera
   * mid-crossing would be a second authority for the same frames. The stop is
   * remembered instead and applied by `update` on the frame the crossing gives
   * the camera back.
   */
  _returnAcrossRooms(stopId, settle) {
    const portals = this.store.portalsOf(this.state.activeSpaceId) || [];
    const back = portals.find((p) => p.toSpaceId === settle.spaceId
      && p.transitionBehaviour !== 'TELEPORT' && p.transitionBehaviour !== 'CUT');
    if (!back) return false;

    const shape = TRANSITION_SHAPE[TRANSITION.CROSSING];
    this._pendingReturn = { stopId, settle };
    this.ports.dispatch(
      { type: ACTION.ACTIVATE_PORTAL, target: back.id },
      {
        source: 'EXPERIENCE',
        sourceId: `${this.routeId}:back`,
        crossing: { family: TRANSITION.CROSSING, ...shape }
      }
    );
    this.bus.emit(EVENTS.ROUTE_STEP, {
      routeId: this.routeId, stepId: settle.beat.id, index: this.steps.indexOf(settle.beat),
      total: this.steps.length, caption: settle.beat.caption, direction: 'BACK'
    });
    return true;
  }

  /**
   * Put the beat's subject into World State, which is what the label card reads.
   *
   *   ACTIVE TOUR STOP → ACTIVE ENTITY → LABEL CARD
   *
   * The forward path established this on beat entry and the return path did not,
   * so going back moved the camera, the stop and the counter correctly while the
   * label kept describing the work the visitor had just left — across a room
   * boundary, a work in the other gallery. The return was exact to four decimal
   * places and still told the visitor the wrong thing.
   *
   * The fix is this one function called from both paths rather than a copy of
   * the dispatch inside `_returnToSettle`: a second copy is how the two sides
   * drift apart again the next time focus semantics change.
   *
   * A settle beat whose subject is not a work — an OVERVIEW of the room, say —
   * releases focus instead of leaving the previous card up. A stop with no work
   * to name should show no label, not the last one that happened to be on
   * screen.
   */
  _focusSubject(step) {
    const ref = step?.subjectRef;
    if (ref && this.store.kindOf(ref) === 'ENTITY') {
      this.ports.dispatch(
        { type: ACTION.FOCUS_ENTITY, target: ref, params: { camera: false } },
        { source: 'EXPERIENCE', sourceId: step.id }
      );
      return true;
    }
    return false;
  }

  /** Fly to a stop's settled composition and leave the route ready to continue. */
  _returnToSettle(stopId, settle) {
    this.index = settle.beatIndex >= 0 ? settle.beatIndex : this.index;
    this.stepElapsed = 0;
    const beat = settle.beat;
    this.state.setRoute(this.routeId, beat.id);
    this.bus.emit(EVENTS.ROUTE_STEP, {
      routeId: this.routeId, stepId: beat.id, index: this.index,
      total: this.steps.length, caption: beat.caption, direction: 'BACK'
    });

    // The settled composition includes who is standing in it. A contemplation
    // beat authors no guide, so the guide is dismissed rather than left over
    // from wherever the visitor came from.
    this.ports.stageGuide?.(settle.guide);
    this.ports.stageVisitor?.(settle.visitor);

    // …and it includes what the visitor is looking at. Same rule as the guide:
    // the composition is restored whole, not partly.
    if (!this._focusSubject(beat)) {
      this.ports.dispatch({ type: ACTION.RELEASE_FOCUS }, { source: 'EXPERIENCE', sourceId: beat.id });
    }

    this.ports.requestAuthority(CAMERA_AUTHORITY.DIRECTED, { reason: `route:${this.routeId}:back` });
    const shape = TRANSITION_SHAPE[TRANSITION.LOCAL];
    const from = this.ports.currentPose?.();
    let travelMs = shape.max;
    if (from) {
      const d = Math.hypot(
        settle.pose.position[0] - from.position[0],
        settle.pose.position[2] - from.position[2]
      );
      travelMs = Math.min(Math.max((d / shape.speed) * 1000, shape.min), shape.max);
    }
    // Pacing scales the clock and nothing else, exactly as going forwards.
    travelMs = Math.round(travelMs * this.pacing);
    this.ports.playShot(settle.pose, {
      travelMs, flat: shape.flat, lead: shape.lead, holdHeight: shape.holdHeight
    });
    this._lastTransition = TRANSITION.LOCAL;
    this.bus.emit(EVENTS.SHOT_STARTED, {
      stepId: beat.id, intent: beat.shotIntent, transition: TRANSITION.LOCAL, direction: 'BACK'
    });
    return true;
  }

  /**
   * Leave guided mode and give the camera back to the visitor.
   *
   * Constitution §14 rule 4: a directed sequence may not corrupt the Explore
   * pose *unless the experience explicitly chooses a new one*. Exiting early
   * restores where the visitor was standing; finishing the tour deliberately
   * leaves them where the tour ended.
   *
   * That restore is only valid while the visitor is still in the room the pose
   * was taken in. A route that walks them from the lobby into a gallery and is
   * then left — by pressing Escape, or by the handoff at the end of an
   * accompanied beat — was placing them at lobby coordinates inside Gallery A,
   * which put the camera in the middle of a wall and rendered black. Crossing a
   * Portal invalidates the return pose, and the right place to leave someone is
   * then exactly where the last shot left them: looking at the thing they were
   * being shown. That is the handoff, not a fallback.
   */
  exit({ restorePose = true, reason = 'exit' } = {}) {
    if (this.transport === TRANSPORT.IDLE) return;
    const completed = this.transport === TRANSPORT.COMPLETED;
    this.transport = TRANSPORT.IDLE;

    this.state.setMode(EXPERIENCE_MODE.EXPLORE);
    this.state.setRoute(null, null);
    this.state.setFocus(null);
    // The guide belongs to the guided experience. Leaving one standing in a
    // room the visitor is now exploring alone would be a bystander, not a host.
    this.ports.stageGuide?.(null);

    const returnPoseIsHere = this._returnSpaceId === this.state.activeSpaceId;
    if (restorePose && this._returnPose && returnPoseIsHere) {
      this.ports.requestAuthority(CAMERA_AUTHORITY.EXPLORE, {
        reason: `route:${reason}`,
        durationMs: this.reducedMotion ? 0 : 900,
        endPose: this._returnPose,
        restore: 'ADOPT_INCOMING'
      });
    } else {
      this.ports.requestAuthority(CAMERA_AUTHORITY.EXPLORE, {
        reason: `route:${reason}`,
        restore: 'ADOPT_INCOMING'
      });
    }

    this.bus.emit(EVENTS.EXPERIENCE_COMPLETED, { routeId: this.routeId, completed });
    this.routeId = null;
    this.steps = [];
    this.index = -1;
    this._returnPose = null;
    this._returnSpaceId = null;
  }

  /**
   * @param {number} dt seconds
   *
   * A lead ends when the guide arrives, not when a number runs out.
   *
   * Its authored duration is a floor, because the walk it covers depends on how
   * far the next stop is — and the composition that follows assumes she is
   * standing at it. Advancing on the clock alone started the accompanied shot
   * while she was still crossing the room, so the visitor was shown a
   * "someone is presenting this to you" framing with nobody in it, and then a
   * yield framing with her head still crossing the artwork. Waiting for the
   * arrival is what makes the grammar repeatable rather than lucky.
   *
   * The wait is bounded: if a guide can never arrive — no representation, an
   * unreachable anchor — the route must not stall, so past twice the authored
   * duration the step advances regardless.
   */
  update(dt) {
    // A cross-room Back is two moves: the doorway, then the composition on the
    // other side of it. The second cannot start until the crossing has given the
    // camera back, so it waits here rather than racing the transition.
    if (this._pendingReturn && !this.ports.crossingActive?.()) {
      const { stopId, settle } = this._pendingReturn;
      this._pendingReturn = null;
      if (this.state.activeSpaceId === settle.spaceId) {
        this._returnToSettle(stopId, settle);
      }
    }

    if (this._seeking) return;
    if (this.transport !== TRANSPORT.PLAYING) return;
    const step = this.currentStep;
    if (!step) return;
    this.stepElapsed += dt;
    if (this.stepElapsed < step.duration) return;

    if (this.stepElapsed < step.duration * 2) {
      if (this._waitsForGuide(step) && this.ports.guideSettled && !this.ports.guideSettled()) return;
      // Same discipline, same bound, one room further out: a crossing ends when
      // the visitor is through the door, not when a number runs out. Advancing on
      // the clock alone would cut the move off mid-doorway and hand the next beat
      // a camera standing inside a wall.
      if (this._waitsForCrossing(step) && this.ports.crossingActive?.()) return;
    }
    this._advance();
  }

  /** A step whose next composition depends on the guide having got there. */
  _waitsForGuide(step) {
    return step.shotIntent === SHOT_INTENT.LEAD && Boolean(step.guide);
  }

  /** A step that is still flying the visitor into the next room. */
  _waitsForCrossing(step) {
    return step.shotIntent === SHOT_INTENT.PORTAL;
  }

  _advance() {
    const previous = this.currentStep;
    if (previous) this.bus.emit(EVENTS.SHOT_COMPLETED, { stepId: previous.id });

    this.index += 1;
    this.stepElapsed = 0;

    if (this.index >= this.steps.length) {
      this.transport = TRANSPORT.COMPLETED;
      this.bus.emit(EVENTS.ROUTE_COMPLETED, { routeId: this.routeId });
      // Finishing is an explicit choice to leave the visitor where the tour ended.
      this.exit({ restorePose: false, reason: 'completed' });
      return;
    }

    const step = this.steps[this.index];
    this.state.setRoute(this.routeId, step.id);
    this.bus.emit(EVENTS.ROUTE_STEP, {
      routeId: this.routeId,
      stepId: step.id,
      index: this.index,
      total: this.steps.length,
      caption: step.caption
    });

    // A step may change the world — enter a space, focus a work — and it does so
    // through the same Action vocabulary an Explore hotspot would use.
    let pending = null;
    if (step.action) {
      // A portal action is the one action whose *camera* consequence the Director
      // has to decide up front, because the room handoff happens in the middle of
      // the move rather than before it. So the intent travels with the action:
      // the Director says this is a crossing and what character it has, the
      // runtime executes it, and the Scene Kit is asked only where the hole in
      // the wall is.
      pending = this.ports.dispatch(step.action, {
        source: 'EXPERIENCE',
        sourceId: step.id,
        crossing: this._crossingIntent(previous, step)
      });
    } else if (step.subjectRef && this.store.kindOf(step.subjectRef) === 'ENTITY') {
      // A shot about a work is also a focus of that work: Guided and Explore
      // leave the same trace in World State.
      this._focusSubject(step);
    }

    // Entering a Space is asynchronous — it may have to build and warm. The shot
    // cannot be framed against geometry that does not exist yet, so a step whose
    // action returns a promise waits for it.
    if (pending && typeof pending.then === 'function') {
      // Kept on the instance so a seek can await exactly this beat's work instead
      // of guessing at it with a timer.
      this._pendingStep = pending.then((result) => this._applyShot(step, result)).catch((error) => {
        this.bus.emit(EVENTS.ASSET_ERROR, { stepId: step.id, message: String(error?.message || error) });
      });
    } else {
      this._pendingStep = null;
      this._applyShot(step, pending);
    }
  }

  /**
   * The crossing this portal beat is, if it is one.
   *
   * Character only. Duration is left to be derived from the distance the camera
   * actually has to cover, which is not knowable here — the destination room may
   * not be built yet.
   */
  _crossingIntent(previous, step) {
    if (step.shotIntent !== SHOT_INTENT.PORTAL) return null;
    if (this._transitionFamily(previous, step) !== TRANSITION.CROSSING) return null;
    // A crossing is something the visitor watches. A seek is not watching it.
    //
    // Reconstructing a late state — a direct jump, a QA state, an authoring
    // preview — passed through both portal beats and started a full crossing at
    // each, in real time, for nobody. The endpoint is identical either way, so
    // skipping the travel changes where the camera goes exactly not at all; it
    // only stops paying for a journey with no passenger.
    //
    // This is the playback/reconstruction split: the same beats, the same
    // destinations, and choreography only on the path where choreography is the
    // point.
    if (this._seeking) return null;
    // A crossing may not outrun the beat that contains it. The beat waits for the
    // move the way a lead waits for the guide, but that wait is bounded, so the
    // move has to fit inside the bound rather than rely on it.
    const budget = Math.max(step.duration || 3, 1) * 2000 * 0.85;
    const shape = TRANSITION_SHAPE[TRANSITION.CROSSING];
    return { family: TRANSITION.CROSSING, ...shape, max: Math.min(shape.max, budget) };
  }

  _applyShot(step, actionResult = null) {
    // The visitor may have skipped or exited while a Space was loading.
    if (this.currentStep?.id !== step.id) return;

    // A step may be accompanied. The guide is staged before the shot is
    // measured, because the composition is derived from where the guide stands
    // — and dismissed on any step that does not ask for one, so a guide never
    // lingers into a beat that was authored without them.
    this.ports.stageGuide?.(step.guide ? { ...step.guide, subjectRef: step.guide.subjectRef || step.subjectRef } : null);
    // The visitor figure is authored exactly like the guide and dismissed on any
    // beat that does not ask for one — which is what keeps Beat D empty of people
    // without a special case for it.
    this.ports.stageVisitor?.(step.visitor ? { ...step.visitor, subjectRef: step.visitor.subjectRef || step.subjectRef } : null);

    const pose = step.subjectRef
      ? this.ports.framingFor(step.subjectRef, step.shotIntent, {
        guideAnchorId: step.guide?.anchorId,
        visitorAnchorId: step.visitor?.anchorId
      })
      : null;
    if (pose) {
      // WHY: the family comes from what this move means. HOW: its shape. WHERE:
      // the Scene Kit says whether the straight line is walkable and, if not,
      // hands back a point to bend it through. It is never asked what the move is.
      const family = this._transitionFamily(this.steps[this.index - 1] || null, step);
      const shape = family ? TRANSITION_SHAPE[family] : null;
      const previousPose = this.ports.currentPose?.();

      let travelMs = travelForIntent(step.shotIntent, step.duration);
      if (shape && previousPose) {
        // Distance sets duration; the family sets the character. A lead is the
        // exception: its travel is the guide's walk, and the two must still arrive
        // together.
        if (shape.speed && step.shotIntent !== SHOT_INTENT.LEAD) {
          const d = Math.hypot(
            pose.position[0] - previousPose.position[0],
            pose.position[2] - previousPose.position[2]
          );
          travelMs = Math.min(Math.max((d / shape.speed) * 1000, shape.min), shape.max);
        } else if (!shape.speed) {
          travelMs = Math.min(Math.max(travelMs, shape.min), shape.max);
        }
      }

      // Pacing is the one thing an author may tune about a move, and it is safe
      // to expose precisely because it lands here: `pose` was resolved above and
      // is not touched. Transitions may change HOW the camera travels, never
      // WHERE the approved beat ends — so this scales the clock and nothing else.
      travelMs = Math.round(travelMs * this.pacing);

      let via = null;
      if (shape?.waypoint && previousPose) {
        via = this.ports.pathWaypoint?.(previousPose.position, pose.position, {
          family, subjectRef: step.subjectRef
        }) || null;
      }

      this.bus.emit(EVENTS.SHOT_STARTED, { stepId: step.id, intent: step.shotIntent, transition: family });
      if (actionResult?.cameraHandled) {
        // The crossing owns the camera until it lands, and it lands on this same
        // pose. Writing here would be a second authority for the same beat.
      } else if (step.shotIntent === SHOT_INTENT.PORTAL || travelMs === 0) this.ports.snapTo(pose);
      else {
        this.ports.playShot(pose, {
          travelMs,
          flat: shape?.flat ?? 0,
          lead: shape?.lead ?? 0,
          holdHeight: shape?.holdHeight ?? false,
          via
        });
      }
      this._lastTransition = family;
    }

    if (step.narrationCue) {
      this.bus.emit(EVENTS.NARRATION_CUE, { cue: step.narrationCue, caption: step.caption, stepId: step.id });
    }
    if (step.audioCue) {
      this.bus.emit(EVENTS.AUDIO_CUE, { cue: step.audioCue, stepId: step.id });
    }
  }

  report() {
    return {
      transport: this.transport,
      routeId: this.routeId,
      stepId: this.currentStep?.id || null,
      index: this.index,
      total: this.steps.length,
      progress: Number(this.progress.toFixed(3)),
      tourStepId: this.currentTourStep?.id || null,
      tourOrder: this.tourOrder,
      tourTotal: this.tourTotal
    };
  }
}

/**
 * Travel time in milliseconds, derived from the shot's intent and the step's own
 * duration — a detail shot arrives quickly and dwells, an overview drifts.
 * The camera never spends the whole step travelling.
 */
/**
 * Transition families.
 *
 * The family expresses what the move *means*, so it is chosen from the relationship
 * between two beats — same subject, an inspection of a free-standing piece, a
 * destination threshold — and not from how far apart they happen to be. Geometry
 * then decides how that intent is executed: duration, curve, waypoint.
 *
 * Distance is evidence and tie-breaker, never the meaning. A short hop between two
 * zones is still a traverse.
 */
export const TRANSITION = Object.freeze({
  MICRO: 'T1_MICRO_REFRAMING',
  LOCAL: 'T2_LOCAL_WALK',
  TRAVERSE: 'T3_GALLERY_TRAVERSE',
  ORBIT: 'T4_OBJECT_ORBIT',
  THRESHOLD: 'T5_THRESHOLD_APPROACH',
  // The one relationship the in-room families cannot express: the next beat is
  // in a different room. Block 2A stopped at the threshold on purpose and
  // recorded that portals were still cuts; this is that limitation closed.
  CROSSING: 'T6_ROOM_CROSSING'
});

/** Shaping per family. Distance scales duration; these set the character. */
const TRANSITION_SHAPE = {
  [TRANSITION.MICRO]: { flat: 0.0, lead: 0.0, holdHeight: false, waypoint: false, speed: null, min: 420, max: 1400 },
  [TRANSITION.LOCAL]: { flat: 0.45, lead: 0.18, holdHeight: false, waypoint: true, speed: 1.4, min: 900, max: 3200 },
  [TRANSITION.TRAVERSE]: { flat: 0.7, lead: 0.4, holdHeight: true, waypoint: true, speed: 1.6, min: 1600, max: 5200 },
  [TRANSITION.ORBIT]: { flat: 0.35, lead: 0.0, holdHeight: false, waypoint: true, speed: 1.1, min: 1100, max: 3000 },
  [TRANSITION.THRESHOLD]: { flat: 0.55, lead: 0.5, holdHeight: true, waypoint: true, speed: 1.4, min: 1400, max: 4200 },
  // Slower than a gallery traverse. You do not stride through a doorway you are
  // being shown; the pace is the point, and it is also what gives the eye time
  // to adapt to a room lit for light-sensitive work.
  [TRANSITION.CROSSING]: {
    flat: 0.62, lead: 0.42, holdHeight: true, waypoint: false, speed: 1.35, min: 2000, max: 5000,
    // Degrees of fov breath at the aperture, and how hard the look is held
    // through it. Both vanish before the move ends, so neither can shift the
    // pose the beat was authored to land on.
    apertureFov: 2.5, pin: 0.55,
    // Two thirds of the exit spent facing the threshold just crossed. This is
    // the source's strongest signature and the one the first Museum crossing
    // was missing entirely: it emerged into the destination looking away, so
    // the visitor never saw what they had come through.
    recoil: 0.62
  }
};

function travelForIntent(intent, duration) {
  const seconds = Math.max(duration || 4, 1);
  switch (intent) {
    case SHOT_INTENT.PORTAL: return 0;
    case SHOT_INTENT.DETAIL: return Math.min(seconds * 450, 1800);
    case SHOT_INTENT.FOCUS: return Math.min(seconds * 550, 2600);
    // Slower than a focus move and never hurried: this shot is the moment the
    // visitor is walked up to something, and it should feel like being walked.
    case SHOT_INTENT.ACCOMPANIED: return Math.min(seconds * 700, 3400);
    // A lead is a walk. Its duration is the walk's duration, so the camera and
    // the guide arrive together instead of one waiting for the other.
    case SHOT_INTENT.LEAD: return Math.min(seconds * 950, 7000);
    // Contemplation should arrive slowly and then hold still.
    case SHOT_INTENT.CONTEMPLATION: return Math.min(seconds * 620, 3000);
    case SHOT_INTENT.ENTRY:
    case SHOT_INTENT.OVERVIEW: return Math.min(seconds * 600, 3200);
    default: return Math.min(seconds * 500, 2400);
  }
}
