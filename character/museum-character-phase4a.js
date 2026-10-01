import { THREE } from '../render/render-host.js';
import { GLTFLoader } from '../vendor/three/addons/loaders/GLTFLoader.js';
import { CAMERA_AUTHORITY } from '../engine/schema/types.js';
import { EVENTS } from '../engine/core/event-bus.js';
import { ThirdPersonExploreController } from '../engine/camera/controllers/third-person-explore-controller.js';
import { createCharacterMotionV2 } from './character-motion-v2.js';
import { applyPhase4AFinalPolish } from './museum-character-phase4a-final-polish.js';
import { PHASE3_APPROVED_AVATAR } from './museum-character-phase3.js';

const LOBBY_SPACE_ID = 'space.lobby';
const SPACE_ID = 'space.gallery-a';
const ENTRY_PORTAL_ID = 'portal.lobby-gallery-a';
const TARGET_HEIGHT = 1.66;
const EXPECTED_THREE_REVISION = '185';
const VISUAL_FORWARD_YAW_OFFSET = Math.PI;
const FORWARD_SPEED = 1.05;
const BACKWARD_SPEED = 0.78;
const RUN_MULTIPLIER = 1.35;
const TURN_SPEED = 2.15;
const JUMP_HEIGHT = 0.34;
const JUMP_DURATION = 1.0;

async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function normalizeAvatarToHeight(visual, targetHeight) {
  visual.traverse((node) => { if (node.isMesh) { node.castShadow = true; node.receiveShadow = true; } });
  visual.updateMatrixWorld(true);
  const sourceBox = new THREE.Box3().setFromObject(visual);
  const sourceSize = sourceBox.getSize(new THREE.Vector3());
  const scaleFactor = targetHeight / Math.max(sourceSize.y, 0.0001);
  visual.scale.multiplyScalar(scaleFactor);
  visual.updateMatrixWorld(true);
  const scaledBox = new THREE.Box3().setFromObject(visual);
  const centre = scaledBox.getCenter(new THREE.Vector3());
  visual.position.x -= centre.x;
  visual.position.z -= centre.z;
  visual.position.y -= scaledBox.min.y;
  visual.updateMatrixWorld(true);
  const finalBox = new THREE.Box3().setFromObject(visual);
  return { sourceHeight: sourceSize.y, scaleFactor, finalHeight: finalBox.getSize(new THREE.Vector3()).y, groundedVisualMinY: finalBox.min.y };
}

function inspectHumanoid(root) {
  const required = ['hips','spine','chest','neck','head','leftUpperArm','leftLowerArm','leftHand','rightUpperArm','rightLowerArm','rightHand','leftUpperLeg','leftLowerLeg','leftFoot','rightUpperLeg','rightLowerLeg','rightFoot'];
  const names = new Set();
  let skinnedMeshCount = 0;
  root.traverse((node) => {
    if (node.isBone) names.add(node.name);
    if (node.isSkinnedMesh) { skinnedMeshCount += 1; node.skeleton?.bones?.forEach((bone) => names.add(bone.name)); }
  });
  const missing = required.filter((name) => !names.has(name));
  return { pass: skinnedMeshCount > 0 && missing.length === 0, boneCount: names.size, skinnedMeshCount, missing };
}

async function loadCharacter() {
  if (String(THREE.REVISION) !== EXPECTED_THREE_REVISION) throw new Error(`Phase 4A requires Museum THREE r185, got r${THREE.REVISION}`);
  const response = await fetch(PHASE3_APPROVED_AVATAR.url, { method: 'GET', mode: 'cors', cache: 'no-store' });
  if (!response.ok) throw new Error(`Character fetch failed: HTTP ${response.status}`);
  const bytes = await response.arrayBuffer();
  const sha256 = await sha256Hex(bytes);
  if (bytes.byteLength !== PHASE3_APPROVED_AVATAR.expectedByteLength || sha256 !== PHASE3_APPROVED_AVATAR.expectedSha256) {
    throw new Error(`Character provenance mismatch: ${bytes.byteLength} / ${sha256}`);
  }
  const gltf = await new Promise((resolve, reject) => new GLTFLoader().parse(bytes, new URL('.', PHASE3_APPROVED_AVATAR.url).href, resolve, reject));
  const visual = gltf.scene;
  visual.rotation.y = VISUAL_FORWARD_YAW_OFFSET;
  visual.updateMatrixWorld(true);
  const normalization = normalizeAvatarToHeight(visual, TARGET_HEIGHT);
  normalization.visualForwardYawOffset = VISUAL_FORWARD_YAW_OFFSET;
  normalization.canonicalBodyForward = '+Z';
  const rig = inspectHumanoid(visual);
  if (!rig.pass) throw new Error(`Character rig failed: ${rig.missing.join(', ')}`);
  const root = new THREE.Group();
  root.name = 'CHARACTER_2027_PHASE4A_ROOT';
  root.add(visual);
  root.updateMatrixWorld(true);
  return { root, visual, normalization, rig, provenance: { byteLength: bytes.byteLength, sha256, exactApprovedAssetMatch: true } };
}

