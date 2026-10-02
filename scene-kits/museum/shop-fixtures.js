/**
 * Museum Scene Kit — shop fixtures
 *
 * The furniture and people that make the museum shop read as a shop: glass
 * vitrines in pale maple, a sales counter with its till, card terminal,
 * telephone, keyring board and tray, framed prints on the walls and a shop
 * assistant behind the counter. Reference: docs/referencias/mision5-tienda-
 * referencia.jpg.
 *
 * What is for sale stays a World entity with its own sheet, price, hotspot and
 * Studio settings. Flat products (prints, catalogue, postcards…) hang in the
 * vitrine slots that `space.metadata.shop.productSlots` lists; the 3D products
 * (keyrings, figurines, records) are built here by `buildShopDisplay` and
 * placed by the Scene Kit at their own anchors. Everything else is set
 * dressing: no hotspot, no sheet, no price.
 *
 * Built from boxes, turned profiles and instancing; a vitrine costs a handful
 * of draw calls however much it holds. Placement and themes are World data
 * (`space.metadata.shop.fixtures`); variation comes from the room's
 * deterministic RNG, so a QA state renders identically on every run.
 *
 * Local frame of every fixture: floor at y = 0, back against z = 0, front
 * facing +z, centred on x. `placeFixture` turns +z into the wall's normal.
 */
import { THREE } from '../../render/render-host.js';

/* -- dimensions ------------------------------------------------------------- */

export const VITRINE = Object.freeze({ width: 1.2, depth: 0.42, height: 2.45, side: 0.035, base: 0.5 });
/** Shelf tops, bottom (the base cabinet's top) first. */
export const LEVELS = Object.freeze([0.5, 0.88, 1.26, 1.64, 2.02]);
const LEVEL_HEIGHT = 0.36;
const GLASS = 0.012;
/** The box every flat product fits in, so any product fits any slot. */
export const SLOT_BOX = Object.freeze({ width: 0.4, height: 0.32 });

const PALETTE = {
  spines: [0x3a4650, 0x6b5340, 0xbfae8c, 0x2a332e, 0x8c4a3a, 0xdcd3c1, 0x56605b, 0x847159, 0x40404c, 0xa8826a, 0xe6dfcf, 0x5d6648, 0x9aa3a6],
  covers: [0x34434b, 0xcdbf9f, 0x7f6450, 0x2a302d, 0xdcd6c8, 0x93503f, 0x5a6e66, 0xb7c3c6],
  clay: [0x9b5a3e, 0xae6c4b, 0x8a5136, 0xa4664a],
  dolls: [0x8a3b34, 0x2f3d55, 0x3f5e4c, 0x6b4a6e, 0xc39a52, 0x2e2e33],
  hair: [0x3b2a20, 0x6b4a2e, 0xc9a25a, 0x2a211c],
  tags: [0x3f6f5e, 0xb5523e, 0x2f4f78, 0xd2a548, 0x6b6b6b, 0x8c3b5a, 0x4c8a9a, 0xc0c0c0]
};

/* -- textures ---------------------------------------------------------------- */

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

/** Pale maple: fine straight grain, a few slightly darker streaks. */
function mapleTexture(rng) {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#ddc8a6';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 90; i += 1) {
    const x = rng.range(0, 256);
    const dark = rng.next() < 0.5;
    g.strokeStyle = dark ? `rgba(150,110,70,${rng.range(0.05, 0.16)})` : `rgba(255,245,225,${rng.range(0.05, 0.14)})`;
    g.lineWidth = rng.range(0.6, 2.4);
    g.beginPath();
    g.moveTo(x, 0);
    g.bezierCurveTo(x + rng.range(-6, 6), 85, x + rng.range(-6, 6), 170, x + rng.range(-4, 4), 256);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** A soft dark ellipse: the contact shadow under a piece of furniture. */
function contactTexture() {
  const [c, g] = canvas(128, 128);
  const grad = g.createRadialGradient(64, 64, 6, 64, 64, 64);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.25)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  return t;
}

