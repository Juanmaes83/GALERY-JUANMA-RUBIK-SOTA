/**
 * Wayfinding for the Museum Scene Kit: the outline that tells a visitor which
 * work the prompt is about, the museum's exit door, and the green exit signs
 * that lead to it.
 *
 * The signs are orientation in a virtual visit, not building-safety signage.
 * They are placed only where the World Graph proves a route: each sign stands
 * by the doorway that is the first step of the shortest path to the room that
 * holds the exit, and points at that doorway.
 */
import { THREE } from '../../render/render-host.js';
import { WALL_THICKNESS } from './builders.js';

const EXIT_GREEN = '#0b7a3e';
const HALO_COLOR = 0xead9a8;

/* -- near outline --------------------------------------------------------- */

/**
 * A thin warm outline around a wall work, just outside its frame, or a ring
 * on the floor around a free-standing piece. Unlit so it reads the same in the
 * white cube and in the dark chamber; hidden until the work is the nearest one.
 */
export function buildNearHalo({ size, floor = false }) {
  const material = new THREE.MeshBasicMaterial({
    color: HALO_COLOR, transparent: true, opacity: 0.9, toneMapped: false, depthWrite: false
  });
  const group = new THREE.Group();
  group.name = 'near-halo';
  if (floor) {
    const radius = Math.max(size[0], size[2] ?? size[0]) / 2 + 0.42;
    const ring = new THREE.Mesh(new THREE.RingGeometry(radius, radius + 0.035, 64), material);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.014;
    group.add(ring);
  } else {
    const margin = 0.07;
    const t = 0.022;
    const w = size[0] + margin * 2;
    const h = size[1] + margin * 2;
    const z = Math.max(size[2] ?? 0.05, 0.05) + 0.012;
    for (const [bw, bh, x, y] of [[w + t, t, 0, h / 2], [w + t, t, 0, -h / 2], [t, h, -w / 2, 0], [t, h, w / 2, 0]]) {
      const bar = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh), material);
      bar.position.set(x, y, z);
      group.add(bar);
    }
  }
  group.visible = false;
  return group;
}

/* -- exit sign ------------------------------------------------------------ */

