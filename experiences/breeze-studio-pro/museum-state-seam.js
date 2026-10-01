const BRIDGE = 'BREEZE_MUSEUM_STATE_V1';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const byId = (id) => document.getElementById(id);
const num = (id, fallback) => {
  const value = Number(byId(id)?.value);
  return Number.isFinite(value) ? value : fallback;
};
const bool = (id, fallback = false) => byId(id) ? Boolean(byId(id).checked) : fallback;
const selectedFile = (id) => byId(id)?.files?.[0] || null;
const runtime = () => window.__BREEZE_STUDIO_PRO__ || null;

function post(message) {
  if (window.parent === window) return;
  window.parent.postMessage({ bridge: BRIDGE, ...message }, '*');
}

function fileMeta(file) {
  return file ? {
    name: file.name,
    type: file.type,
    size: file.size,
    lastModified: file.lastModified
  } : null;
}

function readState({ includeFiles = true } = {}) {
  const rt = runtime();
  const app = rt?.app;
  const backgroundFile = app?.appliedBackgroundFile || selectedFile('bsBackground');
  const clothFile = app?.appliedClothFile || selectedFile('bsMedia');
  const modelFile = selectedFile('bsModel');
  const objectSpec = app?.objectSpec || null;

  return {
    version: 1,
    experience: byId('bsScene')?.value || 'cloth',
    autoRotate: bool('bsRotate'),
    runSimulation: bool('bsRun', true),
    wireframe: bool('bsWire'),
    background: {
      file: includeFiles ? backgroundFile : undefined,
      meta: fileMeta(backgroundFile),
      applied: Boolean(app?.appliedBackgroundFile),
      scale: num('bsBgScale', 1),
      x: num('bsBgX', 0),
      y: num('bsBgY', 0)
    },
    cloth: {
      file: includeFiles ? clothFile : undefined,
      meta: fileMeta(clothFile),
      applied: Boolean(app?.appliedClothFile),
      scale: num('bsScale', 1),
      x: num('bsX', 0),
      y: num('bsY', 0),
      opacity: num('bsOpacity', 1),
      brightness: num('bsBrightness', 1),
      contrast: num('bsContrast', 1),
      saturation: num('bsSaturation', 1)
    },
    object: {
      template: byId('bsTemplate')?.value || 'venus',
      uploadedFile: includeFiles ? modelFile : undefined,
      uploadedMeta: fileMeta(modelFile),
      spec: objectSpec ? {
        kind: objectSpec.kind || null,
        id: objectSpec.id || null,
        name: objectSpec.name || null
      } : null
    },
    physics: {
      stiffness: num('bsStiff', 0.25),
      friction: num('bsFriction', 0.25)
    }
  };
}

function setValue(id, value) {
  const el = byId(id);
  if (!el || value === undefined || value === null) return;
  if (el.type === 'checkbox') el.checked = Boolean(value);
  else el.value = String(value);
}

function dispatchControl(id, value, eventName = 'input') {
  setValue(id, value);
  const el = byId(id);
  if (!el || value === undefined || value === null) return;
  el.dispatchEvent(new Event(eventName, { bubbles: true }));
}

async function waitForRuntime(timeout = 60000) {
  const start = performance.now();
  while (performance.now() - start < timeout) {
    if (runtime()?.app && byId('breezeStudioPanel') && byId('bsScene')) return runtime();
    await sleep(50);
  }
  throw new Error('Breeze Studio PRO runtime did not become ready');
}

async function waitForExperience(value, timeout = 10000) {
  const start = performance.now();
  while (performance.now() - start < timeout) {
    const select = byId('bsScene');
    const status = document.body?.innerText || '';
    if (select?.value === value && /Experience STARTED/i.test(status)) return true;
    await sleep(80);
  }
  return byId('bsScene')?.value === value;
}

function softApply(label, fn) {
  try {
    return fn();
  } catch (error) {
    console.warn(`[Museum Breeze state seam] ${label} not supported by current experience`, error);
    return null;
  }
}

