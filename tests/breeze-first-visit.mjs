#!/usr/bin/env node
// Run against a fresh session: node tests/breeze-first-visit.mjs [--mobile] [--landscape] [--avatar] [--studio] [--capture] [--first-only]
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
  : ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'] });
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
const route = ['space.lobby'];
const prefix = baseline ? 'baseline' : studio ? 'studio' : avatar ? 'avatar' : 'pov';
const suffix = mobile ? (landscape ? 'mobile-landscape' : 'mobile-portrait') : 'desktop';

async function shot(name) {
  if (!capture) return;
  const file = `${prefix}-${suffix}-${name}.png`;
  await page.screenshot({ path: path.join(out.pathname.replace(/^\/(?=[A-Za-z]:)/, ''), file), timeout: 60000 });
  const rendering = await page.evaluate(() => {
    const gl = document.querySelector('#iw-canvas')?.getContext('webgl2');
    const debug = gl?.getExtension('WEBGL_debug_renderer_info');
    return { webgl: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : 'WebGL2 (renderer undisclosed)', webgpu: Boolean(navigator.gpu) };
  });
  records.push({ file, spaceId: await page.evaluate(() => window.__IW.runtime.state.activeSpaceId), mode: studio ? 'Studio' : avatar ? 'Avatar' : 'POV', viewport, browser: chrome ? 'Chrome / Chromium' : 'Bundled Chromium', rendering, route: [...route], commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), result: 'captured after assertions' });
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
  const state = await page.evaluate(() => {
    const rt = window.__IW.runtime;
    const handle = rt.spaces.handleOf('space.gallery-b');
    const breeze = rt.spaces.handleOf('space.breeze');
    return {
      active: rt.state.activeSpaceId,
      portals: rt.store.portalsOf('space.gallery-b').map((item) => item.id),
      hotspots: rt.proximity._active.map((item) => item.hotspot.id),
      breezeState: rt.spaces.stateOf('space.breeze'),
      breezeShellVisible: breeze?.group.visible,
      openingCount: handle.openings.filter((item) => item.portalId === 'portal.gallery-b-breeze').length,
      markerCount: handle.group.getObjectByName('breeze-entrance-marker')?.children.length || 0,
      overflow: document.documentElement.scrollWidth - innerWidth
    };
  });
  console.log(label, JSON.stringify(state));
  if (baseline) await shot(label);
  assert.equal(state.active, 'space.gallery-b');
  assert.equal(state.portals.filter((item) => item === 'portal.gallery-b-breeze').length, 1);
  assert.equal(state.hotspots.filter((item) => item === 'hotspot.gallery-b.to-breeze').length, 1);
  assert.equal(state.breezeShellVisible, false, 'nested shell covered the first-visit opening');
  assert.equal(state.openingCount, 1);
  assert.equal(state.markerCount, 4);
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

try {
  const query = studio ? '?authoring=1' : avatar ? '?character=1&mobility=1&continuity=1' : '';
  await page.goto(`${base}/index.html${query}`, { timeout: 90000 });
  await page.waitForFunction(() => window.__IW?.ready === true, null, { timeout: 180000 });
  if (studio) {
    await page.waitForFunction(() => window.__IW_STUDIO?.root?.isConnected, null, { timeout: 30000 });
    await page.locator('#st .st-nodebtn[data-node="space.breeze"]').click({ timeout: 15000 });
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
  } else {
    if (avatar) await page.waitForFunction(() => window.__IW_CHARACTER_PHASE4B?.ready && !window.__IW.hud.el.enter.disabled, null, { timeout: 240000 });
    await page.locator('[data-el="enter"]').click({ force: true });
    if (mobile) {
      await page.locator('[data-el="helpClose"]').tap({ timeout: 8000 });
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
    if (!firstOnly) {
      await enterWithControl();
      await leaveBreeze();
      if (reload) {
        await page.reload({ timeout: 90000 });
        await page.waitForFunction(() => window.__IW?.ready === true, null, { timeout: 180000 });
        if (avatar) await page.waitForFunction(() => window.__IW_CHARACTER_PHASE4B?.ready && !window.__IW.hud.el.enter.disabled, null, { timeout: 240000 });
        await page.locator('[data-el="enter"]').click({ force: true });
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
  assert.deepEqual(errors.filter((error) => !error.includes('/favicon.ico')), []);
  assert.deepEqual(failed.filter((request) => !request.includes('net::ERR_ABORTED')), []);
  assert.deepEqual(httpErrors, []);
  if (capture) {
    const file = path.join(out.pathname.replace(/^\/(?=[A-Za-z]:)/, ''), `manifest-${prefix}-${suffix}.json`);
    await writeFile(file, JSON.stringify({ records, result: 'PASS', errors, failedRequests: failed }, null, 2));
  }
  console.log('BREEZE-FIRST-VISIT OK', prefix, suffix);
} finally {
  await browser.close();
  server?.close();
}
