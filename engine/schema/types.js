/**
 * Immersive Worlds — Semantic schema
 *
 * This file is the vocabulary of the engine. It contains no rendering concept
 * of any kind: no mesh, no material, no Three.js, no DOM.
 *
 * Contracts realised here (IW-0 Constitution §§5, 9–13; DECISION_LOG
 * IW-DEC-018/019/020/021/022/023):
 *
 *   SEMANTIC DATA   ≠  VISUAL REPRESENTATION
 *   ONE OBJECT      =  ONE CANONICAL RECORD  +  MANY REFERENCES BY ID
 *   HOTSPOT (trigger)  ≠  PORTAL (connection)
 *   ANCHOR          =  the only sanctioned way to express a position
 *
 * A record may express *intent* ("this is a framed work, lit as a hero piece"),
 * never *implementation* ("this is a PlaneGeometry with a MeshStandardMaterial").
 */

/** Kinds of semantic record. Every record in a World is exactly one of these. */
export const RECORD = Object.freeze({
  SPACE: 'SPACE',
  ANCHOR: 'ANCHOR',
  ENTITY: 'ENTITY',
  HOTSPOT: 'HOTSPOT',
  PORTAL: 'PORTAL',
  ROUTE: 'ROUTE',
  CHAPTER: 'CHAPTER',
  STORY_STEP: 'STORY_STEP'
});

/** What a content entity *is*, semantically. Scene Kits decide how it looks. */
export const ENTITY_KIND = Object.freeze({
  ARTWORK: 'ARTWORK',
  SCULPTURE: 'SCULPTURE',
  VIDEO: 'VIDEO',
  // Time-based media presented as light on an architectural surface rather than
  // as an object hung on one. Semantically it is still a work with media and
  // rights; only its representation differs — which is the whole point of the
  // kind existing separately from VIDEO.
  PROJECTION: 'PROJECTION',
  AUDIO: 'AUDIO',
  TEXT: 'TEXT',
  OBJECT_3D: 'OBJECT_3D'
});

/** What an Anchor means spatially. Placement rules belong to the Scene Kit. */
export const ANCHOR_KIND = Object.freeze({
  WALL: 'WALL',       // a point on a vertical surface, `normal` points into the room
  FLOOR: 'FLOOR',     // a point on the ground plane
  PLINTH: 'PLINTH',   // a raised display position
  SPAWN: 'SPAWN',     // a valid visitor arrival pose
  VIEWPOINT: 'VIEWPOINT', // an authored camera position
  FREE: 'FREE'
});

export const HOTSPOT_TYPE = Object.freeze({
  INFO: 'INFO',
  MEDIA: 'MEDIA',
  PORTAL: 'PORTAL',
  ACTION: 'ACTION',
  STORY: 'STORY'
});

/** Semantic hotspot states (Constitution §12). Visual affordance is optional. */
export const HOTSPOT_STATE = Object.freeze({
  HIDDEN: 'HIDDEN',
  AVAILABLE: 'AVAILABLE',
  NEAR: 'NEAR',
  HOVER: 'HOVER',
  ACTIVE: 'ACTIVE',
  VISITED: 'VISITED',
  NEXT_ROUTE: 'NEXT_ROUTE'
});

/**
 * Semantic actions (IW-DEC-022). A Scene Kit must never invent its own callback
 * for something that is one of these.
 */
export const ACTION = Object.freeze({
  FOCUS_ENTITY: 'FOCUS_ENTITY',
  RELEASE_FOCUS: 'RELEASE_FOCUS',
  OPEN_INFO: 'OPEN_INFO',
  PLAY_MEDIA: 'PLAY_MEDIA',
  ACTIVATE_PORTAL: 'ACTIVATE_PORTAL',
  START_ROUTE: 'START_ROUTE',
  TRIGGER_STORY: 'TRIGGER_STORY',
  SET_STATE: 'SET_STATE'
});

/**
 * HOW spatial state changes. Separate from how the change *looks*
 * (IW-DEC-021). A cinematic dissolve and a walk-through door can both be
 * CONTINUOUS; the difference is representation, not semantics.
 */
export const TRANSITION_BEHAVIOUR = Object.freeze({
  CONTINUOUS: 'CONTINUOUS', // camera travels through; both spaces briefly coexist
  CUT: 'CUT',               // instantaneous swap
  TELEPORT: 'TELEPORT',     // fade out, relocate, fade in
  CINEMATIC: 'CINEMATIC'    // Experience Director drives the traversal
});

