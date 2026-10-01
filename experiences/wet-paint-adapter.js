/**
 * Wet Paint — per-artwork engine adapter (no UI).
 *
 * The donor (`wet-paint-flow` @ 0b9ba9a, preserved under ./wet-paint-flow/) runs
 * intact as a HIDDEN engine in an off-screen iframe. Every ARTWORK is independent:
 * you give each cuadro a source (upload or Van Gogh collection) and its Wet Paint
 * result is applied to that SAME cuadro's plate. One shared engine processes the
 * active cuadro on demand; per-cuadro state (source, params, result) is persisted
 * so authoring and the visitor show one truth and survive reloads/previews.
 *
 * Renders NO user interface — the Museum UI lives in the Studio editor
 * (authoring/studio/wet-paint-studio-controls.js). Habitación 3 philosophy:
 * DONOR = technology, MUSEUM = experience; the donor is never shown.
 */

import { THREE } from '../render/render-host.js';
import { createExperienceBridge, STATUS } from './experience-bridge.js';
import { StudioShell } from '../authoring/studio/studio-shell.js';
import { SCENE_TITLES_ES } from './wet-paint-museum-skin.js';
import { WetPaintStore } from './wet-paint-store.js';

const EXPERIENCE_ID = 'wet-paint-flow';
const STANDALONE_URL = './experiences/wet-paint-flow/index.html';
const SCENE_BASE = './experiences/wet-paint-flow/scenes/full/';
const SCENE_THUMB = './experiences/wet-paint-flow/scenes/thumb/';
const SCENE_ORDER = [
    'sunflowers', 'roses', 'auvers-church', 'vineyards-auvers', 'olive-trees-blue-sky',
    'cypresses', 'wheat-field-cypresses', 'olive-trees-yellow-sky', 'seascape-saintes-maries',
    'yellow-house', 'starry-night',
];
// Every artwork in the itinerant room is an independent Wet Paint cuadro.
const ARTWORK_IDS = [
    'entity.itinerant.original', 'entity.itinerant.painterly', 'entity.itinerant.living',
    'entity.itinerant.combined', 'entity.itinerant.experimental',
];

// ── Donor mapping (drive the donor's real controls; zero donor edits) ───────

