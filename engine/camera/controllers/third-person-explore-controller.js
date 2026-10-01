/**
 * Character 2027 — third-person Explore camera.
 *
 * One CameraController inside the existing Museum CameraAuthority. This owns no
 * renderer/camera/world state. It observes a plain-number Character target and
 * chooses a comfortable camera pose that stays behind the body, inside the
 * active navigation volume and clear of authored blockers.
 *
 * Camera-comfort behaviour is recovered from the frozen
 * PropertyRoomCharacterFreeMobility donor, adapted to Museum-side contracts.
 *
 * Phase 4A final recovery fixes four things that were visible in human review:
 * - Focus return must reacquire the Character instead of inheriting a Focus pose;
 * - near/far limits are enforced as persistent framing constraints;
 * - stale safe poses are never allowed to pin the camera at the wrong distance;
 * - when geometry prevents the ideal physical distance, FOV changes plane rather
 *   than allowing the Character to become tiny or fill/leave the frame.
 */

const DEFAULT_DISTANCE = 3.25;
const DEFAULT_HEIGHT = 2.05;
const DEFAULT_TARGET_HEIGHT = 1.02;
const DEFAULT_FOV = 52;
const CAMERA_MARGIN = 0.28;
const CAMERA_CLEARANCE = 0.24;
const CAMERA_MIN_DISTANCE = 2.75;
const CAMERA_MAX_DISTANCE = 3.72;
const CAMERA_TARGET_DISTANCE = 3.25;
const CAMERA_HARD_NEAR = 2.55;
const CAMERA_SOFT_NEAR = 2.85;
const CAMERA_SOFT_FAR = 3.55;
const CAMERA_HARD_FAR = 3.85;
const CAMERA_POSITION_DEAD_ZONE = 0.18;
const CAMERA_TARGET_DEAD_ZONE = 0.08;
const CAMERA_LERP_RATE = 5.4;
const FOV_LERP_RATE = 7.5;
const MIN_BEHIND_PROJECTION = 0.35;
const LAST_SAFE_MAX_CHARACTER_TRAVEL = 1.15;
const LAST_SAFE_MAX_YAW_DELTA = Math.PI / 3;
const DISTANCE_GUARD_FRAMES = 4;
const FOV_CLOSE_RECOVERY = 58;
const FOV_FAR_RECOVERY = 48;

const DISTANCES = Object.freeze([3.25, 3.5, 3.0, 2.82, 3.65]);
const LATERALS = Object.freeze([0, 0.72, -0.72, 1.05, -1.05, 1.35, -1.35]);
const HEIGHTS = Object.freeze([2.05, 2.22, 1.92]);

export class ThirdPersonExploreController {
  constructor({ distance = DEFAULT_DISTANCE, height = DEFAULT_HEIGHT, targetHeight = DEFAULT_TARGET_HEIGHT, fov = DEFAULT_FOV } = {}) {
    this.distance = clamp(distance, CAMERA_MIN_DISTANCE, CAMERA_MAX_DISTANCE);
    this.height = height;
    this.targetHeight = targetHeight;
    this.fov = fov;
    this._currentFov = fov;
    this._provider = null;
    this._volume = null;
    this._position = null;
    this._target = null;
    this._lastSafe = null;
    this._lastSafeCharacter = null;
    this._lastSafeYaw = null;
    this._farViolationFrames = 0;
    this._nearViolationFrames = 0;
    this._reacquirePending = false;
    this._shotMode = 'NORMAL';
    this._diag = {
      slot: 'INIT',
      distance: 0,
      occlusionFallbacks: 0,
      comfortHolds: 0,
      behindGuardSnaps: 0,
      distanceGuardPullIns: 0,
      distanceGuardPushOuts: 0,
      staleSafeInvalidations: 0,
      hardEnvelopeRecoveries: 0,
      focusReacquisitions: 0,
      opticalRecoveries: 0,
      shotMode: 'NORMAL'
    };
  }

  setTargetProvider(provider) {
    this._provider = typeof provider === 'function' ? provider : null;
  }

  setNavigationVolume(volume) {
    this._volume = volume || null;
    this._resetRecoveryState();
  }

