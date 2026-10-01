/**
 * Wet Paint — native Museum Studio controls for the 02 PAINTERLY artwork.
 *
 * Same integration pattern as authoring/studio/visitor-phase1.js: extend
 * StudioShell._entityEditor to append a per-entity control group, and _bind to
 * wire it. The controls are Museum-native (accordion, .st-* components, Spanish)
 * and drive the HIDDEN Wet Paint engine (window.__WET_PAINT_ENGINE). The author
 * never leaves the Studio panel and never sees the donor UI.
 *
 * Accordion: from a first glance you see every section (collapsed headers); open
 * only what you need. Every change reflects in the 02 artwork in the central room.
 */

import { StudioShell } from './studio-shell.js';
import { WetPaintStore } from '../../experiences/wet-paint-store.js';
import { MEDIA_SLOT } from '../experience-config.js';
const ACC = [
    { id: 'fuente', title: 'Fuente y biblioteca', open: true },
    { id: 'visual', title: 'Visualización', open: false },
    { id: 'pincelada', title: 'Pincelada', open: false },
    { id: 'crecimiento', title: 'Crecimiento', open: false },
    { id: 'salida', title: 'Salida', open: false },
];
const MODES = { 5: 'Solo pinceladas', 3: 'Original', 0: 'Mezcla', 1: 'Boceto de flujo' };
const QUALITY = { balanced: 'Fluida', high: 'Alta', ultra: 'Máxima' };
const LAYERS = ['Gruesa', 'Media', 'Fina'];
const SLIDERS = [
    { k: 'strokeSize', label: 'Tamaño de trazo', min: 0.35, max: 3.2, step: 0.01, def: 1 },
    { k: 'length', label: 'Longitud de trazo', min: 0.55, max: 6, step: 0.01, def: 1.48 },
    { k: 'strokeCountK', label: 'Número de trazos (miles)', min: 3, max: 24, step: 1, def: 14 },
    { k: 'impasto', label: 'Empaste', min: 0, max: 1.5, step: 0.01, def: 0.04 },
    { k: 'dryness', label: 'Sequedad', min: 0, max: 1, step: 0.01, def: 0.69 },
    { k: 'viscosity', label: 'Viscosidad', min: 0, max: 1, step: 0.01, def: 0.58 },
];
const DEFAULTS = { strokeSize: 1, length: 1.48, strokeCountK: 14, impasto: 0.04, dryness: 0.69, viscosity: 0.58, quality: 'high', viewMode: '5', brushLayers: [true, true, true] };

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eng = () => window.__WET_PAINT_ENGINE || null;

