import { THREE } from '../../render/render-host.js';
import { GLTFLoader } from '../../vendor/three/addons/loaders/GLTFLoader.js';
import { StudioShell } from './studio-shell.js';
import { ConfigStore } from '../config-store.js';
import { PHASE3_APPROVED_AVATAR } from '../../character/museum-character-phase3.js';

const PROFILE_KEY = 'iw.museum.avatar-profile.v1';
const TARGET_HEIGHT = 1.66;
const REQUIRED_BONES = Object.freeze([
  'hips','spine','chest','neck','head',
  'leftUpperArm','leftLowerArm','leftHand',
  'rightUpperArm','rightLowerArm','rightHand',
  'leftUpperLeg','leftLowerLeg','leftFoot',
  'rightUpperLeg','rightLowerLeg','rightFoot'
]);

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));
const clamp = (v, lo, hi) => Math.min(Math.max(Number(v) || 0, lo), hi);
const formatOf = (name = '') => String(name).split('.').pop()?.toLowerCase() || 'glb';

function defaultProfile() {
  return {
    asset: {
      source: 'APPROVED',
      presetId: PHASE3_APPROVED_AVATAR.assetId,
      name: 'Character 2027 · aprobado',
      format: 'glb',
      url: PHASE3_APPROVED_AVATAR.url,
      sha256: PHASE3_APPROVED_AVATAR.expectedSha256,
      bytes: PHASE3_APPROVED_AVATAR.expectedByteLength,
      requiresReselect: false
    },
    scale: { targetHeight: TARGET_HEIGHT, factor: null, measuredHeight: null },
    grounding: { enabled: true, offsetY: 0, status: 'PENDING' },
    rigStatus: { status: 'UNVALIDATED', pass: null, boneCount: 0, skinnedMeshCount: 0, missing: [] },
    motionSet: {
      foundation: 'V2',
      states: ['IDLE_V2','WALK_V2','STOP_V2','TURN_LEFT_V2','TURN_RIGHT_V2','JUMP']
    },
    lookAt: { enabled: false },
    ik: { enabled: false },
    semanticActions: [],
    validationStatus: { status: 'PENDING', errors: [], warnings: [] }
  };
}

function normaliseProfile(input) {
  const base = defaultProfile();
  const p = input || {};
  const source = p.asset?.source === 'LOCAL' ? 'LOCAL' : 'APPROVED';
  return {
    asset: {
      ...base.asset,
      ...(p.asset || {}),
      source,
      name: String(p.asset?.name || base.asset.name).slice(0, 180),
      format: ['glb','gltf','vrm'].includes(p.asset?.format) ? p.asset.format : base.asset.format,
      url: source === 'APPROVED' ? PHASE3_APPROVED_AVATAR.url : null,
      requiresReselect: source === 'LOCAL'
    },
    scale: {
      targetHeight: clamp(p.scale?.targetHeight ?? TARGET_HEIGHT, 1.2, 2.2),
      factor: Number.isFinite(Number(p.scale?.factor)) ? Number(p.scale.factor) : null,
      measuredHeight: Number.isFinite(Number(p.scale?.measuredHeight)) ? Number(p.scale.measuredHeight) : null
    },
    grounding: {
      enabled: p.grounding?.enabled !== false,
      offsetY: clamp(p.grounding?.offsetY ?? 0, -0.3, 0.3),
      status: ['PASS','REVIEW','PENDING'].includes(p.grounding?.status) ? p.grounding.status : 'PENDING'
    },
    rigStatus: {
      status: ['PASS','REVIEW','UNVALIDATED'].includes(p.rigStatus?.status) ? p.rigStatus.status : 'UNVALIDATED',
      pass: typeof p.rigStatus?.pass === 'boolean' ? p.rigStatus.pass : null,
      boneCount: Math.max(0, Number(p.rigStatus?.boneCount) || 0),
      skinnedMeshCount: Math.max(0, Number(p.rigStatus?.skinnedMeshCount) || 0),
      missing: Array.isArray(p.rigStatus?.missing) ? p.rigStatus.missing.slice(0, 64).map(String) : []
    },
    motionSet: {
      foundation: 'V2',
      states: [...base.motionSet.states]
    },
    lookAt: { enabled: false },
    ik: { enabled: false },
    semanticActions: [],
    validationStatus: {
      status: ['READY_GATE1','REVIEW','PENDING'].includes(p.validationStatus?.status) ? p.validationStatus.status : 'PENDING',
      errors: Array.isArray(p.validationStatus?.errors) ? p.validationStatus.errors.slice(0, 32).map(String) : [],
      warnings: Array.isArray(p.validationStatus?.warnings) ? p.validationStatus.warnings.slice(0, 32).map(String) : []
    }
  };
}

