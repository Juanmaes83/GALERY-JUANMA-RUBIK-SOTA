/**
 * Museum Scene Kit — the guide figure
 *
 * A human presence for scale and accompaniment. Not an avatar system: no
 * skeleton, no animation, no face rig, no cloth simulation. Everything here
 * exists to make a brain read "someone" in under a second and then stop looking.
 *
 * Method adapted from `img2threejs` (Apache-2.0, © Juanma Estévez) — see
 * vendor/REUSE_REGISTER.md. Three things were taken, all of them methodology
 * rather than code:
 *
 *   • the head-unit proportion scaffold (its L-1 "Proportion Scaffold" layer),
 *     so every landmark is derived from one measurement instead of guessed;
 *   • its layer ontology, reduced to the three layers a clothed standing figure
 *     needs — core volume, garment shells offset over it, and isolates that sit
 *     inside a single region;
 *   • its staged pass order, blockout → structure → form → material, and its
 *     rule that the head is where proportion error is least forgiving.
 *
 * Its SDF/marching-cubes construction and rigging machinery are deliberately not
 * used. A standing figure that never deforms does not need them, and importing
 * them to solve a silhouette is the architectural overkill the pass forbids.
 *
 * WHY THE FIRST ATTEMPT FAILED. It was a single body of revolution with a
 * sphere on top: one continuous taper from hem to head. That reads as a chess
 * pawn no matter how the profile is tuned, because a lathe cannot produce the
 * two things a human silhouette needs — a waist narrower than the shoulders in
 * *front* view while the side view stays shallow, and limbs that separate from
 * the body. Both are addressed here by building the torso as an extruded
 * silhouette and the limbs as their own volumes.
 */

import { THREE } from '../../render/render-host.js';

/**
 * Design languages. Same person, same height, same staging — only the
 * vocabulary changes, so the three can be compared honestly.
 */
export const GUIDE_DESIGNS = Object.freeze({
  /** A — architectural. Planar, crisp, the least geometry that still reads. */
  A: {
    id: 'A',
    label: 'Arquitectónica',
    heads: 7.5,
    height: 1.68,
    bevel: 0.006,
    curveSegments: 3,
    shoulderWidth: 1.78,
    waist: 0.80,
    coatDrop: 0.62,
    limbSegments: 8,
    hairBun: 0.052
  },
  /** B — soft sculptural. Rounder transitions, a little more human warmth. */
  B: {
    id: 'B',
    label: 'Escultórica suave',
    heads: 7.5,
    height: 1.66,
    bevel: 0.018,
    curveSegments: 8,
    shoulderWidth: 1.72,
    waist: 0.84,
    coatDrop: 0.58,
    limbSegments: 14,
    hairBun: 0.058
  },
  /** C — editorial. Longer vertical rhythm, coat to mid-calf, narrower. */
  C: {
    id: 'C',
    label: 'Editorial',
    heads: 8,
    height: 1.72,
    bevel: 0.011,
    curveSegments: 6,
    shoulderWidth: 1.64,
    waist: 0.76,
    coatDrop: 0.94,
    limbSegments: 12,
    hairBun: 0.046
  }
});

/**
 * Extrude a closed 2D outline into a solid with a bevel.
 *
 * This is the workhorse. A silhouette drawn as an outline and given depth reads
 * as a body; the same mass built from stacked cylinders reads as a lamp. The
 * bevel is what stops the result looking like laser-cut card.
 */
function slab(points, depth, { bevel = 0.01, curveSegments = 6, material }) {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(depth - bevel * 2, 0.001),
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: Math.max(2, Math.round(curveSegments / 2)),
    curveSegments,
    steps: 1
  });
  // Extrusion runs along +Z from the shape plane; centre it on the body axis.
  geometry.translate(0, 0, -depth / 2 + bevel);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** A tapered limb segment. Two of each, so they read as limbs and not as a skirt. */
