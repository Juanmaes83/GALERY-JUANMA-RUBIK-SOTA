import { THREE } from '../render/render-host.js';

// Exact Phase 4A subset recovered from frozen CharacterStudio MotionFoundationV2.js
// blob 3ffa2617b107c1bdf885befce8bfcd4e0bda067c @ f5a93a48...
export const MOTION_V2_PROVENANCE = Object.freeze({
  source: 'CharacterStudio MotionFoundationV2.js',
  sourceCommit: 'f5a93a48ed0e3904fce58f08f7fbe08b5411b289',
  frozenBlobSha: '3ffa2617b107c1bdf885befce8bfcd4e0bda067c'
});

const NEUTRAL = { leftUpperArm:[0,0,1.18], rightUpperArm:[0,0,-1.18], leftLowerArm:[.08,0,-.18], rightLowerArm:[.08,0,.18], chest:[.02,0,0], head:[0,0,0] };

const DEFINITIONS = Object.freeze({
  IDLE_V2:{duration:2.8,loop:true,frames:[
    {t:0,bones:{...NEUTRAL,hips:[0,0,0],chest:[.01,0,0]}},
    {t:.5,bones:{...NEUTRAL,hips:[0,.015,0],chest:[.025,-.018,0],head:[-.015,.025,0]}},
    {t:1,bones:{...NEUTRAL,hips:[0,0,0],chest:[.01,0,0]}}
  ]},
  WALK_V2:{duration:1.05,loop:true,frames:[
    {t:0,bones:{...NEUTRAL,hips:[0,-.055,-.025],chest:[.02,.05,.025],leftUpperArm:[.24,0,1.08],rightUpperArm:[-.24,0,-1.08],leftUpperLeg:[-.42,0,0],rightUpperLeg:[.34,0,0],leftLowerLeg:[.10,0,0],rightLowerLeg:[.48,0,0]}},
    {t:.25,bones:{...NEUTRAL,hips:[0,0,.02],chest:[.01,0,-.02],leftUpperLeg:[-.08,0,0],rightUpperLeg:[.08,0,0],leftLowerLeg:[.36,0,0],rightLowerLeg:[.18,0,0]}},
    {t:.5,bones:{...NEUTRAL,hips:[0,.055,-.025],chest:[.02,-.05,.025],leftUpperArm:[-.24,0,1.08],rightUpperArm:[.24,0,-1.08],leftUpperLeg:[.34,0,0],rightUpperLeg:[-.42,0,0],leftLowerLeg:[.48,0,0],rightLowerLeg:[.10,0,0]}},
    {t:.75,bones:{...NEUTRAL,hips:[0,0,.02],chest:[.01,0,-.02],leftUpperLeg:[.08,0,0],rightUpperLeg:[-.08,0,0],leftLowerLeg:[.18,0,0],rightLowerLeg:[.36,0,0]}},
    {t:1,bones:{...NEUTRAL,hips:[0,-.055,-.025],chest:[.02,.05,.025],leftUpperArm:[.24,0,1.08],rightUpperArm:[-.24,0,-1.08],leftUpperLeg:[-.42,0,0],rightUpperLeg:[.34,0,0],leftLowerLeg:[.10,0,0],rightLowerLeg:[.48,0,0]}}
  ]},
  STOP_V2:{duration:.7,loop:false,frames:[
    {t:0,bones:{...NEUTRAL,hips:[0,-.04,-.02],chest:[.03,.035,0],leftUpperLeg:[-.18,0,0],rightUpperLeg:[.16,0,0]}},
    {t:.45,bones:{...NEUTRAL,hips:[-.03,.02,0],chest:[-.02,-.02,0],leftLowerLeg:[.22,0,0]}},
    {t:1,bones:{...NEUTRAL}}
  ]},
  TURN_LEFT_V2:{duration:.75,loop:false,frames:[
    {t:0,bones:{...NEUTRAL}},
    {t:.45,bones:{...NEUTRAL,hips:[0,.28,0],chest:[0,.22,0],head:[0,.34,0],leftUpperLeg:[-.12,0,0],rightUpperLeg:[.08,0,0]}},
    {t:1,bones:{...NEUTRAL}}
  ]},
  TURN_RIGHT_V2:{duration:.75,loop:false,frames:[
    {t:0,bones:{...NEUTRAL}},
    {t:.45,bones:{...NEUTRAL,hips:[0,-.28,0],chest:[0,-.22,0],head:[0,-.34,0],leftUpperLeg:[.08,0,0],rightUpperLeg:[-.12,0,0]}},
    {t:1,bones:{...NEUTRAL}}
  ]},
  JUMP:{duration:1,loop:false,frames:[
    {t:0,bones:{...NEUTRAL}},
    {t:.22,bones:{...NEUTRAL,hips:[-.16,0,0],leftUpperLeg:[-.45,0,0],rightUpperLeg:[-.45,0,0],leftLowerLeg:[.75,0,0],rightLowerLeg:[.75,0,0],leftUpperArm:[-.3,0,1],rightUpperArm:[-.3,0,-1]}},
    {t:.5,bones:{...NEUTRAL,hips:[.1,0,0],leftUpperLeg:[.15,0,0],rightUpperLeg:[.15,0,0],leftUpperArm:[.6,0,.8],rightUpperArm:[.6,0,-.8]}},
    {t:.78,bones:{...NEUTRAL,hips:[-.12,0,0],leftUpperLeg:[-.32,0,0],rightUpperLeg:[-.32,0,0],leftLowerLeg:[.58,0,0],rightLowerLeg:[.58,0,0]}},
    {t:1,bones:{...NEUTRAL}}
  ]}
});