function ensureStyle() {
    if (document.getElementById('wp-studio-controls-css')) return;
    const s = document.createElement('style');
    s.id = 'wp-studio-controls-css';
    s.textContent = `
    .wp-acc{border:1px solid var(--st-line,rgba(226,219,205,.14));border-radius:10px;margin:8px 0;overflow:hidden;background:var(--st-raise,#1a1917)}
    .wp-acc__head{width:100%;display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:transparent;border:0;color:var(--st-ink,#ece7dd);font:600 12px/1 var(--st-sans,'Helvetica Neue',Inter,system-ui,sans-serif);letter-spacing:.07em;text-transform:uppercase;cursor:pointer}
    .wp-acc__chev{color:var(--st-dim,#9a9389);transition:transform .15s ease}
    .wp-acc[data-open="0"] .wp-acc__chev{transform:rotate(-90deg)}
    .wp-acc[data-open="0"] .wp-acc__body{display:none}
    .wp-acc__body{padding:0 14px 14px}
    .wp-slider{margin:9px 0}
    .wp-slider .st-l{display:flex;justify-content:space-between}
    .wp-slider input[type=range]{width:100%;accent-color:var(--st-accent,#bfa06a)}
    .wp-lib{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:8px}
    .wp-card{display:flex;flex-direction:column;gap:5px;background:var(--st-ground,#100f0e);border:1px solid var(--st-line,rgba(226,219,205,.14));border-radius:9px;padding:6px;cursor:pointer;color:var(--st-ink,#ece7dd)}
    .wp-card:hover,.wp-card[aria-current=true]{border-color:var(--st-accent,#bfa06a)}
    .wp-card img{width:100%;aspect-ratio:1/1;object-fit:cover;border-radius:6px;display:block}
    .wp-card span{font-size:10px;line-height:1.2;color:var(--st-dim,#9a9389)}
    .wp-drop{border:1px dashed var(--st-line-strong,rgba(226,219,205,.3));border-radius:10px;padding:12px;text-align:center;color:var(--st-dim,#9a9389);cursor:pointer;font-size:12px}
    .wp-row{display:flex;gap:8px;margin-top:8px;flex-wrap:wrap}
    .wp-chip{flex:1;min-width:64px;text-align:center;border:1px solid var(--st-line,rgba(226,219,205,.14));border-radius:8px;padding:8px;font-size:11px;cursor:pointer;color:var(--st-ink,#ece7dd);background:var(--st-ground,#100f0e)}
    .wp-chip[aria-pressed=true]{border-color:var(--st-accent,#bfa06a);background:var(--st-accent-soft,rgba(191,160,106,.13))}
    .wp-status{font-size:11px;color:var(--st-dim,#9a9389);margin-top:8px;min-height:14px}
    .wp-primary{background:var(--st-accent-soft,rgba(191,160,106,.16));border:1px solid var(--st-accent,#bfa06a);color:var(--st-ink,#ece7dd)}
    .wp-wetpaint{margin-top:14px;border-top:1px solid var(--st-line,rgba(226,219,205,.14));padding-top:12px}
    .wp-title{margin:0 0 4px;font:700 13px/1 var(--st-sans,'Helvetica Neue',Inter,system-ui,sans-serif);letter-spacing:.08em;text-transform:uppercase;color:var(--st-ink,#ece7dd)}
    `;
    document.head.appendChild(s);
}

function accOpen(studio, id, fallback) {
    const key = `wp:acc:${id}`;
    if (studio.opened.has(`${key}:on`)) return true;
    if (studio.opened.has(`${key}:off`)) return false;
    return fallback;
}

function group(studio, sec, body) {
    const open = accOpen(studio, sec.id, sec.open);
    return `<section class="wp-acc" data-open="${open ? '1' : '0'}">
      <button type="button" class="wp-acc__head" data-wp-acc="${sec.id}" aria-expanded="${open}">
        <span>${esc(sec.title)}</span><span class="wp-acc__chev" aria-hidden="true">▾</span>
      </button>
      <div class="wp-acc__body">${body}</div>
    </section>`;
}

function fuenteBody(studio) {
    const scenes = eng()?.scenes?.() || [];
    const cards = scenes.map((s) => `<button type="button" class="wp-card" data-wp-scene="${esc(s.id)}" title="${esc(s.title)}">
        <img src="${esc(s.thumb)}" alt="" loading="lazy"><span>${esc(s.title)}</span></button>`).join('');
    const museumItems = (studio?.catalogue?.byCategory?.IMAGES || [])
        .filter((item) => item.state === 'READY' && item.url)
        .map((item) => `<button type="button" class="wp-card" data-wp-museum-source="${esc(item.reference)}" title="Usar ${esc(item.name)} en Wet Paint">
          <img src="${esc(item.thumb || item.url)}" alt="" loading="lazy"><span>${esc(item.name)}</span></button>`).join('');
    return `<p class="st-note">Sube una imagen o reutiliza una imagen ya guardada en este proyecto Museum.</p>
      <label class="wp-drop" data-wp-uploadlabel>＋ Subir imagen o modelo GLB<input type="file" accept="image/*,.glb" data-wp-upload hidden></label>
      <span class="st-l" style="display:block;margin-top:12px">Biblioteca Museum · ${(studio?.catalogue?.byCategory?.IMAGES || []).length} imágenes</span>
      <div class="wp-lib">${museumItems || '<p class="st-note">Todavía no hay imágenes reutilizables.</p>'}</div>
      <span class="st-l" style="display:block;margin-top:12px">Colección Van Gogh · ${scenes.length} obras</span>
      <div class="wp-lib">${cards}</div>`;
}

