import { StudioShell } from './studio-shell.js';
import { ExperienceHUD } from '../../app/ui/hud.js';
import { ConfigStore } from '../config-store.js';

const P1_KEY = 'iw.museum.visitor.phase1.v1';
const MEMORY_KEY = 'iw.museum.visitor.memory.v1';
const A11Y_KEYS = ['stepFree','lift','accessibleWc','hearingLoop','audioDescription','signLanguage','quietSpace','seating'];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
const nowIso = () => new Date().toISOString();

function readJSON(key, fallback) { try { return { ...fallback, ...JSON.parse(localStorage.getItem(key) || '{}') }; } catch { return fallback; } }
function writeJSON(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
function memory() { return readJSON(MEMORY_KEY, { email:'', favorites:[], visited:[], sessions:0, lastVisit:null, savedAt:null }); }
function saveMemory(m) { writeJSON(MEMORY_KEY, m); return m; }

function ensurePhase2(studio) {
  const c = studio.config;
  c.artists ||= [];
  c.documents ||= [];
  c.languages ||= { defaultLocale:'es', locales:['es'], translations:{} };
  c.visitor.schedule ||= { weekly:['L','M','X','J','V','S','D'].map((_,i)=>({open:i>=2,start:i>=2?'11:00':'',end:i>=2?'20:00':''})), exceptions:[] };
  c.visitor.accessibilityFeatures ||= Object.fromEntries(A11Y_KEYS.map((k)=>[k,false]));
  c.visitor.resources ||= [];
  c.visitor.memory ||= { enabled:true, favorites:true, saveVisit:true, emailIdentity:false, returnVisit:true };
  c.visitor.commerce ||= { shopEnabled:false, shopUrl:'', shopLabel:'Tienda' };
  c.visitor.support ||= { membershipEnabled:false, membershipUrl:'', donationsEnabled:false, donationsUrl:'' };
  c.experience.accessibleRoute ||= { enabled:false, avoidStairs:true, requireSeating:false, preferQuiet:false };
  c.experience.personalization ||= { enabled:false, useFavorites:true, useVisited:true, maxRecommendations:3 };
}

function syncPhase1ToCanonical(studio) {
  ensurePhase2(studio);
  let p1 = null;
  try { p1 = JSON.parse(localStorage.getItem(P1_KEY) || 'null'); } catch { /* noop */ }
  if (!p1) return;
  if (p1.schedule?.weekly) studio.config.visitor.schedule = structuredClone(p1.schedule);
  if (p1.accessibility) studio.config.visitor.accessibilityFeatures = { ...studio.config.visitor.accessibilityFeatures, ...p1.accessibility };
  for (const [id, draft] of Object.entries(p1.entities || {})) {
    const e = studio.config.entities[id] ||= {};
    e.sizeCm = { width:Number(draft.widthCm)||0, height:Number(draft.heightCm)||0, depth:Number(draft.depthCm)||0 };
    e.accessibility = {
      label: draft.accessibilityLabel || '', description: draft.accessibilityDescription || '', transcript: draft.transcript || ''
    };
  }
}

function seedPhase1FromCanonical(studio) {
  ensurePhase2(studio);
  const p1 = readJSON(P1_KEY, { schedule:{weekly:[],exceptions:[]}, accessibility:{}, entities:{}, calendarOffset:0 });
  p1.schedule = structuredClone(studio.config.visitor.schedule);
  p1.accessibility = { ...studio.config.visitor.accessibilityFeatures };
  for (const [id, authored] of Object.entries(studio.config.entities || {})) {
    const world = (studio.world.entities || []).find((e) => e.id === id);
    const size = authored.sizeCm || {};
    const a = authored.accessibility || {};
    p1.entities[id] = {
      widthCm: size.width || (world?.size?.[0] ? Math.round(world.size[0]*100) : ''),
      heightCm: size.height || (world?.size?.[1] ? Math.round(world.size[1]*100) : ''),
      depthCm: size.depth || (world?.size?.[2] ? Math.round(world.size[2]*100) : ''),
      accessibilityLabel: a.label || world?.accessibility?.label || '',
      accessibilityDescription: a.description || world?.accessibility?.description || '',
      transcript: a.transcript || world?.accessibility?.transcript || ''
    };
  }
  writeJSON(P1_KEY, p1);
}

function status(ok, yes='Listo', no='Configurar') { return `<span class="p1-status ${ok?'is-ok':'is-warn'}">${ok?yes:no}</span>`; }
function card(id,title,summary,state,body='') {
  return `<section class="p1-cap p2-cap" data-capability="${id}"><div class="p1-cap__head"><div><h3>${esc(title)}</h3><p class="p1-cap__summary">${summary}</p></div>${state}</div>${body?`<div class="p1-cap__body p2-body">${body}</div>`:''}</section>`;
}
function field(label,path,value='',type='text',hint='') {
  return `<label class="st-f"><span class="st-l">${esc(label)}</span><input type="${type}" data-p2-path="${esc(path)}" value="${esc(value)}">${hint?`<small>${esc(hint)}</small>`:''}</label>`;
}
function check(label,path,checked=false) {
  return `<label class="p1-check"><input type="checkbox" data-p2-check="${esc(path)}" ${checked?'checked':''}><span>${esc(label)}</span></label>`;
}
function setPath(root, path, value) {
  // Entity ids are canonical dotted ids (`entity.artwork.foo`). Treating every
  // dot as a path separator writes presentation data under a bogus
  // `entities.entity.artwork...` tree, so the real entity remains unchanged and
  // ConfigStore correctly persists empty presentation fields. The base Studio
  // writer already resolves dotted entity ids from the known suffix; Schema 3
  // presentation fields need the same rule.
  const entityPrefix = 'entities.';
  const presentationMarker = '.presentation.';
  if (path.startsWith(entityPrefix)) {
    const markerAt = path.indexOf(presentationMarker, entityPrefix.length);
    if (markerAt >= 0) {
      const entityId = path.slice(entityPrefix.length, markerAt);
      const field = path.slice(markerAt + presentationMarker.length);
      const entity = (root.entities ||= {})[entityId] ||= {};
      (entity.presentation ||= {})[field] = value;
      return;
    }
  }
  const parts = path.split('.'); let node = root;
  for (let i=0;i<parts.length-1;i++) { const k = /^\d+$/.test(parts[i]) ? Number(parts[i]) : parts[i]; node[k] ||= /^\d+$/.test(parts[i+1]) ? [] : {}; node = node[k]; }
  const last = /^\d+$/.test(parts.at(-1)) ? Number(parts.at(-1)) : parts.at(-1); node[last] = value;
}

function previewSnapshot(studio) {
  return {
    domain: studio.domain, selectedId: studio.selectedId, opened:[...studio.opened], jump:studio.jump,
    scroll: studio.root.querySelector('.st-tree')?.scrollTop || 0
  };
}
function addPreviewBar(mode) {
  document.getElementById('p2-previewbar')?.remove();
  const bar = document.createElement('div'); bar.id='p2-previewbar'; bar.className='p2-previewbar';
  bar.innerHTML = `<button data-p2-return>← Volver al Studio</button><span><b>PREVIEW</b> · ${mode==='map'?'ORIENTACIÓN':'VISITANTE'}</span><button data-p2-open-tab>Abrir aparte ↗</button>`;
  document.body.appendChild(bar);
  bar.querySelector('[data-p2-return]').onclick = () => leavePreview();
  bar.querySelector('[data-p2-open-tab]').onclick = () => window.open(location.href.replace(/[?&]authoring=1/,'').replace(/[?&]preview=[^&]+/,''), '_blank', 'noopener');
}
function enterPreview(studio, snapshot, mode='visitor') {
  window.__IW_PHASE2_PREVIEW = { snapshot, mode };
  studio.root.style.display='none'; delete document.body.dataset.studio;
  addPreviewBar(mode);
  window.__IW?.hud?.el?.veil && (window.__IW.hud.el.veil.hidden = true);
  const url = new URL(location.href); url.searchParams.set('preview', mode); history.pushState({ iwPreview:true }, '', url);
  requestAnimationFrame(() => window.__IW?.renderHost?.resize?.());
}
function leavePreview({ fromPop=false }={}) {
  const state = window.__IW_PHASE2_PREVIEW; if (!state) return;
  const studio = window.__IW_STUDIO; document.getElementById('p2-previewbar')?.remove();
  if (studio) {
    studio.root.style.display=''; document.body.dataset.studio='on';
    studio.domain=state.snapshot.domain; studio.selectedId=state.snapshot.selectedId;
    studio.opened=new Set(state.snapshot.opened); studio.jump=state.snapshot.jump; studio.render();
    requestAnimationFrame(()=>{ const tree=studio.root.querySelector('.st-tree'); if(tree)tree.scrollTop=state.snapshot.scroll; window.__IW?.renderHost?.resize?.(); });
  }
  window.__IW?.hud?.toggleMap?.(false); delete window.__IW_PHASE2_PREVIEW;
  if (!fromPop) { const url=new URL(location.href); url.searchParams.delete('preview'); history.replaceState(null,'',url); }
}

function routeCalculation(studio) {
  const cfg=studio.config.experience.accessibleRoute, start=studio.world.startSpaceId;
  const allowed=(id)=>{ const a=studio.config.rooms?.[id]?.accessibility||{}; if(cfg.avoidStairs&&a.stepFree===false)return false; if(cfg.requireSeating&&!a.seating)return false; if(cfg.preferQuiet&&!a.quiet)return false; return true; };
  const seen=new Set([start]), q=[start], order=[];
  while(q.length){const id=q.shift(); if(allowed(id))order.push(id); for(const p of studio.world.portals||[]){if(p.fromSpaceId===id&&!seen.has(p.toSpaceId)&&allowed(p.toSpaceId)){seen.add(p.toSpaceId);q.push(p.toSpaceId);} if(p.toSpaceId===id&&!seen.has(p.fromSpaceId)&&allowed(p.fromSpaceId)){seen.add(p.fromSpaceId);q.push(p.fromSpaceId);}}}
  return order.map((id)=>(studio.world.spaces||[]).find((s)=>s.id===id)?.title||id);
}

function recommendations(studio, limit=3) {
  const m=memory(), runtime=window.__IW?.runtime, all=(runtime?.store?.entities||[]).filter((e)=>['ARTWORK','SCULPTURE','PROJECTION','AUDIO'].includes(e.kind)&&e.content?.title);
  const seen=new Set([...(m.visited||[]),...(m.favorites||[])]), seeds=all.filter((e)=>m.favorites.includes(e.id));
  const score=(e)=>seeds.reduce((s,x)=>s+(x.content?.creator&&x.content.creator===e.content?.creator?3:0)+(x.content?.medium&&x.content.medium===e.content?.medium?2:0),0);
  return all.filter((e)=>!seen.has(e.id)).sort((a,b)=>score(b)-score(a)).slice(0,limit);
}

function visitorPhase2HTML(studio) {
  ensurePhase2(studio); const v=studio.config.visitor, m=memory();
  const resources=v.resources||[], locales=studio.config.languages.locales||['es'];
  const resBody=`<div class="p2-list">${resources.map((r,i)=>`<article class="p2-row"><b>${esc(r.label||'Recurso')}</b>${field('Etiqueta',`visitor.resources.${i}.label`,r.label)}${field('URL / destino',`visitor.resources.${i}.url`,r.url,'url')}${check('Generar QR',`visitor.resources.${i}.qrEnabled`,r.qrEnabled)}${r.qrEnabled&&r.url?`<div class="p2-qr"><img alt="QR de preview" src="https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(r.url)}"><small>Preview QR externo; la URL es la verdad canónica.</small></div>`:''}<button class="p1-editbtn" data-p2-remove-resource="${i}">Quitar</button></article>`).join('')}</div><button class="st-b st-b--small" data-p2-add-resource>+ Añadir recurso</button>`;
  const memBody=`<div class="p1-a11ygrid">${check('Favoritos', 'visitor.memory.favorites', v.memory.favorites)}${check('Guardar visita','visitor.memory.saveVisit',v.memory.saveVisit)}${check('Identidad por email','visitor.memory.emailIdentity',v.memory.emailIdentity)}${check('Continuar al volver','visitor.memory.returnVisit',v.memory.returnVisit)}</div><div class="p2-memory-summary"><b>${m.visited.length}</b> vistas · <b>${m.favorites.length}</b> favoritas${m.savedAt?` · guardada ${new Date(m.savedAt).toLocaleDateString('es-ES')}`:''}</div>`;
  const langBody=`<p class="st-note">${locales.length} idiomas configurados: ${locales.map(esc).join(', ')}. La edición completa vive en Contenido → Idiomas.</p>`;
  const shopBody=`${check('Activar tienda','visitor.commerce.shopEnabled',v.commerce.shopEnabled)}${field('URL de tienda','visitor.commerce.shopUrl',v.commerce.shopUrl,'url')}${field('Nombre visible','visitor.commerce.shopLabel',v.commerce.shopLabel)}`;
  const supportBody=`${check('Membresía','visitor.support.membershipEnabled',v.support.membershipEnabled)}${field('URL membresía','visitor.support.membershipUrl',v.support.membershipUrl,'url')}${check('Donaciones','visitor.support.donationsEnabled',v.support.donationsEnabled)}${field('URL donaciones','visitor.support.donationsUrl',v.support.donationsUrl,'url')}`;
  return card('P2-MEMORY','Mi visita · memoria','Favoritos, guardar, identidad y retorno comparten una sola memoria.',status(v.memory.enabled,'Activo','Desactivado'),memBody)
    +card('P2-RESOURCES','Recursos / QR',`${resources.length} recursos conectados a destinos reales.`,status(resources.length>0,'Listos','Sin recursos'),resBody)
    +card('P2-LANG','Idiomas',`${locales.length} idiomas · modelo multilingüe canónico.`,status(locales.length>1,'Multilingüe','1 idioma'),langBody)
    +card('P2-SHOP','Tienda','Enlace de comercio institucional; no inventa inventario ni checkout.',status(v.commerce.shopEnabled&&v.commerce.shopUrl,'Activa','Configurar'),shopBody)
    +card('P2-SUPPORT','Apoya al museo','Membresía y donaciones como relación institucional.',status((v.support.membershipEnabled&&v.support.membershipUrl)||(v.support.donationsEnabled&&v.support.donationsUrl),'Activo','Configurar'),supportBody);
}

function contentPhase2HTML(studio) {
  ensurePhase2(studio); const artists=studio.config.artists, docs=studio.config.documents, langs=studio.config.languages;
  const artistRows=artists.map((a,i)=>`<article class="p2-row"><div class="p2-rowhead"><b>${esc(a.name||'Artista sin nombre')}</b><button class="p1-editbtn" data-p2-remove-artist="${i}">Quitar</button></div>${field('Nombre',`artists.${i}.name`,a.name)}${field('Nacionalidad',`artists.${i}.nationality`,a.nationality)}<label class="st-f"><span class="st-l">Biografía</span><textarea data-p2-path="artists.${i}.biography" rows="3">${esc(a.biography)}</textarea></label>${field('Web','artists.'+i+'.website',a.website,'url')}</article>`).join('');
  const docRows=docs.map((d,i)=>`<article class="p2-row"><div class="p2-rowhead"><b>${esc(d.title||'Documento')}</b><button class="p1-editbtn" data-p2-remove-doc="${i}">Quitar</button></div>${field('Título',`documents.${i}.title`,d.title)}${field('Tipo',`documents.${i}.type`,d.type)}${field('URL','documents.'+i+'.url',d.url,'url')}<label class="st-f"><span class="st-l">Descripción</span><textarea data-p2-path="documents.${i}.description" rows="2">${esc(d.description)}</textarea></label></article>`).join('');
  const localeValue=(langs.locales||['es']).join(', ');
  return `<section class="p2-content"><h2>Capacidades de contenido</h2>${card('P2-ARTISTS','Artistas',`${artists.length} perfiles reutilizables.`,status(artists.length>0),`<div class="p2-list">${artistRows}</div><button class="st-b st-b--small" data-p2-add-artist>+ Añadir artista</button>`)}${card('P2-DOCS','Documentos',`${docs.length} documentos vinculables.`,status(docs.length>0),`<div class="p2-list">${docRows}</div><button class="st-b st-b--small" data-p2-add-doc>+ Añadir documento</button>`)}${card('P2-LANG-MODEL','Idiomas avanzados','Un modelo por locale, reutilizado por obras, accesibilidad y visitor.',status((langs.locales||[]).length>1,'Multilingüe','Configurar'),`${field('Idiomas · separados por coma','languages.localesText',localeValue)}${field('Idioma principal','languages.defaultLocale',langs.defaultLocale)}<p class="st-note">Las traducciones se guardan por locale y registro; esta fase establece el modelo y readiness sin duplicar entidades.</p>`)}</section>`;
}

function experiencePhase2HTML(studio) {
  ensurePhase2(studio); const r=studio.config.experience.accessibleRoute,p=studio.config.experience.personalization,calc=studio._p2Route||[];
  const routeBody=`<div class="p1-a11ygrid">${check('Activar ruta accesible','experience.accessibleRoute.enabled',r.enabled)}${check('Evitar barreras / escaleras','experience.accessibleRoute.avoidStairs',r.avoidStairs)}${check('Priorizar salas con asiento','experience.accessibleRoute.requireSeating',r.requireSeating)}${check('Priorizar espacios tranquilos','experience.accessibleRoute.preferQuiet',r.preferQuiet)}</div><button class="st-b st-b--small" data-p2-calc-route>Calcular ruta accesible</button>${calc.length?`<p class="p2-route">${calc.map(esc).join(' → ')}</p>`:''}`;
  const persBody=`<div class="p1-a11ygrid">${check('Activar recomendaciones','experience.personalization.enabled',p.enabled)}${check('Usar favoritos','experience.personalization.useFavorites',p.useFavorites)}${check('Usar obras vistas','experience.personalization.useVisited',p.useVisited)}</div>${field('Máximo de recomendaciones','experience.personalization.maxRecommendations',p.maxRecommendations,'number')}<p class="st-note">La recomendación reutiliza memoria + metadatos canónicos. No crea perfiles paralelos de obra.</p>`;
  return `<section class="p2-experience"><h2>Experiencia adaptativa</h2>${card('P2-ACCESSIBLE-ROUTE','Ruta accesible','Calculada sobre el WorldGraph y metadatos de accesibilidad.',status(r.enabled,'Activa','Configurar'),routeBody)}${card('P2-PERSONALIZE','Personalización','Fundación de recomendaciones basada en señales reales de visita.',status(p.enabled,'Activa','Configurar'),persBody)}</section>`;
}

function entityPhase2HTML(studio,node) {
  if(node?.kind!=='ENTITY')return ''; ensurePhase2(studio); const e=studio.config.entities[node.id] ||= {}, pr=e.presentation ||= {}, artists=studio.config.artists||[], docs=studio.config.documents||[];
  const artistOptions=`<option value="">Sin perfil vinculado</option>${artists.map((a)=>`<option value="${esc(a.id)}" ${e.artistId===a.id?'selected':''}>${esc(a.name||a.id)}</option>`).join('')}`;
  const docChecks=docs.map((d)=>`<label class="p1-check"><input type="checkbox" data-p2-doc-link="${esc(d.id)}" ${(e.documentIds||[]).includes(d.id)?'checked':''}><span>${esc(d.title||d.id)}</span></label>`).join('');
  return studio._group('Presentación física',`<p class="st-note">Cómo se presenta la pieza. No altera sus dimensiones reales ni el archivo de medios.</p><div class="st-vform">${field('Marco',`entities.${node.id}.presentation.frame`,pr.frame)}${field('Montaje',`entities.${node.id}.presentation.mount`,pr.mount)}${field('Material',`entities.${node.id}.presentation.material`,pr.material)}${field('Acabado',`entities.${node.id}.presentation.finish`,pr.finish)}${field('Vidrio',`entities.${node.id}.presentation.glass`,pr.glass)}${field('Paspartú',`entities.${node.id}.presentation.passepartout`,pr.passepartout)}${field('Peana / pedestal',`entities.${node.id}.presentation.plinth`,pr.plinth)}${field('Altura de montaje · cm',`entities.${node.id}.presentation.mountingHeightCm`,pr.mountingHeightCm||0,'number')}</div>`)
    +studio._group('Autor y documentación',`<label class="st-f"><span class="st-l">Perfil de artista</span><select data-p2-artist-link>${artistOptions}</select></label>${docChecks?`<div class="p1-a11ygrid">${docChecks}</div>`:'<p class="st-note">Añade documentos en Contenido para poder vincularlos.</p>'}`);
}

function publishHTML(studio) {
  ensurePhase2(studio); const c=studio.config, entities=Object.values(c.entities||{}), languages=c.languages.locales||['es'];
  const contentReady=Boolean(c.institution.name&&c.exhibition.title), a11yReady=Object.values(c.visitor.accessibilityFeatures||{}).some(Boolean), visitorReady=Boolean(c.visitor.hours&&c.visitor.address), commerceReady=Boolean((c.visitor.commerce.shopEnabled&&c.visitor.commerce.shopUrl)||(c.visitor.support.membershipEnabled&&c.visitor.support.membershipUrl)||(c.visitor.support.donationsEnabled&&c.visitor.support.donationsUrl));
  const cards=[['Content readiness','Identidad, exposición y colección',contentReady],['Accessibility readiness','Servicios + semántica de obras',a11yReady],['Language readiness',`${languages.length} idiomas configurados`,languages.length>0],['Visitor readiness','Planificación, agenda y recursos',visitorReady],['Commerce readiness','Tienda / membresía / donaciones',commerceReady],['Export / Publish','Schema 3 serialisable · Save/Export/Reload',true]];
  return `<section class="st-tree st-lib p2-publish"><h2>Publicar</h2><p class="st-note">La publicación resume capacidades reales; verde significa que existe verdad verificable detrás.</p>${cards.map(([t,s,ok])=>card('PUB',t,s,status(ok,'Listo','Revisar'))).join('')}<div class="p2-export"><button class="st-b" data-p2-export>Exportar proyecto JSON</button><button class="st-b" data-p2-roundtrip>Probar round-trip</button><span data-p2-roundtrip-status></span></div></section>`;
}

function bindPhase2(studio,scope=studio.root) {
  scope.querySelectorAll('[data-p2-path]').forEach((el)=>el.addEventListener('input',()=>{
    if(el.dataset.p2Path==='languages.localesText'){studio.config.languages.locales=el.value.split(',').map((x)=>x.trim()).filter(Boolean);}
    else setPath(studio.config,el.dataset.p2Path,el.type==='number'?Number(el.value):el.value);
    studio._markDirty();
  }));
  scope.querySelectorAll('[data-p2-check]').forEach((el)=>el.addEventListener('change',()=>{setPath(studio.config,el.dataset.p2Check,el.checked);studio._markDirty();studio.render();}));
  scope.querySelector('[data-p2-add-artist]')?.addEventListener('click',()=>{studio.config.artists.push({id:`artist_${Date.now().toString(36)}`,name:'Nuevo artista',biography:'',nationality:'',birth:'',death:'',portraitUrl:'',website:''});studio._markDirty();studio.render();});
  scope.querySelectorAll('[data-p2-remove-artist]').forEach((b)=>b.onclick=()=>{studio.config.artists.splice(Number(b.dataset.p2RemoveArtist),1);studio._markDirty();studio.render();});
  scope.querySelector('[data-p2-add-doc]')?.addEventListener('click',()=>{studio.config.documents.push({id:`doc_${Date.now().toString(36)}`,title:'Nuevo documento',type:'CATALOGUE',url:'',description:'',entityIds:[]});studio._markDirty();studio.render();});
  scope.querySelectorAll('[data-p2-remove-doc]').forEach((b)=>b.onclick=()=>{studio.config.documents.splice(Number(b.dataset.p2RemoveDoc),1);studio._markDirty();studio.render();});
  scope.querySelector('[data-p2-add-resource]')?.addEventListener('click',()=>{studio.config.visitor.resources.push({id:`res_${Date.now().toString(36)}`,label:'Nuevo recurso',type:'EXTERNAL',url:'',entityId:'',documentId:'',qrEnabled:false});studio._markDirty();studio.render();});
  scope.querySelectorAll('[data-p2-remove-resource]').forEach((b)=>b.onclick=()=>{studio.config.visitor.resources.splice(Number(b.dataset.p2RemoveResource),1);studio._markDirty();studio.render();});
  scope.querySelector('[data-p2-artist-link]')?.addEventListener('change',(e)=>{const en=studio.config.entities[studio.selectedId]||={};en.artistId=e.target.value;studio._markDirty();});
  scope.querySelectorAll('[data-p2-doc-link]').forEach((el)=>el.addEventListener('change',()=>{const en=studio.config.entities[studio.selectedId]||={};const set=new Set(en.documentIds||[]);el.checked?set.add(el.dataset.p2DocLink):set.delete(el.dataset.p2DocLink);en.documentIds=[...set];studio._markDirty();}));
  scope.querySelector('[data-p2-calc-route]')?.addEventListener('click',()=>{studio._p2Route=routeCalculation(studio);studio.render();});
  scope.querySelector('[data-p2-export]')?.addEventListener('click',()=>{syncPhase1ToCanonical(studio);const blob=new Blob([ConfigStore.toJSON(studio.config)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='museum-project-schema3.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),5000);});
  scope.querySelector('[data-p2-roundtrip]')?.addEventListener('click',()=>{syncPhase1ToCanonical(studio);const raw=ConfigStore.toJSON(studio.config),back=ConfigStore.fromJSON(raw),ok=back.schemaVersion===3&&JSON.stringify(back.visitor.schedule)===JSON.stringify(studio.config.visitor.schedule);const out=scope.querySelector('[data-p2-roundtrip-status]');if(out)out.textContent=ok?'✓ Round-trip correcto':'! Revisar round-trip';});
}

function augmentRuntime(hud) {
  const m=memory(), state=hud.runtime.state; for(const id of state.visitedEntityIds||[]) if(!m.visited.includes(id))m.visited.push(id); saveMemory(m);
  const detail=hud.el.labelCard?.querySelector('figcaption'); const id=state.focusedEntityId;
  if(detail&&id){let b=detail.querySelector('[data-p2-favorite]');if(!b){b=document.createElement('button');b.dataset.p2Favorite='';b.className='iw-p2-favorite';detail.appendChild(b);}const fresh=memory();b.textContent=fresh.favorites.includes(id)?'♥ Guardada':'♡ Guardar obra';b.onclick=()=>{const mm=memory(),set=new Set(mm.favorites);set.has(id)?set.delete(id):set.add(id);mm.favorites=[...set];saveMemory(mm);b.textContent=mm.favorites.includes(id)?'♥ Guardada':'♡ Guardar obra';renderRuntimeMemory(hud);};}
  renderRuntimeMemory(hud); renderVisitorServices(hud);
}

function renderRuntimeMemory(hud) {
  const host=hud.root.querySelector('[data-p1-progress]'); if(!host)return; let box=host.querySelector('.iw-p2-memory'); if(!box){box=document.createElement('section');box.className='iw-p2-memory';host.appendChild(box);}const m=memory(), cfg=window.__IW_STUDIO?.config||window.__IW_CONFIG||{};
  const recs=cfg.experience?.personalization?.enabled?recommendations(window.__IW_STUDIO||{config:cfg},cfg.experience.personalization.maxRecommendations||3):[];
  box.innerHTML=`<div class="iw-p2-memory__head"><b>Guardar y continuar</b><span>${m.favorites.length} favoritas</span></div><div class="iw-p2-memory__actions"><input type="email" placeholder="Email opcional" value="${esc(m.email)}" data-p2-memory-email><button data-p2-save-visit>Guardar visita</button></div>${m.lastVisit?`<p>Última visita: ${new Date(m.lastVisit).toLocaleDateString('es-ES')} · puedes continuar donde lo dejaste.</p>`:''}${recs.length?`<div class="iw-p2-recs"><b>También puede interesarte</b>${recs.map((e)=>`<span>${esc(e.content.title)}</span>`).join('')}</div>`:''}`;
  box.querySelector('[data-p2-memory-email]')?.addEventListener('change',(e)=>{const mm=memory();mm.email=e.target.value;saveMemory(mm);});
  box.querySelector('[data-p2-save-visit]')?.addEventListener('click',()=>{const mm=memory();mm.savedAt=nowIso();mm.lastVisit=nowIso();mm.sessions=(mm.sessions||0)+1;saveMemory(mm);renderRuntimeMemory(hud);});
}

function renderVisitorServices(hud) {
  const body=hud.el.visitBody, cfg=window.__IW_STUDIO?.config||window.__IW_CONFIG; if(!body||!cfg)return;
  body.querySelector('.iw-p2-services')?.remove(); const v=cfg.visitor||{}, links=[];
  for(const r of v.resources||[])if(r.url)links.push([r.label||'Recurso',r.url]);
  if(v.commerce?.shopEnabled&&v.commerce.shopUrl)links.push([v.commerce.shopLabel||'Tienda',v.commerce.shopUrl]);
  if(v.support?.membershipEnabled&&v.support.membershipUrl)links.push(['Hazte miembro',v.support.membershipUrl]);
  if(v.support?.donationsEnabled&&v.support.donationsUrl)links.push(['Donar',v.support.donationsUrl]);
  if(!links.length&&!cfg.experience?.accessibleRoute?.enabled)return;
  const el=document.createElement('section');el.className='iw-p2-services';el.innerHTML=`<h3>Recursos y servicios</h3>${links.map(([l,u])=>`<a href="${esc(u)}" target="_blank" rel="noopener">${esc(l)}</a>`).join('')}${cfg.experience?.accessibleRoute?.enabled?'<span>✓ Ruta accesible disponible</span>':''}`;body.appendChild(el);
}

let patched=false;
export function installMuseumPhase2() {
  if(!patched){patched=true;
    const visitor0=StudioShell.prototype._visitor;StudioShell.prototype._visitor=function(){ensurePhase2(this);const html=visitor0.call(this),i=html.lastIndexOf('</section>');return i>=0?html.slice(0,i)+visitorPhase2HTML(this)+html.slice(i):html+visitorPhase2HTML(this);};
    const library0=StudioShell.prototype._library;StudioShell.prototype._library=function(){const html=library0.call(this);return html+contentPhase2HTML(this);};
    const transitions0=StudioShell.prototype._transitions;StudioShell.prototype._transitions=function(){return transitions0.call(this)+experiencePhase2HTML(this);};
    const entity0=StudioShell.prototype._entityEditor;StudioShell.prototype._entityEditor=function(node){return entity0.call(this,node)+entityPhase2HTML(this,node);};
    const rail0=StudioShell.prototype._rail;StudioShell.prototype._rail=function(){return rail0.call(this).replace(/data-domain="publish" disabled/g,'data-domain="publish"').replace(/st-dom is-later/g,'st-dom').replace(/ · en preparación/g,'').replace(/<em>Pronto<\/em>/g,'');};
    const second0=StudioShell.prototype._secondColumn;StudioShell.prototype._secondColumn=function(){if(this.domain==='publish')return publishHTML(this);return second0.call(this);};
    const bind0=StudioShell.prototype._bind;StudioShell.prototype._bind=function(scope=this.root){bind0.call(this,scope);bindPhase2(this,scope);};
    const save0=StudioShell.prototype._save;StudioShell.prototype._save=function(){syncPhase1ToCanonical(this);return save0.call(this);};
    const apply0=StudioShell.prototype._apply;StudioShell.prototype._apply=async function(){syncPhase1ToCanonical(this);return apply0.call(this);};
    StudioShell.prototype._start=async function(){const r=this.readiness;if(!r.canStart){this._say('Faltan elementos necesarios para empezar.',true);return;}const snap=previewSnapshot(this);if(this.dirty){syncPhase1ToCanonical(this);ConfigStore.save(this.config);window.__IW_CONFIG=this.config;await this.onApply(this.config);}const live=window.__IW_STUDIO||this;enterPreview(live,snap,window.__IW_PHASE2_REQUESTED_MODE||'visitor');window.__IW_PHASE2_REQUESTED_MODE=null;};
    const hudUpdate0=ExperienceHUD.prototype.update;ExperienceHUD.prototype.update=function(){hudUpdate0.call(this);augmentRuntime(this);};
    const show0=ExperienceHUD.prototype._showDetail;ExperienceHUD.prototype._showDetail=function(id){show0.call(this,id);augmentRuntime(this);};
    const vi0=ExperienceHUD.prototype.setVisitorInfo;ExperienceHUD.prototype.setVisitorInfo=function(v,n){vi0.call(this,v,n);renderVisitorServices(this);};
    window.addEventListener('popstate',()=>{if(window.__IW_PHASE2_PREVIEW)leavePreview({fromPop:true});});
  }
  const studio=window.__IW_STUDIO;if(studio){ensurePhase2(studio);syncPhase1ToCanonical(studio);seedPhase1FromCanonical(studio);studio.render();}
  const phase1Actions=document.querySelectorAll('[data-p1-action]');phase1Actions.forEach((b)=>b.addEventListener('pointerdown',()=>{window.__IW_PHASE2_REQUESTED_MODE=b.dataset.p1Action==='preview-map'?'map':'visitor';},{capture:true}));
  if(window.__IW?.hud)augmentRuntime(window.__IW.hud);
  document.documentElement.dataset.museumPhase2='ready';
}
