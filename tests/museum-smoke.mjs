#!/usr/bin/env node
/**
 * Prueba de humo del museo en un navegador real (Playwright + Chromium).
 *
 *   node tests/museum-smoke.mjs            (npm test ejecuta antes check-static)
 *
 * WebGL2 se obtiene con SwiftShader (render por software): los tiempos no son
 * rendimiento de dispositivo. Comprueba:
 *   - arranque sin errores de consola ni peticiones locales fallidas;
 *   - invariantes arquitectónicas del runtime y World válido;
 *   - recorrido por las seis salas a través de los portales del WorldGraph;
 *   - Sala Breeze sin WebGPU (Chromium headless no lo ofrece por defecto):
 *     aviso explicativo y salidas a Galería B (botón, botón-puente y tecla E);
 *   - Marble Bust 01 cargado como GLB local y su fallback forzado;
 *   - Studio (`?authoring=1`): montaje, áreas, guardado y recarga.
 *   - selector «POV / Con mi avatar» en la entrada;
 *   - avatar (Character 2027) en las seis salas: tercera persona, mismo avatar,
 *     oculto y aparcado en la sala anidada (Breeze), sin conflictos de cámara.
 */
import { chromium } from 'playwright';
import { startServer } from '../tools/serve.mjs';

const PORT = Number(process.env.MUSEUM_TEST_PORT || 4199);
const BASE = `http://127.0.0.1:${PORT}`;

let failures = 0;
function check(id, claim, pass, detail = '') {
  if (!pass) failures += 1;
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${id.padEnd(28)} ${claim}${detail ? `  — ${detail}` : ''}`);
}

// A real pointer action first. On a loaded CI runner with software WebGL,
// animation frames barely arrive and Playwright can stall «scrolling into
// view» (seen in CI); then the element is hit-tested (nothing may cover its
// centre) and activated through the DOM. Fallbacks are counted and printed.
const fallbacks = [];
async function press(locator, how = 'click') {
  try {
    await locator[how]({ timeout: 8000 });
    return true;
  } catch (error) {
    if (!/Timeout/.test(String(error))) throw error;
    const reachable = await locator.evaluate((node) => {
      node.scrollIntoView({ block: 'center' });
      const r = node.getBoundingClientRect();
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      const ok = top === node || node.contains(top) || Boolean(node.closest('label')?.contains(top));
      if (ok) node.click();
      return ok;
    });
    fallbacks.push(`${await locator.evaluate((n) => n.dataset.el || n.dataset.act || n.dataset.node || n.dataset.bind || n.tagName)}${reachable ? '' : ' (TAPADO)'}`);
    if (!reachable) throw new Error(`elemento tapado: ${fallbacks.at(-1)}`);
    return true;
  }
}

const requests = [];
const server = await startServer(PORT, { log: (entry) => requests.push(entry) });
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox']
});

async function openMuseum(query = '') {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const consoleErrors = [];
  const externalRequests = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', (error) => consoleErrors.push(String(error)));
  page.on('request', (req) => {
    const url = new URL(req.url());
    if (url.origin !== BASE && !url.protocol.startsWith('data') && !url.protocol.startsWith('blob')) externalRequests.push(req.url());
  });
  await page.goto(`${BASE}/index.html${query}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__IW?.ready === true || document.documentElement.dataset.iwError, null, { timeout: 120000 });
  // From here on the page must not navigate or crash on its own; if it does,
  // the failure says how (seen once in CI as «Execution context was destroyed»).
  const life = [];
  page.on('framenavigated', (frame) => { if (frame === page.mainFrame()) life.push(`navegación a ${frame.url().slice(BASE.length)}`); });
  page.on('crash', () => life.push('el proceso de la página se cayó'));
  page.on('close', () => life.push('página cerrada'));
  pageLife.set(page, life);
  return { page, consoleErrors, externalRequests };
}

const pageLife = new WeakMap();