const donor = {
    isReady(iframe) {
        const win = iframe.contentWindow;
        const doc = iframe.contentDocument;
        return Boolean(win?.__vangoghFlowState?.ready && doc?.getElementById('source-upload'));
    },
    setSource(iframe, file) {
        const input = iframe.contentDocument?.getElementById('source-upload');
        if (!input) throw new Error('wet-paint: #source-upload not found');
        iframe.__wpErrBaseline = (iframe.contentWindow.__vangoghFlowErrors || []).length;
        iframe.__wpSawRestart = false;
        const dt = new DataTransfer();
        dt.items.add(file);
        input.files = dt.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
    },
    readStatus(iframe, sinceTs) {
        const win = iframe.contentWindow;
        const doc = iframe.contentDocument;
        const state = win?.__vangoghFlowState;
        const errs = win?.__vangoghFlowErrors || [];
        if ((iframe.__wpErrBaseline ?? 0) < errs.length) return { status: STATUS.ERROR, error: errs[errs.length - 1] };
        if (!state?.ready) return { status: STATUS.BOOTING };
        const progress = Number(doc?.documentElement?.dataset?.growthProgress || 0);
        const strokes = state.strokes || 0;
        if (progress < 1) iframe.__wpSawRestart = true;
        const settled = iframe.__wpSawRestart || (performance.now() - (sinceTs || 0)) > 1500;
        if (state.sourceMode === 'image' && strokes > 0 && progress >= 1 && settled) return { status: STATUS.RESULT_READY, strokes, progress };
        return { status: STATUS.PROCESSING, strokes, progress };
    },
    // With preserveDrawingBuffer forced on, a single capture at growth-complete is
    // reliable; we still ride the donor rAF through growth and keep the brightest
    // painted frame as a safety net.
    refreshResult(iframe, timeoutMs = 10000) {
        return new Promise((resolve) => {
            const win = iframe.contentWindow;
            const doc = iframe.contentDocument;
            const canvas = doc?.querySelector('#canvas-mount canvas');
            if (!win || !canvas) { resolve(null); return; }
            const scratch = doc.createElement('canvas'); scratch.width = 16; scratch.height = 12;
            const sctx = scratch.getContext('2d', { willReadFrequently: true });
            const brightness = () => { try { sctx.drawImage(canvas, 0, 0, 16, 12); const d = sctx.getImageData(0, 0, 16, 12).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2]; return s / (16 * 12); } catch { return 0; } };
            doc.getElementById('replay-growth-button')?.click();
            const startedAt = performance.now();
            let best = null; let bestScore = -1; let sawGrowth = false;
            const step = () => {
                const gp = Number(doc.documentElement.dataset.growthProgress || 0);
                if (gp > 0.05 && gp <= 1) { sawGrowth = true; const b = brightness(); const score = b * (0.5 + gp); if (b > 90 && score >= bestScore) { try { best = canvas.toDataURL('image/png'); bestScore = score; } catch { /* transient */ } } }
                if ((gp >= 1 && best && sawGrowth) || performance.now() - startedAt > timeoutMs) { if (!best) { try { best = canvas.toDataURL('image/png'); } catch { /* noop */ } } resolve(best); return; }
                win.requestAnimationFrame(step);
            };
            win.requestAnimationFrame(step);
        });
    },
    getParams(iframe) {
        const doc = iframe.contentDocument;
        if (!doc) return null;
        const params = {};
        doc.querySelectorAll('input[data-param]').forEach((i) => { params[i.dataset.param] = i.value; });
        const q = doc.getElementById('quality-mode'); if (q) params.quality = q.value;
        const vm = doc.querySelector('input[name="layer-mode"]:checked'); if (vm) params.viewMode = vm.value;
        params.brushLayers = [...doc.querySelectorAll('input[data-brush-layer]')].map((c) => c.checked);
        return params;
    },
    setParam(iframe, name, value) { const el = iframe.contentDocument?.querySelector(`input[data-param="${name}"]`); if (el) { el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); } },
    setQuality(iframe, v) { const q = iframe.contentDocument?.getElementById('quality-mode'); if (q) { q.value = v; q.dispatchEvent(new Event('change', { bubbles: true })); } },
    setViewMode(iframe, v) { const r = iframe.contentDocument?.querySelector(`input[name="layer-mode"][value="${v}"]`); if (r && !r.checked) { r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); } },
    setBrushLayer(iframe, i, on) { const c = iframe.contentDocument?.querySelectorAll('input[data-brush-layer]')[i]; if (c && c.checked !== on) { c.checked = on; c.dispatchEvent(new Event('change', { bubbles: true })); } },
    setTimeline(iframe, s) { const t = iframe.contentDocument?.getElementById('growth-timeline'); if (t) { t.value = String(s); t.dispatchEvent(new Event('input', { bubbles: true })); } },
    replay(iframe) { iframe.contentDocument?.getElementById('replay-growth-button')?.click(); },
    pause(iframe) { iframe.contentDocument?.getElementById('pause-button')?.click(); },
    exportPng(iframe) { iframe.contentDocument?.getElementById('export-button')?.click(); },
    exportVideo(iframe) { iframe.contentDocument?.getElementById('video-export-button')?.click(); },
    applyParams(iframe, params) {
        if (!params) return;
        if (Array.isArray(params.brushLayers)) params.brushLayers.forEach((on, i) => { if (typeof on === 'boolean') donor.setBrushLayer(iframe, i, on); });
        Object.entries(params).forEach(([k, v]) => { if (!['quality', 'viewMode', 'brushLayers'].includes(k)) donor.setParam(iframe, k, v); });
        if (params.quality) donor.setQuality(iframe, params.quality);
        if (params.viewMode) donor.setViewMode(iframe, params.viewMode);
    },
};

