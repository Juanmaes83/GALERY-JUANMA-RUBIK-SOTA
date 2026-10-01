/**
 * Museum authoring — the Experience Tree
 *
 * The domain model the author navigates:
 *
 *   INSTITUCIÓN
 *   └── EXPOSICIÓN
 *       └── SALAS
 *           └── OBRAS / PROYECCIÓN / INSTALACIONES / SEÑALÉTICA
 *
 * This is deliberately NOT the engine's scene graph. It carries no anchors, no
 * transforms, no materials and no cameras — an author asks "what am I editing,
 * where does it live, what will change", and none of those questions are
 * answered by a transform hierarchy.
 *
 * It is derived from the world record, so a second institution with different
 * rooms and different works gets a correct tree with no code change. That is the
 * second-museum test applied to navigation itself.
 */

import { SLOTS_FOR_KIND } from '../experience-config.js';

/** Domain nouns, in the language a curator uses. */
export const NODE = Object.freeze({
  INSTITUTION: 'INSTITUTION',
  EXHIBITION: 'EXHIBITION',
  ROOM: 'ROOM',
  ENTITY: 'ENTITY'
});

/** What each entity kind is called on screen, and what it can be given. */
const KIND_LABEL = {
  ARTWORK: 'Obra',
  SCULPTURE: 'Escultura',
  PROJECTION: 'Proyección',
  AUDIO: 'Pieza sonora',
  TEXT: 'Señalética'
};

/**
 * Signage is the institution's own voice. It appears in the tree so the author
 * can see WHERE it lives, but it is edited under INSTITUCIÓN — putting a wall
 * panel in the artwork editor is what let VS01 offer a wall as the first "obra".
 */
const EDITED_ELSEWHERE = { TEXT: 'institution' };

/** "1 piezas" is not Spanish, and a tree full of it does not read as premium. */
const pieces = (n) => (n === 1 ? '1 pieza' : `${n} piezas`);

/**
 * @param {object} world   the world record (authored or base — both work)
 * @param {object} config  normalised config, for authored overrides
 */
export function buildExperienceTree(world, config) {
  const entitiesBySpace = new Map();
  for (const entity of world.entities || []) {
    if (!entitiesBySpace.has(entity.spaceId)) entitiesBySpace.set(entity.spaceId, []);
    entitiesBySpace.get(entity.spaceId).push(entity);
  }

  const rooms = (world.spaces || []).map((space) => {
    const authoredRoom = config.rooms?.[space.id] || {};
    const children = (entitiesBySpace.get(space.id) || []).map((entity) => {
      const authored = config.entities?.[entity.id] || {};
      const title = authored.title || entity.content?.title || entity.id;
      // "Personalizado" has to mean *differs from what the Museum ships*. Marking
      // every field that merely holds a value painted the whole tree green on a
      // project nobody had touched.
      const changed = ['title', 'creator', 'year', 'medium', 'description'].some(
        (f) => authored[f] != null && authored[f] !== '' && authored[f] !== entity.content?.[f]
      ) || Boolean(authored.image) || Boolean(authored.video);
      return {
        kind: NODE.ENTITY,
        id: entity.id,
        entityKind: entity.kind,
        label: title,
        sublabel: KIND_LABEL[entity.kind] || entity.kind,
        spaceId: space.id,
        slots: SLOTS_FOR_KIND[entity.kind] || [],
        editedAt: EDITED_ELSEWHERE[entity.kind] || null,
        // What the author changed here, so the tree can show its own state
        // rather than making them open every node to find out.
        authored: changed
      };
    });

    return {
      kind: NODE.ROOM,
      id: space.id,
      label: authoredRoom.title || space.title || space.id,
      sublabel: pieces(children.filter((c) => c.entityKind !== 'TEXT').length),
      isEntry: space.id === world.startSpaceId,
      children,
      authored: Boolean(authoredRoom.title) && authoredRoom.title !== space.title
    };
  });

  const exhibition = {
    kind: NODE.EXHIBITION,
    id: 'exhibition',
    label: config.exhibition?.title || world.title || 'Exposición',
    sublabel: rooms.length === 1 ? '1 sala' : `${rooms.length} salas`,
    children: rooms,
    authored: Boolean(config.exhibition?.title) && config.exhibition.title !== world.title
  };

  return {
    kind: NODE.INSTITUTION,
    id: 'institution',
    label: (config.institution?.name || world.metadata?.institution || 'Institución')
      .replace(/\s*\(.*\)$/, ''),
    sublabel: config.institution?.claim || '',
    children: [exhibition],
    authored: Boolean(config.institution?.name) && config.institution.name !== world.metadata?.institution
  };
}

/** Depth-first walk, for lookups and for rendering a flat list of rows. */
export function* walkTree(node, depth = 0) {
  yield { node, depth };
  for (const child of node.children || []) yield* walkTree(child, depth + 1);
}

export function findNode(root, id) {
  for (const { node } of walkTree(root)) if (node.id === id) return node;
  return null;
}

/**
 * The room a node lives in — the answer to "where does this live", which the
 * studio needs in order to walk the preview to the right place.
 */
export function roomOf(root, id) {
  for (const { node } of walkTree(root)) {
    if (node.kind !== NODE.ROOM) continue;
    if (node.id === id) return node;
    if ((node.children || []).some((c) => c.id === id)) return node;
  }
  return null;
}
