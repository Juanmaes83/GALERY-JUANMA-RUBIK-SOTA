import { THREE } from '../render/render-host.js';
import { CAMERA_AUTHORITY } from '../engine/schema/types.js';
import { EVENTS } from '../engine/core/event-bus.js';
import { validateTourManifest } from '../engine/experience/tour-manifest.js';
import { MuseumHumanSpatialContract, MUSEUM_HUMAN_PROFILE } from './museum-human-spatial-contract.js';

const PROVENANCE = Object.freeze({
  source: 'VECINIA-WORLDS PropertyRoomCharacterTourBridge.js',
  sourceCommit: '45e454febe2deb3b88bf5e5b527c4a5f86fe8eb1',
  principle: 'Existing ExperienceDirector/route/stageGuide remain authority; Character mirrors authored guide staging.'
});

const NESTED_PROTECTED_SPACES = new Set(['space.breeze']);
const STOP_DISTANCE = 0.12;
const STUCK_SECONDS = 0.95;
const MAX_REROUTES = 2;
const PROGRESS_EPSILON = 0.008;
const INTERMEDIATE_TOLERANCE = 0.22;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const wrapAngle = (v) => Math.atan2(Math.sin(v), Math.cos(v));

function phase4Foundation() {
  const phase4b = window.__IW_CHARACTER_PHASE4B;
  if (phase4b?.ready && phase4b.phase4a?.ready) return phase4b.phase4a;
  const phase4a = window.__IW_CHARACTER_PHASE4A;
  return phase4a?.ready ? phase4a : null;
}

function canonicalBoneMap(root) {
  let skeleton = null;
  root?.traverse?.((node) => {
    if (!skeleton && node.isSkinnedMesh && node.skeleton?.bones?.length) skeleton = node.skeleton;
  });
  const map = new Map();
  skeleton?.bones?.forEach((bone) => {
    if (bone?.isBone && bone.name && !map.has(bone.name)) map.set(bone.name, bone);
  });
  return { skeleton, map };
}

class TargetLookOverlay {
  constructor(root) {
    this.root = root;
    const canonical = canonicalBoneMap(root);
    this.skeleton = canonical.skeleton;
    this.head = canonical.map.get('head') || null;
    this.neck = canonical.map.get('neck') || null;
    this.target = null;
    this.weight = 0;
    this.targetWeight = 0;
    this.speed = 8;
    this._headWorld = new THREE.Vector3();
    this._targetLocal = new THREE.Vector3();
    this._headLocal = new THREE.Vector3();
  }

  set(target, { weight = 1, speed = 8 } = {}) {
    this.target = target?.clone ? target.clone() : new THREE.Vector3(...target);
    this.targetWeight = clamp(weight, 0, 1);
    this.speed = speed;
  }

  clear() {
    this.targetWeight = 0;
    this.target = null;
  }

  apply(dt) {
    if (!this.head || !this.target) return;
    this.weight = THREE.MathUtils.damp(this.weight, this.targetWeight, this.speed, dt);
    if (this.weight < 0.001) return;

    this.head.getWorldPosition(this._headWorld);
    this._targetLocal.copy(this.target);
    this.root.worldToLocal(this._targetLocal);
    this._headLocal.copy(this._headWorld);
    this.root.worldToLocal(this._headLocal);
    const dir = this._targetLocal.sub(this._headLocal);
    const horizontal = Math.max(Math.hypot(dir.x, dir.z), 0.0001);
    const yaw = clamp(Math.atan2(dir.x, dir.z), -0.72, 0.72);
    const pitch = clamp(-Math.atan2(dir.y, horizontal), -0.38, 0.38);

    const strength = this.weight;
    const headDelta = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch * 0.72 * strength, yaw * 0.72 * strength, 0, 'YXZ'));
    const neckDelta = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch * 0.28 * strength, yaw * 0.28 * strength, 0, 'YXZ'));
    this.head.quaternion.multiply(headDelta);
    if (this.neck) this.neck.quaternion.multiply(neckDelta);
    this.skeleton?.update?.();
  }
}

