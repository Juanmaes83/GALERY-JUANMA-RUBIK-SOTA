import { THREE } from '../../render/render-host.js';
import { ConfigStore } from '../config-store.js';
import { loadApprovedCharacterAsset, PHASE3_APPROVED_AVATAR } from '../../character/approved-avatar-asset-loader.js';

const UI_STATE_KEY = 'iw.museum.avatar-studio-ui.v1';
const PROJECT_KEY = 'iw.museum.authoring.v1';
const FIX_ID = 'PHASE5_AVATAR_VISIBILITY_CONTINUITY_V2';

const clamp = (v, lo, hi) => Math.min(Math.max(Number(v) || 0, lo), hi);
const formatOf = (name = '') => String(name).split('.').pop()?.toLowerCase() || 'glb';
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

function readUIState() {
  try { return JSON.parse(sessionStorage.getItem(UI_STATE_KEY) || '{}'); } catch { return {}; }
}

function rememberStudio(studio) {
  if (!studio) return;
  const state = {
    domain: studio.domain || 'build',
    selectedId: studio.selectedId || 'institution',
    avatarActive: studio.domain === 'avatar'
  };
  try { sessionStorage.setItem(UI_STATE_KEY, JSON.stringify(state)); } catch { /* non-critical */ }
}

function patchProjectPersistence() {
  if (ConfigStore.__avatarProfilePersistencePatched) return;
  Object.defineProperty(ConfigStore, '__avatarProfilePersistencePatched', { value: true });
  const save = ConfigStore.save.bind(ConfigStore);
  ConfigStore.save = (config) => {
    const result = save(config);
    const avatarProfile = config?.avatarProfile ? structuredClone(config.avatarProfile) : null;
    if (avatarProfile) {
      try {
        const raw = JSON.parse(localStorage.getItem(PROJECT_KEY) || '{}');
        raw.avatarProfile = avatarProfile;
        localStorage.setItem(PROJECT_KEY, JSON.stringify(raw));
      } catch { /* base store remains authoritative */ }
    }
    return avatarProfile ? { ...result, avatarProfile } : result;
  };
  const load = ConfigStore.load.bind(ConfigStore);
  ConfigStore.load = () => {
    const result = load();
    if (!result) return result;
    try {
      const raw = JSON.parse(localStorage.getItem(PROJECT_KEY) || '{}');
      if (raw.avatarProfile) result.avatarProfile = raw.avatarProfile;
    } catch { /* base result */ }
    return result;
  };
}

function cameraCandidate(controller) {
  const runtime = window.__IW?.runtime;
  const host = window.__IW?.renderHost;
  const root = controller.previewRoot;
  if (!runtime || !host?.camera || !root) return null;
  if (controller.runtimeRef !== runtime) {
    controller.runtimeRef?.sceneKit?.scene?.remove?.(root);
    runtime.sceneKit?.scene?.add?.(root);
    controller.runtimeRef = runtime;
  }
  const camera = host.camera;
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  forward.y = 0;
  if (forward.lengthSq() < 1e-5) forward.set(0, 0, -1);
  forward.normalize();
  const right = new THREE.Vector3(-forward.z, 0, forward.x).normalize();
  const volume = runtime.sceneKit?.navigationVolume?.(runtime.state.activeSpaceId);
  const bounds = volume?.bounds;
  const ground = controller.activeGround?.() ?? 0;
  const margin = 0.72;
  const distances = [2.35, 2.8, 1.9, 3.25];
  const laterals = [0, 0.48, -0.48, 0.82, -0.82];
  const projection = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  const frustum = new THREE.Frustum().setFromProjectionMatrix(projection);
  const centre = new THREE.Vector3();
  let fallback = null;
  for (const distance of distances) {
    for (const lateral of laterals) {
      const pos = camera.position.clone().addScaledVector(forward, distance).addScaledVector(right, lateral);
      if (bounds) {
        pos.x = clamp(pos.x, bounds.min[0] + margin, bounds.max[0] - margin);
        pos.z = clamp(pos.z, bounds.min[2] + margin, bounds.max[2] - margin);
      }
      pos.y = ground;
      root.position.set(pos.x, pos.y, pos.z);
      root.rotation.y = Math.atan2(camera.position.x - pos.x, camera.position.z - pos.z);
      controller.applyGrounding?.();
      root.visible = true;
      root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(root);
      box.getCenter(centre);
      const ndc = centre.clone().project(camera);
      const visible = frustum.intersectsBox(box) && ndc.z > -1 && ndc.z < 1 && Math.abs(ndc.x) < 0.82 && Math.abs(ndc.y) < 0.82;
      const sample = { position: root.position.toArray(), ndc: ndc.toArray(), visible, distance, lateral };
      if (!fallback) fallback = sample;
      if (visible) return sample;
    }
  }
  return fallback;
}

