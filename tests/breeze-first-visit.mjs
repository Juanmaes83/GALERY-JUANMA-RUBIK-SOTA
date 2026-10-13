#!/usr/bin/env node
// Run against a fresh session:
//   node tests/breeze-first-visit.mjs [--mobile] [--landscape] [--avatar] [--studio] [--capture]
//     [--first-only | --arrivals] [--reload] [--webgpu | --chrome] [--baseline]
// --arrivals: first arrival in Gallery B and the second one (B→A→B), without entering Breeze (npm test).
// --webgpu:   bundled Chromium with WebGPU on SwiftShader, so the Breeze guest and its panel really load.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { startServer } from '../tools/serve.mjs';

const flags = new Set(process.argv.slice(2));
const mobile = flags.has('--mobile');
const landscape = flags.has('--landscape');
const avatar = flags.has('--avatar');
const studio = flags.has('--studio');
const capture = flags.has('--capture');
const firstOnly = flags.has('--first-only');
const arrivalsOnly = flags.has('--arrivals');
const webgpu = flags.has('--webgpu');
// A capture series (--set=r2) keeps earlier evidence next to the new one.
const set = (process.argv.find((arg) => arg.startsWith('--set=')) || '').slice(6);
const reload = flags.has('--reload');
const baseline = flags.has('--baseline');
const chrome = flags.has('--chrome');
const server = process.env.BREEZE_TEST_BASE ? null : await startServer(0);
const base = process.env.BREEZE_TEST_BASE || `http://127.0.0.1:${server.address().port}`;
const viewport = mobile ? (landscape ? { width: 844, height: 390 } : { width: 390, height: 844 }) : { width: 1280, height: 800 };
const out = new URL('../docs/visual-validation/breeze-mobile-fix/', import.meta.url);
if (capture) await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(chrome ? { channel: 'chrome' } : {}), args: chrome
  ? ['--enable-unsafe-webgpu']
  : ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox', ...(webgpu ? ['--enable-unsafe-webgpu'] : [])] });
const context = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
const page = await context.newPage();
const errors = [];
const failed = [];
const httpErrors = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => { if (message.type() === 'error') errors.push(`${message.text()} ${JSON.stringify(message.location())}`); });
page.on('requestfailed', (request) => failed.push(`${request.method()} ${request.url()} ${request.failure()?.errorText}`));
page.on('response', (response) => { if (response.status() >= 400) httpErrors.push(`${response.status()} ${response.url()}`); });
const records = [];
let savedRotate = null;
const route = ['space.lobby'];
const prefix = baseline ? 'baseline' : studio ? 'studio' : avatar ? 'avatar' : 'pov';
const suffix = mobile ? (landscape ? 'mobile-landscape' : 'mobile-portrait') : 'desktop';

async function shot(name) {
  if (!capture) return;
  const file = `${set ? `${set}-` : ''}${prefix}-${suffix}-${name}.png`;
  await page.screenshot({ path: path.join(out.pathname.replace(/^\/(?=[A-Za-z]:)/, ''), file), timeout: 60000 });
  const rendering = await page.evaluate(() => {
    const gl = document.querySelector('#iw-canvas')?.getContext('webgl2');
    const debug = gl?.getExtension('WEBGL_debug_renderer_info');
    return { webgl: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : 'WebGL2 (renderer undisclosed)', webgpu: Boolean(navigator.gpu) };
  });
  records.push({ file, spaceId: await page.evaluate(() => window.__IW.runtime.state.activeSpaceId), mode: studio ? 'Studio' : avatar ? 'Avatar' : 'POV', viewport, browser: chrome ? 'Chrome / Chromium' : `Bundled Chromium (SwiftShader${webgpu ? ', WebGPU' : ''})`, rendering, route: [...route], commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), result: 'captured after assertions' });
}

async function cross(to) {
  const portalId = await page.evaluate((destination) => {
    const rt = window.__IW.runtime;
    const portal = rt.graph.exits(rt.state.activeSpaceId).find((item) => item.toSpaceId === destination);
    if (!portal) throw new Error(`No graph portal to ${destination}`);
    window.__breezeCrossError = null;
    Promise.resolve(rt.traversePortal(portal.id, { source: 'BREEZE_FIRST_VISIT_TEST' }))
      .catch((error) => { window.__breezeCrossError = String(error); });
    return portal.id;
  }, to);
  await page.waitForFunction((destination) => window.__breezeCrossError || window.__IW.runtime.state.activeSpaceId === destination, to, { timeout: 60000 });
  const state = await page.evaluate(() => ({ active: window.__IW.runtime.state.activeSpaceId, error: window.__breezeCrossError }));
  if (state.error) throw new Error(`${portalId}: ${state.error}`);
  assert.equal(state.active, to);
  route.push(to);
  console.log('cross', portalId, to);
}

