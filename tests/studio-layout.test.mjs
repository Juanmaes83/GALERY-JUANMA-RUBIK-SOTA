#!/usr/bin/env node
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { startServer } from '../tools/serve.mjs';
const server = process.env.STUDIO_TEST_BASE ? null : await startServer(0);
const base = process.env.STUDIO_TEST_BASE || 'http://127.0.0.1:' + server.address().port;
const capture = process.argv.includes('--capture');
const out = new URL('../docs/visual-validation/studio-layout-recovery/', import.meta.url);
if (capture) await mkdir(out, { recursive: true });
const browser = await chromium.launch({headless:true,args:['--use-gl=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
const records=[];
let count=0;
function check(name, value, detail) { assert.ok(value, name + ' ' + JSON.stringify(detail)); count++; console.log('PASS',name); }
try {
  for(const viewport of [{width:1440,height:900},{width:1180,height:800},{width:390,height:844}].filter(v=>!process.argv.includes('--mobile-only')||v.width<901)) {
    const mobile=viewport.width<901;
    const context=await browser.newContext({viewport,isMobile:mobile,hasTouch:mobile});
    const page=await context.newPage();
    const errors=[];
    page.on('pageerror', e=>errors.push(String(e)));
    await page.goto(base+'/index.html?authoring=1',{timeout:90000});
    await page.waitForFunction(()=>window.__IW?.ready && window.__IW_STUDIO?.root?.isConnected,null,{timeout:240000});
    await page.waitForSelector('#st .st-valtoggle',{timeout:60000});
    if(mobile) {
      await page.locator('#st [data-jump="ed"]').click({timeout:60000});
      await page.locator('#st [data-bind="institution.name"]').scrollIntoViewIfNeeded({timeout:60000});
    }
    await page.waitForTimeout(1000);
    const geometry=await page.evaluate(()=>{
      const ed=document.querySelector('#st .st-ed'), stage=document.querySelector('#iw-stage');
      return {editor:ed.getBoundingClientRect().width,center:stage.getBoundingClientRect().width,
        overflow:Math.max(0,document.documentElement.scrollWidth-innerWidth),
        editorOverflow:Math.max(0,ed.scrollWidth-ed.clientWidth)};
    });
    check('layout-'+viewport.width,geometry.overflow===0 && geometry.editorOverflow===0,geometry);
    if(mobile) {
      const contextBar=await page.evaluate(()=>{
        const bar=document.querySelector('#st .st-crumbs').getBoundingClientRect();
        const header=document.querySelector('#st .st-top').getBoundingClientRect();
        return {barBottom:bar.bottom,headerBottom:header.bottom};
      });
      check('mobile-context-in-header',contextBar.barBottom<=contextBar.headerBottom+1,contextBar);
    }
    if(!mobile) check('inspector-width-'+viewport.width,geometry.editor>=(viewport.width===1440?400:330)&&geometry.center>=359,geometry);
    await page.evaluate(()=>document.querySelector('#st .st-ed').scrollTop=0);
    if(capture) await page.screenshot({path:new URL('studio-'+viewport.width+'.jpg',out).pathname,type:'jpeg',quality:60,timeout:120000});
    const field=page.locator('#st [data-bind="institution.name"]');
    const original=await field.inputValue();
    const edited=original+' · QA';
    await field.fill(edited,{timeout:60000});
    await page.locator('#st [data-act="save"]').click({timeout:60000});
    await page.waitForFunction(value=>JSON.parse(localStorage.getItem('iw.museum.authoring.v1')).institution.name===value,edited,{timeout:30000});
    check('save-'+viewport.width,true);
    await page.reload({timeout:90000});
    await page.waitForFunction(()=>window.__IW?.ready && window.__IW_STUDIO?.root?.isConnected,null,{timeout:240000});
    check('reload-'+viewport.width,(await page.locator('#st [data-bind="institution.name"]').inputValue())===edited);
    await page.locator('#st [data-act="apply"]').click({timeout:60000});
    await page.waitForFunction(()=>window.__IW?.ready && window.__IW_STUDIO?.busy!=='apply'&&!window.__IW_STUDIO?.previewStale,null,{timeout:240000});
    check('apply-'+viewport.width,true);
    if(!mobile) {
      const split=page.locator('#st .st-split');
      await split.focus();
      await page.keyboard.press('ArrowLeft');
      await page.waitForTimeout(500);
      const resized=await page.locator('#st .st-ed').evaluate(el=>el.getBoundingClientRect().width);
      check('keyboard-resize-'+viewport.width,resized>geometry.editor);
      await page.keyboard.press('End');
      await page.waitForTimeout(500);
      const center=await page.locator('#iw-stage').evaluate(el=>el.getBoundingClientRect().width);
      check('center-limit-'+viewport.width,center>=359,center);
      await page.keyboard.press('Home');
      await page.waitForTimeout(500);
      const prior=await page.locator('#iw-stage').evaluate(el=>el.getBoundingClientRect().width);
      await page.locator('#st .st-valtoggle').click({timeout:60000});
      const open=await page.locator('#st .st-valtoggle').getAttribute('aria-expanded');
      const now=await page.locator('#iw-stage').evaluate(el=>el.getBoundingClientRect().width);
      check('project-drawer-'+viewport.width,open==='true'&&Math.abs(now-prior)<2);
      await page.keyboard.press('Escape');
      check('project-close-'+viewport.width,(await page.locator('#st .st-valtoggle').getAttribute('aria-expanded'))==='false');
      if(viewport.width===1440) {
        const script=page.locator('#st .st-ed textarea[data-bind$="|script"]').first();
        await script.fill('Guion de prueba para comprobar que el texto se muestra completo. '.repeat(18),{timeout:60000});
        const metrics=await script.evaluate(el=>({width:el.getBoundingClientRect().width,scrollHeight:el.scrollHeight,height:el.clientHeight}));
        check('long-text-readable',metrics.width>350&&metrics.scrollHeight<=metrics.height+2,metrics);
        const credits=page.locator('#st .st-ed textarea[data-single-line]').first();
        await credits.fill('Créditos de prueba\nsegunda línea',{timeout:60000});
        check('credits-normalised',!(await credits.inputValue()).includes('\n'));
        if(capture) {
          await script.scrollIntoViewIfNeeded({timeout:60000});
          await page.screenshot({path:new URL('studio-texto-completo.jpg',out).pathname,type:'jpeg',quality:60,timeout:120000});
        }
      }
    } else {
      await page.locator('#st [data-jump="val"]').click({timeout:60000});
      check('mobile-project',(await page.locator('#st .st-valtoggle').getAttribute('aria-expanded'))==='true');
      if(capture) await page.screenshot({path:new URL('studio-proyecto-movil.jpg',out).pathname,type:'jpeg',quality:60,timeout:120000});
    }
    check('console-'+viewport.width,errors.length===0,errors);
    records.push({viewport,mode:'Studio',geometry,errors,result:'PASS'});
    await context.close();
  }
  if(capture) await writeFile(new URL('manifest.json',out),JSON.stringify({browser:await browser.version(),render:'SwiftShader; móvil emulado',checks:count,records},null,2));
  console.log('STUDIO-LAYOUT OK',count);
} finally {await browser.close();server?.close();}
