#!/usr/bin/env node
/**
 * Which hotspot E activates when a door and a work are both in range.
 *
 *   node tests/proximity.test.mjs     (npm test runs it before the browser smoke)
 *
 * ProximitySystem has no DOM and no Three.js, so it runs here against a fake
 * store and Scene Kit. The geometry is Gallery B as it was when a visitor in
 * front of the Breeze door got the sheet of «Marea baja» instead of the room:
 * the door anchor sits on the floor, the work at eye height, half a metre apart.
 */
import { ProximitySystem } from '../engine/interaction/proximity.js';

let failures = 0;
function check(id, claim, pass, detail = '') {
  if (!pass) failures += 1;
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${id.padEnd(28)} ${claim}${detail ? `  — ${detail}` : ''}`);
}

const EYE = 1.62;
function system(candidates) {
  const anchors = new Map(candidates.map((c) => [c.anchorId, c.position]));
  const hotspots = candidates.map((c) => ({
    id: c.id, spaceId: 'space.test', anchorId: c.anchorId, entityId: c.entityId,
    type: c.entityId ? 'INFO' : 'PORTAL', triggerDistance: c.radius
  }));
  const states = new Map();
  const proximity = new ProximitySystem({
    store: {
      hotspotsOf: () => hotspots,
      require: (id) => hotspots.find((h) => h.id === id) || { anchorId: id }
    },
    state: { hotspotState: (id) => states.get(id) || 'AVAILABLE', setHotspotState: (id, s) => states.set(id, s) },
    bus: { emit() {} },
    sceneKit: { poseForAnchor: (id) => (anchors.has(id) ? { position: anchors.get(id) } : null), setHotspotState() {} }
  });
  proximity.rebuild('space.test');
  return (position, facing) => { proximity.update(1, position, facing); return proximity.nearestHotspot?.id || null; };
}

// Gallery B before the fix: Breeze door on the east wall, «Marea baja» beside it.
const door = { id: 'door', anchorId: 'a.door', position: [20, 0, -12], radius: 2.3 };
const work = { id: 'work', anchorId: 'a.work', entityId: 'e.work', position: [19.85, 1.55, -11.4], radius: 2.4 };
const pick = system([door, work]);

check('DOOR-AHEAD', 'Frente a la puerta y mirándola, E elige la puerta aunque una obra esté a medio metro',
  pick([18.6, EYE, -12], [1, 0, 0]) === 'door', pick([18.6, EYE, -12], [1, 0, 0]));
const towardWork = [19.85 - 19.0, 0, -11.4 - -10.6];
check('WORK-AHEAD', 'Mirando la obra desde cerca, E elige la obra aunque la puerta esté al lado',
  pick([19.0, EYE, -10.6], towardWork) === 'work', pick([19.0, EYE, -10.6], towardWork));

// A door behind the visitor and a work in front: the work.
const pick2 = system([
  { id: 'door', anchorId: 'a.door', position: [0, 0, 1.2], radius: 2.3 },
  { id: 'work', anchorId: 'a.work', entityId: 'e.work', position: [0, 1.55, -1.6], radius: 2.4 }
]);
check('DOOR-BEHIND', 'Con una obra delante y la puerta detrás, E elige la obra', pick2([0, EYE, 0], [0, 0, -1]) === 'work', pick2([0, EYE, 0], [0, 0, -1]));
// Backing out: only the door behind is eligible (a work behind is never opened).
check('BACK-OUT', 'De espaldas a todo, E sigue pudiendo cruzar la puerta, nunca abre una obra que no se mira',
  pick2([0, EYE, 0], [0, 0, 1]) === 'door', pick2([0, EYE, 0], [0, 0, 1]));

// The height of an anchor is not distance to the visitor: a door anchor is on
// the floor, a work at eye height. Two equal horizontal distances, the visitor
// facing between them: the one more in front wins, not the one at eye height.
const pick3 = system([
  { id: 'door', anchorId: 'a.door', position: [1.5, 0, -1.5], radius: 2.6 },
  { id: 'work', anchorId: 'a.work', entityId: 'e.work', position: [-1.6, 1.55, -1.6], radius: 2.6 }
]);
check('FLOOR-ANCHOR', 'La altura del ancla no cuenta como distancia: gana lo que está más delante',
  pick3([0, EYE, 0], [0.3, 0, -1]) === 'door', pick3([0, EYE, 0], [0.3, 0, -1]));

console.log(failures ? `\n${failures} fallo(s)` : '\nOK');
process.exit(failures ? 1 : 0);