/** A small landscape or abstract for a framed print: sky, horizon bands, a sun or a field. */
function printTexture(rng, kind = 'landscape') {
  const [c, g] = canvas(192, 144);
  if (kind === 'abstract') {
    g.fillStyle = '#e9e3d6'; g.fillRect(0, 0, 192, 144);
    const cols = ['#2f5d8a', '#c8a03c', '#3f7a52', '#b4553f', '#26323e'];
    for (let i = 0; i < 4; i += 1) {
      g.fillStyle = cols[(i + rng.int(0, 4)) % cols.length];
      g.fillRect(i % 2 ? 96 : 20, i < 2 ? 18 : 72, 76, 54);
    }
  } else {
    const night = kind === 'night';
    const sky = g.createLinearGradient(0, 0, 0, 90);
    sky.addColorStop(0, night ? '#13202c' : rng.pick(['#4d6a7d', '#6f8796', '#3c5566']));
    sky.addColorStop(1, night ? '#2f4a5c' : rng.pick(['#a9b8b8', '#c9c1a6', '#8fa3a8']));
    g.fillStyle = sky; g.fillRect(0, 0, 192, 144);
    const greens = night ? ['#0f1a22', '#18262f', '#22343d'] : ['#2d4a3a', '#3f5e45', '#4f6b4a', '#22382d'];
    for (let i = 0; i < 3; i += 1) {
      g.fillStyle = greens[i % greens.length];
      g.beginPath();
      const base = 70 + i * 22;
      g.moveTo(0, base + rng.range(-8, 8));
      for (let x = 0; x <= 192; x += 24) g.lineTo(x, base + rng.range(-12, 10));
      g.lineTo(192, 144); g.lineTo(0, 144); g.closePath(); g.fill();
    }
    if (night) {
      g.fillStyle = 'rgba(230,236,240,0.85)';
      g.beginPath(); g.arc(138, 34, 9, 0, Math.PI * 2); g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** An LP sleeve: a flat colour field with circles and half-discs, the way the reference draws them. */
function sleeveTexture(rng) {
  const [c, g] = canvas(128, 128);
  const bg = rng.pick(['#e8e2d4', '#2e3a42', '#d9cdb4', '#3c4a3f', '#bfb5a0']);
  g.fillStyle = bg; g.fillRect(0, 0, 128, 128);
  const ink = rng.pick(['#1f2a30', '#c58a3a', '#3f6d5a', '#a8462f', '#e6dfcf', '#2f5a7a']);
  g.fillStyle = ink;
  g.beginPath(); g.arc(64, 64, rng.range(26, 44), 0, Math.PI * 2); g.fill();
  g.fillStyle = bg;
  g.beginPath(); g.arc(64, 64, 9, 0, Math.PI * 2); g.fill();
  if (rng.next() < 0.6) {
    g.fillStyle = rng.pick(['#c58a3a', '#e6dfcf', '#a8462f', '#6f8f7d']);
    g.beginPath(); g.arc(64, 64, rng.range(26, 44), Math.PI * rng.range(0, 1), Math.PI * rng.range(1, 2)); g.lineTo(64, 64); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* -- materials --------------------------------------------------------------- */

export function createShopMaterials(rng) {
  const maple = mapleTexture(rng.fork('maple'));
  const contact = contactTexture();
  return {
    maple: new THREE.MeshStandardMaterial({ color: 0xffffff, map: maple, roughness: 0.58 }),
    mapleDark: new THREE.MeshStandardMaterial({ color: 0xc9b08c, map: maple, roughness: 0.62 }),
    back: new THREE.MeshStandardMaterial({ color: 0xd2e5da, roughness: 0.55 }),
    panel: new THREE.MeshStandardMaterial({ color: 0xeceae4, roughness: 0.7 }),
    kick: new THREE.MeshStandardMaterial({ color: 0x8f7a5e, roughness: 0.8 }),
    glass: new THREE.MeshStandardMaterial({
      color: 0xcfe6dc, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.28, depthWrite: false
    }),
    glassEdge: new THREE.MeshStandardMaterial({ color: 0x9fc7b6, roughness: 0.2, transparent: true, opacity: 0.85 }),
    stock: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.78 }),
    clay: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }),
    frame: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }),
    device: new THREE.MeshStandardMaterial({ color: 0xd8d2c4, roughness: 0.45 }),
    deviceDark: new THREE.MeshStandardMaterial({ color: 0x24262a, roughness: 0.4, metalness: 0.15 }),
    metal: new THREE.MeshStandardMaterial({ color: 0xb8b8b4, roughness: 0.3, metalness: 0.8 }),
    screen: new THREE.MeshStandardMaterial({ color: 0x0f1c1d, emissive: 0x3f8478, emissiveIntensity: 0.6, roughness: 0.25 }),
    skin: new THREE.MeshStandardMaterial({ color: 0xe8b894, roughness: 0.62 }),
    contact: new THREE.MeshBasicMaterial({ map: contact, transparent: true, depthWrite: false, color: 0x000000, opacity: 0.55 }),
    textures: [maple, contact]
  };
}

/* -- batching ---------------------------------------------------------------- */

