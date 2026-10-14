#!/usr/bin/env node
// Visual inventory of every room at phone size. Navigation uses canonical portals.
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

const output = new URL('../output/playwright/mobile-rooms/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(String(error)));
await page.goto('http://127.0.0.1:4213/index.html');
await page.waitForFunction(() => window.__IW?.ready === true, null, { timeout: 180000 });
await page.locator('[data-el="enter"]').click({ force: true });
await page.locator('[data-el="helpClose"]').click({ force: true });

for (const id of ['space.lobby', 'space.shop', 'space.gallery-a', 'space.archive', 'space.gallery-b', 'space.itinerant-wet-paint', 'space.breeze']) {
  await page.evaluate(async (destination) => {
    const rt = window.__IW.runtime;
    const path = rt.graph.path(rt.state.activeSpaceId, destination);
    for (let i = 1; i < path.length; i += 1) {
      const portal = rt.graph.exits(path[i - 1]).find((item) => item.toSpaceId === path[i]);
      await rt.traversePortal(portal.id);
    }
  }, id);
  await page.waitForTimeout(500);
  const name = id.slice(6);
  await page.screenshot({ path: new URL(`${name}.png`, output).pathname.replace(/^\/(?=[A-Za-z]:)/, ''), timeout: 60000 });
  const state = await page.evaluate(() => ({ active: window.__IW.runtime.state.activeSpaceId, heading: window.__IW.hud.el.spaceTitle.textContent, overflow: document.documentElement.scrollWidth - innerWidth }));
  console.log(name, state);
  assert.equal(state.active, id);
  assert.equal(state.overflow, 0);
  if (id === 'space.gallery-a') {
    await page.evaluate(() => window.__IW.runtime.focusEntity('entity.artwork.horizonte-interrumpido'));
    await page.waitForTimeout(900);
    await page.screenshot({ path: new URL('gallery-a-detail.png', output).pathname.replace(/^\/(?=[A-Za-z]:)/, ''), timeout: 60000 });
    await page.locator('[data-el="zoomIn"]').click({ force: true });
    const detail = await page.evaluate(() => ({ title: window.__IW.hud.el.detailTitle.textContent, zoom: window.__IW.hud.zoom, closeVisible: !window.__IW.hud.el.detailClose.hidden }));
    console.log('detail', detail);
    assert.ok(detail.title && detail.zoom > 0 && detail.closeVisible);
    await page.locator('[data-el="detailClose"]').click({ force: true });
  }
}
await page.setViewportSize({ width: 844, height: 390 });
await page.waitForTimeout(800);
await page.screenshot({ path: new URL('breeze-landscape.png', output).pathname.replace(/^\/(?=[A-Za-z]:)/, ''), timeout: 60000 });
console.log('landscape', await page.evaluate(() => {
  const notice = document.querySelector('[data-breeze-unavailable]');
  const rect = (el) => { const r = el?.getBoundingClientRect(); return r && { top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height) }; };
  return { width: innerWidth, height: innerHeight, overflow: document.documentElement.scrollWidth - innerWidth, notice: rect(notice), title: rect(notice?.querySelector('h2')), body: rect(notice?.querySelector('h2 + p')), exit: rect(notice?.querySelector('button')) };
}));
console.log('pageerrors', errors);
assert.deepEqual(errors, []);
await browser.close();