function setSaveUi(status, detail = '') {
  const button = byId('bsMuseumSave');
  const label = byId('bsMuseumSaveStatus');
  if (!button || !label) return;
  button.disabled = status === 'saving';
  button.dataset.state = status;
  if (status === 'saving') {
    button.textContent = 'GUARDANDO…';
    label.textContent = detail || 'Museum está capturando esta personalización.';
  } else if (status === 'saved') {
    button.textContent = 'GUARDADO ✓';
    label.textContent = detail || 'La sala se conservará al salir y volver durante esta sesión.';
  } else if (status === 'error') {
    button.textContent = 'REINTENTAR GUARDADO';
    label.textContent = detail || 'No se pudo guardar. Vuelve a intentarlo.';
  } else {
    button.textContent = 'GUARDAR EN MUSEUM';
    label.textContent = detail || 'Conserva esta personalización antes de salir de la sala.';
  }
}

function markUnsaved() {
  const button = byId('bsMuseumSave');
  if (!button || button.dataset.state === 'saving') return;
  setSaveUi('dirty', 'Hay cambios sin guardar en esta sala.');
}

function installMuseumSaveControl() {
  const panel = byId('breezeStudioPanel');
  if (!panel || byId('bsMuseumSaveDock')) return;

  const style = document.createElement('style');
  style.textContent = `
    #bsMuseumSaveDock{position:sticky;bottom:0;z-index:20;margin:0;padding:12px 14px 14px;background:linear-gradient(180deg,rgba(15,14,12,.82),rgba(15,14,12,.99) 28%);border-top:1px solid rgba(197,172,112,.32);backdrop-filter:blur(10px)}
    #bsMuseumSave{width:100%;min-height:42px;border:1px solid rgba(197,172,112,.58)!important;background:#c5ac70!important;color:#111!important;font:700 10px/1.1 Inter,system-ui,sans-serif!important;letter-spacing:.12em!important;text-transform:uppercase;cursor:pointer;transition:.16s ease}
    #bsMuseumSave:hover{filter:brightness(1.08)}
    #bsMuseumSave:disabled{cursor:wait;opacity:.72}
    #bsMuseumSave[data-state="saved"]{background:#182319!important;color:#dce8d9!important;border-color:rgba(112,170,116,.55)!important}
    #bsMuseumSave[data-state="error"]{background:#2b1715!important;color:#f0d7d1!important;border-color:rgba(196,99,79,.58)!important}
    #bsMuseumSaveStatus{display:block;margin-top:7px;color:#938b7e;font:9px/1.35 Inter,system-ui,sans-serif;letter-spacing:.02em}
  `;
  document.head.appendChild(style);

  const dock = document.createElement('div');
  dock.id = 'bsMuseumSaveDock';
  dock.innerHTML = '<button id="bsMuseumSave" type="button">GUARDAR EN MUSEUM</button><span id="bsMuseumSaveStatus">Conserva esta personalización antes de salir de la sala.</span>';
  panel.appendChild(dock);

  byId('bsMuseumSave').addEventListener('click', () => {
    setSaveUi('saving');
    post({ type: 'SAVE_REQUEST' });
  });

  panel.addEventListener('input', (event) => {
    if (event.target?.id !== 'bsMuseumSave') markUnsaved();
  }, true);
  panel.addEventListener('change', () => markUnsaved(), true);
  panel.addEventListener('click', (event) => {
    const button = event.target?.closest?.('button');
    if (button && button.id !== 'bsMuseumSave') setTimeout(markUnsaved, 140);
  }, true);
}

