#!/usr/bin/env node
/**
 * Captura visual comparable de las siete salas (Playwright + Chromium).
 *
 *   node tools/visual-capture.mjs --root <dir> --out <dir> [--tier HIGH] [--mobile] [--port 4210]
 *
 * --root   carpeta del sitio a servir (p. ej. una copia de trabajo del commit base)
 * --out    carpeta donde se escriben los PNG y manifest.json
 * --tier   fija ?tier= (LOW|MEDIUM|HIGH). Sin --tier decide el sistema de calidad.
 * --mobile viewport 390×844, táctil, UA de iPhone (el sistema de calidad lo trata
 *          como móvil: sin sombras, DPR limitado).
 *
 * WebGL se obtiene con SwiftShader (render por software): sirve para comparar
 * imagen, no mide rendimiento ni equivale a una GPU o a un móvil reales.
 *
 * Las poses de cámara se calculan desde los límites de cada sala y sus anchors
 * en el World, que es el mismo antes y después: la comparación es justa.
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
const out = path.resolve(args.out || 'docs/visual-validation/after');
const port = Number(args.port || 4210);
const mobile = Boolean(args.mobile);
const tier = typeof args.tier === 'string' ? args.tier.toUpperCase() : null;
const only = typeof args.rooms === 'string' ? args.rooms.split(',') : null;
fs.mkdirSync(out, { recursive: true });

const { startServer } = await import(pathToFileURL(path.join(root, 'tools/serve.mjs')).href);
const server = await startServer(port);
const BASE = `http://127.0.0.1:${port}`;

const browser = await chromium.launch({
  headless: true,
  // --webgpu: WebGPU through SwiftShader too, so the nested Sala Breeze can
  // render. Opt-in, so a run without it reproduces the plain WebGL setup of
  // tests/museum-smoke.mjs. (Screenshots need a long timeout either way: one
  // software-rendered frame takes ~2.5 s here.)
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox',
    ...(args.webgpu ? ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-features=Vulkan'] : [])]
});
const context = await browser.newContext(mobile
  ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' }
  : { viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

const query = tier ? `?tier=${tier}` : '';
const t0 = Date.now();
await page.goto(`${BASE}/index.html${query}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__IW?.ready === true || document.documentElement.dataset.iwError, null, { timeout: 240000 });
await page.evaluate(async () => {
  const hud = window.__IW.hud;
  if (!hud.el.enter.hidden) hud.el.enter.click();
  await new Promise((r) => setTimeout(r, 1200));
});
const bootMs = Date.now() - t0;
// Wait for floor maps generated in a worker (candidate only; the base has no
// such module), so every capture shows the finished room.
await page.evaluate(async () => {
  try {
    const m = await import('/scene-kits/museum/surfaces.js');
    if (typeof m.pendingFloorSurfaces !== 'function') return;
    while (m.pendingFloorSurfaces() > 0) await new Promise((r) => setTimeout(r, 50));
  } catch { /* base */ }
});

// Route through real portals, as a visitor would: lobby → shop → lobby →
// gallery A → archive → gallery A → gallery B → wet paint → gallery B → breeze.
const route = [
  ['space.lobby', null],
  ['space.shop', 'portal.lobby-shop'],
  ['space.lobby', 'portal.shop-lobby'],
  ['space.gallery-a', 'portal.lobby-gallery-a'],
  ['space.archive', 'portal.gallery-a-archive'],
  ['space.gallery-a', 'portal.archive-gallery-a'],
  ['space.gallery-b', 'portal.gallery-a-gallery-b'],
  ['space.itinerant-wet-paint', 'portal.gallery-b-itinerant'],
  ['space.gallery-b', 'portal.itinerant-gallery-b'],
  ['space.breeze', 'portal.gallery-b-breeze']
];

const travel = (id) => page.evaluate(async (portalId) => {
  const rt = window.__IW.runtime;
  await rt.traversePortal(portalId, { source: 'QA' });
  const target = rt.store.require(portalId).toSpaceId;
  const deadline = performance.now() + 60000;
  while (rt.state.activeSpaceId !== target && performance.now() < deadline) await new Promise((r) => setTimeout(r, 100));
  return rt.state.activeSpaceId;
}, id);

