/**
 * Studio layout UX — wider inspector, folding «Proyecto», adjustable split.
 *
 * Presentation only. Nothing here reads or writes the project config, the world,
 * the store, the audioguide or the save/apply path: it decorates what
 * StudioShell already renders and publishes three things on the document
 * element, which studio-layout-ux.css reads:
 *
 *   data-st-project = "open" | "closed"   the readiness column, folded by default
 *   --st-editor-user                      the inspector width the author dragged to
 *
 * Both are remembered for the browser session only (sessionStorage, guarded:
 * private windows and blocked storage simply fall back to the defaults).
 */
import { StudioShell } from './studio-shell.js';

const PROJECT_KEY = 'iw:studio:projectOpen';
const EDITOR_KEY = 'iw:studio:editorWidth';
const EDITOR_MIN = 320;
const CENTER_MIN = 360; // the docked 3D preview never drops below this
const STEP = 16;

let installed = false;

const store = {
  get(key) { try { return sessionStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { sessionStorage.setItem(key, value); } catch { /* storage blocked */ } },
  remove(key) { try { sessionStorage.removeItem(key); } catch { /* storage blocked */ } }
};

const root = () => document.documentElement;
const studio = () => window.__IW_STUDIO || null;
const isOpen = () => root().dataset.stProject === 'open';

function relayout() {
  requestAnimationFrame(() => {
    try { studio()?._layout?.(); } catch { /* shell gone */ }
    window.__IW?.renderHost?.resize?.();
  });
}

function setProject(open, { focus = false } = {}) {
  root().dataset.stProject = open ? 'open' : 'closed';
  store.set(PROJECT_KEY, open ? '1' : '0');
  const toggle = document.querySelector('#st .st-valtoggle');
  if (toggle) {
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    toggle.setAttribute('aria-label', open ? 'Ocultar el estado del proyecto' : 'Mostrar el estado del proyecto');
    if (focus) toggle.focus({ preventScroll: true });
  }
}

/* == inspector width ====================================================== */

function px(name, el = document.body) {
  const v = parseFloat(getComputedStyle(el).getPropertyValue(name));
  return Number.isFinite(v) ? v : 0;
}

function editorBounds() {
  const max = window.innerWidth - px('--st-rail') - px('--st-left') - px('--st-val') - CENTER_MIN;
  return { min: EDITOR_MIN, max: Math.max(EDITOR_MIN, Math.round(max)) };
}

function currentEditor() {
  return Math.round(document.querySelector('#st .st-ed')?.getBoundingClientRect().width || px('--st-editor'));
}

function setEditor(width, { persist = true } = {}) {
  const { min, max } = editorBounds();
  const w = Math.round(Math.min(max, Math.max(min, width)));
  root().style.setProperty('--st-editor-user', `${w}px`);
  if (persist) store.set(EDITOR_KEY, String(w));
  syncSplit();
  relayout();
  return w;
}

function resetEditor() {
  root().style.removeProperty('--st-editor-user');
  store.remove(EDITOR_KEY);
  syncSplit();
  relayout();
}

function syncSplit() {
  const split = document.querySelector('#st .st-split');
  if (!split) return;
  const { min, max } = editorBounds();
  split.setAttribute('aria-valuemin', String(min));
  split.setAttribute('aria-valuemax', String(max));
  // Read after layout so the value is the width actually drawn.
  requestAnimationFrame(() => {
    const now = currentEditor();
    split.setAttribute('aria-valuenow', String(now));
    split.setAttribute('aria-valuetext', `Inspector de ${now} píxeles`);
  });
}

function installSplit(shell) {
  const host = shell?.root;
  if (!host || host.querySelector('.st-split')) return;
  const split = document.createElement('div');
  split.className = 'st-split';
  split.setAttribute('role', 'separator');
  split.setAttribute('aria-orientation', 'vertical');
  split.setAttribute('aria-controls', 'st-ed');
  split.setAttribute('aria-label', 'Ancho del inspector. Flechas para ajustar, Inicio para restablecer');
  split.title = 'Arrastra para ajustar el ancho del inspector · doble clic para restablecer';
  split.tabIndex = 0;
  host.appendChild(split);

  split.addEventListener('keydown', (e) => {
    const now = currentEditor();
    // The separator sits on the inspector's left edge: moving it left widens it.
    if (e.key === 'ArrowLeft') setEditor(now + (e.shiftKey ? STEP * 4 : STEP));
    else if (e.key === 'ArrowRight') setEditor(now - (e.shiftKey ? STEP * 4 : STEP));
    else if (e.key === 'Home') resetEditor();
    else if (e.key === 'End') setEditor(editorBounds().max);
    else return;
    e.preventDefault();
  });
  split.addEventListener('dblclick', () => resetEditor());
  split.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    split.setPointerCapture?.(e.pointerId);
    split.classList.add('is-drag');
    root().dataset.stResizing = 'on';
    const startX = e.clientX;
    const startW = currentEditor();
    let frame = 0;
    let latest = startW;
    const move = (ev) => {
      latest = startW + (startX - ev.clientX);
      if (frame) return;
      frame = requestAnimationFrame(() => { frame = 0; setEditor(latest, { persist: false }); });
    };
    const up = () => {
      split.removeEventListener('pointermove', move);
      split.removeEventListener('pointerup', up);
      split.removeEventListener('pointercancel', up);
      split.classList.remove('is-drag');
      delete root().dataset.stResizing;
      setEditor(latest);
    };
    split.addEventListener('pointermove', move);
    split.addEventListener('pointerup', up);
    split.addEventListener('pointercancel', up);
  });
  syncSplit();
}

