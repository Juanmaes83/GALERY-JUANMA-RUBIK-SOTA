/**
 * Immersive Worlds — Scene Kit contract
 *
 * This file is the whole boundary between the engine and anything visual.
 *
 *   SCENE KIT  ≠  WORLD ENGINE
 *
 * The engine knows Spaces, Entities, Anchors, Portals and Actions. It does not
 * know what any of them look like. A Scene Kit turns those semantics into a
 * particular visual and spatial language — museum, showroom, real estate — and
 * it is the *only* layer permitted to import a rendering library.
 *
 * A Scene Kit may own: representations, materials, lighting profiles,
 * environment treatment, placement helpers, transition realizations.
 * A Scene Kit may not own: World State, canonical identity, route semantics,
 * Experience orchestration, camera authority.  (Constitution §18, IW-ADR-008)
 *
 * Everything the engine gives a Scene Kit is a semantic record. Everything a
 * Scene Kit gives back is either an opaque handle or a *measurement*
 * (bounds, focus pose) — never a scene object.
 *
 * This file itself contains no Three.js: it is the contract, not an implementation.
 */

/**
 * @typedef {Object} SpaceHandle
 * Opaque, Scene-Kit-owned object representing a built Space. The engine stores
 * it and hands it back; it never inspects it.
 */

/**
 * @typedef {Object} Framing
 * A measurement returned by the Scene Kit so the camera can frame a subject
 * without knowing anything about geometry.
 * @property {[number,number,number]} position   where the camera should sit
 * @property {[number,number,number]} target     what it should look at
 * @property {[number,number,number]} subjectSize semantic extent used, metres
 */

/**
 * @typedef {Object} SceneKitContext
 * @property {import('../world/world-store.js').WorldStore} store
 * @property {import('../core/device-tier.js').QualityPolicy} quality
 * @property {import('../core/rng.js').DeterministicRNG} rng
 * @property {import('../core/event-bus.js').EventBus} bus
 * @property {(ms:number)=>boolean} hasBudget  cooperative time budget for warmup work
 */

/**
 * The methods a Scene Kit must implement. Documented as a base class so the
 * contract is executable: a kit that forgets a method fails loudly, at startup,
 * rather than silently at frame 4000.
 */
export class SceneKit {
  /** @param {string} name */
  constructor(name) {
    this.name = name;
  }

  /* -- lifecycle ----------------------------------------------------------- */

  /**
   * Build the representation of a Space. Called during PRELOADING.
   * @param {import('../schema/types.js').Space} _space
   * @param {SceneKitContext} _ctx
   * @returns {Promise<SpaceHandle>}
   */
  async buildSpace(_space, _ctx) { throw notImplemented('buildSpace'); }

  /**
   * Do the expensive one-time work — shader compilation, texture upload —
   * before the Space is shown. Called during WARMING.
   * @param {SpaceHandle} _handle
   * @param {SceneKitContext} _ctx
   * @returns {Promise<void>}
   */
  async warmSpace(_handle, _ctx) { throw notImplemented('warmSpace'); }

  /** Make a warmed Space visible/current. Called on ACTIVE. */
  activateSpace(_handle) { throw notImplemented('activateSpace'); }

  /** Hide a Space without destroying it. Called on COOLING. */
  deactivateSpace(_handle) { throw notImplemented('deactivateSpace'); }

  /**
   * How present a non-active Space should be, decided by the lifecycle from the
   * World Graph: a Space reachable through a continuous Portal can be seen into
   * from the doorway, one reachable only by teleport cannot.
   * @param {SpaceHandle} _handle
   * @param {'ACTIVE'|'ADJACENT'|'HIDDEN'} _presence
   */
  setSpacePresence(_handle, _presence) {}

  /**
   * Optional: open the Space up for editing — an author needs to look down into
   * a room that a visitor only ever sees from inside. What "open" means is the
   * kit's decision.
   * @param {SpaceHandle} _handle
   * @param {boolean} _enabled
   */
  setCutaway(_handle, _enabled) {}

  /** Release every GPU and audio resource this Space owns. Called on DISPOSED. */
  disposeSpace(_handle) { throw notImplemented('disposeSpace'); }

  /* -- measurement --------------------------------------------------------- */