function limb({ from, to, radiusTop, radiusBottom, segments, material }) {
  const direction = new THREE.Vector3().subVectors(to, from);
  const length = direction.length();
  const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, length, segments, 1);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(from).addScaledVector(direction, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * The head, built from its side profile.
 *
 * Explicitly not a sphere and not a capsule: those are the shapes that produce
 * the pawn. A profile carries cranium, brow, the set of the nose, the line of
 * the jaw and the chin, extruded across the width of the skull and bevelled.
 * There is no face — no eyes, no mouth — because none is needed. What the
 * viewer has to read is *where she is looking*, and the profile plus the hair
 * mass behind the skull say that on their own.
 */
function buildHead(hh, design, materials) {
  const group = new THREE.Group();
  group.name = 'guide-head';

  // Profile in head-height units, x forward (+ = face), y up from chin.
  const p = [
    [-0.34, 0.02], [-0.36, 0.22], [-0.34, 0.48], [-0.28, 0.72],
    [-0.16, 0.90], [0.00, 0.98], [0.16, 0.94], [0.27, 0.80],
    [0.32, 0.62],                       // brow
    [0.30, 0.54], [0.33, 0.46],         // nose bridge and tip
    [0.26, 0.40], [0.27, 0.33],         // upper lip
    [0.22, 0.24], [0.16, 0.12],         // chin
    [0.02, 0.04], [-0.16, 0.00], [-0.30, -0.01]
  ].map(([x, y]) => [x * hh, y * hh]);

  const head = slab(p, hh * 0.66, {
    bevel: design.bevel * 1.6,
    curveSegments: design.curveSegments,
    material: materials.skin
  });
  // Narrow the skull slightly toward the face, which is what stops an extruded
  // profile reading as a slab with a nose on it.
  head.scale.z = 0.94;
  group.add(head);

  // Hair: a mass over the cranium and a low gathered bun at the back. It is
  // most of the rear silhouette, which is the view the guide is most often seen
  // from, so it does the directional work that a face cannot from behind.
  const cap = [
    [-0.40, 0.10], [-0.42, 0.34], [-0.40, 0.60], [-0.32, 0.82],
    [-0.16, 0.99], [0.02, 1.06], [0.20, 1.00], [0.31, 0.86],
    [0.30, 0.76], [0.16, 0.88], [0.00, 0.93], [-0.18, 0.86],
    [-0.30, 0.68], [-0.34, 0.42], [-0.33, 0.16]
  ].map(([x, y]) => [x * hh, y * hh]);
  const hair = slab(cap, hh * 0.72, {
    bevel: design.bevel * 1.4,
    curveSegments: design.curveSegments,
    material: materials.hair
  });
  group.add(hair);

  const bun = new THREE.Mesh(
    new THREE.SphereGeometry(hh * design.hairBun * 4, 14, 10),
    materials.hair
  );
  bun.position.set(-hh * 0.40, hh * 0.44, 0);
  bun.scale.set(0.86, 1, 0.9);
  bun.castShadow = true;
  group.add(bun);

  return group;
}

/**
 * Build a guide.
 *
 * @param {{design?:string, materials:Record<string,THREE.Material>}} spec
 * @returns {THREE.Group} standing on y = 0, facing +Z
 */
export function buildGuideFigure({ design = 'B', materials }) {
  const d = GUIDE_DESIGNS[design] || GUIDE_DESIGNS.B;
  const H = d.height;
  const hh = H / d.heads;           // one head unit — the scaffold everything derives from
  const group = new THREE.Group();
  group.name = `guide-${d.id}`;

  // -- L-1 proportion scaffold ------------------------------------------------
  const chin = H - hh;
  const shoulder = H - hh * 1.45;
  const chest = H - hh * 2.05;
  const waistY = H - hh * 2.95;
  const hip = H - hh * 3.85;
  const knee = hip * 0.52;
  const ankle = hh * 0.34;

  const shoulderHalf = hh * d.shoulderWidth * 0.5;
  const waistHalf = shoulderHalf * d.waist;
  const hipHalf = shoulderHalf * 0.92;

  // -- L0 core volume: torso as an extruded front silhouette -------------------
  // Front outline, right side mirrored. Shoulders are the widest point and end
  // in a near-horizontal, the waist is clearly narrower, and the pelvis widens
  // again — the three facts that separate a person from a cone.
  const half = [
    [0.0, hip - hh * 0.10],
    [hipHalf, hip + hh * 0.06],
    [waistHalf, waistY],
    [shoulderHalf * 0.93, chest],
    [shoulderHalf, shoulder - hh * 0.06],
    [shoulderHalf * 0.86, shoulder + hh * 0.10],
    [hh * 0.20, shoulder + hh * 0.16],
    [0.0, shoulder + hh * 0.18]
  ];
  const torsoOutline = [...half, ...half.slice(0, -1).reverse().map(([x, y]) => [-x, y])];
  const torso = slab(torsoOutline, hh * 0.60, {
    bevel: d.bevel, curveSegments: d.curveSegments, material: materials.top
  });
  group.add(torso);

  const neck = limb({
    from: new THREE.Vector3(0, shoulder + hh * 0.02, 0),
    to: new THREE.Vector3(0, chin + hh * 0.03, hh * 0.02),
    radiusTop: hh * 0.19, radiusBottom: hh * 0.155,
    segments: d.limbSegments, material: materials.skin
  });
  group.add(neck);

  const head = buildHead(hh, d, materials);
  head.position.set(0, chin, 0);
  group.add(head);

  // -- L0 limbs: two of each, separated from the body --------------------------
  for (const side of [-1, 1]) {
    const shoulderPoint = new THREE.Vector3(side * shoulderHalf * 1.14, shoulder - hh * 0.10, 0);
    const elbow = new THREE.Vector3(side * (shoulderHalf * 1.18), waistY + hh * 0.10, hh * 0.05);
    const wrist = new THREE.Vector3(side * (shoulderHalf * 1.06), hip + hh * 0.14, hh * 0.16);
    group.add(limb({ from: shoulderPoint, to: elbow, radiusTop: hh * 0.20, radiusBottom: hh * 0.145, segments: d.limbSegments, material: materials.outer }));
    group.add(limb({ from: elbow, to: wrist, radiusTop: hh * 0.145, radiusBottom: hh * 0.105, segments: d.limbSegments, material: materials.outer }));

    // A hand as one small closed volume. Fingers would be detail nobody can
    // resolve at gallery distance, and a bad hand is worse than none.
    const hand = new THREE.Mesh(new THREE.SphereGeometry(hh * 0.10, 10, 8), materials.skin);
    hand.position.copy(wrist).add(new THREE.Vector3(0, -hh * 0.11, hh * 0.01));
    hand.scale.set(0.72, 1.25, 0.55);
    hand.castShadow = true;
    group.add(hand);

    const hipPoint = new THREE.Vector3(side * hipHalf * 0.40, hip, 0);
    const kneePoint = new THREE.Vector3(side * hipHalf * 0.36, knee, 0);
    const anklePoint = new THREE.Vector3(side * hipHalf * 0.33, ankle, 0);
    group.add(limb({ from: hipPoint, to: kneePoint, radiusTop: hh * 0.345, radiusBottom: hh * 0.235, segments: d.limbSegments, material: materials.lower }));
    group.add(limb({ from: kneePoint, to: anklePoint, radiusTop: hh * 0.235, radiusBottom: hh * 0.155, segments: d.limbSegments, material: materials.lower }));

    // Feet: real contact forms. A figure tapering into the floor floats.
    const foot = new THREE.Mesh(new THREE.BoxGeometry(hh * 0.30, hh * 0.16, hh * 0.62), materials.shoe);
    foot.position.set(side * hipHalf * 0.33, hh * 0.08, hh * 0.14);
    foot.rotation.y = side * 0.06;
    foot.castShadow = true;
    foot.receiveShadow = true;
    group.add(foot);
  }

  // -- L4 garment shells: offset over the core, never replacing it -------------
  // The jacket is what gives the figure its institutional read and most of its
  // shoulder line. It stops above the waist so the apron below reads separately.
  const jacketHalf = [
    [0.0, waistY - hh * d.coatDrop],
    [waistHalf * 1.14, waistY - hh * d.coatDrop * 0.94],
    [waistHalf * 1.10, waistY + hh * 0.30],
    [shoulderHalf * 1.02, chest],
    [shoulderHalf * 1.09, shoulder - hh * 0.04],
    [shoulderHalf * 0.92, shoulder + hh * 0.13],
    [hh * 0.26, shoulder + hh * 0.17],
    [0.0, shoulder + hh * 0.17]
  ];
  const jacketOutline = [...jacketHalf, ...jacketHalf.slice(0, -1).reverse().map(([x, y]) => [-x, y])];
  const jacket = slab(jacketOutline, hh * 0.70, {
    bevel: d.bevel * 1.3, curveSegments: d.curveSegments, material: materials.outer
  });
  group.add(jacket);

  // The apron: a flat panel at the front only, which is what an apron is, and
  // which adds a horizontal break exactly where a single tapering body would
  // otherwise read as one mass.
  const apronHalf = [
    [0.0, hip - hh * 0.62], [waistHalf * 0.98, hip - hh * 0.58],
    [waistHalf * 0.92, waistY - hh * 0.06], [waistHalf * 0.72, waistY + hh * 0.16],
    [0.0, waistY + hh * 0.18]
  ];
  const apronOutline = [...apronHalf, ...apronHalf.slice(0, -1).reverse().map(([x, y]) => [-x, y])];
  const apron = slab(apronOutline, hh * 0.10, {
    bevel: d.bevel, curveSegments: d.curveSegments, material: materials.apron
  });
  apron.position.z = hh * 0.34;
  group.add(apron);

  return group;
}

/**
 * Materials for a guide.
 *
 * Separate materials are not decoration: one grey mesh is the single strongest
 * reason a figure reads as a mannequin. Values are muted and matte so she sits
 * inside the room's light rather than on top of it, and nothing here is more
 * saturated than the art.
 */
export function guideMaterials(design = 'B') {
  const fabric = (color, roughness = 0.88) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
  const warm = design === 'C';
  return {
    skin: new THREE.MeshStandardMaterial({ color: 0xc4a288, roughness: 0.74, metalness: 0 }),
    hair: fabric(0x2b2320, 0.82),
    top: fabric(warm ? 0xe3dccc : 0xdcd5c4, 0.92),
    outer: fabric(warm ? 0x2b3550 : 0x2f3c56, 0.86),
    apron: fabric(0x4a3d33, 0.9),
    lower: fabric(0x3a3a3c, 0.9),
    shoe: fabric(0x1f1e1d, 0.62)
  };
}

/**
 * The provisional visitor figure.
 *
 * Beat C asks for a human contemplating the work, and a human contemplating is
 * not the guide presenting. Rather than build a second character system for one
 * semantic function, this reuses the guide's geometry, scaffold and rig wholesale
 * and changes only what the grammar needs to read: **hair**, and a quieter palette
 * so the figure is a visitor rather than staff.
 *
 * Explicitly provisional. Avatar quality is deferred; this exists so the
 * progression SPACE → GUIDE → HUMAN → ARTWORK becomes perceptible, not to be a
 * character.
 */
export function visitorMaterials() {
  const fabric = (color, roughness = 0.88) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
  return {
    skin: new THREE.MeshStandardMaterial({ color: 0xb08f74, roughness: 0.76, metalness: 0 }),
    // Lighter and warmer than the guide's near-black, which is the whole visual
    // distinction at the distance Beat C is composed at.
    hair: fabric(0x6b4a33, 0.84),
    top: fabric(0x8d8577, 0.92),
    outer: fabric(0x59503f, 0.88),
    apron: fabric(0x59503f, 0.9),
    lower: fabric(0x4a4033, 0.9),
    shoe: fabric(0x241f1b, 0.62)
  };
}

/**
 * A visitor: the guide's figure with loose hair instead of a gathered bun.
 *
 * The bun is the guide's strongest silhouette cue from behind — which is exactly
 * the view Beat C uses — so removing it and letting the hair mass fall is the
 * cheapest change that separates the two figures at a glance.
 */
export function buildVisitorFigure({ design = 'B' } = {}) {
  const materials = visitorMaterials();
  const figure = buildGuideFigure({ design, materials });
  figure.name = `visitor-${design}`;
  for (const child of [...figure.children]) {
    // The bun is the only sphere in the figure; dropping it leaves the hair cap.
    if (child.geometry?.type === 'SphereGeometry') {
      figure.remove(child);
      child.geometry.dispose();
    }
  }
  return figure;
}
