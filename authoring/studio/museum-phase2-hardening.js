import { StudioShell } from './studio-shell.js';
import { ExperienceHUD } from '../../app/ui/hud.js';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
const ROOM_A11Y = [
  ['lift','Ascensor disponible'],
  ['accessibleWc','Aseo accesible cercano'],
  ['seating','Asientos disponibles'],
  ['quiet','Espacio tranquilo']
];

function cfg() { return window.__IW_STUDIO?.config || window.__IW_CONFIG || null; }

function ensureHardeningData(studio) {
  for (const space of studio.world.spaces || []) {
    studio.config.rooms[space.id] ||= {};
    studio.config.rooms[space.id].accessibility ||= {};
  }
}

function artistById(config, id) { return (config?.artists || []).find((a) => a.id === id); }
function docsForEntity(config, entityId) {
  const entity = config?.entities?.[entityId] || {};
  const ids = new Set(entity.documentIds || []);
  return (config?.documents || []).filter((d) => ids.has(d.id) || (d.entityIds || []).includes(entityId));
}
function entityTitle(studio, id) {
  const authored = studio.config.entities?.[id] || {};
  const source = (studio.world.entities || []).find((e) => e.id === id)?.content || {};
  return authored.title || source.title || id;
}

function enhanceVisitorCompact(studio) {
  if (studio.domain !== 'visitor') return;
  studio.root.querySelectorAll('.p2-cap[data-capability]').forEach((section) => {
    const id = section.dataset.capability;
    if (!['P2-MEMORY','P2-RESOURCES','P2-LANG','P2-SHOP','P2-SUPPORT'].includes(id)) return;
    const body = section.querySelector('.p1-cap__body');
    if (!body) return;
    const key = `p2compact:${id}`;
    const open = studio.opened.has(key);
    body.hidden = !open;
    section.classList.toggle('is-open', open);
    if (!section.querySelector('[data-p2h-toggle]')) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'p2h-toggle';
      button.dataset.p2hToggle = key;
      button.setAttribute('aria-expanded', String(open));
      button.innerHTML = `<span>${open ? 'Cerrar' : 'Personalizar más'}</span><i aria-hidden="true">${open ? '−' : '+'}</i>`;
      section.appendChild(button);
      button.addEventListener('click', () => {
        studio.opened.has(key) ? studio.opened.delete(key) : studio.opened.add(key);
        studio.render();
      });
    }
  });
}

function enhanceArtistAuthoring(studio) {
  if (studio.domain !== 'content') return;
  const artists = studio.config.artists || [];
  const rows = studio.root.querySelectorAll('[data-capability="P2-ARTISTS"] .p2-row');
  rows.forEach((row, index) => {
    const artist = artists[index];
    if (!artist || row.querySelector('[data-p2h-portrait]')) return;
    const field = document.createElement('label');
    field.className = 'st-f p2h-portrait-field';
    field.innerHTML = `<span class="st-l">Imagen / retrato</span><input type="url" data-p2h-portrait="${index}" value="${esc(artist.portraitUrl || '')}" placeholder="https://…"><small>Se muestra en el perfil del visitante cuando exista una URL pública.</small>`;
    const web = [...row.querySelectorAll('.st-f')].at(-1);
    web?.before(field);
    field.querySelector('input').addEventListener('input', (e) => {
      artist.portraitUrl = e.target.value;
      studio._markDirty();
    });
  });
}