// ── helpers ─────────────────────────────────────────────────────────────────

function findArtworkPlate(sceneKit, entityId) {
    const root = sceneKit?._entityIndex?.get(entityId)?.object;
    if (!root) return null;
    let best = null; let bestArea = 0;
    root.traverse?.((node) => {
        if (!node?.isMesh || node.geometry?.type !== 'PlaneGeometry' || !node.material) return;
        const p = node.geometry.parameters || {};
        const area = Number(p.width || 0) * Number(p.height || 0);
        if (area > bestArea) { best = node; bestArea = area; }
    });
    return best;
}

function applyImageToPlate(plate, src) {
    return new Promise((resolve) => {
        if (!plate?.material || !src) { resolve(false); return; }
        const image = new Image();
        image.crossOrigin = 'anonymous';
        image.onload = () => {
            const texture = new THREE.Texture(image);
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.anisotropy = 8;
            texture.needsUpdate = true;
            const previous = plate.material.map;
            plate.material.map = texture;
            plate.material.needsUpdate = true;
            if (previous && previous !== texture) { try { previous.dispose?.(); } catch { /* noop */ } }
            resolve(true);
        };
        image.onerror = () => resolve(false);
        image.src = src;
    });
}

// Downscale a data/URL image to a compact JPEG so per-cuadro state fits localStorage.
function toStoredJpeg(src, maxDim = 1024, q = 0.86) {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
            const w = Math.max(1, Math.round((img.width || maxDim) * scale));
            const h = Math.max(1, Math.round((img.height || maxDim) * scale));
            const c = document.createElement('canvas'); c.width = w; c.height = h;
            c.getContext('2d').drawImage(img, 0, 0, w, h);
            try { resolve(c.toDataURL('image/jpeg', q)); } catch { resolve(src); }
        };
        img.onerror = () => resolve(src);
        img.src = src;
    });
}


// ── engine state ─────────────────────────────────────────────────────────────

let bridge = null;
let sceneKitRef = null;
let runtimeRef = null;
let activeEntityId = ARTWORK_IDS[0];
let loadedSourceEntityId = null;
let direction = 'normal';
let stream = null;               // { entityId, dst, sctx, tex, frames[], lastCap } during a transition
let paramTimer = 0;
const sourceSet = new Set();
const loops = new Map();          // entityId → looping transition player { frames, canvas, ctx, tex, idx, last, hold, holdUntil, w, h }
const LOOP_STEP = 150;            // ms per frame
const LOOP_HOLD = 900;            // ms to hold the final effect before restarting from the image

const plateOf = (id) => findArtworkPlate(sceneKitRef, id);
const rec = (id) => WetPaintStore.get(id) || null;
const donorCanvas = () => bridge?.element?.contentDocument?.querySelector('#canvas-mount canvas') || null;
function notify(kind, detail) { try { window.dispatchEvent(new CustomEvent('wetpaint:status', { detail: { kind, entityId: activeEntityId, ...detail } })); } catch { /* noop */ } }
async function ensureReady() { return bridge.waitReady(); }
async function persist(id, patch) { WetPaintStore.save(id, { ...(rec(id) || {}), ...patch }); }
function loadImg(url) { return new Promise((resolve) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => resolve(i); i.onerror = () => resolve(null); i.src = url; }); }
function setPlateTexture(id, tex) { const plate = plateOf(id); if (plate?.material) { const prev = plate.material.map; plate.material.map = tex; plate.material.needsUpdate = true; if (prev && prev !== tex) { try { prev.dispose?.(); } catch { /* noop */ } } } }

