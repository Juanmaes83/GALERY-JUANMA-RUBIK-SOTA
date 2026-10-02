/**
 * Museum Scene Kit — architectural builders
 *
 * Construction order follows the img2threejs pass sequence recorded as
 * IW-REF-008 (methodology only, no code taken):
 *
 *   BLOCKOUT → STRUCTURE → FORM → MATERIAL → LIGHTING → INTERACTION
 *
 * This file covers STRUCTURE and FORM: the shell of a room, its openings, its
 * skirting and cove, and the furniture a gallery actually contains.
 *
 * Walls are solid boxes rather than planes so that a doorway has a reveal — the
 * 25 cm of wall thickness you see when you pass through it. It is a small
 * decision that separates "a room" from "four quads facing inward", which is
 * precisely the Unslop failure mode of §24.
 */

import { THREE } from '../../render/render-host.js';

export const WALL_THICKNESS = 0.26;

/**
 * @param {{
 *   size:[number,number,number], origin:[number,number,number],
 *   openings?: {wall:'NORTH'|'SOUTH'|'EAST'|'WEST', offset:number, width:number, height:number}[],
 *   materials: {wall:THREE.Material, floor:THREE.Material, ceiling:THREE.Material, skirting:THREE.Material}
 * }} spec
 * @returns {THREE.Group}
 */
export function buildRoomShell(spec) {
  const { size, origin, openings = [], materials, capCeiling = true } = spec;
  const [w, h, d] = size;
  const [ox, oy, oz] = origin;
  const group = new THREE.Group();
  group.name = 'room-shell';

  // -- floor & ceiling --------------------------------------------------------
  const floor = new THREE.Mesh(new THREE.BoxGeometry(w, 0.2, d), materials.floor);
  floor.position.set(ox, oy - 0.1, oz);
  floor.receiveShadow = true;
  group.add(floor);

  // A pitched roof supplies its own ceiling; a flat room needs a lid.
  if (capCeiling) {
    const ceiling = new THREE.Mesh(new THREE.BoxGeometry(w, 0.2, d), materials.ceiling);
    ceiling.position.set(ox, oy + h + 0.1, oz);
    ceiling.name = 'ceiling';
    group.add(ceiling);
  }

  // -- walls ------------------------------------------------------------------
  // Each wall sits *inside* its own room's footprint. Two adjacent rooms then
  // share a partition made of two leaves that meet at the boundary plane
  // without ever crossing it.
  //
  // Placing them outside the footprint instead — which is the intuitive
  // reading of "the wall is at the edge of the room" — makes each room's wall
  // stand inside its neighbour. In a two-room world both leaves are white and
  // nobody notices; the moment a dark room adjoins a light one, the dark room's
  // wall appears floating in the middle of the light one.
  const half = WALL_THICKNESS / 2 + 0.004;
  const walls = [
    { id: 'NORTH', length: w, centre: [ox, oy, oz - d / 2 + half], axis: 'x', rotation: 0 },
    { id: 'SOUTH', length: w, centre: [ox, oy, oz + d / 2 - half], axis: 'x', rotation: 0 },
    { id: 'WEST', length: d, centre: [ox - w / 2 + half, oy, oz], axis: 'z', rotation: Math.PI / 2 },
    { id: 'EAST', length: d, centre: [ox + w / 2 - half, oy, oz], axis: 'z', rotation: Math.PI / 2 }
  ];

  for (const wall of walls) {
    const wallOpenings = openings.filter((opening) => opening.wall === wall.id);
    for (const piece of wallSegments(wall.length, h, wallOpenings)) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(piece.width, piece.height, WALL_THICKNESS), materials.wall);
      const along = piece.offset;
      if (wall.axis === 'x') {
        mesh.position.set(wall.centre[0] + along, oy + piece.centreY, wall.centre[2]);
      } else {
        mesh.position.set(wall.centre[0], oy + piece.centreY, wall.centre[2] + along);
        mesh.rotation.y = wall.rotation;
      }
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      group.add(mesh);
    }

    // Skirting: a 12 cm shadow line where wall meets floor. Rooms without it
    // read as untextured boxes no matter how good the materials are.
    for (const piece of wallSegments(wall.length, 0.12, wallOpenings.map((o) => ({ ...o, height: 0.12 })))) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(piece.width, 0.12, WALL_THICKNESS + 0.04), materials.skirting);
      if (wall.axis === 'x') {
        mesh.position.set(wall.centre[0] + piece.offset, oy + 0.06, wall.centre[2]);
      } else {
        mesh.position.set(wall.centre[0], oy + 0.06, wall.centre[2] + piece.offset);
        mesh.rotation.y = wall.rotation;
      }
      group.add(mesh);
    }
  }

  return group;
}

