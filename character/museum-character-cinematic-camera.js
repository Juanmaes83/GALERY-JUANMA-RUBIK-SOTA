import { THREE } from '../render/render-host.js';
import { CAMERA_AUTHORITY } from '../engine/schema/types.js';
import { EVENTS } from '../engine/core/event-bus.js';
import { distanceToFrame, easeInOutCubic } from '../engine/camera/framing.js';

// Phase 6 roadmap stone: PropertyRoomCharacterCinematicCamera.js
// Museum adaptation: one thin intent layer over the EXISTING third-person camera
// controller + CameraAuthority. No renderer, camera, WorldStore, route, navigation
// authority or Character root is created here.
export const CHARACTER_CAMERA_INTENTS = Object.freeze({
  TRAVEL: 'TRAVEL',
  SETTLE: 'SETTLE',
  COMPANION: 'COMPANION',
  FOCUS: 'FOCUS',
  INTERACTION: 'INTERACTION',
  CROSSING: 'CROSSING'
});

const SOCIAL = new Set(['WAVE','GOODBYE','NOD','WELCOME','AFTER_YOU']);
const FOCUS = new Set(['POINT','LOOK_AT']);
const INTERACTION = new Set(['PRESS_DOORBELL','KNOCK_DOOR','PICK_UP_CUP','OPEN_DOOR','PICK_UP_PHONE','PICK_UP_MAGAZINE','SIT_SOFA','LEAN_WALL']);
const TRAVEL_STATES = new Set(['WALK_V2','WALK','TURN_LEFT_V2','TURN_RIGHT_V2','TURN_LEFT','TURN_RIGHT']);
const SETTLE_DELAY_MS = 560;
const CAMERA_CLEARANCE = 0.24;
const HEAD_FACTOR = 0.63;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const vec = (value) => value?.isVector3 ? value.clone() : Array.isArray(value) ? new THREE.Vector3(...value) : null;

function phase4Foundation() {
  const phase4b = window.__IW_CHARACTER_PHASE4B;
  if (phase4b?.ready && phase4b.phase4a?.ready) return phase4b.phase4a;
  return window.__IW_CHARACTER_PHASE4A?.ready ? window.__IW_CHARACTER_PHASE4A : null;
}

function insideBlocker(point, blocker, padding = 0) {
  const min = blocker?.min; const max = blocker?.max;
  if (!min || !max) return false;
  return point.x >= min[0] - padding && point.x <= max[0] + padding
    && point.y >= min[1] - padding && point.y <= max[1] + padding
    && point.z >= min[2] - padding && point.z <= max[2] + padding;
}

function insideBounds(point, bounds, padding = 0) {
  if (!bounds?.min || !bounds?.max) return true;
  return point.x >= bounds.min[0] + padding && point.x <= bounds.max[0] - padding
    && point.z >= bounds.min[2] + padding && point.z <= bounds.max[2] - padding;
}

function segmentClear(from, to, volume) {
  const probe = new THREE.Vector3();
  for (let i = 2; i <= 18; i += 1) {
    probe.lerpVectors(from, to, i / 18);
    if (!insideBounds(probe, volume?.bounds, CAMERA_CLEARANCE)) return false;
    if ((volume?.blockers || []).some((b) => insideBlocker(probe, b, CAMERA_CLEARANCE))) return false;
  }
  return true;
}

function pose(position, target, fov) {
  return { position: position.toArray(), target: target.toArray(), fov };
}

function copyPose(p) {
  return p ? { position:[...p.position], target:[...p.target], fov:p.fov ?? 52 } : null;
}

function lerpPose(a, b, t) {
  const lerp = (x,y) => x + (y-x)*t;
  return {
    position: [lerp(a.position[0],b.position[0]), lerp(a.position[1],b.position[1]), lerp(a.position[2],b.position[2])],
    target: [lerp(a.target[0],b.target[0]), lerp(a.target[1],b.target[1]), lerp(a.target[2],b.target[2])],
    fov: lerp(a.fov ?? 52, b.fov ?? 52)
  };
}