/* == long text: read whole, never scrolled inside a box =================== */

const FIELD_SIZING = typeof CSS !== 'undefined' && CSS.supports?.('field-sizing', 'content');

function autosize(area) {
  if (FIELD_SIZING || !area) return;
  area.style.height = 'auto';
  area.style.height = `${area.scrollHeight + 2}px`;
}

function autosizeAll(scope) {
  if (FIELD_SIZING) return;
  scope?.querySelectorAll?.('.st-ed textarea').forEach(autosize);
}

/* == install ============================================================== */

export function installStudioLayoutUx() {
  if (installed) return;
  installed = true;

  root().dataset.stProject = store.get(PROJECT_KEY) === '1' ? 'open' : 'closed';
  const savedWidth = Number(store.get(EDITOR_KEY));
  if (savedWidth > 0) root().style.setProperty('--st-editor-user', `${savedWidth}px`);

  // «Proyecto» keeps every word it had; it only gains a header that folds it.
  const readiness0 = StudioShell.prototype._readiness;
  StudioShell.prototype._readiness = function layoutUxReadiness(r) {
    const html = readiness0.call(this, r);
    const pct = r.requiredTotal ? Math.round((r.requiredReady / r.requiredTotal) * 100) : 100;
    const tone = (html.match(/st-gauge is-(\w+)/) || [])[1] || 'ok';
    const open = isOpen();
    const toggle = `
        <button type="button" class="st-valtoggle is-${tone}" data-st-project-toggle
          aria-controls="st-val" aria-expanded="${open}"
          aria-label="${open ? 'Ocultar' : 'Mostrar'} el estado del proyecto">
          <span class="st-valtoggle-name">Proyecto</span>
          <b class="st-valtoggle-pct">${pct}%</b>
          ${r.blocking?.length ? `<i class="st-valtoggle-n">${r.blocking.length}</i>` : ''}
          <span class="st-valtoggle-act" aria-hidden="true"></span>
        </button>`;
    return html.replace('<aside class="st-val" aria-label="Estado del proyecto">',
      `<aside class="st-val" id="st-val" aria-label="Estado del proyecto">${toggle}`);
  };

  const render0 = StudioShell.prototype.render;
  StudioShell.prototype.render = function layoutUxRender(...args) {
    const result = render0.apply(this, args);
    const ed = this.root?.querySelector('.st-ed');
    if (ed && !ed.id) ed.id = 'st-ed';
    installSplit(this);
    autosizeAll(this.root);
    return result;
  };

  document.addEventListener('click', (e) => {
    if (e.target?.closest?.('[data-st-project-toggle]')) {
      setProject(!isOpen(), { focus: true });
    }
  });
  // The phone «Proyecto» tab means "show me the project", so it unfolds it —
  // in the capture phase, before the shell scrolls to it, so the scroll lands on
  // the unfolded section rather than on the folded one.
  document.addEventListener('click', (e) => {
    if (e.target?.closest?.('#st [data-jump="val"]')) setProject(true);
  }, true);

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !isOpen()) return;
    if (!e.target?.closest?.('#st .st-val')) return;
    e.preventDefault();
    setProject(false, { focus: true });
  });

  // Credits and rights are one-line values shown wrapped. Run in the capture
  // phase, before the shell's own listener writes the value, so a line break can
  // never reach the record.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target?.matches?.('#st textarea[data-single-line]')) e.preventDefault();
  }, true);
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (!el?.matches?.('#st textarea')) return;
    if (el.dataset.singleLine && /[\r\n]/.test(el.value)) {
      const at = el.selectionStart;
      el.value = el.value.replace(/\r?\n|\r/g, ' ');
      try { el.setSelectionRange(at, at); } catch { /* */ }
    }
    autosize(el);
  }, true);

  window.addEventListener('resize', () => {
    if (root().style.getPropertyValue('--st-editor-user')) {
      setEditor(parseFloat(root().style.getPropertyValue('--st-editor-user')), { persist: false });
    } else syncSplit();
  });

  studio()?.render?.();
}
