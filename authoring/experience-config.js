// Museum — Experience Configuration, schema 3.
// One serialisable project truth for authoring, runtime and export.

export const CONFIG_SCHEMA_VERSION = 3;

export const MEDIA_SLOT = Object.freeze({
  INSTITUTION_LOGO: 'INSTITUTION_LOGO',
  ARTWORK_IMAGE: 'ARTWORK_IMAGE',
  ARTWORK_VIDEO: 'ARTWORK_VIDEO',
  PROJECTION_VIDEO: 'PROJECTION_VIDEO',
  PROJECTION_IMAGE: 'PROJECTION_IMAGE'
});

export const SLOT_MEDIA = Object.freeze({
  INSTITUTION_LOGO: { kind: 'image', field: 'logo' },
  ARTWORK_IMAGE: { kind: 'image', field: 'image' },
  ARTWORK_VIDEO: { kind: 'video', field: 'video' },
  PROJECTION_IMAGE: { kind: 'image', field: 'image' },
  PROJECTION_VIDEO: { kind: 'video', field: 'video' }
});

export const SLOTS_FOR_KIND = Object.freeze({
  ARTWORK: [MEDIA_SLOT.ARTWORK_IMAGE, MEDIA_SLOT.ARTWORK_VIDEO],
  SCULPTURE: [], PROJECTION: [MEDIA_SLOT.PROJECTION_VIDEO, MEDIA_SLOT.PROJECTION_IMAGE],
  AUDIO: [], TEXT: []
});

export const PROJECTION_FIT = Object.freeze({
  COVER: { label: 'Respetar proporciones', hint: 'Recorta lo que no cabe, sin deformar' },
  STRETCH: { label: 'Ajustar a la superficie', hint: 'Ocupa todo; puede deformar la imagen' }
});

export const PROGRAMME_TYPE = Object.freeze({
  EXHIBITION: 'Exposición', GUIDED: 'Visita guiada', TALK: 'Charla',
  WORKSHOP: 'Taller', PERFORMANCE: 'Performance', EVENT: 'Actividad'
});

export const PACING = Object.freeze({
  BRISK: { label: 'Ágil', hint: 'Llega antes a cada obra', factor: 0.75 },
  NATURAL: { label: 'Natural', hint: 'El ritmo con el que se compuso el recorrido', factor: 1 },
  CALM: { label: 'Pausado', hint: 'Da tiempo a mirar mientras la cámara viaja', factor: 1.35 }
});

export const TRANSITION_LABEL = Object.freeze({
  T1_MICRO_REFRAMING: 'Reencuadre suave', T2_LOCAL_WALK: 'Paseo corto',
  T3_GALLERY_TRAVERSE: 'Recorrido de sala', T4_OBJECT_ORBIT: 'Órbita de objeto',
  T5_THRESHOLD_APPROACH: 'Aproximación al umbral', T6_ROOM_CROSSING: 'Paso entre salas'
});

const text = (v, max = 240) => String(v ?? '').slice(0, max);
const bool = (v) => v === true;
const num = (v, d = 0) => Number.isFinite(Number(v)) ? Number(v) : d;
const arr = (v) => Array.isArray(v) ? v : [];

function normaliseMedia(media) {
  if (!media) return null;
  return {
    kind: media.kind === 'video' ? 'video' : 'image', src: String(media.src || ''),
    assetId: media.assetId || null, name: String(media.name || ''), mimeType: media.mimeType || null,
    bytes: num(media.bytes), width: num(media.width), height: num(media.height), durationMs: num(media.durationMs)
  };
}

function normaliseProjection(pr) {
  if (!pr) return null;
  const clamp = (v, lo, hi, d) => Math.min(Math.max(num(v, d), lo), hi);
  return {
    fit: PROJECTION_FIT[pr.fit] ? pr.fit : 'COVER', intensity: clamp(pr.intensity, .2, 1.6, 1),
    spill: clamp(pr.spill, 0, 1.6, 1), reflection: clamp(pr.reflection, 0, 1, .5), loop: pr.loop !== false
  };
}

function emptySchedule() {
  return {
    weekly: ['L','M','X','J','V','S','D'].map((_, i) => ({
      open: i >= 2, start: i >= 2 ? '11:00' : '', end: i >= 2 ? '20:00' : ''
    })), exceptions: []
  };
}