function face(root, point) {
  if (!point) return;
  const dx = point[0] - root.position.x;
  const dz = point[2] - root.position.z;
  if (Math.hypot(dx, dz) > 0.001) root.rotation.y = Math.atan2(dx, dz);
  root.updateMatrixWorld(true);
}

function installControls(api) {
  document.getElementById('museum-character-tour-gate')?.remove();
  const box = document.createElement('div');
  box.id = 'museum-character-tour-gate';
  box.style.cssText = 'position:fixed;left:14px;bottom:14px;z-index:21000;display:flex;gap:7px;align-items:center;padding:9px 10px;background:rgba(18,16,14,.88);border:1px solid rgba(255,255,255,.22);backdrop-filter:blur(9px);font:600 10px/1.25 system-ui,sans-serif;color:#f3eee6;max-width:min(720px,calc(100vw - 28px))';

  const start = document.createElement('button');
  start.textContent = 'INICIAR TOUR · CHARACTER 2027';
  start.style.cssText = 'border:1px solid rgba(255,255,255,.28);background:#eee6da;color:#211c17;padding:9px 11px;font-weight:750;cursor:pointer';
  const exit = document.createElement('button');
  exit.textContent = 'SALIR';
  exit.style.cssText = 'border:1px solid rgba(255,255,255,.2);background:#302a24;color:#f3eee6;padding:9px 10px;cursor:pointer';
  const status = document.createElement('span');
  status.style.cssText = 'min-width:250px;max-width:430px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';

  start.onclick = () => api.startCanonicalTour();
  exit.onclick = () => api.exitTour();
  box.append(start, exit, status);
  document.body.appendChild(box);

  const timer = setInterval(() => {
    const r = api.report();
    const e = r.experience;
    status.textContent = `${r.preflight.pass ? 'READY' : 'REVIEW'} · ${r.spaceId} · ${e.tourOrder}/${e.tourTotal} · ${e.stepId || 'sin tour'} · ${r.characterSettled ? 'settled' : 'moving'}${r.lastError ? ' · ERROR' : ''}`;
  }, 160);

  return { dispose() { clearInterval(timer); box.remove(); } };
}