// Museum frame loop: stream the live transition into the active cuadro's own
// canvas AND advance every cuadro's looping transition so the room always shows
// the transformation from the start (image → effect), not a frozen still.
function tick() {
    const now = performance.now();
    if (stream) {
        const src = donorCanvas();
        if (src) { try { stream.sctx.drawImage(src, 0, 0, stream.dst.width, stream.dst.height); stream.tex.needsUpdate = true; } catch { /* transient */ } }
        if (now - (stream.lastCap || 0) > 250) { try { stream.frames.push(stream.dst.toDataURL('image/jpeg', 0.72)); } catch { /* noop */ } stream.lastCap = now; }
    }
    loops.forEach((lp, id) => {
        if (stream && stream.entityId === id) return;   // it's currently (re)playing live
        if (!lp.frames.length) return;
        if (lp.hold) { if (now >= lp.holdUntil) { lp.hold = false; lp.idx = 0; } else return; }
        if (now - lp.last < LOOP_STEP) return;
        lp.last = now;
        try { lp.ctx.drawImage(lp.frames[lp.idx], 0, 0, lp.w, lp.h); lp.tex.needsUpdate = true; } catch { /* noop */ }
        if (lp.idx >= lp.frames.length - 1) { lp.hold = true; lp.holdUntil = now + LOOP_HOLD; }
        else lp.idx += 1;
    });
}

function stopStream() { stream = null; }

// Build a looping player for a cuadro from a list of frame data-URLs.
async function buildLoop(id, frameUrls) {
    const imgs = (await Promise.all(frameUrls.map(loadImg))).filter(Boolean);
    if (!imgs.length) return false;
    const w = imgs[0].width || 1024;
    const h = imgs[0].height || 768;
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(imgs[0], 0, 0, w, h);
    const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace;
    setPlateTexture(id, tex);
    loops.set(id, { frames: imgs, canvas, ctx, tex, idx: 0, last: performance.now(), hold: false, holdUntil: 0, w, h });
    return true;
}

// End the current transition: turn the captured frames into a persisted loop.
async function finishTransition(id, extra = {}) {
    if (!stream) return false;
    const frames = stream.frames.slice();
    try { stream.sctx.drawImage(donorCanvas(), 0, 0, stream.dst.width, stream.dst.height); frames.push(stream.dst.toDataURL('image/jpeg', 0.85)); } catch { /* noop */ }
    stopStream();
    if (!frames.length) { notify('error', {}); return false; }
    const compact = await Promise.all(frames.map((f) => toStoredJpeg(f, 640, 0.7)));
    await buildLoop(id, compact);
    await persist(id, { params: donor.getParams(bridge.element), frames: compact, resultDataUrl: compact[compact.length - 1], ...extra });
    notify('result', {});
    return true;
}

async function freezeStreamIfAny() { if (stream) await finishTransition(stream.entityId); }

function animateTimeline(from, to, ms) {
    return new Promise((resolve) => {
        const start = performance.now();
        const stepFn = () => {
            const t = Math.min(1, (performance.now() - start) / ms);
            donor.setTimeline(bridge.element, from + (to - from) * t);
            if (t >= 1) return resolve();
            requestAnimationFrame(stepFn);
        };
        stepFn();
    });
}

// Play the live transition on the ACTIVE cuadro, then leave it looping.
async function playTransition() {
    const id = activeEntityId;
    if (!sourceSet.has(id)) { notify('nosource', {}); return false; }
    await freezeStreamIfAny();
    const canvas = donorCanvas();
    if (!canvas) { notify('error', {}); return false; }
    loops.delete(id);
    const dst = document.createElement('canvas');
    dst.width = canvas.width || 1024; dst.height = canvas.height || 768;
    const sctx = dst.getContext('2d');
    try { sctx.drawImage(canvas, 0, 0, dst.width, dst.height); } catch { /* first frame */ }
    const tex = new THREE.CanvasTexture(dst); tex.colorSpace = THREE.SRGBColorSpace;
    setPlateTexture(id, tex);
    stream = { entityId: id, dst, sctx, tex, frames: [], lastCap: 0 };
    notify('playing', {});
    const DUR = 3800;
    if (direction === 'inverted') await animateTimeline(5, 0, DUR); else await animateTimeline(0, 5, DUR);
    await new Promise((r) => setTimeout(r, 120));
    return finishTransition(id);
}

