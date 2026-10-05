/**
 * Museum Scene Kit — architectural depth (Misión Visual)
 *
 * What makes a rendered room read as built rather than modelled is mostly
 * what happens where surfaces meet: the soft darkening in the corner between
 * wall and floor, the shadow an object leaves where it stands, a timber dado
 * that gives a wall a base and a scale. This file adds those, and nothing that
 * a visitor walks into:
 *
 *   • baked junction occlusion — gradient strips along wall/floor and wall/wall
 *     junctions. It is a decal, not screen-space ambient occlusion: cheap,
 *     the same on every quality tier, and it never flickers;
 *   • contact shadows — a soft blob under benches, plinths and shop furniture.
 *     Also a baked decal, not a computed shadow: honest name, honest cost;
 *   • heritage panelling and ceiling beams for the archive;
 *   • a ceiling service grid for the dark room, so its ceiling has a plane.
 *
 * Openings and wall anchors are always left clear: nothing here covers a
 * doorway, a work, a panel or a sign, and nothing stands on the circulation
 * floor beyond 3 cm off a wall.
 */

import { THREE } from '../../render/render-host.js';
import { WALL_THICKNESS } from './builders.js';
import { mergeGeometries } from '../../vendor/three/addons/utils/BufferGeometryUtils.js';

/* == shared gradient textures ============================================== */

let linearGradient = null;
let blobGradient = null;

/**
 * 1-D alpha ramp: opaque at v = 0 (the junction), clear at v = 1. A
 * CanvasTexture is flipped (flipY), so v = 0 is the canvas's *last* row.
 */
