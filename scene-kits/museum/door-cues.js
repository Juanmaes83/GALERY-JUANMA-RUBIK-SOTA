/**
 * Door cues: what makes a doorway read as the way into another room — from the
 * arrival point, across a dark room and on a phone — without lighting the room
 * it stands in.
 *
 *   casing   slim bronze jambs and lintel on the room side of the opening: the
 *            edge a dark wall otherwise swallows. It runs from the floor to the
 *            lintel; no picture frame or near-halo reaches the floor, so it is
 *            not read as a work.
 *   spill    a warm pool on the floor in front of the threshold, as if the next
 *            room's light came through. It brightens while the visitor is near
 *            enough to enter, the moment the «Entrar…» prompt appears.
 *   beyond   only where the next room cannot be seen through the opening (a
 *            TELEPORT portal, or a nested room drawn by its own renderer): a dim
 *            warm glow deep in the opening, so it reads as a lit passage and not
 *            as a black panel. It stands past the wall, inside the opening's
 *            outline, so it never covers the name plate or the jambs.
 *
 * Unlit geometry and two generated gradients: no light sources, no shadows, at
 * most three draw calls per doorway. MeshBasic with a map and no tone mapping,
 * the program the name plates already use.
 */

import { THREE } from '../../render/render-host.js';
import { mergeGeometries } from '../../vendor/three/addons/utils/BufferGeometryUtils.js';

const CASING_COLOR = 0xb39364;
const CASING_WIDTH = 0.07;
const CASING_DEPTH = 0.04;
const SPILL_DEPTH = 2.2;

/** Opacity of the warm spill (resting, near) and of the glow beyond, by room profile. */
export const DOOR_CUE_LEVELS = Object.freeze({
  'dark-exhibition': Object.freeze({ spill: 0.3, near: 0.58, beyond: 0.34 }),
  heritage: Object.freeze({ spill: 0.24, near: 0.48, beyond: 0.3 }),
  default: Object.freeze({ spill: 0.12, near: 0.28, beyond: 0.26 })
});

// One canvas per gradient for the page; every room gets its own texture object,
// so disposing a room never pulls a texture from under another one.
const canvases = new Map();

function gradientCanvas(kind) {
  if (canvases.has(kind)) return canvases.get(kind);
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const warm = (a) => `rgba(255, 214, 162, ${a})`;
  if (kind === 'spill') {
    // Brightest at the threshold (the top row, v = 1, faces the wall) and
    // falling off into the room and to the sides: light through a doorway.
    ctx.translate(64, 0);
    ctx.scale(1, 1.35);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 92);
    g.addColorStop(0, warm(1));
    g.addColorStop(0.35, warm(0.55));
    g.addColorStop(0.7, warm(0.16));
    g.addColorStop(1, warm(0));
    ctx.fillStyle = g;
    ctx.fillRect(-64, 0, 128, 128);
  } else {
    // A lit floor beyond: strongest low down, gone before the lintel.
    const g = ctx.createLinearGradient(0, 128, 0, 0);
    g.addColorStop(0, warm(0.95));
    g.addColorStop(0.3, warm(0.45));
    g.addColorStop(0.75, warm(0.06));
    g.addColorStop(1, warm(0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  }
  canvases.set(kind, canvas);
  return canvas;
}

function gradientMaterial(kind, opacity) {
  const texture = new THREE.CanvasTexture(gradientCanvas(kind));
  texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({
    map: texture, transparent: true, opacity, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false
  });
}

/** Unit vector into the room from the wall an opening is cut in. */
function inward(wall) {
  return { EAST: [-1, 0, 0], WEST: [1, 0, 0], NORTH: [0, 0, 1], SOUTH: [0, 0, -1] }[wall] || [0, 0, 1];
}

/**
 * @param {{ opening: {wall:string, width:number, height:number, portalId:string, worldPosition:number[]},
 *   floorY: number, wallThickness: number, sceneProfile?: string, destinationVisible: boolean }} options
 * @returns {{ group: THREE.Group, spill: THREE.MeshBasicMaterial, levels: object, beyond: boolean }}
 */
export function buildDoorCue({ opening, floorY, wallThickness, sceneProfile, destinationVisible }) {
  const levels = DOOR_CUE_LEVELS[sceneProfile] || DOOR_CUE_LEVELS.default;
  const n = inward(opening.wall);
  const [ax, , az] = opening.worldPosition;
  const { width, height } = opening;

  // Local frame: x along the wall, y up, z into the room; the origin is the
  // centre of the opening on the room-side face of the wall, at floor level.
  const group = new THREE.Group();
  group.name = `door-cue:${opening.portalId}`;
  group.position.set(ax + n[0] * wallThickness, floorY, az + n[2] * wallThickness);
  group.rotation.y = Math.atan2(n[0], n[2]);

  const pieces = [];
  for (const side of [-1, 1]) {
    const jamb = new THREE.BoxGeometry(CASING_WIDTH, height + CASING_WIDTH, CASING_DEPTH);
    jamb.translate(side * (width / 2 + CASING_WIDTH / 2), (height + CASING_WIDTH) / 2, CASING_DEPTH / 2 + 0.002);
    pieces.push(jamb);
  }
  const lintel = new THREE.BoxGeometry(width, CASING_WIDTH, CASING_DEPTH);
  lintel.translate(0, height + CASING_WIDTH / 2, CASING_DEPTH / 2 + 0.002);
  pieces.push(lintel);
  const casing = new THREE.Mesh(mergeGeometries(pieces), new THREE.MeshBasicMaterial({ color: CASING_COLOR, toneMapped: false }));
  for (const piece of pieces) piece.dispose();
  casing.name = 'door-casing';
  group.add(casing);

  const spillMaterial = gradientMaterial('spill', levels.spill);
  const spill = new THREE.Mesh(new THREE.PlaneGeometry(width * 1.7, SPILL_DEPTH), spillMaterial);
  spill.name = 'door-spill';
  spill.rotation.x = -Math.PI / 2;
  // Above the floor marks (1.1 cm): an invisible proximity ring still writes
  // depth and punched a dark arc into the pool. Below the threshold's top.
  spill.position.set(0, 0.016, SPILL_DEPTH / 2 + 0.01);
  spill.renderOrder = 1;
  group.add(spill);

  if (!destinationVisible) {
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(width - 0.04, height - 0.04),
      gradientMaterial('beyond', levels.beyond)
    );
    glow.name = 'door-beyond';
    glow.position.set(0, (height - 0.04) / 2, -(wallThickness + 0.45));
    glow.renderOrder = 1;
    group.add(glow);
  }

  return { group, spill: spillMaterial, levels, beyond: !destinationVisible };
}