/**
 * Split a wall of the given length into the solid pieces left after its
 * openings are removed, plus the lintel above each opening.
 * @returns {{offset:number, width:number, height:number, centreY:number}[]}
 */
function wallSegments(length, height, openings) {
  const sorted = [...openings].sort((a, b) => a.offset - b.offset);
  const pieces = [];
  let cursor = -length / 2;

  for (const opening of sorted) {
    const left = opening.offset - opening.width / 2;
    const right = opening.offset + opening.width / 2;
    if (left > cursor) {
      const width = left - cursor;
      pieces.push({ offset: cursor + width / 2, width, height, centreY: height / 2 });
    }
    const lintel = height - opening.height;
    if (lintel > 0.01) {
      pieces.push({
        offset: opening.offset,
        width: opening.width,
        height: lintel,
        centreY: opening.height + lintel / 2
      });
    }
    cursor = Math.max(cursor, right);
  }

  if (cursor < length / 2) {
    const width = length / 2 - cursor;
    pieces.push({ offset: cursor + width / 2, width, height, centreY: height / 2 });
  }
  return pieces;
}

/**
 * A pitched roof with a run of skylight bays along the ridge.
 *
 * This is the single largest quality lever in a gallery. A flat lid reads as a
 * box; a pitched roof with daylight coming through it reads as a building, and
 * it is what every serious institutional gallery in the reference set has in
 * common. The glazing is built as alternating solid ribs and glass bays in the
 * upper half of each slope, which is how a real roof light is framed — and it
 * avoids CSG entirely.
 *
 * @param {{
 *   size:[number,number,number], origin:[number,number,number],
 *   rise?:number, bays?:number, materials:Object, profile:Object
 * }} spec
 */
export function buildPitchedRoof({ size, origin, rise = 1.9, bays = 4, materials, profile }) {
  const [w, h, d] = size;
  const [ox, oy, oz] = origin;
  const group = new THREE.Group();
  group.name = 'roof';

  const halfWidth = w / 2;
  const slopeLength = Math.hypot(halfWidth, rise);
  const angle = Math.atan2(rise, halfWidth);
  const thickness = 0.16;

  const glass = new THREE.MeshBasicMaterial({
    color: new THREE.Color(profile.skylight?.color ?? 0xfffaf0)
      .multiplyScalar(profile.skylight?.intensity ?? 1)
  });

  // Where the glazing sits on the slope: a band near the ridge, never at the eave.
  const bandStart = 0.46;
  const bandEnd = 0.94;
  const margin = Math.min(1.2, d * 0.12);
  const runLength = d - margin * 2;
  const bayPitch = runLength / bays;
  const ribWidth = Math.min(0.42, bayPitch * 0.3);

  const place = (side, t0, t1, z0, z1, material, inset = 0) => {
    const mid = (t0 + t1) / 2;
    const eave = [side * halfWidth, h];
    const dirX = -side * halfWidth / slopeLength;
    const dirY = rise / slopeLength;
    const cx = eave[0] + dirX * slopeLength * mid;
    const cy = eave[1] + dirY * slopeLength * mid;

    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(slopeLength * (t1 - t0), thickness, z1 - z0),
      material
    );
    mesh.position.set(ox + cx, oy + cy - inset, oz + (z0 + z1) / 2 - d / 2);
    mesh.rotation.z = -side * angle;
    mesh.receiveShadow = true;
    group.add(mesh);
  };

  for (const side of [-1, 1]) {
    // Lower slope: solid, full depth.
    place(side, 0, bandStart, 0, d, materials.roof);
    // End returns, so the glazing band does not run into the gable walls.
    place(side, bandStart, bandEnd, 0, margin, materials.roof);
    place(side, bandStart, bandEnd, d - margin, d, materials.roof);

    for (let i = 0; i < bays; i += 1) {
      const z0 = margin + i * bayPitch;
      const z1 = z0 + bayPitch;
      // Rib between bays.
      if (i > 0) place(side, bandStart, bandEnd, z0 - ribWidth / 2, z0 + ribWidth / 2, materials.roof);
      // The glazing itself, set slightly into the roof plane.
      place(side, bandStart + 0.015, bandEnd - 0.015, z0 + ribWidth / 2, z1 - ribWidth / 2, glass, 0.02);
    }
  }

  // Ridge beam: the line the two slopes meet on.
  const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, d), materials.roof);
  ridge.position.set(ox, oy + h + rise - 0.04, oz);
  group.add(ridge);

  // Gable ends, so the room is closed above the wall head.
  for (const side of [-1, 1]) {
    const shape = new THREE.Shape();
    shape.moveTo(-halfWidth, 0);
    shape.lineTo(halfWidth, 0);
    shape.lineTo(0, rise);
    shape.closePath();
    // Double-sided: from inside the room you look at the back of this face.
    const gable = new THREE.Mesh(new THREE.ShapeGeometry(shape), materials.gable);
    gable.position.set(ox, oy + h, oz + side * (d / 2));
    gable.rotation.y = side > 0 ? 0 : Math.PI;
    gable.receiveShadow = true;
    group.add(gable);
  }

  return group;
}