function junctionTexture() {
  if (linearGradient) return linearGradient;
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(4, 128);
  for (let y = 0; y < 128; y += 1) {
    const t = y / 127; // t = 1 - v
    // Dense at the junction, long soft tail into the room.
    const a = Math.round(255 * t ** 2.2);
    // alphaMap samples the green channel, not alpha: the ramp goes in RGB.
    for (let x = 0; x < 4; x += 1) {
      const p = (y * 4 + x) * 4;
      image.data[p] = image.data[p + 1] = image.data[p + 2] = a;
      image.data[p + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  linearGradient = new THREE.CanvasTexture(canvas);
  linearGradient.colorSpace = THREE.NoColorSpace;
  return linearGradient;
}

/** Rounded-rectangle falloff for contact shadows. */
function blobTexture() {
  if (blobGradient) return blobGradient;
  const n = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = n;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(n, n);
  for (let y = 0; y < n; y += 1) {
    for (let x = 0; x < n; x += 1) {
      // Superellipse distance: square-ish core, soft rim.
      const dx = Math.abs((x + 0.5) / n * 2 - 1);
      const dy = Math.abs((y + 0.5) / n * 2 - 1);
      const d = (dx ** 4 + dy ** 4) ** 0.25;
      const a = Math.round(255 * Math.max(0, 1 - d) ** 1.6);
      const p = (y * n + x) * 4;
      image.data[p] = image.data[p + 1] = image.data[p + 2] = a; // alphaMap reads green
      image.data[p + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  blobGradient = new THREE.CanvasTexture(canvas);
  blobGradient.colorSpace = THREE.NoColorSpace;
  return blobGradient;
}

function decalMaterial(texture, opacity, color = 0x000000) {
  return new THREE.MeshBasicMaterial({
    color, alphaMap: texture, transparent: true, opacity,
    depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    toneMapped: false
  });
}

/* == wall geometry helpers ================================================= */

/**
 * The four inner wall faces of a room, each as a line in plan with its inward
 * normal, plus the openings in it.
 */
function wallFaces(size, origin, openings) {
  const [w, , d] = size;
  const [ox, , oz] = origin;
  const inset = WALL_THICKNESS + 0.004;
  return [
    { id: 'NORTH', length: w, centre: [ox, oz - d / 2 + inset], along: [1, 0], normal: [0, 1] },
    { id: 'SOUTH', length: w, centre: [ox, oz + d / 2 - inset], along: [1, 0], normal: [0, -1] },
    { id: 'WEST', length: d, centre: [ox - w / 2 + inset, oz], along: [0, 1], normal: [1, 0] },
    { id: 'EAST', length: d, centre: [ox + w / 2 - inset, oz], along: [0, 1], normal: [-1, 0] }
  ].map((face) => ({
    ...face,
    localSign: face.id === 'NORTH' || face.id === 'EAST' ? 1 : -1,
    openings: openings.filter((o) => o.wall === face.id)
  }));
}

/** Solid spans of a wall after removing openings and any extra keep-clear spans. */
function solidSpans(length, gaps) {
  const sorted = gaps.map((g) => [g.offset - g.width / 2, g.offset + g.width / 2]).sort((a, b) => a[0] - b[0]);
  const spans = [];
  let cursor = -length / 2;
  for (const [a, b] of sorted) {
    if (a > cursor + 0.05) spans.push([cursor, Math.min(a, length / 2)]);
    cursor = Math.max(cursor, b);
  }
  if (cursor < length / 2 - 0.05) spans.push([cursor, length / 2]);
  return spans.filter(([a, b]) => b - a > 0.08);
}

/** Place a plane/box that runs along a wall face. */
function placeOnFace(mesh, face, offset, y, standoff) {
  const [cx, cz] = face.centre;
  mesh.position.set(
    cx + face.along[0] * offset + face.normal[0] * standoff,
    y,
    cz + face.along[1] * offset + face.normal[1] * standoff
  );
  // Box/plane local +z faces into the room.
  mesh.rotation.y = Math.atan2(face.normal[0], face.normal[1]);
}

/* == junction occlusion ===================================================== */

/**
 * @param {{size:number[], origin:number[], openings:object[], strength:number, ceiling?:boolean, dadoTop?:number}} spec
 *   dadoTop: where a dado covers the lower wall, no wall band (it would be
 *   hidden and still cost overdraw) and corners start above it.
 */
export function buildJunctionOcclusion({ size, origin, openings, strength = 0.3, ceiling = true, dadoTop = 0, wallBand: wallBandOn = false }) {
  const [, h] = size;
  const oy = origin[1];
  const group = new THREE.Group();
  group.name = 'junction-occlusion';
  const tex = junctionTexture();
  const floorMat = decalMaterial(tex, strength);
  const wallMat = decalMaterial(tex, strength * 0.85);
  const cornerMat = decalMaterial(tex, strength * 0.7);
  const ceilMat = decalMaterial(tex, strength * 0.6);
  // Bands sized by measurement: each blended pixel costs on a weak GPU, and
  // 0.45 m / 0.32 m read the same at visiting distance as 0.55 / 0.42.
  const floorBand = 0.45;
  const wallBand = 0.7;

  for (const face of wallFaces(size, origin, openings)) {
    for (const [a, b] of solidSpans(face.length, face.openings)) {
      const len = b - a;
      const mid = (a + b) / 2;
      // On the floor, from the skirting out into the room.
      const floorStrip = new THREE.Mesh(new THREE.PlaneGeometry(len, floorBand), floorMat);
      floorStrip.geometry.rotateX(-Math.PI / 2);
      // PlaneGeometry v runs along its height: after rotateX(-π/2) v = 0 lies
      // at +z (the wall side once the strip is turned to the face).
      floorStrip.renderOrder = 1;
      placeOnFace(floorStrip, face, mid, oy + 0.002, 0.02 + floorBand / 2);
      floorStrip.rotation.y += Math.PI;
      group.add(floorStrip);

      // On the wall, rising from the skirting. Off by default: measured, it
      // cost blended fill for little that reads once floor band and corners
      // are there.
      if (wallBandOn && !dadoTop) {
        const wallStrip = new THREE.Mesh(new THREE.PlaneGeometry(len, wallBand), wallMat);
        wallStrip.renderOrder = 1;
        // v = 0 is the plane's bottom edge: dense at the skirting.
        placeOnFace(wallStrip, face, mid, oy + 0.12 + wallBand / 2, 0.003);
        group.add(wallStrip);
      }

      if (ceiling) {
        const ceilStrip = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.45), ceilMat);
        flipV(ceilStrip.geometry); // dense at the top, under the ceiling
        ceilStrip.renderOrder = 1;
        placeOnFace(ceilStrip, face, mid, oy + h - 0.225, 0.003);
        group.add(ceilStrip);
      }
    }

    // Vertical corner shading at both ends of the face (only where the corner is solid).
    for (const end of [-1, 1]) {
      const at = end * face.length / 2;
      const blocked = face.openings.some((o) => Math.abs(o.offset - at) < o.width / 2 + 0.5);
      if (blocked) continue;
      const band = 0.32;
      const base = dadoTop || 0.12;
      const corner = new THREE.Mesh(new THREE.PlaneGeometry(band, h - base), cornerMat);
      // Turned to its face, the plane's local +x runs along the wall for NORTH
      // and EAST and against it for SOUTH and WEST.
      cornerUV(corner.geometry, end * face.localSign);
      corner.renderOrder = 1;
      placeOnFace(corner, face, at - end * band / 2, oy + base + (h - base) / 2, 0.003);
      group.add(corner);
    }
  }
  return mergeByMaterial(group);
}

/**
 * Collapse a group of static meshes into one mesh per material: dozens of
 * strips become four draw calls per room.
 */
function mergeByMaterial(group, { decal = true, receiveShadow = false } = {}) {
  const byMaterial = new Map();
  for (const mesh of group.children) {
    mesh.updateMatrix();
    const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrix);
    mesh.geometry.dispose();
    if (!byMaterial.has(mesh.material)) byMaterial.set(mesh.material, []);
    byMaterial.get(mesh.material).push(geometry);
  }
  const merged = new THREE.Group();
  merged.name = group.name;
  for (const [material, geometries] of byMaterial) {
    const mesh = new THREE.Mesh(mergeGeometries(geometries), material);
    if (decal) mesh.renderOrder = 1;
    mesh.receiveShadow = receiveShadow;
    merged.add(mesh);
  }
  return merged;
}

/** Swap a plane's v so that v = 0 is its top edge. */
function flipV(geometry) {
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i += 1) uv.setY(i, 1 - uv.getY(i));
  uv.needsUpdate = true;
}

/** Corner strip: the gradient runs across its width, dense at the corner end. */
function cornerUV(geometry, end) {
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i += 1) {
    const u = uv.getX(i);
    uv.setXY(i, 0.5, end > 0 ? 1 - u : u);
  }
  uv.needsUpdate = true;
}

/* == contact shadows ======================================================== */

/**
 * A soft, baked shadow on the floor under something that stands on it.
 * @param {{width:number, depth:number, strength?:number, spread?:number}} spec
 */
export function buildContactShadow({ width, depth, strength = 0.42, spread = 0.18 }) {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width + spread * 2, depth + spread * 2),
    decalMaterial(blobTexture(), strength)
  );
  mesh.geometry.rotateX(-Math.PI / 2);
  mesh.position.y = 0.003;
  mesh.renderOrder = 1;
  mesh.name = 'contact-shadow';
  return mesh;
}