  /**
   * CameraAuthority passes the incoming pose on gain. A Focus pose is not a
   * meaningful third-person pose, so a focus-release explicitly discards it and
   * reacquires a fresh rear candidate around the current Character.
   */
  onGain(pose, info = {}) {
    const returningFromFocus = String(info.reason || '').startsWith('focus:release:character');
    if (returningFromFocus) {
      this._position = null;
      this._target = null;
      this._resetRecoveryState();
      this._reacquirePending = true;
      this._diag.focusReacquisitions += 1;
      this._setShotMode('REACQUIRE');
      return;
    }
    this._position = pose?.position ? [...pose.position] : null;
    this._target = pose?.target ? [...pose.target] : null;
  }

  onLose() {}

  update(dt, commit, incomingPose) {
    const target = this._provider?.();
    if (!target?.position) {
      commit(incomingPose);
      return;
    }

    const human = target.position;
    const yaw = Number(target.yaw) || 0;
    const forward = [Math.sin(yaw), 0, Math.cos(yaw)];
    const right = [forward[2], 0, -forward[0]];
    const desiredTarget = [human[0], human[1] + this.targetHeight, human[2]];

    this._expireStaleLastSafe(human, yaw);
    const chosen = this._chooseCameraPosition(human, desiredTarget, forward, right, yaw);

    if (this._reacquirePending || !this._position) {
      this._position = [...chosen];
      this._target = [...desiredTarget];
      this._reacquirePending = false;
    }
    if (!this._target) this._target = [...desiredTarget];

    const frameDt = Math.max(0.001, Number(dt) || 0.001);
    const alpha = 1 - Math.exp(-frameDt * CAMERA_LERP_RATE);

    if (distance3(this._position, chosen) > CAMERA_POSITION_DEAD_ZONE) {
      lerp3InPlace(this._position, chosen, alpha);
    }
    if (distance3(this._target, desiredTarget) > CAMERA_TARGET_DEAD_ZONE) {
      lerp3InPlace(this._target, desiredTarget, Math.min(1, alpha * 1.08));
    }

    if (!isBehind(this._position, desiredTarget, forward, MIN_BEHIND_PROJECTION)) {
      this._position = [...chosen];
      this._diag.behindGuardSnaps += 1;
    }

    this._enforceDistanceEnvelope(this._position, desiredTarget, forward, right, human, yaw);

    const frameDistance = distance3(this._position, desiredTarget);
    const desiredFov = this._desiredFovForDistance(frameDistance);
    const fovAlpha = 1 - Math.exp(-frameDt * FOV_LERP_RATE);
    this._currentFov += (desiredFov - this._currentFov) * fovAlpha;

    this._diag.distance = frameDistance;
    this._diag.shotMode = this._shotMode;
    commit({ position: [...this._position], target: [...this._target], fov: this._currentFov });
  }

  report() {
    return {
      ...this._diag,
      position: this._position ? [...this._position] : null,
      target: this._target ? [...this._target] : null,
      fov: this._currentFov,
      targetDistance: CAMERA_TARGET_DISTANCE,
      minDistance: CAMERA_MIN_DISTANCE,
      maxDistance: CAMERA_MAX_DISTANCE,
      hardNear: CAMERA_HARD_NEAR,
      hardFar: CAMERA_HARD_FAR,
      farViolationFrames: this._farViolationFrames,
      nearViolationFrames: this._nearViolationFrames
    };
  }

  _chooseCameraPosition(human, cameraTarget, forward, right, yaw) {
    const distances = uniqueFirst(this.distance, DISTANCES)
      .map((d) => clamp(d, CAMERA_MIN_DISTANCE, CAMERA_MAX_DISTANCE));
    const heights = uniqueFirst(this.height, HEIGHTS);

    for (const distance of distances) {
      for (const lateral of LATERALS) {
        for (const height of heights) {
          const candidate = this._candidateFrom(human, forward, right, distance, lateral, height);
          this._clampToRoom(candidate);
          if (!this._candidateComfortable(candidate, cameraTarget, forward)) continue;
          this._rememberLastSafe(candidate, human, yaw);
          this._diag.slot = `D${distance.toFixed(2)} L${lateral.toFixed(2)} H${height.toFixed(2)}`;
          return candidate;
        }
      }
    }

    this._diag.occlusionFallbacks += 1;
    if (this._lastSafe && this._candidateComfortable(this._lastSafe, cameraTarget, forward)) {
      this._diag.comfortHolds += 1;
      this._diag.slot = 'HOLD_LAST_SAFE';
      return [...this._lastSafe];
    }

    const emergency = this._candidateFrom(human, forward, right, 2.9, 0.9, 2.35);
    this._clampToRoom(emergency);
    if (this._candidateComfortable(emergency, cameraTarget, forward)) {
      this._rememberLastSafe(emergency, human, yaw);
      this._diag.slot = 'EMERGENCY_HIGH_SHOULDER';
      return emergency;
    }

    this._diag.comfortHolds += 1;
    this._diag.slot = 'FRESH_REAR_FALLBACK';
    const fallback = this._candidateFrom(human, forward, right, CAMERA_TARGET_DISTANCE, 0, this.height);
    this._clampToRoom(fallback);
    return fallback;
  }