const AvatarProfileStore = {
  load() {
    try {
      const raw = localStorage.getItem(PROFILE_KEY);
      return normaliseProfile(raw ? JSON.parse(raw) : null);
    } catch {
      return defaultProfile();
    }
  },
  save(profile) {
    const clean = normaliseProfile(profile);
    localStorage.setItem(PROFILE_KEY, JSON.stringify(clean));
    return clean;
  }
};

async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((v) => v.toString(16).padStart(2, '0')).join('');
}

function inspectHumanoid(root) {
  const names = new Set();
  let skinnedMeshCount = 0;
  root.traverse((node) => {
    if (node.isBone) names.add(node.name);
    if (node.isSkinnedMesh) {
      skinnedMeshCount += 1;
      node.skeleton?.bones?.forEach((bone) => names.add(bone.name));
    }
  });
  const missing = REQUIRED_BONES.filter((name) => !names.has(name));
  return {
    pass: skinnedMeshCount > 0 && missing.length === 0,
    boneCount: names.size,
    skinnedMeshCount,
    missing
  };
}

function disposeObject(root) {
  root?.traverse?.((node) => {
    node.geometry?.dispose?.();
    const materials = Array.isArray(node.material) ? node.material : node.material ? [node.material] : [];
    for (const material of materials) {
      for (const value of Object.values(material || {})) if (value?.isTexture) value.dispose?.();
      material?.dispose?.();
    }
  });
}

class AvatarStudioGate1 {
  constructor(studio) {
    this.studio = studio;
    this.profile = normaliseProfile(studio.config.avatarProfile || AvatarProfileStore.load());
    this.studio.config.avatarProfile = this.profile;
    this.loader = new GLTFLoader();
    this.previewRoot = null;
    this.visual = null;
    this.sourceHeight = null;
    this.loading = false;
    this.error = null;
    this.lastLoaded = null;
    this.runtimeRef = null;
  }

  syncProfile() {
    this.studio.config.avatarProfile = this.profile;
  }

  persist() {
    this.profile = AvatarProfileStore.save(this.profile);
    this.syncProfile();
  }

  status() {
    if (this.loading) return 'CARGANDO';
    if (this.error) return 'REVISAR';
    if (this.previewRoot && this.profile.rigStatus.pass) return 'LISTO GATE 1';
    if (this.profile.asset.source === 'LOCAL' && this.profile.asset.requiresReselect && !this.previewRoot) return 'RESELECCIONAR ARCHIVO';
    return 'PREPARADO';
  }

  secondColumn() {
    const rig = this.profile.rigStatus;
    const ground = this.profile.grounding;
    const rows = [
      ['01','Seleccionar / subir', this.profile.asset.name],
      ['02','Preview', this.previewRoot ? 'Visible en Museum' : 'Sin cargar'],
      ['03','Rig', rig.pass === true ? 'PASS' : rig.pass === false ? 'REVIEW' : 'Pendiente'],
      ['04','Escala', `${this.profile.scale.targetHeight.toFixed(2)} m`],
      ['05','Grounding', ground.status],
      ['06','Motion','Siguiente gate'],
      ['07','IK / LookAt','Fase 5 · posterior'],
      ['08','Acciones','Fase 6'],
      ['09','Lab','Siguiente gate'],
      ['10','Validar','Cierre Fase 5']
    ];
    return `<section class="st-tree st-avatar-tree" aria-label="Avatar Studio">
      <h2>Avatar</h2>
      <p class="st-note">Un perfil, un preview y el mismo renderer del Museum.</p>
      <ol>${rows.map(([n,label,state], i) => `<li class="${i < 5 ? 'is-now' : 'is-later'}"><b>${n}</b><span>${esc(label)}</span><i>${esc(state)}</i></li>`).join('')}</ol>
      <p class="st-treefoot">Phase 5 · Gate 1</p>
    </section>`;
  }