async function arrival(label) {
  await page.waitForFunction(() => window.__IW.runtime.spaces.stateOf('space.breeze') === 'READY', null, { timeout: 60000 });
  const state = await page.evaluate(async () => {
    const rt = window.__IW.runtime;
    const kit = rt.sceneKit;
    const THREE = await import('three');
    const handle = rt.spaces.handleOf('space.gallery-b');
    const breeze = rt.spaces.handleOf('space.breeze');
    // What stands between the room and the doorway: a visible mesh that belongs
    // to another room (Breeze's shell did, one metre inside Gallery B).
    const owner = (object) => { for (let o = object; o; o = o.parent) for (const [id, h] of kit._spaces) if (h.group === o) return id; return null; };
    const shown = (object) => { for (let o = object; o; o = o.parent) if (!o.visible) return false; return true; };
    const blockers = [[14, 1.6, -12], [9.7, 1.62, -10], [14, 1.62, -6.7]].map((from) => {
      const origin = new THREE.Vector3(...from);
      const door = new THREE.Vector3(19.9, 1.3, -12);
      const ray = new THREE.Raycaster(origin, door.clone().sub(origin).normalize(), 0.05, origin.distanceTo(door));
      const hit = ray.intersectObject(kit.scene, true).find((h) => h.object.isMesh && shown(h.object) && owner(h.object) && owner(h.object) !== 'space.gallery-b');
      return hit ? `${owner(hit.object)} a ${hit.distance.toFixed(2)} m` : null;
    }).filter(Boolean);
    const groups = kit.scene.children.filter((c) => c.name?.startsWith('space:')).map((c) => c.name);
    const cue = ((kit.doorCueReport?.() || {})['space.gallery-b'] || []).find((row) => row.portalId === 'portal.gallery-b-breeze');
    return {
      active: rt.state.activeSpaceId,
      portals: rt.store.portalsOf('space.gallery-b').map((item) => item.id),
      hotspots: rt.proximity._active.map((item) => item.hotspot.id),
      breezeState: rt.spaces.stateOf('space.breeze'),
      breezeShellVisible: breeze?.group.visible,
      blockers,
      duplicateRooms: groups.filter((name, i) => groups.indexOf(name) !== i),
      openingCount: handle.openings.filter((item) => item.portalId === 'portal.gallery-b-breeze').length,
      cue,
      directionSign: Boolean(handle.group.getObjectByName('breeze-direction-sign')),
      overflow: document.documentElement.scrollWidth - innerWidth
    };
  });
  console.log(label, JSON.stringify(state));
  if (baseline) await shot(label);
  assert.equal(state.active, 'space.gallery-b');
  assert.equal(state.portals.filter((item) => item === 'portal.gallery-b-breeze').length, 1);
  assert.equal(state.hotspots.filter((item) => item === 'hotspot.gallery-b.to-breeze').length, 1);
  assert.equal(state.breezeShellVisible, false, 'nested shell covered the first-visit opening');
  assert.deepEqual(state.blockers, [], 'another room stands between Gallery B and the Breeze doorway');
  assert.deepEqual(state.duplicateRooms, [], 'a room was built twice and left in the scene');
  assert.equal(state.openingCount, 1);
  assert.ok(state.cue?.casing && state.cue.beyond && state.cue.spill > 0, `Breeze doorway cues missing: ${JSON.stringify(state.cue)}`);
  assert.equal(state.directionSign, true);
  assert.equal(state.overflow, 0);
  await shot(label);
}

