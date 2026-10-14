#!/usr/bin/env node
// Capture the visitor-facing mobile states for visual review.
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

const base = process.argv[2] || 'http://127.0.0.1:4213';
const output = new URL('../output/playwright/mobile-review/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
const page = await context.newPage();
const save = async (name) => {
  await page.screenshot({ path: new URL(`${name}.png`, output).pathname.replace(/^\/(?=[A-Za-z]:)/, ''), timeout: 60000 });
  const state = await page.evaluate(() => ({
    space: window.__IW?.runtime?.state.activeSpaceId,
    mode: window.__IW?.runtime?.state.mode,
    overflow: document.documentElement.scrollWidth - innerWidth,
    topbar: Math.round(document.querySelector('.iw-topbar').getBoundingClientRect().height),
    controls: [...document.querySelectorAll('.iw-topbar__tools > button')].filter((el) => getComputedStyle(el).display !== 'none').map((el) => ({ text: el.textContent.trim(), right: Math.round(el.getBoundingClientRect().right) }))
  }));
  console.log(name, state);
  assert.equal(state.overflow, 0, `${name}: horizontal overflow`);
  assert.ok(state.topbar <= 130, `${name}: topbar too tall`);
  assert.ok(state.controls.every((control) => control.right <= 390), `${name}: clipped primary control`);
};

await page.goto(`${base}/index.html`);
await page.waitForFunction(() => window.__IW?.ready === true, null, { timeout: 180000 });
await save('01-entry');
await page.locator('[data-el="enter"]').click({ force: true });
await save('02-help');
await page.locator('[data-el="helpClose"]').click({ force: true });
await save('03-room');
await page.locator('[data-el="mapBtn"]').click({ force: true });
await save('04-map');
await page.locator('[data-space="space.breeze"]').click({ force: true });
await save('04b-map-route');
assert.match(await page.locator('[data-el="mapRoute"]').textContent(), /busca primero la puerta de Galería A/);
await page.locator('[data-el="mapClose"]').click({ force: true });
await page.locator('[data-el="moreBtn"]').click({ force: true });
await save('05-more');
await page.locator('[data-el="guideBtn"]').click({ force: true });
await save('06-audioguide');
const guide = await page.evaluate(() => ({ top: Math.round(document.getElementById('iw-guide').getBoundingClientRect().top), barBottom: Math.round(document.querySelector('.iw-topbar').getBoundingClientRect().bottom), menuOpen: window.__IW.hud.el.moreBtn.getAttribute('aria-expanded') }));
console.log('audioguide', guide);
assert.ok(guide.top >= guide.barBottom && guide.menuOpen === 'false');
await browser.close();