/* == dados ================================================================== */

/**
 * Board and cap for a dado: one box per solid span, standing `proud` off the
 * wall, with UVs in "bays" along the span (u) and 0…1 up its height (v).
 */
function dadoSpans({ size, origin, openings, keepClear }, visit) {
  for (const face of wallFaces(size, origin, openings)) {
    const gaps = [...face.openings, ...keepClear.filter((k) => k.wall === face.id)];
    for (const [a, b] of solidSpans(face.length, gaps)) visit(face, a, b);
  }
}

function scaleUV(geometry, su, sv) {
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i += 1) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  uv.needsUpdate = true;
  return geometry;
}

let bayMaps = null;
/**
 * One bay of a painted panelled dado, baked: base board, stile on the left,
 * bottom and top rails, recessed field and a raised, bevelled panel. Colour
 * (paint and its shadowed recess) and a normal map from the same height field.
 * Pure arithmetic, 128 × 128, generated once and shared by every span.
 */
function wainscotBayMaps(paint) {
  if (bayMaps) return bayMaps;
  const n = 128;
  const bayW = 0.9; const H = 1.0; // metres the bay stands for
  const h = new Float32Array(n * n);
  const colour = new Uint8Array(n * n * 4);
  const normal = new Uint8Array(n * n * 4);
  const shade = 0.68;
  const c = new THREE.Color(paint).convertLinearToSRGB();
  const at = (x, y) => {
    const xm = (x + 0.5) / n * bayW; const ym = (y + 0.5) / n * H; // y up
    if (ym < 0.12) return 1; // base board
    if (xm < 0.07) return 1; // stile
    if (ym < 0.18 || ym > H - 0.07) return 1; // rails
    // Raised panel inside the frame, with a 2 cm bevel.
    const ix = Math.min(xm - 0.07, bayW - xm) - 0.035;
    const iy = Math.min(ym - 0.18, H - 0.07 - ym) - 0.035;
    const inner = Math.min(ix, iy);
    if (inner <= 0) return 0;
    return Math.min(0.75, 0.75 * inner / 0.02);
  };
  for (let y = 0; y < n; y += 1) for (let x = 0; x < n; x += 1) h[y * n + x] = at(x, y);
  for (let y = 0; y < n; y += 1) {
    for (let x = 0; x < n; x += 1) {
      const v = h[y * n + x];
      const k = v === 0 ? shade : v < 0.75 && v > 0 ? shade + (1 - shade) * 0.6 : 1;
      const p = (y * n + x) * 4; // rows bottom-up: y already runs up
      colour[p] = c.r * 255 * k; colour[p + 1] = c.g * 255 * k; colour[p + 2] = c.b * 255 * k; colour[p + 3] = 255;
      const hl = h[y * n + Math.max(0, x - 1)]; const hr = h[y * n + Math.min(n - 1, x + 1)];
      const hd = h[Math.max(0, y - 1) * n + x]; const hu = h[Math.min(n - 1, y + 1) * n + x];
      let nx = -(hr - hl) * 1.6; let ny = -(hu - hd) * 1.6; let nz = 1;
      const len = Math.hypot(nx, ny, nz); nx /= len; ny /= len; nz /= len;
      normal[p] = (nx * 0.5 + 0.5) * 255; normal[p + 1] = (ny * 0.5 + 0.5) * 255; normal[p + 2] = (nz * 0.5 + 0.5) * 255; normal[p + 3] = 255;
    }
  }
  const tex = (data, colorSpace) => {
    const t = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
    t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
    t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
    t.colorSpace = colorSpace; t.needsUpdate = true;
    return t;
  };
  bayMaps = { map: tex(colour, THREE.SRGBColorSpace), normalMap: tex(normal, THREE.NoColorSpace) };
  return bayMaps;
}