function visualBody(params) {
    const modeChips = Object.entries(MODES).map(([v, label]) =>
        `<button type="button" class="wp-chip" data-wp-mode="${v}" aria-pressed="${String(params.viewMode) === v}">${esc(label)}</button>`).join('');
    const layerChips = LAYERS.map((label, i) =>
        `<button type="button" class="wp-chip" data-wp-layer="${i}" aria-pressed="${params.brushLayers?.[i] !== false}">${esc(label)}</button>`).join('');
    return `<span class="st-l">Modo</span><div class="wp-row">${modeChips}</div>
      <span class="st-l" style="display:block;margin-top:10px">Capas de pincel</span><div class="wp-row">${layerChips}</div>`;
}

function pinceladaBody(params) {
    const q = Object.entries(QUALITY).map(([v, label]) => `<option value="${v}" ${params.quality === v ? 'selected' : ''}>${esc(label)}</option>`).join('');
    const quality = `<label class="st-f"><span class="st-l">Calidad</span><select data-wp-quality>${q}</select></label>`;
    const sliders = SLIDERS.map((s) => {
        const val = params[s.k] != null ? params[s.k] : s.def;
        return `<label class="st-f wp-slider"><span class="st-l">${esc(s.label)}<em data-wp-out="${s.k}" style="color:var(--st-accent,#bfa06a);font-style:normal">${esc(val)}</em></span>
          <input type="range" min="${s.min}" max="${s.max}" step="${s.step}" value="${esc(val)}" data-wp-slider="${s.k}"></label>`;
    }).join('');
    return quality + sliders;
}

function crecimientoBody(direction) {
    return `<span class="st-l">Dirección de la transición</span>
      <div class="wp-row">
        <button type="button" class="wp-chip" data-wp-dir="normal" aria-pressed="${direction !== 'inverted'}">Imagen → efecto</button>
        <button type="button" class="wp-chip" data-wp-dir="inverted" aria-pressed="${direction === 'inverted'}">Efecto → imagen</button>
      </div>
      <div class="wp-row"><button type="button" class="st-b wp-primary" data-wp-act="play">▶ Reproducir transición</button></div>
      <p class="st-note">La animación se ve en el cuadro, en la sala.</p>`;
}

function salidaBody() {
    return `<div class="wp-row">
        <button type="button" class="st-b" data-wp-act="play">▶ Previsualizar transición</button>
      </div>
      <div class="wp-row">
        <button type="button" class="st-b wp-primary" data-wp-act="save">Guardar y aplicar</button>
      </div>
      <div class="wp-row">
        <button type="button" class="st-b st-b--small" data-wp-act="exportpng">Exportar PNG</button>
        <button type="button" class="st-b st-b--small" data-wp-act="exportvideo">Exportar vídeo</button>
      </div>`;
}

// Write the applied Wet Paint result into the Museum media of the artwork, so it
// also shows in Contenido → Medios, in exports and after a preview rebuild.
async function writeResultToMuseumMedia(studio, entityId, dataUrl) {
    if (!studio || !entityId || !dataUrl) return;
    try {
        const blob = await (await fetch(dataUrl)).blob();
        const file = new File([blob], `wetpaint-${entityId.split('.').pop()}.jpg`, { type: blob.type || 'image/jpeg' });
        const asset = await studio.vault.accept(file, { kind: 'image' });
        if (!asset || asset.state === 'ERROR') return;
        const holder = studio._entityDraft(entityId);
        holder.image = {
            kind: 'image', src: asset.reference, assetId: asset.id, name: asset.name,
            mimeType: asset.mimeType, bytes: asset.bytes, width: asset.width, height: asset.height, durationMs: 0,
        };
        studio._markDirty();
        studio.render();
    } catch (e) { console.warn('[WetPaint] write Museum media failed', e); }
}