function resolveStart(runtime) {
  const candidates = ['anchor.gallery-a.guide-horizonte','anchor.gallery-a.guide-division','anchor.gallery-a.arrive-from-lobby'];
  for (const id of candidates) {
    if (!runtime.store.has(id)) continue;
    const anchor = runtime.store.require(id);
    if (anchor.spaceId === SPACE_ID && Array.isArray(anchor.position)) return anchor;
  }
  throw new Error('Phase 4A could not resolve Gallery A start anchor');
}

async function ensureGalleryA(runtime) {
  if (runtime.state.activeSpaceId === SPACE_ID) return;
  if (runtime.state.activeSpaceId !== LOBBY_SPACE_ID) throw new Error(`Phase 4A expected ${LOBBY_SPACE_ID} or ${SPACE_ID}, got ${runtime.state.activeSpaceId}`);
  if (!runtime.store.has(ENTRY_PORTAL_ID)) throw new Error(`Phase 4A missing canonical entry portal ${ENTRY_PORTAL_ID}`);
  await runtime.traversePortal(ENTRY_PORTAL_ID, { source: 'CHARACTER_PHASE4A_GATE' });
  if (runtime.state.activeSpaceId !== SPACE_ID) throw new Error(`Phase 4A canonical entry failed: expected ${SPACE_ID}, got ${runtime.state.activeSpaceId}`);
}

function installBadge(api) {
  document.getElementById('character-phase4a-gate')?.remove();
  document.getElementById('character-phase3-gate')?.remove();
  const el = document.createElement('div');
  el.id = 'character-phase4a-gate';
  el.style.cssText = 'position:fixed;left:14px;top:14px;z-index:20000;padding:10px 12px;background:rgba(9,12,14,.84);border:1px solid rgba(255,255,255,.24);color:#f1eee8;font:600 11px/1.45 system-ui,sans-serif;pointer-events:none;max-width:500px';
  const refresh = () => {
    const r = api.report();
    const follow = r.cameraFollow || {};
    el.innerHTML = `<div style="letter-spacing:.12em">PHASE 4A · FOCUS/CAMERA RECOVERY GATE</div><div style="font-weight:500;opacity:.88">W/S caminar · A/D girar · E obra · Space saltar</div><div style="font-weight:500;opacity:.68">${r.motion.state} · camera ${r.camera.owner} · violations ${r.camera.violations}</div><div style="font-weight:500;opacity:.58">${follow.shotMode || 'NORMAL'} · dist ${Number(follow.distance || 0).toFixed(2)} · FOV ${Number(follow.fov || 0).toFixed(1)} · reacq ${follow.focusReacquisitions || 0}</div><div style="font-weight:500;opacity:.52">hard ${follow.hardEnvelopeRecoveries || 0} · optical ${follow.opticalRecoveries || 0} · hotspot ${r.proximity?.nearest || '—'}</div>`;
  };
  refresh();
  document.body.appendChild(el);
  const timer = setInterval(refresh, 180);
  return { remove() { clearInterval(timer); el.remove(); } };
}