  editor() {
    const p = this.profile;
    const rig = p.rigStatus;
    const errors = p.validationStatus.errors || [];
    const localNote = p.asset.source === 'LOCAL'
      ? '<p class="st-note st-avatar-note">El archivo local vive en esta sesión. El perfil y sus medidas sí se guardan; tras recargar deberás seleccionar de nuevo el archivo local.</p>'
      : '<p class="st-note st-avatar-note">Este es el mismo asset aprobado y trazado que usa Character 2027 en el Museum.</p>';
    return `<section class="st-ed st-avatar-ed" aria-label="Editor de Avatar">
      <header class="st-edtop"><div><p class="st-eyebrow">Avatar</p><h2>Perfil del visitante</h2></div><code class="st-id">PHASE 5 · G1</code></header>

      <section class="st-group"><h3>Seleccionar / subir</h3>
        <div class="st-avatar-pick">
          <button class="st-b st-b--go" data-avatar-approved ${this.loading ? 'disabled' : ''}>Usar Character 2027 aprobado</button>
          <label class="st-avatar-upload"><span>Subir avatar local</span><input data-avatar-upload type="file" accept=".glb,.gltf,.vrm,model/gltf-binary,model/gltf+json"></label>
        </div>
        <dl class="st-avatar-facts">
          <dt>Asset</dt><dd>${esc(p.asset.name)}</dd>
          <dt>Origen</dt><dd>${p.asset.source === 'LOCAL' ? 'Archivo local' : 'Character aprobado'}</dd>
          <dt>Formato</dt><dd>${esc(p.asset.format.toUpperCase())}</dd>
          <dt>Estado</dt><dd><b class="st-avatar-state">${esc(this.status())}</b></dd>
        </dl>
        ${localNote}
        ${this.error ? `<p class="st-msg is-bad">${esc(this.error)}</p>` : ''}
      </section>

      <section class="st-group"><h3>Preview · Museum renderer</h3>
        <p class="st-note">No existe otro canvas, renderer, Scene ni CameraAuthority. El avatar se añade como objeto de preview a la escena Museum activa.</p>
        <div class="st-avatar-actions">
          <button class="st-b" data-avatar-show ${this.previewRoot ? '' : 'disabled'}>Recolocar en vista</button>
          <button class="st-b" data-avatar-hide ${this.previewRoot ? '' : 'disabled'}>Retirar preview</button>
        </div>
      </section>

      <section class="st-group"><h3>Rig</h3>
        <div class="st-avatar-metric ${rig.pass === true ? 'is-ok' : rig.pass === false ? 'is-bad' : ''}">
          <strong>${rig.pass === true ? 'RIG PASS' : rig.pass === false ? 'RIG REVIEW' : 'SIN VALIDAR'}</strong>
          <span>${rig.boneCount} bones · ${rig.skinnedMeshCount} skinned mesh</span>
        </div>
        ${rig.missing.length ? `<p class="st-note">Faltan: ${rig.missing.map(esc).join(', ')}</p>` : '<p class="st-note">La inspección del rig aparecerá aquí al cargar un avatar.</p>'}
      </section>

      <section class="st-group"><h3>Escala</h3>
        <label class="st-f"><span class="st-l">Altura objetivo</span><span class="st-h">La misma normalización usada por Character 2027</span>
          <input data-avatar-height type="number" min="1.20" max="2.20" step="0.01" value="${p.scale.targetHeight.toFixed(2)}">
        </label>
        <dl class="st-avatar-facts"><dt>Factor</dt><dd>${p.scale.factor == null ? '—' : p.scale.factor.toFixed(5)}</dd><dt>Altura medida</dt><dd>${p.scale.measuredHeight == null ? '—' : `${p.scale.measuredHeight.toFixed(3)} m`}</dd></dl>
      </section>

      <section class="st-group"><h3>Grounding</h3>
        <label class="st-avatar-check"><input data-avatar-grounding type="checkbox" ${p.grounding.enabled ? 'checked' : ''}><span>Grounding automático</span></label>
        <label class="st-f"><span class="st-l">Offset Y</span><input data-avatar-offset type="number" min="-0.30" max="0.30" step="0.01" value="${Number(p.grounding.offsetY).toFixed(2)}"></label>
        <div class="st-avatar-metric ${p.grounding.status === 'PASS' ? 'is-ok' : ''}"><strong>${esc(p.grounding.status)}</strong><span>contacto con suelo del navigationVolume activo</span></div>
      </section>

      <section class="st-avatar-future"><h3>Siguiente Gate</h3><p>Motion + LAB usarán este mismo perfil y este mismo preview. IK / LookAt y acciones avanzadas permanecen desactivadas hasta su gate correspondiente.</p></section>
      ${errors.length ? `<p class="st-msg is-bad">${errors.map(esc).join(' · ')}</p>` : ''}
    </section>`;
  }