async function travel(page, portalId) {
  return page.evaluate(async (id) => {
    const runtime = window.__IW.runtime;
    await runtime.traversePortal(id, { source: 'QA' });
    const deadline = performance.now() + 30000;
    const target = runtime.store.require(id).toSpaceId;
    while (runtime.state.activeSpaceId !== target && performance.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return runtime.state.activeSpaceId;
  }, portalId).catch((error) => {
    const life = pageLife.get(page) || [];
    throw new Error(`${portalId}: ${String(error).split('\n')[0]}${life.length ? ` · ${life.join(' · ')}` : ' · sin navegación ni caída registradas'}`);
  });
}

try {
  /* 1. Boot, invariants, journey through every room ------------------------ */
  {
    const { page, consoleErrors, externalRequests } = await openMuseum();
    const boot = await page.evaluate(() => ({
      error: document.documentElement.dataset.iwError || null,
      webgl2: Boolean(document.createElement('canvas').getContext('webgl2')),
      valid: window.__IW.runtime.store.validation.ok,
      spaces: window.__IW.runtime.store.spaces.map((s) => s.id),
      active: window.__IW.runtime.state.activeSpaceId
    }));
    check('BOOT', 'El museo arranca', !boot.error && boot.webgl2, boot.error || 'WebGL2 disponible');
    check('WORLD-VALID', 'El World cumple el esquema', boot.valid, `${boot.spaces.length} salas`);
    check('START-SPACE', 'La visita empieza en el Vestíbulo', boot.active === 'space.lobby', boot.active);

    const presence = await page.evaluate(() => {
      const box = window.__IW.hud.el.presence;
      return box && !box.hidden ? { selected: box.querySelector('.is-selected')?.dataset.presence, enter: window.__IW.hud.el.enter.textContent.trim() } : null;
    });
    check('PRESENCE-CHOICE', 'La entrada ofrece «POV» o «Con mi avatar»', presence?.selected === 'pov' && presence.enter === 'Entrar en POV', JSON.stringify(presence));

    // The visitor's own first gesture: the entry veil and its button.
    const entered = await page.evaluate(async () => {
      const hud = window.__IW.hud;
      if (hud.el.enter.hidden) return false;
      hud.el.enter.click();
      await new Promise((resolve) => setTimeout(resolve, 900));
      return hud.el.veil.hidden === true;
    });
    check('ENTER', 'El botón «Entrar» retira el velo de bienvenida', entered);

    const invariants = await page.evaluate(() => window.__IW.assertInvariants());
    const broken = invariants.results.filter((r) => !r.pass).map((r) => r.id);
    check('INVARIANTS', 'Invariantes arquitectónicas', invariants.ok, broken.length ? broken.join(', ') : `${invariants.results.length} comprobadas`);

    // Museum shop: a room of the museum, reached from the Vestíbulo and left the same way.
    const shopActive = await travel(page, 'portal.lobby-shop');
    const shop = await page.evaluate(async () => {
      const rt = window.__IW.runtime;
      const products = rt.store.entitiesOf('space.shop').filter((e) => e.content?.product);
      rt.focusEntity('entity.shop.catalogo');
      await new Promise((r) => setTimeout(r, 2500));
      const price = window.__IW.hud.el.detailPrice.textContent;
      rt.releaseFocus();
      window.__IW.hud.renderAccessibilityOutline?.();
      const text = window.__IW.hud.el.a11yBody.textContent;
      return { products: products.length, price, inText: /Catálogo de la colección/.test(text) && /precio de demostración/.test(text) };
    });
    check('SHOP-ROOM', 'La tienda del museo se visita desde el Vestíbulo', shopActive === 'space.shop' && shop.products === 8, `${shopActive} · ${shop.products} productos`);
    check('SHOP-SHEET', 'La ficha de producto muestra el precio marcado como demostración (sin compra)', /demostración/.test(shop.price) && /sin compra/.test(shop.price), shop.price);
    check('SHOP-TEXT', 'El catálogo también está en «Contenido en texto», con precio de demostración', shop.inText);
    const shopBack = await travel(page, 'portal.shop-lobby');
    check('SHOP-EXIT', 'Se vuelve de la tienda al Vestíbulo', shopBack === 'space.lobby', shopBack);

    const journey = [
      ['portal.lobby-gallery-a', 'space.gallery-a'],
      ['portal.gallery-a-archive', 'space.archive'],
      ['portal.archive-gallery-a', 'space.gallery-a'],
      ['portal.gallery-a-gallery-b', 'space.gallery-b'],
      ['portal.gallery-b-itinerant', 'space.itinerant-wet-paint'],
      ['portal.itinerant-gallery-b', 'space.gallery-b'],
      ['portal.gallery-b-breeze', 'space.breeze']
    ];
    for (const [portal, expected] of journey) {
      const active = await travel(page, portal);
      check(`ROOM ${expected.replace('space.', '')}`, `Portal ${portal}`, active === expected, active);
    }

    // Breeze without Breeze Studio PRO: explicit notice, working exit.
    await page.waitForSelector('[data-breeze-unavailable]', { timeout: 30000 }).catch(() => null);
    const breeze = await page.evaluate(() => ({
      notice: Boolean(document.querySelector('[data-breeze-unavailable]')),
      iframe: Boolean(document.querySelector('iframe[data-nested-room-studio="room.breeze"]')),
      exit: Boolean(document.querySelector('[data-breeze-museum-exit]'))
    }));
    const noticeKind = await page.evaluate(() => document.querySelector('[data-breeze-unavailable]')?.dataset.breezeUnavailable || null);
    check('BREEZE-NOTICE', 'Sin WebGPU, la Sala Breeze explica qué necesita en vez de un escenario vacío', breeze.notice && !breeze.iframe && noticeKind === 'no-webgpu', noticeKind);

    // Keyboard exit: the room's own return hotspot (E) crosses back to Gallery B.
    await page.waitForTimeout(1200);
    const prompt = await page.evaluate(() => {
      const el = window.__IW.hud.el.prompt;
      return el.hidden ? null : el.textContent.trim();
    });
    check('BREEZE-PROMPT', 'El aviso de proximidad de la Sala Breeze ofrece volver a Galería B', /Galería B/.test(prompt || ''), prompt);
    await page.keyboard.press('KeyE');
    const keyExit = await page.waitForFunction(() => window.__IW.runtime.state.activeSpaceId === 'space.gallery-b', null, { timeout: 30000 })
      .then(() => true).catch(() => false);
    check('BREEZE-KEY-E', 'La tecla E sale de la Sala Breeze a Galería B', keyExit);
    const reentered = await travel(page, 'portal.gallery-b-breeze');
    check('BREEZE-REENTER', 'Se vuelve a entrar en la Sala Breeze', reentered === 'space.breeze', reentered);
    await page.waitForSelector('[data-breeze-unavailable]', { timeout: 30000 }).catch(() => null);
    await page.waitForSelector('[data-breeze-museum-exit]', { timeout: 30000 }).catch(() => null);
    // The exit bridge must be reachable by a pointer (it was covered by the
    // HUD top bar in escaparates-pro@382e566).
    const bridgeTop = await page.evaluate(() => {
      const button = document.querySelector('[data-breeze-museum-exit]');
      if (!button) return 'sin botón';
      const r = button.getBoundingClientRect();
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return top === button || button.contains(top) ? 'ok' : String(top?.className || top?.tagName);
    });
    check('BREEZE-BRIDGE-REACHABLE', 'El botón-puente de salida no queda tapado por el HUD', bridgeTop === 'ok', bridgeTop);

    // Real pointer click on the notice's own exit, which forwards to the bridge.
    const exitClicked = await page.locator('[data-breeze-unavailable-exit]').click({ timeout: 10000 })
      .then(() => true).catch((error) => { console.log(`  info  click salida: ${error.message.split('\n')[0]}`); return false; });
    const back = await page.waitForFunction(() => window.__IW.runtime.state.activeSpaceId === 'space.gallery-b', null, { timeout: 30000 })
      .then(() => 'space.gallery-b').catch(() => null);
    const noticeGone = await page.evaluate(() => !document.querySelector('[data-breeze-unavailable]'));
    check('BREEZE-EXIT', 'Clic real en «Volver a Galería B» cruza el portal canónico y retira el aviso', exitClicked && back === 'space.gallery-b' && noticeGone);

    const failedLocal = requests.filter((r) => r.status >= 400);
    check('NO-BROKEN-REQUESTS', 'Ninguna petición local falla', failedLocal.length === 0,
      failedLocal.length ? failedLocal.map((r) => `${r.status} ${r.url}`).join(', ') : `${requests.length} peticiones`);
    check('NO-EXTERNAL-REQUESTS', 'La visita base no depende de la red externa', externalRequests.length === 0, externalRequests.join(', '));
    const relevantErrors = consoleErrors;
    check('NO-CONSOLE-ERRORS', 'Sin errores de consola', relevantErrors.length === 0, relevantErrors.slice(0, 3).join(' | '));
    await page.close();
  }

  /* 1b. Wet Paint: a saved transformation is on the wall whenever the room is built */
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    // A 2×2 red PNG stands in for a saved Wet Paint result.
    const red = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACAQMAAABIeJ9nAAAAIGNIUk0AAHomAACAhAAA+gAAAIDoAAB1MAAA6mAAADqYAAAXcJy6UTwAAAAGUExURf8AAP///0EdNBEAAAABYktHRAH/Ai3eAAAAB3RJTUUH6goBFQ0pZPZqOgAAAAxJREFUCNdjYGBgAAAABAABJzQnCgAAAABJRU5ErkJggg==';
    await page.addInitScript((url) => {
      localStorage.setItem('iw.wetpaint.personalization.v1', JSON.stringify({ 'entity.itinerant.painterly': { resultDataUrl: url, savedAt: 1 } }));
    }, red);
    await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__IW?.ready === true, null, { timeout: 120000 });
    const plateSrc = () => page.waitForFunction(() => {
      const root = window.__IW.runtime.sceneKit._entityIndex?.get('entity.itinerant.painterly')?.object;
      let best = null; let area = 0;
      root?.traverse?.((n) => { if (n.isMesh && n.geometry?.type === 'PlaneGeometry') { const p = n.geometry.parameters; if (p.width * p.height > area) { area = p.width * p.height; best = n; } } });
      const src = best?.material?.map?.image?.src || '';
      return src.startsWith('data:image/png') ? 'wetpaint' : null;
    }, null, { timeout: 30000 }).then(() => 'wetpaint').catch(() => 'original');
    const visits = [];
    for (const id of ['portal.lobby-gallery-a', 'portal.gallery-a-gallery-b', 'portal.gallery-b-itinerant']) await travel(page, id);
    visits.push(await plateSrc());
    // Leave far enough for the room to be disposed, then come back.
    for (const id of ['portal.itinerant-gallery-b', 'portal.gallery-b-gallery-a', 'portal.gallery-a-lobby', 'portal.lobby-gallery-a', 'portal.gallery-a-gallery-b', 'portal.gallery-b-itinerant']) await travel(page, id);
    visits.push(await plateSrc());
    check('WETPAINT-RESTORE', 'Una transformación Wet Paint guardada está en el cuadro al entrar y al volver a la Itinerante',
      visits.every((v) => v === 'wetpaint'), visits.join(' · '));
    check('WETPAINT-RESTORE CONSOLE', 'Sin errores de página', errors.length === 0, errors.slice(0, 2).join(' | '));
    await page.close();
  }

  /* 1c. Orientation: outline, exit signs on real routes, the way out --------- */
  {
    const { page, consoleErrors } = await openMuseum();
    await page.evaluate(() => window.__IW.hud.el.enter.click());
    await travel(page, 'portal.lobby-gallery-a');
    // After a crossing the camera belongs to the crossing until it lands.
    const explore = () => page.waitForFunction(() => window.__IW.runtime.camera.report().owner === 'EXPLORE', null, { timeout: 30000 }).catch(() => {});
    await explore();
    const outline = await page.evaluate(async () => {
      const rt = window.__IW.runtime; const id = 'entity.artwork.estudio-de-figura';
      const place = (d) => { const a = rt.sceneKit.poseForAnchor(rt.store.require(id).anchorId); rt.explore.placeAt([a.position[0] + a.normal[0] * d, 0, a.position[2] + a.normal[2] * d], [-a.normal[0], 0, -a.normal[2]]); };
      const read = () => { const rec = rt.sceneKit._entityIndex.get(id); let glow = false; rec?.object.traverse((n) => { if (n.isMesh && n.material === rec.frameGlow) glow = true; }); return { nearest: rt.proximity.nearestHotspot?.entityId || null, outlined: rt.sceneKit.nearestEntityId, glow }; };
      rt.explore.placeAt([0, 0, -10], [1, 0, -0.6]); await new Promise((r) => setTimeout(r, 1200)); const far = read();
      // 2.4 m in front, just outside its own range, with the corner neighbour
      // (División tercera) in range behind-left: that one must not be offered.
      const a0 = rt.sceneKit.poseForAnchor(rt.store.require(id).anchorId);
      rt.explore.placeAt([a0.position[0] + a0.normal[0] * 2.4, 0, a0.position[2] + 0.6], [-a0.normal[0], 0, -a0.normal[2]]);
      await new Promise((r) => setTimeout(r, 1200)); const aside = read();
      place(2.0); await new Promise((r) => setTimeout(r, 1200)); const near = read();
      rt.focusEntity(id); await new Promise((r) => setTimeout(r, 1500)); const focused = read();
      rt.releaseFocus();
      return { far, aside, near, focused };
    });
    check('WORK-OUTLINE', 'Se resalta solo la obra que nombra el aviso, la de enfrente aunque haya otra en la esquina; nada con la ficha abierta',
      outline.far.outlined !== 'entity.artwork.estudio-de-figura' && outline.far.outlined === outline.far.nearest && outline.aside.nearest !== 'entity.artwork.division-tercera' && outline.near.outlined === 'entity.artwork.estudio-de-figura' && outline.near.nearest === outline.near.outlined && outline.near.glow && !outline.focused.outlined,
      JSON.stringify(outline));

    // Every exit sign stands by the doorway that starts the shortest route to
    // the room with the exit, and following the signs reaches the exit.
    const signs = [];
    for (const [portal, space] of [['portal.gallery-a-gallery-b', 'space.gallery-b'], ['portal.gallery-b-itinerant', 'space.itinerant-wet-paint'], ['portal.itinerant-gallery-b', 'space.gallery-b'], ['portal.gallery-b-gallery-a', 'space.gallery-a'], ['portal.gallery-a-archive', 'space.archive'], ['portal.archive-gallery-a', 'space.gallery-a'], ['portal.gallery-a-lobby', 'space.lobby'], ['portal.lobby-shop', 'space.shop']]) {
      await travel(page, portal);
      signs.push(await page.evaluate((sp) => ({ space: sp, ...(window.__IW.runtime.sceneKit.wayfindingReport()[sp] || {}) }), space));
    }
    const graphOk = await page.evaluate((rows) => {
      const store = window.__IW.runtime.store;
      const exitRooms = new Set(store.hotspots.filter((h) => h.action?.type === 'END_VISIT').map((h) => h.spaceId));
      const dist = (from) => { const seen = new Map([[from, 0]]); const q = [from]; while (q.length) { const h = q.shift(); if (exitRooms.has(h)) return seen.get(h); for (const p of store.portalsOf(h)) if (!seen.has(p.toSpaceId)) { seen.set(p.toSpaceId, seen.get(h) + 1); q.push(p.toSpaceId); } } return Infinity; };
      return rows.map((r) => {
        if (exitRooms.has(r.space)) return { space: r.space, ok: (r.exitDoors || []).length > 0 && !r.sign };
        const portal = r.sign && store.get(r.sign.portalId);
        return { space: r.space, ok: Boolean(portal) && portal.fromSpaceId === r.space && dist(portal.toSpaceId) === dist(r.space) - 1 };
      });
    }, signs);
    check('EXIT-SIGNS', 'Cada señal de salida apunta a la puerta que acerca a la salida (ruta comprobada en el grafo)', graphOk.every((g) => g.ok), JSON.stringify(graphOk.filter((g) => !g.ok).length ? graphOk : graphOk.map((g) => g.space.replace('space.', ''))));
    // Follow the signs from the shop's neighbour (Archivo) to the exit room.
    let here = 'space.archive'; const path = [here];
    await travel(page, 'portal.shop-lobby'); await travel(page, 'portal.lobby-gallery-a'); await travel(page, 'portal.gallery-a-archive');
    for (let hop = 0; hop < 6 && here !== 'space.lobby'; hop += 1) {
      const next = await page.evaluate((sp) => window.__IW.runtime.sceneKit.wayfindingReport()[sp]?.sign?.portalId || null, here);
      if (!next) break;
      here = await travel(page, next); path.push(here);
    }
    check('EXIT-ROUTE', 'Siguiendo las señales se llega a la sala con la salida', here === 'space.lobby', path.join(' → '));

    // The way out: E at the exit door asks first; Esc keeps visiting; «Salir» works from anywhere.
    await explore();
    const exitFlow = await page.evaluate(async () => {
      const rt = window.__IW.runtime; const hud = window.__IW.hud;
      const a = rt.store.require('anchor.lobby.exit');
      rt.explore.placeAt([a.position[0], 0, a.position[2] - 1.2], [0, 0, 1]);
      await new Promise((r) => setTimeout(r, 1200));
      const prompt = hud.el.prompt.hidden ? null : hud.el.prompt.textContent.trim();
      return { prompt };
    });
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(400);
    const dialog = await page.evaluate(() => ({ open: window.__IW.hud.endVisitOpen, text: window.__IW.hud.el.endSummary.textContent }));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const closed = await page.evaluate(() => !window.__IW.hud.endVisitOpen);
    // A pointer click needs animation frames to settle; on a loaded CI runner
    // with software WebGL they barely arrive and Playwright's click stalls at
    // «scrolling into view» (seen in CI). What matters is checked directly:
    // nothing covers the button at its centre, and clicking it runs the flow.
    const pressReachable = (el) => page.evaluate((el) => {
      const node = window.__IW.hud.el[el];
      const r = node.getBoundingClientRect();
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      const reachable = top === node || node.contains(top);
      node.click();
      return reachable;
    }, el);
    const leaveReachable = await pressReachable('leaveBtn');
    const endReachable = await pressReachable('endLeave');
    const farewell = await page.evaluate(() => ({ open: window.__IW.hud.endVisitOpen, title: window.__IW.hud.el.endTitle.textContent, button: window.__IW.hud.el.endLeave.textContent }));
    farewell.reachable = leaveReachable && endReachable;
    check('EXIT-DOOR', 'La puerta de salida del Vestíbulo pide confirmación con E y Esc permite seguir', /Salir del museo/.test(exitFlow.prompt || '') && dialog.open && closed, `${exitFlow.prompt} · ${dialog.text}`);
    check('EXIT-FAREWELL', '«Salir» → «Terminar la visita» despide y ofrece volver a empezar', farewell.reachable && farewell.open && /Gracias/.test(farewell.title) && /Volver a empezar/.test(farewell.button), JSON.stringify(farewell));
    check('ORIENTATION CONSOLE', 'Sin errores de consola', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
    await page.close();
  }

  /* 1b. Doorways, works and ropes: the room data a visitor walks through --- */
  {
    const { page, consoleErrors } = await openMuseum();
    // Every room, from the Scene Kit's own geometry (doorways, rope lines and
    // their collision boxes, wall works, arrivals) — the data, not a picture.
    const spatial = await page.evaluate(async () => {
      const { profileFor } = await import('./scene-kits/museum/profiles.js');
      const rt = window.__IW.runtime; const kit = rt.sceneKit; const st = rt.store;
      const along = (wall, p) => (wall === 'NORTH' || wall === 'SOUTH' ? p[0] : p[2]);
      const out = { doorwayWorks: [], ropeDoors: [], trapped: [], pockets: [], doorsWithoutE: [], itinerantWalls: [] };
      for (const space of st.spaces) {
        const [w, , d] = space.bounds.size; const [ox, , oz] = space.bounds.origin;
        const planes = { NORTH: oz - d / 2, SOUTH: oz + d / 2, WEST: ox - w / 2, EAST: ox + w / 2 };
        const wallOf = (p) => Object.entries({ NORTH: Math.abs(p[2] - planes.NORTH), SOUTH: Math.abs(p[2] - planes.SOUTH), WEST: Math.abs(p[0] - planes.WEST), EAST: Math.abs(p[0] - planes.EAST) }).sort((a, b) => a[1] - b[1])[0];
        const profile = profileFor(space.sceneProfile);
        const openings = kit._openingsFor(space, st);
        const lines = profile.barrier?.enabled === false ? [] : kit._barrierLinesFor(space, st, profile);
        const works = st.entitiesOf(space.id).map((e) => ({ e, a: st.get(e.anchorId) })).filter(({ a }) => a?.kind === 'WALL');
        for (const o of openings) {
          const c = along(o.wall, o.worldPosition); const lo = c - o.width / 2; const hi = c + o.width / 2;
          for (const { e, a } of works) {
            const [wall, dist] = wallOf(a.position); if (wall !== o.wall || dist > 0.6) continue;
            const half = (e.size?.[0] ?? 1) / 2; const x = along(wall, a.position);
            const gap = Math.max(lo - (x + half), (x - half) - hi);
            if (gap < 0.5) out.doorwayWorks.push(`${e.id} ${gap.toFixed(2)} m · puerta a ${o.toSpaceId}`);
          }
          for (const l of lines) {
            if (l.wall !== o.wall) continue;
            const a0 = along(l.wall, l.from); const a1 = along(l.wall, l.to);
            if (Math.min(a0, a1) < hi && Math.max(a0, a1) > lo) out.ropeDoors.push(`${space.id} ${l.wall} · puerta a ${o.toSpaceId}`);
          }
        }
        const nav = kit.navigationVolume(space.id);
        for (const l of lines) {
          const ax = l.wall === 'NORTH' || l.wall === 'SOUTH';
          const lo = ax ? nav.bounds?.min[0] : nav.bounds?.min[2]; const hi = ax ? nav.bounds?.max[0] : nav.bounds?.max[2];
          const a0 = Math.min(along(l.wall, l.from), along(l.wall, l.to)); const a1 = Math.max(along(l.wall, l.from), along(l.wall, l.to));
          // the gap a body can actually use: wall-to-rope minus the rope box margin
          for (const gap of [a0 - 0.2 - (lo ?? a0), (hi ?? a1) - a1 - 0.2]) if (gap > 0.05 && gap < 0.8) out.pockets.push(`${space.id} ${l.wall} hueco ${gap.toFixed(2)} m`);
          for (const sp of st.anchors.filter((x) => x.spaceId === space.id && x.kind === 'SPAWN')) {
            const [x, , z] = sp.position; const v = ax ? z : x; const s = ax ? x : z; const line = ax ? l.from[2] : l.from[0];
            const behind = s > a0 - 0.2 && s < a1 + 0.2 && (v - planes[l.wall]) * (line - planes[l.wall]) > 0 && Math.abs(v - planes[l.wall]) < Math.abs(line - planes[l.wall]) + 0.2;
            if (behind) out.trapped.push(`${sp.id} (${l.wall})`);
          }
        }
        for (const portal of st.portalsOf(space.id).filter((p) => p.fromSpaceId === space.id && p.representationHint !== 'NONE')) {
          if (!st.hotspotsOf(space.id).some((h) => h.action?.type === 'ACTIVATE_PORTAL' && h.action.target === portal.id)) out.doorsWithoutE.push(portal.id);
        }
        if (space.id === 'space.itinerant-wet-paint') out.itinerantWalls = works.map(({ e, a }) => `${e.id.split('.').pop()}:${wallOf(a.position)[0]}`);
      }
      return out;
    });
    check('SPATIAL-DOORWAYS-CLEAR', 'Ninguna obra de pared invade una puerta ni se queda a menos de 0,5 m de su hueco',
      spatial.doorwayWorks.length === 0, spatial.doorwayWorks.join(' | ') || 'todas las salas');
    check('SPATIAL-ROPES-OPEN', 'Ninguna cuerda cruza una puerta, deja una llegada atrapada ni un hueco por el que no se cabe',
      !spatial.ropeDoors.length && !spatial.trapped.length && !spatial.pockets.length, [...spatial.ropeDoors, ...spatial.trapped, ...spatial.pockets].join(' | ') || 'todas las salas');
    check('SPATIAL-DOOR-HOTSPOTS', 'Cada puerta de cada sala se cruza con E', spatial.doorsWithoutE.length === 0, spatial.doorsWithoutE.join(', ') || 'todas');
    const walls = new Set(spatial.itinerantWalls.map((x) => x.split(':')[1]));
    check('WETPAINT-FOUR-WALLS', 'Wet Paint reparte sus cinco obras por las cuatro paredes', spatial.itinerantWalls.length === 5 && walls.size === 4, spatial.itinerantWalls.join(', '));

    // Breeze with the real keyboard: in front of its doorway, facing it, E crosses.
    await page.evaluate(async () => { const h = window.__IW.hud; h.el.enter.click(); await new Promise((r) => setTimeout(r, 900)); });
    await travel(page, 'portal.lobby-gallery-a');
    await travel(page, 'portal.gallery-a-gallery-b');
    const keyE = async () => { await page.locator('#iw-canvas').focus().catch(() => {}); await page.keyboard.press('KeyE'); };
    await page.evaluate(() => window.__IW.runtime.explore.placeAt([18.6, 0, -12], [1, 0, 0]));
    await page.waitForTimeout(600);
    const atDoor = await page.evaluate(() => window.__IW.runtime.proximity.nearestHotspot?.id || null);
    await keyE();
    const breeze = await page.waitForFunction(() => window.__IW.runtime.state.activeSpaceId === 'space.breeze', null, { timeout: 30000 }).then(() => true).catch(() => false);
    const breezeState = await page.evaluate(() => ({ space: window.__IW.runtime.state.activeSpaceId, focused: window.__IW.runtime.state.focusedEntityId }));
    check('BREEZE-DOOR-E', 'Frente a la puerta de Breeze, E entra en la sala (no abre la ficha de la obra cercana)',
      breeze && atDoor === 'hotspot.gallery-b.to-breeze' && !breezeState.focused, `${atDoor} → ${JSON.stringify(breezeState)}`);
    await page.waitForTimeout(1500);
    await keyE();
    const back = await page.waitForFunction(() => window.__IW.runtime.state.activeSpaceId === 'space.gallery-b', null, { timeout: 30000 }).then(() => true).catch(() => false);
    check('BREEZE-EXIT-E', 'Y E vuelve de Breeze a la Galería B', back);

    // The work moved off the doorway is still a work: in reach, outlined, with its sheet.
    await page.evaluate(() => { const rt = window.__IW.runtime; const a = rt.sceneKit.poseForAnchor(rt.store.require('entity.artwork.marea-baja').anchorId); rt.explore.placeAt([a.position[0] + a.normal[0] * 1.8, 0, a.position[2] + a.normal[2] * 1.8], [-a.normal[0], 0, -a.normal[2]]); });
    // Proximity runs at 12 Hz inside the render loop; right after leaving Breeze
    // SwiftShader frames are slow, so wait for the update instead of a fixed pause.
    await page.waitForFunction(() => window.__IW.runtime.proximity.nearestHotspot?.id === 'hotspot.art.marea-baja'
      && window.__IW.runtime.sceneKit.nearestEntityId === 'entity.artwork.marea-baja', null, { timeout: 10000 }).catch(() => {});
    const nearMarea = await page.evaluate(() => ({ nearest: window.__IW.runtime.proximity.nearestHotspot?.id || null, outlined: window.__IW.runtime.sceneKit.nearestEntityId }));
    await keyE();
    await page.waitForTimeout(2500);
    const sheet = await page.evaluate(() => ({ focused: window.__IW.runtime.state.focusedEntityId, title: window.__IW.hud.el.detailTitle.textContent.trim() }));
    check('MAREA-BAJA-SHEET', '«Marea baja», fuera de la puerta, se resalta y abre su ficha con E',
      nearMarea.nearest === 'hotspot.art.marea-baja' && nearMarea.outlined === 'entity.artwork.marea-baja' && sheet.focused === 'entity.artwork.marea-baja' && /Marea baja/i.test(sheet.title),
      `${JSON.stringify(nearMarea)} · ${JSON.stringify(sheet)}`);
    await page.evaluate(() => window.__IW.runtime.releaseFocus());
    await page.waitForTimeout(800);

    // Wet Paint: from the doorway the visitor walks in, and every work answers.
    await travel(page, 'portal.gallery-b-itinerant');
    await page.waitForTimeout(800);
    await page.evaluate(() => { window.__IW.runtime.explore.yaw = 0; });
    const arrival = await page.evaluate(() => [...window.__IW.runtime.explore.position]);
    await page.locator('#iw-canvas').focus().catch(() => {});
    await page.keyboard.down('KeyW'); await page.waitForTimeout(2000); await page.keyboard.up('KeyW');
    await page.waitForTimeout(400);
    const walked = await page.evaluate(() => [...window.__IW.runtime.explore.position]);
    // Inside the room, and in front of the south rope (z 4.05, box ±0.2, radius 0.35).
    check('WETPAINT-WALK-IN', 'Desde la puerta de Wet Paint se camina hacia dentro sin chocar con una cuerda y sin atravesarla',
      walked[2] - arrival[2] > 1.2 && walked[2] < 4.05 - 0.2 - 0.34, `z ${arrival[2].toFixed(2)} → ${walked[2].toFixed(2)}`);
    const works = await page.evaluate(async () => {
      const rt = window.__IW.runtime; const rows = [];
      for (const e of rt.store.entitiesOf('space.itinerant-wet-paint')) {
        const a = rt.sceneKit.poseForAnchor(e.anchorId);
        rt.explore.placeAt([a.position[0] + a.normal[0] * 1.9, 0, a.position[2] + a.normal[2] * 1.9], [-a.normal[0], 0, -a.normal[2]]);
        for (let t = 0; t < 40 && !(rt.proximity.nearestHotspot?.entityId === e.id && rt.sceneKit.nearestEntityId === e.id); t++) await new Promise((r) => setTimeout(r, 250));
        const nearest = rt.proximity.nearestHotspot?.entityId || null; const outlined = rt.sceneKit.nearestEntityId;
        rt.focusEntity(e.id); await new Promise((r) => setTimeout(r, 1800));
        rows.push({ id: e.id, nearest: nearest === e.id, outlined: outlined === e.id, sheet: window.__IW.hud.el.detailTitle.textContent.trim() === (e.content?.title || e.id) });
        rt.releaseFocus(); await new Promise((r) => setTimeout(r, 900));
      }
      return rows;
    });
    const bad = works.filter((r) => !r.nearest || !r.outlined || !r.sheet);
    check('WETPAINT-WORKS-ANSWER', 'Cada obra de Wet Paint, en su nuevo sitio, se resalta, es la que nombra E y abre su ficha',
      works.length === 5 && bad.length === 0, bad.map((r) => JSON.stringify(r)).join(' | ') || `${works.length} obras`);
    check('SPATIAL CONSOLE', 'Sin errores de consola', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
    await page.close();
  }

  /* 2. Marble Bust 01: GLB and forced fallback ------------------------------ */
  for (const [query, expected] of [['?state=museum:marble-bust-detail', 'GLB'], ['?state=museum:marble-bust-detail&glbStone=fallback', 'FALLBACK']]) {
    const { page, consoleErrors } = await openMuseum(query);
    const result = await page.waitForFunction(() => {
      const status = window.__IW.report().models?.entities?.['entity.sculpture.marble-bust-study'];
      return status && status !== 'LOADING' && status !== 'PENDING' ? status : null;
    }, null, { timeout: 60000 }).then((handle) => handle.jsonValue()).catch(() => null);
    const focused = await page.evaluate(() => window.__IW.runtime.state.focusedEntityId);
    const text = typeof result === 'string' ? result : JSON.stringify(result);
    check(`MARBLE-BUST ${expected}`, `Marble Bust 01 en modo ${expected}`, Boolean(text) && text.includes(expected) && focused === 'entity.sculpture.marble-bust-study',
      `${text} · foco ${focused}`);
    check(`MARBLE-BUST ${expected} CONSOLE`, 'Sin errores de consola', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
    await page.close();
  }

  /* 3. Studio (Museum authoring panel): mount, domains, save, reload ------- */
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
    page.on('pageerror', (error) => consoleErrors.push(String(error)));
    const ready = () => page.waitForFunction(() => window.__IW?.ready === true && window.__IW_STUDIO, null, { timeout: 120000 });
    await page.goto(`${BASE}/index.html?authoring=1`);
    await ready();
    const mount = await page.evaluate(() => ({
      studio: document.body.dataset.studio === 'on' && Boolean(document.querySelector('#st')),
      domains: [...document.querySelectorAll('[data-domain]')].map((el) => el.dataset.domain),
      avatar: document.documentElement.dataset.avatarStudioPhase5 || null
    }));
    const expected = ['build', 'content', 'experience', 'visitor', 'publish', 'avatar'];
    check('STUDIO-MOUNT', 'index.html?authoring=1 monta el Studio', mount.studio);
    check('STUDIO-DOMAINS', 'Áreas Construir, Contenido, Experiencia, Visitante, Publicar y Avatar',
      expected.every((d) => mount.domains.includes(d)), [...new Set(mount.domains)].join(', '));
    check('STUDIO-AVATAR', 'Avatar Studio (fase 5) montado', mount.avatar === 'gate1-ready', mount.avatar);

    const claim = `Claim de prueba ${Date.now()}`;
    const field = page.locator('[data-bind="institution.claim"]').first();
    await field.fill(claim);
    await field.dispatchEvent('change');
    await press(page.locator('[data-act="save"]').first());
    const saved = await page.waitForFunction((value) => (localStorage.getItem('iw.museum.authoring.v1') || '').includes(value), claim, { timeout: 15000 })
      .then(() => true).catch(() => false);
    check('STUDIO-SAVE', 'Guardar persiste la configuración (localStorage)', saved);

    await page.reload();
    await ready();
    const restored = await page.locator('[data-bind="institution.claim"]').first().inputValue().catch(() => null);
    check('STUDIO-RELOAD', 'La edición sobrevive a la recarga', restored === claim, restored);

    // A product edited in the Studio reaches the visitor's shop: price, order
    // and visibility are applied from the saved project.
    await press(page.locator('#st .st-nodebtn[data-node="entity.shop.lamina-marea"]').first());
    await page.locator('#st [data-bind="entities.entity.shop.lamina-marea.product.price"]').fill('42');
    await page.locator('#st [data-bind="entities.entity.shop.lamina-marea.product.order"]').fill('0');
    await press(page.locator('#st .st-nodebtn[data-node="entity.shop.postales"]').first());
    await press(page.locator('#st [data-bind="entities.entity.shop.postales.product.visible"]'));

    // Replacing a file: while the new one loads, the slot must already describe
    // it, never the previous record (whose asset has just been released).
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    await press(page.locator('#st .st-nodebtn[data-node="entity.artwork.horizonte-interrumpido"]').first());
    const slot = () => page.evaluate(() => {
      const el = document.querySelector('#st .st-slot[data-slot="ARTWORK_IMAGE"]');
      return { file: el?.querySelector('.st-filename')?.textContent.trim(), state: el?.querySelector('.st-slotstate')?.textContent.replace(/\s+/g, ' ').trim() };
    });
    await page.locator('#st [data-media="ARTWORK_IMAGE"]').setInputFiles({ name: 'primera.png', mimeType: 'image/png', buffer: png });
    await page.waitForFunction(() => /Lista/.test(document.querySelector('#st .st-slot[data-slot="ARTWORK_IMAGE"] .st-slotstate')?.textContent || ''), null, { timeout: 15000 }).catch(() => {});
    await page.evaluate(() => {
      const vault = window.__IW_STUDIO.vault;
      const accept = vault.accept.bind(vault);
      vault.accept = (file, options) => accept(file, options).then((asset) => new Promise((resolve) => { window.__releaseAccept = () => resolve(asset); }));
    });
    await page.locator('#st [data-media="ARTWORK_IMAGE"]').setInputFiles({ name: 'segunda.png', mimeType: 'image/png', buffer: png });
    await page.waitForFunction(() => typeof window.__releaseAccept === 'function', null, { timeout: 15000 }).catch(() => {});
    const during = await slot();
    await page.evaluate(() => window.__releaseAccept?.());
    await page.waitForTimeout(300);
    const after = await slot();
    check('STUDIO-MEDIA-REPLACE', 'Al sustituir un archivo, la ranura muestra el nuevo desde el primer momento',
      during.file === 'segunda.png' && !/En el proyecto/.test(during.state || '') && after.file === 'segunda.png' && /Lista/.test(after.state || ''),
      `durante: ${JSON.stringify(during)} · después: ${JSON.stringify(after)}`);

    // An undecodable video gets advice that does not repeat the format that failed.
    await press(page.locator('#st .st-nodebtn[data-node="entity.artwork.division-tercera"]').first());
    await page.evaluate(() => { delete window.__releaseAccept; });
    await page.locator('#st [data-media="ARTWORK_VIDEO"]').setInputFiles({ name: 'roto.mp4', mimeType: 'video/mp4', buffer: png });
    await page.waitForFunction(() => typeof window.__releaseAccept === 'function', null, { timeout: 30000 }).catch(() => {});
    await page.evaluate(() => window.__releaseAccept?.());
    const advice = await page.waitForFunction(() => {
      const t = document.querySelector('#st .st-slot[data-slot="ARTWORK_VIDEO"] .st-slotstate')?.textContent || '';
      return /No se pudo usar/.test(t) ? t.replace(/\s+/g, ' ').trim() : null;
    }, null, { timeout: 30000 }).then((h) => h.jsonValue()).catch(() => '');
    const h264 = await page.evaluate(() => document.createElement('video').canPlayType('video/mp4; codecs="avc1.42E01E"') !== '');
    check('STUDIO-VIDEO-ADVICE', 'Un vídeo que no se puede decodificar recibe un consejo coherente con el navegador',
      Boolean(advice) && !advice.includes('Prueba con un MP4 (H.264) o un WebM') && (h264 || advice.includes('WebM')), advice);

    // Saved is not applied: after a save, the preview still says it is stale,
    // and «Empezar» rebuilds instead of showing the room as last applied.
    await page.evaluate(() => { window.__releaseAccept?.(); });
    await press(page.locator('#st [data-act="save"]').first());
    await page.waitForTimeout(400);
    const stale = await page.evaluate(() => ({ flag: window.__IW_STUDIO.previewStale, label: document.querySelector('#st .st-live')?.textContent.replace(/\s+/g, ' ').trim() }));
    check('STUDIO-SAVED-NOT-APPLIED', 'Guardar no da la vista previa por aplicada', stale.flag === true && /desactualizada/.test(stale.label || ''), JSON.stringify(stale));

    // A file uploaded in this session does not exist in the next one. The
    // visitor keeps the work's original picture, with no failed requests.
    const before = consoleErrors.length;
    await page.goto(`${BASE}/index.html`);
    await page.waitForFunction(() => window.__IW?.ready === true, null, { timeout: 120000 });
    await page.waitForTimeout(1500);
    const kept = await page.evaluate(() => String(window.__IW.runtime.store.get('entity.artwork.horizonte-interrumpido')?.content?.media?.src || ''));
    const authoredErrors = consoleErrors.slice(before).filter((e) => /authored:/.test(e));
    const shopAfter = await page.evaluate(() => {
      const st = window.__IW.runtime.store; const m = st.get('entity.shop.lamina-marea');
      return { price: m?.content?.product?.price, anchor: m?.anchorId, postales: Boolean(st.get('entity.shop.postales')), postalesHotspot: Boolean(st.get('hotspot.shop.postales')) };
    });
    check('SHOP-STUDIO', 'Precio, orden y visibilidad editados en el Studio llegan a la tienda del visitante tras recargar',
      shopAfter.price === 42 && shopAfter.anchor === 'anchor.shop.wall-n1' && !shopAfter.postales && !shopAfter.postalesHotspot, JSON.stringify(shopAfter));
    check('STALE-UPLOAD', 'Tras recargar, un archivo de otra sesión no rompe la obra: se ve el original', /horizonte-interrumpido\.jpg$/.test(kept) && authoredErrors.length === 0,
      `${kept}${authoredErrors.length ? ` · ${authoredErrors[0]}` : ''}`);
    check('STUDIO-CONSOLE', 'Sin errores de consola en el Studio', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
    await context.close();
  }

  /* 3b. Audioguide: visitor panel, Studio slice, one track, reload, phone ---- */
  {
    // A short tone, generated here: a test fixture, never shipped as content.
    const wav = (seconds, hz) => {
      const rate = 8000; const n = rate * seconds; const b = Buffer.alloc(44 + n * 2);
      b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
      b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
      for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin((2 * Math.PI * hz * i) / rate) * 6000), 44 + i * 2);
      return b;
    };
    const guide = (page) => page.evaluate(() => {
      const panel = document.getElementById('iw-guide');
      const toggle = panel?.querySelector('[data-guide="toggle"]');
      return {
        ...(window.__IW_AUDIOGUIDE?.report() || {}),
        hidden: panel?.hidden ?? null,
        title: panel?.querySelector('[data-guide="title"]')?.textContent || null,
        status: panel?.querySelector('[data-guide="status"]')?.dataset.status || null,
        toggle: toggle ? toggle.textContent.trim() : null,
        transcript: (panel?.querySelector('.iw-guide__transcript p')?.textContent || '').length,
        own: Boolean(panel?.querySelector('.iw-guide__own')),
        focusedEntity: window.__IW.runtime.state.focusedEntityId,
        space: window.__IW.runtime.state.activeSpaceId,
        ducked: Boolean(window.__IW.audio?.ducked)
      };
    });

    // The visitor, with the museum as it ships: nothing to play yet, and saying so.
    {
      const { page, consoleErrors } = await openMuseum('');
      const mediaRequests = [];
      page.on('request', (req) => { if (['media'].includes(req.resourceType()) || /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac)(\?|$)/i.test(req.url())) mediaRequests.push(req.url()); });
      await page.evaluate(() => window.__IW.hud.el.enter.click());
      await page.waitForTimeout(1500);
      const idle = await guide(page);
      check('AUDIOGUIDE-NO-AUTOPLAY', 'Al entrar no suena nada ni se descarga audio: no existe reproductor hasta pulsar Reproducir',
        idle.players === 0 && idle.playing === false && idle.hidden === true && mediaRequests.length === 0, JSON.stringify({ players: idle.players, mediaRequests }));

      // Keyboard: the top bar button opens the panel, and Enter does not also
      // activate the nearest hotspot.
      await page.locator('[data-el="guideBtn"]').focus();
      await page.keyboard.press('Enter');
      await page.waitForTimeout(300);
      const open = await guide(page);
      check('AUDIOGUIDE-PANEL', 'La audioguía abre la bienvenida: estado «pendiente de audio», transcripción y ningún botón de reproducir sin archivo',
        open.hidden === false && open.selected === 'welcome' && open.status === 'PENDING_AUDIO' && open.toggle === null && open.transcript > 40 && open.players === 0,
        JSON.stringify(open));
      check('AUDIOGUIDE-KEYBOARD-OPEN', 'Con el teclado: Enter abre el panel y deja el foco en él, sin activar lo que haya cerca',
        open.focusedEntity === null && await page.evaluate(() => document.getElementById('iw-guide').contains(document.activeElement)), JSON.stringify({ focusedEntity: open.focusedEntity }));

      // A sound piece keeps its own sound apart from the narrated capsule.
      for (const id of ['portal.lobby-gallery-a', 'portal.gallery-a-archive']) await travel(page, id);
      await page.evaluate(() => window.__IW.runtime.focusEntity('entity.audio.sala-de-escucha'));
      await page.waitForFunction(() => window.__IW.runtime.state.focusedEntityId === 'entity.audio.sala-de-escucha', null, { timeout: 15000 }).catch(() => {});
      const sheetLabel = await page.evaluate(() => { const b = document.querySelector('[data-el="detailGuide"]'); return b && !b.hidden ? b.textContent.trim() : null; });
      await press(page.locator('[data-el="detailGuide"]'));
      await page.waitForTimeout(300);
      const piece = await guide(page);
      check('AUDIOGUIDE-SOUND-PIECE', 'La pieza sonora del Archivo muestra su sonido propio aparte de la cápsula narrada',
        sheetLabel === 'Cápsula (texto)' && piece.selected === 'work:entity.audio.sala-de-escucha' && piece.own && piece.toggle === null,
        JSON.stringify({ sheetLabel, selected: piece.selected, own: piece.own }));
      check('AUDIOGUIDE-VISITOR-CONSOLE', 'Sin errores de consola en la audioguía del visitante', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
      await page.close();
    }

    // The Studio vertical slice: attach audio, preview it as the visitor, reload.
    {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      const consoleErrors = [];
      page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
      page.on('pageerror', (error) => consoleErrors.push(String(error)));
      const studioReady = () => page.waitForFunction(() => window.__IW?.ready === true && window.__IW_STUDIO, null, { timeout: 120000 });
      await page.goto(`${BASE}/index.html?authoring=1`);
      await studioReady();
      const work = 'work:entity.artwork.horizonte-interrumpido';
      const room = 'room:space.gallery-a';
      const editor = () => page.evaluate(() => ({
        status: document.querySelector('#st [data-guide-status]')?.dataset.guideStatus || null,
        duration: document.querySelector('#st [data-bind$="|durationS"]')?.value ?? null,
        file: document.querySelector('#st [data-slot="AUDIOGUIDE_AUDIO"] .st-filename')?.textContent.trim() || null,
        title: document.querySelector('#st [data-bind$="|title"]')?.value ?? null
      }));
      const attach = async (node, name, hz) => {
        await press(page.locator(`#st .st-nodebtn[data-node="${node}"]`).first());
        await page.locator('#st [data-media="AUDIOGUIDE_AUDIO"]').setInputFiles({ name, mimeType: 'audio/wav', buffer: wav(20, hz) });
        await page.waitForFunction(() => document.querySelector('#st [data-guide-status]')?.dataset.guideStatus === 'AVAILABLE_SESSION', null, { timeout: 20000 }).catch(() => {});
        return editor();
      };
      await press(page.locator('#st .st-nodebtn[data-node="entity.artwork.horizonte-interrumpido"]').first());
      await page.locator(`#st [data-bind="audioguide|${work}|es|title"]`).fill('Cápsula de prueba');
      const w = await attach('entity.artwork.horizonte-interrumpido', 'capsula.wav', 440);
      check('AUDIOGUIDE-STUDIO-UPLOAD', 'El Studio acepta un audio, mide su duración y la pista pasa a «disponible en este navegador»',
        w.status === 'AVAILABLE_SESSION' && w.duration === '20' && w.file === 'capsula.wav', JSON.stringify(w));
      await page.locator('#st [data-guide-locale]').selectOption('en');
      const en = await editor();
      await page.locator('#st [data-guide-locale]').selectOption('es');
      check('AUDIOGUIDE-STUDIO-LOCALE', 'El audio pertenece a un idioma: en inglés la misma obra sigue sin archivo',
        en.status !== 'AVAILABLE_SESSION' && en.file === 'Ningún archivo seleccionado', JSON.stringify(en));
      const r = await attach('space.gallery-a', 'sala.wav', 330);
      await press(page.locator('#st [data-domain="visitor"]').first());
      const inventory = await page.evaluate(() => ({
        items: document.querySelectorAll('#st [data-guide-inventory] [data-guide-item]').length,
        ready: [...document.querySelectorAll('#st [data-guide-inventory] [data-guide-state="AVAILABLE_SESSION"]')].length
      }));
      check('AUDIOGUIDE-STUDIO-INVENTORY', 'El inventario del Studio lista las 24 pistas y cuáles tienen audio',
        inventory.items === 24 && inventory.ready === 2 && r.status === 'AVAILABLE_SESSION', JSON.stringify({ ...inventory, room: r.status }));

      await press(page.locator('#st [data-act="save"]').first());
      await page.waitForTimeout(500);
      await press(page.locator('#st [data-act="start"]').first());
      await page.waitForFunction(() => !document.body.dataset.studio && window.__IW?.ready === true && window.__IW_AUDIOGUIDE, null, { timeout: 240000 });
      await page.waitForTimeout(800);
      await page.evaluate(() => window.__IW.hud.el.enter.click());
      await page.waitForTimeout(800);
      // SwiftShader: drawing a WebGL frame on the CPU starves the main thread
      // and the <audio> element never gets past loading (readyState 0). The loop
      // keeps running, so events and room changes are real; only drawing stops.
      await page.evaluate(() => { window.__IW.renderHost.render = () => {}; window.__IW.runtime.sceneKit.renderPortalPass = () => {}; });
      await travel(page, 'portal.lobby-gallery-a');
      await page.evaluate(() => window.__IW.runtime.focusEntity('entity.artwork.horizonte-interrumpido'));
      await page.waitForFunction(() => window.__IW.runtime.state.focusedEntityId === 'entity.artwork.horizonte-interrumpido', null, { timeout: 15000 }).catch(() => {});
      const listen = await page.evaluate(() => document.querySelector('[data-el="detailGuide"]')?.textContent.trim());
      await press(page.locator('[data-el="detailGuide"]'));
      const before = await guide(page);
      await press(page.locator('#iw-guide [data-guide="toggle"]'));
      const playing = await page.waitForFunction(() => (window.__IW_AUDIOGUIDE.report().currentTime || 0) > 0.5, null, { timeout: 20000 }).then(() => true).catch(() => false);
      const g1 = await guide(page);
      check('AUDIOGUIDE-PLAY', 'La cápsula se abre desde la ficha, suena al pulsar Reproducir y baja el ambiente',
        listen === 'Escuchar cápsula' && before.players === 0 && playing && g1.playingRef === work && g1.ducked, JSON.stringify({ listen, players: before.players, t: g1.currentTime, ducked: g1.ducked }));

      // Enter on the focused button pauses, and only pauses.
      await page.locator('#iw-guide [data-guide="toggle"]').focus();
      await page.keyboard.press('Enter');
      await page.waitForTimeout(400);
      const g2 = await guide(page);
      check('AUDIOGUIDE-KEYBOARD', 'Con el teclado: Enter en «Pausar» pausa, conserva el foco y no activa nada más',
        g2.playing === false && g2.toggle === 'Reanudar' && g2.focusedEntity === 'entity.artwork.horizonte-interrumpido'
          && await page.evaluate(() => document.activeElement?.dataset?.guide === 'toggle'), JSON.stringify({ playing: g2.playing, toggle: g2.toggle }));

      // Seek, volume, stop.
      await press(page.locator('#iw-guide [data-guide="toggle"]'));
      await page.waitForTimeout(500);
      const t0 = (await guide(page)).currentTime;
      await press(page.locator('#iw-guide [data-guide="fwd"]'));
      const t1 = (await guide(page)).currentTime;
      await page.locator('#iw-guide [data-guide="volume"]').fill('0.5');
      const volume = await page.evaluate(() => document.querySelector('audio[data-audioguide]')?.volume);
      await press(page.locator('#iw-guide [data-guide="stop"]'));
      const g3 = await guide(page);
      check('AUDIOGUIDE-CONTROLS', 'Avanzar 10 s, volumen y Detener (vuelve al principio)',
        t1 - t0 > 8 && volume === 0.5 && g3.playing === false && g3.currentTime === 0 && g3.toggle === 'Reproducir', JSON.stringify({ t0, t1, volume, stop: g3.currentTime }));

      // Closing the sheet pauses that work's capsule, with a notice.
      await press(page.locator('#iw-guide [data-guide="toggle"]'));
      await page.waitForTimeout(500);
      await page.evaluate(() => window.__IW.runtime.releaseFocus());
      await page.waitForTimeout(500);
      const g4 = await guide(page);
      check('AUDIOGUIDE-SHEET-CLOSE', 'Cerrar la ficha pausa la cápsula de esa obra y lo dice', g4.playing === false && /cerrar la ficha/.test(g4.notice), g4.notice);

      // One narration at a time: the room introduction stops the capsule.
      await press(page.locator('#iw-guide [data-guide="toggle"]'));
      await page.waitForTimeout(500);
      await press(page.locator(`#iw-guide [data-guide="select"][data-ref="${room}"]`));
      await press(page.locator('#iw-guide [data-guide="toggle"]'));
      await page.waitForTimeout(800);
      const g5 = await guide(page);
      const players = await page.evaluate(() => [...document.querySelectorAll('audio')].filter((a) => !a.paused).length);
      check('AUDIOGUIDE-ONE-TRACK', 'Una pista nueva detiene la anterior: un único reproductor y una sola voz',
        g5.playingRef === room && g5.playing && g5.players === 1 && players === 1, JSON.stringify({ playingRef: g5.playingRef, players: g5.players, sounding: players }));

      await travel(page, 'portal.gallery-a-lobby');
      const g6 = await guide(page);
      check('AUDIOGUIDE-ROOM-CHANGE', 'Cambiar de sala pausa la pista, con aviso', g6.playing === false && /cambiar de sala/.test(g6.notice) && !g6.ducked, g6.notice);

      // Reload: the text survives; the file was this session's and is reported gone.
      await page.goto(`${BASE}/index.html?authoring=1`);
      await studioReady();
      await press(page.locator('#st .st-nodebtn[data-node="entity.artwork.horizonte-interrumpido"]').first());
      const reloaded = await editor();
      check('AUDIOGUIDE-PERSIST', 'Tras recargar, el texto sigue y el audio de otra sesión se declara no disponible',
        reloaded.title === 'Cápsula de prueba' && reloaded.status === 'STALE_AUDIO' && reloaded.duration === '20', JSON.stringify(reloaded));
      await page.goto(`${BASE}/index.html`);
      await page.waitForFunction(() => window.__IW?.ready === true && window.__IW_AUDIOGUIDE, null, { timeout: 120000 });
      await page.evaluate(() => window.__IW.hud.el.enter.click());
      await page.evaluate(() => window.__IW_AUDIOGUIDE.open('work:entity.artwork.horizonte-interrumpido'));
      await page.waitForTimeout(300);
      const stale = await guide(page);
      check('AUDIOGUIDE-STALE-VISITOR', 'El visitante ve «audio no disponible» y la transcripción, sin botón ni petición a un archivo inexistente',
        stale.status === 'STALE_AUDIO' && stale.toggle === null && stale.transcript > 0 && !consoleErrors.some((e) => /authored:|blob:/.test(e)), JSON.stringify({ status: stale.status, toggle: stale.toggle }));
      check('AUDIOGUIDE-STUDIO-CONSOLE', 'Sin errores de consola en el flujo Studio → visitante de la audioguía', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
      await context.close();
    }

    // Phone: the panel fits under the top bar, inside the gutters, with touch targets.
    {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
      const page = await context.newPage();
      await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
      await page.waitForFunction(() => window.__IW?.ready === true && window.__IW_AUDIOGUIDE, null, { timeout: 180000 });
      await page.evaluate(() => window.__IW.hud.el.enter.click());
      await page.waitForTimeout(800);
      await page.locator('[data-el="guideBtn"]').tap();
      await page.waitForTimeout(300);
      const fit = await page.evaluate(() => {
        const p = document.getElementById('iw-guide').getBoundingClientRect();
        const bar = document.querySelector('.iw-topbar')?.getBoundingClientRect();
        const targets = [...document.querySelectorAll('#iw-guide button')].map((b) => Math.round(b.getBoundingClientRect().height));
        return { left: Math.round(p.left), right: Math.round(innerWidth - p.right), top: Math.round(p.top), bottom: Math.round(p.bottom), barBottom: Math.round(bar?.bottom || 0), minTarget: Math.min(...targets), scrollX: document.documentElement.scrollWidth - innerWidth };
      });
      check('AUDIOGUIDE-MOBILE', 'En el móvil el panel cabe bajo la barra, con márgenes de 16 px y botones de 44 px',
        fit.left >= 16 && fit.right >= 16 && fit.top >= fit.barBottom && fit.bottom <= 844 && fit.minTarget >= 44 && fit.scrollX <= 0, JSON.stringify(fit));
      await context.close();
    }
  }

  /* 4. Avatar in every room ------------------------------------------------ */
  {
    const { page, consoleErrors } = await openMuseum('?character=1&mobility=1&continuity=1&gatea=1');
    const gate = await page.evaluate(() => ({ disabled: window.__IW.hud.el.enter.disabled, label: window.__IW.hud.el.enter.textContent.trim() }));
    check('AVATAR-ENTRY-GATED', 'Con avatar, la entrada espera a que el avatar esté listo',
      gate.disabled === true || gate.label === 'Entrar con mi avatar', JSON.stringify(gate));
    const mounted = await page.waitForFunction(() => window.__IW_CHARACTER_PHASE4B?.ready && !window.__IW.hud.el.enter.disabled, null, { timeout: 240000, polling: 1000 })
      .then(() => true).catch(() => false);
    const label = await page.evaluate(() => window.__IW.hud.el.enter.textContent.trim());
    check('AVATAR-READY', 'El avatar se monta desde el repositorio y la entrada se habilita', mounted && label === 'Entrar con mi avatar', label);
    if (mounted) {
      await page.evaluate(() => window.__IW.hud.el.enter.click());
      const route = ['portal.gallery-a-lobby', 'portal.lobby-shop', 'portal.shop-lobby', 'portal.lobby-gallery-a', 'portal.gallery-a-archive', 'portal.archive-gallery-a',
        'portal.gallery-a-gallery-b', 'portal.gallery-b-itinerant', 'portal.itinerant-gallery-b', 'portal.gallery-b-breeze', 'portal.breeze-gallery-b'];
      for (const id of route) {
        const active = await travel(page, id);
        const r = await page.evaluate(() => {
          const c = window.__IW_CHARACTER_PHASE4B; const rt = window.__IW.runtime;
          return { active: rt.state.activeSpaceId, visible: c.root.visible, cam: rt.camera.report().owner, viol: rt.camera.violations.length,
            err: c.report().continuity.error, nested: Boolean(rt.store.require(rt.state.activeSpaceId).metadata?.nestedRuntime) };
        });
        const ok = r.cam === 'THIRD_PERSON_EXPLORE' && r.viol === 0 && !r.err && (r.nested ? r.visible === false : r.visible === true);
        check(`AVATAR ${active.replace('space.', '')}`, r.nested ? 'Avatar aparcado y oculto en la sala anidada' : 'Avatar en tercera persona en la sala',
          ok, JSON.stringify(r));
      }
    }
    if (mounted) {
      // What is near is measured from the avatar, not from the camera behind it.
      await page.evaluate(async () => {
        const rt = window.__IW.runtime; const c = window.__IW_CHARACTER_PHASE4B;
        const a = rt.sceneKit.poseForAnchor(rt.store.require('entity.artwork.marea-baja').anchorId);
        c.root.position.set(a.position[0] + a.normal[0] * 1.6, c.root.position.y, a.position[2] + a.normal[2] * 1.6);
        c.root.rotation.y = Math.atan2(-a.normal[0], -a.normal[2]);
        await new Promise((r) => setTimeout(r, 1500));
      });
      const body = await page.evaluate(() => {
        const rt = window.__IW.runtime; const cam = window.__IW_CHARACTER_PHASE4A.cameraController.report().position; const c = window.__IW_CHARACTER_PHASE4B.root.position;
        return { nearest: rt.proximity.nearestHotspot?.id || null, cameraBehind: +Math.hypot(cam[0] - c.x, cam[2] - c.z).toFixed(2) };
      });
      check('AVATAR-PROXIMITY-BODY', 'Con avatar, lo cercano se mide desde el cuerpo, no desde la cámara que va detrás',
        body.nearest === 'hotspot.art.marea-baja' && body.cameraBehind > 2.4, JSON.stringify(body));

      // Breeze with the avatar and the real keyboard: in and out with E.
      await page.evaluate(async () => {
        const c = window.__IW_CHARACTER_PHASE4B; c.root.position.set(18.6, c.root.position.y, -12); c.root.rotation.y = Math.PI / 2;
        await new Promise((r) => setTimeout(r, 1500));
      });
      const doorTarget = await page.evaluate(() => window.__IW.runtime.proximity.nearestHotspot?.id || null);
      await page.locator('#iw-canvas').focus().catch(() => {});
      await page.keyboard.press('KeyE');
      const inBreeze = await page.waitForFunction(() => window.__IW.runtime.state.activeSpaceId === 'space.breeze', null, { timeout: 60000 }).then(() => true).catch(() => false);
      await page.waitForTimeout(2500);
      await page.locator('#iw-canvas').focus().catch(() => {});
      await page.keyboard.press('KeyE');
      const outBreeze = await page.waitForFunction(() => window.__IW.runtime.state.activeSpaceId === 'space.gallery-b', null, { timeout: 60000 }).then(() => true).catch(() => false);
      await page.waitForTimeout(1500);
      const visibleAgain = await page.evaluate(() => window.__IW_CHARACTER_PHASE4B.root.visible);
      check('AVATAR-BREEZE-E', 'Con avatar, E frente a la puerta entra en Breeze y E vuelve a la Galería B con el avatar visible',
        doorTarget === 'hotspot.gallery-b.to-breeze' && inBreeze && outBreeze && visibleAgain, `${doorTarget} · dentro ${inBreeze} · fuera ${outBreeze} · visible ${visibleAgain}`);

      // Deterministic walk: the RAF loop stops and the runtime is stepped with
      // chosen frame times, so smoothness is measured, not eyeballed (SwiftShader
      // FPS says nothing about a real GPU; the motion maths does not depend on it).
      await travel(page, 'portal.gallery-b-gallery-a');
      await page.waitForTimeout(1500);
      const bench = await page.evaluate(() => {
        const rt = window.__IW.runtime; rt.stopLoop();
        const render = window.__IW.renderHost.render; const portalPass = rt.sceneKit.renderPortalPass;
        window.__IW.renderHost.render = () => {}; rt.sceneKit.renderPortalPass = () => {};
        const c = window.__IW_CHARACTER_PHASE4B; const p4a = window.__IW_CHARACTER_PHASE4A; const cam = p4a.cameraController;
        const settle = (n) => { p4a.setInput({}); for (let i = 0; i < n; i++) rt.step(1 / 60); };
        const walk = (pattern, seconds = 2) => {
          settle(20); c.root.position.set(-2, c.root.position.y, -9); c.root.rotation.y = Math.PI / 2; settle(120);
          const r0 = cam.report(); const rows = []; let t = 0; let i = 0;
          p4a.setInput({ forward: 1 });
          while (t < seconds) { const dt = pattern[i++ % pattern.length]; rt.step(dt); t += dt; const r = cam.report(); rows.push({ dt, t, ax: c.root.position.x, az: c.root.position.z, cx: r.position[0], cz: r.position[2] }); }
          p4a.setInput({});
          const r1 = cam.report();
          return { rows, metres: c.root.position.x - -2, recoveries: (r1.hardEnvelopeRecoveries || 0) - (r0.hardEnvelopeRecoveries || 0), holds: (r1.comfortHolds || 0) - (r0.comfortHolds || 0) };
        };
        const metres = Object.fromEntries([['60', [1 / 60]], ['30', [1 / 30]], ['10', [1 / 10]], ['irregular', [1 / 60, 1 / 20, 1 / 45, 1 / 15, 1 / 90]]]
          .map(([k, p]) => [k, +walk(p).metres.toFixed(3)]));
        const run = walk([1 / 60, 1 / 20, 1 / 45, 1 / 15, 1 / 90]);
        let frozen = 0; let moving = 0; const ratios = [];
        for (let i = 1; i < run.rows.length; i++) {
          const a = run.rows[i]; const z = run.rows[i - 1]; if (a.t < 0.6) continue;
          const da = Math.hypot(a.ax - z.ax, a.az - z.az); const dc = Math.hypot(a.cx - z.cx, a.cz - z.cz);
          if (da > 0.003) { moving++; if (dc < 1e-5) frozen++; ratios.push(dc / da); }
        }
        const mean = ratios.reduce((x, y) => x + y, 0) / Math.max(1, ratios.length);
        const sd = Math.sqrt(ratios.reduce((x, y) => x + (y - mean) ** 2, 0) / Math.max(1, ratios.length));
        settle(20); c.root.position.set(-2, c.root.position.y, -9); c.root.rotation.y = Math.PI / 2; settle(120);
        const xs = []; p4a.setInput({ forward: 1 }); for (let i = 0; i < 60; i++) { rt.step(1 / 60); xs.push(c.root.position.x); }
        p4a.setInput({}); for (let i = 0; i < 40; i++) { rt.step(1 / 60); xs.push(c.root.position.x); }
        let jump = 0; for (let i = 2; i < xs.length; i++) jump = Math.max(jump, Math.abs((xs[i] - xs[i - 1]) - (xs[i - 1] - xs[i - 2])) * 60);
        window.__IW.renderHost.render = render; rt.sceneKit.renderPortalPass = portalPass; rt.startLoop();
        return { metres, follow: { mean: +mean.toFixed(3), sd: +sd.toFixed(3), frozen, moving, recoveries: run.recoveries, holds: run.holds }, start: { maxSpeedJump: +jump.toFixed(3), coast: +(xs.at(-1) - xs[59]).toFixed(3) } };
      });
      const spread = Math.max(...Object.values(bench.metres)) / Math.min(...Object.values(bench.metres));
      check('AVATAR-DT-INDEPENDENT', 'El avatar recorre lo mismo a 60, 30, 10 FPS y con fotogramas irregulares', spread < 1.03 && bench.metres['60'] > 1.8, JSON.stringify(bench.metres));
      check('AVATAR-CAMERA-FOLLOW', 'Caminando con fotogramas irregulares, la cámara acompaña al avatar sin quedarse quieta ni dar saltos',
        bench.follow.frozen === 0 && bench.follow.recoveries === 0 && bench.follow.holds === 0 && Math.abs(bench.follow.mean - 1) < 0.05 && bench.follow.sd < 0.05, JSON.stringify(bench.follow));
      check('AVATAR-EASE', 'El avatar arranca y se detiene con suavidad (sin pasar de 0 a velocidad máxima en un fotograma)',
        bench.start.maxSpeedJump < 0.5 && bench.start.coast > 0.02 && bench.start.coast < 0.2, JSON.stringify(bench.start));
    }
    // Walking speed must not depend on frame rate. Throttled, SwiftShader runs
    // well below 20 FPS; the Character must cover what the runtime clock grants
    // (Σ min(Δt, 0.5 s) × FORWARD_SPEED 1.05 m/s, less the quarter-second ease
    // to full speed), not a fixed 0.05 s per frame.
    if (mounted) {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 2 });
      const pace = await page.evaluate(async () => {
        const c = window.__IW_CHARACTER_PHASE4B; const p4a = window.__IW_CHARACTER_PHASE4A;
        const a = c.root.position.clone(); const stamps = [];
        let walking = true;
        const mark = (t) => { stamps.push(t); if (walking) requestAnimationFrame(mark); };
        requestAnimationFrame((t) => { p4a.setInput({ forward: 1 }); mark(t); });
        await new Promise((r) => setTimeout(r, 2500));
        p4a.setInput({}); walking = false;
        let granted = 0;
        for (let k = 1; k < stamps.length; k += 1) granted += Math.min((stamps[k] - stamps[k - 1]) / 1000, 0.5);
        const b = c.root.position;
        return { metres: +Math.hypot(b.x - a.x, b.z - a.z).toFixed(2), expected: +Math.max(0, granted * p4a.locomotion.forwardSpeed - p4a.locomotion.startLag).toFixed(2),
          fps: +((stamps.length - 1) / Math.max(0.001, (stamps.at(-1) - stamps[0]) / 1000)).toFixed(1) };
      });
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      const ratio = pace.metres / Math.max(pace.expected, 0.001);
      check('AVATAR-PACE-LOW-FPS', 'Con pocos FPS, el avatar camina a su velocidad (sin cámara lenta)', ratio >= 0.8 && pace.expected > 0.4,
        `${JSON.stringify(pace)} · ${(ratio * 100).toFixed(0)} % de lo esperado`);
    }
    check('AVATAR CONSOLE', 'Sin errores de consola con avatar', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
    await page.close();
  }
  /* 5. Phone (390×844, touch): layout, doors, map, label framing, avatar --- */
  {
    const phone = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 };
    const openPhone = async (query) => {
      const context = await browser.newContext(phone);
      const page = await context.newPage();
      const errors = [];
      page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
      page.on('pageerror', (error) => errors.push(String(error)));
      await page.goto(`${BASE}/index.html${query}`, { waitUntil: 'load' });
      await page.waitForFunction(() => window.__IW?.ready === true, null, { timeout: 180000 });
      const cdp = await context.newCDPSession(page);
      // A thumb on the left half of the screen: the walking joystick.
      const walk = async (ms) => {
        const touch = (type, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: 90, y, id: 1 }] });
        await touch('touchStart', 640);
        for (let y = 630; y >= 560; y -= 14) { await touch('touchMove', y); await page.waitForTimeout(50); }
        const end = Date.now() + ms;
        while (Date.now() < end) { await touch('touchMove', 560); await page.waitForTimeout(150); }
        await touch('touchEnd', 560);
      };
      return { context, page, errors, walk };
    };

    // POV visit.
    {
      const { context, page, errors, walk } = await openPhone('');
      await press(page.locator('[data-el="enter"]'), 'tap');
      await page.waitForTimeout(1000);
      const layout = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        topbar: Math.round(document.querySelector('.iw-topbar').getBoundingClientRect().height)
      }));
      check('MOBILE-LAYOUT', 'Sin desbordamiento horizontal y barra superior compacta', layout.overflow <= 1 && layout.topbar <= 130, JSON.stringify(layout));

      let prompt = null;
      for (let i = 0; i < 6 && !prompt; i += 1) {
        await walk(1400);
        prompt = await page.evaluate(() => { const el = window.__IW.hud.el.prompt; return el.hidden ? null : { tag: el.tagName, text: el.textContent.trim() }; });
      }
      let crossed = false;
      if (prompt) {
        await press(page.locator('[data-el="prompt"]'), 'tap');
        crossed = await page.waitForFunction(() => window.__IW.runtime.state.activeSpaceId === 'space.gallery-a', null, { timeout: 30000 }).then(() => true).catch(() => false);
      }
      check('MOBILE-DOOR-TAP', 'Se camina con el pulgar y se cruza la puerta tocando el aviso', prompt?.tag === 'BUTTON' && crossed, JSON.stringify(prompt));

      await press(page.locator('[data-el="mapBtn"]'), 'tap');
      await page.waitForTimeout(800);
      const clashes = await page.evaluate(() => {
        const texts = [...document.querySelectorAll('[data-el="mapSvg"] text')].map((t) => ({ label: t.textContent, b: t.getBBox() }));
        const circles = [...document.querySelectorAll('[data-el="mapSvg"] circle')].map((c) => ({ x: +c.getAttribute('cx') - 7, y: +c.getAttribute('cy') - 7, width: 14, height: 14 }));
        const hit = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
        const out = [];
        texts.forEach((t, i) => {
          texts.slice(i + 1).forEach((u) => { if (hit(t.b, u.b)) out.push(`${t.label} × ${u.label}`); });
          circles.forEach((c) => { if (hit(t.b, c)) out.push(`${t.label} × sala`); });
          if (t.b.x < 0 || t.b.y < 0 || t.b.x + t.b.width > 320 || t.b.y + t.b.height > 240) out.push(`${t.label} fuera`);
        });
        return { count: texts.length, out };
      });
      check('MAP-LABELS', 'Los nombres de sala del mapa no se pisan ni se salen', clashes.count >= 6 && clashes.out.length === 0, clashes.out.join(', ') || `${clashes.count} etiquetas`);
      await press(page.locator('[data-el="mapClose"]'), 'tap');

      await page.evaluate(() => window.__IW.runtime.focusEntity('entity.artwork.horizonte-interrumpido'));
      await page.waitForTimeout(4000);
      const framing = await page.evaluate(() => {
        const rt = window.__IW.runtime;
        const camera = window.__IW.renderHost.camera;
        const record = rt.store.require('entity.artwork.horizonte-interrumpido');
        const anchor = rt.store.require(record.anchorId);
        const toScreen = (dy) => { const v = camera.position.clone().set(anchor.position[0], anchor.position[1] + dy, anchor.position[2]).project(camera); return Math.round((1 - v.y) / 2 * innerHeight); };
        return { centre: toScreen(0), bottom: toScreen(-record.size[1] / 2), label: Math.round(document.querySelector('.iw-detail .iw-label').getBoundingClientRect().top) };
      });
      check('MOBILE-DETAIL-FRAMING', 'La obra enfocada queda por encima de la cartela', framing.bottom < framing.label, JSON.stringify(framing));
      // Wet Paint on a phone: each work, focused, sits above its sheet.
      await page.evaluate(() => window.__IW.runtime.releaseFocus());
      await page.waitForTimeout(800);
      await travel(page, 'portal.gallery-a-gallery-b');
      await travel(page, 'portal.gallery-b-itinerant');
      const phoneWorks = await page.evaluate(async () => {
        const rt = window.__IW.runtime; const camera = window.__IW.renderHost.camera; const rows = [];
        for (const e of rt.store.entitiesOf('space.itinerant-wet-paint')) {
          rt.focusEntity(e.id); await new Promise((r) => setTimeout(r, 3500));
          const anchor = rt.store.require(e.anchorId);
          const v = camera.position.clone().set(anchor.position[0], anchor.position[1] - e.size[1] / 2, anchor.position[2]).project(camera);
          const bottom = Math.round((1 - v.y) / 2 * innerHeight);
          const label = Math.round(document.querySelector('.iw-detail .iw-label').getBoundingClientRect().top);
          rows.push({ id: e.id.split('.').pop(), bottom, label, ok: bottom < label && v.z < 1 });
          rt.releaseFocus(); await new Promise((r) => setTimeout(r, 900));
        }
        return { rows, overflow: document.documentElement.scrollWidth - innerWidth };
      });
      check('MOBILE-WETPAINT-FRAMING', 'En el móvil, cada obra de Wet Paint enfocada queda por encima de su cartela',
        phoneWorks.rows.length === 5 && phoneWorks.rows.every((r) => r.ok) && phoneWorks.overflow <= 0, JSON.stringify(phoneWorks));
      check('MOBILE-POV CONSOLE', 'Sin errores de consola (móvil, POV)', errors.length === 0, errors.slice(0, 3).join(' | '));
      await context.close();
    }

    // Avatar visit.
    {
      const { context, page, errors, walk } = await openPhone('?character=1&mobility=1&continuity=1&gatea=1');
      const mounted = await page.waitForFunction(() => window.__IW_CHARACTER_PHASE4B?.ready && !window.__IW.hud.el.enter.disabled, null, { timeout: 240000, polling: 1000 })
        .then(() => true).catch(() => false);
      if (mounted) {
        await press(page.locator('[data-el="enter"]'), 'tap');
        await page.waitForTimeout(1200);
        const where = () => page.evaluate(() => window.__IW_CHARACTER_PHASE4B.root.position.toArray());
        const before = await where();
        await walk(2500);
        await page.waitForTimeout(400);
        const after = await where();
        const moved = Math.hypot(after[0] - before[0], after[2] - before[2]);
        check('MOBILE-AVATAR-TOUCH', 'El pulgar mueve al avatar', moved > 0.3, `${moved.toFixed(2)} m`);
        const frame = await page.evaluate(() => {
          const camera = window.__IW.renderHost.camera;
          const root = window.__IW_CHARACTER_PHASE4B.root;
          const at = (h) => { const v = root.position.clone(); v.y += h; v.project(camera); return +((1 - v.y) / 2).toFixed(2); };
          return { body: at(0.9), head: at(1.6) };
        });
        check('MOBILE-AVATAR-FRAMING', 'En vertical, el avatar ocupa la mitad inferior y deja ver la sala', frame.body >= 0.55, JSON.stringify(frame));
      } else {
        check('MOBILE-AVATAR-TOUCH', 'El avatar se monta en móvil', false);
      }
      check('MOBILE-AVATAR CONSOLE', 'Sin errores de consola (móvil, avatar)', errors.length === 0, errors.slice(0, 3).join(' | '));
      await context.close();
    }
  }
} finally {
  await browser.close();
  server.close();
}

if (fallbacks.length) console.log(`  info  clic por DOM tras comprobar que el elemento no estaba tapado: ${fallbacks.join(', ')}`);
console.log(failures ? `\n${failures} comprobación(es) fallida(s)` : '\nOK');
process.exit(failures ? 1 : 0);