function normaliseSchedule(value) {
  const base = emptySchedule();
  const weekly = arr(value?.weekly).slice(0, 7);
  return {
    weekly: base.weekly.map((d, i) => ({
      open: weekly[i]?.open ?? d.open,
      start: text(weekly[i]?.start ?? d.start, 12), end: text(weekly[i]?.end ?? d.end, 12)
    })),
    exceptions: arr(value?.exceptions).slice(0, 60).map((x) => ({
      date: text(x?.date, 20), open: bool(x?.open), start: text(x?.start, 12), end: text(x?.end, 12), note: text(x?.note, 160)
    }))
  };
}

const A11Y_KEYS = ['stepFree','lift','accessibleWc','hearingLoop','audioDescription','signLanguage','quietSpace','seating'];
function normaliseA11yFeatures(v) {
  return Object.fromEntries(A11Y_KEYS.map((k) => [k, bool(v?.[k])]));
}

function normaliseProgrammeItem(item, index) {
  return {
    id: item?.id || `prog_${index}_${Math.random().toString(36).slice(2, 7)}`,
    title: text(item?.title, 160), type: PROGRAMME_TYPE[item?.type] ? item.type : 'EVENT',
    description: text(item?.description, 600), start: text(item?.start, 40), end: text(item?.end, 40),
    location: text(item?.location, 160), bookingUrl: text(item?.bookingUrl, 400), accessibilityNote: text(item?.accessibilityNote, 300)
  };
}

function normaliseResource(r, index) {
  return {
    id: r?.id || `res_${index}_${Math.random().toString(36).slice(2, 7)}`,
    label: text(r?.label, 120), type: ['DOCUMENT','MAP','AUDIO','GUIDE','EXTERNAL'].includes(r?.type) ? r.type : 'EXTERNAL',
    url: text(r?.url, 500), entityId: text(r?.entityId, 180), documentId: text(r?.documentId, 180), qrEnabled: bool(r?.qrEnabled)
  };
}

function normaliseVisitor(v) {
  const it = v || {};
  return {
    hours: text(it.hours, 300), address: text(it.address, 300), accessibility: text(it.accessibility, 600),
    admission: text(it.admission, 300), ticketUrl: text(it.ticketUrl, 400), bookingUrl: text(it.bookingUrl, 400),
    contact: text(it.contact, 240), transport: text(it.transport, 400), parking: text(it.parking, 300),
    directionsUrl: text(it.directionsUrl, 400), notes: text(it.notes, 600),
    programme: arr(it.programme).slice(0, 48).map(normaliseProgrammeItem),
    schedule: normaliseSchedule(it.schedule), accessibilityFeatures: normaliseA11yFeatures(it.accessibilityFeatures),
    resources: arr(it.resources).slice(0, 60).map(normaliseResource),
    memory: {
      enabled: it.memory?.enabled !== false, favorites: it.memory?.favorites !== false,
      saveVisit: it.memory?.saveVisit !== false, emailIdentity: bool(it.memory?.emailIdentity), returnVisit: it.memory?.returnVisit !== false
    },
    commerce: {
      shopEnabled: bool(it.commerce?.shopEnabled), shopUrl: text(it.commerce?.shopUrl, 500),
      shopLabel: text(it.commerce?.shopLabel || 'Tienda', 100)
    },
    support: {
      membershipEnabled: bool(it.support?.membershipEnabled), membershipUrl: text(it.support?.membershipUrl, 500),
      donationsEnabled: bool(it.support?.donationsEnabled), donationsUrl: text(it.support?.donationsUrl, 500)
    }
  };
}

function normaliseArtist(a, index) {
  return {
    id: a?.id || `artist_${index}_${Math.random().toString(36).slice(2, 7)}`,
    name: text(a?.name, 160), biography: text(a?.biography, 1600), nationality: text(a?.nationality, 120),
    birth: text(a?.birth, 40), death: text(a?.death, 40), portraitUrl: text(a?.portraitUrl, 500), website: text(a?.website, 500)
  };
}

function normaliseDocument(d, index) {
  return {
    id: d?.id || `doc_${index}_${Math.random().toString(36).slice(2, 7)}`,
    title: text(d?.title, 180), type: text(d?.type || 'CATALOGUE', 60), url: text(d?.url, 500),
    description: text(d?.description, 800), entityIds: arr(d?.entityIds).slice(0, 120).map((x) => text(x, 180))
  };
}

