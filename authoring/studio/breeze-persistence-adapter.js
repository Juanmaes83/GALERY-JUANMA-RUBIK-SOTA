import { StudioShell } from './studio-shell.js';
import { ConfigStore } from '../config-store.js';

const BRIDGE = 'BREEZE_MUSEUM_STATE_V1';
const ENTITY_ID = 'entity.installation.viento-sobre-marmol';
const LEDGER_KEY = 'iw.museum.validation.v1';
const FLOW_VERSION = 1;
const pending = new Map();
let sequence = 0;
let readyWindow = null;
let savedState = null;
let restoreInFlight = null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const iframe = () => document.querySelector('iframe[data-nested-room-studio="room.breeze"]');

async function waitReady(timeout = 16000) {
  const start = performance.now();
  while (performance.now() - start < timeout) {
    const frame = iframe();
    if (frame?.contentWindow && readyWindow === frame.contentWindow) return true;
    await sleep(60);
  }
  return false;
}

async function request(type, payload = {}, timeout = 30000) {
  if (!(await waitReady())) throw new Error('Breeze Studio PRO no está listo.');
  const frame = iframe();
  if (!frame?.contentWindow) throw new Error('Breeze Studio PRO no está montado.');
  const requestId = `breeze-state-${Date.now()}-${++sequence}`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(requestId);
      reject(new Error(`Breeze no respondió a ${type}.`));
    }, timeout);
    pending.set(requestId, { resolve, reject, timer });
    frame.contentWindow.postMessage({ bridge: BRIDGE, type, requestId, ...payload }, '*');
  });
}

function cleanState(state) {
  if (!state) return null;
  return {
    version: 1,
    experience: state.experience || 'cloth',
    autoRotate: Boolean(state.autoRotate),
    runSimulation: state.runSimulation !== false,
    wireframe: Boolean(state.wireframe),
    background: {
      ...(state.background || {}),
      file: undefined
    },
    cloth: {
      ...(state.cloth || {}),
      file: undefined
    },
    object: {
      ...(state.object || {}),
      uploadedFile: undefined
    },
    physics: { ...(state.physics || {}) }
  };
}

function syncConfig(studio, state) {
  if (!studio?.config || !state) return;
  studio.config.entities ||= {};
  const current = studio.config.entities[ENTITY_ID] || {};
  const entity = (studio.world?.entities || []).find((item) => item.id === ENTITY_ID) || {};
  // This installation may be the first field ever authored for the entity.
  // Seed the canonical semantic facts already present in the World so saving a
  // Breeze-only snapshot cannot blank the required focus/accessibility contract.
  studio.config.entities[ENTITY_ID] = {
    title: current.title ?? null,
    creator: current.creator ?? null,
    year: current.year ?? null,
    medium: current.medium ?? null,
    description: current.description ?? null,
    image: current.image ?? null,
    video: current.video ?? null,
    projection: current.projection ?? null,
    artistId: current.artistId || '',
    documentIds: current.documentIds || [],
    sizeCm: current.sizeCm || {
      width: Number(entity.size?.[0] || 0) * 100,
      height: Number(entity.size?.[1] || 0) * 100,
      depth: Number(entity.size?.[2] || 0) * 100
    },
    accessibility: {
      label: current.accessibility?.label || entity.accessibility?.label || '',
      description: current.accessibility?.description || entity.accessibility?.description || '',
      transcript: current.accessibility?.transcript || entity.accessibility?.transcript || ''
    },
    presentation: current.presentation || {},
    breeze: cleanState(state)
  };
}

function hydrateSavedState(studio) {
  if (savedState) return savedState;
  const persisted = studio?.config?.entities?.[ENTITY_ID]?.breeze;
  if (persisted) savedState = cleanState(persisted);
  return savedState;
}

function hashString(value) {
  let hash = 2166136261;
  const text = String(value || '');
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => [key, stable(value[key])])
  );
}

function pieceHash(studio) {
  const entity = (studio.world.entities || []).find((item) => item.id === ENTITY_ID) || null;
  const authored = studio.config.entities?.[ENTITY_ID] || null;
  return hashString(JSON.stringify(stable({
    id: ENTITY_ID,
    kind: entity?.kind || null,
    baseMedia: entity?.content?.media || null,
    authored
  })));
}