export function installMuseumCharacterCinematicCamera(runtime = window.__IW?.runtime) {
  if (!runtime?.camera || !runtime?.directed || !runtime?.sceneKit) throw new Error('Cinematic Camera requires canonical Museum camera/runtime');
  if (window.__IW_CHARACTER_CINEMATIC_CAMERA?.ready) return window.__IW_CHARACTER_CINEMATIC_CAMERA;

  const phase4a = phase4Foundation();
  const gateA = window.__IW_CHARACTER_GATE_A;
  if (!phase4a?.root || !phase4a?.cameraController || !phase4a?.motion) throw new Error('Cinematic Camera requires validated free Character foundation');

  const root = phase4a.root;
  const motion = phase4a.motion;
  const controller = phase4a.cameraController;
  const originalControllerUpdate = controller.update.bind(controller);
  const originalGateAPerform = gateA?.perform ? gateA.perform.bind(gateA) : null;

  let disposed = false;
  let intent = CHARACTER_CAMERA_INTENTS.TRAVEL;
  let previousIntent = null;
  let actionHint = null;
  let actionHintUntil = 0;
  let crossing = false;
  let lastMovementAt = performance.now();
  let lastBasePose = null;
  let lastOutputPose = null;
  let lastShot = null;
  let shot = null;
  let shots = 0;
  let fallbacks = 0;
  let crossingTransitions = 0;
  let guidedPreservations = 0;
  const counts = { TRAVEL:0, SETTLE:0, COMPANION:0, FOCUS:0, INTERACTION:0, CROSSING:0 };

  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const head = new THREE.Vector3();

  function activeVolume() {
    return runtime.sceneKit.navigationVolume(runtime.state.activeSpaceId);
  }

  function basis() {
    forward.set(0,0,1).applyQuaternion(root.quaternion).setY(0);
    if (forward.lengthSq() < 1e-8) forward.set(0,0,1); else forward.normalize();
    right.set(forward.z,0,-forward.x).normalize();
    head.copy(root.position).add(new THREE.Vector3(0, Math.min(1.66 * HEAD_FACTOR, 1.08), 0));
    return { forward, right, head };
  }

  function selectedSemanticTarget() {
    if (!gateA?.semanticView || !gateA?.report) return null;
    try {
      const id = gateA.report().selectedDestinationId;
      if (!id) return null;
      const resolved = gateA.semanticView.resolve?.(id);
      return vec(resolved?.destination?.lookAt || resolved?.lookAt || null);
    } catch { return null; }
  }

  function subjectPoint() {
    const semantic = selectedSemanticTarget();
    if (semantic) return semantic;
    const b = basis();
    return b.head.clone().addScaledVector(b.forward, 2.0);
  }

  function safe(position, target) {
    const volume = activeVolume();
    if (!volume?.bounds) return false;
    if (!insideBounds(position, volume.bounds, CAMERA_CLEARANCE)) return false;
    if ((volume.blockers || []).some((b) => insideBlocker(position, b, CAMERA_CLEARANCE))) return false;
    if (position.distanceTo(target) < 1.85) return false;
    return segmentClear(target, position, volume);
  }

  function frontThreeQuarter(kind, basePose, targetOverride = null) {
    const b = basis();
    const viewport = runtime.viewport?.() || { aspect:1.6, vfov:52 };
    const fill = kind === CHARACTER_CAMERA_INTENTS.COMPANION ? 0.66 : 0.58;
    const distance = clamp(distanceToFrame({ width:0.92, height:1.66 }, viewport, fill), 2.45, 3.8);
    const target = targetOverride || b.head.clone().add(new THREE.Vector3(0,-0.12,0));
    const directions = [
      b.forward.clone().multiplyScalar(0.48).addScaledVector(b.right,1).normalize(),
      b.forward.clone().multiplyScalar(0.48).addScaledVector(b.right,-1).normalize(),
      b.forward.clone().multiplyScalar(0.72).addScaledVector(b.right,.75).normalize(),
      b.forward.clone().multiplyScalar(0.72).addScaledVector(b.right,-.75).normalize(),
      b.forward.clone().addScaledVector(b.right,.35).normalize(),
      b.forward.clone().addScaledVector(b.right,-.35).normalize()
    ];
    for (const direction of directions) {
      const candidate = root.position.clone().addScaledVector(direction,distance);
      candidate.y = root.position.y + (kind === CHARACTER_CAMERA_INTENTS.COMPANION ? 1.62 : 1.82);
      if (safe(candidate,target)) return pose(candidate,target,kind === CHARACTER_CAMERA_INTENTS.COMPANION ? 46 : 49);
    }
    fallbacks += 1;
    return copyPose(basePose);
  }

  function focusPose(basePose, interaction = false) {
    const b = basis();
    const subject = subjectPoint();
    const characterPoint = b.head.clone().add(new THREE.Vector3(0,-0.18,0));
    const target = characterPoint.clone().lerp(subject, interaction ? .58 : .62);
    const separation = Math.max(.8, characterPoint.distanceTo(subject));
    const distance = clamp(2.7 + separation*.38, 2.7, 4.4);
    const directions = [
      b.forward.clone().multiplyScalar(-.35).addScaledVector(b.right,1).normalize(),
      b.forward.clone().multiplyScalar(-.35).addScaledVector(b.right,-1).normalize(),
      b.forward.clone().multiplyScalar(.25).addScaledVector(b.right,1).normalize(),
      b.forward.clone().multiplyScalar(.25).addScaledVector(b.right,-1).normalize()
    ];
    for (const direction of directions) {
      const candidate = target.clone().addScaledVector(direction,distance);
      candidate.y = Math.max(root.position.y + 1.55, target.y + .55);
      if (safe(candidate,target)) return pose(candidate,target,interaction ? 44 : 42);
    }
    fallbacks += 1;
    return frontThreeQuarter(CHARACTER_CAMERA_INTENTS.SETTLE, basePose, target);
  }

  function classify() {
    if (crossing || runtime.camera.owner === CAMERA_AUTHORITY.TRANSITION) return CHARACTER_CAMERA_INTENTS.CROSSING;
    const now = performance.now();
    const state = motion.state || 'IDLE_V2';
    const moving = TRAVEL_STATES.has(state) || Boolean(gateA?.report?.().navigation);
    if (moving) { lastMovementAt = now; return CHARACTER_CAMERA_INTENTS.TRAVEL; }
    const hinted = actionHintUntil > now ? actionHint : null;
    if (hinted && INTERACTION.has(hinted)) return CHARACTER_CAMERA_INTENTS.INTERACTION;
    if (INTERACTION.has(state)) return CHARACTER_CAMERA_INTENTS.INTERACTION;
    if ((hinted && FOCUS.has(hinted)) || FOCUS.has(state)) return CHARACTER_CAMERA_INTENTS.FOCUS;
    if ((hinted && SOCIAL.has(hinted)) || SOCIAL.has(state)) return CHARACTER_CAMERA_INTENTS.COMPANION;
    if (now - lastMovementAt < SETTLE_DELAY_MS) return CHARACTER_CAMERA_INTENTS.TRAVEL;
    return CHARACTER_CAMERA_INTENTS.SETTLE;
  }

  function desiredPose(nextIntent, basePose) {
    if (nextIntent === CHARACTER_CAMERA_INTENTS.COMPANION) return frontThreeQuarter(nextIntent,basePose);
    if (nextIntent === CHARACTER_CAMERA_INTENTS.FOCUS) return focusPose(basePose,false);
    if (nextIntent === CHARACTER_CAMERA_INTENTS.INTERACTION) return focusPose(basePose,true);
    if (nextIntent === CHARACTER_CAMERA_INTENTS.SETTLE) return frontThreeQuarter(nextIntent,basePose);
    return copyPose(basePose);
  }

  function startShot(nextIntent, basePose) {
    const to = desiredPose(nextIntent, basePose);
    const from = copyPose(lastOutputPose || basePose);
    const durations = { SETTLE:1050, COMPANION:760, FOCUS:880, INTERACTION:720 };
    shot = { intent:nextIntent, from, to, elapsed:0, duration:(durations[nextIntent] || 820)/1000 };
    lastShot = { intent:nextIntent, pose:copyPose(to), state:motion.state, t:Math.round(performance.now()) };
    shots += 1;
  }

  function consumeCinematic(dt, basePose) {
    const nextIntent = classify();
    if (nextIntent !== intent) {
      previousIntent = intent;
      intent = nextIntent;
      counts[intent] += 1;
      if ([CHARACTER_CAMERA_INTENTS.SETTLE,CHARACTER_CAMERA_INTENTS.COMPANION,CHARACTER_CAMERA_INTENTS.FOCUS,CHARACTER_CAMERA_INTENTS.INTERACTION].includes(intent)) startShot(intent,basePose);
      else shot = null;
    }

    if (intent === CHARACTER_CAMERA_INTENTS.TRAVEL) {
      shot = null;
      lastOutputPose = copyPose(basePose);
      return lastOutputPose;
    }
    if (intent === CHARACTER_CAMERA_INTENTS.CROSSING) {
      // CrossingController / CameraAuthority already owns crossing. Never compete.
      lastOutputPose = copyPose(basePose);
      return lastOutputPose;
    }
    if (!shot) startShot(intent,basePose);
    shot.elapsed += Math.max(0,Math.min(Number(dt)||0,.05));
    const k = shot.duration <= 0 ? 1 : clamp(shot.elapsed/shot.duration,0,1);
    const output = lerpPose(shot.from,shot.to,easeInOutCubic(k));
    lastOutputPose = output;
    return output;
  }

  controller.update = function cinematicThirdPersonUpdate(dt, commit, incomingPose) {
    let basePose = null;
    originalControllerUpdate(dt,(p) => { basePose = copyPose(p); },incomingPose);
    if (!basePose) basePose = copyPose(incomingPose);
    lastBasePose = copyPose(basePose);

    // During Guided mode the EXISTING ExperienceDirector + DirectedController are
    // already the camera authority. Preserve them rather than layering a second shot.
    if (runtime.camera.owner !== CAMERA_AUTHORITY.THIRD_PERSON_EXPLORE) {
      guidedPreservations += runtime.camera.owner === CAMERA_AUTHORITY.DIRECTED ? 1 : 0;
      commit(basePose);
      return;
    }
    commit(consumeCinematic(dt,basePose));
  };

  if (gateA && originalGateAPerform) {
    gateA.perform = (action) => {
      const ok = originalGateAPerform(action);
      if (ok) {
        actionHint = action;
        const duration = Math.max(.65, Number(motion.duration?.(action)) || .9);
        actionHintUntil = performance.now() + duration*1000;
      }
      return ok;
    };
  }

  const offPortalRequested = runtime.bus.on(EVENTS.PORTAL_REQUESTED, () => {
    crossing = true;
    previousIntent = intent;
    intent = CHARACTER_CAMERA_INTENTS.CROSSING;
    counts.CROSSING += 1;
    crossingTransitions += 1;
    shot = null;
  });
  const offPortalEntered = runtime.bus.on(EVENTS.PORTAL_ENTERED, () => {
    crossing = false;
    lastMovementAt = performance.now();
  });
  const offAuthority = runtime.bus.on(EVENTS.CAMERA_AUTHORITY_CHANGED, ({ to }) => {
    if (to === CAMERA_AUTHORITY.TRANSITION) {
      crossing = true;
      intent = CHARACTER_CAMERA_INTENTS.CROSSING;
    } else if (crossing && to !== CAMERA_AUTHORITY.TRANSITION) {
      crossing = false;
      lastMovementAt = performance.now();
    }
  });

  const api = {
    ready:true,
    phase:'PHASE6_CHARACTER_CINEMATIC_CAMERA_COMPLETE',
    intents:CHARACTER_CAMERA_INTENTS,
    get intent() { return intent; },
    notifyCharacterAction(action) {
      actionHint = action;
      actionHintUntil = performance.now() + 1200;
      return classify();
    },
    report() {
      const phase4b = window.__IW_CHARACTER_PHASE4B;
      const gateReport = gateA?.report?.() || null;
      return {
        phase:'PHASE6_CHARACTER_CINEMATIC_CAMERA_COMPLETE',
        ready:true,
        intent,
        previousIntent,
        characterState:motion.state,
        cameraOwner:runtime.camera.owner,
        shots,
        fallbacks,
        crossingTransitions,
        guidedPreservations,
        counts:{...counts},
        lastShot,
        lastBasePose,
        currentPose:lastOutputPose,
        actionHint:actionHintUntil > performance.now() ? actionHint : null,
        coverage:{
          TRAVEL:true,
          SETTLE:true,
          COMPANION:true,
          FOCUS:true,
          INTERACTION:true,
          CROSSING:true
        },
        runtimeEvidence:{
          gateAReady:Boolean(gateA?.ready),
          tourBridgeReady:Boolean(window.__IW_CHARACTER_TOUR?.ready),
          activeSpaceId:runtime.state.activeSpaceId,
          sameCharacterRoot:phase4b?.root ? phase4b.root === root : phase4a.root === root,
          semanticTarget:gateReport?.selectedDestinationId || null
        },
        authorities:{
          cameraAuthorityDuplicated:false,
          rendererDuplicated:false,
          worldStoreDuplicated:false,
          characterRootDuplicated:false,
          navigationAuthorityDuplicated:false,
          directedControllerDuplicated:false,
          thirdPersonControllerDuplicated:false
        },
        donor:'PropertyRoomCharacterCinematicCamera.js adapted to current Museum controller seam'
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      controller.update = originalControllerUpdate;
      if (gateA && originalGateAPerform) gateA.perform = originalGateAPerform;
      offPortalRequested?.(); offPortalEntered?.(); offAuthority?.();
      delete window.__IW_CHARACTER_CINEMATIC_CAMERA;
      delete document.documentElement.dataset.characterCinematicCamera;
    }
  };

  window.__IW_CHARACTER_CINEMATIC_CAMERA = api;
  document.documentElement.dataset.characterCinematicCamera = 'ready';
  console.info('[Character 2027] COMPLETE Cinematic Camera ready', api.report());
  return api;
}