// Wet Paint is a capability of the itinerant room (Sala 4) only. Classic
// galleries (A/B) keep their normal Studio editor with no Wet Paint controls.
const WET_PAINT_ENTITY_PREFIX = 'entity.itinerant.';

function wetPaintEditor(studio, node) {
    // Every itinerant artwork is an independent Wet Paint cuadro.
    if (node?.kind !== 'ENTITY' || node.entityKind !== 'ARTWORK') return '';
    if (!String(node.id || '').startsWith(WET_PAINT_ENTITY_PREFIX)) return '';
    ensureStyle();
    const stored = WetPaintStore.get(node.id) || {};
    const params = { ...DEFAULTS, ...(stored.params || {}) };
    const hasSource = Boolean(stored.resultDataUrl);
    const direction = eng()?.getDirection?.() || 'normal';
    const hint = hasSource
        ? '<p class="st-note">Proceso: <b>1</b> Fuente · <b>2</b> Efecto · <b>3</b> Reproducir transición · <b>4</b> Guardar y aplicar.</p>'
        : '<p class="st-note" style="color:var(--st-warn,#d8b45e)"><b>Paso 1:</b> sube una imagen o elige una obra en “Fuente y biblioteca”. El cuadro animará la imagen → efecto automáticamente.</p>';
    const secBody = {
        fuente: fuenteBody(studio),
        visual: visualBody(params),
        pincelada: pinceladaBody(params),
        crecimiento: crecimientoBody(direction),
        salida: salidaBody(),
    };
    const body = ACC.map((sec) => group(studio, sec, secBody[sec.id])).join('');
    return `<section class="wp-wetpaint" aria-label="Wet Paint" data-wp-entity="${node.id}">
      <h3 class="wp-title">Wet Paint</h3>
      <p class="st-note">Personaliza el efecto por secciones. Abre solo lo que necesites; el resultado se refleja en esta obra en la sala.</p>
      ${hint}
      ${body}
      <div class="wp-status" data-wp-status></div>
    </section>`;
}

