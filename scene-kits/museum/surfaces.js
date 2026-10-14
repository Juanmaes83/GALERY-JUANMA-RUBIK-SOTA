/**
 * Museum Scene Kit — floor finishes (Misión Visual)
 *
 * Each room gets a floor with a material a visitor can name from the doorway:
 * limestone slabs, wide oak boards, troweled concrete, terrazzo, smoked oak,
 * basket-weave parquet. A floor is the largest surface in every view, and a
 * flat-tinted one is most of why a room reads as a blockout.
 *
 * The finishes are drawn with the canvas 2D API (floor-canvas.js) when a room
 * is built, like the original floor texture: a colour map plus one greyscale
 * relief map that serves as both roughnessMap and bumpMap — the same pairing,
 * and the same per-pixel shading features, the original floor used, with one
 * texture added. Scale is physical: a texture covers `tile` metres of floor.
 *
 * History (docs/MISION-VISUAL.md): a per-pixel generator with separate colour,
 * roughness and normal maps, run in a Web Worker, measured as a start-up and
 * doorway regression on the software rasteriser (its work competed with
 * rendering for the CPU). Drawing costs ≈8× less and needs no worker.
 */

import { THREE } from '../../render/render-host.js';
import { drawFloor, FINISH_SPEC } from './floor-canvas.js';

/** Which finish each room is laid with. A room's character, not a uniform. */
const ROOM_FINISH = {
  'space.lobby': 'limestone',
  'space.gallery-a': 'oak',
  'space.itinerant-wet-paint': 'concrete',
  'space.shop': 'terrazzo',
  'space.gallery-b': 'smoked-oak',
  'space.archive': 'parquet'
};

/** A room added later still gets a floor that suits its profile. */
const PROFILE_FINISH = {
  'white-cube': 'concrete',
  'dark-exhibition': 'smoked-oak',
  heritage: 'parquet'
};

export function floorFinishFor(space) {
  return ROOM_FINISH[space.id] || PROFILE_FINISH[space.sceneProfile] || 'concrete';
}

/** Mean grey of the relief canvases: roughness is scaled so it averages to the finish's value. */
const RELIEF_MEAN = 145 / 255;

/** QA: finishes built in this session (all are complete as soon as they exist). */
const built = new Set();
export function floorStatus() { return Object.fromEntries([...built].map((f) => [f, 'full'])); }
export function pendingFloorSurfaces() { return 0; }
export function pendingFloorPreviews() { return 0; }

/**
 * Draw a room's floor now. `bind` gives a material the maps (each binding gets
 * its own texture objects over the same canvases, so repeat/offset can differ).
 *
 * @param {import('../../engine/core/rng.js').DeterministicRNG} rng
 * @param {string} finishName
 * @param {{texelsPerMetre:number}} options
 */
export function requestFloorSurface(rng, finishName, { texelsPerMetre = 427 } = {}) {
  const floor = drawFloor(rng, finishName, { texelsPerMetre });
  built.add(floor.finish);
  const source = { map: floor.colour, roughnessMap: floor.relief, bumpMap: floor.relief };
  return {
    finish: floor.finish,
    tile: floor.tile,
    roughness: Math.min(1, FINISH_SPEC[floor.finish].roughness / RELIEF_MEAN),
    bumpScale: floor.bump,
    /**
     * @param {THREE.Material} material
     * @param {(t:THREE.Texture, slot:string)=>void} [configure]
     * @param {string[]} [slots]
     */
    bind(material, configure, slots = ['map', 'roughnessMap', 'bumpMap']) {
      // One texture per canvas per binding: roughnessMap and bumpMap share the
      // relief texture, so it is uploaded once, as the original floor did.
      const local = new Map();
      for (const slot of slots) {
        const canvas = source[slot];
        let t = local.get(canvas);
        if (!t) {
          t = new THREE.CanvasTexture(canvas);
          t.wrapS = t.wrapT = THREE.RepeatWrapping;
          t.colorSpace = slot === 'map' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
          configure?.(t, slot);
          local.set(canvas, t);
        }
        material[slot] = t;
      }
    }
  };
}