async function approach() {
  await page.evaluate((withAvatar) => {
    if (withAvatar) {
      const body = window.__IW_CHARACTER_PHASE4B.root;
      body.position.set(17.9, body.position.y, -11.3);
      body.rotation.y = Math.PI / 2;
    } else window.__IW.runtime.explore.placeAt([17.9, 0, -11.3], [1, 0, -0.3]);
  }, avatar);
  await page.waitForFunction(() => window.__IW.runtime.proximity.nearestHotspot?.id === 'hotspot.gallery-b.to-breeze', null, { timeout: 15000 });
  const state = await page.evaluate(() => {
    const rt = window.__IW.runtime;
    const candidate = rt.proximity._active.find((item) => item.hotspot.id === 'hotspot.gallery-b.to-breeze');
    const here = rt.proximitySource?.()?.position || rt.camera.pose.position;
    const rect = window.__IW.hud.el.prompt.getBoundingClientRect();
    return { nearest: rt.proximity.nearestHotspot?.id, distance: Math.hypot(here[0] - candidate.position[0], here[2] - candidate.position[2]), radius: candidate.radius, prompt: window.__IW.hud.el.prompt.textContent.trim(), hidden: window.__IW.hud.el.prompt.hidden,
      promptInViewport: rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight };
  });
  console.log('approach', JSON.stringify(state));
  // The doorway the prompt names answers: its threshold warms up.
  await page.waitForFunction(() => ((window.__IW.runtime.sceneKit.doorCueReport?.() || {})['space.gallery-b'] || [])
    .find((row) => row.portalId === 'portal.gallery-b-breeze')?.near > 0.9, null, { timeout: 15000 });
  assert.ok(state.distance <= state.radius);
  assert.equal(state.hidden, false);
  assert.equal(state.promptInViewport, true);
  assert.match(state.prompt, /Breeze/);
  await shot('approach');
}

async function enterWithControl() {
  await page.evaluate(() => {
    const rt = window.__IW.runtime;
    if (!window.__breezeTraverseCount) {
      const original = rt.traversePortal.bind(rt);
      rt.traversePortal = (...args) => {
        if (args[0] === 'portal.gallery-b-breeze') window.__breezeTraverseCount = (window.__breezeTraverseCount || 0) + 1;
        return original(...args);
      };
    }
  });
  const before = await page.evaluate(() => window.__breezeTraverseCount || 0);
  if (mobile) {
    try { await page.locator('[data-el="prompt"]').tap({ timeout: 8000 }); }
    catch (error) {
      const state = await page.evaluate(() => ({ active: window.__IW.runtime.state.activeSpaceId, count: window.__breezeTraverseCount || 0 }));
      if (state.count === before && state.active === 'space.gallery-b') throw error;
      console.log('tap timeout after activation', JSON.stringify(state));
    }
  } else {
    await page.locator('#iw-canvas').focus();
    await page.keyboard.press('KeyE');
  }
  await page.waitForFunction(() => window.__IW.runtime.state.activeSpaceId === 'space.breeze', null, { timeout: 60000 });
  route.push('space.breeze');
  assert.equal(await page.evaluate(() => window.__breezeTraverseCount), before + 1);
  await page.waitForSelector('iframe[data-nested-room-studio="room.breeze"], [data-breeze-unavailable]', { timeout: 60000 });
  const report = await page.evaluate(() => ({ nested: window.__IW.nested.report(), overflow: document.documentElement.scrollWidth - innerWidth }));
  console.log('breeze', JSON.stringify(report));
  assert.equal(report.overflow, 0);
  const iframe = page.frameLocator('iframe[data-nested-room-studio="room.breeze"]');
  await iframe.locator('#breezeStudioPanel').waitFor({ state: 'attached', timeout: 120000 });
  await iframe.locator('#bsMuseumPanelShow').waitFor({ state: 'attached', timeout: 30000 });
  await page.waitForFunction(() => window.__IW.nested.report().guest?.loaded === true, null, { timeout: 30000 });
  const panel = await iframe.locator('body').evaluate((body) => {
    const panel = body.querySelector('#breezeStudioPanel');
    const show = body.querySelector('#bsMuseumPanelShow');
    const before = { mode: window.frameElement.dataset.museumMode, panelDisplay: getComputedStyle(panel).display, showDisplay: getComputedStyle(show).display, visitorClass: body.classList.contains('bs-museum-visitor') };
    const reopened = window.__BREEZE_MUSEUM_PANEL.show();
    return { ...before, reopened, panelAfter: getComputedStyle(panel).display };
  });
  console.log('visitor-panel', JSON.stringify(panel));
  assert.equal(panel.mode, 'visitor');
  assert.equal(panel.visitorClass, true);
  assert.equal(panel.panelDisplay, 'none');
  assert.equal(panel.showDisplay, 'none');
  assert.equal(panel.reopened, false);
  assert.equal(panel.panelAfter, 'none');
  await shot('breeze-no-panel');
}