  filmstrip() {
    const p = this.profile;
    return `<section class="st-film st-avatar-film" aria-label="Estado del avatar"><div class="st-filmhead"><h3>${esc(p.asset.name)}</h3><span>Avatar Profile · Gate 1</span></div><div class="st-avatar-strip"><span>${p.rigStatus.pass ? 'RIG PASS' : 'RIG —'}</span><span>${p.scale.targetHeight.toFixed(2)} m</span><span>GROUND ${esc(p.grounding.status)}</span><span>${this.previewRoot ? 'PREVIEW ON' : 'PREVIEW OFF'}</span><span>1 RENDERER</span></div></section>`;
  }

  bind(scope) {
    const one = (selector, event, fn) => {
      const el = scope.querySelector?.(selector);
      if (el) el.addEventListener(event, fn);
    };
    one('[data-avatar-approved]', 'click', () => this.loadApproved());
    one('[data-avatar-upload]', 'change', (e) => {
      const file = e.target.files?.[0];
      if (file) this.loadLocal(file);
    });
    one('[data-avatar-show]', 'click', () => { this.placePreview(); this.studio.render(); });
    one('[data-avatar-hide]', 'click', () => { this.clearPreview(); this.studio.render(); });
    one('[data-avatar-height]', 'change', (e) => this.setTargetHeight(e.target.value));
    one('[data-avatar-grounding]', 'change', (e) => {
      this.profile.grounding.enabled = e.target.checked;
      this.applyGrounding(); this.changed();
    });
    one('[data-avatar-offset]', 'change', (e) => {
      this.profile.grounding.offsetY = clamp(e.target.value, -0.3, 0.3);
      this.applyGrounding(); this.changed();
    });
  }

  changed({ render = true } = {}) {
    this.validateGate1();
    this.syncProfile();
    this.studio._markDirty();
    if (render) this.studio.render();
  }

  validateGate1() {
    const errors = [];
    const warnings = [];
    if (this.profile.rigStatus.pass === false) errors.push(`Rig incompleto: ${this.profile.rigStatus.missing.join(', ') || 'sin skinned mesh'}`);
    if (this.profile.asset.source === 'LOCAL') warnings.push('El binario local requiere reselección después de recargar.');
    if (!this.previewRoot) warnings.push('Carga el avatar para verificar su preview actual.');
    this.profile.validationStatus = {
      status: errors.length ? 'REVIEW' : this.profile.rigStatus.pass && this.profile.grounding.status === 'PASS' ? 'READY_GATE1' : 'PENDING',
      errors,
      warnings
    };
  }