function loadLedger() {
  try {
    const raw = JSON.parse(localStorage.getItem(LEDGER_KEY) || 'null');
    if (raw?.version === FLOW_VERSION) return raw;
  } catch { /* empty */ }
  return { version: FLOW_VERSION, pieces: {}, route: {} };
}

function saveLedger(ledger) {
  localStorage.setItem(LEDGER_KEY, JSON.stringify(ledger));
}

function writeEvidence(studio, level) {
  const ledger = loadLedger();
  const hash = pieceHash(studio);
  const now = new Date().toISOString();
  const row = { ...(ledger.pieces?.[ENTITY_ID] || {}) };
  row.previewHash = hash;
  row.previewAt ||= now;
  if (level === 'saved' || level === 'validated') {
    row.savedHash = hash;
    row.savedAt = now;
  }
  if (level === 'validated') {
    row.validatedHash = hash;
    row.validatedAt = now;
  }
  ledger.pieces ||= {};
  ledger.pieces[ENTITY_ID] = row;
  ledger.route = {};
  saveLedger(ledger);
}

function evidence(studio) {
  const ledger = loadLedger();
  const row = ledger.pieces?.[ENTITY_ID] || {};
  const hash = pieceHash(studio);
  return {
    preview: row.previewHash === hash,
    saved: row.savedHash === hash,
    validated: row.validatedHash === hash
  };
}

async function saveCurrentBreeze(studio) {
  if (!studio) throw new Error('Museum Studio no está montado.');
  if (!(await waitReady())) throw new Error('Breeze Studio PRO no está abierto.');
  const state = (await request('GET_STATE')).state;
  savedState = state;
  syncConfig(studio, state);
  ConfigStore.save(studio.config);
  studio.dirty = false;
  studio.savedAt = new Date();
  writeEvidence(studio, 'saved');
  window.__IW_BREEZE_SAVED_STATE = savedState;
  window.__IW_BREEZE_PERSISTENCE = {
    status: 'SAVED',
    state: cleanState(savedState),
    hasBackgroundFile: Boolean(savedState?.background?.file),
    hasClothFile: Boolean(savedState?.cloth?.file),
    hasModelFile: Boolean(savedState?.object?.uploadedFile),
    at: new Date().toISOString()
  };
  return savedState;
}

async function restoreSavedState(reason = 'REENTRY') {
  if (!savedState || restoreInFlight) return restoreInFlight;
  restoreInFlight = (async () => {
    try {
      const response = await request('APPLY_STATE', { state: savedState }, 45000);
      window.__IW_BREEZE_PERSISTENCE = {
        status: 'RESTORED',
        reason,
        state: cleanState(response.state || savedState),
        at: new Date().toISOString()
      };
      return response.state || savedState;
    } catch (error) {
      console.error('[Museum Breeze persistence] restore failed', error);
      window.__IW_BREEZE_PERSISTENCE = {
        status: 'RESTORE_ERROR',
        reason,
        error: String(error?.message || error),
        at: new Date().toISOString()
      };
      return null;
    } finally {
      restoreInFlight = null;
    }
  })();
  return restoreInFlight;
}