/**
 * A painted timber dado (archive): base board, framed raised panels and a
 * chair rail at `top`. One baked board per span plus a real rail on top, so
 * the silhouette and the rail's shadow line stay geometric while the panels
 * cost one layer of cheap (Lambert) shading. The wall behind is not drawn
 * (buildRoomShell `dado`). Spans that hold a wall anchor are kept clear.
 *
 * @param {{size:number[], origin:number[], openings:object[], keepClear:object[], color:number, top?:number}} spec
 */
export function buildWainscot({ size, origin, openings, keepClear = [], color, top = 1.0 }) {
  const oy = origin[1];
  const group = new THREE.Group();
  group.name = 'wainscot';
  const maps = wainscotBayMaps(color);
  const board = new THREE.MeshLambertMaterial({ map: maps.map, normalMap: maps.normalMap });
  const rail = new THREE.MeshLambertMaterial({ color });
  const proud = 0.025;
  dadoSpans({ size, origin, openings, keepClear }, (face, a, b) => {
    const len = b - a;
    const bays = Math.max(1, Math.round(len / 0.9));
    const mesh = new THREE.Mesh(scaleUV(new THREE.BoxGeometry(len, top, proud), bays, 1), board);
    placeOnFace(mesh, face, (a + b) / 2, oy + top / 2, proud / 2);
    group.add(mesh);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(len, 0.05, proud + 0.018), rail);
    placeOnFace(cap, face, (a + b) / 2, oy + top + 0.01, (proud + 0.018) / 2);
    group.add(cap);
  });
  return mergeByMaterial(group, { decal: false, receiveShadow: true });
}

