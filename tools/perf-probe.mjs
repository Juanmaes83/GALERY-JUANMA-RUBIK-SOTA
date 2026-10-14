#!/usr/bin/env node
/**
 * Comparación de carga y coste de render, antes/después, en condiciones idénticas.
 *
 *   node tools/perf-probe.mjs --root <dir> --out <file.json> [--tier HIGH] [--mobile] [--port 4240]
 *
 * Mide, con el mismo navegador, viewport, calidad, recorrido y poses:
 *   - tiempo hasta `__IW.ready` y bytes transferidos por la red local;
 *   - por sala, mediana y p90 del intervalo entre fotogramas parado en la pose
 *     general y caminando hacia delante 4 s;
 *   - renderer.info (llamadas, triángulos, texturas y geometrías vivas) y heap JS.
 *
 * Limitación: Chromium headless con SwiftShader (render por software, CPU). Los
 * milisegundos por fotograma NO son los de una GPU ni los de un móvil reales;
 * sirven solo para comparar dos versiones en la misma máquina.
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
const port = Number(args.port || 4240);
const mobile = Boolean(args.mobile);
const tier = typeof args.tier === 'string' ? args.tier.toUpperCase() : null;
const only = typeof args.rooms === 'string' ? args.rooms.split(',') : null;

const { startServer } = await import(pathToFileURL(path.join(root, 'tools/serve.mjs')).href);
const server = await startServer(port);
const BASE = `http://127.0.0.1:${port}`;
const browser = await chromium.launch({ headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--enable-precise-memory-info'] });
const glRenderer = async (p) => p.evaluate(() => { const gl = document.createElement('canvas').getContext('webgl2'); const e = gl?.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl?.getParameter(gl.RENDERER); });
const context = await browser.newContext(mobile
  ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' }
  : { viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
let bytes = 0;
const failed = [];
const errors = [];
page.on('response', async (r) => { try { const b = await r.body(); bytes += b.length; } catch { /* streamed */ } });
page.on('requestfailed', (r) => failed.push(r.url()));
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

const t0 = Date.now();
await page.goto(`${BASE}/index.html${tier ? `?tier=${tier}` : ''}`, { waitUntil: 'load' });
const loadMs = Date.now() - t0;
await page.waitForFunction(() => window.__IW?.ready === true, null, { timeout: 300000 });
const readyMs = Date.now() - t0;
const bytesAtReady = bytes;
// The candidate generates floor maps in a worker after `ready`; the base has
// no such module. Either way, record when the visuals are complete.
const floorsAtReady = await page.evaluate(async () => {
  try { const m = await import('/scene-kits/museum/surfaces.js'); return typeof m.floorStatus === 'function' ? m.floorStatus() : null; } catch { return null; }
});
const floorsPreviewMs = await page.evaluate(async () => {
  try {
    const m = await import('/scene-kits/museum/surfaces.js');
    if (typeof m.pendingFloorPreviews !== 'function') return null;
    while (m.pendingFloorPreviews() > 0) await new Promise((r) => setTimeout(r, 25));
    return 0;
  } catch { return null; }
}).then((v) => (v === null ? null : Date.now() - t0));
const floorsReadyMs = await page.evaluate(async () => {
  try {
    const m = await import('/scene-kits/museum/surfaces.js');
    if (typeof m.pendingFloorSurfaces !== 'function') return null;
    while (m.pendingFloorSurfaces() > 0) await new Promise((r) => setTimeout(r, 50));
    return 0;
  } catch { return null; }
}).then((v) => (v === null ? null : Date.now() - t0));
await page.evaluate(async () => { window.__IW.hud.el.enter.click(); await new Promise((r) => setTimeout(r, 1200)); });

const route = [
  ['space.lobby', null], ['space.shop', 'portal.lobby-shop'], ['space.lobby', 'portal.shop-lobby'],
  ['space.gallery-a', 'portal.lobby-gallery-a'], ['space.archive', 'portal.gallery-a-archive'],
  ['space.gallery-a', 'portal.archive-gallery-a'], ['space.gallery-b', 'portal.gallery-a-gallery-b'],
  ['space.itinerant-wet-paint', 'portal.gallery-b-itinerant']
];

const sampleFrames = (n) => page.evaluate((count) => new Promise((resolve) => {
  const t = []; let last = performance.now();
  const step = () => { const now = performance.now(); t.push(now - last); last = now; if (t.length < count) requestAnimationFrame(step); else resolve(t); };
  requestAnimationFrame(step);
}), n);
const stats = (a) => { const s = [...a].sort((x, y) => x - y); return { median: +s[Math.floor(s.length / 2)].toFixed(1), p90: +s[Math.floor(s.length * 0.9)].toFixed(1), n: s.length }; };

