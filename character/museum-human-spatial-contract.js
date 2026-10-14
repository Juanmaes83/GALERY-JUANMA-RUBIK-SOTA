import { THREE } from '../render/render-host.js';

// Museum-side adaptation of the proven VECINIA HumanSpatialContract.
// Source: Juanmaes83/VECINIA-WORLDS @ 45e454febe2deb3b88bf5e5b527c4a5f86fe8eb1
// visual/src/character2027/spatial/HumanSpatialContract.js
// The donor remains untouched. Museum keeps SceneKit/WorldStore/navigation authority.
export const MUSEUM_HUMAN_PROFILE = Object.freeze({
  source: 'MUSEUM_ROOMS_LEGACY_SPATIAL_MEMORY',
  canonicalHeight: 1.66,
  guideWalkSpeed: 1.05,
  settleTolerance: 0.12,
  asideDistance: 0.92,
  sourceDesign: 'B'
});

function horizontalDirection(from, to, fallback = [0, 0, 1]) {
  if (!from || !to) return [...fallback];
  const dx = to[0] - from[0];
  const dz = to[2] - from[2];
  const length = Math.hypot(dx, dz);
  if (length < 1e-6) return [...fallback];
  return [dx / length, 0, dz / length];
}

function pointInsideBounds(point, bounds, radius = 0) {
  if (!bounds?.min || !bounds?.max) return false;
  return point[0] >= bounds.min[0] + radius
    && point[0] <= bounds.max[0] - radius
    && point[2] >= bounds.min[2] + radius
    && point[2] <= bounds.max[2] - radius;
}

function pointOverlapsBlocker(point, blocker, radius = 0) {
  if (!blocker?.min || !blocker?.max) return false;
  return point[0] >= blocker.min[0] - radius
    && point[0] <= blocker.max[0] + radius
    && point[2] >= blocker.min[2] - radius
    && point[2] <= blocker.max[2] + radius;
}

export class MuseumHumanSpatialContract {
  constructor({ sceneKit, store, spaceId, characterRadius = 0.34 } = {}) {
    if (!sceneKit) throw new Error('MuseumHumanSpatialContract requires SceneKit');
    if (!store) throw new Error('MuseumHumanSpatialContract requires WorldStore');
    if (!spaceId) throw new Error('MuseumHumanSpatialContract requires spaceId');
    this.sceneKit = sceneKit;
    this.store = store;
    this.spaceId = spaceId;
    this.characterRadius = characterRadius;
    this.profile = { ...MUSEUM_HUMAN_PROFILE };
  }

  canonicalHeight() {
    const donorDesign = this.sceneKit.guideDesigns?.().find?.((item) => item.id === this.profile.sourceDesign);
    return donorDesign?.height || this.profile.canonicalHeight;
  }

  resolve({ anchorId, subjectRef = null, aside = false } = {}) {
    if (!anchorId) throw new Error('MuseumHumanSpatialContract.resolve requires anchorId');
    const anchor = this.sceneKit.poseForAnchor(anchorId);
    if (!anchor) throw new Error(`Museum spatial anchor not resolved: ${anchorId}`);
    const subjectPoint = subjectRef ? this.sceneKit.subjectPoint?.(subjectRef) : null;
    const facing = subjectPoint
      ? horizontalDirection(anchor.position, subjectPoint, anchor.normal)
      : [...(anchor.normal || [0, 0, 1])];
    const lateral = [-facing[2], 0, facing[0]];
    const shift = aside ? this.profile.asideDistance : 0;
    const position = [
      anchor.position[0] + lateral[0] * shift,
      anchor.position[1],
      anchor.position[2] + lateral[2] * shift
    ];
    const yaw = Math.atan2(facing[0], facing[2]) + (aside ? 0.22 : 0);
    return {
      source: this.profile.source,
      spaceId: this.spaceId,
      anchorId,
      subjectRef,
      position,
      facing,
      yaw,
      lookAt: subjectPoint ? [...subjectPoint] : [
        position[0] + facing[0],
        position[1] + this.canonicalHeight() * 0.88,
        position[2] + facing[2]
      ],
      aside,
      canonicalHumanHeight: this.canonicalHeight()
    };
  }

  navigationVolume() { return this.sceneKit.navigationVolume(this.spaceId); }

  validatePoint(point) {
    const volume = this.navigationVolume();
    const inside = pointInsideBounds(point, volume?.bounds, this.characterRadius);
    const overlaps = (volume?.blockers || []).filter((blocker) => pointOverlapsBlocker(point, blocker, this.characterRadius));
    return { inside, overlaps, safe: inside && overlaps.length === 0 };
  }

  inspectSegment(from, to, step = 0.08) {
    const volume = this.navigationVolume();
    const dx = to[0] - from[0];
    const dz = to[2] - from[2];
    const distance = Math.hypot(dx, dz);
    const samples = Math.max(1, Math.ceil(distance / step));
    let maxOverlapCount = 0;
    let outOfBounds = 0;
    for (let i = 0; i <= samples; i += 1) {
      const t = i / samples;
      const point = [from[0] + dx * t, from[1] + (to[1] - from[1]) * t, from[2] + dz * t];
      if (!pointInsideBounds(point, volume?.bounds, this.characterRadius)) outOfBounds += 1;
      const overlapCount = (volume?.blockers || []).filter((b) => pointOverlapsBlocker(point, b, this.characterRadius)).length;
      maxOverlapCount = Math.max(maxOverlapCount, overlapCount);
    }
    return { safe: outOfBounds === 0 && maxOverlapCount === 0, distance, samples, outOfBounds, maxOverlapCount };
  }

  routePlan(from, target, { subjectRef = null } = {}) {
    const fromArray = from?.toArray ? from.toArray() : [...from];
    const targetArray = target?.position ? [...target.position] : (target?.toArray ? target.toArray() : [...target]);
    const direct = this.inspectSegment(fromArray, targetArray);
    if (direct.safe) return { source: 'DIRECT_LEGACY_STAGING', points: [targetArray], inspections: [direct] };
    const via = this.sceneKit.pathWaypoint?.(fromArray, targetArray, { subjectRef }) || null;
    if (!via) return { source: 'NO_SAFE_ROUTE', points: [], inspections: [direct], direct };
    const first = this.inspectSegment(fromArray, via);
    const second = this.inspectSegment(via, targetArray);
    if (!first.safe || !second.safe) {
      return { source: 'LEGACY_WAYPOINT_UNSAFE', points: [], inspections: [direct, first, second], via };
    }
    return { source: 'MUSEUM_PATH_WAYPOINT', points: [via, targetArray], inspections: [direct, first, second], via };
  }

  toVector3(point) { return new THREE.Vector3(point[0], point[1], point[2]); }
}