function translationRecord(config, locale, entityId) {
  const t = config.languages?.translations || {};
  return t?.[locale]?.[entityId] || t?.[entityId]?.[locale] || {};
}
function languageCompleteness(studio, locale) {
  const config = studio.config;
  const ids = (studio.world.entities || []).filter((e) => ['ARTWORK','SCULPTURE','PROJECTION','AUDIO'].includes(e.kind)).map((e) => e.id);
  const fields = ['title','description','transcript','accessibility'];
  let complete = 0, total = ids.length * fields.length;
  for (const id of ids) {
    const authored = config.entities?.[id] || {};
    const source = (studio.world.entities || []).find((e) => e.id === id)?.content || {};
    const tr = translationRecord(config, locale, id);
    const isDefault = locale === config.languages.defaultLocale;
    const values = isDefault
      ? [authored.title || source.title, authored.description || source.description, authored.accessibility?.transcript || source.transcript, authored.accessibility?.description || source.accessibility?.description]
      : [tr.title, tr.description, tr.transcript, tr.accessibility || tr.accessibilityDescription];
    complete += values.filter((v) => String(v || '').trim()).length;
  }
  return { complete, total, percent: total ? Math.round((complete / total) * 100) : 0 };
}
function enhanceLanguageMatrix(studio) {
  if (studio.domain !== 'content') return;
  const body = studio.root.querySelector('[data-capability="P2-LANG-MODEL"] .p1-cap__body');
  if (!body || body.querySelector('.p2h-lang-matrix')) return;
  const locales = studio.config.languages?.locales || ['es'];
  const matrix = document.createElement('section');
  matrix.className = 'p2h-lang-matrix';
  matrix.innerHTML = `<div class="p2h-matrix-head"><b>Completitud editorial</b><span>Título · descripción · transcript · accesibilidad</span></div>${locales.map((locale) => {
    const c = languageCompleteness(studio, locale);
    return `<div class="p2h-lang-row"><b>${esc(locale.toUpperCase())}</b><div class="p2h-meter"><i style="width:${c.percent}%"></i></div><span>${c.percent}%</span><small>${c.complete}/${c.total}</small></div>`;
  }).join('')}<p class="st-note">La matriz mide contenido real por locale; no marca un idioma como listo sólo por haberlo añadido a la lista.</p>`;
  body.appendChild(matrix);
}

function roomAccessibilityHTML(studio, node) {
  const a = studio.config.rooms?.[node.id]?.accessibility || {};
  const stepFree = a.stepFree === true ? 'true' : a.stepFree === false ? 'false' : '';
  return studio._group('Accesibilidad de la sala', `
    <p class="st-note">Estos datos alimentan el cálculo de ruta accesible. “No declarado” no se interpreta como accesible ni como barrera.</p>
    <label class="st-f"><span class="st-l">Acceso sin escalones</span><select data-p2h-room-stepfree><option value="" ${stepFree===''?'selected':''}>No declarado</option><option value="true" ${stepFree==='true'?'selected':''}>Sí</option><option value="false" ${stepFree==='false'?'selected':''}>No</option></select></label>
    <div class="p2h-room-a11y">
      ${ROOM_A11Y.map(([key,label]) => `<label class="p1-check"><input type="checkbox" data-p2h-room-a11y="${key}" ${a[key] === true ? 'checked' : ''}><span>${esc(label)}</span></label>`).join('')}
    </div>
  `);
}

function bindRoomAccessibility(studio) {
  if (studio.domain !== 'build') return;
  studio.root.querySelector('[data-p2h-room-stepfree]')?.addEventListener('change', (event) => {
    const room = studio.config.rooms[studio.selectedId] ||= {};
    room.accessibility ||= {};
    const raw = event.target.value;
    if (raw === '') delete room.accessibility.stepFree;
    else room.accessibility.stepFree = raw === 'true';
    studio._markDirty();
  });
  studio.root.querySelectorAll('[data-p2h-room-a11y]').forEach((input) => input.addEventListener('change', () => {
    const room = studio.config.rooms[studio.selectedId] ||= {};
    room.accessibility ||= {};
    room.accessibility[input.dataset.p2hRoomA11y] = input.checked;
    studio._markDirty();
  }));
}