  async loadApproved() {
    this.loading = true; this.error = null; this.studio.render();
    try {
      const response = await fetch(PHASE3_APPROVED_AVATAR.url, { cache: 'no-store', mode: 'cors' });
      if (!response.ok) throw new Error(`Asset aprobado: HTTP ${response.status}`);
      const bytes = await response.arrayBuffer();
      const sha256 = await sha256Hex(bytes);
      if (bytes.byteLength !== PHASE3_APPROVED_AVATAR.expectedByteLength || sha256 !== PHASE3_APPROVED_AVATAR.expectedSha256) {
        throw new Error('El asset aprobado no coincide con su provenance SHA/byteLength.');
      }
      const gltf = await this.parse(bytes, new URL('.', PHASE3_APPROVED_AVATAR.url).href);
      this.profile.asset = {
        source: 'APPROVED', presetId: PHASE3_APPROVED_AVATAR.assetId,
        name: 'Character 2027 · aprobado', format: 'glb', url: PHASE3_APPROVED_AVATAR.url,
        sha256, bytes: bytes.byteLength, requiresReselect: false
      };
      this.acceptGltf(gltf, this.profile.asset);
    } catch (error) {
      this.error = String(error?.message || error);
    } finally {
      this.loading = false; this.changed();
    }
  }

  async loadLocal(file) {
    this.loading = true; this.error = null; this.studio.render();
    try {
      const ext = formatOf(file.name);
      if (!['glb','gltf','vrm'].includes(ext)) throw new Error('Formato no admitido. Usa GLB, GLTF o VRM.');
      const bytes = await file.arrayBuffer();
      const sha256 = await sha256Hex(bytes);
      const payload = ext === 'gltf' ? new TextDecoder().decode(bytes) : bytes;
      const gltf = await this.parse(payload, '');
      this.profile.asset = {
        source: 'LOCAL', presetId: null, name: file.name, format: ext,
        url: null, sha256, bytes: file.size, requiresReselect: true
      };
      this.acceptGltf(gltf, this.profile.asset);
    } catch (error) {
      this.error = `${file.name}: ${String(error?.message || error)}${formatOf(file.name) === 'gltf' ? ' · Para GLTF con .bin/texturas externas usa GLB en este gate.' : ''}`;
    } finally {
      this.loading = false; this.changed();
    }
  }

  parse(payload, resourcePath) {
    return new Promise((resolve, reject) => this.loader.parse(payload, resourcePath, resolve, reject));
  }

  acceptGltf(gltf, asset) {
    const visual = gltf?.scene;
    if (!visual) throw new Error('El archivo no contiene una escena GLTF utilizable.');
    this.clearPreview();
    visual.traverse((node) => {
      if (node.isMesh) { node.castShadow = true; node.receiveShadow = true; }
    });
    visual.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(visual);
    const size = box.getSize(new THREE.Vector3());
    if (!(size.y > 0.05)) throw new Error('No se pudo medir una altura válida en el avatar.');
    this.sourceHeight = size.y;
    this.visual = visual;
    this.previewRoot = new THREE.Group();
    this.previewRoot.name = 'MUSEUM_AVATAR_STUDIO_PREVIEW_GATE1';
    this.previewRoot.add(visual);
    this.runtimeRef = window.__IW?.runtime || null;
    this.runtimeRef?.sceneKit?.scene?.add?.(this.previewRoot);
    this.applyScale();
    const rig = inspectHumanoid(visual);
    this.profile.rigStatus = { status: rig.pass ? 'PASS' : 'REVIEW', ...rig };
    this.lastLoaded = asset;
    this.placePreview();
    this.validateGate1();
  }

