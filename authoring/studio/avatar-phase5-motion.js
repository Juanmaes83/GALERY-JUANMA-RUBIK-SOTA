import { createCharacterMotionV2, MOTION_V2_PROVENANCE } from '../../character/character-motion-v2.js';

const MOTION_ACTIONS = Object.freeze([
  ['IDLE_V2', 'IDLE'],
  ['WALK_V2', 'WALK'],
  ['STOP_V2', 'STOP'],
  ['TURN_LEFT_V2', 'TURN L'],
  ['TURN_RIGHT_V2', 'TURN R'],
  ['JUMP', 'JUMP']
]);

const NON_LOOPING = new Set(['STOP_V2', 'TURN_LEFT_V2', 'TURN_RIGHT_V2', 'JUMP']);
const SAMPLE_BONES = Object.freeze(['hips','chest','head','leftUpperArm','rightUpperArm','leftUpperLeg','rightUpperLeg','leftLowerLeg','rightLowerLeg']);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

// Exact Museum-side extraction of the preparation step used by the proven
// CharacterStudio MotionLab before it created its MotionController. Frozen donor:
// donors-frozen/.../rig/BoneMap.js @ 0c74181a...
function sameSkeletonLayout(a, b) {
  if (!a || !b || a.bones.length !== b.bones.length) return false;
  for (let i = 0; i < a.bones.length; i += 1) {
    if (a.bones[i].name !== b.bones[i].name) return false;
  }
  return true;
}

function prepareCanonicalSkeleton(root) {
  const meshes = [];
  root?.traverse?.((node) => {
    if (node.isSkinnedMesh && node.skeleton) meshes.push(node);
  });
  const canonical = meshes[0]?.skeleton || null;
  if (!canonical) {
    return {
      meshes,
      canonical: null,
      boneMap: new Map(),
      diagnostics: { skinnedMeshes: 0, unifiedMeshes: 0, canonicalBoneCount: 0, canonicalMappedBones: 0 }
    };
  }

  let unifiedMeshes = 0;
  for (let i = 1; i < meshes.length; i += 1) {
    const mesh = meshes[i];
    if (!sameSkeletonLayout(canonical, mesh.skeleton)) continue;
    mesh.skeleton = canonical;
    unifiedMeshes += 1;
  }

  canonical.pose();
  canonical.update();
  root.updateMatrixWorld?.(true);

  const boneMap = new Map();
  canonical.bones.forEach((bone) => {
    if (bone?.isBone && bone.name && !boneMap.has(bone.name)) boneMap.set(bone.name, bone);
  });

  return {
    meshes,
    canonical,
    boneMap,
    diagnostics: {
      skinnedMeshes: meshes.length,
      unifiedMeshes,
      canonicalBoneCount: canonical.bones.length,
      canonicalMappedBones: boneMap.size
    }
  };
}

function snapshotPose(boneMap) {
  const pose = new Map();
  for (const name of SAMPLE_BONES) {
    const bone = boneMap?.get?.(name);
    if (bone?.isBone) pose.set(name, bone.quaternion.clone());
  }
  return pose;
}

function comparePose(before, boneMap) {
  const changed = [];
  for (const [name, initial] of before.entries()) {
    const bone = boneMap?.get?.(name);
    if (!bone?.isBone) continue;
    const angle = initial.angleTo(bone.quaternion);
    if (angle > 0.002) changed.push({ name, angle });
  }
  return changed;
}

function snapshotMeshBounds(meshes) {
  const samples = [];
  for (const mesh of meshes || []) {
    if (!mesh?.isSkinnedMesh || typeof mesh.computeBoundingBox !== 'function') continue;
    try {
      mesh.computeBoundingBox();
      const box = mesh.boundingBox;
      if (!box || box.isEmpty?.()) continue;
      samples.push({
        mesh,
        min: box.min.clone(),
        max: box.max.clone()
      });
    } catch { /* one incompatible mesh must not invalidate the whole rig proof */ }
  }
  return samples;
}

