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

    // Replacing a file: while the new one loads, the slot must already describe
    // it, never the previous record (whose asset has just been released).
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    await page.locator('#st .st-nodebtn[data-node="entity.artwork.horizonte-interrumpido"]').first().click();
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
    await page.locator('#st .st-nodebtn[data-node="entity.artwork.division-tercera"]').first().click();
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
    await page.locator('#st [data-act="save"]').first().click();
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
    check('STALE-UPLOAD', 'Tras recargar, un archivo de otra sesión no rompe la obra: se ve el original', /horizonte-interrumpido\.jpg$/.test(kept) && authoredErrors.length === 0,
      `${kept}${authoredErrors.length ? ` · ${authoredErrors[0]}` : ''}`);
    check('STUDIO-CONSOLE', 'Sin errores de consola en el Studio', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
    await context.close();
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
      const route = ['portal.gallery-a-lobby', 'portal.lobby-gallery-a', 'portal.gallery-a-archive', 'portal.archive-gallery-a',
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
      await page.locator('[data-el="enter"]').tap();
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
        await page.locator('[data-el="prompt"]').tap();
        crossed = await page.waitForFunction(() => window.__IW.runtime.state.activeSpaceId === 'space.gallery-a', null, { timeout: 30000 }).then(() => true).catch(() => false);
      }
      check('MOBILE-DOOR-TAP', 'Se camina con el pulgar y se cruza la puerta tocando el aviso', prompt?.tag === 'BUTTON' && crossed, JSON.stringify(prompt));

      await page.locator('[data-el="mapBtn"]').tap();
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
      await page.locator('[data-el="mapClose"]').tap();

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
      check('MOBILE-POV CONSOLE', 'Sin errores de consola (móvil, POV)', errors.length === 0, errors.slice(0, 3).join(' | '));
      await context.close();
    }

    // Avatar visit.
    {
      const { context, page, errors, walk } = await openPhone('?character=1&mobility=1&continuity=1&gatea=1');
      const mounted = await page.waitForFunction(() => window.__IW_CHARACTER_PHASE4B?.ready && !window.__IW.hud.el.enter.disabled, null, { timeout: 240000, polling: 1000 })
        .then(() => true).catch(() => false);
      if (mounted) {
        await page.locator('[data-el="enter"]').tap();
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

console.log(failures ? `\n${failures} comprobación(es) fallida(s)` : '\nOK');
process.exit(failures ? 1 : 0);
