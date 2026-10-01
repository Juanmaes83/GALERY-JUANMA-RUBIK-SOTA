/**
 * Museum authoring — Project Readiness
 *
 * Three questions that VS01 ran together and that a professional tool has to
 * keep apart:
 *
 *   ASSET READY   — this file can be decoded and drawn.
 *   CONFIG SAVED  — the project on disk contains what the author intended.
 *   PROJECT READY — every REQUIRED thing the experience needs is satisfied.
 *
 * A project can hold a perfectly decoded image and still not be ready, and it
 * can be ready while an optional field is empty. Conflating them is how a
 * "Start" button ends up meaning nothing.
 *
 * Requirements are derived from the world record rather than listed by hand, so
 * a second institution with different rooms gets a correct checklist without
 * anyone editing this file. That is the same rule the rest of the layer follows:
 * the product's truth lives in the record.
 */

import { SLOTS_FOR_KIND, SLOT_MEDIA } from '../experience-config.js';

export const SEVERITY = Object.freeze({
  BLOCKING: 'BLOCKING',   // START is not honest while this is true
  WARNING: 'WARNING',     // worth the author's attention, does not block
  SUGGESTION: 'SUGGESTION'
});

export const PROJECT_STATE = Object.freeze({
  INCOMPLETE: 'INCOMPLETE',
  LOADING: 'LOADING',
  READY: 'READY',
  STARTED: 'STARTED'
});

/** Entity kinds that are exhibited works rather than institutional signage. */
const WORK_KINDS = new Set(['ARTWORK', 'SCULPTURE', 'PROJECTION', 'AUDIO']);

const text = (value) => String(value ?? '').trim();

/**
 * Build the requirement list for a world + config.
 *
 * @param {object} world   the world record as it ships (not the authored one)
 * @param {object} config  normalised config
 * @param {(ref:string)=>{state:string, error?:string}|null} [assetState]
 *        the vault's opinion of an authored reference, if it has one
 */