function diagnosticHTML(controller) {
  const p = controller.approvedPipeline || {};
  const stages = ['DOWNLOAD','BYTES','SHA256','PARSE','OBJECT3D','ATTACH','VISIBLE'];
  const rows = stages.map((stage) => {
    const item = p[stage] || { status: 'PENDING', detail: null };
    const cls = item.status === 'PASS' || item.status === 'CACHE' ? 'is-ok' : item.status === 'FAIL' ? 'is-bad' : '';
    return `<li class="${cls}"><b>${stage}</b><span>${esc(item.status)}</span><i>${esc(item.detail || '')}</i></li>`;
  }).join('');
  return `<section class="st-group st-avatar-approved-pipeline"><h3>Character 2027 · pipeline oficial</h3><p class="st-note">El preset sólo se considera listo después de provenance, parse, attach y visibilidad.</p><ol>${rows}</ol></section>`;
}

function installControllerFix(controller) {
  if (!controller || controller.__visibilityContinuityFixedV2) return;
  controller.__visibilityContinuityFixedV2 = true;
  controller.__loadGeneration = 0;
  controller.__cancelled = false;
  controller.__approvedAbort = null;
  controller.approvedPipeline = controller.approvedPipeline || {};

  const originalEditor = controller.editor.bind(controller);
  controller.editor = function editorWithApprovedPipeline() {
    const html = originalEditor();
    const diag = diagnosticHTML(this);
    const at = html.lastIndexOf('</section>');
    return at >= 0 ? `${html.slice(0, at)}${diag}${html.slice(at)}` : `${html}${diag}`;
  };

  const originalClear = controller.clearPreview.bind(controller);
  controller.clearPreview = function clearPreviewFixed() {
    originalClear();
    this.lastPlacement = null;
  };

  controller.placePreview = function placePreviewFixed() {
    if (!this.previewRoot) return false;
    const placement = cameraCandidate(this);
    this.lastPlacement = placement;
    if (this.profile?.asset?.source === 'APPROVED') {
      this.approvedPipeline.VISIBLE = {
        status: placement?.visible ? 'PASS' : 'FAIL',
        detail: placement?.visible ? 'inside Museum camera frustum' : 'preview root attached but outside safe frustum'
      };
    }
    this.validateGate1?.();
    return Boolean(placement?.visible);
  };

  controller.loadApproved = async function loadApprovedFixed({ auto = false } = {}) {
    const generation = ++this.__loadGeneration;
    this.__approvedAbort?.abort?.();
    const aborter = new AbortController();
    this.__approvedAbort = aborter;
    this.loading = true;
    this.error = null;
    this.approvedPipeline = {};
    this.studio.render();
    try {
      const cachedBytes = window.__IW_AVATAR_BINARY_CACHE?.approved?.bytes || null;
      const loaded = await loadApprovedCharacterAsset({
        signal: aborter.signal,
        cachedBytes,
        onStage: ({ stage, status, detail, pipeline }) => {
          if (generation !== this.__loadGeneration || this.__cancelled) return;
          this.approvedPipeline = { ...pipeline, ATTACH: this.approvedPipeline.ATTACH, VISIBLE: this.approvedPipeline.VISIBLE };
          this.studio.render();
        }
      });
      if (generation !== this.__loadGeneration || this.__cancelled || window.__IW_AVATAR_VISIBILITY_FIX?.currentController !== this) return false;
      window.__IW_AVATAR_BINARY_CACHE = window.__IW_AVATAR_BINARY_CACHE || {};
      window.__IW_AVATAR_BINARY_CACHE.approved = {
        bytes: loaded.bytes,
        format: 'glb',
        name: 'Character 2027 · aprobado',
        sha256: loaded.sha256
      };
      this.profile.asset = {
        source: 'APPROVED', presetId: PHASE3_APPROVED_AVATAR.assetId,
        name: 'Character 2027 · aprobado', format: 'glb', url: PHASE3_APPROVED_AVATAR.url,
        sha256: loaded.sha256, bytes: loaded.bytes.byteLength, requiresReselect: false
      };
      this.acceptGltf(loaded.gltf, this.profile.asset);
      const attached = Boolean(this.previewRoot && this.runtimeRef?.sceneKit?.scene?.children?.includes?.(this.previewRoot));
      this.approvedPipeline.ATTACH = { status: attached ? 'PASS' : 'FAIL', detail: attached ? 'same Museum Scene' : 'previewRoot not present in Museum Scene' };
      const visible = this.placePreview();
      if (!visible) throw new Error('Character 2027 parsed and attached but could not be placed inside the Museum camera frustum.');
      return true;
    } catch (error) {
      if (error?.name === 'AbortError') return false;
      if (error?.pipeline) this.approvedPipeline = { ...error.pipeline, ATTACH: this.approvedPipeline.ATTACH, VISIBLE: this.approvedPipeline.VISIBLE };
      if (generation === this.__loadGeneration && !this.__cancelled) this.error = `${auto ? 'Carga automática del preset' : 'Character 2027'}: ${String(error?.message || error)}`;
      return false;
    } finally {
      if (generation === this.__loadGeneration && !this.__cancelled && window.__IW_AVATAR_VISIBILITY_FIX?.currentController === this) {
        this.loading = false;
        this.changed();
      }
    }
  };

  controller.ensureApprovedVisible = async function ensureApprovedVisible() {
    if (this.profile?.asset?.source !== 'APPROVED') return false;
    if (this.previewRoot && this.lastPlacement?.visible) return true;
    return this.loadApproved({ auto: true });
  };

  controller.loadLocal = async function loadLocalFixed(file) {
    const generation = ++this.__loadGeneration;
    this.__approvedAbort?.abort?.();
    this.loading = true;
    this.error = null;
    this.studio.render();
    try {
      const ext = formatOf(file.name);
      if (!['glb','gltf','vrm'].includes(ext)) throw new Error('Formato no admitido. Usa GLB, GLTF o VRM.');
      const bytes = await file.arrayBuffer();
      const sha256 = await crypto.subtle.digest('SHA-256', bytes).then((digest) => [...new Uint8Array(digest)].map((v) => v.toString(16).padStart(2, '0')).join(''));
      const payload = ext === 'gltf' ? new TextDecoder().decode(bytes) : bytes;
      const gltf = await this.parse(payload, '');
      if (generation !== this.__loadGeneration || this.__cancelled || window.__IW_AVATAR_VISIBILITY_FIX?.currentController !== this) return;
      window.__IW_AVATAR_BINARY_CACHE = window.__IW_AVATAR_BINARY_CACHE || {};
      window.__IW_AVATAR_BINARY_CACHE.local = { bytes, format: ext, name: file.name, sha256, size: file.size };
      this.profile.asset = { source: 'LOCAL', presetId: null, name: file.name, format: ext, url: null, sha256, bytes: file.size, requiresReselect: true };
      this.acceptGltf(gltf, this.profile.asset);
      this.placePreview();
    } catch (error) {
      if (generation === this.__loadGeneration && !this.__cancelled) this.error = `${file.name}: ${String(error?.message || error)}${formatOf(file.name) === 'gltf' ? ' · Para GLTF con .bin/texturas externas usa GLB en este gate.' : ''}`;
    } finally {
      if (generation === this.__loadGeneration && !this.__cancelled && window.__IW_AVATAR_VISIBILITY_FIX?.currentController === this) {
        this.loading = false;
        this.changed();
      }
    }
  };

  controller.restoreCachedPreview = async function restoreCachedPreview() {
    const cache = window.__IW_AVATAR_BINARY_CACHE;
    if (this.profile.asset?.source === 'APPROVED') return this.ensureApprovedVisible();
    const wanted = cache?.local;
    if (!wanted?.bytes) return false;
    try {
      this.loading = true;
      this.studio.render();
      const payload = wanted.format === 'gltf' ? new TextDecoder().decode(wanted.bytes) : wanted.bytes;
      const gltf = await this.parse(payload, '');
      if (window.__IW_AVATAR_VISIBILITY_FIX?.currentController !== this) return false;
      this.acceptGltf(gltf, this.profile.asset);
      return this.placePreview();
    } catch (error) {
      this.error = `No se pudo restaurar el preview de sesión: ${String(error?.message || error)}`;
      return false;
    } finally {
      if (window.__IW_AVATAR_VISIBILITY_FIX?.currentController === this) {
        this.loading = false;
        this.changed();
      }
    }
  };
}