// Reload a cuadro's stored source into the donor (so param edits reprocess it).
async function loadSourceInto(id) {
    const r = rec(id);
    if (!r?.sourceKind) return false;
    const doc = bridge.element.contentDocument;
    if (r.sourceKind === 'scene' && r.sceneId) {
        doc.querySelector(`.scene-card[data-scene-id="${r.sceneId}"]`)?.click();
        const start = performance.now();
        while (performance.now() - start < 12000) { if (doc.documentElement.dataset.activeSceneId === r.sceneId) break; await new Promise((res) => setTimeout(res, 150)); }
    } else if (r.sourceKind === 'upload' && r.sourceDataUrl) {
        const blob = await (await fetch(r.sourceDataUrl)).blob();
        donor.setSource(bridge.element, new File([blob], `${id}.jpg`, { type: blob.type || 'image/jpeg' }));
        const start = performance.now();
        while (performance.now() - start < 12000) { const gp = Number(doc.documentElement.dataset.growthProgress || 1); if (gp < 1) break; await new Promise((res) => setTimeout(res, 120)); }
    } else return false;   // 'glb' sources are not reloaded in V1 (kept as their looped result)
    loadedSourceEntityId = id; sourceSet.add(id);
    if (r.params) donor.applyParams(bridge.element, r.params);
    return true;
}

const engine = {
    get ready() { return bridge && donor.isReady(bridge.element); },
    scenes: () => SCENE_ORDER.map((id) => ({ id, title: SCENE_TITLES_ES[id] || id, thumb: `${SCENE_THUMB}${id}.webp` })),
    activeEntity: () => activeEntityId,
    getParams: () => donor.getParams(bridge.element),
    hasSource: (id) => sourceSet.has(id || activeEntityId) || Boolean(rec(id || activeEntityId)?.resultDataUrl),
    getFinalFrame: (id) => rec(id || activeEntityId)?.resultDataUrl || null,
    getDirection: () => direction,
    setDirection(d) { direction = d === 'inverted' ? 'inverted' : 'normal'; },

    async setActiveEntity(id) {
        if (id === activeEntityId) return;
        await freezeStreamIfAny();
        activeEntityId = id;
        if (!this.ready) return;
        const r = rec(id);
        if (r?.params) donor.applyParams(bridge.element, r.params);
        if (loadedSourceEntityId !== id && r?.sourceKind && r.sourceKind !== 'glb') { notify('processing', {}); loadSourceInto(id).then(() => notify('ready', {})); }
    },

    _paramTouched() { clearTimeout(paramTimer); paramTimer = setTimeout(() => { if (sourceSet.has(activeEntityId)) playTransition(); }, 650); },
    setParam(name, value) { donor.setParam(bridge.element, name, value); this._paramTouched(); },
    setQuality(v) { donor.setQuality(bridge.element, v); this._paramTouched(); },
    setViewMode(v) { donor.setViewMode(bridge.element, v); this._paramTouched(); },
    setBrushLayer(i, on) { donor.setBrushLayer(bridge.element, i, on); this._paramTouched(); },
    replay() { return playTransition(); },
    playTransition() { return playTransition(); },
    exportPng() { donor.exportPng(bridge.element); },
    exportVideo() { donor.exportVideo(bridge.element); },

    async syncFromLibrary(sceneId) {
        await ensureReady();
        await freezeStreamIfAny();
        const id = activeEntityId;
        notify('processing', {});
        const doc = bridge.element.contentDocument;
        doc.querySelector(`.scene-card[data-scene-id="${sceneId}"]`)?.click();
        const start = performance.now();
        while (performance.now() - start < 12000) { if (doc.documentElement.dataset.activeSceneId === sceneId) break; await new Promise((r) => setTimeout(r, 150)); }
        loadedSourceEntityId = id; sourceSet.add(id);
        await persist(id, { sourceKind: 'scene', sceneId });
        await playTransition();
    },

    async processFromEditor(file) {
        await ensureReady();
        await freezeStreamIfAny();
        const id = activeEntityId;
        const isGlb = /\.glb$/i.test(file.name || '') || /gltf/i.test(file.type || '');
        notify('processing', {});
        donor.setSource(bridge.element, file);   // donor routes GLB → loadGlbModel, image → loadUploadedImage
        const doc = bridge.element.contentDocument;
        const start = performance.now();
        while (performance.now() - start < 15000) { const gp = Number(doc.documentElement.dataset.growthProgress || 1); if (gp < 1) break; await new Promise((r) => setTimeout(r, 120)); }
        loadedSourceEntityId = id; sourceSet.add(id);
        await persist(id, isGlb ? { sourceKind: 'glb' } : { sourceKind: 'upload', sourceDataUrl: await toStoredJpeg(URL.createObjectURL(file)) });
        await playTransition();
    },

    async saveAndApply() {
        if (!sourceSet.has(activeEntityId)) { notify('nosource', {}); return false; }
        if (stream) await finishTransition(activeEntityId);   // finalize a preview in progress
        notify('saved', {});
        return true;
    },

    // Re-apply every stored cuadro (looping transition, or a still fallback) after
    // a rebuild / preview, so the room keeps showing the transformation.
    async restoreAll() {
        for (const id of ARTWORK_IDS) {
            const r = rec(id);
            if (r?.frames?.length) { sourceSet.add(id); await buildLoop(id, r.frames); }
            else if (r?.resultDataUrl) { sourceSet.add(id); await applyImageToPlate(plateOf(id), r.resultDataUrl); }
        }
    },
};