/** A *hint* to the Scene Kit. It may honour it, substitute it, or show nothing. */
export const REPRESENTATION_HINT = Object.freeze({
  DOOR: 'DOOR',
  OPENING: 'OPENING',
  SCREEN: 'SCREEN',
  ARTWORK: 'ARTWORK',
  WINDOW: 'WINDOW',
  NONE: 'NONE'
});

/**
 * Camera framing intents for Museum V1 (Constitution §14).
 *
 * `LEAD` is the travelling beat: the guide walks to the next stop and the
 * camera arrives behind her, so the visitor experiences having followed someone
 * rather than having been moved. `ACCOMPANIED` frames a subject from behind
 * whoever is showing it to you. It
 * is an intent, not a mechanism: it says "the visitor is being shown this",
 * and the Scene Kit decides what that composition is in its own vocabulary.
 * The handoff that follows needs no intent of its own — an ACCOMPANIED shot
 * followed by a FOCUS shot already *is* the move from being shown something to
 * looking at it yourself, and the existing shot travel carries it.
 */
export const SHOT_INTENT = Object.freeze({
  ENTRY: 'ENTRY',
  OVERVIEW: 'OVERVIEW',
  LEAD: 'LEAD',
  ACCOMPANIED: 'ACCOMPANIED',
  /** A human being with the work, the guide no longer mediating. Beat C. */
  CONTEMPLATION: 'CONTEMPLATION',
  FOCUS: 'FOCUS',
  DETAIL: 'DETAIL',
  PORTAL: 'PORTAL',
  EXIT: 'EXIT'
});

/** Space runtime lifecycle (Constitution §7 / IW-ADR-006). */
export const SPACE_STATE = Object.freeze({
  UNLOADED: 'UNLOADED',
  PRELOADING: 'PRELOADING',
  WARMING: 'WARMING',
  READY: 'READY',
  ACTIVE: 'ACTIVE',
  COOLING: 'COOLING',
  DISPOSED: 'DISPOSED'
});

/** Camera authority states (IW-DEC-026). Exactly one is authoritative per frame. */
export const CAMERA_AUTHORITY = Object.freeze({
  AUTHOR: 'AUTHOR',
  EXPLORE: 'EXPLORE',
  THIRD_PERSON_EXPLORE: 'THIRD_PERSON_EXPLORE',
  FOCUS: 'FOCUS',
  DIRECTED: 'DIRECTED',
  TRANSITION: 'TRANSITION'
});

/**
 * Keys that would mean a semantic record had started owning its own rendering.
 * The validator rejects any record carrying one of these, at any depth.
 * This is the mechanical guard behind "semantic data ≠ visual representation".
 */
export const FORBIDDEN_RENDER_KEYS = Object.freeze([
  'mesh',
  'geometry',
  'material',
  'materials',
  'shader',
  'texture',
  'object3d',
  'object3D',
  'scene',
  'renderer',
  'threeObject',
  'uniforms'
]);

/**
 * @typedef {Object} Anchor
 * @property {string} id
 * @property {string} spaceId
 * @property {keyof ANCHOR_KIND} kind
 * @property {[number,number,number]} position
 * @property {[number,number,number]} [normal]  facing direction (unit-ish); for WALL, into the room
 * @property {[number,number]} [extent]         usable surface extent, metres
 * @property {string} [label]
 */

/**
 * @typedef {Object} Space
 * @property {string} id
 * @property {string} title
 * @property {string} type                 semantic room type: LOBBY | GALLERY | ARCHIVE ...
 * @property {{size:[number,number,number], origin:[number,number,number]}} bounds  metres
 * @property {string} sceneProfile         named Scene Kit profile (e.g. 'white-cube')
 * @property {string} lightingProfile      named lighting intent (e.g. 'museum-cove-track')
 * @property {string} [ambience]           named ambience cue
 * @property {string[]} entityRefs         canonical entity IDs located here
 * @property {string[]} anchorRefs
 * @property {string[]} hotspotRefs
 * @property {string[]} portalRefs
 * @property {string} defaultSpawnAnchorId
 * @property {Object} [metadata]
 */

/**
 * How a Content Entity gets its pixels.
 *
 * This is the boundary between "a world we authored" and "a world a client
 * filled with their own collection". `IMAGE` and `VIDEO` name a file the
 * institution owns; `GENERATED` synthesises a placeholder plate from the
 * deterministic seed.
 *
 * The engine never loads anything: it declares *what* the entity is made of and
 * the Scene Kit's media loader resolves it. A failed load degrades to
 * GENERATED — a broken URL must never leave a hole in a gallery wall.
 */
