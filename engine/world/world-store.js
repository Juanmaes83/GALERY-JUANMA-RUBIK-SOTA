/**
 * Immersive Worlds — World Store
 *
 * The canonical record holder (IW-DEC-018). Every semantic object in a World
 * lives here exactly once; every other subsystem holds an ID and asks the store.
 *
 * The store guarantees *object identity*: `store.get(id)` returns the same
 * object every time, so "two copies of the same artwork drifting apart" is not
 * a bug that can occur — there is only ever one object.
 *
 * IW-OPEN-008 left the storage mechanism open. We use Maps keyed by ID because
 * the access pattern is overwhelmingly "resolve this reference", and because it
 * makes the uniqueness invariant enforceable at insert time.
 *
 * No Three.js. No DOM.
 */

import { RECORD } from '../schema/types.js';
import { validateWorld } from '../schema/validate.js';

export class WorldStore {
  /** @param {import('../schema/types.js').World} world */
  constructor(world) {
    const report = validateWorld(world);
    if (!report.ok) {
      const error = new Error(`[IW] World "${world?.id}" failed validation:\n  ${report.errors.join('\n  ')}`);
      error.report = report;
      throw error;
    }

    this.id = world.id;
    this.title = world.title;
    this.schemaVersion = world.schemaVersion;
    this.sceneKit = world.sceneKit;
    this.startSpaceId = world.startSpaceId;
    this.metadata = world.metadata || {};
    this.validation = report;

    /** @type {Map<string, {record:object, kind:string}>} the single index of truth */
    this._byId = new Map();
    this._byKind = new Map(Object.values(RECORD).map((kind) => [kind, new Map()]));

    this._ingest(RECORD.SPACE, world.spaces);
    this._ingest(RECORD.ANCHOR, world.anchors);
    this._ingest(RECORD.ENTITY, world.entities);
    this._ingest(RECORD.HOTSPOT, world.hotspots);
    this._ingest(RECORD.PORTAL, world.portals);
    this._ingest(RECORD.CHAPTER, world.chapters);
    this._ingest(RECORD.STORY_STEP, world.storySteps);
    this._ingest(RECORD.ROUTE, world.routes);

    Object.freeze(this._byKind);
  }

  _ingest(kind, list = []) {
    const map = this._byKind.get(kind);
    for (const record of list) {
      if (this._byId.has(record.id)) {
        throw new Error(`[IW] duplicate canonical record "${record.id}"`);
      }
      this._byId.set(record.id, { record, kind });
      map.set(record.id, record);
    }
  }

  /** @returns {object|undefined} the canonical record, by identity */
  get(id) {
    return this._byId.get(id)?.record;
  }

  kindOf(id) {
    return this._byId.get(id)?.kind;
  }

  has(id) {
    return this._byId.has(id);
  }

  /** @returns {object} the canonical record, or throws — use where a miss is a bug */
  require(id, expectedKind) {
    const hit = this._byId.get(id);
    if (!hit) throw new Error(`[IW] no canonical record for id "${id}"`);
    if (expectedKind && hit.kind !== expectedKind) {
      throw new Error(`[IW] "${id}" is a ${hit.kind}, expected ${expectedKind}`);
    }
    return hit.record;
  }

  all(kind) {
    return [...this._byKind.get(kind).values()];
  }

  get spaces() { return this.all(RECORD.SPACE); }
  get entities() { return this.all(RECORD.ENTITY); }
  get anchors() { return this.all(RECORD.ANCHOR); }
  get hotspots() { return this.all(RECORD.HOTSPOT); }
  get portals() { return this.all(RECORD.PORTAL); }
  get routes() { return this.all(RECORD.ROUTE); }
  get chapters() { return this.all(RECORD.CHAPTER); }
  get storySteps() { return this.all(RECORD.STORY_STEP); }

  // -- resolved views ---------------------------------------------------------
  // These return the canonical objects themselves, never clones, so a caller
  // cannot accidentally build a second version of an entity.

  /** @returns {import('../schema/types.js').Entity[]} */
  entitiesOf(spaceId) {
    return (this.require(spaceId, RECORD.SPACE).entityRefs || []).map((id) => this.require(id, RECORD.ENTITY));
  }

  /** @returns {import('../schema/types.js').Anchor[]} */
  anchorsOf(spaceId) {
    return (this.require(spaceId, RECORD.SPACE).anchorRefs || []).map((id) => this.require(id, RECORD.ANCHOR));
  }

  /** @returns {import('../schema/types.js').Hotspot[]} */
  hotspotsOf(spaceId) {
    return (this.require(spaceId, RECORD.SPACE).hotspotRefs || []).map((id) => this.require(id, RECORD.HOTSPOT));
  }

  /** @returns {import('../schema/types.js').Portal[]} */
  portalsOf(spaceId) {
    return (this.require(spaceId, RECORD.SPACE).portalRefs || []).map((id) => this.require(id, RECORD.PORTAL));
  }

  /** @returns {import('../schema/types.js').Anchor} */
  anchorFor(entityId) {
    return this.require(this.require(entityId, RECORD.ENTITY).anchorId, RECORD.ANCHOR);
  }

  /** Story steps of a chapter, in authored order. */
  stepsOf(chapterId) {
    return (this.require(chapterId, RECORD.CHAPTER).stepRefs || []).map((id) => this.require(id, RECORD.STORY_STEP));
  }

  /** Flattened, ordered steps of a route across its chapters. */
  routeSteps(routeId) {
    const route = this.require(routeId, RECORD.ROUTE);
    return (route.chapterRefs || []).flatMap((chapterId) => this.stepsOf(chapterId));
  }

  /**
   * Apply an authored edit to a canonical record. The thin authoring layer goes
   * through here rather than mutating records directly, so every change has one
   * door and can be observed.
   *
   * @param {string} id
   * @param {(record:object)=>void} mutate
   */
  edit(id, mutate) {
    const record = this.require(id);
    mutate(record);
    this._revision = (this._revision || 0) + 1;
    return record;
  }

  get revision() {
    return this._revision || 0;
  }

  /** Diagnostic: proves each ID maps to exactly one record. */
  auditCanonicalIdentity() {
    const seen = new Map();
    const violations = [];
    for (const [id, { record, kind }] of this._byId) {
      if (seen.has(record)) {
        violations.push(`record object shared by ids "${seen.get(record)}" and "${id}"`);
      }
      seen.set(record, id);
      const inKind = this._byKind.get(kind).get(id);
      if (inKind !== record) violations.push(`kind index disagrees for "${id}"`);
    }
    return { ok: violations.length === 0, violations, total: this._byId.size };
  }
}
