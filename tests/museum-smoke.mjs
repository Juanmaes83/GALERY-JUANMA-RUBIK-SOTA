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
 *   - Sala Breeze sin Breeze Studio PRO: aviso explícito y salida a Galería B;
 *   - Marble Bust 01 cargado como GLB local y su fallback forzado;
 *   - Studio (`?authoring=1`): montaje, áreas, guardado y recarga.
 * El avatar (Character 2027) depende de un host externo y se informa aparte.
 */
import { chromium } from 'playwright';
import { startServer } from '../tools/serve.mjs';

const PORT = Number(process.env.MUSEUM_TEST_PORT || 4199);
const BASE = `http://127.0.0.1:${PORT}`;
const BREEZE_PRO_PATH = '/labs/website-modules-source/breeze-studio-pro/index.html';
const AVATAR_HOST = 'pub-0f344e596c324724a0b7300e3bc1d129.r2.dev';

let failures = 0;
function check(id, claim, pass, detail = '') {
  if (!pass) failures += 1;
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${id.padEnd(28)} ${claim}${detail ? `  — ${detail}` : ''}`);
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
  return { page, consoleErrors, externalRequests };
}

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
  }, portalId);
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
    await page.waitForSelector('[data-breeze-unavailable="true"]', { timeout: 30000 }).catch(() => null);
    const breeze = await page.evaluate(() => ({
      notice: Boolean(document.querySelector('[data-breeze-unavailable="true"]')),
      iframe: Boolean(document.querySelector('iframe[data-nested-room-studio="room.breeze"]')),
      exit: Boolean(document.querySelector('[data-breeze-museum-exit]'))
    }));
    check('BREEZE-NOTICE', 'Sala Breeze muestra el aviso de producto no incluido', breeze.notice && !breeze.iframe);

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
    await page.waitForSelector('[data-breeze-unavailable="true"]', { timeout: 30000 }).catch(() => null);
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
    const noticeGone = await page.evaluate(() => !document.querySelector('[data-breeze-unavailable="true"]'));
    check('BREEZE-EXIT', 'Clic real en «Volver a Galería B» cruza el portal canónico y retira el aviso', exitClicked && back === 'space.gallery-b' && noticeGone);

    const failedLocal = requests.filter((r) => r.status >= 400 && r.url.split('?')[0] !== BREEZE_PRO_PATH);
    check('NO-BROKEN-REQUESTS', 'Ninguna petición local falla (salvo la sonda de Breeze PRO)', failedLocal.length === 0,
      failedLocal.length ? failedLocal.map((r) => `${r.status} ${r.url}`).join(', ') : `${requests.length} peticiones`);
    check('NO-EXTERNAL-REQUESTS', 'La visita base no depende de la red externa', externalRequests.length === 0, externalRequests.join(', '));
    const relevantErrors = consoleErrors.filter((text) => !text.includes(BREEZE_PRO_PATH) && !/404 \(Not Found\)/.test(text));
    check('NO-CONSOLE-ERRORS', 'Sin errores de consola', relevantErrors.length === 0, relevantErrors.slice(0, 3).join(' | '));
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
    await page.locator('[data-act="save"]').first().click();
    const saved = await page.waitForFunction((value) => (localStorage.getItem('iw.museum.authoring.v1') || '').includes(value), claim, { timeout: 15000 })
      .then(() => true).catch(() => false);
    check('STUDIO-SAVE', 'Guardar persiste la configuración (localStorage)', saved);

    await page.reload();
    await ready();
    const restored = await page.locator('[data-bind="institution.claim"]').first().inputValue().catch(() => null);
    check('STUDIO-RELOAD', 'La edición sobrevive a la recarga', restored === claim, restored);
    check('STUDIO-CONSOLE', 'Sin errores de consola en el Studio', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
    await context.close();
  }

  /* 4. Avatar: informative only, depends on an external host ---------------- */
  {
    const { page } = await openMuseum('?character=1');
    await page.waitForFunction(() => document.documentElement.dataset.characterGate || window.__IW_CHARACTER_PHASE3 || null, null, { timeout: 45000 }).catch(() => null);
    const gate = await page.evaluate(() => document.documentElement.dataset.characterGateError || document.documentElement.dataset.characterGate || 'sin señal');
    console.log(`  info  AVATAR                       ?character=1 → ${gate} (asset remoto en ${AVATAR_HOST}; no forma parte del resultado)`);
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}

console.log(failures ? `\n${failures} comprobación(es) fallida(s)` : '\nOK');
process.exit(failures ? 1 : 0);
