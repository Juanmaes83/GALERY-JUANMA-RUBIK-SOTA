#!/usr/bin/env node
/**
 * The working set a visitor walks through, without a browser.
 *
 *   node tests/space-lifecycle.test.mjs     (npm test runs it before the browser smoke)
 *
 * The first arrival in Gallery B and the second (B→A→B) must find the same
 * rooms ready behind the same doors. They did not: on the way back Breeze and
 * the Itinerant room were DISPOSED and never prefetched again, so the doorway
 * looked different on each visit (docs/MISION-VISUAL.md, Breeze). A room left a
 * moment ago (COOLING) was built a second time on the way back, leaving the
 * first copy in the scene for good. And walking away from Gallery B while
 * Breeze was still warming left Breeze READY with nothing built: entering it
 * afterwards threw.
 *
 * SpaceLifecycle drives the Scene Kit through its contract only, so a counting
 * fake stands in for Three.js. The World and its graph are the real ones.
 */
import { readFileSync } from 'node:fs';
import { WorldStore } from '../engine/world/world-store.js';
import { WorldGraph } from '../engine/world/world-graph.js';
import { SpaceLifecycle } from '../engine/world/space-lifecycle.js';

let failures = 0;
function check(id, claim, pass, detail = '') {
  if (!pass) failures += 1;
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${id.padEnd(28)} ${claim}${detail ? `  — ${detail}` : ''}`);
}

const world = JSON.parse(readFileSync(new URL('../worlds/museum-v1.world.json', import.meta.url), 'utf8'));
const store = new WorldStore(world);
const graph = new WorldGraph(store);

const builds = new Map();
const live = new Map();
const sceneKit = {
  async buildSpace(space) {
    builds.set(space.id, (builds.get(space.id) || 0) + 1);
    const handle = { spaceId: space.id, space, group: { visible: false }, presence: null };
    live.set(handle, space.id);
    return handle;
  },
  async warmSpace() {},
  activateSpace(handle) { handle.group.visible = true; handle.presence = 'ACTIVE'; },
  deactivateSpace(handle) { handle.group.visible = false; handle.presence = 'HIDDEN'; },
  setSpacePresence(handle, presence) { handle.presence = presence; },
  disposeSpace(handle) { live.delete(handle); }
};
const spaces = new SpaceLifecycle({ store, graph, bus: { emit() {} }, sceneKit, context: {} });
const settle = async () => { for (let i = 0; i < 6; i += 1) await new Promise((resolve) => setTimeout(resolve, 0)); };
const go = async (spaceId) => { await spaces.activate(spaceId); await settle(); };
const copies = () => [...live.values()].reduce((acc, id) => ({ ...acc, [id]: (acc[id] || 0) + 1 }), {});
const state = (id) => spaces.stateOf(id);

await go('space.lobby');
await go('space.gallery-a');
await go('space.gallery-b');
check('FIRST-ARRIVAL', 'Primera llegada a la Galería B: Breeze y la Itinerante, preparadas tras sus puertas',
  state('space.breeze') === 'READY' && state('space.itinerant-wet-paint') === 'READY',
  `breeze ${state('space.breeze')} · itinerante ${state('space.itinerant-wet-paint')}`);

const galleryABuilds = builds.get('space.gallery-a');
await go('space.gallery-a');
check('LEAVE-TO-A', 'En la Galería A, Breeze ya no es vecina y se libera', state('space.breeze') === 'DISPOSED', state('space.breeze'));
check('COOLING-REUSED', 'Volver a la sala recién dejada la reutiliza: no se construye otra vez',
  builds.get('space.gallery-a') === galleryABuilds, `construcciones de Galería A: ${galleryABuilds} → ${builds.get('space.gallery-a')}`);

await go('space.gallery-b');
check('SECOND-ARRIVAL', 'Segunda llegada (B→A→B): las mismas salas preparadas que en la primera',
  state('space.breeze') === 'READY' && state('space.itinerant-wet-paint') === 'READY',
  `breeze ${state('space.breeze')} · itinerante ${state('space.itinerant-wet-paint')}`);

for (const id of ['space.itinerant-wet-paint', 'space.gallery-b', 'space.breeze', 'space.gallery-b', 'space.gallery-a', 'space.lobby', 'space.shop', 'space.lobby', 'space.gallery-a', 'space.gallery-b']) await go(id);
const duplicated = Object.entries(copies()).filter(([, n]) => n > 1);
check('ONE-COPY', 'Tras un recorrido de ida y vuelta, cada sala existe una sola vez', duplicated.length === 0,
  duplicated.length ? duplicated.map(([id, n]) => `${id.replace('space.', '')}×${n}`).join(', ') : `${live.size} salas en memoria`);
const leaked = [...live.values()].filter((id) => state(id) === 'DISPOSED');
check('NO-ORPHANS', 'Ninguna sala liberada sigue en memoria', leaked.length === 0, leaked.join(', '));
check('WORKING-SET', 'En memoria solo la sala activa, sus vecinas y la anterior',
  spaces.workingSet.length <= 1 + graph.neighbours('space.gallery-b').length + 1, spaces.workingSet.map((w) => `${w.spaceId.replace('space.', '')}:${w.state}`).join(' '));

// Walking away from a room whose neighbour is still being prepared. On a phone
// warming takes seconds, so this is a visitor who simply does not linger.
{
  const gates = new Map();
  const hold = (key) => new Promise((resolve) => gates.set(key, resolve));
  const held = new Set();
  const gatedKit = {
    ...sceneKit,
    async buildSpace(space) { const h = await sceneKit.buildSpace(space); if (held.has(`build:${space.id}`)) await hold(`build:${space.id}`); return h; },
    async warmSpace(handle) { if (held.has(`warm:${handle.spaceId}`)) await hold(`warm:${handle.spaceId}`); }
  };
  const run = async (step) => {
    live.clear();
    held.clear();
    held.add(`${step}:space.breeze`);
    const lc = new SpaceLifecycle({ store, graph, bus: { emit() {} }, sceneKit: gatedKit, context: {} });
    for (const id of ['space.lobby', 'space.gallery-a', 'space.gallery-b']) { await lc.activate(id); await settle(); }
    const during = lc.stateOf('space.breeze');
    await lc.activate('space.itinerant-wet-paint'); await settle();
    gates.get(`${step}:space.breeze`)?.(); await settle();
    const after = { state: lc.stateOf('space.breeze'), built: Boolean(lc.handleOf('space.breeze')), inMemory: [...live.values()].includes('space.breeze') };
    held.clear();
    await lc.activate('space.gallery-b'); await settle();
    let entered;
    try { await lc.activate('space.breeze'); entered = lc.stateOf('space.breeze'); } catch (error) { entered = String(error); }
    return { during, after, entered };
  };
  for (const [step, label] of [['build', 'construyéndose'], ['warm', 'calentándose']]) {
    const r = await run(step);
    check(`WALK-AWAY-${step.toUpperCase()}`, `Salir de la Galería B con Breeze ${label}: se descarta sin quedar «lista» y vacía, y luego se entra`,
      r.after.state === 'DISPOSED' && !r.after.built && !r.after.inMemory && r.entered === 'ACTIVE', JSON.stringify(r));
  }
}

console.log(failures ? `\n${failures} fallo(s)` : '\nOK');
process.exit(failures ? 1 : 0);