  applyScale() {
    if (!this.visual || !this.sourceHeight) return;
    const target = this.profile.scale.targetHeight;
    const factor = target / this.sourceHeight;
    this.visual.scale.setScalar(factor);
    this.visual.position.set(0, 0, 0);
    this.visual.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.visual);
    const centre = box.getCenter(new THREE.Vector3());
    this.visual.position.x -= centre.x;
    this.visual.position.z -= centre.z;
    this.visual.position.y -= box.min.y;
    this.visual.updateMatrixWorld(true);
    const finalBox = new THREE.Box3().setFromObject(this.visual);
    this.profile.scale.factor = factor;
    this.profile.scale.measuredHeight = finalBox.getSize(new THREE.Vector3()).y;
    this.applyGrounding();
  }

  setTargetHeight(value) {
    this.profile.scale.targetHeight = clamp(value, 1.2, 2.2);
    this.applyScale();
    this.changed();
  }

  activeGround() {
    const runtime = window.__IW?.runtime;
    if (!runtime?.sceneKit) return 0;
    const volume = runtime.sceneKit.navigationVolume?.(runtime.state.activeSpaceId);
    return volume?.bounds?.min?.[1] ?? 0;
  }

  applyGrounding() {
    if (!this.previewRoot) {
      this.profile.grounding.status = 'PENDING';
      return;
    }
    const ground = this.activeGround();
    const y = this.profile.grounding.enabled ? ground + this.profile.grounding.offsetY : ground;
    this.previewRoot.position.y = y;
    this.previewRoot.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.previewRoot);
    const delta = Math.abs(box.min.y - y);
    this.profile.grounding.status = delta < 0.015 ? 'PASS' : 'REVIEW';
  }

  placePreview() {
    if (!this.previewRoot) return;
    const runtime = window.__IW?.runtime;
    if (!runtime) return;
    if (this.runtimeRef !== runtime) {
      this.runtimeRef?.sceneKit?.scene?.remove?.(this.previewRoot);
      runtime.sceneKit?.scene?.add?.(this.previewRoot);
      this.runtimeRef = runtime;
    }
    const pose = runtime.camera?.pose || {};
    const camera = pose.position || [0, 1.7, 4];
    const target = pose.target || [0, 1.2, 0];
    let dx = camera[0] - target[0];
    let dz = camera[2] - target[2];
    const len = Math.hypot(dx, dz) || 1;
    dx /= len; dz /= len;
    let x = target[0] + dx * 1.45;
    let z = target[2] + dz * 1.45;
    const volume = runtime.sceneKit?.navigationVolume?.(runtime.state.activeSpaceId);
    if (volume?.bounds) {
      x = clamp(x, volume.bounds.min[0] + 0.65, volume.bounds.max[0] - 0.65);
      z = clamp(z, volume.bounds.min[2] + 0.65, volume.bounds.max[2] - 0.65);
    }
    this.previewRoot.position.x = x;
    this.previewRoot.position.z = z;
    this.previewRoot.rotation.y = Math.atan2(camera[0] - x, camera[2] - z);
    this.applyGrounding();
    this.previewRoot.visible = true;
    this.previewRoot.updateMatrixWorld(true);
  }

  clearPreview() {
    if (!this.previewRoot) return;
    this.runtimeRef?.sceneKit?.scene?.remove?.(this.previewRoot);
    disposeObject(this.previewRoot);
    this.previewRoot = null;
    this.visual = null;
    this.sourceHeight = null;
    this.runtimeRef = null;
    this.profile.grounding.status = 'PENDING';
    this.validateGate1();
  }

  report() {
    return {
      phase: 'PHASE5_AVATAR_STUDIO_GATE1',
      domain: this.studio.domain,
      profile: normaliseProfile(this.profile),
      preview: {
        loaded: Boolean(this.previewRoot),
        sameMuseumScene: Boolean(this.previewRoot && this.runtimeRef?.sceneKit?.scene?.children?.includes?.(this.previewRoot)),
        extraRenderer: false,
        extraScene: false,
        extraCameraAuthority: false
      }
    };
  }
}

