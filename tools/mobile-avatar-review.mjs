#!/usr/bin/env node
// Targeted mobile avatar interaction and room traversal, isolated from the long smoke suite.
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

const desktop = process.argv.includes('--desktop');
const output = new URL(desktop ? '../output/playwright/desktop-avatar/' : '../output/playwright/mobile-avatar/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext(desktop
  ? { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 }
  : { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
const page = await context.newPage();
const events = [];
page.on('crash', () => events.push('crash'));
page.on('pageerror', (error) => events.push(String(error)));
page.on('framenavigated', (frame) => { if (frame === page.mainFrame()) events.push(`navigation ${frame.url()}`); });
await page.goto('http://127.0.0.1:4213/index.html?character=1&mobility=1&continuity=1&gatea=1', { timeout: 90000 });
await page.waitForFunction(() => window.__IW?.ready && window.__IW_CHARACTER_PHASE4B?.ready && !window.__IW.hud.el.enter.disabled, null, { timeout: 240000 });
await page.locator('[data-el="enter"]').click({ force: true });
if (!desktop) await page.locator('[data-el="helpClose"]').click({ force: true });
await page.screenshot({ path: new URL('01-entry.png', output).pathname.replace(/^\/(?=[A-Za-z]:)/, ''), timeout: 60000 });
if (!desktop) {
  const before = await page.evaluate(() => window.__IW_CHARACTER_PHASE4B.root.position.toArray());
  const cdp = await context.newCDPSession(page);
  const touch = (type, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: 90, y, id: 1 }] });
  await touch('touchStart', 640);
  for (let y = 630; y >= 560; y -= 14) { await touch('touchMove', y); await page.waitForTimeout(50); }
  const end = Date.now() + 2200;
  while (Date.now() < end) { await touch('touchMove', 560); await page.waitForTimeout(150); }
  await touch('touchEnd', 560);
  const after = await page.evaluate(() => window.__IW_CHARACTER_PHASE4B.root.position.toArray());
  const metres = Math.hypot(after[0] - before[0], after[2] - before[2]);
  console.log('touch', { metres, active: await page.evaluate(() => window.__IW.runtime.state.activeSpaceId), events });
  assert.ok(metres > 0.3, 'avatar did not move with touch');
}

for (const destination of ['space.shop', 'space.lobby', 'space.gallery-a', 'space.archive', 'space.gallery-a', 'space.gallery-b', 'space.itinerant-wet-paint', 'space.gallery-b', 'space.breeze']) {
  try {
    const started = Date.now();
    const state = await page.evaluate(async (target) => {
      const rt = window.__IW.runtime;
      const path = rt.graph.path(rt.state.activeSpaceId, target);
      for (let i = 1; i < path.length; i += 1) {
        const portal = rt.graph.exits(path[i - 1]).find((item) => item.toSpaceId === path[i]);
        await rt.traversePortal(portal.id, { source: 'QA' });
      }
      return { active: rt.state.activeSpaceId, camera: rt.camera.report().owner, avatarVisible: window.__IW_CHARACTER_PHASE4B.root.visible };
    }, destination);
    console.log(destination, state, `${Date.now() - started}ms`);
    assert.equal(state.active, destination);
    assert.equal(state.camera, 'THIRD_PERSON_EXPLORE');
    assert.equal(state.avatarVisible, destination !== 'space.breeze');
    if (destination === 'space.gallery-b' || destination === 'space.breeze') {
      await page.screenshot({ path: new URL(`${destination.slice(6)}.png`, output).pathname.replace(/^\/(?=[A-Za-z]:)/, ''), timeout: 60000 });
    }
  } catch (error) { console.log('failed', destination, String(error), events); throw error; }
}
console.log('events', events);
assert.equal(events.filter((event) => event.startsWith('navigation')).length, 1);
assert.ok(!events.includes('crash') && events.every((event) => !event.startsWith('Error:')));
await browser.close();