let statusListener = null;
function bindWetPaint(studio, scope) {
    const root = scope || studio.root;
    const group = root.querySelector('.wp-wetpaint');
    if (!group) return;
    const e = eng();
    // Point the shared engine at the cuadro being edited.
    if (e && group.dataset.wpEntity) e.setActiveEntity(group.dataset.wpEntity);

    root.querySelectorAll('[data-wp-acc]').forEach((el) => el.addEventListener('click', () => {
        const id = el.dataset.wpAcc;
        const on = `wp:acc:${id}:on`;
        const off = `wp:acc:${id}:off`;
        const isOpen = el.closest('.wp-acc')?.dataset.open === '1';
        studio.opened.delete(on); studio.opened.delete(off);
        studio.opened.add(isOpen ? off : on);
        studio.render();
    }));
    if (!e) return;

    root.querySelectorAll('[data-wp-scene]').forEach((el) => el.addEventListener('click', () => e.syncFromLibrary(el.dataset.wpScene)));
    root.querySelectorAll('[data-wp-museum-source]').forEach((el) => el.addEventListener('click', async () => {
        const reference = el.dataset.wpMuseumSource;
        const item = studio.catalogue.items.find((candidate) => candidate.reference === reference);
        if (!item?.url) return;
        const status = root.querySelector('[data-wp-status]');
        if (status) status.textContent = 'Preparando imagen guardada…';
        try {
            studio._reuse(reference, MEDIA_SLOT.ARTWORK_IMAGE);
            const blob = await (await fetch(item.url)).blob();
            const file = new File([blob], item.name || 'museum-source.jpg', { type: blob.type || 'image/jpeg' });
            await e.processFromEditor(file);
            studio.render();
        } catch (error) {
            console.error('[WetPaint] Museum Library source failed', error);
            if (status) status.textContent = 'No se pudo usar la imagen guardada';
        }
    }));
    root.querySelectorAll('[data-wp-upload]').forEach((el) => el.addEventListener('change', () => { const f = el.files?.[0]; if (f) e.processFromEditor(f); }));
    root.querySelectorAll('[data-wp-mode]').forEach((el) => el.addEventListener('click', () => { e.setViewMode(el.dataset.wpMode); root.querySelectorAll('[data-wp-mode]').forEach((b) => b.setAttribute('aria-pressed', b === el)); }));
    root.querySelectorAll('[data-wp-layer]').forEach((el) => el.addEventListener('click', () => { const on = el.getAttribute('aria-pressed') !== 'true'; el.setAttribute('aria-pressed', on); e.setBrushLayer(Number(el.dataset.wpLayer), on); }));
    root.querySelectorAll('[data-wp-quality]').forEach((el) => el.addEventListener('change', () => e.setQuality(el.value)));
    root.querySelectorAll('[data-wp-slider]').forEach((el) => el.addEventListener('input', () => {
        const out = root.querySelector(`[data-wp-out="${el.dataset.wpSlider}"]`); if (out) out.textContent = el.value;
        e.setParam(el.dataset.wpSlider, el.value);
    }));
    root.querySelectorAll('[data-wp-dir]').forEach((el) => el.addEventListener('click', () => {
        e.setDirection(el.dataset.wpDir);
        root.querySelectorAll('[data-wp-dir]').forEach((b) => b.setAttribute('aria-pressed', b === el));
        e.playTransition();
    }));
    const entityId = group.dataset.wpEntity;
    root.querySelectorAll('[data-wp-act]').forEach((el) => el.addEventListener('click', async () => {
        const a = el.dataset.wpAct;
        if (a === 'play') e.playTransition();
        else if (a === 'save') { await e.saveAndApply(); await writeResultToMuseumMedia(studio, entityId, e.getFinalFrame(entityId)); }
        else if (a === 'exportpng') e.exportPng();
        else if (a === 'exportvideo') e.exportVideo();
    }));

    // Live status line (processing / applied) reflected from the engine.
    const status = root.querySelector('[data-wp-status]');
    if (status && !statusListener) {
        statusListener = (ev) => {
            const el2 = document.querySelector('[data-wp-status]'); if (!el2) return;
            const map = { processing: 'Preparando la fuente…', playing: 'Reproduciendo transición…', result: 'Transición lista ✓ (pulsa Guardar y aplicar para fijarla)', saved: 'Guardado y aplicado ✓', error: 'No se pudo aplicar', nosource: 'Elige o sube una fuente primero', ready: '' };
            el2.textContent = map[ev.detail?.kind] ?? '';
        };
        window.addEventListener('wetpaint:status', statusListener);
    }
}

let patched = false;
export function installWetPaintStudioControls() {
    if (patched) return;
    patched = true;
    const originalEntity = StudioShell.prototype._entityEditor;
    StudioShell.prototype._entityEditor = function (node) {
        const controls = wetPaintEditor(this, node);
        return controls ? controls + originalEntity.call(this, node) : originalEntity.call(this, node);
    };
    const originalBind = StudioShell.prototype._bind;
    StudioShell.prototype._bind = function (scope = this.root) {
        originalBind.call(this, scope);
        try { bindWetPaint(this, scope); } catch (e) { console.warn('[WetPaint controls] bind', e); }
    };
    // A preview / apply rebuilds the room from config and resets the plates; re-apply
    // the stored Wet Paint results so what you configured is what you see.
    const originalApply = StudioShell.prototype._apply;
    StudioShell.prototype._apply = async function (...args) {
        const r = await originalApply.apply(this, args);
        try { await window.__WET_PAINT_ENGINE?.restoreAll?.(); } catch { /* noop */ }
        return r;
    };
    const originalStart = StudioShell.prototype._start;
    if (originalStart) {
        StudioShell.prototype._start = async function (...args) {
            const r = await originalStart.apply(this, args);
            setTimeout(() => { try { window.__WET_PAINT_ENGINE?.restoreAll?.(); } catch { /* noop */ } }, 1200);
            return r;
        };
    }
    const studio = window.__IW_STUDIO;
    if (studio) studio.render();
}