function normaliseLanguages(l) {
  const source = l || {};
  const locales = arr(source.locales).length ? source.locales : ['es'];
  return {
    defaultLocale: text(source.defaultLocale || locales[0] || 'es', 12),
    locales: locales.slice(0, 12).map((x) => text(x, 12)),
    translations: Object.fromEntries(Object.entries(source.translations || {}).map(([locale, records]) => [text(locale, 12), records || {}]))
  };
}

function normalisePresentation(p) {
  return {
    frame: text(p?.frame, 120), mount: text(p?.mount, 120), material: text(p?.material, 120),
    finish: text(p?.finish, 120), glass: text(p?.glass, 120), passepartout: text(p?.passepartout, 120),
    plinth: text(p?.plinth, 120), mountingHeightCm: num(p?.mountingHeightCm)
  };
}

// Breeze Studio PRO already exposes this bounded semantic snapshot through its
// Museum state seam. Keep it in authoring config (never in the semantic World),
// so ConfigStore does not discard the existing integration on save/reload.
function normaliseBreeze(b) {
  if (!b) return null;
  const meta = (m) => m ? {
    name: text(m.name, 240), type: text(m.type, 120), size: num(m.size), lastModified: num(m.lastModified)
  } : null;
  return {
    version: 1,
    experience: text(b.experience || 'cloth', 80),
    autoRotate: bool(b.autoRotate),
    runSimulation: b.runSimulation !== false,
    wireframe: bool(b.wireframe),
    background: {
      meta: meta(b.background?.meta), applied: bool(b.background?.applied),
      scale: num(b.background?.scale, 1), x: num(b.background?.x), y: num(b.background?.y)
    },
    cloth: {
      meta: meta(b.cloth?.meta), applied: bool(b.cloth?.applied),
      scale: num(b.cloth?.scale, 1), x: num(b.cloth?.x), y: num(b.cloth?.y),
      opacity: num(b.cloth?.opacity, 1), brightness: num(b.cloth?.brightness, 1),
      contrast: num(b.cloth?.contrast, 1), saturation: num(b.cloth?.saturation, 1)
    },
    object: {
      template: text(b.object?.template || 'venus', 120),
      uploadedMeta: meta(b.object?.uploadedMeta),
      spec: b.object?.spec ? {
        kind: text(b.object.spec.kind, 80), id: text(b.object.spec.id, 160), name: text(b.object.spec.name, 240)
      } : null
    },
    physics: { stiffness: num(b.physics?.stiffness, .25), friction: num(b.physics?.friction, .25) }
  };
}

function normaliseEntity(e) {
  return {
    title: e?.title ?? null, creator: e?.creator ?? null, year: e?.year ?? null, medium: e?.medium ?? null,
    description: e?.description ?? null, image: normaliseMedia(e?.image), video: normaliseMedia(e?.video),
    projection: normaliseProjection(e?.projection), artistId: text(e?.artistId, 180),
    documentIds: arr(e?.documentIds).slice(0, 60).map((x) => text(x, 180)),
    sizeCm: { width: num(e?.sizeCm?.width), height: num(e?.sizeCm?.height), depth: num(e?.sizeCm?.depth) },
    accessibility: {
      label: text(e?.accessibility?.label, 240), description: text(e?.accessibility?.description, 1000), transcript: text(e?.accessibility?.transcript, 3000)
    },
    presentation: normalisePresentation(e?.presentation),
    ...(e?.breeze ? { breeze: normaliseBreeze(e.breeze) } : {})
  };
}

function migrate(input) {
  const c = structuredClone(input || {});
  if (Number(c.schemaVersion || 1) < 2) {
    c.entities = { ...(c.entities || {}) };
    for (const [id, old] of Object.entries(c.artworks || {})) {
      c.entities[id] = { ...(c.entities[id] || {}), ...old };
      if (old?.media) c.entities[id][old.media.kind === 'video' ? 'video' : 'image'] = old.media;
    }
    delete c.artworks;
  }
  return c;
}

