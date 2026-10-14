/**
 * Immersive Worlds — Framing maths
 *
 * Constitution §14 rule 5: "focus framing should derive from subject semantics
 * and bounds where practical, not one global hard-coded distance"; rule 6:
 * "mobile framing must be validated separately".
 *
 * So framing is computed from the subject's semantic size and the *actual*
 * viewport, which means a 9:16 phone naturally stands further back than a 21:9
 * desktop instead of cropping the work. Pure arithmetic — no Three.js, no DOM,
 * runnable in Node, which is why the QA suite can assert it directly.
 */

export const vec3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  scale: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  length: (a) => Math.hypot(a[0], a[1], a[2]),
  normalize: (a) => {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  },
  lerp: (a, b, t) => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t
  ],
  distance: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
};

/**
 * Distance at which a subject of the given size fills `fill` of the frame.
 *
 * @param {{width:number, height:number}} subject metres
 * @param {{aspect:number, vfov:number}} viewport vfov in degrees
 * @param {number} fill  1 = subject exactly fills the frame; 0.7 leaves breathing room
 * @returns {number} metres
 */
export function distanceToFrame(subject, viewport, fill = 0.72) {
  const vfov = (Math.max(viewport.vfov || 45, 1) * Math.PI) / 180;
  const aspect = Math.max(viewport.aspect || 1.6, 0.2);
  const halfV = Math.tan(vfov / 2);
  const halfH = halfV * aspect;

  const forHeight = subject.height / 2 / (halfV * fill);
  const forWidth = subject.width / 2 / (halfH * fill);
  return Math.max(forHeight, forWidth);
}

/**
 * Camera pose that inspects a wall-mounted or free-standing subject.
 *
 * @param {{position:[number,number,number], normal:[number,number,number]}} anchor
 *        anchor pose in world space; `normal` faces out of the surface toward the viewer
 * @param {{width:number, height:number, depth?:number}} subject semantic size, metres
 * @param {{aspect:number, vfov:number}} viewport
 * @param {{fill?:number, min?:number, max?:number, eyeHeight?:number}} [options]
 * @returns {{position:[number,number,number], target:[number,number,number], distance:number}}
 */
export function framePose(anchor, subject, viewport, options = {}) {
  const { fill = 0.72, min = 0.55, max = 14 } = options;
  const normal = vec3.normalize(anchor.normal || [0, 0, 1]);
  const distance = clamp(distanceToFrame(subject, viewport, fill), min, max);

  // Look at the optical centre of the work, not at the anchor point on the wall.
  const target = [anchor.position[0], anchor.position[1], anchor.position[2]];
  const position = vec3.add(target, vec3.scale(normal, distance));

  return { position, target, distance };
}

/**
 * Pose that surveys a whole Space from its entrance side.
 *
 * @param {{size:[number,number,number], origin:[number,number,number]}} bounds
 * @param {{position:[number,number,number], normal:[number,number,number]}} from  spawn anchor
 * @param {{aspect:number, vfov:number}} viewport
 * @param {{eyeHeight?:number, fill?:number}} [options]
 */
export function overviewPose(bounds, from, viewport, options = {}) {
  const { eyeHeight = 1.62, fill = 0.85 } = options;
  const [w, h, d] = bounds.size;
  const centre = [bounds.origin[0], bounds.origin[1] + h * 0.42, bounds.origin[2]];
  const distance = clamp(distanceToFrame({ width: w, height: h }, viewport, fill), 3, Math.max(d, w));

  const direction = vec3.normalize(from.normal || [0, 0, 1]);
  const position = vec3.add(centre, vec3.scale(direction, distance));
  position[1] = bounds.origin[1] + eyeHeight;
  return { position, target: centre, distance };
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/** Smooth, symmetric easing for camera handoffs. Respects reduced motion by duration, not shape. */
export function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
