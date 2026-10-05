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
  await page.waitForTimeout(1000);
  let prompt = null;
  for (let i = 0; i < 6 && !prompt; i += 1) {
    await walk(1400);
    prompt = await page.evaluate(() => { const el = window.__IW.hud.el.prompt; return el.hidden ? null : { tag: el.tagName, text: el.textContent.trim() }; });
  }
  let crossed = false; let ms = null;
  if (prompt) {
    const before = await page.evaluate(() => ({ ga: window.__IW.runtime.spaces.stateOf('space.gallery-a'), crossing: window.__IW.runtime.crossing?.isCrossing }));
    console.log('antes del toque', JSON.stringify(before));
    await page.evaluate(() => {
      const rt = window.__IW.runtime; const log = window.__tapLog = []; const t0 = performance.now();
      const orig = rt.traversePortal.bind(rt);
      rt.traversePortal = (id, ctx) => { log.push([Math.round(performance.now() - t0), 'traverse', id, JSON.stringify(ctx || {}).slice(0, 120)]); return orig(id, ctx); };
      let last = rt.state.activeSpaceId;
      setInterval(() => { const a = rt.state.activeSpaceId; if (a !== last) { log.push([Math.round(performance.now() - t0), 'active', a]); last = a; } }, 50);
    });
    const t = Date.now();
    let tapError = null;
    await page.locator('[data-el="prompt"]').tap({ timeout: 8000 }).catch(async (e) => { tapError = String(e).split('\n')[0].slice(0, 160); await page.evaluate(() => window.__IW.hud.el.prompt.click()); });
    console.log('toque', tapError ? `agotó 8 s y se repitió por DOM: ${tapError}` : 'ok a la primera', `${Date.now() - t} ms`);
    crossed = await page.waitForFunction(() => window.__IW.runtime.state.activeSpaceId === 'space.gallery-a', null, { timeout: 30000 }).then(() => true).catch(() => false);
    ms = Date.now() - t;
  }
  const active = await page.evaluate(() => window.__IW.runtime.state.activeSpaceId);
  console.log('registro', JSON.stringify(await page.evaluate(() => window.__tapLog || [])));
  console.log('después', JSON.stringify(await page.evaluate(() => ({ ga: window.__IW.runtime.spaces.stateOf('space.gallery-a'), crossing: window.__IW.runtime.crossing?.isCrossing, mode: window.__IW.runtime.state.mode }))));
  results.push({ pass: prompt?.tag === 'BUTTON' && crossed, prompt, crossed, ms, active, errors: errors.slice(0, 3) });
  console.log(JSON.stringify(results.at(-1)));
  await context.close();
}
console.log(`${root} · ${results.filter((x) => x.pass).length}/${runs}`);
await browser.close();
server.close();