function installPrototypeGraft() {
  const proto = StudioShell.prototype;
  if (proto.__avatarPhase5Patched) return;
  Object.defineProperty(proto, '__avatarPhase5Patched', { value: true });

  const rail = proto._rail;
  proto._rail = function avatarRail() {
    const html = rail.call(this);
    const gate = this.__avatarPhase5;
    if (!gate) return html;
    const on = this.domain === 'avatar';
    const avatar = `<li class="st-avatar-domain"><button class="st-dom ${on ? 'is-on' : ''}" data-domain="avatar" aria-current="${on ? 'true' : 'false'}" title="Avatar, rig, escala y grounding"><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="5.2" r="2.6"/><path d="M5.4 17v-3.4c0-2.6 2-4.6 4.6-4.6s4.6 2 4.6 4.6V17M7.2 12.2 5 15M12.8 12.2l2.2 2.8"/></svg><span><b>Avatar</b><i>Identidad, rig, escala y motion</i><em>Fase 5</em></span></button>${on ? '<ul class="st-areas"><li>Seleccionar / subir</li><li>Preview</li><li>Rig</li><li>Escala</li><li>Grounding</li><li>Motion</li><li>IK / LookAt</li><li>Acciones</li><li>Lab</li><li>Validar</li></ul>' : ''}</li>`;
    const at = html.lastIndexOf('</ul>');
    return at >= 0 ? `${html.slice(0, at)}${avatar}${html.slice(at)}` : html;
  };

  const second = proto._secondColumn;
  proto._secondColumn = function avatarSecondColumn() {
    if (this.domain === 'avatar' && this.__avatarPhase5) return this.__avatarPhase5.secondColumn();
    return second.call(this);
  };

  const editor = proto._editor;
  proto._editor = function avatarEditor() {
    if (this.domain === 'avatar' && this.__avatarPhase5) return this.__avatarPhase5.editor();
    return editor.call(this);
  };

  const film = proto._filmstrip;
  proto._filmstrip = function avatarFilmstrip() {
    if (this.domain === 'avatar' && this.__avatarPhase5) return this.__avatarPhase5.filmstrip();
    return film.call(this);
  };

  const crumbs = proto._crumbHTML;
  proto._crumbHTML = function avatarCrumbs() {
    if (this.domain === 'avatar' && this.__avatarPhase5) {
      const institution = this.config.institution?.name?.replace?.(/\s*\(.*\)$/, '') || 'Institución';
      return `<span>${esc(institution)}</span><span>${esc(this.config.exhibition?.title || this.world?.title || 'Exposición')}</span><span class="st-here">Avatar Studio</span>`;
    }
    return crumbs.call(this);
  };

  const bind = proto._bind;
  proto._bind = function avatarBind(scope = this.root) {
    bind.call(this, scope);
    if (this.domain === 'avatar') this.__avatarPhase5?.bind(scope);
  };

  const saved = proto._isSaved;
  proto._isSaved = function avatarIsSaved() {
    if (!saved.call(this)) return false;
    if (!this.__avatarPhase5) return true;
    const stored = AvatarProfileStore.load();
    return JSON.stringify(normaliseProfile(stored)) === JSON.stringify(normaliseProfile(this.config.avatarProfile));
  };

  const save = proto._save;
  proto._save = function avatarSave() {
    this.__avatarPhase5?.persist();
    return save.call(this);
  };

  const destroy = proto.destroy;
  proto.destroy = function avatarDestroy() {
    this.__avatarPhase5?.clearPreview();
    return destroy.call(this);
  };
}

export function installMuseumAvatarStudioPhase5() {
  if (new URLSearchParams(location.search).get('authoring') !== '1') return { mounted: false, reason: 'authoring-off' };
  installPrototypeGraft();
  const studio = window.__IW_STUDIO;
  if (!studio) return { mounted: false, reason: 'studio-not-mounted' };

  window.__IW_AVATAR_STUDIO_PHASE5?.controller?.clearPreview?.();
  const controller = new AvatarStudioGate1(studio);
  studio.__avatarPhase5 = controller;
  studio.config.avatarProfile = controller.profile;
  window.__IW_AVATAR_STUDIO_PHASE5 = {
    ready: true,
    gate: 'PHASE5_GATE1',
    controller,
    report: () => controller.report()
  };
  document.documentElement.dataset.avatarStudioPhase5 = 'gate1-ready';
  studio.render();
  console.info('[Museum Avatar Studio] Phase 5 Gate 1 ready', controller.report());
  return { mounted: true, controller };
}