function runtimeEntityId(hud) { return hud?.runtime?.state?.focusedEntityId || null; }
function renderRuntimeConnections(hud) {
  const config = cfg();
  const id = runtimeEntityId(hud);
  const host = hud?.el?.labelCard?.querySelector('figcaption');
  if (!config || !id || !host) return;
  host.querySelector('.iw-p2h-context')?.remove();
  const authored = config.entities?.[id] || {};
  const artist = artistById(config, authored.artistId);
  const docs = docsForEntity(config, id);
  if (!artist && !docs.length) return;

  const studio = window.__IW_STUDIO;
  const related = artist && studio
    ? Object.entries(config.entities || {}).filter(([eid,e]) => eid !== id && e.artistId === artist.id).map(([eid]) => entityTitle(studio, eid)).slice(0,4)
    : [];
  const section = document.createElement('section');
  section.className = 'iw-p2h-context';
  section.innerHTML = `${artist ? `<article class="iw-p2h-artist">${artist.portraitUrl ? `<img src="${esc(artist.portraitUrl)}" alt="Retrato de ${esc(artist.name || 'artista')}">` : ''}<div><small>ARTISTA</small><h4>${esc(artist.name || 'Artista')}</h4>${artist.nationality ? `<p>${esc(artist.nationality)}</p>` : ''}${artist.biography ? `<p>${esc(artist.biography)}</p>` : ''}${related.length ? `<p><b>Obras relacionadas:</b> ${related.map(esc).join(' · ')}</p>` : ''}${artist.website ? `<a href="${esc(artist.website)}" target="_blank" rel="noopener">Más sobre el artista ↗</a>` : ''}</div></article>` : ''}${docs.length ? `<div class="iw-p2h-docs"><small>DOCUMENTACIÓN</small>${docs.map((d) => d.url ? `<a href="${esc(d.url)}" target="_blank" rel="noopener">${esc(d.title || 'Documento')} ↗</a>` : `<span>${esc(d.title || 'Documento')}</span>`).join('')}</div>` : ''}`;
  host.appendChild(section);
}

function hardenFavoriteInteraction(hud) {
  const button = hud?.el?.labelCard?.querySelector('[data-p2-favorite]');
  if (!button) return;
  button.type = 'button';
  button.setAttribute('aria-label', button.textContent.trim());
  button.dataset.p2hReady = 'true';
}

let installed = false;
export function installMuseumPhase2Hardening() {
  if (installed) return;
  installed = true;

  const room0 = StudioShell.prototype._roomEditor;
  StudioShell.prototype._roomEditor = function phase2HardenedRoom(node) {
    ensureHardeningData(this);
    return room0.call(this, node) + roomAccessibilityHTML(this, node);
  };

  const render0 = StudioShell.prototype.render;
  StudioShell.prototype.render = function phase2HardenedRender(...args) {
    ensureHardeningData(this);
    const result = render0.apply(this, args);
    document.body.dataset.studioDomain = this.domain;
    this.root.dataset.domain = this.domain;
    enhanceVisitorCompact(this);
    enhanceArtistAuthoring(this);
    enhanceLanguageMatrix(this);
    bindRoomAccessibility(this);
    return result;
  };

  const hudUpdate0 = ExperienceHUD.prototype.update;
  ExperienceHUD.prototype.update = function phase2HardenedHudUpdate(...args) {
    const result = hudUpdate0.apply(this, args);
    hardenFavoriteInteraction(this);
    renderRuntimeConnections(this);
    return result;
  };

  const show0 = ExperienceHUD.prototype._showDetail;
  ExperienceHUD.prototype._showDetail = function phase2HardenedShowDetail(...args) {
    const result = show0.apply(this, args);
    hardenFavoriteInteraction(this);
    renderRuntimeConnections(this);
    return result;
  };

  const studio = window.__IW_STUDIO;
  if (studio) studio.render();
  if (window.__IW?.hud) {
    hardenFavoriteInteraction(window.__IW.hud);
    renderRuntimeConnections(window.__IW.hud);
  }
  document.documentElement.dataset.museumPhase2Hardening = 'ready';
}
