#!/usr/bin/env node
/**
 * Recorrido grabado fotograma a fotograma (para revisión humana).
 *
 *   node tools/walkthrough-frames.mjs --root <dir> --out <carpeta> [--tier HIGH] [--mobile] [--port 4990]
 *
 * Camina unos pasos desde donde deja al visitante cada cruce y cruza la siguiente puerta por el portal real: Vestíbulo → Galería A →
 * Galería B → Wet Paint, y Galería A → Archivo; Vestíbulo → Tienda al principio.
 * Guarda cada fotograma renderizado como PNG (frame-0001.png…) y `meta.json`.
 * Después se monta un vídeo con ffmpeg a ritmo fijo.
 *
 * LIMITACIÓN: con SwiftShader un fotograma tarda segundos. El vídeo resultante es
 * una SECUENCIA DE FOTOGRAMAS, no tiempo real, y no prueba la fluidez de ninguna
 * GPU ni móvil.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]);
  return acc;
}, []));
const root = path.resolve(args.root || '.');
const out = path.resolve(args.out);
const mobile = Boolean(args.mobile);
const tier = typeof args.tier === 'string' ? args.tier.toUpperCase() : null;
const port = Number(args.port || 4990);
fs.mkdirSync(out, { recursive: true });

const { startServer } = await import(pathToFileURL(path.join(root, 'tools/serve.mjs')).href);
const server = await startServer(port);
const browser = await chromium.launch({ headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'] });
const context = await browser.newContext(mobile
  ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' }
  : { viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`http://127.0.0.1:${port}/index.html${tier ? `?tier=${tier}` : ''}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__IW?.ready === true, null, { timeout: 300000 });
await page.evaluate(async () => { window.__IW.hud.el.enter.click(); await new Promise((r) => setTimeout(r, 2000)); });

let n = 0;
const frames = [];
const shot = async (label) => {
  n += 1;
  const file = `frame-${String(n).padStart(4, '0')}.png`;
  await page.screenshot({ path: path.join(out, file), timeout: 120000 });
  const room = await page.evaluate(() => window.__IW.runtime.state.activeSpaceId);
  frames.push({ file, label, room });
};

/** Walk forward from wherever the visitor stands (the pose the last crossing left). */
const approach = async (portalId, steps) => {
  await page.evaluate(() => { window.__IW.runtime.explore.input.forward = 1; });
  for (let i = 0; i < steps; i += 1) await shot(`caminar (siguiente puerta: ${portalId})`);
  await page.evaluate(() => { window.__IW.runtime.explore.input.forward = 0; });
};

const cross = async (portalId, settle) => {
  await page.evaluate((id) => { window.__IW.runtime.traversePortal(id, { source: 'QA' }); }, portalId);
  const target = await page.evaluate((id) => window.__IW.runtime.store.require(id).toSpaceId, portalId);
  for (let i = 0; i < 40; i += 1) {
    await shot(`cruzar ${portalId}`);
    if (await page.evaluate((t) => window.__IW.runtime.state.activeSpaceId === t, target)) break;
  }
  for (let i = 0; i < settle; i += 1) await shot(`llegada ${target}`);
};

const camera = await page.evaluate(() => window.__IW.runtime.camera?.authority || window.__IW.runtime.camera?.mode || null).catch(() => null);
const walk = 6;
await approach('portal.lobby-shop', walk); await cross('portal.lobby-shop', 4);
await approach('portal.shop-lobby', walk); await cross('portal.shop-lobby', 3);
await approach('portal.lobby-gallery-a', walk); await cross('portal.lobby-gallery-a', 4);
await approach('portal.gallery-a-archive', walk); await cross('portal.gallery-a-archive', 4);
await approach('portal.archive-gallery-a', walk); await cross('portal.archive-gallery-a', 3);
await approach('portal.gallery-a-gallery-b', walk); await cross('portal.gallery-a-gallery-b', 4);
await approach('portal.gallery-b-itinerant', walk); await cross('portal.gallery-b-itinerant', 6);

const renderer = await page.evaluate(() => { const gl = document.createElement('canvas').getContext('webgl2'); const e = gl?.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : null; });
const policy = await page.evaluate(() => { const q = window.__IW.runtime.quality.policy; return { tier: q.tier, shadows: q.shadows, textureScale: q.textureScale }; });
fs.writeFileSync(path.join(out, 'meta.json'), JSON.stringify({ root, mobile, viewport: mobile ? '390x844@2x' : '1280x800', policy, renderer, camera, errors, frames }, null, 1));
console.log(`fotogramas ${frames.length} · errores ${errors.length}`);
await browser.close();
server.close();
