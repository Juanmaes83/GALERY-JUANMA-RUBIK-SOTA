/**
 * Immersive Worlds — World validator
 *
 * The architectural invariants of IW-0 are only real if something enforces them.
 * This validator is that something. It runs before a World is ever handed to a
 * Scene Kit, and it is the assertion the QA suite checks.
 *
 * Invariants enforced:
 *
 *   INV-1  Every record ID is unique across the entire World.
 *          → "one semantic object, one canonical record" (IW-DEC-018)
 *   INV-2  Every reference resolves to a declared record.
 *   INV-3  An Entity belongs to exactly one Space, and that Space lists it once.
 *          → no divergent duplicate ownership
 *   INV-4  A Hotspot may not declare spatial connectivity.
 *          → Hotspot triggers, it does not connect (IW-DEC-019)
 *   INV-5  A Portal may not declare an interaction trigger.
 *          → Portal connects, it does not trigger (IW-DEC-019)
 *   INV-6  No semantic record carries a render-implementation key.
 *          → semantic data ≠ visual representation (IW-DEC-020)
 *   INV-7  Placement is by Anchor reference, never by inline coordinates.
 *          → (IW-DEC-023)
 *   INV-8  A Portal's destination spawn is an Anchor of its destination Space.
 *   INV-9  Every focusable Entity carries an accessibility label.
 *          → accessibility is architecture, not polish (Constitution §22)
 */

import {
  ACTION,
  ANCHOR_KIND,
  ENTITY_KIND,
  FORBIDDEN_RENDER_KEYS,
  HOTSPOT_TYPE,
  MEDIA_KIND,
  REPRESENTATION_HINT,
  SCHEMA_VERSION,
  SHOT_INTENT,
  TRANSITION_BEHAVIOUR
} from './types.js';

/** Fields whose presence on a Hotspot would mean it had absorbed Portal duties. */
const CONNECTIVITY_FIELDS = ['fromSpaceId', 'toSpaceId', 'destinationSpawnId', 'transitionBehaviour'];
/** Fields whose presence on a Portal would mean it had absorbed Hotspot duties. */
const TRIGGER_FIELDS = ['triggerDistance', 'interactionVolume', 'action', 'visualPolicy'];

/**
 * @param {import('./types.js').World} world
 * @returns {{ok:boolean, errors:string[], warnings:string[], counts:Object}}
 */