const floorsIdle = () => page.evaluate(async () => {
  try {
    const m = await import('/scene-kits/museum/surfaces.js');
    if (typeof m.pendingFloorSurfaces !== 'function') return;
    while (m.pendingFloorSurfaces() > 0) await new Promise((r) => setTimeout(r, 50));
  } catch { /* base: no such module */ }
});
const rooms = {};
const seen = new Set();
for (const [spaceId, portal] of route) {
  let crossMs = null;
  if (portal) {
    crossMs = await page.evaluate(async (id) => {
      const rt = window.__IW.runtime; const a = performance.now(); await rt.traversePortal(id, { source: 'QA' });
      const target = rt.store.require(id).toSpaceId; const end = performance.now() + 60000;
      while (rt.state.activeSpaceId !== target && performance.now() < end) await new Promise((r) => setTimeout(r, 20));
      return Math.round(performance.now() - a);
    }, portal);
  }
  // What the visitor finds on arrival: the room's floor state (candidate only).
  const floorOnArrival = await page.evaluate(async (id) => {
    try {
      const m = await import('/scene-kits/museum/surfaces.js');
      if (typeof m.floorStatus !== 'function') return null;
      const finish = { 'space.lobby': 'limestone', 'space.gallery-a': 'oak', 'space.itinerant-wet-paint': 'concrete', 'space.shop': 'terrazzo', 'space.gallery-b': 'smoked-oak', 'space.archive': 'parquet' }[id];
      return m.floorStatus()[finish] || 'unbuilt';
    } catch { return null; }
  }, spaceId);
  if (seen.has(spaceId)) { if (crossMs !== null && rooms[spaceId]) (rooms[spaceId].crossMs ||= []).push(crossMs); continue; }
  seen.add(spaceId);
  if (only && !only.includes(spaceId)) continue;
  // Same general pose as tools/visual-capture.mjs.
  await page.evaluate((id) => {
    const rt = window.__IW.runtime; const space = rt.store.require(id);
    const [w, , d] = space.bounds.size; const [ox, oy, oz] = space.bounds.origin;
    const anchors = rt.store.entitiesOf(id).map((e) => rt.store.get(e.anchorId)).filter(Boolean);
    const C = anchors.length ? [anchors.reduce((s, a) => s + a.position[0], 0) / anchors.length, anchors.reduce((s, a) => s + a.position[2], 0) / anchors.length] : [ox, oz];
    const inset = Math.min(1.1, w * 0.12, d * 0.12);
    const corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => [ox + sx * (w / 2 - inset), oz + sz * (d / 2 - inset)]);
    const P = corners.sort((a, b) => Math.hypot(b[0] - C[0], b[1] - C[1]) - Math.hypot(a[0] - C[0], a[1] - C[1]))[0];
    const T = [0.45 * ox + 0.55 * C[0], 0.45 * oz + 0.55 * C[1]];
    rt.explore.setPose({ position: [P[0], oy + 1.62, P[1]], yaw: Math.atan2(T[0] - P[0], T[1] - P[1]), pitch: 0.05 });
  }, spaceId);
  await floorsIdle();
  await page.waitForTimeout(2500);
  const still = stats(await sampleFrames(8));
  const info = await page.evaluate(() => {
    const r = window.__IW.renderHost.renderer.info;
    return { calls: r.render.calls, triangles: r.render.triangles, textures: r.memory.textures, geometries: r.memory.geometries,
      heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null };
  });
  await page.evaluate(() => { window.__IW.runtime.explore.input.forward = 1; });
  const walking = stats(await sampleFrames(8));
  await page.evaluate(() => { window.__IW.runtime.explore.input.forward = 0; });
  rooms[spaceId] = { still, walking, ...info, crossMs: crossMs === null ? [] : [crossMs], floorOnArrival };
  console.log(spaceId, JSON.stringify(rooms[spaceId]));
}

// The probe's own import of the candidate-only module 404s on the base. That
// request is the probe's, not the museum's: drop it and its console line.
const probeOnly = (u) => /\/scene-kits\/museum\/surfaces\.js$/.test(u);
const probeMisses = failed.filter(probeOnly).length;
for (let k = 0; k < probeMisses; k += 1) {
  const i = errors.findIndex((e) => /404 \(Not Found\)/.test(e));
  if (i >= 0) errors.splice(i, 1);
}
failed.splice(0, failed.length, ...failed.filter((u) => !probeOnly(u)));

const result = {
  root, tier: tier || 'auto', mobile, renderer: await glRenderer(page),
  policy: await page.evaluate(() => { const q = window.__IW.runtime.quality.policy; return { tier: q.tier, shadows: q.shadows, textureScale: q.textureScale, dprCap: q.dprCap }; }),
  loadMs, readyMs, floorsAtReady, floorsPreviewMs, floorsReadyMs, bytesAtReadyMB: +(bytesAtReady / 1048576).toFixed(2), bytesTotalMB: +(bytes / 1048576).toFixed(2),
  failedRequests: failed, pageErrors: errors, rooms
};
fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
fs.writeFileSync(path.resolve(args.out), JSON.stringify(result, null, 2));
console.log(`ready ${readyMs} ms · ${result.bytesAtReadyMB} MB · errores ${errors.length} · fallidas ${failed.length}`);
await browser.close();
server.close();