/**
 * A honed stone dado (lobby), from the same limestone as the floor: the
 * floor's own maps, with UVs in metres, so the slab joints of the map become
 * the dado's coursing. One board per span and a capping lip; the wall behind
 * is not drawn. Lambert: a honed stone has no useful specular at this scale.
 *
 * @param {{size:number[], origin:number[], openings:object[], keepClear:object[], surface:object, top?:number}} spec
 */
export function buildStoneDado({ size, origin, openings, keepClear = [], surface, top = 0.9 }) {
  const oy = origin[1];
  const group = new THREE.Group();
  group.name = 'stone-dado';
  const stone = new THREE.MeshLambertMaterial({ color: 0xf1ece4, bumpScale: surface.bumpScale });
  surface.bind(stone, (t) => { t.repeat.set(1 / 2.4, 1 / 2.4); t.offset.set(0.13, 0.31); }, ['map', 'bumpMap']);
  const proud = 0.03;
  dadoSpans({ size, origin, openings, keepClear }, (face, a, b) => {
    const len = b - a;
    const mesh = new THREE.Mesh(scaleUV(new THREE.BoxGeometry(len, top, proud), len, top), stone);
    placeOnFace(mesh, face, (a + b) / 2, oy + top / 2, proud / 2);
    group.add(mesh);
    const cap = new THREE.Mesh(scaleUV(new THREE.BoxGeometry(len, 0.035, proud + 0.012), len, 0.035), stone);
    placeOnFace(cap, face, (a + b) / 2, oy + top + 0.0175, (proud + 0.012) / 2);
    group.add(cap);
  });
  return mergeByMaterial(group, { decal: false, receiveShadow: true });
}

/* == ceilings =============================================================== */

/** Exposed timber beams across the short span of a flat ceiling. */
export function buildCeilingBeams({ size, origin, color, pitch = 1.4 }) {
  const [w, h, d] = size;
  const [ox, oy, oz] = origin;
  const group = new THREE.Group();
  group.name = 'ceiling-beams';
  const timber = new THREE.MeshStandardMaterial({ color, roughness: 0.74, metalness: 0 });
  const acrossX = w <= d; // beams span the shorter direction
  const span = (acrossX ? w : d) - WALL_THICKNESS * 2;
  const run = acrossX ? d : w;
  const count = Math.max(2, Math.floor((run - 1.0) / pitch));
  const start = -((count - 1) * pitch) / 2;
  for (let i = 0; i < count; i += 1) {
    const beam = new THREE.Mesh(
      new THREE.BoxGeometry(acrossX ? span : 0.14, 0.17, acrossX ? 0.14 : span),
      timber
    );
    const along = start + i * pitch;
    beam.position.set(acrossX ? ox : ox + along, oy + h - 0.085, acrossX ? oz + along : oz);
    beam.castShadow = false;
    beam.receiveShadow = true;
    group.add(beam);
  }
  return mergeByMaterial(group, { decal: false, receiveShadow: true });
}

/**
 * A blackened service grid hung below a dark ceiling: it gives the darkest
 * plane of the room an edge and a scale without adding any light.
 */
export function buildServiceGrid({ size, origin, color = 0x2a2724, pitch = 2.0 }) {
  const [w, h, d] = size;
  const [ox, oy, oz] = origin;
  const group = new THREE.Group();
  group.name = 'service-grid';
  const metal = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.6 });
  const y = oy + h - 0.45;
  const spanX = w - 1.4;
  const spanZ = d - 1.4;
  for (let x = -spanX / 2; x <= spanX / 2 + 1e-6; x += spanX / Math.max(1, Math.round(spanX / pitch))) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, spanZ), metal);
    bar.position.set(ox + x, y, oz);
    group.add(bar);
  }
  for (let z = -spanZ / 2; z <= spanZ / 2 + 1e-6; z += spanZ / Math.max(1, Math.round(spanZ / pitch))) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(spanX, 0.04, 0.04), metal);
    bar.position.set(ox, y - 0.04, oz + z);
    group.add(bar);
  }
  return mergeByMaterial(group, { decal: false, receiveShadow: true });
}
