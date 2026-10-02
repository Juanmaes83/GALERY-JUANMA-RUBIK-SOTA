/**
 * Audioguide — content model.
 *
 * Three levels, one shape: the welcome, an introduction per room and a capsule
 * per work. Each item holds one track per language; a language never borrows
 * another's script, transcript or audio.
 *
 * Where the content lives:
 *   - the World (`metadata.audioguide`) holds the museum's base texts;
 *   - the Studio project (`config.audioguide`) holds what an author changed,
 *     field by field, exactly like a work's title: an empty field inherits;
 *   - `audioguideForWorld()` merges both into the World the visitor reads,
 *     resolving each audio reference to something playable — or to nothing.
 *
 * The status of a track is computed, never claimed: an audio file the author
 * attached in an earlier session is gone (uploads last a session), and the
 * track says so instead of offering a play button for a file that does not
 * exist.
 *
 * No DOM, no Three.js: the Studio, the visitor and the Node tests share it.
 */

export const AUDIOGUIDE_LOCALES = Object.freeze({
  es: 'Español', en: 'English', ca: 'Català', eu: 'Euskara', gl: 'Galego',
  fr: 'Français', de: 'Deutsch', it: 'Italiano', pt: 'Português'
});

export const EDITORIAL = Object.freeze({
  DRAFT: 'Borrador',
  REVIEW: 'Lista para revisión'
});

/** Editorial guidance, in seconds: a suggestion shown to authors, never enforced. */
export const SUGGESTED_SECONDS = Object.freeze({
  welcome: [30, 45], room: [45, 90], work: [30, 60]
});

const TRACK_FIELDS = ['title', 'script', 'transcript', 'credits', 'rights'];
const text = (v, max) => String(v ?? '').slice(0, max);
const isFilled = (v) => v !== null && v !== undefined && String(v).trim() !== '';

/** The works an audioguide covers: what the visitor can look at closely, minus shop products. */
export function audioguideWorkIds(world) {
  return (world?.entities || [])
    .filter((e) => e.interaction?.focusable && !e.content?.product)
    .map((e) => e.id);
}

/** Every room has visitors; each may have an introduction. World order is the walk order. */
export function audioguideRoomIds(world) {
  return (world?.spaces || []).map((s) => s.id);
}

/**
 * The full inventory, as refs: `welcome`, `room:<spaceId>`, `work:<entityId>`.
 * Ids may contain dots, so a ref splits on the first colon only.
 */
export function audioguideInventory(world) {
  const spaces = new Map((world?.spaces || []).map((s) => [s.id, s]));
  const entities = new Map((world?.entities || []).map((e) => [e.id, e]));
  return [
    { ref: 'welcome', scope: 'welcome', id: null, label: 'Bienvenida', spaceId: world?.startSpaceId || null },
    ...audioguideRoomIds(world).map((id) => ({ ref: `room:${id}`, scope: 'room', id, label: spaces.get(id)?.title || id, spaceId: id })),
    ...audioguideWorkIds(world).map((id) => ({
      ref: `work:${id}`, scope: 'work', id, label: entities.get(id)?.content?.title || id, spaceId: entities.get(id)?.spaceId || null
    }))
  ];
}

export function parseRef(ref) {
  const s = String(ref || '');
  if (s === 'welcome') return { scope: 'welcome', id: null };
  const at = s.indexOf(':');
  return at < 0 ? { scope: null, id: null } : { scope: s.slice(0, at), id: s.slice(at + 1) };
}

/* -- normalisation ---------------------------------------------------------- */

function normaliseAudio(audio) {
  if (!audio || typeof audio !== 'object' || !audio.src) return null;
  return {
    kind: 'audio', src: String(audio.src), assetId: audio.assetId || null, name: text(audio.name, 240),
    mimeType: audio.mimeType || null, bytes: Number(audio.bytes) || 0, durationMs: Number(audio.durationMs) || 0
  };
}

export function normaliseTrack(t = {}) {
  return {
    title: isFilled(t.title) ? text(t.title, 160) : null,
    script: isFilled(t.script) ? text(t.script, 6000) : null,
    transcript: isFilled(t.transcript) ? text(t.transcript, 6000) : null,
    credits: isFilled(t.credits) ? text(t.credits, 600) : null,
    rights: isFilled(t.rights) ? text(t.rights, 600) : null,
    editorial: EDITORIAL[t.editorial] ? t.editorial : null,
    durationMs: Number(t.durationMs) > 0 ? Math.round(Number(t.durationMs)) : null,
    audio: normaliseAudio(t.audio)
  };
}

function normaliseLocales(locales) {
  const out = {};
  for (const [code, track] of Object.entries(locales || {})) {
    if (AUDIOGUIDE_LOCALES[code]) out[code] = normaliseTrack(track);
  }
  return out;
}

export function normaliseAudioguide(a = {}) {
  const rooms = {};
  for (const [id, r] of Object.entries(a?.rooms || {})) {
    rooms[id] = { order: Number.isFinite(Number(r?.order)) && r?.order !== null && r?.order !== '' ? Number(r.order) : null, locales: normaliseLocales(r?.locales) };
  }
  const works = {};
  for (const [id, w] of Object.entries(a?.works || {})) works[id] = { locales: normaliseLocales(w?.locales) };
  return { welcome: { locales: normaliseLocales(a?.welcome?.locales) }, rooms, works };
}

function itemOf(guide, ref) {
  const { scope, id } = parseRef(ref);
  if (scope === 'welcome') return guide?.welcome || null;
  if (scope === 'room') return guide?.rooms?.[id] || null;
  if (scope === 'work') return guide?.works?.[id] || null;
  return null;
}