export function evaluateReadiness(world, config, assetState = () => null) {
  const items = [];

  const need = (id, label, ok, { severity = SEVERITY.BLOCKING, required = true, where = null, detail = '' } = {}) => {
    items.push({ id, label, ok: Boolean(ok), severity, required, where, detail });
  };

  /* -- the institution ------------------------------------------------------ */
  need('institution.name', 'La institución tiene nombre', text(config.institution.name),
    { where: 'institution' });
  need('institution.claim', 'La cartela de entrada tiene título', text(config.institution.claim),
    { where: 'institution' });
  need('exhibition.title', 'La exposición tiene título', text(config.exhibition.title),
    { where: 'exhibition' });
  need('institution.introduction', 'Añadir el texto de introducción', text(config.institution.introduction),
    { severity: SEVERITY.SUGGESTION, required: false, where: 'institution' });
  need('institution.logo', 'Añadir la marca de la institución', config.institution.logo,
    { severity: SEVERITY.SUGGESTION, required: false, where: 'institution' });

  /* -- every exhibited work ------------------------------------------------- */
  for (const entity of world.entities || []) {
    if (!WORK_KINDS.has(entity.kind)) continue;
    const authored = config.entities[entity.id] || {};
    const resolved = (field) => text(authored[field] ?? entity.content?.[field]);

    need(`${entity.id}.title`, `«${resolved('title') || entity.id}» tiene título`, resolved('title'),
      { where: entity.id, detail: entity.kind });
    need(`${entity.id}.creator`, `«${resolved('title') || entity.id}» tiene autoría`, resolved('creator'),
      { where: entity.id, detail: entity.kind });

    // Media is required only where the representation cannot stand without it,
    // and the world's own record already satisfies it unless the author replaced
    // it with something broken.
    // The slots a kind offers are alternatives, not a checklist: a work needs
    // one representation, and asking for both would report a finished piece as
    // incomplete for declining to be two things at once.
    const slots = SLOTS_FOR_KIND[entity.kind] || [];
    if (slots.length) {
      const chosen = slots.map((slot) => authored[SLOT_MEDIA[slot].field]).find(Boolean) || null;
      const inherited = entity.content?.media?.src;
      const state = chosen ? assetState(chosen.src) : null;

      if (chosen && state?.state === 'ERROR') {
        need(`${entity.id}.media`, `El archivo de «${resolved('title')}» no se pudo usar`, false,
          { where: entity.id, detail: state.error || 'Error de medio' });
      } else if (chosen && state && state.state !== 'READY') {
        need(`${entity.id}.media`, `El archivo de «${resolved('title')}» está cargando`, false,
          { where: entity.id, detail: 'Cargando…' });
      } else {
        need(`${entity.id}.media`, `«${resolved('title')}» tiene medio`, chosen || inherited,
          { where: entity.id, detail: chosen ? chosen.name : 'medio original' });
      }

      // A square file in a wide frame is not an error, but somebody should see
      // it before a visitor does.
      if (chosen?.width && chosen?.height && entity.size?.[0] && entity.size?.[1]) {
        const fileAspect = chosen.width / chosen.height;
        const supportAspect = entity.size[0] / entity.size[1];
        const drift = Math.abs(fileAspect - supportAspect) / supportAspect;
        need(`${entity.id}.aspect`,
          `Las proporciones de «${resolved('title')}» encajan en su soporte`, drift < 0.25,
          {
            severity: SEVERITY.WARNING, required: false, where: entity.id,
            detail: fileAspect > supportAspect
              ? 'La imagen es más ancha que el soporte y se recortará por los lados'
              : 'La imagen es más alta que el soporte y se recortará por arriba y abajo'
          });
      }
    }
  }

  // Grouped the way the Validation Center of the blueprint groups them, so a
  // single "100%" is not the only thing the column has to say. One number tells
  // an author nothing about what to go and fix.
  const DOMAIN_OF = (item) => (
    item.id.startsWith('institution') || item.id.startsWith('exhibition') ? 'Identidad'
      : item.id.endsWith('.media') ? 'Medios'
        : item.id.endsWith('.aspect') ? 'Presentación'
          : 'Catalogación'
  );
  // Counted over the SAME set the headline percentage uses. Counting every item
  // here while the percentage counted only the required ones produced a card
  // that said "100% · todo listo" directly above "Identidad 4/5" — the hero
  // number contradicting the rows underneath it, on most screens.
  const domains = {};
  const FIXED_DOMAINS = ['Identidad', 'Catalogación', 'Medios', 'Presentación'];
  for (const name of FIXED_DOMAINS) domains[name] = { name, total: 0, ok: 0, worst: null };
  for (const item of items) {
    if (!item.required) continue;
    const key = DOMAIN_OF(item);
    domains[key] ||= { name: key, total: 0, ok: 0, worst: null };
    domains[key].total += 1;
    if (item.ok) domains[key].ok += 1;
    else if (!domains[key].worst || item.severity === SEVERITY.BLOCKING) domains[key].worst = item.severity;
  }

  const required = items.filter((i) => i.required);
  const blocking = items.filter((i) => !i.ok && i.severity === SEVERITY.BLOCKING);
  const warnings = items.filter((i) => !i.ok && i.severity === SEVERITY.WARNING);
  const suggestions = items.filter((i) => !i.ok && i.severity === SEVERITY.SUGGESTION);
  const loading = blocking.filter((i) => i.detail === 'Cargando…');

  const state = loading.length ? PROJECT_STATE.LOADING
    : blocking.length ? PROJECT_STATE.INCOMPLETE
      : PROJECT_STATE.READY;

  return {
    state,
    canStart: blocking.length === 0,
    items,
    domains: Object.values(domains),
    requiredTotal: required.length,
    requiredReady: required.filter((i) => i.ok).length,
    blocking,
    warnings,
    suggestions,
    /** One line an author can read without counting anything. */
    headline: state === PROJECT_STATE.READY
      ? 'Todo el contenido necesario está listo'
      : loading.length
        ? `${required.filter((i) => i.ok).length} / ${required.length} elementos listos · ${loading.length} cargando`
        : `${required.filter((i) => i.ok).length} / ${required.length} elementos listos`
  };
}