function compareMeshBounds(before) {
  let changedMeshes = 0;
  let maxDelta = 0;
  for (const sample of before || []) {
    try {
      sample.mesh.computeBoundingBox();
      const box = sample.mesh.boundingBox;
      if (!box) continue;
      const delta = Math.max(
        sample.min.distanceTo(box.min),
        sample.max.distanceTo(box.max)
      );
      maxDelta = Math.max(maxDelta, delta);
      if (delta > 0.0005) changedMeshes += 1;
    } catch { /* diagnostic only */ }
  }
  return { sampledMeshes: before?.length || 0, changedMeshes, maxDelta: Number(maxDelta.toFixed(6)) };
}

function provePoseMotion(state, root) {
  const before = snapshotPose(state.canonicalBoneMap);
  const meshBefore = snapshotMeshBounds(state.canonicalMeshes);
  state.motion.play('WALK_V2', 0);
  state.motion.update(0.22);
  state.canonicalSkeleton?.update?.();
  root.updateMatrixWorld?.(true);
  const changed = comparePose(before, state.canonicalBoneMap);
  const meshDelta = compareMeshBounds(meshBefore);
  state.motion.play('IDLE_V2', 0);
  state.motion.update(0.001);
  state.canonicalSkeleton?.update?.();
  root.updateMatrixWorld?.(true);
  return {
    sampledBones: before.size,
    changedBones: changed.length,
    changed: changed.map(({ name, angle }) => ({ name, radians: Number(angle.toFixed(5)) })),
    meshDelta,
    pass: before.size >= 4 && changed.length >= 2 && (meshDelta.sampledMeshes === 0 || meshDelta.changedMeshes >= 1)
  };
}

function motionHTML(controller) {
  const m = controller.__avatarMotionV2;
  const ready = Boolean(m?.motion && controller.previewRoot);
  const state = m?.motion?.state || 'NOT READY';
  const compat = m?.compatibility || (controller.profile?.rigStatus?.pass ? 'READY TO ACTIVATE' : 'RIG REQUIRED');
  const buttons = MOTION_ACTIONS.map(([action, label]) =>
    `<button class="st-b ${state === action ? 'is-active' : ''}" data-avatar-motion="${action}" ${ready ? '' : 'disabled'}>${label}</button>`
  ).join('');
  const sk = m?.skeleton || {};
  const proof = m?.poseProof || {};
  const meshProof = proof.meshDelta || {};
  return `<section class="st-group st-avatar-motion-panel">
    <h3>Motion · Foundation V2</h3>
    <p class="st-note">Prueba el movimiento sobre este mismo avatar y este mismo preview. WALK no desplaza el avatar por la sala: aquí validamos biomecánica, no navegación.</p>
    <div class="st-avatar-motion-summary">
      <div><span>Foundation</span><strong>V2</strong></div>
      <div><span>Estado</span><strong>${esc(state)}</strong></div>
      <div><span>Compatibilidad</span><strong>${esc(compat)}</strong></div>
    </div>
    <div class="st-avatar-motion-diagnostics">
      <span>Skinned mesh <b>${Number(sk.skinnedMeshes || 0)}</b></span>
      <span>Skeletons unificados <b>${Number(sk.unifiedMeshes || 0)}</b></span>
      <span>Canonical bones <b>${Number(sk.canonicalBoneCount || 0)}</b></span>
      <span>Binding <b>${m?.bindingMode || '—'}</b></span>
      <span>Pose delta <b>${proof.pass ? `PASS · ${proof.changedBones}/${proof.sampledBones}` : proof.sampledBones ? `REVIEW · ${proof.changedBones}/${proof.sampledBones}` : '—'}</b></span>
      <span>Mesh delta <b>${meshProof.sampledMeshes ? `${meshProof.changedMeshes}/${meshProof.sampledMeshes}` : '—'}</b></span>
    </div>
    <div class="st-avatar-motion-actions">${buttons}</div>
    ${m?.error ? `<p class="st-msg is-bad">${esc(m.error)}</p>` : ''}
    <p class="st-note">Fuente: CharacterStudio MotionFoundationV2 · ${esc(MOTION_V2_PROVENANCE.sourceCommit.slice(0, 8))}… · binding por UUID al skeleton canónico visible · sin renderer, Scene, CameraAuthority ni frame loop adicionales.</p>
  </section>`;
}