/** Box instances in a fixture's local frame, drawn as one InstancedMesh. */
class BoxBatch {
  constructor() { this.items = []; }
  add(position, size, color, { rx = 0, ry = 0, rz = 0 } = {}) {
    this.items.push({ position, size, color, rotation: [rx, ry, rz] });
  }
  build(material, { castShadow = false, geometry = null } = {}) {
    if (!this.items.length) return null;
    const mesh = new THREE.InstancedMesh(geometry || new THREE.BoxGeometry(1, 1, 1), material, this.items.length);
    const m = new THREE.Matrix4(); const q = new THREE.Quaternion(); const e = new THREE.Euler(); const c = new THREE.Color();
    this.items.forEach((it, i) => {
      e.set(...it.rotation);
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(...it.position), q, new THREE.Vector3(...it.size));
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, c.setHex(it.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    return mesh;
  }
}

/** Profiles normalised to height 1: [radius, t]. */
const VESSEL_PROFILES = {
  amphora: [[0, 0], [0.17, 0], [0.19, 0.04], [0.16, 0.1], [0.24, 0.32], [0.27, 0.5], [0.23, 0.72], [0.13, 0.86], [0.11, 0.93], [0.14, 1], [0, 1]],
  bottle: [[0, 0], [0.2, 0], [0.24, 0.12], [0.25, 0.5], [0.18, 0.66], [0.08, 0.78], [0.07, 0.96], [0.09, 1], [0, 1]],
  bowl: [[0, 0], [0.22, 0], [0.3, 0.18], [0.46, 0.62], [0.52, 1], [0.48, 1], [0.42, 0.66], [0, 0.16]]
};

class VesselBatch {
  constructor() { this.items = []; }
  add(position, height, radiusScale, color, profile) { this.items.push({ position, height, radiusScale, color, profile }); }
  build(material) {
    const out = [];
    const groups = new Map();
    for (const it of this.items) (groups.get(it.profile) || groups.set(it.profile, []).get(it.profile)).push(it);
    for (const [name, items] of groups) {
      const geo = new THREE.LatheGeometry(VESSEL_PROFILES[name].map(([r, t]) => new THREE.Vector2(r, t)), 32);
      const mesh = new THREE.InstancedMesh(geo, material, items.length);
      const m = new THREE.Matrix4(); const c = new THREE.Color();
      items.forEach((it, i) => {
        m.compose(new THREE.Vector3(...it.position), new THREE.Quaternion(), new THREE.Vector3(it.height * it.radiusScale, it.height, it.height * it.radiusScale));
        mesh.setMatrixAt(i, m);
        mesh.setColorAt(i, c.setHex(it.color));
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      out.push(mesh);
    }
    return out;
  }
}

/** One collector for everything a fixture holds. */
function batches() {
  return { stock: new BoxBatch(), frames: new BoxBatch(), vessels: new VesselBatch(), dolls: [], sleeves: [], prints: [] };
}

/* -- stock --------------------------------------------------------------------- */

function books(b, rng, x0, x1, y, maxH = 0.3) {
  let x = x0;
  while (x < x1 - 0.03) {
    if (rng.next() < 0.1 && x1 - x > 0.3) {
      let sy = y;
      for (let i = 0, n = rng.int(2, 4); i < n; i += 1) {
        const t = rng.range(0.025, 0.04);
        b.stock.add([x + 0.12, sy + t / 2, 0.17], [rng.range(0.19, 0.23), t, rng.range(0.15, 0.19)], rng.pick(PALETTE.covers), { ry: rng.range(-0.08, 0.08) });
        sy += t;
      }
      x += 0.27;
      continue;
    }
    const w = rng.range(0.022, 0.046);
    const h = rng.range(0.2, maxH);
    b.stock.add([x + w / 2, y + h / 2, 0.16], [w, h, rng.range(0.16, 0.21)], rng.pick(PALETTE.spines));
    x += w + 0.002;
  }
}

/** Flat stacks of catalogues and prints in sleeves, as on the reference's middle shelves. */
function flatStacks(b, rng, x0, x1, y) {
  const n = Math.max(1, Math.floor((x1 - x0) / 0.27));
  for (let i = 0; i < n; i += 1) {
    const cx = x0 + (i + 0.5) * ((x1 - x0) / n);
    let sy = y;
    const color = rng.pick(PALETTE.covers);
    for (let k = 0, count = rng.int(4, 7); k < count; k += 1) {
      const t = rng.range(0.012, 0.02);
      b.stock.add([cx + rng.range(-0.006, 0.006), sy + t / 2, 0.2], [0.23, t, 0.29], k === count - 1 ? color : 0xe9e4d8, { ry: rng.range(-0.03, 0.03) });
      sy += t;
    }
    b.stock.add([cx, sy + 0.001, 0.2], [0.13, 0.002, 0.09], rng.pick(PALETTE.spines));
  }
}

/** Faced-out catalogues leaning back against the vitrine's back. */
function facedOut(b, rng, x0, x1, y, maxH = 0.3) {
  const n = Math.max(1, Math.floor((x1 - x0) / 0.25));
  for (let i = 0; i < n; i += 1) {
    const cx = x0 + (i + 0.5) * ((x1 - x0) / n);
    const h = Math.min(maxH, 0.3);
    b.stock.add([cx, y + h / 2, 0.08], [0.21, h, 0.016], 0xe7e1d3, { rx: -0.2 });
    b.prints.push({ position: [cx, y + h / 2 + 0.03, 0.094], size: [0.15, h * 0.48], rx: -0.2, kind: rng.next() < 0.5 ? 'landscape' : 'abstract' });
  }
}

/** Framed prints standing on a shelf. */
function framedPrints(b, rng, x0, x1, y, maxH = 0.3) {
  let x = x0 + 0.02;
  while (x < x1 - 0.2) {
    const h = Math.min(maxH, rng.range(0.24, 0.3));
    const w = h * rng.range(1.0, 1.35);
    if (x + w > x1) break;
    const color = rng.next() < 0.55 ? 0x3a2f26 : 0xcfb28a;
    b.frames.add([x + w / 2, y + h / 2, 0.06], [w, h, 0.024], color, { rx: -0.08 });
    b.stock.add([x + w / 2, y + h / 2 + 0.002, 0.073], [w - 0.04, h - 0.04, 0.004], 0xf0ebe0, { rx: -0.08 });
    b.prints.push({ position: [x + w / 2, y + h / 2 + 0.003, 0.077], size: [w - 0.09, h - 0.09], rx: -0.08, kind: rng.next() < 0.75 ? 'landscape' : 'abstract' });
    x += w + rng.range(0.05, 0.1);
  }
}

function vases(b, rng, x0, x1, y, maxH = 0.3, small = false) {
  // Two or three pieces, never a row of identical pots.
  const n = small ? Math.max(1, Math.floor((x1 - x0) / 0.16)) : Math.max(1, Math.min(rng.int(2, 3), Math.floor((x1 - x0) / 0.3)));
  for (let i = 0; i < n; i += 1) {
    const cx = x0 + (i + 0.5) * ((x1 - x0) / n);
    const profile = small ? rng.pick(['bowl', 'bottle']) : rng.pick(['amphora', 'amphora', 'bottle']);
    const h = small ? (profile === 'bowl' ? 0.08 : 0.16) : Math.min(maxH, rng.range(0.24, 0.3));
    b.vessels.add([cx, y, 0.2], h, profile === 'bowl' ? 1 : 0.85, rng.pick(PALETTE.clay), profile);
  }
}

function notebooks(b, rng, x0, x1, y, kind = 'notebook') {
  const n = Math.max(1, Math.floor((x1 - x0) / 0.27));
  for (let i = 0; i < n; i += 1) {
    const cx = x0 + (i + 0.5) * ((x1 - x0) / n);
    const color = kind === 'tote' ? rng.pick([0xe4dac6, 0xd2c5a9, 0x34434b]) : rng.pick(PALETTE.covers);
    let sy = y;
    for (let k = 0, count = rng.int(3, 6); k < count; k += 1) {
      const t = kind === 'tote' ? 0.03 : 0.016;
      b.stock.add([cx, sy + t / 2, 0.2], kind === 'tote' ? [0.24, t, 0.28] : [0.15, t, 0.21], color, { ry: rng.range(-0.05, 0.05) });
      sy += t;
    }
  }
}

function postcardRack(b, rng, cx, y, width) {
  for (let tier = 0; tier < 3; tier += 1) {
    const ty = y + 0.02 + tier * 0.09;
    const tz = 0.28 - tier * 0.07;
    b.frames.add([cx, ty, tz - 0.02], [width, 0.012, 0.09], 0xcfb28a);
    for (let i = 0, n = Math.floor(width / 0.115); i < n; i += 1) {
      b.stock.add([cx - width / 2 + 0.06 + i * 0.115, ty + 0.055, tz], [0.1, 0.075, 0.004], rng.pick([0xe9e1cf, 0x5d7a6c, 0xc79b63, 0x34505f, 0xb85a43, 0xd8c8a4]), { rx: -0.25 });
    }
  }
}

/** Wooden peg figures, painted: a dress, a head, hair. */
function dolls(b, rng, x0, x1, y, count = 3) {
  for (let i = 0; i < count; i += 1) {
    const cx = x0 + (i + 0.5) * ((x1 - x0) / count);
    b.dolls.push({ position: [cx, y, 0.2], dress: rng.pick(PALETTE.dolls), hair: rng.pick(PALETTE.hair), scale: rng.range(0.95, 1.08) });
  }
}

/** A stepped stand of LP sleeves: back row higher, front row lower, three across. */
function sleeves(b, rng, x0, x1, y, across = 3) {
  const w = Math.min(0.29, (x1 - x0) / across - 0.03);
  for (let row = 0; row < 2; row += 1) {
    const z = row ? 0.13 : 0.27;
    const lift = row ? 0.1 : 0;
    b.frames.add([(x0 + x1) / 2, y + lift + 0.01, z - 0.03], [x1 - x0 - 0.04, 0.02 + lift * 0, 0.1], 0xcfb28a);
    if (row) b.frames.add([(x0 + x1) / 2, y + lift / 2, z - 0.03], [x1 - x0 - 0.04, lift, 0.1], 0xcfb28a);
    for (let i = 0; i < across; i += 1) {
      const cx = x0 + (i + 0.5) * ((x1 - x0) / across);
      b.sleeves.push({ position: [cx, y + lift + 0.02 + w / 2, z], size: w, rx: -0.22, seed: rng.next() });
    }
  }
}

const STOCKERS = {
  books: (b, r, a, z, y, h) => books(b, r, a, z, y, h),
  flat: (b, r, a, z, y) => flatStacks(b, r, a, z, y),
  faced: (b, r, a, z, y, h) => facedOut(b, r, a, z, y, h),
  prints: (b, r, a, z, y, h) => framedPrints(b, r, a, z, y, h),
  vases: (b, r, a, z, y, h) => vases(b, r, a, z, y, h),
  smallVases: (b, r, a, z, y, h) => vases(b, r, a, z, y, h, true),
  notebooks: (b, r, a, z, y) => notebooks(b, r, a, z, y),
  totes: (b, r, a, z, y) => notebooks(b, r, a, z, y, 'tote'),
  postcards: (b, r, a, z, y) => postcardRack(b, r, (a + z) / 2, y, Math.min(0.56, z - a - 0.04)),
  dolls: (b, r, a, z, y) => dolls(b, r, a, z, y),
  sleeves: (b, r, a, z, y) => sleeves(b, r, a, z, y)
};

/** What each vitrine theme holds, level by level (bottom first), as in the reference. */
const THEMES = {
  prints: ['faced', 'flat', 'prints', 'prints', 'flat'],
  ceramics: ['flat', 'flat', 'prints', 'vases', 'flat'],
  books: ['flat', 'books', 'books', 'books', 'books'],
  figurines: ['flat', 'flat', 'dolls', 'dolls', 'dolls'],
  stationery: ['notebooks', 'postcards', 'notebooks', 'books', 'notebooks'],
  objects: ['totes', 'smallVases', 'totes', 'vases', 'smallVases']
};

/** Draw the dolls, sleeves and prints a batch collected (each needs its own geometry or texture). */
function finish(group, b, mats, rng) {
  for (const mesh of [b.stock.build(mats.stock), b.frames.build(mats.frame), ...b.vessels.build(mats.clay)]) if (mesh) group.add(mesh);
  if (b.dolls.length) {
    const body = new BoxBatch(); const head = new BoxBatch(); const hair = new BoxBatch(); const face = new BoxBatch();
    for (const d of b.dolls) {
      const [x, y, z] = d.position; const s = d.scale;
      body.add([x, y + 0.075 * s, z], [0.07 * s, 0.15 * s, 0.07 * s], d.dress);
      head.add([x, y + 0.177 * s, z], [0.062 * s, 0.062 * s, 0.062 * s], 0xe9c9a6);
      hair.add([x, y + 0.192 * s, z - 0.004], [0.068 * s, 0.05 * s, 0.066 * s], d.hair);
      face.add([x - 0.011 * s, y + 0.177 * s, z + 0.03 * s], [0.006, 0.006, 0.004], 0x1e1e1e);
      face.add([x + 0.011 * s, y + 0.177 * s, z + 0.03 * s], [0.006, 0.006, 0.004], 0x1e1e1e);
    }
    const cyl = new THREE.CylinderGeometry(0.5, 0.62, 1, 18);
    const sph = new THREE.SphereGeometry(0.5, 16, 12);
    const cap = new THREE.SphereGeometry(0.5, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.62);
    group.add(body.build(mats.stock, { geometry: cyl, castShadow: true }));
    group.add(head.build(mats.stock, { geometry: sph }));
    group.add(hair.build(mats.stock, { geometry: cap }));
    group.add(face.build(mats.stock));
  }
  // Prints and sleeves share a few textures each, so a vitrine stays at a few draw calls.
  const pools = new Map();
  const pool = (key, make) => pools.get(key) || pools.set(key, make()).get(key);
  for (const p of b.prints) {
    const variant = `${p.kind}-${Math.floor(rng.next() * 3)}`;
    const mat = pool(`print-${variant}`, () => new THREE.MeshStandardMaterial({ map: printTexture(rng.fork(variant), p.kind), roughness: 0.7 }));
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(p.size[0], p.size[1]), mat);
    mesh.position.set(...p.position);
    mesh.rotation.x = p.rx;
    group.add(mesh);
  }
  for (const s of b.sleeves) {
    const variant = Math.floor(s.seed * 4);
    const mat = pool(`sleeve-${variant}`, () => new THREE.MeshStandardMaterial({ map: sleeveTexture(rng.fork(`sleeve-${variant}`)), roughness: 0.65 }));
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(s.size, s.size, 0.006), [mats.stock, mats.stock, mats.stock, mats.stock, mat, mats.stock]);
    mesh.position.set(...s.position);
    mesh.rotation.x = s.rx;
    mesh.castShadow = true;
    group.add(mesh);
  }
}

function contactShadow(group, mats, width, depth, z = depth / 2) {
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(width * 1.25, depth * 1.9), mats.contact);
  plane.rotation.x = -Math.PI / 2;
  plane.position.set(0, 0.003, z);
  plane.renderOrder = -1;
  group.add(plane);
}

/** Free spans of [x0, x1] after removing the reserved intervals. */
function freeSpans(x0, x1, reserved) {
  let spans = [[x0, x1]];
  for (const [a, z] of reserved) spans = spans.flatMap(([s, e]) => [[s, Math.min(e, a)], [Math.max(s, z), e]]).filter(([s, e]) => e - s > 0.12);
  return spans;
}

/* -- fixtures ------------------------------------------------------------------ */

/**
 * A glass vitrine in pale maple: closed base with two drawers, three glass
 * shelves and a top, stocked level by level from its theme. `reserved` lists
 * the places a product occupies ({ level, x, width }), left free of stock.
 */
export function buildVitrine({ theme = 'books', reserved = [], rng, mats }) {
  const { width: W, depth: D, height: H, side: S, base: B } = VITRINE;
  const group = new THREE.Group();
  const wood = new BoxBatch(); const dark = new BoxBatch(); const back = new BoxBatch(); const glass = new BoxBatch(); const edge = new BoxBatch(); const metal = new BoxBatch();
  const b = batches();

  dark.add([0, 0.03, D / 2], [W - 0.04, 0.06, D - 0.05], 0x8f7a5e);
  wood.add([0, 0.06 + (B - 0.06) / 2, D / 2], [W, B - 0.06, D], 0xffffff);
  // Two drawers with a reveal and a slim pull each.
  for (const dy of [0.17, 0.36]) {
    dark.add([0, dy + 0.085, D + 0.0015], [W - 0.07, 0.004, 0.003], 0xb59a74);
    metal.add([0, dy, D + 0.012], [0.16, 0.012, 0.012], 0xb8b8b4);
  }
  for (const sx of [-W / 2 + S / 2, W / 2 - S / 2]) wood.add([sx, H / 2, D / 2], [S, H, D], 0xffffff);
  wood.add([0, H - 0.025, D / 2], [W, 0.05, D + 0.01], 0xffffff);
  back.add([0, B + (H - B) / 2, 0.008], [W - 2 * S, H - B, 0.016], 0xe3ebe5);
  for (const y of LEVELS.slice(1)) {
    glass.add([0, y - GLASS / 2, D / 2], [W - 2 * S, GLASS, D - 0.02], 0xcfe6dc);
    edge.add([0, y - GLASS / 2, D - 0.012], [W - 2 * S, GLASS, 0.004], 0x9fc7b6);
  }

  const plan = THEMES[theme] || THEMES.books;
  LEVELS.forEach((y, i) => {
    const res = reserved.filter((r) => r.level === i).map((r) => [r.x - r.width / 2 - 0.03, r.x + r.width / 2 + 0.03]);
    const maxH = (i === LEVELS.length - 1 ? H - 0.05 : LEVELS[i + 1] - GLASS) - y - 0.04;
    for (const [a, z] of freeSpans(-W / 2 + S + 0.02, W / 2 - S - 0.02, res)) STOCKERS[plan[i]]?.(b, rng, a, z, y, Math.min(0.3, maxH));
  });

  for (const mesh of [
    wood.build(mats.maple, { castShadow: true }), dark.build(mats.kick), back.build(mats.back), metal.build(mats.metal),
    glass.build(mats.glass), edge.build(mats.glassEdge)
  ]) if (mesh) group.add(mesh);
  finish(group, b, mats, rng);
  contactShadow(group, mats, W, D);
  return { group };
}

/**
 * The sales counter: maple frame and top, an off-white front panel. On it,
 * from the visitor's left: the till, the card terminal, a tray of postcards and
 * coasters, a stack of books and catalogues; the telephone on the staff side.
 * (The keyring board on it is a product, built by `buildShopDisplay`.)
 */
export function buildCounter({ length = 3.0, depth = 0.7, rng, mats }) {
  const H = 0.95;
  const group = new THREE.Group();
  const wood = new BoxBatch(); const panel = new BoxBatch(); const dark = new BoxBatch(); const device = new BoxBatch(); const deviceDark = new BoxBatch(); const screen = new BoxBatch();
  const b = batches();
  const zc = depth / 2;

  dark.add([0, 0.03, zc], [length - 0.06, 0.06, depth - 0.08], 0x8f7a5e);
  wood.add([0, H - 0.025, zc + 0.02], [length + 0.04, 0.05, depth + 0.06], 0xffffff);
  for (const sx of [-length / 2 + 0.04, length / 2 - 0.04]) wood.add([sx, (H - 0.05) / 2 + 0.03, zc], [0.08, H - 0.11, depth], 0xffffff);
  panel.add([0, (H - 0.05) / 2 + 0.03, zc], [length - 0.16, H - 0.11, depth - 0.02], 0xeceae4);
  wood.add([0, 0.09, depth - 0.005], [length - 0.16, 0.05, 0.02], 0xffffff);
  wood.add([0, H - 0.08, depth - 0.005], [length - 0.16, 0.04, 0.02], 0xffffff);

  const y = H;
  // Till, as in the reference: a pale body, cash drawer, sloped keys, display tower.
  const tx = -0.45;
  device.add([tx, y + 0.07, zc], [0.42, 0.14, 0.38], 0xd8d2c4);
  deviceDark.add([tx, y + 0.045, zc + 0.191], [0.36, 0.006, 0.004], 0x5a5650);
  device.add([tx, y + 0.17, zc + 0.04], [0.36, 0.06, 0.24], 0xe2ddd0, { rx: 0.28 });
  for (let r = 0; r < 3; r += 1) {
    for (let c = 0; c < 5; c += 1) deviceDark.add([tx - 0.12 + c * 0.06, y + 0.195 + r * 0.02, zc + 0.11 - r * 0.055], [0.042, 0.012, 0.036], 0x5e6168, { rx: 0.28 });
  }
  device.add([tx, y + 0.26, zc - 0.13], [0.05, 0.12, 0.05], 0xd8d2c4);
  deviceDark.add([tx, y + 0.34, zc - 0.13], [0.2, 0.08, 0.06], 0x2a2c30);
  screen.add([tx, y + 0.34, zc - 0.098], [0.17, 0.05, 0.004], 0x0f1c1d);
  // Card terminal: dark body angled toward the visitor, screen and keys.
  const kx = 0.02;
  deviceDark.add([kx, y + 0.035, depth - 0.16], [0.09, 0.05, 0.18], 0x24262a, { rx: -0.3 });
  screen.add([kx, y + 0.066, depth - 0.2], [0.064, 0.004, 0.055], 0x0f1c1d, { rx: -0.3 });
  for (let r = 0; r < 4; r += 1) {
    for (let c = 0; c < 3; c += 1) device.add([kx - 0.022 + c * 0.022, y + 0.05 - r * 0.009, depth - 0.15 + r * 0.019], [0.016, 0.004, 0.012], 0xb9b4aa, { rx: -0.3 });
  }
  // Tray of postcards and coasters.
  const ox = 0.5;
  b.frames.add([ox, y + 0.008, zc + 0.08], [0.4, 0.016, 0.27], 0xcfb28a);
  for (const [dx, dz] of [[-0.15, 0], [0.15, 0], [0, -0.1], [0, 0.1]]) b.frames.add([ox + dx * (dz ? 0 : 1), y + 0.03, zc + 0.08 + dz * 1.25], dz ? [0.4, 0.03, 0.012] : [0.012, 0.03, 0.27], 0xb59a74);
  for (let i = 0; i < 6; i += 1) b.stock.add([ox - 0.12 + (i % 3) * 0.12, y + 0.02, zc + 0.03 + Math.floor(i / 3) * 0.1], [0.09, 0.006, 0.07], rng.pick([0xe9e1cf, 0x3f6d5a, 0x2f5a7a, 0xc58a3a, 0xa8462f, 0x1f2a30]));
  // A stack of books and catalogues at the right end.
  let sy = y;
  for (let i = 0; i < 5; i += 1) {
    const t = rng.range(0.025, 0.035);
    b.stock.add([length / 2 - 0.4, sy + t / 2, zc + 0.05], [0.3, t, 0.22], [0x3b4d5c, 0x8ea2b0, 0x2e3c48, 0xd9d3c4, 0x56697a][i], { ry: rng.range(-0.06, 0.06) });
    sy += t;
  }
  let sy2 = y;
  for (let i = 0; i < 4; i += 1) { b.stock.add([length / 2 - 0.14, sy2 + 0.01, zc + 0.12], [0.2, 0.02, 0.27], i === 3 ? 0x8ea2b0 : 0xe9e4d8, { ry: 0.04 }); sy2 += 0.02; }
  // Telephone on the staff side.
  deviceDark.add([0.68, y + 0.03, 0.12], [0.18, 0.06, 0.16], 0x2c2e33, { rx: -0.12 });
  deviceDark.add([0.63, y + 0.08, 0.12], [0.05, 0.04, 0.19], 0x24262a);
  screen.add([0.73, y + 0.064, 0.14], [0.06, 0.004, 0.035], 0x0f1c1d, { rx: -0.12 });

  for (const mesh of [
    wood.build(mats.maple, { castShadow: true }), panel.build(mats.panel), dark.build(mats.kick), device.build(mats.device),
    deviceDark.build(mats.deviceDark), screen.build(mats.screen)
  ]) if (mesh) group.add(mesh);
  finish(group, b, mats, rng);
  contactShadow(group, mats, length, depth);
  return { group };
}

/** A framed print for the wall: dark frame, pale mat, a landscape or night piece. */
export function buildWallFrame({ size = [0.9, 0.62], kind = 'landscape', rng, mats }) {
  const [w, h] = size;
  const group = new THREE.Group();
  const frame = new BoxBatch();
  frame.add([0, 0, 0.02], [w, h, 0.04], 0x3a2f26);
  frame.add([0, 0, 0.041], [w - 0.07, h - 0.07, 0.004], 0xf1ece2);
  group.add(frame.build(mats.frame, { castShadow: true }));
  const art = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.2, h - 0.2), new THREE.MeshStandardMaterial({ map: printTexture(rng, kind), roughness: 0.75 }));
  art.position.z = 0.045;
  group.add(art);
  return { group };
}