async function leaveBreeze() {
  const exit = page.locator('[data-breeze-museum-exit]');
  await exit.waitFor({ state: 'visible', timeout: 60000 });
  const exitInViewport = await exit.evaluate((button) => { const rect = button.getBoundingClientRect(); return rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight; });
  assert.equal(exitInViewport, true, 'Breeze exit control is outside the viewport');
  if (mobile) await exit.tap({ timeout: 8000 }); else await exit.click({ timeout: 8000 });
  await page.waitForFunction(() => window.__IW.runtime.state.activeSpaceId === 'space.gallery-b', null, { timeout: 60000 });
  await page.waitForFunction(() => window.__IW.nested.report().guestId === null, null, { timeout: 30000 });
  route.push('space.gallery-b');
  const state = await page.evaluate((withAvatar) => ({ nested: window.__IW.nested.report(), avatarVisible: withAvatar ? window.__IW_CHARACTER_PHASE4B.root.visible : null }), avatar);
  console.log('exit', state);
  assert.equal(state.nested.lastError, null);
  if (avatar) assert.equal(state.avatarVisible, true);
}

// Studio setup: selecting the Breeze node walks the preview Lobby → A → B →
// Breeze, and Playwright's post-click wait for navigations can outlast that
// busy page on software WebGL even though the click landed. It is one click in
// the page, on a node that is on screen; the panel is what this test checks.
async function selectStudioNode(nodeId) {
  const state = await page.evaluate((id) => {
    const button = document.querySelector(`#st .st-nodebtn[data-node="${id}"]`);
    const r = button?.getBoundingClientRect();
    const shown = Boolean(r && r.width > 0 && r.height > 0);
    if (shown) button.click();
    return { found: Boolean(button), shown };
  }, nodeId);
  assert.ok(state.found && state.shown, `Studio node ${nodeId}: ${JSON.stringify(state)}`);
}

async function enterVisit() {
  // This click is test setup. In headless SwiftShader, Playwright can time out
  // while sending mouse input even though the entry handler runs. Fire once in
  // the page and reserve real keyboard/touch input for the portal assertions.
  const state = await page.evaluate(() => {
    const button = window.__IW.hud.el.enter;
    const veil = window.__IW.hud.el.veil;
    const ready = button.isConnected && !button.disabled && !button.hidden && !veil.classList.contains('is-gone');
    if (ready) button.click();
    return { ready, label: button.textContent.trim(), veilGone: veil.classList.contains('is-gone') };
  });
  assert.equal(state.ready, true, `entry unavailable: ${JSON.stringify(state)}`);
  assert.equal(state.veilGone, true, 'entry handler did not dismiss the veil');
}

