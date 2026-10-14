/**
 * Museum — what media this project actually has
 *
 * An author was told what each slot was missing but never what the project
 * already held, so the only way to reuse a file was to remember its name and
 * find it on disk again. The Museum ships seven files and a second institution
 * brings two more; that is small enough to hold in your head and large enough
 * to get wrong.
 *
 * This reads the two places media can come from and answers three questions per
 * file: what is it, is it usable, and where is it being used.
 *
 *   PROJECT   the world record's own media — a path the world resolves
 *   AUTHORED  a file this session supplied — lives in the MediaVault
 *
 * Deliberately not a DAM. No accounts, no remote storage, no metadata system,
 * no history: the scope is this project, in this browser, right now. What makes
 * it worth having is `usedBy` — a file's meaning in a catalogue is which works
 * it belongs to, and that is the fact no filename carries.
 */

import { MEDIA_SLOT, SLOT_MEDIA, SLOTS_FOR_KIND } from '../experience-config.js';
import { describeAsset } from '../media-vault.js';

/** The three shelves. Logos are a category because a mark is used unlike a picture. */
export const CATEGORY = Object.freeze({
  IMAGES: 'IMAGES',
  VIDEOS: 'VIDEOS',
  LOGOS: 'LOGOS'
});

export const CATEGORY_LABEL = Object.freeze({
  IMAGES: 'Imágenes',
  VIDEOS: 'Vídeos',
  LOGOS: 'Logotipos'
});

/** A file is one entry however many works point at it. */
function keyFor(src) {
  return String(src || '').trim();
}

/**
 * @param {{world:object, config:object, vault:import('../media-vault.js').MediaVault, baseUrl?:string}} deps
 * @returns {{items:Array<object>, byCategory:Record<string,Array<object>>, counts:Record<string,number>}}
 */
export function buildCatalogue({ world, config, vault, baseUrl = '' }) {
  /** @type {Map<string, object>} */
  const found = new Map();

  const resolve = (src) => {
    if (!src) return null;
    if (/^(https?:)?\/\//.test(src) || src.startsWith('data:') || src.startsWith('blob:')) return src;
    // `authored:<id>` only means anything to the vault.
    if (src.startsWith('authored:')) return vault?.resolve(src) || null;
    try { return baseUrl ? new URL(src, baseUrl).href : src; } catch { return src; }
  };

  const add = (entry) => {
    const key = keyFor(entry.reference);
    if (!key) return null;
    const existing = found.get(key);
    if (existing) {
      // Same file, another wall. The usage list is the point.
      for (const use of entry.usedBy) existing.usedBy.push(use);
      return existing;
    }
    found.set(key, entry);
    return entry;
  };

  const entityLabel = (entity) => {
    const authored = config?.entities?.[entity.id] || {};
    return authored.title || entity.content?.title || entity.id;
  };

  /* -- what the world itself ships ----------------------------------------- */
  for (const entity of world?.entities || []) {
    const media = entity.content?.media;
    if (!media?.src || media.kind === 'GENERATED') continue;
    // A file the author has replaced is no longer in use; the replacement is.
    const authored = config?.entities?.[entity.id] || {};
    const slots = SLOTS_FOR_KIND[entity.kind] || [];
    const replaced = slots.some((slot) => authored[SLOT_MEDIA[slot].field]);
    const kind = media.kind === 'VIDEO' ? 'video' : 'image';
    add({
      reference: media.src,
      origin: 'project',
      kind,
      category: kind === 'video' ? CATEGORY.VIDEOS : CATEGORY.IMAGES,
      name: media.name || media.src.split('/').pop(),
      url: resolve(media.src),
      state: 'READY',
      stateLabel: 'En el proyecto',
      width: media.width || 0,
      height: media.height || 0,
      bytes: 0,
      durationMs: 0,
      credit: media.credit || '',
      usedBy: replaced ? [] : [{ entityId: entity.id, label: entityLabel(entity), how: 'Medio original' }]
    });
  }

  /* -- what the author has supplied ---------------------------------------- */
  const authoredEntry = (media, slot, use) => {
    if (!media?.src) return;
    const asset = media.assetId ? vault?.get(media.assetId) : null;
    const described = describeAsset(asset, media);
    const spec = SLOT_MEDIA[slot];
    add({
      reference: media.src,
      origin: 'authored',
      kind: spec.kind,
      category: slot === MEDIA_SLOT.INSTITUTION_LOGO
        ? CATEGORY.LOGOS
        : spec.kind === 'video' ? CATEGORY.VIDEOS : CATEGORY.IMAGES,
      name: media.name || 'sin nombre',
      url: resolve(media.src),
      thumb: asset?.thumb || null,
      state: described.state || 'READY',
      stateLabel: described.label,
      detail: described.detail || '',
      width: media.width || asset?.width || 0,
      height: media.height || asset?.height || 0,
      bytes: media.bytes || asset?.bytes || 0,
      durationMs: media.durationMs || 0,
      usedBy: use ? [use] : []
    });
  };

  if (config?.institution?.logo) {
    authoredEntry(config.institution.logo, MEDIA_SLOT.INSTITUTION_LOGO, {
      entityId: 'institution',
      label: config.institution.name || 'La institución',
      how: 'Marca de la institución'
    });
  }

  for (const entity of world?.entities || []) {
    const authored = config?.entities?.[entity.id];
    if (!authored) continue;
    for (const slot of SLOTS_FOR_KIND[entity.kind] || []) {
      const media = authored[SLOT_MEDIA[slot].field];
      if (!media) continue;
      authoredEntry(media, slot, {
        entityId: entity.id,
        label: entityLabel(entity),
        how: SLOT_MEDIA[slot].kind === 'video' ? 'Vídeo de la pieza' : 'Imagen de la pieza'
      });
    }
  }

  const items = [...found.values()];
  const byCategory = { IMAGES: [], VIDEOS: [], LOGOS: [] };
  for (const item of items) byCategory[item.category].push(item);
  // Files in use first: a catalogue's job is to show what the exhibition is
  // made of before it shows what is spare.
  for (const list of Object.values(byCategory)) {
    list.sort((a, b) => (b.usedBy.length - a.usedBy.length) || a.name.localeCompare(b.name, 'es'));
  }

  return {
    items,
    byCategory,
    counts: {
      IMAGES: byCategory.IMAGES.length,
      VIDEOS: byCategory.VIDEOS.length,
      LOGOS: byCategory.LOGOS.length
    }
  };
}

/**
 * Which slots on the selected thing could take this file.
 *
 * Reuse has to stay inside the semantic model: a video may go to a slot that
 * takes video, on a kind that admits one. Offering "use here" where the answer
 * would be discarded is the ambiguity the explicit slots exist to prevent.
 */
export function slotsAccepting(item, entityKind) {
  if (!entityKind) return [];
  return (SLOTS_FOR_KIND[entityKind] || []).filter((slot) => SLOT_MEDIA[slot].kind === item.kind);
}