  _candidateFrom(human, forward, right, distance, lateral, height) {
    return [
      human[0] - forward[0] * distance + right[0] * lateral,
      human[1] + height,
      human[2] - forward[2] * distance + right[2] * lateral
    ];
  }

  _candidateComfortable(candidate, target, forward) {
    if (!this._insideBounds(candidate)) return false;
    if (!isBehind(candidate, target, forward, MIN_BEHIND_PROJECTION)) return false;
    const distance = distance3(candidate, target);
    if (distance < CAMERA_MIN_DISTANCE || distance > CAMERA_MAX_DISTANCE) return false;
    if (this._pointInsideAnyBlocker(candidate, CAMERA_CLEARANCE)) return false;
    return this._segmentClear(target, candidate);
  }

  _enforceDistanceEnvelope(point, target, forward, right, human, yaw) {
    const distance = distance3(point, target);
    const tooFar = distance > CAMERA_SOFT_FAR;
    const tooNear = distance < CAMERA_SOFT_NEAR;
    const hardFar = distance > CAMERA_HARD_FAR;
    const hardNear = distance < CAMERA_HARD_NEAR;

    this._farViolationFrames = tooFar ? this._farViolationFrames + 1 : 0;
    this._nearViolationFrames = tooNear ? this._nearViolationFrames + 1 : 0;

    if (!tooFar && !tooNear) {
      this._setShotMode('NORMAL');
      return;
    }

    const persistent = hardFar || hardNear
      || this._farViolationFrames >= DISTANCE_GUARD_FRAMES
      || this._nearViolationFrames >= DISTANCE_GUARD_FRAMES;
    if (!persistent) return;

    this._invalidateLastSafe();
    this._diag.hardEnvelopeRecoveries += 1;

    const recovered = this._findEnvelopeRecovery(target, human, forward, right, yaw, tooFar);
    if (recovered) {
      point[0] = recovered[0];
      point[1] = recovered[1];
      point[2] = recovered[2];
      this._farViolationFrames = 0;
      this._nearViolationFrames = 0;
      if (tooFar) {
        this._diag.distanceGuardPullIns += 1;
        this._setShotMode('FAR_RECOVERY');
      } else {
        this._diag.distanceGuardPushOuts += 1;
        this._setShotMode('CLOSE_RECOVERY');
      }
      return;
    }

    // Geometry can make the ideal physical distance impossible. In that case we
    // keep the last clear rear pose but change optical plane so Character scale
    // remains readable instead of silently violating the product rule.
    this._diag.opticalRecoveries += 1;
    this._setShotMode(tooFar ? 'FAR_OPTICAL' : 'CLOSE_OPTICAL');
  }

  _findEnvelopeRecovery(target, human, forward, right, yaw, tooFar) {
    const distances = tooFar
      ? [3.15, 3.0, 2.85, 3.35]
      : [3.45, 3.6, 3.25, 3.05];
    const laterals = [0, 0.55, -0.55, 0.9, -0.9, 1.2, -1.2];
    const heights = [2.05, 2.2, 1.92, 2.35];

    for (const distance of distances) {
      for (const lateral of laterals) {
        for (const height of heights) {
          const candidate = this._candidateFrom(human, forward, right, distance, lateral, height);
          this._clampToRoom(candidate);
          if (!this._candidateComfortable(candidate, target, forward)) continue;
          this._rememberLastSafe(candidate, human, yaw);
          this._diag.slot = `RECOVER D${distance.toFixed(2)} L${lateral.toFixed(2)} H${height.toFixed(2)}`;
          return candidate;
        }
      }
    }
    return null;
  }

  _desiredFovForDistance(distance) {
    if (this._shotMode === 'FAR_OPTICAL' || distance > CAMERA_HARD_FAR) return FOV_FAR_RECOVERY;
    if (this._shotMode === 'CLOSE_OPTICAL' || distance < CAMERA_HARD_NEAR) return FOV_CLOSE_RECOVERY;
    if (this._shotMode === 'FAR_RECOVERY') return 50;
    if (this._shotMode === 'CLOSE_RECOVERY') return 55;
    return DEFAULT_FOV;
  }

