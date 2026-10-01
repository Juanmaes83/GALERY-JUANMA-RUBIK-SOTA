/**
 * Immersive Worlds — Explore camera controller
 *
 * The visitor's camera. First-person, eye height, walk speed — a museum
 * navigation profile (Constitution §15). Orbit and teleport profiles are
 * SHOULD LATER and deliberately absent.
 *
 * It reads an abstract input snapshot, never the DOM, so the same controller is
 * driven by a keyboard, by a touch joystick, or by the QA harness feeding a
 * scripted walk. It writes the camera only through the token it is handed.
 *
 * Collision at this milestone is bounds clamping plus authored blockers: enough
 * that a visitor cannot walk through a gallery wall, honest about being a
 * blockout-grade solution. IW-OPEN-003 keeps the real approach open until the
 * Museum blockout tells us what it needs.
 */

import { clamp } from '../framing.js';

const HALF_PI = Math.PI / 2;

export class ExploreController {
  constructor(options = {}) {
    this.eyeHeight = options.eyeHeight ?? 1.62;
    this.walkSpeed = options.walkSpeed ?? 2.4;
    this.runMultiplier = options.runMultiplier ?? 1.9;
    this.lookSpeed = options.lookSpeed ?? 0.0022;
    this.radius = options.radius ?? 0.35;
    this.fov = options.fov ?? 55;
    this.position = [0, this.eyeHeight, 0];
    this.yaw = 0;
    this.pitch = 0;
    this.input = { forward: 0, right: 0, lookX: 0, lookY: 0, run: false };
    this.bounds = null;
    this.blockers = [];
    this._smoothed = [0, 0];
  }

  setNavigationVolume({ bounds, blockers = [] }) {
    this.bounds = bounds;
    this.blockers = blockers;
  }

  placeAt(position, facing) {
    this.position = [position[0], (this.bounds?.min?.[1] ?? 0) + this.eyeHeight, position[2]];
    if (facing) this.yaw = Math.atan2(facing[0], facing[2]);
    this.pitch = 0;
  }

  onGain(pose, info) {
    if (info?.restore === 'PRESERVE_OWN') return;
    this.position = [...pose.position];
    const dir = [pose.target[0] - pose.position[0], pose.target[1] - pose.position[1], pose.target[2] - pose.position[2]];
    const horizontal = Math.hypot(dir[0], dir[2]) || 1e-6;
    this.yaw = Math.atan2(dir[0], dir[2]);
    this.pitch = clamp(Math.atan2(dir[1], horizontal), -HALF_PI + 0.05, HALF_PI - 0.05);
  }

  update(dt, commit) {
    const input = this.input;
    this.yaw -= input.lookX * this.lookSpeed;
    this.pitch = clamp(this.pitch - input.lookY * this.lookSpeed, -1.2, 1.2);
    input.lookX = 0;
    input.lookY = 0;
    const speed = this.walkSpeed * (input.run ? this.runMultiplier : 1);
    const k = 1 - Math.exp(-dt * 12);
    this._smoothed[0] += (input.forward * speed - this._smoothed[0]) * k;
    this._smoothed[1] += (input.right * speed - this._smoothed[1]) * k;
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    const next = [
      this.position[0] + (this._smoothed[0] * sin + this._smoothed[1] * cos) * dt,
      this.position[1],
      this.position[2] + (this._smoothed[0] * cos - this._smoothed[1] * sin) * dt
    ];
    this.position = this.resolveNavigationPosition(next);
    commit({
      position: [...this.position],
      target: [
        this.position[0] + Math.sin(this.yaw) * Math.cos(this.pitch),
        this.position[1] + Math.sin(this.pitch),
        this.position[2] + Math.cos(this.yaw) * Math.cos(this.pitch)
      ],
      fov: this.fov
    });
  }

  /**
   * Canonical Museum navigation resolver. Character 2027 reuses this exact
   * authority rather than constructing a second ExploreController/collision truth.
   */
  resolveNavigationPosition(next) {
    return this._resolveCollision(next);
  }

  _resolveCollision(next) {
    const out = [...next];
    if (this.bounds) {
      out[0] = clamp(out[0], this.bounds.min[0] + this.radius, this.bounds.max[0] - this.radius);
      out[2] = clamp(out[2], this.bounds.min[2] + this.radius, this.bounds.max[2] - this.radius);
      out[1] = this.bounds.min[1] + this.eyeHeight;
    }
    for (const box of this.blockers) {
      if (
        out[0] > box.min[0] - this.radius && out[0] < box.max[0] + this.radius &&
        out[2] > box.min[2] - this.radius && out[2] < box.max[2] + this.radius
      ) {
        const dxMin = Math.abs(out[0] - (box.min[0] - this.radius));
        const dxMax = Math.abs(box.max[0] + this.radius - out[0]);
        const dzMin = Math.abs(out[2] - (box.min[2] - this.radius));
        const dzMax = Math.abs(box.max[2] + this.radius - out[2]);
        const smallest = Math.min(dxMin, dxMax, dzMin, dzMax);
        if (smallest === dxMin) out[0] = box.min[0] - this.radius;
        else if (smallest === dxMax) out[0] = box.max[0] + this.radius;
        else if (smallest === dzMin) out[2] = box.min[2] - this.radius;
        else out[2] = box.max[2] + this.radius;
      }
    }
    return out;
  }

  setPose({ position, yaw, pitch }) {
    if (position) this.position = [...position];
    if (typeof yaw === 'number') this.yaw = yaw;
    if (typeof pitch === 'number') this.pitch = pitch;
    this._smoothed = [0, 0];
  }
}