/**
 * Daylight arriving through the roof lights. One soft directional source plus a
 * faint bounce, aimed to rake across the room rather than fall straight down —
 * flat overhead light is what makes a render look like a render.
 */
export function buildSkylightDaylight({ size, origin, rise, profile }) {
  const [w, h, d] = size;
  const [ox, oy, oz] = origin;
  const group = new THREE.Group();
  group.name = 'daylight';

  const key = new THREE.DirectionalLight(
    profile.skylight?.color ?? 0xfff6e6,
    profile.skylight?.daylight ?? 0.55
  );
  key.position.set(ox + w * 0.22, oy + h + rise + 4, oz - d * 0.18);
  key.target.position.set(ox - w * 0.1, oy + 1.2, oz + d * 0.1);
  group.add(key);
  group.add(key.target);

  const fill = new THREE.DirectionalLight(
    profile.skylight?.color ?? 0xfff6e6,
    (profile.skylight?.daylight ?? 0.55) * 0.4
  );
  fill.position.set(ox - w * 0.3, oy + h + rise + 3, oz + d * 0.3);
  fill.target.position.set(ox, oy + 1, oz);
  group.add(fill);
  group.add(fill.target);

  return group;
}

/**
 * Cornice: the shadow line where wall meets roof. Two millimetres of geometry
 * that stop the junction from looking like two planes intersecting.
 */
export function buildCornice({ size, origin, material }) {
  const [w, h, d] = size;
  const [ox, oy, oz] = origin;
  const group = new THREE.Group();
  group.name = 'cornice';
  const depth = 0.1;
  const height = 0.14;

  const pieces = [
    { size: [w + depth * 2, height, depth], position: [ox, oy + h - height / 2, oz - d / 2 - depth / 2] },
    { size: [w + depth * 2, height, depth], position: [ox, oy + h - height / 2, oz + d / 2 + depth / 2] },
    { size: [depth, height, d], position: [ox - w / 2 - depth / 2, oy + h - height / 2, oz] },
    { size: [depth, height, d], position: [ox + w / 2 + depth / 2, oy + h - height / 2, oz] }
  ];
  for (const piece of pieces) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...piece.size), material);
    mesh.position.set(...piece.position);
    group.add(mesh);
  }
  return group;
}

/**
 * A stanchion-and-rope barrier line: posts with a sagging rope between them,
 * standing off the hung wall.
 *
 * It is museum furniture, and it does three things at once — it sets the
 * viewing distance, it gives the floor a rhythm, and it tells the visitor
 * without any UI that the works are not to be touched. The rope sags on a
 * quadratic curve because a straight rope reads as a fence.
 *
 * @param {{from:[number,number,number], to:[number,number,number], material:Object, ropeMaterial:Object, pitch?:number}} spec
 */