  _setShotMode(mode) {
    this._shotMode = mode;
    this._diag.shotMode = mode;
  }

  _resetRecoveryState() {
    this._invalidateLastSafe();
    this._farViolationFrames = 0;
    this._nearViolationFrames = 0;
  }

  _expireStaleLastSafe(human, yaw) {
    if (!this._lastSafe || !this._lastSafeCharacter || this._lastSafeYaw == null) return;
    const travel = horizontalDistance(this._lastSafeCharacter, human);
    const yawDelta = angleDelta(this._lastSafeYaw, yaw);
    if (travel > LAST_SAFE_MAX_CHARACTER_TRAVEL || yawDelta > LAST_SAFE_MAX_YAW_DELTA) {
      this._invalidateLastSafe();
      this._diag.staleSafeInvalidations += 1;
    }
  }

  _rememberLastSafe(candidate, human, yaw) {
    this._lastSafe = [...candidate];
    this._lastSafeCharacter = [...human];
    this._lastSafeYaw = yaw;
  }

  _invalidateLastSafe() {
    this._lastSafe = null;
    this._lastSafeCharacter = null;
    this._lastSafeYaw = null;
  }

  _segmentClear(from, to) {
    for (let i = 3; i <= 16; i += 1) {
      const t = i / 16;
      const probe = [
        from[0] + (to[0] - from[0]) * t,
        from[1] + (to[1] - from[1]) * t,
        from[2] + (to[2] - from[2]) * t
      ];
      if (!this._insideBounds(probe)) return false;
      if (this._pointInsideAnyBlocker(probe, CAMERA_CLEARANCE)) return false;
    }
    return true;
  }

  _pointInsideAnyBlocker(point, padding = 0) {
    return (this._volume?.blockers || []).some((blocker) => pointInsideBlocker(point, blocker, padding));
  }

  _insideBounds(point) {
    const bounds = this._volume?.bounds;
    if (!bounds?.min || !bounds?.max) return true;
    return point[0] >= bounds.min[0] + CAMERA_MARGIN
      && point[0] <= bounds.max[0] - CAMERA_MARGIN
      && point[2] >= bounds.min[2] + CAMERA_MARGIN
      && point[2] <= bounds.max[2] - CAMERA_MARGIN
      && point[1] >= bounds.min[1] + 1.25
      && point[1] <= bounds.max[1] - 0.2;
  }

  _clampToRoom(point) {
    const bounds = this._volume?.bounds;
    if (!bounds?.min || !bounds?.max) return;
    point[0] = clamp(point[0], bounds.min[0] + CAMERA_MARGIN, bounds.max[0] - CAMERA_MARGIN);
    point[2] = clamp(point[2], bounds.min[2] + CAMERA_MARGIN, bounds.max[2] - CAMERA_MARGIN);
    point[1] = clamp(point[1], bounds.min[1] + 1.25, bounds.max[1] - 0.2);
  }
}

function pointInsideBlocker(point, blocker, padding = 0) {
  if (!blocker?.min || !blocker?.max) return false;
  const minY = Number.isFinite(blocker.min[1]) ? blocker.min[1] - padding : -Infinity;
  const maxY = Number.isFinite(blocker.max[1]) ? blocker.max[1] + padding : Infinity;
  return point[0] >= blocker.min[0] - padding && point[0] <= blocker.max[0] + padding
    && point[1] >= minY && point[1] <= maxY
    && point[2] >= blocker.min[2] - padding && point[2] <= blocker.max[2] + padding;
}

function isBehind(camera, target, forward, minProjection) {
  const rx = camera[0] - target[0];
  const rz = camera[2] - target[2];
  return rx * forward[0] + rz * forward[2] <= -minProjection;
}

function uniqueFirst(primary, values) {
  const out = [primary];
  for (const value of values) if (!out.some((x) => Math.abs(x - value) < 0.001)) out.push(value);
  return out;
}

function lerp3InPlace(current, target, alpha) {
  for (let i = 0; i < 3; i += 1) current[i] += (target[i] - current[i]) * alpha;
}

function distance3(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function horizontalDistance(a, b) {
  return Math.hypot(a[0] - b[0], a[2] - b[2]);
}

function angleDelta(a, b) {
  return Math.abs(Math.atan2(Math.sin(b - a), Math.cos(b - a)));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