function applyPreviewRootMotion(controller, state, frameDt) {
  const root = controller.previewRoot;
  const visualState = state.visualAction;
  if (!root || !visualState) return;
  visualState.elapsed += frameDt;
  const duration = Math.max(0.001, visualState.duration || 1);
  const t = Math.min(1, visualState.elapsed / duration);
  const pulse = Math.sin(Math.PI * t);
  if (visualState.action === 'JUMP') {
    root.position.y = visualState.baseY + 0.34 * pulse;
  } else if (visualState.action === 'TURN_LEFT_V2') {
    root.rotation.y = visualState.baseYaw + (Math.PI / 2) * pulse;
  } else if (visualState.action === 'TURN_RIGHT_V2') {
    root.rotation.y = visualState.baseYaw - (Math.PI / 2) * pulse;
  }
  root.updateMatrixWorld?.(true);
  if (t >= 1) {
    root.position.y = visualState.baseY;
    root.rotation.y = visualState.baseYaw;
    root.updateMatrixWorld?.(true);
    state.visualAction = null;
  }
}

function installFrameBridge(controller) {
  const runtime = window.__IW?.runtime;
  if (!runtime || runtime.__avatarStudioMotionV2FrameBridge) return;
  runtime.__avatarStudioMotionV2FrameBridge = true;
  const previous = runtime.onFrame;
  runtime.onFrame = (pose, dt) => {
    const current = window.__IW_AVATAR_STUDIO_PHASE5?.controller;
    const state = current?.__avatarMotionV2;
    if (state?.motion && current?.previewRoot) {
      const frameDt = Math.max(0, Math.min(Number(dt) || 0, 0.05));
      state.motion.update(frameDt);
      state.canonicalSkeleton?.update?.();
      applyPreviewRootMotion(current, state, frameDt);
      if (state.remaining > 0) {
        state.remaining -= frameDt;
        if (state.remaining <= 0 && state.motion.state !== 'IDLE_V2') {
          state.motion.play('IDLE_V2', 0.12);
          state.remaining = 0;
          state.visualAction = null;
          current.applyGrounding?.();
          current.studio?.render?.();
        }
      }
    }
    previous?.(pose, dt);
  };
}

function disposeMotion(controller) {
  const state = controller.__avatarMotionV2;
  state?.motion?.dispose?.();
  if (state) {
    state.motion = null;
    state.remaining = 0;
    state.visualAction = null;
    state.compatibility = 'PENDING';
    state.skeleton = null;
    state.canonicalSkeleton = null;
    state.canonicalBoneMap = null;
    state.canonicalMeshes = null;
    state.bindingMode = null;
    state.poseProof = null;
  }
}

function bindMotionToPreview(controller) {
  disposeMotion(controller);
  if (!controller.previewRoot) return false;
  const state = controller.__avatarMotionV2;
  try {
    const prepared = prepareCanonicalSkeleton(controller.previewRoot);
    if (!prepared.canonical || prepared.boneMap.size === 0) throw new Error('Avatar Motion V2 no encontró un skeleton canónico utilizable.');
    state.skeleton = prepared.diagnostics;
    state.canonicalSkeleton = prepared.canonical;
    state.canonicalBoneMap = prepared.boneMap;
    state.canonicalMeshes = prepared.meshes;
    state.motion = createCharacterMotionV2(controller.previewRoot, { boneMap: prepared.boneMap });
    state.bindingMode = state.motion.report?.().bindingMode || 'CANONICAL_UUID';
    state.error = null;
    state.remaining = 0;
    state.poseProof = provePoseMotion(state, controller.previewRoot);
    state.compatibility = state.poseProof.pass ? 'PASS' : 'REVIEW';
    if (!state.poseProof.pass) {
      const md = state.poseProof.meshDelta || {};
      state.error = `Motion V2 no deformó el skeleton visible de forma suficiente: bones ${state.poseProof.changedBones}/${state.poseProof.sampledBones}, meshes ${md.changedMeshes || 0}/${md.sampledMeshes || 0}.`;
    }
    if (controller.profile?.motionSet) controller.profile.motionSet.foundation = 'V2';
    installFrameBridge(controller);
    return state.poseProof.pass;
  } catch (error) {
    state.motion?.dispose?.();
    state.motion = null;
    state.compatibility = 'REVIEW';
    state.error = String(error?.message || error);
    return false;
  }
}