export function buildBarrierLine({ from, to, material, ropeMaterial, pitch = 2.3 }) {
  const group = new THREE.Group();
  group.name = 'barrier';

  const start = new THREE.Vector3(...from);
  const end = new THREE.Vector3(...to);
  const length = start.distanceTo(end);
  if (length < 0.6) return group;

  const count = Math.max(2, Math.round(length / pitch) + 1);
  const postHeight = 0.92;
  const points = [];

  for (let i = 0; i < count; i += 1) {
    const point = start.clone().lerp(end, i / (count - 1));
    points.push(point);

    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, postHeight, 10), material);
    post.position.set(point.x, point.y + postHeight / 2, point.z);
    post.castShadow = true;
    group.add(post);

    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.035, 16), material);
    base.position.set(point.x, point.y + 0.018, point.z);
    base.castShadow = true;
    group.add(base);

    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.032, 14, 10), material);
    finial.position.set(point.x, point.y + postHeight + 0.02, point.z);
    group.add(finial);
  }

  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i].clone().setY(points[i].y + postHeight - 0.06);
    const b = points[i + 1].clone().setY(points[i + 1].y + postHeight - 0.06);
    const sag = a.clone().lerp(b, 0.5);
    sag.y -= a.distanceTo(b) * 0.055;
    const curve = new THREE.QuadraticBezierCurve3(a, sag, b);
    const rope = new THREE.Mesh(new THREE.TubeGeometry(curve, 10, 0.014, 6, false), ropeMaterial);
    rope.castShadow = true;
    group.add(rope);
  }

  return group;
}

/**
 * A cove: a recessed emissive strip near the ceiling that washes the wall.
 * It is the room's only visible light source, which is what keeps the ceiling
 * from being a flat lid.
 */
export function buildCove(size, origin, profile) {
  const [w, h, d] = size;
  const [ox, oy, oz] = origin;
  const group = new THREE.Group();
  group.name = 'cove';

  // The visible strip is dimmer than the light it stands for: a blown-out white
  // bar at the top of every room is a tell, not a lighting design.
  const material = new THREE.MeshBasicMaterial({
    color: new THREE.Color(profile.cove.color).multiplyScalar(profile.cove.emissive ?? 0.5)
  });
  const inset = 0.5;
  const strips = [
    { size: [w - inset * 2, 0.04, 0.09], position: [ox, oy + h - 0.3, oz - d / 2 + inset] },
    { size: [w - inset * 2, 0.04, 0.09], position: [ox, oy + h - 0.3, oz + d / 2 - inset] },
    { size: [0.09, 0.04, d - inset * 2], position: [ox - w / 2 + inset, oy + h - 0.3, oz] },
    { size: [0.09, 0.04, d - inset * 2], position: [ox + w / 2 - inset, oy + h - 0.3, oz] }
  ];
  for (const strip of strips) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...strip.size), material);
    mesh.position.set(...strip.position);
    group.add(mesh);
  }
  return group;
}

/**
 * A framed work: stretcher depth, a frame, an optional mat, and the plate.
 * Depth matters — a painting hanging 4 cm off a wall casts a shadow line, and
 * that shadow is most of what makes it read as an object rather than a decal.
 */
export function buildFramedWork({ size, texture, framed = true, mat = 0, frameMaterial, matMaterial }) {
  const [w, h] = size;
  const group = new THREE.Group();
  group.name = 'framed-work';

  const depth = framed ? 0.055 : 0.032;
  const plateMaterial = new THREE.MeshStandardMaterial({
    map: texture,
    roughness: framed ? 0.86 : 0.78,
    metalness: 0
  });

  // An unframed canvas is a solid body with the image on its *front* face; a
  // framed work sits inside its frame. Getting this wrong buries the painting
  // inside its own stretcher.
  //
  // A work on paper sits deeper still: it is held *behind* the window mount, so
  // its sheet drops back and the board stands in front of it.
  const plateZ = framed ? (mat > 0 ? depth * 0.42 : depth / 2 + 0.002) : depth + 0.0015;
  // With a mount, the sheet runs under the board on every side — a print whose
  // edge stops exactly at the aperture would be a decal, not a sheet of paper.
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(mat > 0 ? w - mat * 0.8 : w, mat > 0 ? h - mat * 0.8 : h),
    plateMaterial
  );
  plate.position.z = plateZ;
  plate.receiveShadow = true;
  group.add(plate);

  if (mat > 0) {
    // A window mount is an aperture, not a lid. Four bars of board leave the
    // image visible and standing 3 mm proud of it, which is where the shadow
    // line along the top of the aperture comes from.
    const board = 0.006;
    const z = plateZ + board / 2 + 0.003;
    const inner = h - mat * 2;
    const bars = [
      { size: [w, mat, board], position: [0, h / 2 - mat / 2, z] },
      { size: [w, mat, board], position: [0, -h / 2 + mat / 2, z] },
      { size: [mat, inner, board], position: [-w / 2 + mat / 2, 0, z] },
      { size: [mat, inner, board], position: [w / 2 - mat / 2, 0, z] }
    ];
    for (const part of bars) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(...part.size), matMaterial);
      mesh.position.set(...part.position);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
  }

  if (framed) {
    const bar = 0.045;
    const parts = [
      { size: [w + bar * 2, bar, depth], position: [0, h / 2 + bar / 2, depth / 2] },
      { size: [w + bar * 2, bar, depth], position: [0, -h / 2 - bar / 2, depth / 2] },
      { size: [bar, h, depth], position: [-w / 2 - bar / 2, 0, depth / 2] },
      { size: [bar, h, depth], position: [w / 2 + bar / 2, 0, depth / 2] }
    ];
    for (const part of parts) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(...part.size), frameMaterial);
      mesh.position.set(...part.position);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
  } else {
    // Unframed canvas: the stretcher edge is visible and catches the spot.
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, depth),
      new THREE.MeshStandardMaterial({ color: 0xcabfa9, roughness: 0.9 })
    );
    body.position.z = depth / 2;
    body.castShadow = true;
    group.add(body);
  }

  return group;
}