/**
 * The shop assistant behind the counter, in the reference's polo shirt, with
 * shoulder-length brown hair, one hand opened toward the counter. Set dressing:
 * she does not move or talk, and the shop says so (no hotspot, no prompt).
 */
export function buildShopAssistant({ mats }) {
  const group = new THREE.Group();
  const polo = new THREE.MeshStandardMaterial({ color: 0xe8dcc6, roughness: 0.8 });
  const trousers = new THREE.MeshStandardMaterial({ color: 0x2c3140, roughness: 0.75 });
  const hair = new THREE.MeshStandardMaterial({ color: 0x5b3a26, roughness: 0.55 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a1d17, roughness: 0.5 });
  const lips = new THREE.MeshStandardMaterial({ color: 0xb05a52, roughness: 0.5 });
  const logo = new THREE.MeshStandardMaterial({ color: 0x3f5f52, roughness: 0.6 });
  const add = (geo, mat, [x, y, z], { rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, shadow = true } = {}) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.scale.set(sx, sy, sz);
    m.castShadow = shadow; m.receiveShadow = true;
    group.add(m);
    return m;
  };

  // Legs and hips (mostly behind the counter).
  for (const x of [-0.075, 0.075]) add(new THREE.CylinderGeometry(0.06, 0.055, 0.8, 14), trousers, [x, 0.42, 0]);
  add(new THREE.CylinderGeometry(0.15, 0.14, 0.2, 20), trousers, [0, 0.88, 0], { sz: 0.72 });
  // Polo shirt: a turned torso, collar, placket and a small embroidered mark.
  const torso = [[0.142, 0.0], [0.15, 0.1], [0.146, 0.2], [0.16, 0.32], [0.178, 0.44], [0.18, 0.5], [0.15, 0.55], [0.07, 0.585], [0, 0.59]];
  add(new THREE.LatheGeometry(torso.map(([r, t]) => new THREE.Vector2(r, t)), 28), polo, [0, 0.86, 0], { sz: 0.7 });
  add(new THREE.TorusGeometry(0.058, 0.014, 8, 20), polo, [0, 1.43, 0.005], { rx: Math.PI / 2 - 0.25 });
  add(new THREE.BoxGeometry(0.03, 0.09, 0.006), new THREE.MeshStandardMaterial({ color: 0xdcd0b9, roughness: 0.8 }), [0, 1.37, 0.118], { rx: -0.12 });
  add(new THREE.BoxGeometry(0.035, 0.03, 0.006), logo, [0.075, 1.3, 0.122], { rx: -0.1, shadow: false });
  // Sleeves and arms: the right arm relaxed, the left hand opened toward the counter.
  const skinMat = mats.skin;
  for (const s of [-1, 1]) add(new THREE.CylinderGeometry(0.058, 0.064, 0.16, 16), polo, [s * 0.19, 1.31, 0], { rz: s * 0.22 });
  add(new THREE.CylinderGeometry(0.04, 0.036, 0.3, 14), skinMat, [-0.215, 1.1, 0], { rz: -0.08 });
  add(new THREE.CylinderGeometry(0.036, 0.032, 0.26, 14), skinMat, [-0.225, 0.86, 0.04], { rx: -0.3 });
  add(new THREE.CylinderGeometry(0.04, 0.036, 0.26, 14), skinMat, [0.215, 1.12, 0.02], { rz: 0.12, rx: -0.15 });
  add(new THREE.CylinderGeometry(0.036, 0.032, 0.3, 14), skinMat, [0.29, 1.02, 0.17], { rx: -1.35, rz: 0.55 });
  add(new THREE.SphereGeometry(0.05, 14, 10), skinMat, [0.36, 1.04, 0.31], { sx: 1.05, sy: 0.45, sz: 1.3, rz: 0.25 });
  add(new THREE.CapsuleGeometry(0.012, 0.035, 4, 8), skinMat, [0.31, 1.06, 0.3], { rz: 1.1, ry: 0.4 });
  // Neck, head, ears.
  add(new THREE.CylinderGeometry(0.045, 0.05, 0.1, 14), skinMat, [0, 1.47, 0]);
  add(new THREE.SphereGeometry(0.105, 32, 24), skinMat, [0, 1.585, 0.005], { sx: 0.93, sy: 1.1, sz: 0.98 });
  for (const s of [-1, 1]) add(new THREE.SphereGeometry(0.02, 10, 8), skinMat, [s * 0.097, 1.585, -0.005], { sz: 0.6 });
  // Face: eyes with a highlight, brows, nose, smile.
  for (const s of [-1, 1]) {
    add(new THREE.SphereGeometry(0.0125, 12, 10), dark, [s * 0.036, 1.6, 0.0985], { sz: 0.55, shadow: false });
    add(new THREE.SphereGeometry(0.0035, 6, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), [s * 0.036 + 0.004, 1.604, 0.1052], { shadow: false });
    add(new THREE.BoxGeometry(0.03, 0.005, 0.006), hair, [s * 0.037, 1.626, 0.0985], { rz: s * -0.12, rx: -0.3, shadow: false });
  }
  add(new THREE.SphereGeometry(0.012, 10, 8), skinMat, [0, 1.574, 0.104], { sy: 1.3, shadow: false });
  add(new THREE.TorusGeometry(0.022, 0.0045, 6, 14, Math.PI), lips, [0, 1.548, 0.099], { rz: Math.PI, rx: 0.15, shadow: false });
  // Hair: crown, back volume to the shoulders, side locks framing the face, a soft fringe.
  add(new THREE.SphereGeometry(0.114, 28, 18, 0, Math.PI * 2, 0, Math.PI * 0.42), hair, [0, 1.6, -0.004], { sx: 0.97, sy: 1.12, sz: 1.04 });
  add(new THREE.SphereGeometry(0.11, 24, 18), hair, [0, 1.53, -0.04], { sx: 1.02, sy: 1.22, sz: 0.82 });
  for (const s of [-1, 1]) add(new THREE.CapsuleGeometry(0.034, 0.17, 6, 12), hair, [s * 0.093, 1.49, 0.01], { rz: s * 0.1, sz: 0.8 });
  // The hairline: a crown tipped forward and a little to one side, so the hair
  // dips over the forehead in a side-swept fringe instead of ending in a line.
  add(new THREE.SphereGeometry(0.112, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.3), hair, [0.006, 1.6, 0.006], { rx: 0.36, rz: -0.34, sx: 0.98, sy: 1.1, sz: 1.04 });
  return { group };
}