async function applyState(state) {
  const rt = await waitForRuntime();
  const app = rt.app;

  if (state?.experience && byId('bsScene')?.value !== state.experience) {
    dispatchControl('bsScene', state.experience, 'change');
    await waitForExperience(state.experience);
  }

  dispatchControl('bsRotate', state?.autoRotate, 'change');
  dispatchControl('bsRun', state?.runSimulation, 'change');
  dispatchControl('bsWire', state?.wireframe, 'change');

  const bg = state?.background || {};
  setValue('bsBgScale', bg.scale);
  setValue('bsBgX', bg.x);
  setValue('bsBgY', bg.y);
  if (bg.file) {
    app.backgroundTransform = {
      scale: Number(bg.scale ?? 1),
      x: Number(bg.x ?? 0),
      y: Number(bg.y ?? 0)
    };
    await app.setAppliedBackgroundFile(bg.file);
    softApply('background transform', () => app.applyBackgroundTransform?.());
  }

  const cloth = state?.cloth || {};
  setValue('bsScale', cloth.scale);
  setValue('bsX', cloth.x);
  setValue('bsY', cloth.y);
  setValue('bsOpacity', cloth.opacity);
  setValue('bsBrightness', cloth.brightness);
  setValue('bsContrast', cloth.contrast);
  setValue('bsSaturation', cloth.saturation);

  if (cloth.file) await app.applyClothFile(cloth.file);
  softApply('cloth media transform', () => app.setClothMediaTransform?.({
    scale: Number(cloth.scale ?? 1),
    x: Number(cloth.x ?? 0),
    y: Number(cloth.y ?? 0)
  }));
  softApply('cloth look', () => app.setClothLook?.({
    opacity: Number(cloth.opacity ?? 1),
    brightness: Number(cloth.brightness ?? 1),
    contrast: Number(cloth.contrast ?? 1),
    saturation: Number(cloth.saturation ?? 1)
  }));

  const object = state?.object || {};
  if (object.uploadedFile) {
    await app.applyUploadedObject(object.uploadedFile);
  } else if (object.template) {
    await app.applyObjectTemplate(object.template);
    const select = byId('bsTemplate');
    if (select) select.value = object.template;
  }

  const physics = state?.physics || {};
  dispatchControl('bsStiff', physics.stiffness);
  dispatchControl('bsFriction', physics.friction);

  return readState({ includeFiles: true });
}

function validateState() {
  const rt = runtime();
  const app = rt?.app;
  const state = readState({ includeFiles: false });
  const checks = {
    runtime: Boolean(app && rt?.renderer),
    panel: Boolean(byId('breezeStudioPanel')),
    experience: Boolean(state.experience),
    background: !state.background.meta || Boolean(app?.appliedBackgroundFile),
    cloth: !state.cloth.meta || Boolean(app?.appliedClothFile),
    object: Boolean(state.object.template || state.object.spec),
    physics: Number.isFinite(state.physics.stiffness) && Number.isFinite(state.physics.friction)
  };
  return { ok: Object.values(checks).every(Boolean), checks, state };
}

window.addEventListener('message', async (event) => {
  const msg = event.data;
  if (!msg || msg.bridge !== BRIDGE) return;

  if (msg.type === 'SAVE_RESULT') {
    setSaveUi(msg.ok ? 'saved' : 'error', msg.message || '');
    return;
  }

  if (!msg.requestId) return;
  try {
    if (msg.type === 'GET_STATE') {
      post({ type: 'STATE', requestId: msg.requestId, state: readState({ includeFiles: true }) });
    } else if (msg.type === 'APPLY_STATE') {
      const state = await applyState(msg.state || {});
      setSaveUi('saved', 'Personalización restaurada por Museum.');
      post({ type: 'APPLY_RESULT', requestId: msg.requestId, state });
    } else if (msg.type === 'VALIDATE_STATE') {
      post({ type: 'VALIDATION', requestId: msg.requestId, result: validateState() });
    }
  } catch (error) {
    post({ type: 'ERROR', requestId: msg.requestId, error: String(error?.message || error) });
  }
});

(async () => {
  try {
    await waitForRuntime();
    installMuseumSaveControl();
    post({ type: 'READY', state: readState({ includeFiles: false }) });
  } catch (error) {
    post({ type: 'BOOT_ERROR', error: String(error?.message || error) });
  }
})();