export const MEDIA_KIND = Object.freeze({
  IMAGE: 'IMAGE',
  VIDEO: 'VIDEO',
  AUDIO: 'AUDIO',
  GENERATED: 'GENERATED'
});

/**
 * @typedef {Object} Media
 * @property {keyof MEDIA_KIND} kind
 * @property {string} [src]        URL relative to the world file, or absolute
 * @property {string} [poster]     still frame for VIDEO, shown before playback
 * @property {number} [aspect]     width / height, used before the file has loaded
 * @property {boolean} [loop]
 * @property {boolean} [muted]
 * @property {string} [credit]     shown in the detail panel when present
 * @property {string} rights       who owns this file and under what terms — required
 */

/**
 * @typedef {Object} Entity
 * @property {string} id
 * @property {keyof ENTITY_KIND} kind
 * @property {string} [subtype]
 * @property {string} spaceId              exactly one — a canonical record has one home
 * @property {string} anchorId             placement is *by reference*, never raw coordinates
 * @property {[number,number,number]} size metres (w,h,d) — semantic dimensions, not a mesh
 * @property {Object} content              title, creator, year, medium, description, media...
 * @property {Media} [content.media]       what this entity is made of
 * @property {{profile?:string, hints?:Object}} representation   intent only, no implementation
 * @property {{focusable?:boolean, focusDistance?:number, hotspotRefs?:string[]}} interaction
 * @property {{label:string, description?:string, transcript?:string}} accessibility
 * @property {Object} [metadata]
 */

/**
 * @typedef {Object} Hotspot
 * @property {string} id
 * @property {string} spaceId
 * @property {string} [entityId]           attached to an entity, or…
 * @property {string} [anchorId]           …to a free spatial anchor
 * @property {keyof HOTSPOT_TYPE} type
 * @property {{shape:'SPHERE'|'BOX', radius?:number, size?:[number,number,number]}} interactionVolume
 * @property {number} [triggerDistance]
 * @property {'ALWAYS'|'NEAR'|'NEVER'} visualPolicy   whether a marker may be drawn
 * @property {{type:keyof ACTION, target?:string, params?:Object}} action
 * @property {string} accessibilityLabel
 * @property {boolean} [enabled]
 */

/**
 * @typedef {Object} Portal
 * @property {string} id
 * @property {string} fromSpaceId
 * @property {string} toSpaceId
 * @property {string} sourceAnchorId       where the connection sits in the origin space
 * @property {string} destinationSpawnId   anchor in the destination space
 * @property {keyof TRANSITION_BEHAVIOUR} transitionBehaviour
 * @property {keyof REPRESENTATION_HINT} representationHint
 * @property {'EAGER'|'ON_APPROACH'|'LAZY'} prefetchPolicy
 * @property {'RETURN_TO_SOURCE'|'DEFAULT_SPAWN'} returnPolicy
 * @property {string} accessibilityLabel
 */

/**
 * @typedef {Object} StoryStep
 * @property {string} id
 * @property {string} chapterId
 * @property {string} [subjectRef]         entity or space the shot is about
 * @property {keyof SHOT_INTENT} shotIntent
 * @property {number} duration             seconds
 * @property {{type:keyof ACTION, target?:string, params?:Object}} [action]
 * @property {string} [narrationCue]
 * @property {string} [audioCue]
 * @property {string} caption              spoken text, also used as the caption track
 */

/**
 * @typedef {Object} Chapter
 * @property {string} id
 * @property {string} title
 * @property {string} spaceId
 * @property {string[]} stepRefs
 */

/**
 * @typedef {Object} Route
 * @property {string} id
 * @property {string} title
 * @property {string[]} chapterRefs
 * @property {string} [description]
 */

/**
 * @typedef {Object} World
 * @property {string} id
 * @property {number} schemaVersion
 * @property {string} title
 * @property {string} sceneKit             named kit, e.g. 'museum'
 * @property {string} startSpaceId
 * @property {Space[]} spaces
 * @property {Anchor[]} anchors
 * @property {Entity[]} entities
 * @property {Hotspot[]} hotspots
 * @property {Portal[]} portals
 * @property {Chapter[]} chapters
 * @property {StoryStep[]} storySteps
 * @property {Route[]} routes
 * @property {Object} [metadata]
 */

export const SCHEMA_VERSION = 1;