// Camera poses derived from the World only (bounds, anchors, entities).
const detail = Boolean(args.detalle);
const posesFor = (spaceId) => page.evaluate(([id, detail]) => {
  const rt = window.__IW.runtime;
  const space = rt.store.require(id);
  const [w, h, d] = space.bounds.size;
  const [ox, oy, oz] = space.bounds.origin;
  const eye = oy + 1.62;
  const poses = [];
  // Overview: from the corner farthest from what the room exhibits, looking
  // back across the room towards it, so floor, walls, ceiling and the works
  // are all in one frame.
  const anchors = rt.store.entitiesOf(id).map((e) => rt.store.get(e.anchorId)).filter(Boolean);
  const C = anchors.length
    ? [anchors.reduce((s, a) => s + a.position[0], 0) / anchors.length, anchors.reduce((s, a) => s + a.position[2], 0) / anchors.length]
    : [ox, oz];
  const inset = Math.min(1.1, w * 0.12, d * 0.12);
  const corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => [ox + sx * (w / 2 - inset), oz + sz * (d / 2 - inset)]);
  const P = corners.sort((a, b) => Math.hypot(b[0] - C[0], b[1] - C[1]) - Math.hypot(a[0] - C[0], a[1] - C[1]))[0];
  const T = [0.45 * ox + 0.55 * C[0], 0.45 * oz + 0.55 * C[1]];
  poses.push({ view: 'general', position: [P[0], eye, P[1]], yaw: Math.atan2(T[0] - P[0], T[1] - P[1]), pitch: 0.05 });
  // Exhibition view: the room's first exhibited thing, from 2.6 m, square on.
  const order = ['ARTWORK', 'SCULPTURE', 'PROJECTION', 'TEXT', 'AUDIO', 'OBJECT_3D'];
  const ents = rt.store.entitiesOf(id).slice().sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  const pick = ents[0];
  if (pick) {
    const a = rt.store.get(pick.anchorId);
    const n = a.normal || [0, 0, 1];
    const flat = a.kind !== 'WALL';
    const dist = flat ? 2.4 : 2.6;
    // A free-standing piece is seen from the room's centre side.
    let dir = flat ? [ox - a.position[0], 0, oz - a.position[2]] : [n[0], 0, n[2]];
    const len = Math.hypot(dir[0], dir[2]) || 1; dir = [dir[0] / len, 0, dir[2] / len];
    const p = [a.position[0] + dir[0] * dist, eye, a.position[2] + dir[2] * dist];
    const targetY = flat ? oy + 1.0 : a.position[1];
    poses.push({ view: 'exposicion', entity: pick.id, position: p,
      yaw: Math.atan2(-dir[0], -dir[2]), pitch: Math.atan2(targetY - eye, dist) });
  }
  if (detail) {
    // Close-ups for review (--detalle): the floor from the overview position,
    // the ceiling where the room has a ceiling treatment, and the exhibited
    // piece from 1.2 m at an angle, so frame depth, label thickness and any
    // dado read at full size.
    const g = poses[0];
    poses.push({ view: 'detalle-suelo', position: g.position, yaw: g.yaw, pitch: -0.62 });
    if (id === 'space.gallery-b' || id === 'space.archive') poses.push({ view: 'detalle-techo', position: g.position, yaw: g.yaw, pitch: 0.55 });
    const e = poses.find((q) => q.view === 'exposicion');
    if (e) {
      const a = rt.store.get(rt.store.require(e.entity).anchorId);
      const ang = Math.atan2(e.position[0] - a.position[0], e.position[2] - a.position[2]) + 0.55;
      const p = [a.position[0] + Math.sin(ang) * 1.3, eye, a.position[2] + Math.cos(ang) * 1.3];
      poses.push({ view: 'detalle-obra', entity: e.entity, position: p, yaw: Math.atan2(a.position[0] - p[0], a.position[2] - p[2]), pitch: -0.3 });
    }
  }
  return poses;
}, [spaceId, detail]);

const floorsIdle = () => page.evaluate(async () => {
  try {
    const m = await import('/scene-kits/museum/surfaces.js');
    if (typeof m.pendingFloorSurfaces !== 'function') return;
    while (m.pendingFloorSurfaces() > 0) await new Promise((r) => setTimeout(r, 50));
  } catch { /* base: no such module */ }
});
const manifest = { root, tier: tier || 'auto', mobile, bootMs, shots: [], errors };
const seen = new Set();
for (const [spaceId, portal] of route) {
  if (portal) {
    const active = await travel(portal);
    if (active !== spaceId) { manifest.shots.push({ spaceId, error: `travel ${portal} → ${active}` }); continue; }
  }
  if (seen.has(spaceId) || (only && !only.includes(spaceId))) continue;
  seen.add(spaceId);
  if (spaceId === 'space.breeze') {
    // The nested room mounts its own WebGPU studio in an iframe; give it time.
    await page.waitForSelector('iframe[data-nested-room-studio], [data-breeze-unavailable]', { timeout: 120000 }).catch(() => null);
    await page.waitForTimeout(45000);
    const file = `breeze--sala${mobile ? '--movil' : ''}.png`;
    const state = await page.evaluate(() => ({
      iframe: Boolean(document.querySelector('iframe[data-nested-room-studio]')),
      notice: document.querySelector('[data-breeze-unavailable]')?.dataset.breezeUnavailable || null
    }));
    await page.screenshot({ path: path.join(out, file), timeout: 120000 });
    manifest.shots.push({ spaceId, view: 'sala', file, state });
    console.log(`${file}  ${JSON.stringify(state)}`);
    continue;
  }
  await floorsIdle();
  await page.waitForTimeout(2500);
  for (const pose of await posesFor(spaceId)) {
    console.log(`pose ${spaceId} ${pose.view} ${JSON.stringify(pose.position.map((x) => +x.toFixed(2)))} yaw=${pose.yaw.toFixed(2)}`);
    await page.evaluate((p) => {
      const rt = window.__IW.runtime;
      rt.explore.setPose({ position: p.position, yaw: p.yaw, pitch: p.pitch });
    }, pose);
    // Let several frames land on the software rasteriser.
    await page.waitForTimeout(mobile ? 3500 : 3000);
    const policy = await page.evaluate(() => {
      const q = window.__IW.runtime.quality?.policy || {};
      const info = window.__IW.renderHost.renderer.info.render;
      return { tier: q.tier, shadows: q.shadows, textureScale: q.textureScale, calls: info.calls, triangles: info.triangles };
    });
    const file = `${spaceId.replace('space.', '')}--${pose.view}${mobile ? '--movil' : ''}.png`;
    await page.screenshot({ path: path.join(out, file), timeout: 120000 });
    manifest.shots.push({ spaceId, ...pose, file, policy });
    console.log(`${file}  ${JSON.stringify(policy)}`);
  }
}

manifest.totalMs = Date.now() - t0;
fs.writeFileSync(path.join(out, `manifest${mobile ? '-movil' : ''}.json`), JSON.stringify(manifest, null, 2));
console.log(`errores de página: ${errors.length}${errors.length ? '\n  ' + errors.slice(0, 8).join('\n  ') : ''}`);
console.log(`tiempo total: ${(manifest.totalMs / 1000).toFixed(1)} s`);
await browser.close();
server.close();
