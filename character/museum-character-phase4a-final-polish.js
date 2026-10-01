const GALLERY_A = 'space.gallery-a';
const BARRIER_SHRINK = 0.82;

/**
 * Final, intentionally small Gallery-A circulation polish for Character 2027.
 *
 * The Museum SceneKit remains the owner of presentation and navigationVolume.
 * This helper only adjusts the already-built Gallery-A primary barrier so the
 * Character has a human-width bypass at the line ends. It does not create a
 * second collision truth: the visual barrier and the existing SceneKit blocker
 * are shortened together.
 */
export function applyPhase4AFinalPolish(sceneKit) {
  const handle = sceneKit?._spaces?.get?.(GALLERY_A);
  if (!handle?.group || !Array.isArray(handle.blockers)) {
    return { applied: false, reason: 'gallery-a-handle-unavailable' };
  }

  const barriers = [];
  handle.group.traverse((object) => {
    if (object?.name === 'barrier') barriers.push(object);
  });
  if (!barriers.length) return { applied: false, reason: 'no-barrier-found' };

  // Gallery A uses the primary-wall policy, so the longest barrier is the one
  // that governs the end-of-line circulation seen in the human gate.
  let selected = null;
  let selectedBox = null;
  let selectedSpan = -Infinity;
  const THREE = sceneKit.renderHost?.camera?.constructor ? globalThis.__IW?.renderHost?.THREE : null;

  // Avoid importing another THREE instance. Box measurements are recovered from
  // child geometry positions already authored in world coordinates.
  for (const barrier of barriers) {
    const extents = barrierExtents(barrier);
    const span = Math.max(extents.maxX - extents.minX, extents.maxZ - extents.minZ);
    if (span > selectedSpan) {
      selected = barrier;
      selectedBox = extents;
      selectedSpan = span;
    }
  }
  if (!selected || !selectedBox || selectedSpan < 1.2) {
    return { applied: false, reason: 'barrier-span-unusable' };
  }

  const alongX = (selectedBox.maxX - selectedBox.minX) >= (selectedBox.maxZ - selectedBox.minZ);
  const centre = alongX
    ? (selectedBox.minX + selectedBox.maxX) / 2
    : (selectedBox.minZ + selectedBox.maxZ) / 2;

  if (alongX) {
    selected.scale.x *= BARRIER_SHRINK;
    selected.position.x += centre * (1 - BARRIER_SHRINK);
  } else {
    selected.scale.z *= BARRIER_SHRINK;
    selected.position.z += centre * (1 - BARRIER_SHRINK);
  }
  selected.updateMatrixWorld?.(true);

  let blockersAdjusted = 0;
  for (const blocker of handle.blockers) {
    if (!isBarrierBlocker(blocker)) continue;
    const spanX = blocker.max[0] - blocker.min[0];
    const spanZ = blocker.max[2] - blocker.min[2];
    const blockerAlongX = spanX >= spanZ;
    if (blockerAlongX !== alongX) continue;
    const blockerCentre = blockerAlongX
      ? (blocker.min[0] + blocker.max[0]) / 2
      : (blocker.min[2] + blocker.max[2]) / 2;
    if (blockerAlongX) {
      const half = spanX * BARRIER_SHRINK / 2;
      blocker.min[0] = blockerCentre - half;
      blocker.max[0] = blockerCentre + half;
    } else {
      const half = spanZ * BARRIER_SHRINK / 2;
      blocker.min[2] = blockerCentre - half;
      blocker.max[2] = blockerCentre + half;
    }
    blockersAdjusted += 1;
  }

  return {
    applied: true,
    barrierShrink: BARRIER_SHRINK,
    axis: alongX ? 'X' : 'Z',
    blockersAdjusted
  };
}

function barrierExtents(group) {
  const values = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  group.traverse((object) => {
    const p = object?.position;
    if (!p) return;
    if (Number.isFinite(p.x)) { values.minX = Math.min(values.minX, p.x); values.maxX = Math.max(values.maxX, p.x); }
    if (Number.isFinite(p.z)) { values.minZ = Math.min(values.minZ, p.z); values.maxZ = Math.max(values.maxZ, p.z); }
  });
  if (!Number.isFinite(values.minX) || !Number.isFinite(values.minZ)) {
    return { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
  }
  return values;
}

function isBarrierBlocker(blocker) {
  if (!blocker?.min || !blocker?.max) return false;
  const spanX = blocker.max[0] - blocker.min[0];
  const spanZ = blocker.max[2] - blocker.min[2];
  const maxY = Number(blocker.max[1]);
  return Math.abs(maxY - 1.2) < 0.05 && Math.min(spanX, spanZ) <= 0.55 && Math.max(spanX, spanZ) >= 1.2;
}