try {
  const query = studio ? '?authoring=1' : avatar ? '?character=1&mobility=1&continuity=1&gatea=1' : '';
  await page.goto(`${base}/index.html${query}`, { timeout: 90000 });
  await page.waitForFunction(() => window.__IW?.ready === true, null, { timeout: 180000 });
  if (studio) {
    await page.waitForFunction(() => window.__IW_STUDIO?.root?.isConnected, null, { timeout: 30000 });
    await selectStudioNode('space.breeze');
    await page.waitForFunction(() => window.__IW.runtime.state.activeSpaceId === 'space.breeze', null, { timeout: 90000 });
    route.push('space.gallery-a', 'space.gallery-b', 'space.breeze');
    const iframe = page.frameLocator('iframe[data-nested-room-studio="room.breeze"]');
    await iframe.locator('#breezeStudioPanel').waitFor({ state: 'visible', timeout: 120000 });
    const state = await iframe.locator('#breezeStudioPanel').evaluate((panel) => ({ mode: window.frameElement.dataset.museumMode, display: getComputedStyle(panel).display, inputs: panel.querySelectorAll('input').length }));
    console.log('studio-panel', JSON.stringify(state));
    assert.equal(state.mode, 'authoring');
    assert.notEqual(state.display, 'none');
    assert.ok(state.inputs > 0, 'Studio panel has no editable controls');
    if (!mobile) {
      const toggle = iframe.locator('#breezeStudioPanel input[type="checkbox"]').first();
      const wasChecked = await toggle.isChecked();
      if (wasChecked) await toggle.uncheck({ force: true }); else await toggle.check({ force: true });
      assert.equal(await toggle.isChecked(), !wasChecked);
      if (wasChecked) await toggle.check({ force: true }); else await toggle.uncheck({ force: true });
      assert.equal(await toggle.isChecked(), wasChecked);
      // Saving from the panel keeps the change in the Museum project.
      const rotate = iframe.locator('#bsRotate');
      savedRotate = !(await rotate.isChecked());
      if (savedRotate) await rotate.check({ force: true }); else await rotate.uncheck({ force: true });
      await iframe.locator('#bsMuseumSave').click({ force: true, timeout: 15000 });
      await iframe.locator('#bsMuseumSave[data-state="saved"]').waitFor({ state: 'attached', timeout: 60000 });
      const saved = await page.evaluate(() => ({ status: window.__IW_BREEZE_PERSISTENCE?.status, autoRotate: window.__IW_BREEZE_PERSISTENCE?.state?.autoRotate }));
      console.log('studio-save', JSON.stringify(saved));
      assert.equal(saved.status, 'SAVED');
      assert.equal(saved.autoRotate, savedRotate);
    }
    await shot('breeze-panel-visible');
    await page.getByRole('button', { name: /empezar experiencia/i }).click({ timeout: 15000 });
    await page.waitForFunction(() => window.__IW_PHASE2_PREVIEW?.mode === 'visitor' && window.__IW.nested.authoringMode === false, null, { timeout: 60000 }).catch(async (error) => {
      console.log('studio-start-timeout', await page.evaluate(() => ({ bodyMode: document.body.dataset.studio, preview: window.__IW_PHASE2_PREVIEW?.mode, nestedMode: window.__IW.nested.authoringMode, guestMode: window.__IW.nested.host._guest?.iframe?.dataset.museumMode, ready: window.__IW.ready })));
      throw error;
    });
    const afterStart = await iframe.locator('body').evaluate((body) => ({ mode: window.frameElement.dataset.museumMode, display: getComputedStyle(body.querySelector('#breezeStudioPanel')).display, reopened: window.__BREEZE_MUSEUM_PANEL.show() }));
    console.log('studio-to-visitor', JSON.stringify(afterStart));
    assert.equal(afterStart.mode, 'visitor');
    assert.equal(afterStart.display, 'none');
    assert.equal(afterStart.reopened, false);
    await page.locator('[data-p2-return]').click({ timeout: 15000 });
    await page.waitForFunction(() => document.body.dataset.studio === 'on' && window.__IW.nested.authoringMode === true, null, { timeout: 15000 });
    const restored = await iframe.locator('#breezeStudioPanel').evaluate((panel) => ({ mode: window.frameElement.dataset.museumMode, display: getComputedStyle(panel).display }));
    console.log('return-to-studio', JSON.stringify(restored));
    assert.equal(restored.mode, 'authoring');
    assert.notEqual(restored.display, 'none');
    if (savedRotate !== null) {
      // A new session restores what was saved: in the Studio with the panel,
      // and for a visitor without it. Hiding the panel never drops the room's
      // configuration.
      for (const [label, query] of [['studio-restore', '?authoring=1'], ['visitor-restore', '']]) {
        await page.goto(`${base}/index.html${query}`, { timeout: 90000 });
        await page.waitForFunction(() => window.__IW?.ready === true, null, { timeout: 180000 });
        if (query) {
          await page.waitForFunction(() => window.__IW_STUDIO?.root?.isConnected, null, { timeout: 30000 });
          await selectStudioNode('space.breeze');
        } else {
          await enterVisit();
          for (const destination of ['space.gallery-a', 'space.gallery-b', 'space.breeze']) await cross(destination);
        }
        await page.waitForFunction(() => window.__IW.runtime.state.activeSpaceId === 'space.breeze', null, { timeout: 90000 });
        await page.waitForFunction(() => ['RESTORED', 'READY_UNSAVED', 'RESTORE_ERROR'].includes(window.__IW_BREEZE_PERSISTENCE?.status), null, { timeout: 180000 });
        const persistence = await page.evaluate(() => window.__IW_BREEZE_PERSISTENCE?.status);
        assert.equal(persistence, 'RESTORED', `${label}: Museum did not restore the saved Breeze state`);
        const after = await iframe.locator('body').evaluate((body) => ({
          mode: window.frameElement.dataset.museumMode,
          display: getComputedStyle(body.querySelector('#breezeStudioPanel')).display,
          autoRotate: body.querySelector('#bsRotate')?.checked
        }));
        console.log(label, JSON.stringify(after));
        assert.equal(after.autoRotate, savedRotate, `${label}: saved Breeze setting not restored`);
        if (query) { assert.equal(after.mode, 'authoring'); assert.notEqual(after.display, 'none'); }
        else { assert.equal(after.mode, 'visitor'); assert.equal(after.display, 'none'); }
      }
    }
  } else {
    if (avatar) await page.waitForFunction(() => window.__IW_CHARACTER_PHASE4B?.ready && !window.__IW.hud.el.enter.disabled, null, { timeout: 240000 });
    await enterVisit();
    if (mobile) {
      // Setup too, like the entry: on software WebGL the phone guide's button
      // can stay «unstable» for Playwright for many frames. It is closed in the
      // page once it is open and on screen; real touch is kept for the doorway.
      const guide = await page.evaluate(() => {
        const el = window.__IW.hud.el;
        const r = el.helpClose.getBoundingClientRect();
        const state = { open: !el.help.hidden, onScreen: r.width > 0 && r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth };
        if (state.open && state.onScreen) el.helpClose.click();
        return state;
      });
      assert.ok(guide.open && guide.onScreen, `phone guide: ${JSON.stringify(guide)}`);
      await page.waitForFunction(() => window.__IW.hud.el.help.hidden, null, { timeout: 8000 });
    }
    const entrySpace = await page.evaluate(() => window.__IW.runtime.state.activeSpaceId);
    console.log('entry-space', entrySpace);
    route[0] = entrySpace;
    if (entrySpace !== 'space.lobby') await cross('space.lobby');
    await cross('space.gallery-a');
    await cross('space.gallery-b');
    await arrival('gallery-b-first');
    await approach();
    if (arrivalsOnly) {
      await cross('space.gallery-a');
      await cross('space.gallery-b');
      await arrival('gallery-b-second');
      await approach();
    } else if (!firstOnly) {
      await enterWithControl();
      await leaveBreeze();
      if (reload) {
        await page.reload({ timeout: 90000 });
        await page.waitForFunction(() => window.__IW?.ready === true, null, { timeout: 180000 });
        if (avatar) await page.waitForFunction(() => window.__IW_CHARACTER_PHASE4B?.ready && !window.__IW.hud.el.enter.disabled, null, { timeout: 240000 });
        await enterVisit();
        const current = await page.evaluate(() => window.__IW.runtime.state.activeSpaceId);
        if (current === 'space.lobby') {
          await cross('space.gallery-a');
          await cross('space.gallery-b');
        } else if (current === 'space.gallery-a') await cross('space.gallery-b');
        else assert.equal(current, 'space.gallery-b');
        await arrival('gallery-b-after-reload');
        await approach();
        await enterWithControl();
        await leaveBreeze();
      }
      await cross('space.gallery-a');
      await cross('space.gallery-b');
      await arrival('gallery-b-second');
      await approach();
      await enterWithControl();
      await leaveBreeze();
    }
  }
  console.log('errors', JSON.stringify(errors), 'failedRequests', JSON.stringify(failed), 'httpErrors', JSON.stringify(httpErrors));
  // WebGPU on SwiftShader loses the guest's device as soon as Breeze starts
  // («A valid external Instance reference no longer exists»), with or without
  // this change; the stage stays black. It is reported, not counted: the panel,
  // the mode and the persistence bridge are what this run can verify. Any
  // other error still fails it.
  const environment = webgpu ? errors.filter((error) => /WebGPU Device Lost[\s\S]*external Instance reference/.test(error)) : [];
  if (environment.length) console.log('environment (SwiftShader WebGPU)', JSON.stringify(environment));
  assert.deepEqual(errors.filter((error) => !error.includes('/favicon.ico') && !environment.includes(error)), []);
  assert.deepEqual(failed.filter((request) => !request.includes('net::ERR_ABORTED')), []);
  assert.deepEqual(httpErrors, []);
  if (capture) {
    const file = path.join(out.pathname.replace(/^\/(?=[A-Za-z]:)/, ''), `manifest-${set ? `${set}-` : ''}${prefix}-${suffix}.json`);
    await writeFile(file, JSON.stringify({ records, result: 'PASS', errors, failedRequests: failed }, null, 2));
  }
  console.log('BREEZE-FIRST-VISIT OK', prefix, suffix);
} finally {
  await browser.close();
  server?.close();
}