/* -- 3D products ------------------------------------------------------------- */

/**
 * The 3D products, each in its own display: the keyring board on the counter,
 * hand-painted figures and the record stand in a vitrine. Built facing +z with
 * the base at y = 0; the Scene Kit orients it by the product's anchor.
 */
export function buildShopDisplay(display, { rng, mats }) {
  const group = new THREE.Group();
  const b = batches();
  if (display === 'keyrings') {
    // A framed board on a small easel, eight keyrings on hooks in two rows.
    const board = new BoxBatch();
    board.add([0, 0.19, 0], [0.3, 0.36, 0.025], 0xcfb28a, { rx: -0.16 });
    board.add([0, 0.19, 0.0135], [0.26, 0.32, 0.004], 0xf2eee6, { rx: -0.16 });
    board.add([0, 0.1, -0.08], [0.03, 0.2, 0.02], 0xb59a74, { rx: 0.5 });
    group.add(board.build(mats.frame, { castShadow: true }));
    const rings = new BoxBatch(); const tags = new BoxBatch();
    for (let r = 0; r < 2; r += 1) {
      for (let c = 0; c < 4; c += 1) {
        const x = -0.09 + c * 0.06; const yy = 0.29 - r * 0.15; const z = 0.025 + (0.29 - yy) * 0.16;
        rings.add([x, yy, z], [0.022, 0.022, 0.004], 0xc0c0bc);
        tags.add([x, yy - 0.045, z + 0.006], [0.034, 0.046, 0.006], PALETTE.tags[(r * 4 + c) % PALETTE.tags.length], { rz: rng.range(-0.08, 0.08) });
      }
    }
    group.add(rings.build(mats.metal, { geometry: new THREE.TorusGeometry(0.5, 0.12, 6, 16) }));
    group.add(tags.build(mats.stock));
  } else if (display === 'figurines') {
    dolls(b, rng, -0.3, 0.3, 0, 3);
    finish(group, b, mats, rng);
  } else if (display === 'records') {
    sleeves(b, rng, -0.31, 0.31, 0, 2);
    finish(group, b, mats, rng);
  }
  return { group };
}