function patchStudioLifecycle(studio) {
  const proto = studio?.constructor?.prototype;
  if (!proto || proto.__avatarVisibilityContinuityLifecycle) return;
  Object.defineProperty(proto, '__avatarVisibilityContinuityLifecycle', { value: true });
  const apply = proto._apply;
  proto._apply = async function avatarContinuityApply() {
    rememberStudio(this);
    if (this.__avatarPhase5?.loading) {
      this._say?.('Espera a que termine de cargar el avatar antes de actualizar la vista previa.', true);
      return;
    }
    return apply.call(this);
  };
  const save = proto._save;
  proto._save = function avatarContinuitySave() {
    rememberStudio(this);
    if (this.__avatarPhase5?.loading) {
      this._say?.('Espera a que termine de cargar el avatar antes de guardar.', true);
      return;
    }
    this.__avatarPhase5?.persist?.();
    const result = save.call(this);
    rememberStudio(this);
    return result;
  };
  const topBar = proto._topBar;
  proto._topBar = function avatarContinuityTopBar(r) {
    let html = topBar.call(this, r);
    if (!this.__avatarPhase5?.loading) return html;
    html = html.replace('data-act="save"', 'data-act="save" disabled title="Cargando avatar…"');
    html = html.replace('data-act="apply"', 'data-act="apply" disabled title="Cargando avatar…"');
    return html;
  };
}