/** Display plinth for three-dimensional work. */
export function buildPlinth({ size = [0.9, 1.05, 0.9], material }) {
  const [w, h, d] = size;
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  body.position.y = h / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // A recessed reveal at the base: plinths do not sit flush on a museum floor.
  const reveal = new THREE.Mesh(new THREE.BoxGeometry(w - 0.06, 0.05, d - 0.06), material);
  reveal.position.y = 0.025;
  group.add(reveal);
  return group;
}

/**
 * A turned vessel. It is a specific object with a profile curve, chosen over a
 * primitive precisely because "meaningless cubes / generic glowing spheres" is
 * the first thing Constitution §24 rejects.
 */
export function buildVessel({ height = 0.86, material }) {
  const points = [];
  const profile = [
    [0.0, 0.0], [0.19, 0.0], [0.2, 0.03], [0.16, 0.07],
    [0.19, 0.16], [0.26, 0.34], [0.29, 0.52], [0.26, 0.7],
    [0.19, 0.83], [0.15, 0.92], [0.16, 0.97], [0.145, 1.0]
  ];
  for (const [radius, t] of profile) points.push(new THREE.Vector2(radius * height, t * height));

  // LatheGeometry already produces seam-aware normals; recomputing them here
  // would draw a visible line down the side of the pot.
  const mesh = new THREE.Mesh(new THREE.LatheGeometry(points, 72), material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * A complete, authored presentation for one collection object.  This is the
 * visual-stone version of the ordinary plinth vessel: the semantic entity and
 * its interaction stay unchanged; only the Museum kit gives it a more resolved
 * physical presence.
 */
export function buildPremiumVesselInstallation({
  height = 0.88,
  plinthHeight = 1.04,
  labelTexture: plaqueTexture,
  lightColor = 0xffe3b7
}) {
  const group = new THREE.Group();
  group.name = 'premium-vessel-installation';

  const mineral = new THREE.MeshStandardMaterial({ color: 0xd8d0c2, roughness: 0.76, metalness: 0 });
  const mineralTop = new THREE.MeshStandardMaterial({ color: 0xeee8de, roughness: 0.58, metalness: 0 });
  const graphite = new THREE.MeshStandardMaterial({ color: 0x25231f, roughness: 0.48, metalness: 0.24 });
  const bronze = new THREE.MeshPhysicalMaterial({
    color: 0x8d6d3f, roughness: 0.34, metalness: 0.72, clearcoat: 0.18, clearcoatRoughness: 0.42
  });
  const ceramic = new THREE.MeshPhysicalMaterial({
    color: 0x755744,
    roughness: 0.42,
    metalness: 0,
    clearcoat: 0.26,
    clearcoatRoughness: 0.64,
    emissive: 0x2a1308,
    emissiveIntensity: 0
  });

  const plinthWidth = 0.94;
  const plinthDepth = 0.88;
  const shadowGap = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.055, 0.76), graphite);
  shadowGap.position.y = 0.028;
  group.add(shadowGap);

  const body = new THREE.Mesh(new THREE.BoxGeometry(plinthWidth, plinthHeight - 0.08, plinthDepth), mineral);
  body.position.y = 0.055 + (plinthHeight - 0.08) / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const cap = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.055, 0.94), mineralTop);
  cap.position.y = plinthHeight - 0.0275;
  cap.castShadow = true;
  cap.receiveShadow = true;
  group.add(cap);

  const vessel = buildVessel({ height, material: ceramic });
  vessel.name = 'vasija-de-arenas';
  vessel.position.y = plinthHeight;
  group.add(vessel);

  // The dark inner lip makes the vessel read as a hollow ceramic object rather
  // than a lathed pawn. Two restrained bronze rings pick up the grazing light.
  const rimRadius = 0.145 * height;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(rimRadius, 0.012, 12, 72), bronze);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = plinthHeight + height + 0.004;
  rim.castShadow = true;
  group.add(rim);
  const mouth = new THREE.Mesh(new THREE.CircleGeometry(rimRadius - 0.012, 72), graphite);
  mouth.rotation.x = -Math.PI / 2;
  mouth.position.y = plinthHeight + height + 0.003;
  group.add(mouth);
  for (const [t, radius] of [[0.34, 0.26], [0.7, 0.26]]) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(radius * height, 0.006, 8, 72),
      bronze
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = plinthHeight + t * height;
    group.add(ring);
  }

  // A real object label: metal carrier plus a printed conservation-safe face.
  const plaqueBacking = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.205, 0.018), graphite);
  plaqueBacking.position.set(0, plinthHeight - 0.24, plinthDepth / 2 + 0.012);
  group.add(plaqueBacking);
  const plaque = buildLabel({ texture: plaqueTexture, width: 0.44 });
  plaque.position.set(0, plinthHeight - 0.24, plinthDepth / 2 + 0.023);
  group.add(plaque);

  // The proximity signal belongs to the furniture, not to a floating HUD: a
  // fine inlaid line wakes as the visitor approaches and settles in inspection.
  const signalMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xb58b50,
    emissive: 0x6a3f16,
    emissiveIntensity: 0.08,
    roughness: 0.32,
    metalness: 0.7,
    transparent: true,
    opacity: 0.16
  });
  const signal = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.012, 0.012), signalMaterial);
  signal.position.set(0, 0.105, plinthDepth / 2 + 0.009);
  group.add(signal);

  // Local exhibition lighting. It is deliberately shadowless: grounding comes
  // from the room/contact pass and this keeps the mobile shadow budget intact.
  const keyLight = new THREE.SpotLight(lightColor, 2.7, 6.5, 0.34, 0.78, 1.55);
  keyLight.position.set(1.15, 2.75, 1.35);
  keyLight.target.position.set(0, plinthHeight + height * 0.5, 0);
  group.add(keyLight, keyLight.target);
  const fillLight = new THREE.PointLight(0xb98052, 0.16, 2.4, 1.7);
  fillLight.position.set(-0.72, plinthHeight + 0.72, 0.42);
  group.add(fillLight);

  return {
    group,
    presentation: {
      ceramic,
      signalMaterial,
      keyLight,
      fillLight,
      nearTarget: 0,
      near: 0,
      focusTarget: 0,
      focus: 0
    }
  };
}