export function validateWorld(world) {
  const errors = [];
  const warnings = [];

  if (!world || typeof world !== 'object') {
    return { ok: false, errors: ['World is not an object'], warnings, counts: {} };
  }
  if (world.schemaVersion !== SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${SCHEMA_VERSION}, got ${world.schemaVersion}`);
  }

  const collections = {
    spaces: world.spaces || [],
    anchors: world.anchors || [],
    entities: world.entities || [],
    hotspots: world.hotspots || [],
    portals: world.portals || [],
    chapters: world.chapters || [],
    storySteps: world.storySteps || [],
    routes: world.routes || []
  };

  // ---- INV-1 : globally unique IDs -----------------------------------------
  /** @type {Map<string,string>} id -> collection it came from */
  const ids = new Map();
  for (const [name, list] of Object.entries(collections)) {
    for (const record of list) {
      if (!record.id) {
        errors.push(`INV-1 ${name}: a record has no id`);
        continue;
      }
      if (ids.has(record.id)) {
        errors.push(
          `INV-1 duplicate id "${record.id}" (in ${ids.get(record.id)} and ${name}) — ` +
            'one semantic object must have exactly one canonical record'
        );
      }
      ids.set(record.id, name);
    }
  }

  const spaceIds = new Set(collections.spaces.map((s) => s.id));
  const anchorById = new Map(collections.anchors.map((a) => [a.id, a]));
  const entityById = new Map(collections.entities.map((e) => [e.id, e]));
  const hotspotIds = new Set(collections.hotspots.map((h) => h.id));
  const portalIds = new Set(collections.portals.map((p) => p.id));
  const chapterIds = new Set(collections.chapters.map((c) => c.id));
  const stepIds = new Set(collections.storySteps.map((s) => s.id));
  const routeIds = new Set(collections.routes.map((r) => r.id));

  const ref = (value, set, where, what) => {
    if (value === undefined || value === null) return;
    if (!set.has(value)) errors.push(`INV-2 ${where}: unresolved ${what} reference "${value}"`);
  };

  // ---- INV-6 : no render implementation anywhere in semantic data -----------
  for (const [name, list] of Object.entries(collections)) {
    for (const record of list) {
      const found = findForbiddenKey(record);
      if (found) {
        errors.push(
          `INV-6 ${name}/${record.id}: carries render-implementation key "${found}" — ` +
            'visual realization belongs to the Scene Kit, not to semantic data'
        );
      }
    }
  }

  // ---- Spaces ---------------------------------------------------------------
  for (const space of collections.spaces) {
    const where = `space/${space.id}`;
    if (!space.title) warnings.push(`${where}: no title`);
    if (!space.bounds?.size) errors.push(`${where}: bounds.size is required`);
    if (!space.sceneProfile) errors.push(`${where}: sceneProfile is required`);
    ref(space.defaultSpawnAnchorId, new Set(anchorById.keys()), where, 'defaultSpawnAnchor');
    for (const id of space.entityRefs || []) ref(id, new Set(entityById.keys()), where, 'entity');
    for (const id of space.anchorRefs || []) ref(id, new Set(anchorById.keys()), where, 'anchor');
    for (const id of space.hotspotRefs || []) ref(id, hotspotIds, where, 'hotspot');
    for (const id of space.portalRefs || []) ref(id, portalIds, where, 'portal');

    const spawn = anchorById.get(space.defaultSpawnAnchorId);
    if (spawn && spawn.spaceId !== space.id) {
      errors.push(`${where}: defaultSpawnAnchor "${spawn.id}" belongs to space "${spawn.spaceId}"`);
    }
  }
  ref(world.startSpaceId, spaceIds, 'world', 'startSpace');

  // ---- Anchors --------------------------------------------------------------
  for (const anchor of collections.anchors) {
    const where = `anchor/${anchor.id}`;
    ref(anchor.spaceId, spaceIds, where, 'space');
    if (!ANCHOR_KIND[anchor.kind]) errors.push(`${where}: unknown anchor kind "${anchor.kind}"`);
    if (!Array.isArray(anchor.position) || anchor.position.length !== 3) {
      errors.push(`${where}: position must be [x,y,z]`);
    }
  }

  // ---- Entities : INV-3, INV-7, INV-9 --------------------------------------
  /** @type {Map<string,string[]>} entityId -> spaces listing it */
  const ownership = new Map();
  for (const space of collections.spaces) {
    for (const id of space.entityRefs || []) {
      if (!ownership.has(id)) ownership.set(id, []);
      ownership.get(id).push(space.id);
    }
  }
  for (const entity of collections.entities) {
    const where = `entity/${entity.id}`;
    if (!ENTITY_KIND[entity.kind]) errors.push(`${where}: unknown entity kind "${entity.kind}"`);
    ref(entity.spaceId, spaceIds, where, 'space');
    ref(entity.anchorId, new Set(anchorById.keys()), where, 'anchor');

    if (entity.position || entity.transform) {
      errors.push(
        `INV-7 ${where}: inline coordinates are not allowed — reference an Anchor instead`
      );
    }

    const anchor = anchorById.get(entity.anchorId);
    if (anchor && anchor.spaceId !== entity.spaceId) {
      errors.push(
        `INV-3 ${where}: anchor "${anchor.id}" is in space "${anchor.spaceId}" but the entity ` +
          `claims space "${entity.spaceId}"`
      );
    }

    const homes = ownership.get(entity.id) || [];
    if (homes.length === 0) {
      errors.push(`INV-3 ${where}: not listed by any Space`);
    } else if (homes.length > 1) {
      errors.push(`INV-3 ${where}: listed by multiple Spaces (${homes.join(', ')})`);
    } else if (homes[0] !== entity.spaceId) {
      errors.push(`INV-3 ${where}: listed by "${homes[0]}" but declares "${entity.spaceId}"`);
    }

    if (entity.interaction?.focusable && !entity.accessibility?.label) {
      errors.push(`INV-9 ${where}: focusable entity has no accessibility label`);
    }

    // INV-10: declared media must name its rights. An institution loading its
    // own collection has to say what it is allowed to publish, and a world file
    // that cannot answer that question should not validate.
    const media = entity.content?.media;
    if (media) {
      if (!MEDIA_KIND[media.kind]) {
        errors.push(`${where}: unknown media kind "${media.kind}"`);
      }
      if (media.kind !== MEDIA_KIND.GENERATED && !media.src) {
        errors.push(`${where}: media of kind ${media.kind} requires a src`);
      }
      if (!media.rights) {
        errors.push(
          `INV-10 ${where}: media declares no rights — every file placed in a world ` +
            'must record who owns it and under what terms'
        );
      }
    }
    for (const id of entity.interaction?.hotspotRefs || []) ref(id, hotspotIds, where, 'hotspot');
  }

  // ---- Hotspots : INV-4 -----------------------------------------------------
  for (const hotspot of collections.hotspots) {
    const where = `hotspot/${hotspot.id}`;
    if (!HOTSPOT_TYPE[hotspot.type]) errors.push(`${where}: unknown hotspot type "${hotspot.type}"`);
    ref(hotspot.spaceId, spaceIds, where, 'space');
    if (hotspot.entityId) ref(hotspot.entityId, new Set(entityById.keys()), where, 'entity');
    if (hotspot.anchorId) ref(hotspot.anchorId, new Set(anchorById.keys()), where, 'anchor');
    if (!hotspot.entityId && !hotspot.anchorId) {
      errors.push(`${where}: must attach to an entity or an anchor`);
    }
    if (!hotspot.accessibilityLabel) errors.push(`INV-9 ${where}: no accessibilityLabel`);

    for (const field of CONNECTIVITY_FIELDS) {
      if (field in hotspot) {
        errors.push(
          `INV-4 ${where}: declares "${field}" — a Hotspot triggers, it does not connect. ` +
            'Use action ACTIVATE_PORTAL targeting a Portal record.'
        );
      }
    }

    const action = hotspot.action;
    if (!action || !ACTION[action.type]) {
      errors.push(`${where}: action.type must be one of ${Object.keys(ACTION).join('|')}`);
    } else {
      switch (action.type) {
        case ACTION.ACTIVATE_PORTAL:
          ref(action.target, portalIds, `${where}.action`, 'portal');
          break;
        case ACTION.FOCUS_ENTITY:
        case ACTION.OPEN_INFO:
        case ACTION.PLAY_MEDIA:
          ref(action.target ?? hotspot.entityId, new Set(entityById.keys()), `${where}.action`, 'entity');
          break;
        case ACTION.START_ROUTE:
          ref(action.target, routeIds, `${where}.action`, 'route');
          break;
        case ACTION.TRIGGER_STORY:
          ref(action.target, stepIds, `${where}.action`, 'story step');
          break;
        default:
          break;
      }
    }
  }

  // ---- Portals : INV-5, INV-8 ----------------------------------------------
  for (const portal of collections.portals) {
    const where = `portal/${portal.id}`;
    ref(portal.fromSpaceId, spaceIds, where, 'fromSpace');
    ref(portal.toSpaceId, spaceIds, where, 'toSpace');
    ref(portal.sourceAnchorId, new Set(anchorById.keys()), where, 'sourceAnchor');
    ref(portal.destinationSpawnId, new Set(anchorById.keys()), where, 'destinationSpawn');
    if (!TRANSITION_BEHAVIOUR[portal.transitionBehaviour]) {
      errors.push(`${where}: unknown transitionBehaviour "${portal.transitionBehaviour}"`);
    }
    if (!REPRESENTATION_HINT[portal.representationHint]) {
      errors.push(`${where}: unknown representationHint "${portal.representationHint}"`);
    }
    if (!portal.accessibilityLabel) errors.push(`INV-9 ${where}: no accessibilityLabel`);

    for (const field of TRIGGER_FIELDS) {
      if (field in portal) {
        errors.push(
          `INV-5 ${where}: declares "${field}" — a Portal connects, it does not trigger. ` +
            'Activation belongs to a Hotspot or an Experience step.'
        );
      }
    }

    const spawn = anchorById.get(portal.destinationSpawnId);
    if (spawn && spawn.spaceId !== portal.toSpaceId) {
      errors.push(
        `INV-8 ${where}: destinationSpawn "${spawn.id}" is in "${spawn.spaceId}", ` +
          `but the portal leads to "${portal.toSpaceId}"`
      );
    }
    const source = anchorById.get(portal.sourceAnchorId);
    if (source && source.spaceId !== portal.fromSpaceId) {
      errors.push(`${where}: sourceAnchor "${source.id}" is not in "${portal.fromSpaceId}"`);
    }
  }

  // ---- Experience -----------------------------------------------------------
  for (const chapter of collections.chapters) {
    const where = `chapter/${chapter.id}`;
    ref(chapter.spaceId, spaceIds, where, 'space');
    for (const id of chapter.stepRefs || []) ref(id, stepIds, where, 'story step');
  }
  for (const step of collections.storySteps) {
    const where = `storyStep/${step.id}`;
    ref(step.chapterId, chapterIds, where, 'chapter');
    if (!SHOT_INTENT[step.shotIntent]) errors.push(`${where}: unknown shotIntent "${step.shotIntent}"`);
    if (step.subjectRef && !entityById.has(step.subjectRef) && !spaceIds.has(step.subjectRef)) {
      errors.push(`INV-2 ${where}: subjectRef "${step.subjectRef}" is neither an entity nor a space`);
    }
    if (step.action?.type === ACTION.ACTIVATE_PORTAL) {
      ref(step.action.target, portalIds, `${where}.action`, 'portal');
    }
    if (!step.caption) warnings.push(`${where}: no caption — narration will have no transcript`);
  }
  for (const route of collections.routes) {
    const where = `route/${route.id}`;
    for (const id of route.chapterRefs || []) ref(id, chapterIds, where, 'chapter');
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    counts: Object.fromEntries(Object.entries(collections).map(([k, v]) => [k, v.length]))
  };
}

/** Depth-first scan for a forbidden render key. @returns {string|null} */
function findForbiddenKey(value, depth = 0) {
  if (depth > 6 || value === null || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findForbiddenKey(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_RENDER_KEYS.includes(key)) return key;
    const found = findForbiddenKey(value[key], depth + 1);
    if (found) return found;
  }
  return null;
}