function beginVisualAction(controller, action, duration) {
  if (!controller.previewRoot || !['JUMP','TURN_LEFT_V2','TURN_RIGHT_V2'].includes(action)) return;
  controller.__avatarMotionV2.visualAction = {
    action,
    duration,
    elapsed: 0,
    baseY: controller.previewRoot.position.y,
    baseYaw: controller.previewRoot.rotation.y
  };
}

function installControllerMotion(controller) {
  if (!controller || controller.__avatarMotionV2Installed) return;
  controller.__avatarMotionV2Installed = true;
  controller.__avatarMotionV2 = {
    motion: null,
    remaining: 0,
    visualAction: null,
    compatibility: 'PENDING',
    skeleton: null,
    canonicalSkeleton: null,
    canonicalBoneMap: null,
    canonicalMeshes: null,
    bindingMode: null,
    poseProof: null,
    error: null
  };

  const editor = controller.editor.bind(controller);
  controller.editor = function editorWithMotion() {
    const html = editor();
    const panel = motionHTML(this);
    const marker = '<section class="st-avatar-future">';
    const at = html.indexOf(marker);
    return at >= 0 ? `${html.slice(0, at)}${panel}${html.slice(at)}` : `${html}${panel}`;
  };

  const filmstrip = controller.filmstrip.bind(controller);
  controller.filmstrip = function filmstripWithMotion() {
    let html = filmstrip();
    const state = this.__avatarMotionV2?.motion?.state || 'MOTION —';
    html = html.replace('<span>1 RENDERER</span>', `<span>${esc(state)}</span><span>1 RENDERER</span>`);
    return html;
  };

  const bind = controller.bind.bind(controller);
  controller.bind = function bindWithMotion(scope) {
    bind(scope);
    scope.querySelectorAll?.('[data-avatar-motion]').forEach((button) => {
      button.addEventListener('click', () => {
        const action = button.dataset.avatarMotion;
        const state = this.__avatarMotionV2;
        if (!state?.motion || !this.previewRoot) return;
        try {
          state.motion.play(action, action === 'IDLE_V2' ? 0.15 : 0.08);
          const duration = state.motion.duration(action);
          state.remaining = NON_LOOPING.has(action) ? duration : 0;
          beginVisualAction(this, action, duration);
          state.error = state.poseProof?.pass ? null : state.error;
          this.studio.render();
        } catch (error) {
          state.compatibility = 'REVIEW';
          state.error = String(error?.message || error);
          this.studio.render();
        }
      });
    });
  };

  const accept = controller.acceptGltf.bind(controller);
  controller.acceptGltf = function acceptGltfWithMotion(gltf, asset) {
    const result = accept(gltf, asset);
    bindMotionToPreview(this);
    this.changed?.();
    return result;
  };

  const clear = controller.clearPreview.bind(controller);
  controller.clearPreview = function clearPreviewWithMotion() {
    disposeMotion(this);
    return clear();
  };

  controller.motionReport = () => ({
    ready: Boolean(controller.__avatarMotionV2?.motion),
    state: controller.__avatarMotionV2?.motion?.state || null,
    compatibility: controller.__avatarMotionV2?.compatibility || 'PENDING',
    skeleton: controller.__avatarMotionV2?.skeleton || null,
    bindingMode: controller.__avatarMotionV2?.bindingMode || null,
    poseProof: controller.__avatarMotionV2?.poseProof || null,
    actions: controller.__avatarMotionV2?.motion?.report?.().actions || [],
    provenance: MOTION_V2_PROVENANCE,
    extraRenderer: false,
    extraScene: false,
    extraCameraAuthority: false,
    extraAnimationFrameLoop: false
  });

  if (controller.previewRoot) bindMotionToPreview(controller);
}

export function installMuseumAvatarMotionPhase5() {
  const controller = window.__IW_AVATAR_STUDIO_PHASE5?.controller;
  const studio = window.__IW_STUDIO;
  if (!controller || !studio) return { mounted: false, reason: 'avatar-studio-not-mounted' };
  installControllerMotion(controller);
  window.__IW_AVATAR_MOTION_PHASE5 = {
    ready: true,
    controller,
    report: () => controller.motionReport()
  };
  studio.render();
  console.info('[Museum Avatar Studio] Motion Foundation V2 controls ready', controller.motionReport());
  return { mounted: true, controller, report: controller.motionReport };
}