export async function installMuseumCharacterTourBridge(runtime = window.__IW?.runtime) {
  if (!runtime?.sceneKit?.scene || !runtime?.store || !runtime?.experience) throw new Error('Tour Bridge requires canonical Museum runtime');
  if (window.__IW_CHARACTER_TOUR?.ready) return window.__IW_CHARACTER_TOUR;

  const phase4a = phase4Foundation();
  if (!phase4a?.root || !phase4a?.motion || typeof phase4a.setInput !== 'function' || typeof phase4a.rebindSpace !== 'function') {
    throw new Error('Tour Bridge requires validated free Character foundation');
  }

  const manifest = runtime.tour;
  const manifestValidation = validateTourManifest(manifest);
  if (!manifestValidation.ok) throw new Error(`Canonical tour manifest invalid: ${JSON.stringify(manifestValidation.checks.filter((x) => !x.pass))}`);

  const root = phase4a.root;
  const motion = phase4a.motion;
  const targetLook = new TargetLookOverlay(root);
  const originalMotionUpdate = motion.update.bind(motion);
  motion.update = (dt) => {
    const frameDt = Math.max(0, Math.min(Number(dt) || 0, 0.05));
    originalMotionUpdate(frameDt);
    targetLook.apply(frameDt);
  };

  const gateA = window.__IW_CHARACTER_GATE_A;
  let originalGateAPerform = null;
  if (gateA?.ready && typeof gateA.perform === 'function') {
    originalGateAPerform = gateA.perform.bind(gateA);
    gateA.perform = (action) => {
      const result = originalGateAPerform(action);
      if (action === 'LOOK_AT' && result) {
        const report = gateA.report();
        const resolved = gateA.semanticView?.resolve?.(report.selectedDestinationId);
        const lookAt = resolved?.destination?.lookAt;
        if (lookAt) {
          face(root, lookAt);
          targetLook.set(lookAt, { weight: 1 });
        }
      }
      return result;
    };
  }

  const originalStageGuide = runtime.stageGuide.bind(runtime);
  const originalGuideSettled = runtime.experience.ports.guideSettled;
  const originalExitRoute = runtime.exitRoute.bind(runtime);
  const renderChainBeforeBridge = runtime.onFrame;
  const movementLog = [];
  const stagingAudit = [];
  let controls = null;
  let activeMove = null;
  let characterSettled = true;
  let moveToken = 0;
  let lastTarget = null;
  let lastError = null;
  let lastSpaceId = runtime.state.activeSpaceId;
  let legacyGuideWasVisible = null;
  let freePose = null;
  let reroutes = 0;
  let blocked = 0;
  let nestedParks = 0;
  let disposed = false;

  function suppressLegacyGuideVisual() {
    const object = runtime.sceneKit?._guide?.object;
    if (!object) return;
    if (legacyGuideWasVisible === null) legacyGuideWasVisible = object.visible;
    object.visible = false;
  }

  function restoreLegacyGuideVisual() {
    const object = runtime.sceneKit?._guide?.object;
    if (object && legacyGuideWasVisible !== null) object.visible = legacyGuideWasVisible;
    legacyGuideWasVisible = null;
  }

  function captureFreePose() {
    freePose = {
      spaceId: runtime.state.activeSpaceId,
      position: root.position.toArray(),
      yaw: root.rotation.y
    };
  }

  function restoreFreeCharacter() {
    phase4a.setInput({});
    targetLook.clear();
    activeMove = null;
    characterSettled = true;
    root.visible = true;
    const activeSpace = runtime.state.activeSpaceId;
    if (freePose?.spaceId === activeSpace) {
      phase4a.rebindSpace(activeSpace);
      root.position.set(freePose.position[0], root.position.y, freePose.position[2]);
      root.rotation.y = freePose.yaw;
      root.updateMatrixWorld(true);
    } else {
      const space = runtime.store.require(activeSpace);
      const spawn = runtime.sceneKit.poseForAnchor(space.defaultSpawnAnchorId);
      phase4a.rebindSpace(activeSpace, spawn || null);
    }
    if (!NESTED_PROTECTED_SPACES.has(activeSpace)) {
      runtime.camera.request(CAMERA_AUTHORITY.THIRD_PERSON_EXPLORE, {
        reason: 'Character Tour Bridge exit → free Character', durationMs: 0, restore: 'ADOPT_INCOMING'
      });
      window.__IW?.input?.setEnabled?.(true);
    }
  }

  function contractFor(spaceId) {
    return new MuseumHumanSpatialContract({ sceneKit: runtime.sceneKit, store: runtime.store, spaceId, characterRadius: 0.34 });
  }

  function resolveStaging(staging) {
    if (!staging?.anchorId) return null;
    const anchorRecord = runtime.store.get(staging.anchorId);
    if (!anchorRecord) throw new Error(`Tour staging anchor missing from WorldStore: ${staging.anchorId}`);
    const spaceId = anchorRecord.spaceId || runtime.state.activeSpaceId;
    const contract = contractFor(spaceId);
    const target = contract.resolve({
      anchorId: staging.anchorId,
      subjectRef: staging.subjectRef || null,
      aside: Boolean(staging.aside)
    });
    return { contract, target, spaceId };
  }

  function cancelMove(reason = 'cancel') {
    phase4a.setInput({});
    if (activeMove?.reject) activeMove.reject(new Error(reason));
    activeMove = null;
  }

  function makeRoute(resolved, token, rerouteCount = 0) {
    const plan = resolved.contract.routePlan(root.position.toArray(), resolved.target, { subjectRef: resolved.target.subjectRef });
    if (!plan.points?.length) return { ok: false, reason: plan.source, plan };
    return {
      ok: true,
      token,
      resolved,
      plan,
      points: plan.points.map((p) => new THREE.Vector3(p[0], root.position.y, p[2])),
      index: 0,
      rerouteCount,
      stuckSeconds: 0,
      lastDistance: null
    };
  }

  function startMove(resolved, token, rerouteCount = 0) {
    const route = makeRoute(resolved, token, rerouteCount);
    if (!route.ok) return Promise.reject(new Error(`No safe Character route to ${resolved.target.anchorId}: ${route.reason}`));
    return new Promise((resolve, reject) => {
      activeMove = { ...route, resolve, reject };
    });
  }

  function advanceMove(dt) {
    if (!activeMove || activeMove.token !== moveToken) return;
    const point = activeMove.points[activeMove.index];
    if (!point) {
      const done = activeMove;
      activeMove = null;
      phase4a.setInput({});
      done.resolve(true);
      return;
    }

    const delta = point.clone().sub(root.position).setY(0);
    const distance = delta.length();
    const finalPoint = activeMove.index === activeMove.points.length - 1;
    const tolerance = finalPoint ? STOP_DISTANCE : INTERMEDIATE_TOLERANCE;
    if (distance <= tolerance) {
      phase4a.setInput({});
      if (!finalPoint) {
        activeMove.index += 1;
        activeMove.stuckSeconds = 0;
        activeMove.lastDistance = null;
        return;
      }
      const done = activeMove;
      activeMove = null;
      done.resolve(true);
      return;
    }

    const desiredYaw = Math.atan2(delta.x, delta.z);
    const error = wrapAngle(desiredYaw - root.rotation.y);
    const turn = -clamp(error * 1.8, -1, 1);
    const forward = Math.abs(error) < 0.32 ? 1 : 0;
    phase4a.setInput({ forward, turn, run: false });

    const progressed = activeMove.lastDistance == null || distance < activeMove.lastDistance - PROGRESS_EPSILON;
    if (progressed) activeMove.stuckSeconds = 0;
    else if (forward > 0) activeMove.stuckSeconds += dt;
    activeMove.lastDistance = distance;

    if (activeMove.stuckSeconds >= STUCK_SECONDS) {
      const previous = activeMove;
      const nextReroute = previous.rerouteCount + 1;
      phase4a.setInput({});
      if (nextReroute > MAX_REROUTES) {
        activeMove = null;
        blocked += 1;
        previous.reject(new Error(`Character tour route stuck at ${previous.resolved.target.anchorId}`));
        return;
      }
      const replanned = makeRoute(previous.resolved, previous.token, nextReroute);
      if (!replanned.ok) {
        activeMove = null;
        blocked += 1;
        previous.reject(new Error(`Character tour reroute failed: ${replanned.reason}`));
        return;
      }
      reroutes += 1;
      activeMove = { ...replanned, resolve: previous.resolve, reject: previous.reject };
    }
  }

  async function moveCharacterToStaging(staging, token) {
    try {
      const resolved = resolveStaging(staging);
      if (!resolved) {
        characterSettled = true;
        targetLook.clear();
        return;
      }
      const { contract, target, spaceId } = resolved;
      lastTarget = target;

      if (NESTED_PROTECTED_SPACES.has(spaceId)) {
        cancelMove('nested protected park');
        root.visible = false;
        characterSettled = true;
        nestedParks += 1;
        lastSpaceId = spaceId;
        movementLog.push({ anchorId: target.anchorId, spaceId, mode: 'PARKED_PROTECTED_NESTED', pass: true });
        return;
      }

      if (runtime.state.activeSpaceId !== spaceId) {
        throw new Error(`Tour staging ${target.anchorId} expected ${spaceId}, active ${runtime.state.activeSpaceId}`);
      }

      root.visible = true;
      const firstAppearance = lastSpaceId !== spaceId;
      if (firstAppearance) {
        const validation = contract.validatePoint(target.position);
        if (!validation.safe) throw new Error(`Unsafe first staging ${target.anchorId}`);
        phase4a.rebindSpace(spaceId);
        root.position.set(target.position[0], root.position.y, target.position[2]);
        root.rotation.y = target.yaw;
        root.updateMatrixWorld(true);
        face(root, target.lookAt);
        targetLook.set(target.lookAt, { weight: 1 });
        lastSpaceId = spaceId;
        characterSettled = true;
        movementLog.push({ anchorId: target.anchorId, spaceId, mode: 'SPAWN', targetDistance: 0, pass: true });
        return;
      }

      const start = root.position.clone();
      const targetPosition = new THREE.Vector3(...target.position);
      const currentDistance = start.distanceTo(targetPosition);
      if (currentDistance > MUSEUM_HUMAN_PROFILE.settleTolerance) {
        characterSettled = false;
        targetLook.clear();
        await startMove(resolved, token, 0);
        if (token !== moveToken || disposed) return;
      }

      phase4a.setInput({});
      face(root, target.lookAt);
      targetLook.set(target.lookAt, { weight: 1 });
      root.updateMatrixWorld(true);
      const targetDistance = root.position.distanceTo(targetPosition);
      const pass = targetDistance <= Math.max(MUSEUM_HUMAN_PROFILE.settleTolerance, STOP_DISTANCE + 0.03);
      movementLog.push({
        anchorId: target.anchorId,
        spaceId,
        mode: currentDistance <= MUSEUM_HUMAN_PROFILE.settleTolerance ? 'ALREADY_SETTLED' : (activeMove?.plan?.source || 'MUSEUM_ROUTE_PLAN'),
        distance: Number(start.distanceTo(root.position).toFixed(3)),
        targetDistance: Number(targetDistance.toFixed(3)),
        pass
      });
      if (!pass) throw new Error(`Character tour settle miss ${target.anchorId}: ${targetDistance.toFixed(3)}m`);
      lastSpaceId = spaceId;
      characterSettled = true;
    } catch (error) {
      lastError = String(error?.message || error);
      phase4a.setInput({});
      characterSettled = true;
      console.error('[Museum Character Tour Bridge]', error);
    }
  }

  runtime.stageGuide = (staging) => {
    const result = originalStageGuide(staging);
    suppressLegacyGuideVisual();
    moveToken += 1;
    const token = moveToken;
    lastError = null;
    cancelMove('new tour staging');
    if (!staging) {
      characterSettled = true;
      targetLook.clear();
      lastTarget = null;
      return result;
    }
    characterSettled = false;
    void moveCharacterToStaging(staging, token);
    return result;
  };

  runtime.experience.ports.guideSettled = () => {
    suppressLegacyGuideVisual();
    const legacySettled = originalGuideSettled ? originalGuideSettled() : true;
    return legacySettled && characterSettled;
  };

  runtime.onFrame = (pose, dt) => {
    const frameDt = Math.max(0, Math.min(Number(dt) || 0, 0.05));
    suppressLegacyGuideVisual();
    advanceMove(frameDt);
    renderChainBeforeBridge?.(pose, dt);
  };

  runtime.exitRoute = function exitCharacterTour() {
    moveToken += 1;
    cancelMove('visitor exit');
    const result = originalExitRoute();
    restoreFreeCharacter();
    restoreLegacyGuideVisual();
    return result;
  };

  for (const beat of manifest.beats) {
    if (!beat.guide?.anchorId) continue;
    const staging = { ...beat.guide, subjectRef: beat.guide.subjectRef || beat.subjectRef || null };
    const anchorRecord = runtime.store.get(staging.anchorId);
    const subjectRecord = staging.subjectRef && runtime.store.kindOf(staging.subjectRef) !== 'SPACE' ? runtime.store.get(staging.subjectRef) : null;
    const spaceId = anchorRecord?.spaceId || (runtime.store.kindOf(staging.subjectRef) === 'SPACE' ? staging.subjectRef : subjectRecord?.spaceId) || null;
    const geometryReadyAtBoot = Boolean(runtime.sceneKit.poseForAnchor(staging.anchorId));
    let clearanceSafe = null;
    let geometryError = null;
    if (anchorRecord && geometryReadyAtBoot && spaceId && !NESTED_PROTECTED_SPACES.has(spaceId)) {
      try {
        const resolved = resolveStaging(staging);
        clearanceSafe = resolved.contract.validatePoint(resolved.target.position).safe;
      } catch (error) {
        geometryError = String(error?.message || error);
      }
    }
    stagingAudit.push({
      beatId: beat.id,
      anchorId: staging.anchorId,
      subjectRef: staging.subjectRef,
      spaceId,
      canonicalAnchorExists: Boolean(anchorRecord),
      canonicalSubjectExists: !staging.subjectRef || runtime.store.kindOf(staging.subjectRef) === 'SPACE' || Boolean(subjectRecord),
      geometryReadyAtBoot,
      clearanceSafe,
      protectedNestedPark: NESTED_PROTECTED_SPACES.has(spaceId),
      geometryError
    });
  }

  const preflightFailures = [];
  if (!manifestValidation.ok) preflightFailures.push('canonical tour manifest invalid');
  if (!runtime.defaultRouteId || manifest.routeId !== runtime.defaultRouteId) preflightFailures.push('canonical route mismatch');
  if (!runtime.graph?.path) preflightFailures.push('WorldGraph path unavailable');
  if (!root?.isObject3D) preflightFailures.push('Character root unavailable');
  if (targetLook.head == null) preflightFailures.push('canonical visible head bone unavailable');
  const missingStagings = stagingAudit.filter((x) => !x.canonicalAnchorExists || !x.canonicalSubjectExists);
  if (missingStagings.length) preflightFailures.push(`broken tour stagings: ${missingStagings.map((x) => x.beatId).join(',')}`);

  const firstTourSpace = manifest.steps[0]?.spaceId || runtime.store.startSpaceId;
  const initialGraphPath = runtime.graph.path(runtime.state.activeSpaceId, firstTourSpace);
  if (!initialGraphPath) preflightFailures.push(`tour start ${firstTourSpace} unreachable from ${runtime.state.activeSpaceId}`);

  const preflight = {
    pass: preflightFailures.length === 0,
    failures: preflightFailures,
    routeId: runtime.defaultRouteId,
    tourSteps: manifest.steps.length,
    beats: manifest.beats.length,
    guideStagings: stagingAudit.length,
    spaces: [...new Set(stagingAudit.map((x) => x.spaceId).filter(Boolean))],
    firstTourSpace,
    initialGraphPath,
    protectedNestedSpaces: [...NESTED_PROTECTED_SPACES],
    clearanceWarnings: stagingAudit.filter((x) => x.geometryReadyAtBoot && x.clearanceSafe === false).map((x) => x.beatId),
    deferredGeometryChecks: stagingAudit.filter((x) => !x.geometryReadyAtBoot).map((x) => x.beatId),
    stagingAudit,
    manifestChecks: manifestValidation.checks
  };
  if (!preflight.pass) {
    runtime.onFrame = renderChainBeforeBridge;
    runtime.stageGuide = originalStageGuide;
    runtime.experience.ports.guideSettled = originalGuideSettled;
    runtime.exitRoute = originalExitRoute;
    motion.update = originalMotionUpdate;
    if (originalGateAPerform) gateA.perform = originalGateAPerform;
    throw new Error(`Character Tour Bridge preflight failed: ${JSON.stringify(preflight.failures)}`);
  }

  async function moveRuntimeToSpace(targetSpaceId) {
    const path = runtime.graph.path(runtime.state.activeSpaceId, targetSpaceId);
    if (!path) throw new Error(`No canonical WorldGraph path to ${targetSpaceId}`);
    for (let i = 1; i < path.length; i += 1) {
      const from = runtime.state.activeSpaceId;
      const to = path[i];
      const portal = runtime.graph.exits(from).find((candidate) => candidate.toSpaceId === to);
      if (!portal) throw new Error(`WorldGraph path missing portal ${from} → ${to}`);
      await runtime.traversePortal(portal.id, { source: 'CHARACTER_TOUR_CANONICAL_START' });
      if (runtime.state.activeSpaceId !== to) throw new Error(`Canonical traversal failed ${from} → ${to}`);
      const spawn = runtime.sceneKit.poseForAnchor(portal.destinationSpawnId);
      phase4a.rebindSpace(to, spawn || null);
    }
  }

  async function prepareCanonicalStart() {
    moveToken += 1;
    cancelMove('prepare canonical tour start');
    if (runtime.experience.transport !== 'IDLE') originalExitRoute();
    await moveRuntimeToSpace(firstTourSpace);
    root.visible = true;
    const space = runtime.store.require(firstTourSpace);
    const spawn = runtime.sceneKit.poseForAnchor(space.defaultSpawnAnchorId);
    phase4a.rebindSpace(firstTourSpace, spawn || null);
    runtime.camera.request(CAMERA_AUTHORITY.THIRD_PERSON_EXPLORE, {
      reason: 'Character Tour Bridge canonical start prepared', durationMs: 0, restore: 'ADOPT_INCOMING'
    });
    window.__IW?.input?.setEnabled?.(true);
    lastSpaceId = firstTourSpace;
    return true;
  }

  const offRouteCompleted = runtime.bus.on(EVENTS.ROUTE_COMPLETED, () => {
    moveToken += 1;
    cancelMove('route completed');
    targetLook.clear();
    if (NESTED_PROTECTED_SPACES.has(runtime.state.activeSpaceId)) {
      root.visible = false;
      characterSettled = true;
    } else {
      restoreFreeCharacter();
    }
  });

  const api = {
    ready: true,
    phase: 'PHASE6_TOUR_BRIDGE',
    runtime,
    phase4a,
    manifest,
    preflight,
    provenance: PROVENANCE,
    movementLog,
    get characterSettled() { return characterSettled; },
    get lastTarget() { return lastTarget; },
    get lastError() { return lastError; },
    async prepareCanonicalStart() { return prepareCanonicalStart(); },
    async startCanonicalTour() {
      try {
        lastError = null;
        movementLog.length = 0;
        captureFreePose();
        await prepareCanonicalStart();
        captureFreePose();
        runtime.startRoute(runtime.defaultRouteId);
        return true;
      } catch (error) {
        lastError = String(error?.message || error);
        console.error('[Museum Character Tour Bridge] start failed', error);
        return false;
      }
    },
    exitTour() {
      if (runtime.experience.transport !== 'IDLE') runtime.exitRoute();
      else restoreFreeCharacter();
      return true;
    },
    clearRunEvidence() { movementLog.length = 0; lastError = null; reroutes = 0; blocked = 0; nestedParks = 0; },
    report() {
      const e = runtime.experience;
      return {
        phase: 'PHASE6_TOUR_BRIDGE',
        ready: true,
        preflight,
        spaceId: runtime.state.activeSpaceId,
        characterSettled,
        rootVisible: root.visible,
        lastTarget,
        lastError,
        experience: {
          transport: e.transport,
          routeId: e.routeId,
          stepId: e.currentStep?.id || null,
          tourOrder: e.tourOrder || 0,
          tourTotal: e.tourTotal || manifest.steps.length,
          cameraAuthority: runtime.camera.owner
        },
        movement: { entries: movementLog.length, reroutes, blocked, nestedParks, active: Boolean(activeMove) },
        lookAt: { canonicalHead: Boolean(targetLook.head), canonicalNeck: Boolean(targetLook.neck), postMotionPreRender: true },
        authorities: {
          experienceDirectorDuplicated: false,
          routeDuplicated: false,
          worldStateDuplicated: false,
          rendererDuplicated: false,
          worldStoreDuplicated: false,
          cameraAuthorityDuplicated: false,
          characterRootDuplicated: false,
          animationMixerDuplicated: false,
          frozenDonorEdited: false
        },
        specializedRooms: { breeze: 'PARK/SUSPEND — protected nested runtime, no renderer graft' },
        provenance: PROVENANCE
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      moveToken += 1;
      cancelMove('dispose');
      phase4a.setInput({});
      targetLook.clear();
      runtime.onFrame = renderChainBeforeBridge;
      runtime.stageGuide = originalStageGuide;
      runtime.experience.ports.guideSettled = originalGuideSettled;
      runtime.exitRoute = originalExitRoute;
      motion.update = originalMotionUpdate;
      if (originalGateAPerform) gateA.perform = originalGateAPerform;
      offRouteCompleted?.();
      restoreLegacyGuideVisual();
      controls?.dispose();
      delete window.__IW_CHARACTER_TOUR;
      document.documentElement.dataset.characterTour = 'disposed';
    }
  };

  window.__IW_CHARACTER_TOUR = api;
  document.documentElement.dataset.characterTour = 'ready';
  controls = installControls(api);
  await prepareCanonicalStart();
  console.info('[Character 2027] canonical Tour Bridge ready for human validation', api.report());
  return api;
}
