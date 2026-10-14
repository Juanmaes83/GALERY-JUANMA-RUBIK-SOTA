#!/usr/bin/env node
/**
 * The audioguide's content model, without a browser.
 *
 *   node tests/audioguide.test.mjs     (npm test runs it before the browser smoke)
 *
 * What a visitor and an author rely on: every room and work has an item, a
 * language never borrows another's script or audio, what an author writes
 * survives a reload, and an audio file from an earlier session is reported as
 * gone instead of being offered for playback.
 */
import { readFileSync } from 'node:fs';
import {
  audioguideInventory, audioguideWorkIds, normaliseAudioguide, trackDraft, resolveTrack,
  audioAvailability, trackStatus, audioguideForWorld, formatDuration, parseRef
} from '../app/audioguide/audioguide-model.js';
import { normaliseConfig, applyConfigToWorld } from '../authoring/experience-config.js';

let failures = 0;
function check(id, claim, pass, detail = '') {
  if (!pass) failures += 1;
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${id.padEnd(28)} ${claim}${detail ? `  — ${detail}` : ''}`);
}

const world = JSON.parse(readFileSync(new URL('../worlds/museum-v1.world.json', import.meta.url), 'utf8'));
const base = world.metadata.audioguide;

/* -- inventory --------------------------------------------------------------- */

const items = audioguideInventory(world);
const rooms = items.filter((i) => i.scope === 'room');
const works = items.filter((i) => i.scope === 'work');
check('INVENTORY', 'Bienvenida, 7 salas y 16 obras: 24 pistas',
  items.length === 24 && items[0].ref === 'welcome' && rooms.length === 7 && works.length === 16,
  `${items.length} (${rooms.length} salas, ${works.length} obras)`);

const products = (world.entities || []).filter((e) => e.content?.product).map((e) => e.id);
check('NO-PRODUCTS', 'Los productos de la tienda no tienen cápsula',
  products.length > 0 && !audioguideWorkIds(world).some((id) => products.includes(id)), `${products.length} productos`);

const missing = items.filter((i) => {
  const { scope, id } = parseRef(i.ref);
  const item = scope === 'welcome' ? base.welcome : scope === 'room' ? base.rooms[id] : base.works[id];
  const t = item?.locales?.es;
  return !t?.title || !t?.transcript;
});
check('BASE-TEXT', 'Cada pista tiene título y transcripción base en español', missing.length === 0, missing.map((i) => i.ref).join(', '));

const claimsAudio = items.filter((i) => {
  const { scope, id } = parseRef(i.ref);
  const item = scope === 'welcome' ? base.welcome : scope === 'room' ? base.rooms[id] : base.works[id];
  return Object.values(item?.locales || {}).some((t) => t.audio);
});
check('NO-FAKE-AUDIO', 'El museo no declara ningún audio que no exista', claimsAudio.length === 0, claimsAudio.map((i) => i.ref).join(', '));

const allDraft = items.every((i) => resolveTrack(world, {}, i.ref, 'es').editorial === 'DRAFT');
check('BASE-DRAFT', 'Los textos base son borradores: ninguno se presenta como revisado', allDraft);

/* -- authoring: locales, inheritance, persistence ---------------------------- */

const ref = 'work:entity.artwork.marea-baja';
const config = normaliseConfig({});
const es = trackDraft(config, ref, 'es');
es.title = 'Marea baja, contada';
es.audio = { kind: 'audio', src: 'authored:asset-1', assetId: 'asset-1', name: 'marea.mp3', mimeType: 'audio/mpeg', bytes: 1000, durationMs: 42000 };
es.durationMs = 42000;
const en = trackDraft(config, ref, 'en');
en.title = 'Low tide';
en.transcript = 'English transcript.';

const rEs = resolveTrack(world, config, ref, 'es');
const rEn = resolveTrack(world, config, ref, 'en');
check('INHERIT', 'Un campo vacío hereda el texto base; uno escrito lo sustituye',
  rEs.title === 'Marea baja, contada' && rEs.transcript === base.works['entity.artwork.marea-baja'].locales.es.transcript && rEs.inherited.transcript && !rEs.inherited.title);
check('LOCALE-ISOLATION', 'Un idioma no toma el guion ni el audio de otro',
  rEn.title === 'Low tide' && rEn.audio === null && rEn.script === null && rEn.transcript === 'English transcript.', JSON.stringify({ audio: rEn.audio, script: rEn.script }));

const other = resolveTrack(world, config, 'work:entity.artwork.horizonte-interrumpido', 'es');
check('ITEM-ISOLATION', 'Editar una obra no cambia otra', other.audio === null && other.title !== 'Marea baja, contada');

// A reload is a JSON round trip of the saved project.
const reloaded = normaliseConfig(JSON.parse(JSON.stringify(config)));
const after = resolveTrack(world, reloaded, ref, 'es');
check('PERSIST', 'Título, duración y referencia de audio sobreviven a la recarga',
  after.title === 'Marea baja, contada' && after.durationMs === 42000 && after.audio?.src === 'authored:asset-1');

const junk = normaliseAudioguide({ welcome: { locales: { xx: { title: 'nope' }, es: { title: ' ', editorial: 'PUBLISHED' } } } });
check('NORMALISE', 'Idiomas desconocidos, textos vacíos y estados inventados se descartan',
  !junk.welcome.locales.xx && junk.welcome.locales.es.title === null && junk.welcome.locales.es.editorial === null);

/* -- availability and status -------------------------------------------------- */

const live = (r) => (r === 'authored:asset-1' ? 'blob:http://x/1' : null);
check('AVAILABLE-SESSION', 'Con el archivo en la sesión: disponible en este navegador',
  trackStatus(after, audioAvailability(after.audio, live)).key === 'AVAILABLE_SESSION');
check('STALE', 'Tras recargar, el archivo de otra sesión se declara no disponible, sin botón de reproducir',
  audioAvailability(after.audio, () => null).key === 'STALE' && trackStatus(after, audioAvailability(after.audio)).key === 'STALE_AUDIO');
check('PENDING', 'Sin archivo pero con texto: pendiente de audio',
  trackStatus(other, audioAvailability(other.audio)).key === 'PENDING_AUDIO');
const reviewed = { ...other, editorial: 'REVIEW' };
check('REVIEW', 'Lista para revisión sigue diciendo que falta el audio',
  /pendiente de audio/.test(trackStatus(reviewed, audioAvailability(null)).label));
check('DRAFT-EMPTY', 'Sin guion ni transcripción: borrador',
  trackStatus({ transcript: null, script: null }, audioAvailability(null)).key === 'DRAFT');

/* -- the World the visitor reads ---------------------------------------------- */

const visitorWorld = applyConfigToWorld(world, reloaded, () => null);
const vg = visitorWorld.metadata.audioguide;
const vEs = vg.works['entity.artwork.marea-baja'].locales.es;
check('VISITOR-STALE', 'El visitante recibe el estado real y ninguna URL inservible',
  vEs.status === 'STALE_AUDIO' && vEs.audio === null && !JSON.stringify(vg).includes('authored:'), vEs.status);
check('VISITOR-LOCALES', 'Se ofrecen los idiomas con texto o audio; un título suelto no basta', vg.locales.join(',') === 'es,en', vg.locales.join(','));
const withFile = audioguideForWorld(world, config, live).works['entity.artwork.marea-baja'].locales.es;
check('VISITOR-READY', 'Con el archivo en la sesión, el visitante recibe la URL reproducible',
  withFile.audio?.src === 'blob:http://x/1' && withFile.sessionOnly === true);
check('DURATION', 'Duración en minutos y segundos', formatDuration(42000) === '0:42' && formatDuration(95000) === '1:35' && formatDuration(0) === '');

console.log(failures ? `\n${failures} fallo(s)` : '\nOK');
process.exit(failures ? 1 : 0);