/**
 * A real GLB exhibit on the P02 cylindrical pedestal family. The caller hands
 * in a parsed model; asset lookup and loading stay outside the visual builder.
 * If loading failed, a deliberately simple authored silhouette keeps the room,
 * collision and interaction available without pretending to be the source.
 */
export function buildGlbSculptureInstallation({
  model = null,
  height = 0.92,
  plinthHeight = 1.0,
  labelTexture: plaqueTexture,
  lightColor = 0xffe3b7
}) {
  const group = new THREE.Group();
  group.name = 'glb-sculpture-installation';

  const mineral = new THREE.MeshStandardMaterial({ color: 0xcac2b5, roughness: 0.7, metalness: 0 });
  const mineralTop = new THREE.MeshStandardMaterial({ color: 0xe8e1d6, roughness: 0.52, metalness: 0 });
  const graphite = new THREE.MeshStandardMaterial({ color: 0x24221f, roughness: 0.44, metalness: 0.32 });

  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.39, 0.42, 0.065, 64), graphite);
  foot.position.y = 0.0325;
  foot.receiveShadow = true;
  group.add(foot);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.38, plinthHeight - 0.09, 64), mineral);
  body.position.y = 0.065 + (plinthHeight - 0.09) / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.415, 0.385, 0.055, 64), mineralTop);
  cap.position.y = plinthHeight - 0.0275;
  cap.castShadow = true;
  cap.receiveShadow = true;
  group.add(cap);

  const sculpture = model || buildBustFallback();
  sculpture.name = model ? 'marble-bust-01-glb' : 'marble-bust-01-fallback';
  normalizeFloorModel(sculpture, height, plinthHeight);
  group.add(sculpture);

  const responsiveMaterials = [];
  sculpture.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      if (!material) continue;
      if (material.emissive) {
        material.emissive.set(0x2b1b10);
        material.emissiveIntensity = 0;
        responsiveMaterials.push(material);
      }
    }
  });

  const plaqueBacking = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.205, 0.018), graphite);
  plaqueBacking.position.set(0, plinthHeight - 0.24, 0.392);
  group.add(plaqueBacking);
  const plaque = buildLabel({ texture: plaqueTexture, width: 0.46 });
  plaque.position.set(0, plinthHeight - 0.24, 0.404);
  group.add(plaque);

  const signalMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xa98551,
    emissive: 0x65401b,
    emissiveIntensity: 0.06,
    roughness: 0.3,
    metalness: 0.74,
    transparent: true,
    opacity: 0.13
  });
  const signal = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.012, 0.012), signalMaterial);
  signal.position.set(0, 0.12, 0.386);
  group.add(signal);

  const keyLight = new THREE.SpotLight(lightColor, 2.9, 6.5, 0.31, 0.82, 1.55);
  keyLight.position.set(-1.1, 2.85, 1.25);
  keyLight.target.position.set(0, plinthHeight + height * 0.52, 0);
  group.add(keyLight, keyLight.target);
  const fillLight = new THREE.PointLight(0xb58a62, 0.14, 2.2, 1.8);
  fillLight.position.set(0.7, plinthHeight + height * 0.62, 0.35);
  group.add(fillLight);

  return {
    group,
    presentation: {
      materials: responsiveMaterials,
      signalMaterial,
      keyLight,
      fillLight,
      baseKeyIntensity: 2.9,
      baseFillIntensity: 0.14,
      nearTarget: 0,
      near: 0,
      focusTarget: 0,
      focus: 0,
      assetStatus: model ? 'GLB' : 'FALLBACK'
    }
  };
}