function findBone(root, name) {
  const direct = root.getObjectByName?.(name);
  if (direct?.isBone) return direct;
  let found = null;
  root.traverse?.((node) => { if (!found && node.isBone && node.name === name) found = node; });
  return found;
}

function resolveBone(root, name, boneMap = null) {
  const explicit = boneMap?.get?.(name) || boneMap?.[name];
  return explicit?.isBone ? explicit : findBone(root, name);
}

function resetRigToBindPose(root) {
  const seen = new Set();
  root.traverse?.((node) => {
    if (!node.isSkinnedMesh || !node.skeleton || seen.has(node.skeleton)) return;
    seen.add(node.skeleton);
    node.skeleton.pose();
  });
  root.updateMatrixWorld?.(true);
}

function clipFromDefinition(root, name, definition, boneMap = null) {
  const tracks = [];
  const boneNames = new Set();
  definition.frames.forEach((frame) => Object.keys(frame.bones || {}).forEach((bone) => boneNames.add(bone)));
  for (const boneName of boneNames) {
    const bone = resolveBone(root, boneName, boneMap);
    if (!bone) continue;
    const rest = bone.quaternion.clone();
    const times = [];
    const values = [];
    for (const frame of definition.frames) {
      const xyz = frame.bones?.[boneName] || [0,0,0];
      const offset = new THREE.Quaternion().setFromEuler(new THREE.Euler(xyz[0], xyz[1], xyz[2], 'XYZ'));
      const value = rest.clone().multiply(offset);
      times.push(frame.t * definition.duration);
      values.push(value.x, value.y, value.z, value.w);
    }
    const bindingNode = boneMap ? bone.uuid : bone.name;
    tracks.push(new THREE.QuaternionKeyframeTrack(`${bindingNode}.quaternion`, times, values));
  }
  if (!tracks.length) throw new Error(`Character motion ${name} produced zero tracks`);
  return new THREE.AnimationClip(`Character2027_${name}`, definition.duration, tracks);
}

export function createCharacterMotionV2(root, options = {}) {
  if (!root?.isObject3D) throw new Error('Character motion requires an Object3D root');
  const boneMap = options?.boneMap || null;
  resetRigToBindPose(root);
  const mixer = new THREE.AnimationMixer(root);
  const actions = new Map();
  const clips = new Map();
  const metadata = new Map();
  let current = null;

  function registerDefinition(name, definition, registration = {}) {
    if (!name || !definition?.frames?.length) throw new Error('registerDefinition requires name + frames');
    const clip = clipFromDefinition(root, name, definition, boneMap);
    const loop = registration.loop ?? definition.loop ?? false;
    const action = mixer.clipAction(clip);
    action.enabled = true;
    action.clampWhenFinished = !loop;
    action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    clips.set(name, clip);
    actions.set(name, action);
    metadata.set(name, {
      loop,
      recoverTo: registration.recoverTo || null,
      fadeSeconds: Number.isFinite(registration.fadeSeconds) ? registration.fadeSeconds : .12,
      source: registration.source || 'MOTION_V2'
    });
    return clip;
  }

  for (const [name, definition] of Object.entries(DEFINITIONS)) {
    registerDefinition(name, definition, { loop:Boolean(definition.loop), source:'MOTION_V2' });
  }

  function play(name, fade = null) {
    const next = actions.get(name);
    if (!next) throw new Error(`Unknown Character motion ${name}`);
    if (current === name && next.isRunning()) return next;
    const previous = current ? actions.get(current) : null;
    const meta = metadata.get(name) || {};
    const fadeSeconds = fade == null ? (meta.fadeSeconds ?? .12) : fade;
    next.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).play();
    if (previous && previous !== next) previous.crossFadeTo(next, fadeSeconds, false);
    current = name;
    return next;
  }

  play('IDLE_V2', 0);

  return {
    mixer,
    play,
    playAction: play,
    registerDefinition,
    has(name) { return actions.has(name); },
    update(dt) { mixer.update(Math.max(0, Math.min(Number(dt) || 0, 0.05))); },
    get state() { return current; },
    get currentState() { return current; },
    duration(name) { return clips.get(name)?.duration || 0; },
    metadata(name) { return metadata.get(name) || null; },
    report() {
      return {
        state: current,
        provenance: MOTION_V2_PROVENANCE,
        actions: [...actions.keys()],
        bindingMode: boneMap ? 'CANONICAL_UUID' : 'NAME'
      };
    },
    dispose() {
      mixer.stopAllAction();
      for (const clip of clips.values()) mixer.uncacheClip(clip);
      mixer.uncacheRoot(root);
      actions.clear(); clips.clear(); metadata.clear();
    }
  };
}
