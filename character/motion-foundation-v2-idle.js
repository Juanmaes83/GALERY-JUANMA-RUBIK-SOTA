import { THREE } from '../render/render-host.js';

// Museum-side Phase 3 extraction of the proven CharacterStudio MotionFoundationV2 IDLE_V2.
// Frozen source of truth (never edited in place):
// labs/immersive-worlds/donors-frozen/character-2027/characterstudio/src/character2027/animation/MotionFoundationV2.js
export const MOTION_FOUNDATION_V2_IDLE_PROVENANCE = Object.freeze({
  source: 'CharacterStudio MotionFoundationV2.js',
  sourceCommit: 'f5a93a48ed0e3904fce58f08f7fbe08b5411b289',
  frozenBlobSha: '3ffa2617b107c1bdf885befce8bfcd4e0bda067c',
  state: 'IDLE_V2',
  clipName: 'Character2027_V2_IDLE_V2'
});

const NEUTRAL = Object.freeze({
  leftUpperArm: [0, 0, 1.18],
  rightUpperArm: [0, 0, -1.18],
  leftLowerArm: [0.08, 0, -0.18],
  rightLowerArm: [0.08, 0, 0.18],
  chest: [0.02, 0, 0],
  head: [0, 0, 0]
});

export const IDLE_V2_DEFINITION = Object.freeze({
  duration: 2.8,
  loop: true,
  frames: Object.freeze([
    Object.freeze({ t: 0, bones: Object.freeze({ ...NEUTRAL, hips: [0, 0, 0], chest: [0.01, 0, 0] }) }),
    Object.freeze({ t: 0.5, bones: Object.freeze({ ...NEUTRAL, hips: [0, 0.015, 0], chest: [0.025, -0.018, 0], head: [-0.015, 0.025, 0] }) }),
    Object.freeze({ t: 1, bones: Object.freeze({ ...NEUTRAL, hips: [0, 0, 0], chest: [0.01, 0, 0] }) })
  ])
});

function findBone(root, name) {
  const direct = root.getObjectByName?.(name);
  if (direct?.isBone) return direct;
  let found = null;
  root.traverse?.((node) => {
    if (!found && node.isBone && node.name === name) found = node;
  });
  return found;
}

// This is the same clip-building contract used by the frozen MotionFoundationV2:
// take each bone's rest quaternion, multiply it by the authored XYZ Euler offset,
// and emit a QuaternionKeyframeTrack at normalized-frame time * duration.
function clipFromDefinition(root, name, definition) {
  const tracks = [];
  const boneNames = new Set();
  for (const frame of definition.frames) {
    for (const boneName of Object.keys(frame.bones || {})) boneNames.add(boneName);
  }

  for (const boneName of boneNames) {
    const bone = findBone(root, boneName);
    if (!bone) continue;
    const rest = bone.quaternion.clone();
    const times = [];
    const values = [];

    for (const frame of definition.frames) {
      const xyz = frame.bones?.[boneName];
      if (!xyz) continue;
      const offset = new THREE.Quaternion().setFromEuler(new THREE.Euler(xyz[0], xyz[1], xyz[2], 'XYZ'));
      const quaternion = rest.clone().multiply(offset);
      times.push(frame.t * definition.duration);
      values.push(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
    }

    if (times.length > 1) {
      tracks.push(new THREE.QuaternionKeyframeTrack(`${bone.name}.quaternion`, times, values));
    }
  }

  return new THREE.AnimationClip(`Character2027_V2_${name}`, definition.duration, tracks);
}

export function createMotionFoundationV2Idle(root) {
  if (!root?.isObject3D) throw new Error('IDLE_V2 requires a Character Object3D root');

  const clip = clipFromDefinition(root, 'IDLE_V2', IDLE_V2_DEFINITION);
  if (!clip.tracks.length) throw new Error('IDLE_V2 produced zero bone tracks');

  const mixer = new THREE.AnimationMixer(root);
  const action = mixer.clipAction(clip);
  action.enabled = true;
  action.clampWhenFinished = false;
  action.setLoop(THREE.LoopRepeat, Infinity);
  action.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).play();

  return {
    state: 'IDLE_V2',
    clip,
    mixer,
    action,
    provenance: MOTION_FOUNDATION_V2_IDLE_PROVENANCE,
    definition: IDLE_V2_DEFINITION,
    update(dt) {
      mixer.update(Math.max(0, Math.min(Number(dt) || 0, 0.05)));
    },
    report() {
      return {
        state: 'IDLE_V2',
        source: MOTION_FOUNDATION_V2_IDLE_PROVENANCE.source,
        sourceCommit: MOTION_FOUNDATION_V2_IDLE_PROVENANCE.sourceCommit,
        sourceBlobSha: MOTION_FOUNDATION_V2_IDLE_PROVENANCE.frozenBlobSha,
        clipName: clip.name,
        duration: clip.duration,
        trackCount: clip.tracks.length,
        mechanism: 'THREE.AnimationMixer',
        running: action.isRunning()
      };
    },
    dispose() {
      action.stop();
      mixer.stopAllAction();
      mixer.uncacheClip(clip);
      mixer.uncacheRoot(root);
    }
  };
}
