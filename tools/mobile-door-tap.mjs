#!/usr/bin/env node
/**
 * MOBILE-DOOR-TAP aislado (mismo fragmento que tests/museum-smoke.mjs), N intentos.
 *   node tools/mobile-door-tap.mjs --root <dir> [--runs 3] [--port 4995]
 */
import { chromium } from 'playwright';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]);
  return acc;
}, []));
const root = path.resolve(args.root || '.');
const runs = Number(args.runs || 3);
const port = Number(args.port || 4995);
const { startServer } = await import(pathToFileURL(path.join(root, 'tools/serve.mjs')).href);
const server = await startServer(port);
const browser = await chromium.launch({ headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'] });
const results = [];
for (let r = 0; r < runs; r += 1) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`.slice(0, 300)); });
  if (args.exp) await page.addInitScript((e) => { globalThis.__IW_EXP = Object.fromEntries(e.split(',').map((k) => [k, true])); }, String(args.exp));
  await page.addInitScript(() => {
    const P = WebGL2RenderingContext.prototype; const src = P.shaderSource; const link = P.linkProgram;
    window.__shaderLog = []; window.__shaderOn = false;
    P.shaderSource = function (sh, code) {
      if (window.__shaderOn && /gl_FragColor|pc_fragColor|out highp vec4/.test(code) && /FRAGMENT|fragColor/.test(code)) {
        const defs = (code.match(/^#define [A-Z_]+.*$/gm) || []).filter((d) => /USE_|NUM_|SHADER_NAME|TONE_MAPPING|ALPHA|LAMBERT|STANDARD|PHYSICAL|BASIC|FLAT|DOUBLE/.test(d)).join(' ');
        window.__shaderLog.push({ len: code.length, defs });
      }
      return src.call(this, sh, code);
    };
    P.linkProgram = function (p) { if (window.__shaderOn) window.__links = (window.__links || 0) + 1; return link.call(this, p); };
  });
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__IW?.ready === true, null, { timeout: 180000 });
  const cdp = await context.newCDPSession(page);
  const walk = async (ms) => {
    const touch = (type, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: 90, y, id: 1 }] });
    await touch('touchStart', 640);
    for (let y = 630; y >= 560; y -= 14) { await touch('touchMove', y); await page.waitForTimeout(50); }
    const end = Date.now() + ms;
    while (Date.now() < end) { await touch('touchMove', 560); await page.waitForTimeout(150); }
    await touch('touchEnd', 560);
  };
  await page.locator('[data-el="enter"]').tap({ timeout: 8000 }).catch(() => page.evaluate(() => window.__IW.hud.el.enter.click()));
  if (await page.locator('[data-el="help"]').isVisible()) {
    await page.locator('[data-el="helpClose"]').tap({ timeout: 8000 }).catch(async () => {
      if (await page.locator('[data-el="help"]').isVisible()) await page.evaluate(() => window.__IW.hud.el.helpClose.click());
    });
  }
  await page.waitForTimeout(1000);
  let prompt = null;
  for (let i = 0; i < 6 && !prompt; i += 1) {
    await walk(1400);
    prompt = await page.evaluate(() => { const el = window.__IW.hud.el.prompt; const hotspot = window.__IW.runtime.proximity.nearestHotspot; return el.hidden || hotspot?.action?.type !== 'ACTIVATE_PORTAL' ? null : { tag: el.tagName, text: el.textContent.trim(), portal: hotspot.action.target }; });
  }
  let crossed = false; let ms = null;
  if (prompt) {
    const before = await page.evaluate(() => ({ ga: window.__IW.runtime.spaces.stateOf('space.gallery-a'), crossing: window.__IW.runtime.crossing?.isCrossing }));
    console.log('antes del toque', JSON.stringify(before));
    const diag = await page.evaluate(() => new Promise((res) => {
      const rt = window.__IW.runtime; const states = {}; for (const [id, sl] of rt.spaces._slots) states[id.slice(6)] = sl.state;
      const R = window.__IW.renderHost.renderer.info; const t = []; let l = performance.now();
      const step = () => { const n = performance.now(); t.push(Math.round(n - l)); l = n; if (t.length < 5) requestAnimationFrame(step); else res({ states, frames: t, calls: R.render.calls, tris: R.render.triangles, programs: R.programs?.length, tier: rt.quality.policy.tier }); };
      requestAnimationFrame(step);
    }));
    console.log('diag', JSON.stringify(diag));
    await page.evaluate(() => { window.__shaderOn = true; const R = window.__IW.renderHost.renderer; window.__p0 = R.info.programs.length; window.__k0 = new Set(R.info.programs.map((p) => p.cacheKey)); const f = window.__tapFrames = []; let l = performance.now(); const s = () => { const n = performance.now(); f.push(Math.round(n - l)); l = n; if (f.length < 40) requestAnimationFrame(s); }; requestAnimationFrame(s); });
    await page.evaluate(() => {
      const rt = window.__IW.runtime; const log = window.__tapLog = []; const t0 = performance.now();
      const orig = rt.traversePortal.bind(rt);
      rt.traversePortal = (id, ctx) => { log.push([Math.round(performance.now() - t0), 'traverse', id, JSON.stringify(ctx || {}).slice(0, 120)]); return orig(id, ctx); };
      let last = rt.state.activeSpaceId;
      setInterval(() => { const a = rt.state.activeSpaceId; if (a !== last) { log.push([Math.round(performance.now() - t0), 'active', a]); last = a; } }, 50);
    });
    const t = Date.now();
    let cdpProf = null;
    if (args.profile) { cdpProf = await context.newCDPSession(page); await cdpProf.send('Profiler.enable'); await cdpProf.send('Profiler.setSamplingInterval', { interval: 1000 }); await cdpProf.send('Profiler.start'); }
    let tapError = null; let fallback = false;
    try {
      await page.locator('[data-el="prompt"]').tap({ timeout: 8000 });
    } catch (e) {
      tapError = String(e).split('\n')[0].slice(0, 160);
      const state = await page.evaluate(() => ({
        active: window.__IW.runtime.state.activeSpaceId,
        crossing: Boolean(window.__IW.runtime.crossing?.isCrossing),
        prompt: window.__IW.hud.el.prompt.textContent.trim(),
        disabled: window.__IW.hud.el.prompt.disabled,
        traversals: window.__tapLog.filter((entry) => entry[1] === 'traverse').length
      }));
      if (state.active !== 'space.gallery-a' && state.active === 'space.lobby' && !state.crossing && !state.disabled && state.traversals === 0 && state.prompt === prompt.text) {
        await page.evaluate(() => window.__IW.hud.el.prompt.click());
        fallback = true;
      }
    }
    console.log('toque', tapError ? `timeout de Playwright; fallback ${fallback ? 'aplicado' : 'omitido'}: ${tapError}` : 'ok a la primera', `${Date.now() - t} ms`);
    crossed = await page.waitForFunction(() => window.__IW.runtime.state.activeSpaceId === 'space.gallery-a', null, { timeout: 30000 }).then(() => true).catch(() => false);
    ms = Date.now() - t;
    if (cdpProf) {
      const { profile } = await cdpProf.send('Profiler.stop');
      const byId = new Map(profile.nodes.map((n) => [n.id, n])); const self = new Map(); const parent = new Map();
      for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
      const dt = profile.timeDeltas;
      for (let i = 0; i < profile.samples.length; i += 1) {
        let n = byId.get(profile.samples[i]); const leaf = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber}`;
        // attribute to leaf and to the first ancestor in our own code
        let k = leaf; let id = n.id; let guard = 0;
        while (id && guard++ < 60) { const m = byId.get(id); const u = m.callFrame.url; if (u && !/three\.(module|core)/.test(u) && !/^$/.test(u)) { k = `${leaf} ⇐ ${m.callFrame.functionName} ${u.split('/').pop()}:${m.callFrame.lineNumber}`; break; } id = parent.get(id); }
        self.set(k, (self.get(k) || 0) + (dt[i] || 0));
      }
      console.log('perfil', JSON.stringify([...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => [k, Math.round(v / 1000)])));
    }
  }
  const active = await page.evaluate(() => window.__IW.runtime.state.activeSpaceId);
  console.log('fotogramas durante el toque', JSON.stringify(await page.evaluate(() => window.__tapFrames || [])), 'programas', JSON.stringify(await page.evaluate(() => [window.__p0, window.__IW.renderHost.renderer.info.programs.length, window.__IW.runtime.sceneKit._thresholdPreset])), JSON.stringify(await page.evaluate(() => window.__IW.renderHost.renderer.info.programs.filter((p) => !window.__k0.has(p.cacheKey)).map((p) => p.name + ' ' + p.cacheKey.split(',').filter((x, i) => [0,1,2].includes(i) || /true/.test(x)).slice(0, 12).join('|').slice(0, 160)))));
  console.log('shaders', JSON.stringify(await page.evaluate(() => ({ links: window.__links, frag: window.__shaderLog.length, list: window.__shaderLog.map((x) => `${x.len} ${x.defs}`) }))));
  console.log('registro', JSON.stringify(await page.evaluate(() => window.__tapLog || [])));
  console.log('después', JSON.stringify(await page.evaluate(() => ({ ga: window.__IW.runtime.spaces.stateOf('space.gallery-a'), crossing: window.__IW.runtime.crossing?.isCrossing, mode: window.__IW.runtime.state.mode }))));
  const traversals = await page.evaluate(() => (window.__tapLog || []).filter((entry) => entry[1] === 'traverse').length);
  const mode = await page.evaluate(() => window.__IW.runtime.state.mode);
  results.push({ pass: prompt?.tag === 'BUTTON' && prompt.portal === 'portal.lobby-gallery-a' && crossed && active === 'space.gallery-a' && traversals === 1 && mode !== 'GUIDED', prompt, crossed, traversals, ms, active, mode, errors: errors.slice(0, 3) });
  console.log(JSON.stringify(results.at(-1)));
  await context.close();
}
console.log(`${root} · ${results.filter((x) => x.pass).length}/${runs}`);
await browser.close();
server.close();
if (results.some((result) => !result.pass)) process.exitCode = 1;