window.addEventListener('message', (event) => {
  const msg = event.data;
  if (!msg || msg.bridge !== BRIDGE) return;

  if (msg.type === 'READY') {
    const frame = iframe();
    if (!frame?.contentWindow || event.source !== frame.contentWindow) return;
    readyWindow = event.source;
    hydrateSavedState(window.__IW_STUDIO);
    window.__IW_BREEZE_PERSISTENCE = {
      status: savedState ? 'READY_TO_RESTORE' : 'READY_UNSAVED',
      state: msg.state || null,
      at: new Date().toISOString()
    };
    if (savedState) queueMicrotask(() => restoreSavedState('BREEZE_READY'));
    return;
  }

  if (msg.type === 'SAVE_REQUEST') {
    const frame = iframe();
    if (!frame?.contentWindow || event.source !== frame.contentWindow) return;
    const targetWindow = frame.contentWindow;
    (async () => {
      try {
        const studio = window.__IW_STUDIO;
        if (!studio) throw new Error('Museum Studio no está disponible.');
        studio.selectedId = ENTITY_ID;
        await saveCurrentBreeze(studio);
        // Acknowledge directly to the same live guest. Do not force a Studio
        // render here: the in-panel save is a local Breeze action and a global
        // shell refresh can replace/reset the child UI after the snapshot is
        // already safely stored.
        targetWindow.postMessage({
          bridge: BRIDGE,
          type: 'SAVE_RESULT',
          ok: true,
          message: 'Guardado en Museum. Puedes salir de la sala sin perder esta personalización.'
        }, '*');
      } catch (error) {
        console.error('[Museum Breeze persistence] in-panel save failed', error);
        targetWindow.postMessage({
          bridge: BRIDGE,
          type: 'SAVE_RESULT',
          ok: false,
          message: String(error?.message || error)
        }, '*');
      }
    })();
    return;
  }

  if (msg.type === 'BOOT_ERROR') {
    console.error('[Museum Breeze persistence] child seam failed', msg.error);
    return;
  }

  if (msg.requestId && pending.has(msg.requestId)) {
    const item = pending.get(msg.requestId);
    pending.delete(msg.requestId);
    clearTimeout(item.timer);
    if (msg.type === 'ERROR') item.reject(new Error(msg.error || 'Breeze state seam error'));
    else item.resolve(msg);
  }
});

const originalPreview = StudioShell.prototype._validationPreviewPiece;
StudioShell.prototype._validationPreviewPiece = async function breezePreviewPiece() {
  if (this.selectedId !== ENTITY_ID) return originalPreview.call(this);
  this.busy = 'preview';
  this.render();
  try {
    await this.onReveal(ENTITY_ID);
    if (!(await waitReady())) throw new Error('Breeze Studio PRO no terminó de abrir.');
    const state = (await request('GET_STATE')).state;
    syncConfig(this, state);
    writeEvidence(this, 'preview');
    this._say('PREVIEW OK · Breeze PRO está vivo y Museum puede leer la personalización actual.');
  } catch (error) {
    this._say(`PREVIEW CON ERROR · ${String(error?.message || error)}`, true);
  } finally {
    this.busy = null;
    this.render();
  }
};

const originalSave = StudioShell.prototype._validationSavePiece;
StudioShell.prototype._validationSavePiece = async function breezeSavePiece() {
  if (this.selectedId !== ENTITY_ID) return originalSave.call(this);
  this.busy = 'save';
  this.render();
  try {
    await saveCurrentBreeze(this);
    this._say('BREEZE GUARDADO · Museum conservará esta personalización al salir, volver y probar el recorrido.');
  } catch (error) {
    this._say(`NO SE PUDO GUARDAR BREEZE · ${String(error?.message || error)}`, true);
  } finally {
    this.busy = null;
    this.render();
  }
};

const originalValidate = StudioShell.prototype._validationValidatePiece;
StudioShell.prototype._validationValidatePiece = async function breezeValidatePiece() {
  if (this.selectedId !== ENTITY_ID) return originalValidate.call(this);
  if (!savedState) return this._say('Primero guarda la personalización de Breeze.', true);
  this.busy = 'validate';
  this.render();
  try {
    await request('APPLY_STATE', { state: savedState }, 45000);
    const validation = (await request('VALIDATE_STATE')).result;
    if (!validation?.ok) throw new Error('Breeze no confirmó todos los subsistemas guardados.');
    syncConfig(this, savedState);
    writeEvidence(this, 'validated');
    this._say('BREEZE VALIDADO · snapshot guardado y restauración funcional confirmada.');
  } catch (error) {
    this._say(`VALIDACIÓN BREEZE FALLIDA · ${String(error?.message || error)}`, true);
  } finally {
    this.busy = null;
    this.render();
  }
};

window.__IW_BREEZE_PERSISTENCE_ADAPTER = {
  entityId: ENTITY_ID,
  request,
  save: () => window.__IW_STUDIO ? saveCurrentBreeze(window.__IW_STUDIO) : Promise.reject(new Error('Museum Studio no está montado.')),
  restore: restoreSavedState,
  get savedState() { return savedState; },
  evidence: () => window.__IW_STUDIO ? evidence(window.__IW_STUDIO) : null
};