function normalizeFloorModel(model, targetHeight, floorY) {
  model.updateMatrixWorld(true);
  const initial = new THREE.Box3().setFromObject(model);
  const sourceHeight = Math.max(initial.max.y - initial.min.y, 0.001);
  model.scale.multiplyScalar(targetHeight / sourceHeight);
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y += floorY - box.min.y;
}

function buildBustFallback() {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color: 0xbdb6aa, roughness: 0.82, metalness: 0 });
  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.28, 28, 18), material);
  torso.scale.set(1.25, 0.72, 0.7);
  torso.position.y = 0.22;
  group.add(torso);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.17, 24), material);
  neck.position.y = 0.48;
  group.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 28, 20), material);
  head.scale.set(0.82, 1.12, 0.88);
  head.position.y = 0.65;
  group.add(head);
  return group;
}

/** Wall label, mounted at the standard 8 cm to the right of a work. */
export function buildLabel({ texture, width = 0.22 }) {
  const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.92, metalness: 0 });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, width * 0.62), material);
  mesh.position.z = 0.004;
  return mesh;
}

/** Gallery bench — scale reference and an invitation to stop and look. */
export function buildBench({ length = 1.8, material }) {
  const group = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(length, 0.08, 0.42), material);
  top.position.y = 0.44;
  top.castShadow = true;
  top.receiveShadow = true;
  group.add(top);
  for (const x of [-length / 2 + 0.18, length / 2 - 0.18]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.44, 0.34), material);
    leg.position.set(x, 0.22, 0);
    leg.castShadow = true;
    group.add(leg);
  }
  return group;
}

/**
 * Threshold inlay: a change of floor material in a doorway. Small, but it is
 * how a real building tells you that you are crossing from one room to another
 * — a Portal's representation without a single glowing particle.
 */
export function buildThreshold({ width, material }) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, 0.02, WALL_THICKNESS + 0.1), material);
  mesh.position.y = 0.01;
  mesh.receiveShadow = true;
  return mesh;
}

/** Recursively release everything a Space owns. */
export function disposeObject(root) {
  const textures = new Set();
  root.traverse((node) => {
    if (node.geometry) node.geometry.dispose();
    const materials = Array.isArray(node.material) ? node.material : node.material ? [node.material] : [];
    for (const material of materials) {
      for (const key of ['map', 'normalMap', 'roughnessMap', 'aoMap', 'emissiveMap']) {
        if (material[key]) textures.add(material[key]);
      }
      material.dispose();
    }
  });
  for (const texture of textures) texture.dispose();
  root.clear?.();
}

