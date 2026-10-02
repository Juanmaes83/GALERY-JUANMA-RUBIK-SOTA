/**
 * Museum Scene Kit — visual profiles
 *
 * The same semantic Space data is realized differently depending on its
 * `sceneProfile`. This file is the proof of Constitution §30: three profiles on
 * one architecture, not three museums.
 *
 * Art direction notes (Unslop §24 — these are choices, not defaults):
 *   • Surfaces are warm neutrals, never pure #ffffff or #000000. A gallery wall
 *     is plaster, and plaster has a temperature.
 *   • Light has a direction and a hierarchy: the works are the brightest thing
 *     in the room, and the wall between them falls away. "Identical lighting
 *     everywhere" is on the reject list.
 *   • No emissive accent colour anywhere. The only saturated colour in the
 *     rooms is the art itself.
 *   • Floors are dielectric. `metalness` on a stone or timber floor is not a
 *     subtle polish, it is a mirror at grazing angles: looking down a room the
 *     whole floor turned into one blown reflection of the ceiling light. The
 *     sheen a museum floor does have comes from roughness alone.
 *
 * Intensities are tuned for three.js physical lighting: spot values are
 * candela and fall off with distance, so they are small numbers next to the
 * hemisphere fill, which is not distance-based. They were set by looking at
 * captures, not by guessing — see qa/ evidence.
 */

export const PROFILES = {
  /** Contemporary white cube. Daylight-neutral cove wash, tight track spots. */
  'white-cube': {
    wall: { color: 0xd6d0c4, roughness: 0.95 },
    floor: { color: 0xa79e90, roughness: 0.62, metalness: 0 },
    ceiling: { color: 0xdedacf, roughness: 0.97 },
    skirting: { color: 0xb2ab9c, roughness: 0.72 },
    cove: { color: 0xfff2dd, intensity: 2.6, emissive: 0.55 },
    ambient: { sky: 0xe8e2d6, ground: 0x8c8478, intensity: 0.34 },
    spot: { color: 0xfff0d8, intensity: 2.8, angle: 0.42, penumbra: 0.72, decay: 1.5, distance: 9 },
    // A top-lit nave. The roof lights are the room's daylight and the reason a
    // white cube reads as a building rather than as a box.
    roof: { profile: 'pitched-skylight', rise: 1.9, bays: 4 },
    skylight: { color: 0xfffaf2, intensity: 1, daylight: 0.7 },
    barrier: { enabled: true, mode: 'primary-wall', standoff: 1.95, post: 0x2b2823, rope: 0x8d8477 },
    envIntensity: 0.35,
    exposure: 0.95,
    background: 0x171614,
    fog: null
  },

  /** Low-light room for light-sensitive works. Contrast comes from the spots. */
  'dark-exhibition': {
    wall: { color: 0x211e1b, roughness: 0.97 },
    floor: { color: 0x16140f, roughness: 0.58, metalness: 0 },
    ceiling: { color: 0x100f0e, roughness: 0.98 },
    skirting: { color: 0x191714, roughness: 0.8 },
    cove: { color: 0xffe4b8, intensity: 1.5, emissive: 0.3 },
    ambient: { sky: 0x272320, ground: 0x0d0c0b, intensity: 0.22 },
    spot: { color: 0xffe8c6, intensity: 3.4, angle: 0.32, penumbra: 0.78, decay: 1.7, distance: 8 },
    // No daylight: this room exists because the works in it cannot take any.
    roof: { profile: 'flat' },
    skylight: null,
    // A dark room is not a black room. Two very low sources make the volume
    // legible without touching exposure: one washes the circulation floor so a
    // visitor can read where the room goes, one grazes a wall so the space has
    // an edge. Neither competes with the works, which stay the brightest thing.
    floorWash: { color: 0xb6a68c, intensity: 0.3, angle: 1.2 },
    graze: { color: 0xc4b49a, intensity: 0.45 },
    barrier: { enabled: true, mode: 'primary-wall', standoff: 1.05, post: 0x15130f, rope: 0x3a352c },
    envIntensity: 0.1,
    exposure: 1.05,
    background: 0x0b0a09,
    fog: { color: 0x100e0c, near: 10, far: 44 }
  },

  /** Institutional archive: painted timber, oak floor, warmer and lower. */
  heritage: {
    wall: { color: 0x39402f, roughness: 0.92 },
    floor: { color: 0x6b573f, roughness: 0.64, metalness: 0 },
    ceiling: { color: 0xc9c2b1, roughness: 0.95 },
    skirting: { color: 0x2b3024, roughness: 0.7 },
    cove: { color: 0xffdcaa, intensity: 1.6, emissive: 0.32 },
    ambient: { sky: 0xbfb6a0, ground: 0x44392c, intensity: 0.34 },
    spot: { color: 0xffe0ae, intensity: 2.2, angle: 0.44, penumbra: 0.68, decay: 1.5, distance: 7 },
    roof: { profile: 'flat' },
    skylight: null,
    barrier: { enabled: false },
    envIntensity: 0.22,
    exposure: 1.0,
    background: 0x131210,
    fog: null
  }
};

export function profileFor(name) {
  return PROFILES[name] || PROFILES['white-cube'];
}