/** The Studio's draft for one item and language, created on first write. */
export function trackDraft(config, ref, locale) {
  config.audioguide = config.audioguide || { welcome: { locales: {} }, rooms: {}, works: {} };
  const g = config.audioguide;
  const { scope, id } = parseRef(ref);
  let item;
  if (scope === 'welcome') item = g.welcome = g.welcome || { locales: {} };
  else if (scope === 'room') item = g.rooms[id] = g.rooms[id] || { order: null, locales: {} };
  else if (scope === 'work') item = g.works[id] = g.works[id] || { locales: {} };
  else throw new Error(`Referencia de audioguía desconocida: ${ref}`);
  item.locales = item.locales || {};
  item.locales[locale] = item.locales[locale] || normaliseTrack({});
  return item.locales[locale];
}

/* -- resolution ------------------------------------------------------------- */

/**
 * One track as the visitor should get it: each field from the author if the
 * author wrote it, otherwise from the museum's base text. The audio is never
 * inherited across languages.
 */
export function resolveTrack(world, config, ref, locale) {
  const base = itemOf(world?.metadata?.audioguide, ref)?.locales?.[locale] || {};
  const own = itemOf(config?.audioguide, ref)?.locales?.[locale] || {};
  const out = {};
  for (const f of TRACK_FIELDS) out[f] = isFilled(own[f]) ? own[f] : isFilled(base[f]) ? base[f] : null;
  out.editorial = own.editorial || base.editorial || 'DRAFT';
  out.durationMs = own.durationMs || base.durationMs || null;
  out.audio = own.audio || base.audio || null;
  out.inherited = Object.fromEntries(TRACK_FIELDS.map((f) => [f, !isFilled(own[f]) && isFilled(base[f])]));
  return out;
}

/**
 * Whether a track's audio can actually be played here.
 *   NONE  — no file attached;
 *   STALE — a file uploaded in an earlier session, gone with that session;
 *   READY — playable now (`src` is the URL to give the player).
 */
export function audioAvailability(audio, resolveMedia = () => null) {
  if (!audio?.src) return { key: 'NONE', src: null };
  if (String(audio.src).startsWith('authored:')) {
    const live = resolveMedia(audio.src);
    return live ? { key: 'READY', src: live, sessionOnly: true } : { key: 'STALE', src: null };
  }
  return { key: 'READY', src: audio.src, sessionOnly: false };
}

/** The one-line status a visitor or an author reads, derived from the track. */
export function trackStatus(track, availability) {
  const hasText = isFilled(track?.transcript) || isFilled(track?.script);
  if (availability?.key === 'READY') {
    return availability.sessionOnly
      ? { key: 'AVAILABLE_SESSION', label: 'Disponible en este navegador (solo esta sesión)' }
      : { key: 'AVAILABLE', label: 'Disponible' };
  }
  if (availability?.key === 'STALE') return { key: 'STALE_AUDIO', label: 'Audio no disponible: el archivo era de otra sesión' };
  if (!hasText) return { key: 'DRAFT', label: 'Borrador · sin guion' };
  if (track.editorial === 'REVIEW') return { key: 'REVIEW', label: 'Lista para revisión · pendiente de audio' };
  return { key: 'PENDING_AUDIO', label: 'Pendiente de audio' };
}

/** Languages that have any content for the museum, default first. */
export function audioguideLocales(world, config) {
  const seen = new Set(['es']);
  const collect = (guide) => {
    if (!guide) return;
    for (const item of [guide.welcome, ...Object.values(guide.rooms || {}), ...Object.values(guide.works || {})]) {
      for (const [code, t] of Object.entries(item?.locales || {})) {
        if (AUDIOGUIDE_LOCALES[code] && (isFilled(t?.transcript) || isFilled(t?.script) || t?.audio?.src)) seen.add(code);
      }
    }
  };
  collect(world?.metadata?.audioguide);
  collect(config?.audioguide);
  return [...seen];
}

/**
 * The audioguide the visitor reads, merged and resolved, written into
 * `world.metadata.audioguide` by `applyConfigToWorld`. Same shape as the base,
 * plus per track `availability` and `status`; `audio.src` is replaced by the
 * playable URL or removed.
 */
export function audioguideForWorld(world, config, resolveMedia = () => null) {
  const locales = audioguideLocales(world, config);
  const rooms = {};
  const works = {};
  const build = (ref) => Object.fromEntries(locales.map((code) => {
    const t = resolveTrack(world, config, ref, code);
    const availability = audioAvailability(t.audio, resolveMedia);
    const status = trackStatus(t, availability);
    const audio = availability.key === 'READY' ? { ...t.audio, src: availability.src } : null;
    return [code, { ...t, audio, availability: availability.key, sessionOnly: Boolean(availability.sessionOnly), status: status.key, statusLabel: status.label }];
  }));
  const configRooms = config?.audioguide?.rooms || {};
  const baseRooms = world?.metadata?.audioguide?.rooms || {};
  for (const id of audioguideRoomIds(world)) {
    const order = configRooms[id]?.order ?? baseRooms[id]?.order ?? null;
    rooms[id] = { order, locales: build(`room:${id}`) };
  }
  for (const id of audioguideWorkIds(world)) works[id] = { locales: build(`work:${id}`) };
  return { defaultLocale: 'es', locales, welcome: { locales: build('welcome') }, rooms, works };
}

export function formatDuration(ms) {
  if (!ms || ms < 0) return '';
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