// ── install ──────────────────────────────────────────────────────────────

export function installWetPaint(runtime) {
    const sceneKit = runtime?.sceneKit;
    if (!sceneKit) { console.error('[WetPaint] runtime.sceneKit not available'); return null; }
    sceneKitRef = sceneKit;
    runtimeRef = runtime;

    bridge?.dispose?.();
    bridge = createExperienceBridge({ id: EXPERIENCE_ID, url: STANDALONE_URL, adapter: donor, onStatus: () => {} });
    const installedBridge = bridge;

    const originalOnFrame = runtime.onFrame;
    runtime.onFrame = (pose, dt) => { try { tick(); } catch { /* noop */ } if (originalOnFrame) originalOnFrame(pose, dt); };

    bridge.waitReady().then(async () => {
        if (bridge !== installedBridge) return;
        await engine.restoreAll();
        notify('ready', {});
    });

    if (!StudioShell.prototype.__wetPaintTakeFilePatched) {
        Object.defineProperty(StudioShell.prototype, '__wetPaintTakeFilePatched', { value: true });
        const originalTakeFile = StudioShell.prototype._takeFile;
        StudioShell.prototype._takeFile = async function wetPaintTakeFile(slot, file) {
            await originalTakeFile.call(this, slot, file);
            if (!file || !ARTWORK_IDS.includes(this.selectedId)) return;
            const isImg = String(file.type || '').startsWith('image/');
            const isGlb = /\.glb$/i.test(file.name || '') || /gltf/i.test(file.type || '');
            if (!isImg && !isGlb) return;
            activeEntityId = this.selectedId;
            try { await window.__WET_PAINT_ENGINE?.processFromEditor?.(file); }
            catch (e) { console.error('[WetPaint] upload failed', e); notify('error', {}); }
        };
    }

    window.__WET_PAINT_ENGINE = engine;
    return {
        engine,
        bridge: installedBridge,
        dispose() {
            if (bridge === installedBridge) bridge = null;
            installedBridge.dispose?.();
        }
    };
}