export function normaliseConfig(input = {}) {
  const c = migrate(input), institution = c.institution || {}, exhibition = c.exhibition || {};
  return {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    configId: c.configId || `cfg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    label: text(c.label || 'Configuración sin título', 120), updatedAt: new Date().toISOString(),
    institution: {
      name: text(institution.name, 120), claim: text(institution.claim, 200), dates: text(institution.dates, 60),
      introduction: text(institution.introduction, 900), logo: normaliseMedia(institution.logo)
    },
    exhibition: { title: text(exhibition.title, 160) },
    rooms: Object.fromEntries(Object.entries(c.rooms || {}).map(([id, r]) => [id, {
      title: r?.title ?? null,
      accessibility: { stepFree: r?.accessibility?.stepFree !== false, liftRequired: bool(r?.accessibility?.liftRequired), quiet: bool(r?.accessibility?.quiet), seating: bool(r?.accessibility?.seating) }
    }])),
    entities: Object.fromEntries(Object.entries(c.entities || {}).map(([id, e]) => [id, normaliseEntity(e)])),
    artists: arr(c.artists).slice(0, 500).map(normaliseArtist),
    documents: arr(c.documents).slice(0, 1000).map(normaliseDocument),
    languages: normaliseLanguages(c.languages),
    visitor: normaliseVisitor(c.visitor),
    experience: {
      portalVariant: c.experience?.portalVariant || 'D',
      pacing: PACING[c.experience?.pacing] ? c.experience.pacing : 'NATURAL',
      motion: c.experience?.motion === 'CALM' ? 'CALM' : 'SYSTEM',
      accessibleRoute: {
        enabled: bool(c.experience?.accessibleRoute?.enabled), avoidStairs: c.experience?.accessibleRoute?.avoidStairs !== false,
        requireSeating: bool(c.experience?.accessibleRoute?.requireSeating), preferQuiet: bool(c.experience?.accessibleRoute?.preferQuiet)
      },
      personalization: {
        enabled: bool(c.experience?.personalization?.enabled), useFavorites: c.experience?.personalization?.useFavorites !== false,
        useVisited: c.experience?.personalization?.useVisited !== false, maxRecommendations: Math.max(1, Math.min(12, num(c.experience?.personalization?.maxRecommendations, 3)))
      }
    }
  };
}

const DEMO_VISITOR = {
  hours: 'Miércoles a domingo, 11:00 – 20:00\nLunes y martes cerrado', address: 'Calle del Horno 14, 28012 Madrid',
  admission: 'Entrada libre. Aforo limitado en la sala de escucha.',
  accessibility: 'Itinerario accesible completo. Cartelas en alto contraste y audio descripción en la sala de escucha.',
  bookingUrl: 'https://example.org/fundacion-arenas/visitas', transport: 'Metro Antón Martín (L1) a cinco minutos. Autobuses 6, 26 y 32.',
  contact: 'visitas@fundacionarenas.example', programme: [
    { id:'prog_arenas_01', title:'Colección permanente', type:'EXHIBITION', description:'Pintura, obra sobre papel, escultura y registro sonoro producidos entre 1958 y 1994.', start:'1958', end:'1994', location:'Galerías A y B' },
    { id:'prog_arenas_02', title:'Recorrido comentado por la colección', type:'GUIDED', description:'Seis paradas por las dos galerías, con la voz de la institución.', start:'Sábados 12:00', location:'Vestíbulo', bookingUrl:'https://example.org/fundacion-arenas/visitas/comentada', accessibilityNote:'Con audio descripción a petición.' }
  ]
};

function welcomePanelOf(world) {
  return (world?.entities || []).find((e) => e.kind === 'TEXT' && e.subtype === 'wall-panel' && e.spaceId === world?.startSpaceId) || null;
}

export function baseConfigFromWorld(world) {
  const welcome = welcomePanelOf(world);
  return normaliseConfig({
    label: world?.title || 'Configuración base',
    institution: {
      name: world?.metadata?.institution || world?.title || '', claim: welcome?.content?.title || world?.title || '',
      dates: welcome?.content?.year || '', introduction: welcome?.content?.description || world?.metadata?.description || ''
    },
    exhibition: { title: world?.title || '' }, rooms: {}, entities: {}, artists: [], documents: [],
    languages: { defaultLocale:'es', locales:['es'], translations:{} },
    visitor: world?.metadata?.visitor || DEMO_VISITOR,
    experience: { portalVariant:'D', pacing:'NATURAL', motion:'SYSTEM' }
  });
}

const WORLD_MEDIA_KIND = { image:'IMAGE', video:'VIDEO' };
function mediaForWorld(authored, previous, config, resolveMedia) {
  const live = resolveMedia(authored.src) || authored.src;
  return {
    ...(previous || {}), src: live, kind: WORLD_MEDIA_KIND[authored.kind] || 'IMAGE',
    aspect: authored.width && authored.height ? authored.width / authored.height : previous?.aspect,
    credit: `${config.institution.name || 'La institución autora'} — medio aportado en la configuración`,
    rights: 'Medio aportado por la institución que firma esta configuración.'
  };
}

function applyInstitutionSignage(world, config, resolveMedia) {
  const { name, claim, dates, introduction, logo } = config.institution;
  const signature = name.replace(/\s*\(.*\)$/, '');
  for (const entity of world.entities || []) {
    if (entity.kind !== 'TEXT' || entity.subtype !== 'wall-panel') continue;
    const content = { ...(entity.content || {}) };
    if (signature) content.creator = signature;
    if (entity.spaceId === world.startSpaceId) {
      if (claim) content.title = claim;
      if (claim || dates) content.year = dates;
      if (introduction) content.description = introduction;
      if (logo) content.media = mediaForWorld(logo, content.media, config, resolveMedia);
    }
    entity.content = content;
  }
}

export function applyConfigToWorld(world, config, resolveMedia = () => null) {
  const c = normaliseConfig(config), next = structuredClone(world);
  next.metadata = { ...(next.metadata || {}), institution: c.institution.name || next.metadata?.institution, claim: c.institution.claim || next.metadata?.claim, description: c.institution.introduction || next.metadata?.description, visitor: c.visitor };
  if (c.exhibition.title) next.title = c.exhibition.title;
  applyInstitutionSignage(next, c, resolveMedia);
  for (const space of next.spaces || []) {
    const authored = c.rooms[space.id];
    if (authored?.title) space.title = authored.title;
    if (authored?.accessibility) space.accessibility = { ...(space.accessibility || {}), ...authored.accessibility };
  }
  for (const entity of next.entities || []) {
    const authored = c.entities[entity.id]; if (!authored) continue;
    const content = { ...(entity.content || {}) };
    for (const field of ['title','creator','year','medium','description']) if (authored[field] !== null && authored[field] !== '') content[field] = authored[field];
    const artist = authored.artistId ? c.artists.find((a) => a.id === authored.artistId) : null;
    if (artist?.name) content.creator = artist.name;
    const allowed = SLOTS_FOR_KIND[entity.kind] || [], takes = (medium) => allowed.some((slot) => SLOT_MEDIA[slot].kind === medium);
    const chosen = (takes('video') && authored.video) || (takes('image') && authored.image) || null;
    if (chosen) content.media = mediaForWorld(chosen, content.media, c, resolveMedia);
    if (authored.projection && entity.kind === 'PROJECTION') {
      content.projection = { ...(content.projection || {}), ...authored.projection };
      if (content.media) content.media = { ...content.media, loop: authored.projection.loop };
    }

    // Schema 3 keeps physical presentation choices in the Studio project truth.
    // They MUST NOT be copied verbatim into the semantic World: keys such as
    // `material`, `finish`, `glass` and `frame` are presentation implementation
    // and INV-6 correctly rejects them. Preserve the stored config, while only
    // projecting the already-supported semantic mounting intent to Scene Kit.
    if (authored.presentation?.mount) {
      entity.representation = {
        ...(entity.representation || {}),
        hints: {
          ...(entity.representation?.hints || {}),
          mount: authored.presentation.mount
        }
      };
    }

    entity.content = content;
    const { width, height, depth } = authored.sizeCm;
    if (width > 0 && height > 0) entity.size = depth > 0 ? [width/100,height/100,depth/100] : [width/100,height/100];
    entity.accessibility = { ...(entity.accessibility || {}), ...authored.accessibility };
  }
  return next;
}

export function exportConfigJSON(config) { return JSON.stringify(normaliseConfig(config), null, 2); }
export function importConfigJSON(raw) {
  const parsed = JSON.parse(raw);
  if (parsed.schemaVersion && parsed.schemaVersion > CONFIG_SCHEMA_VERSION) throw new Error(`Esta configuración usa el esquema ${parsed.schemaVersion} y este Museo entiende hasta el ${CONFIG_SCHEMA_VERSION}.`);
  return normaliseConfig(parsed);
}
