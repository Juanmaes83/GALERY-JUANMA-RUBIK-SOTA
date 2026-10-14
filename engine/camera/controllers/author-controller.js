/**
 * Immersive Worlds — Author camera controller
 *
 * In Author Mode the camera belongs to the person editing the world, not to a
 * visitor and not to a director (Module Context §5). It orbits a pivot so the
 * author can inspect placement from outside the walking plane — something the
 * Explore profile deliberately cannot do.
 *
 * This exists to prove the *boundary*: the authoring surface has its own camera
 * authority state and cannot borrow the visitor's.
 */

import { clamp, vec3 } from '../framing.js';

export class AuthorController {
  constructor(options = {}) {
    this.pivot = options.pivot ?? [0, 1.4, 0];
    this.distance = options.distance ?? 12;
    this.yaw = options.yaw ?? 0.6;
    this.pitch = options.pitch ?? 0.5;
    this.fov = options.fov ?? 50;
    this.minDistance = 1.5;
    this.maxDistance = 60;

    /** @type {{orbitX:number, orbitY:number, panX:number, panY:number, dolly:number}} */
    this.input = { orbitX: 0, orbitY: 0, panX: 0, panY: 0, dolly: 0 };
  }

  framePoint(point, distance) {
    this.pivot = [...point];
    if (distance) this.distance = clamp(distance, this.minDistance, this.maxDistance);
  }

  onGain(pose) {
    // Keep looking at whatever the previous authority was looking at.
    this.pivot = [...pose.target];
    this.distance = clamp(vec3.distance(pose.position, pose.target), this.minDistance, this.maxDistance);
    const dir = vec3.normalize(vec3.sub(pose.position, pose.target));
    this.yaw = Math.atan2(dir[0], dir[2]);
    this.pitch = clamp(Math.asin(clamp(dir[1], -1, 1)), -1.35, 1.35);
  }

  update(dt, commit) {
    const input = this.input;

    this.yaw -= input.orbitX * 0.005;
    this.pitch = clamp(this.pitch + input.orbitY * 0.005, -1.35, 1.35);
    this.distance = clamp(this.distance * (1 + input.dolly * 0.0012), this.minDistance, this.maxDistance);

    if (input.panX || input.panY) {
      const right = [Math.cos(this.yaw), 0, -Math.sin(this.yaw)];
      const scale = this.distance * 0.0015;
      this.pivot = [
        this.pivot[0] - right[0] * input.panX * scale,
        clamp(this.pivot[1] + input.panY * scale, -2, 20),
        this.pivot[2] - right[2] * input.panX * scale
      ];
    }

    input.orbitX = 0;
    input.orbitY = 0;
    input.panX = 0;
    input.panY = 0;
    input.dolly = 0;

    const cosPitch = Math.cos(this.pitch);
    const position = [
      this.pivot[0] + Math.sin(this.yaw) * cosPitch * this.distance,
      this.pivot[1] + Math.sin(this.pitch) * this.distance,
      this.pivot[2] + Math.cos(this.yaw) * cosPitch * this.distance
    ];

    commit({ position, target: [...this.pivot], fov: this.fov });
  }
}