export async function installMuseumAvatarVisibilityContinuity() {
  const base = window.__IW_AVATAR_STUDIO_PHASE5;
  const studio = window.__IW_STUDIO;
  const controller = base?.controller;
  if (!studio || !controller) return { mounted: false, reason: 'avatar-gate-not-mounted' };
  patchProjectPersistence();
  patchStudioLifecycle(studio);
  const previous = window.__IW_AVATAR_VISIBILITY_FIX?.currentController;
  if (previous && previous !== controller) {
    previous.__cancelled = true;
    previous.__approvedAbort?.abort?.();
    previous.__loadGeneration = (previous.__loadGeneration || 0) + 1;
  }
  window.__IW_AVATAR_VISIBILITY_FIX = {
    id: FIX_ID,
    currentController: controller,
    report: () => ({
      fix: FIX_ID,
      domain: studio.domain,
      loading: controller.loading,
      profileAsset: controller.profile?.asset?.name || null,
      approvedPipeline: structuredClone(controller.approvedPipeline || {}),
      previewLoaded: Boolean(controller.previewRoot),
      previewVisible: Boolean(controller.lastPlacement?.visible),
      placement: controller.lastPlacement || null,
      sameMuseumScene: Boolean(controller.previewRoot && controller.runtimeRef?.sceneKit?.scene?.children?.includes?.(controller.previewRoot)),
      extraRenderer: false,
      extraScene: false,
      extraCameraAuthority: false
    })
  };
  installControllerFix(controller);

  studio.root?.addEventListener('click', (event) => {
    const domain = event.target?.closest?.('[data-domain]')?.dataset?.domain;
    if (!domain) return;
    try { sessionStorage.setItem(UI_STATE_KEY, JSON.stringify({ ...readUIState(), domain, avatarActive: domain === 'avatar' })); } catch { /* */ }
    if (domain === 'avatar') {
      requestAnimationFrame(() => {
        const current = window.__IW_AVATAR_VISIBILITY_FIX?.currentController;
        if (current === controller && controller.profile?.asset?.source === 'APPROVED' && !controller.previewRoot && !controller.loading) {
          controller.ensureApprovedVisible();
        }
      });
    }
  }, true);

  const ui = readUIState();
  if (ui.avatarActive || ui.domain === 'avatar') {
    studio.domain = 'avatar';
    if (ui.selectedId) studio.selectedId = ui.selectedId;
    studio.render();
    await controller.restoreCachedPreview();
  }

  document.documentElement.dataset.avatarVisibilityContinuity = 'ready';
  console.info('[Museum Avatar Studio] approved preset + visibility continuity ready', window.__IW_AVATAR_VISIBILITY_FIX.report());
  return { mounted: true, controller, report: window.__IW_AVATAR_VISIBILITY_FIX.report };
}