/* -- placement ----------------------------------------------------------------- */

/** Turn a fixture's +z toward the room through the wall normal and set it on the floor. */
export function placeFixture(object, [x, z], normal, y = 0) {
  object.position.set(x, y, z);
  object.rotation.y = Math.atan2(normal[0], normal[2]);
}

/** World position of a point given in a fixture's local frame. */
export function fixtureToWorld([x, z], normal, [lx, ly, lz]) {
  const th = Math.atan2(normal[0], normal[2]);
  return [x + Math.cos(th) * lx + Math.sin(th) * lz, ly, z - Math.sin(th) * lx + Math.cos(th) * lz];
}

/** Local x and level of a world point inside a fixture (inverse of `fixtureToWorld` in plan). */
export function worldToFixture([x, z], normal, [wx, wy, wz]) {
  const th = Math.atan2(normal[0], normal[2]);
  const dx = wx - x; const dz = wz - z;
  return [Math.cos(th) * dx - Math.sin(th) * dz, wy, Math.sin(th) * dx + Math.cos(th) * dz];
}

/** Plan-view footprint (x and z extents) of a fixture `width` × `depth` against a wall with this normal. */
export function fixtureFootprint([x, z], normal, width, depth) {
  const along = Math.abs(normal[2]) > 0.5;
  const cx = x + normal[0] * depth / 2;
  const cz = z + normal[2] * depth / 2;
  return along
    ? { min: [cx - width / 2, 0, cz - depth / 2], max: [cx + width / 2, 3, cz + depth / 2] }
    : { min: [cx - depth / 2, 0, cz - width / 2], max: [cx + depth / 2, 3, cz + width / 2] };
}