/**
 * A projection: media as light thrown onto an architectural surface.
 *
 * The source technology solved this in the DOM with one hardcoded `matrix3d`
 * lifted from a specific photograph, because it had no real wall and no real
 * camera — it had to fake the perspective. We have both, so the geometry
 * problem simply does not exist here and none of that transform survives.
 *
 * What does survive is the source's compositing recipe, which is the part that
 * actually made it convincing:
 *
 *   media in `screen` blend   →  additive blending onto the wall
 *   media at low opacity      →  intensity below the wall's own white
 *   blurred radial spill      →  a halo plane plus one real light
 *   masked floor reflection   →  a faded, mirrored copy on the floor
 *   text as its own layer     →  a second additive plane on the same surface
 *
 * The one thing the source never needed and we cannot do without is the *edge*.
 * A CSS element ends where its box ends and nobody questions it; a rectangle of
 * light in a dark room reads instantly as a screen. The feathered alpha mask is
 * what makes it read as a beam.
 *
 * @param {{
 *   size:[number,number], texture:THREE.Texture, mask:THREE.Texture,
 *   textTexture?:THREE.Texture, intensity?:number, spill?:number,
 *   reflection?:number, keystone?:number, tint?:number
 * }} spec
 */
export function buildProjection(spec) {
  const {
    size, texture, mask, floorMask = null, textTexture = null,
    intensity = 1, spill = 1, reflection = 0.5, keystone = 0.035, tint = 0xffffff
  } = spec;
  const [w, h] = size;
  const group = new THREE.Group();
  group.name = 'projection';

  // Keystone: a projector is never exactly perpendicular to what it lights, so
  // the field is slightly wider at the top. Small enough to read as physics
  // rather than as an effect, and it is geometry on the wall, so it holds from
  // every viewpoint instead of only from a chosen one.
  const field = new THREE.PlaneGeometry(w, h, 1, 1);
  const position = field.attributes.position;
  for (let i = 0; i < position.count; i += 1) {
    if (position.getY(i) > 0) position.setX(i, position.getX(i) * (1 + keystone));
  }
  position.needsUpdate = true;

  const light = new THREE.Mesh(field, new THREE.MeshBasicMaterial({
    map: texture,
    alphaMap: mask,
    color: new THREE.Color(tint).multiplyScalar(intensity),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: true
  }));
  // Flush with the plaster. There is no object here: nothing stands off the
  // wall, nothing casts a shadow, nothing has a frame. That absence is the
  // whole difference between a projection and a screen.
  light.position.z = 0.006;
  group.add(light);

  // Halo: the wall around the field picks up scattered light. Wider than the
  // field, far dimmer, and carrying no image — just the glow. Kept close to the
  // field on purpose: a halo wide enough to reach the ceiling stops reading as
  // spill from a beam and starts reading as room lighting, which erases the
  // only thing that makes this a projection — that the wall is dark and one
  // part of it is not.
  const halo = new THREE.Mesh(
    new THREE.PlaneGeometry(w * 1.42, h * 1.25),
    new THREE.MeshBasicMaterial({
      map: mask,
      color: new THREE.Color(tint).multiplyScalar(0.11 * spill),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: true
    })
  );
  halo.position.z = 0.004;
  group.add(halo);

  // The floor takes the throw. Mirrored, crushed and feathered — a real
  // reflection on a matte museum floor is a suggestion, not a copy. It runs
  // from the skirting outwards and dies before it reaches the visitor, which is
  // why it uses its own ramp rather than the field's centred mask.
  if (reflection > 0.01 && floorMask) {
    const reach = h * 1.15;
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(w * 1.08, reach),
      new THREE.MeshBasicMaterial({
        map: texture,
        alphaMap: floorMask,
        color: new THREE.Color(tint).multiplyScalar(0.34 * reflection),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: true
      })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.scale.y = -1;                       // mirrored, as a reflection is
    floor.position.z = reach / 2;             // starts at the wall, runs outward
    group.add(floor);
    group.userData.reflection = floor;
  }

  // Text on the same surface, sharing its light and its keystone.
  if (textTexture) {
    const caption = new THREE.Mesh(field.clone(), new THREE.MeshBasicMaterial({
      map: textTexture,
      color: new THREE.Color(tint).multiplyScalar(intensity * 0.85),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: true
    }));
    caption.position.z = 0.008;
    group.add(caption);
  }

  return group;
}