  /**
   * Where should a camera stand to inspect this entity, on this viewport?
   * The Scene Kit answers because only it knows the realized geometry; the
   * camera system consumes the answer without knowing what a mesh is.
   * @param {string} _entityId
   * @param {{aspect:number, vfov:number}} _viewport
   * @returns {Framing}
   */
  framingForEntity(_entityId, _viewport) { throw notImplemented('framingForEntity'); }

  /**
   * Framing for a whole Space (overview / entry shots).
   * @param {string} _spaceId
   * @param {{aspect:number, vfov:number, intent:string}} _viewport
   * @returns {Framing}
   */
  framingForSpace(_spaceId, _viewport) { throw notImplemented('framingForSpace'); }

  /**
   * Resolve a semantic Anchor to a world pose. Anchors are authored in Space
   * coordinates; the Scene Kit knows where it placed the Space.
   * @param {string} _anchorId
   * @returns {{position:[number,number,number], normal:[number,number,number]}}
   */
  poseForAnchor(_anchorId) { throw notImplemented('poseForAnchor'); }

  /**
   * The volume a visitor may walk in, expressed as plain numbers so the
   * navigation controller stays free of geometry.
   * @param {string} _spaceId
   * @returns {{bounds:{min:number[],max:number[]}, blockers:{min:number[],max:number[]}[]}}
   */
  navigationVolume(_spaceId) { throw notImplemented('navigationVolume'); }

  /* -- presentation state -------------------------------------------------- */

  /**
   * Reflect a semantic hotspot state change (AVAILABLE → NEAR → ACTIVE …).
   * Whether that means a marker, a light change, or nothing at all is the
   * Scene Kit's decision — the engine only reports semantics.
   */
  setHotspotState(_hotspotId, _state) {}

  /** Reflect focus entering/leaving an entity. */
  setEntityFocused(_entityId, _focused) {}

  /**
   * Whether a staged guide has finished travelling. A kit with no guide says
   * yes, so nothing ever waits on a representation it does not have.
   */
  guideSettled() { return true; }

  /**
   * Where the guide is standing and what it is attending to, or `null` for no
   * guide at all.
   *
   * The engine says only that a guided step is being accompanied from a given
   * Anchor. Whether a guide is represented, what it looks like, and how it
   * moves between stagings is entirely the Scene Kit's business — a kit with no
   * notion of a guide ignores this and loses nothing.
   *
   * This is presentation, not state: nothing here belongs in World State, and
   * it never writes the camera.
   *
   * @param {{anchorId:string, subjectRef?:string, aside?:boolean}|null} _staging
   */
  /** @param {{anchorId:string, subjectRef?:string}|null} _staging */
  setVisitorStaging(_staging) {}

  /** Optical centre of a subject in world space, or null. */
  subjectPoint(_subjectRef) { return null; }

  /**
   * A point to bend a camera path through, or null when the straight line is
   * passable. Spatial constraint only: the kit is never asked what a move means.
   */
  pathWaypoint(_from, _to, _context) { return null; }

  setGuideStaging(_staging) {}

  /** Apply a new quality policy to already-built representations. */
  applyQuality(_policy) {}

  /** Per-frame representation work. Must not write camera state. */
  update(_dt, _elapsed) {}

  /**
   * Report render cost for performance evidence.
   * @returns {{drawCalls:number, triangles:number, programs:number, textures:number, geometries:number}}
   */
  renderStats() { return { drawCalls: 0, triangles: 0, programs: 0, textures: 0, geometries: 0 }; }
}

/** Fail fast, with the contract named. */
function notImplemented(method) {
  return new Error(`[IW] Scene Kit does not implement required contract method "${method}()"`);
}

/** Startup guard used by the Runtime. */
export function assertSceneKitContract(kit) {
  const required = [
    'buildSpace', 'warmSpace', 'activateSpace', 'deactivateSpace', 'disposeSpace',
    'framingForEntity', 'framingForSpace', 'poseForAnchor', 'navigationVolume'
  ];
  const missing = required.filter((method) => typeof kit?.[method] !== 'function');
  if (missing.length) {
    throw new Error(`[IW] Scene Kit "${kit?.name}" is missing contract methods: ${missing.join(', ')}`);
  }
  return true;
}