/** Green plate, white running figure, arrow toward the way out, «SALIDA». */
export function exitSignTexture(direction = 'left') {
  const W = 512;
  const H = 256;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = EXIT_GREEN;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 6;
  ctx.strokeRect(9, 9, W - 18, H - 18);

  // The running figure faces the arrow, as on a standard exit sign.
  const flip = direction === 'left' ? -1 : 1;
  const figureX = direction === 'left' ? W * 0.66 : W * 0.34;
  ctx.save();
  ctx.translate(figureX, H * 0.43);
  ctx.scale(flip, 1);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#ffffff';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.arc(14, -62, 15, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = 17;
  const limb = (points) => { ctx.beginPath(); ctx.moveTo(...points[0]); for (const p of points.slice(1)) ctx.lineTo(...p); ctx.stroke(); };
  limb([[6, -38], [-6, 14]]);              // torso
  limb([[4, -32], [30, -14], [48, -26]]);  // front arm
  limb([[2, -30], [-22, -18], [-36, -2]]); // back arm
  limb([[-6, 14], [18, 36], [14, 66]]);    // front leg
  limb([[-6, 14], [-26, 40], [-50, 46]]);  // back leg
  ctx.restore();

  // Arrow: towards the doorway, or up for «straight through».
  ctx.save();
  ctx.fillStyle = '#ffffff';
  const arrowX = direction === 'left' ? W * 0.27 : W * 0.73;
  ctx.translate(arrowX, H * 0.42);
  const angle = direction === 'left' ? Math.PI : direction === 'up' ? -Math.PI / 2 : 0;
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(-58, -15); ctx.lineTo(10, -15); ctx.lineTo(10, -42); ctx.lineTo(62, 0);
  ctx.lineTo(10, 42); ctx.lineTo(10, 15); ctx.lineTo(-58, 15); ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = '#ffffff';
  ctx.font = `700 ${Math.round(H * 0.15)}px 'Helvetica Neue', Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('SALIDA', W / 2, H * 0.88);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export function buildExitSign(direction, width = 0.62) {
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(width, width / 2),
    new THREE.MeshBasicMaterial({ map: exitSignTexture(direction), toneMapped: false, side: THREE.FrontSide })
  );
  plate.name = 'exit-sign';
  return plate;
}

/* -- exit door ------------------------------------------------------------ */

/**
 * The museum's way out: a closed double-leaf door with a push bar, set in the
 * wall, with an exit sign over it. Built facing into the room.
 */
export function buildExitDoor({ width = 1.6, height = 2.35, frameColor = 0x6a5942 } = {}) {
  const group = new THREE.Group();
  group.name = 'exit-door';
  const frame = new THREE.MeshStandardMaterial({ color: frameColor, roughness: 0.55, metalness: 0.12 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x8c8378, roughness: 0.62, metalness: 0.08 });
  const bar = new THREE.MeshStandardMaterial({ color: 0xc9c4ba, roughness: 0.3, metalness: 0.8 });
  const t = 0.07;
  for (const [w, h, x, y] of [[width + t * 2, t, 0, height + t / 2], [t, height, -width / 2 - t / 2, height / 2], [t, height, width / 2 + t / 2, height / 2]]) {
    const piece = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.06), frame);
    piece.position.set(x, y, 0.03);
    group.add(piece);
  }
  for (const side of [-1, 1]) {
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(width / 2 - 0.01, height - 0.01, 0.04), leafMat);
    leaf.position.set(side * width / 4, height / 2, 0.02);
    group.add(leaf);
    const push = new THREE.Mesh(new THREE.BoxGeometry(width / 2 - 0.16, 0.05, 0.05), bar);
    push.position.set(side * width / 4, 1.0, 0.075);
    group.add(push);
  }
  const sign = buildExitSign('up', 0.7);
  sign.position.set(0, height + 0.42, 0.05);
  group.add(sign);
  return group;
}

/* -- routing ---------------------------------------------------------------- */

/** First portal of the shortest directed path from `fromSpaceId` to any target space. */
export function firstStepTowards(store, fromSpaceId, targets) {
  if (targets.has(fromSpaceId)) return null;
  const previous = new Map([[fromSpaceId, null]]);
  const queue = [fromSpaceId];
  while (queue.length) {
    const here = queue.shift();
    for (const portal of store.portalsOf(here).filter((p) => p.fromSpaceId === here)) {
      if (previous.has(portal.toSpaceId)) continue;
      previous.set(portal.toSpaceId, portal);
      if (targets.has(portal.toSpaceId)) {
        let step = portal;
        while (previous.get(step.fromSpaceId)) step = previous.get(step.fromSpaceId);
        return step;
      }
      queue.push(portal.toSpaceId);
    }
  }
  return null;
}

/**
 * Where an exit sign goes beside a doorway: on the room side of the wall, at
 * lintel height, on whichever side does not overlap a hung work. Falls back to
 * centred over the name plate (arrow up) when both sides are taken.
 */
export function placeExitSign(opening, space, wallAnchors) {
  const [w, h, d] = space.bounds.size;
  const [ox, oy, oz] = space.bounds.origin;
  // Walls stand *inside* the room's footprint (see buildRoomShell): the visible
  // face is a full wall thickness in from the boundary plane.
  const off = WALL_THICKNESS + 0.004 + 0.025;
  const signW = 0.62;
  // Wall tangent (u) and the yaw that turns the plate's +z face into the room.
  const walls = {
    NORTH: { u: [1, 0], yaw: 0, plane: (s) => [s, oz - d / 2 + off] },
    SOUTH: { u: [1, 0], yaw: Math.PI, plane: (s) => [s, oz + d / 2 - off] },
    WEST: { u: [0, 1], yaw: Math.PI / 2, plane: (s) => [ox - w / 2 + off, s] },
    EAST: { u: [0, 1], yaw: -Math.PI / 2, plane: (s) => [ox + w / 2 - off, s] }
  };
  const spec = walls[opening.wall];
  const along = (p) => (spec.u[0] ? p[0] : p[2]);
  const centre = along(opening.worldPosition);
  const y = oy + Math.min(opening.height + 0.12, h - 0.6);
  const sameWall = wallAnchors.filter((a) => {
    const n = a.normal || [0, 0, 0];
    return opening.wall === 'NORTH' ? n[2] > 0.5 : opening.wall === 'SOUTH' ? n[2] < -0.5
      : opening.wall === 'WEST' ? n[0] > 0.5 : n[0] < -0.5;
  });
  const lo = (opening.width / 2) + 0.2;
  const hi = lo + signW;
  const free = (sideSign) => sameWall.every((a) => {
    const c = along(a.position) - centre;
    const half = (a.extent?.[0] ?? 1.6) / 2;
    const [s0, s1] = sideSign > 0 ? [lo, hi] : [-hi, -lo];
    return c + half < s0 || c - half > s1;
  });
  // Plate's local +x in world = (cos yaw, -sin yaw): which way «towards the door» reads.
  const localX = [Math.cos(spec.yaw), -Math.sin(spec.yaw)];
  for (const sideSign of [1, -1]) {
    if (!free(sideSign)) continue;
    const s = centre + sideSign * (lo + signW / 2);
    const [x, z] = spec.plane(s);
    const toward = [-sideSign * spec.u[0], -sideSign * spec.u[1]];
    const direction = toward[0] * localX[0] + toward[1] * localX[1] > 0 ? 'right' : 'left';
    return { position: [x, y, z], yaw: spec.yaw, direction, side: sideSign };
  }
  const [x, z] = spec.plane(centre);
  return { position: [x, Math.min(y + 0.75, oy + h - 0.35), z], yaw: spec.yaw, direction: 'up', side: 0 };
}