export async function mountMuseumCharacterPhase4A({ runtime, sceneKit = runtime?.sceneKit, input = window.__IW?.input } = {}) {
  if (!runtime || !sceneKit?.scene || !input) throw new Error('Phase 4A requires existing Museum runtime, SceneKit and InputSystem');
  if (typeof runtime.explore?.resolveNavigationPosition !== 'function') throw new Error('Phase 4A requires Museum canonical navigation resolver');
  if (window.__IW_CHARACTER_PHASE4A?.ready) return window.__IW_CHARACTER_PHASE4A;

  await ensureGalleryA(runtime);
  const circulation = applyPhase4AFinalPolish(sceneKit);
  const loaded = await loadCharacter();
  const root = loaded.root;
  const anchor = resolveStart(runtime);
  root.position.set(anchor.position[0], anchor.position[1], anchor.position[2]);
  root.rotation.y = Array.isArray(anchor.normal) ? Math.atan2(anchor.normal[0], anchor.normal[2]) : 0;
  sceneKit.scene.add(root);

  let activeCharacterSpaceId = SPACE_ID;
  let volume = sceneKit.navigationVolume(activeCharacterSpaceId);
  if (!volume?.bounds) throw new Error('Gallery A has no navigationVolume bounds');
  let groundY = volume.bounds.min[1];
  root.position.y = groundY;
  root.updateMatrixWorld(true);

  const motion = createCharacterMotionV2(root);
  const cameraController = new ThirdPersonExploreController();
  cameraController.setNavigationVolume(volume);
  cameraController.setTargetProvider(() => ({ position: root.position.toArray(), yaw: root.rotation.y }));
  runtime.camera.register(CAMERA_AUTHORITY.THIRD_PERSON_EXPLORE, cameraController);

  const movement = { forward: 0, turn: 0, run: false };
  const collision = { corrections: 0, wallOrBlockerFrames: 0, lastDesired: null, lastResolved: null };
  let jumping = false;
  let jumpElapsed = 0;
  let stopElapsed = 0;
  let disposed = false;
  let previousMoving = false;
  let previousTurn = 0;

  function setInput(next = {}) {
    movement.forward = Math.max(-1, Math.min(1, Number(next.forward) || 0));
    movement.turn = Math.max(-1, Math.min(1, Number(next.turn) || 0));
    movement.run = Boolean(next.run);
  }

  function jump() {
    if (jumping) return false;
    jumping = true;
    jumpElapsed = 0;
    motion.play('JUMP', 0.08);
    return true;
  }

  function rebindSpace(spaceId, spawn = null) {
    const nextVolume = sceneKit.navigationVolume(spaceId);
    if (!nextVolume?.bounds) throw new Error(`Character navigationVolume missing for ${spaceId}`);
    activeCharacterSpaceId = spaceId;
    volume = nextVolume;
    groundY = nextVolume.bounds.min[1];
    runtime.explore.setNavigationVolume(nextVolume);
    cameraController.setNavigationVolume(nextVolume);
    if (spawn?.position) {
      root.position.set(spawn.position[0], groundY, spawn.position[2]);
      if (Array.isArray(spawn.normal)) root.rotation.y = Math.atan2(spawn.normal[0], spawn.normal[2]);
    } else {
      root.position.y = groundY;
    }
    jumping = false;
    jumpElapsed = 0;
    stopElapsed = 0;
    previousMoving = false;
    previousTurn = 0;
    setInput({});
    root.updateMatrixWorld(true);
    runtime.proximity.rebuild(spaceId);
    runtime.proximity.update(1, [root.position.x, groundY + runtime.explore.eyeHeight, root.position.z]);
    return { spaceId, groundY, volume: nextVolume };
  }

  function updateLocomotion(dt) {
    if (disposed || runtime.state.activeSpaceId !== activeCharacterSpaceId) return;
    const frameDt = Math.max(0, Math.min(Number(dt) || 0, 0.05));
    const turn = movement.turn;
    const forward = movement.forward;
    if (turn) root.rotation.y -= turn * TURN_SPEED * frameDt;
    if (forward !== 0) {
      const speed = (forward > 0 ? FORWARD_SPEED : BACKWARD_SPEED) * (movement.run ? RUN_MULTIPLIER : 1);
      const direction = forward > 0 ? 1 : -1;
      const desiredX = root.position.x + Math.sin(root.rotation.y) * speed * frameDt * direction;
      const desiredZ = root.position.z + Math.cos(root.rotation.y) * speed * frameDt * direction;
      const desiredEye = [desiredX, groundY + runtime.explore.eyeHeight, desiredZ];
      const resolvedEye = runtime.explore.resolveNavigationPosition(desiredEye);
      const corrected = Math.hypot(resolvedEye[0] - desiredX, resolvedEye[2] - desiredZ) > 0.0005;
      if (corrected) { collision.corrections += 1; collision.wallOrBlockerFrames += 1; }
      collision.lastDesired = [desiredX, groundY, desiredZ];
      collision.lastResolved = [resolvedEye[0], groundY, resolvedEye[2]];
      root.position.x = resolvedEye[0];
      root.position.z = resolvedEye[2];
      if (!jumping && motion.state !== 'WALK_V2') motion.play('WALK_V2', 0.12);
      stopElapsed = 0;
    } else if (!jumping && turn !== 0) {
      const state = turn > 0 ? 'TURN_RIGHT_V2' : 'TURN_LEFT_V2';
      if (motion.state !== state || previousTurn !== turn) motion.play(state, 0.08);
      stopElapsed = 0;
    } else if (!jumping) {
      if (previousMoving || previousTurn !== 0) { motion.play('STOP_V2', 0.1); stopElapsed = 0.7; }
      else if (stopElapsed > 0) { stopElapsed -= frameDt; if (stopElapsed <= 0) motion.play('IDLE_V2', 0.15); }
      else if (motion.state !== 'IDLE_V2') motion.play('IDLE_V2', 0.15);
    }
    if (jumping) {
      jumpElapsed += frameDt;
      const t = Math.min(1, jumpElapsed / JUMP_DURATION);
      root.position.y = groundY + JUMP_HEIGHT * 4 * t * (1 - t);
      if (t >= 1) { jumping = false; root.position.y = groundY; motion.play(forward !== 0 ? 'WALK_V2' : 'IDLE_V2', 0.12); }
    } else root.position.y = groundY;

    motion.update(frameDt);
    root.updateMatrixWorld(true);
    runtime.proximity.update(frameDt, [root.position.x, groundY + runtime.explore.eyeHeight, root.position.z]);
    previousMoving = forward !== 0;
    previousTurn = turn;
  }

  const previousOnFrame = runtime.onFrame;
  runtime.onFrame = (pose, dt) => { updateLocomotion(dt); previousOnFrame?.(pose, dt); };

  const sink = { setInput, jump, inputFrame() {} };
  input.setMovementSink(sink);

  const offCameraInputBridge = runtime.bus.on(EVENTS.CAMERA_AUTHORITY_CHANGED, ({ to }) => {
    if (to === CAMERA_AUTHORITY.THIRD_PERSON_EXPLORE) input.setEnabled(true);
  });

  const previousReleaseFocus = runtime.releaseFocus;
  runtime.releaseFocus = function releaseCharacterFocus() {
    if (runtime.state.mode === 'GUIDED') return previousReleaseFocus.call(runtime);
    if (!runtime.state.focusedEntityId) return false;

    const entityId = runtime.state.focusedEntityId;
    sceneKit.setEntityFocused(entityId, false);
    runtime.state.setFocus(null);
    runtime._exploreReturnPose = null;
    setInput({});

    runtime.camera.request(CAMERA_AUTHORITY.THIRD_PERSON_EXPLORE, {
      reason: 'focus:release:character-third-person',
      durationMs: 0,
      restore: 'ADOPT_INCOMING'
    });
    input.setEnabled(true);
    return true;
  };

  runtime.camera.request(CAMERA_AUTHORITY.THIRD_PERSON_EXPLORE, { reason: 'Character 2027 Phase 4A free mobility', durationMs: 0, restore: 'ADOPT_INCOMING' });
  input.setEnabled(true);

  const api = {
    ready: true,
    root,
    visual: loaded.visual,
    normalization: loaded.normalization,
    motion,
    collision,
    circulation,
    cameraController,
    setInput,
    jump,
    rebindSpace,
    report() {
      return {
        phase: 'PHASE4A_THIRD_PERSON_FOCUS_CAMERA_RECOVERY', ready: true,
        spaceId: runtime.state.activeSpaceId, characterSpaceId: activeCharacterSpaceId,
        position: root.position.toArray(), yaw: root.rotation.y,
        canonicalForward: '+Z', visualForwardYawOffset: VISUAL_FORWARD_YAW_OFFSET,
        grounded: Math.abs(root.position.y - groundY) < 0.002 || jumping, jumping,
        input: { ...movement }, motion: motion.report(), collision: { ...collision }, circulation,
        proximity: runtime.proximity.report(),
        entry: { mode: 'canonical-portal', portalId: ENTRY_PORTAL_ID, activeSpaceId: runtime.state.activeSpaceId },
        navigationAuthority: 'Museum ExploreController.resolveNavigationPosition + Museum navigationVolume',
        camera: runtime.camera.report(), cameraFollow: cameraController.report(),
        focusReturnPolicy: 'Character Focus returns to THIRD_PERSON_EXPLORE; guided mode delegates to Runtime legacy policy',
        authorities: { rendererDuplicated: false, worldStoreDuplicated: false, cameraAuthorityDuplicated: false, exploreControllerDuplicated: false, inputListenersDuplicated: false },
        frameSeam: 'one Character locomotion loop; active room context is rebound without recreating motion/camera',
        humanVisualApproval: 'PENDING_FINAL_4A'
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      setInput({});
      runtime.onFrame = previousOnFrame;
      runtime.releaseFocus = previousReleaseFocus;
      offCameraInputBridge();
      input.setMovementSink(null);
      motion.dispose();
      sceneKit.scene.remove(root);
      runtime.camera.request(CAMERA_AUTHORITY.EXPLORE, { reason: 'Phase 4A dispose', durationMs: 0, restore: 'ADOPT_INCOMING' });
      badge.remove();
      delete window.__IW_CHARACTER_PHASE4A;
      document.documentElement.dataset.characterPhase4a = 'disposed';
    }
  };

  const badge = installBadge(api);
  window.__IW_CHARACTER_PHASE4A = api;
  document.documentElement.dataset.characterPhase4a = 'ready';
  console.info('[Character Phase 4A] FOCUS/CAMERA RECOVERY READY FOR HUMAN VALIDATION', api.report());
  return api;
}
