/**
 * Audioguide — the visitor's panel and player.
 *
 * Reads the merged audioguide the World carries (`metadata.audioguide`, built
 * by `applyConfigToWorld`) and offers three things: the welcome, the
 * introduction of the room the visitor is in, and the capsule of a work, opened
 * from its sheet.
 *
 * Rules a visitor can rely on:
 *   - nothing plays until the visitor presses play;
 *   - one narrated track at a time, from one <audio> element created on the
 *     first play (nothing is downloaded on entering the museum);
 *   - playing silences the guided tour's spoken captions and lowers the room
 *     tone; the tour speaking pauses the audioguide;
 *   - changing room pauses the track, and closing a work's sheet pauses that
 *     work's capsule — always with a visible notice;
 *   - a track without a playable file shows its status and transcript, never a
 *     play button for a file that is not there;
 *   - a sound piece's own sound is shown apart from the narrated capsule.
 *
 * Installed per boot (`registerBootInstaller`); the dispose tears the DOM and
 * the player down so a Studio rebuild never leaves a second player behind.
 */
import { EVENTS } from '../../engine/core/event-bus.js';
import { AUDIOGUIDE_LOCALES, formatDuration, parseRef } from './audioguide-model.js';

const SKIP_SECONDS = 10;
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function installAudioguide(runtime, { hud = window.__IW?.hud, audio = window.__IW?.audio } = {}) {
  const guide = runtime?.store?.metadata?.audioguide;
  const root = document.getElementById('iw-ui');
  const tools = root?.querySelector('.iw-topbar__tools');
  if (!guide || !root || !tools) return () => {};

  const state = {
    open: false,
    locale: guide.defaultLocale || 'es',
    selected: 'welcome',
    playingRef: null,
    notice: '',
    player: null,
    disposed: false
  };

  /* -- DOM -------------------------------------------------------------------- */

  const button = document.createElement('button');
  button.className = 'iw-btn';
  button.dataset.el = 'guideBtn';
  button.type = 'button';
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-controls', 'iw-guide');
  button.textContent = 'Audioguía';
  tools.insertBefore(button, tools.querySelector('[data-el="soundBtn"]') || null);

  const panel = document.createElement('aside');
  panel.id = 'iw-guide';
  panel.className = 'iw-guide';
  panel.setAttribute('role', 'region');
  panel.setAttribute('aria-label', 'Audioguía');
  panel.hidden = true;
  root.appendChild(panel);

  // «Escuchar cápsula» on a work's sheet.
  const sheetButton = document.createElement('button');
  sheetButton.type = 'button';
  sheetButton.className = 'iw-label__toggle iw-label__guide';
  sheetButton.dataset.el = 'detailGuide';
  sheetButton.textContent = 'Escuchar cápsula';
  sheetButton.hidden = true;
  const toggle = root.querySelector('[data-el="detailMore"]');
  toggle?.parentElement?.insertBefore(sheetButton, toggle.nextSibling);

  /* -- data ------------------------------------------------------------------- */

  const itemOf = (ref) => {
    const { scope, id } = parseRef(ref);
    if (scope === 'welcome') return guide.welcome;
    if (scope === 'room') return guide.rooms?.[id];
    if (scope === 'work') return guide.works?.[id];
    return null;
  };
  const trackOf = (ref) => itemOf(ref)?.locales?.[state.locale] || null;
  const titleOfSpace = (id) => runtime.store.get(id)?.title || id;
  const entityOf = (id) => runtime.store.get(id);
  const contextOf = (ref) => {
    const { scope, id } = parseRef(ref);
    if (scope === 'welcome') return 'Bienvenida al museo';
    if (scope === 'room') return `Introducción de sala · ${titleOfSpace(id)}`;
    const e = entityOf(id);
    return `Cápsula de obra · ${e?.content?.title || id}${e?.spaceId ? ` · ${titleOfSpace(e.spaceId)}` : ''}`;
  };

  /* -- player ----------------------------------------------------------------- */

  function playerEl() {
    if (state.player) return state.player;
    const el = document.createElement('audio');
    el.preload = 'none';
    el.dataset.audioguide = 'player';
    el.addEventListener('timeupdate', renderProgress);
    el.addEventListener('loadedmetadata', render);
    el.addEventListener('play', () => { audio?.duck?.(true); render(); });
    el.addEventListener('pause', () => { audio?.duck?.(false); render(); });
    el.addEventListener('ended', () => {
      audio?.duck?.(false);
      // Back to the start, so the button offers «Reproducir», not «Reanudar».
      el.currentTime = 0;
      state.notice = 'Pista terminada.';
      render();
    });
    el.addEventListener('error', () => {
      if (!el.getAttribute('src')) return;
      audio?.duck?.(false);
      state.notice = 'No se pudo cargar el audio de esta pista. Su transcripción sigue disponible.';
      render();
    });
    root.appendChild(el);
    state.player = el;
    return el;
  }

  const isPlaying = () => Boolean(state.player && !state.player.paused && !state.player.ended);

  async function play(ref) {
    const track = trackOf(ref);
    if (!track?.audio?.src) return;
    const el = playerEl();
    if (state.playingRef !== ref || el.getAttribute('src') !== track.audio.src) {
      // Another track: the previous one stops (one narration at a time).
      el.pause();
      el.setAttribute('src', track.audio.src);
      el.currentTime = 0;
      state.playingRef = ref;
    }
    // The guided tour's spoken captions and the audioguide never talk at once.
    audio?.stopNarration?.();
    state.notice = '';
    try {
      await el.play();
    } catch (error) {
      state.notice = /NotAllowed/i.test(String(error?.name || error))
        ? 'El navegador no permitió reproducir. Pulsa «Reproducir» otra vez.'
        : 'No se pudo reproducir esta pista. Su transcripción sigue disponible.';
    }
    render();
  }

  function pause(notice = '') {
    if (state.player && !state.player.paused) state.player.pause();
    if (notice) state.notice = notice;
    render();
  }

  function stop() {
    if (state.player) {
      state.player.pause();
      state.player.currentTime = 0;
    }
    state.notice = 'Detenida.';
    render();
  }

  function seek(delta) {
    const el = state.player;
    if (!el || !Number.isFinite(el.duration)) return;
    el.currentTime = Math.max(0, Math.min(el.duration, el.currentTime + delta));
    renderProgress();
  }

  /* -- render ----------------------------------------------------------------- */

  function navItems() {
    const room = runtime.state.activeSpaceId;
    const items = [{ ref: 'welcome', label: 'Bienvenida' }];
    if (room && guide.rooms?.[room]) items.push({ ref: `room:${room}`, label: `Sala: ${titleOfSpace(room)}` });
    const { scope, id } = parseRef(state.selected);
    if (scope === 'work') items.push({ ref: state.selected, label: `Obra: ${entityOf(id)?.content?.title || id}` });
    return items;
  }

  function render() {
    if (state.disposed) return;
    // The panel is redrawn on every state change (play, pause, a notice). Keep
    // the keyboard where it was: a visitor who pressed «Pausar» with Enter must
    // be able to press it again without hunting for it.
    const active = panel.contains(document.activeElement) ? document.activeElement : null;
    const focusKey = active?.dataset?.guide ? { guide: active.dataset.guide, ref: active.dataset.ref || null } : null;
    draw();
    if (focusKey && state.open) {
      const sel = `[data-guide="${focusKey.guide}"]${focusKey.ref ? `[data-ref="${CSS.escape(focusKey.ref)}"]` : ''}`;
      (panel.querySelector(sel) || panel.querySelector('[data-guide="title"]'))?.focus?.({ preventScroll: true });
    }
  }

  function draw() {
    const playing = isPlaying();
    button.setAttribute('aria-expanded', String(state.open));
    button.classList.toggle('is-playing', playing);
    button.textContent = playing ? 'Audioguía · sonando' : 'Audioguía';
    panel.hidden = !state.open;
    if (!state.open) return;

    const ref = state.selected;
    const track = trackOf(ref);
    const ready = Boolean(track?.audio?.src);
    const current = state.playingRef === ref;
    const el = state.player;
    const durationMs = (current && el && Number.isFinite(el.duration) ? el.duration * 1000 : 0) || track?.durationMs || track?.audio?.durationMs || 0;
    const locales = guide.locales || ['es'];
    const { scope, id } = parseRef(ref);
    const entity = scope === 'work' ? entityOf(id) : null;
    // A sound piece has a sound of its own, which is not the narration.
    const ownSound = entity?.kind === 'AUDIO'
      ? `<section class="iw-guide__own" aria-label="Sonido propio de la obra">
          <h4>Sonido propio de la obra</h4>
          <p>Esta obra es una pieza sonora. Su sonido es distinto de esta cápsula narrada y no se puede reproducir en esta versión del museo.</p>
          ${entity.accessibility?.transcript ? `<p class="iw-guide__owntext"><b>Transcripción de la pieza:</b> ${esc(entity.accessibility.transcript)}</p>` : ''}
        </section>` : '';

    panel.innerHTML = `
      <header class="iw-guide__head">
        <h2>Audioguía</h2>
        ${locales.length > 1 ? `<label class="iw-guide__lang">Idioma
          <select data-guide="locale">${locales.map((c) => `<option value="${c}" ${c === state.locale ? 'selected' : ''}>${esc(AUDIOGUIDE_LOCALES[c] || c)}</option>`).join('')}</select>
        </label>` : ''}
        <button type="button" class="iw-btn iw-guide__close" data-guide="close" aria-label="Cerrar la audioguía">Cerrar</button>
      </header>
      <nav class="iw-guide__nav" aria-label="Pistas de la audioguía">
        ${navItems().map((n) => `<button type="button" data-guide="select" data-ref="${esc(n.ref)}" aria-pressed="${n.ref === ref}">${esc(n.label)}</button>`).join('')}
      </nav>
      <section class="iw-guide__track" aria-live="polite">
        <p class="iw-guide__context">${esc(contextOf(ref))}</p>
        <h3 data-guide="title" tabindex="-1">${esc(track?.title || 'Sin título')}</h3>
        <p class="iw-guide__meta">
          <span>Idioma: ${esc(AUDIOGUIDE_LOCALES[state.locale] || state.locale)}</span>
          ${durationMs ? `<span>Duración: ${formatDuration(durationMs)}</span>` : ''}
          <span class="iw-guide__status" data-guide="status" data-status="${esc(track?.status || 'DRAFT')}">Estado: ${esc(track?.statusLabel || 'Borrador · sin guion')}</span>
        </p>
        ${ready ? `
          <div class="iw-guide__controls" role="group" aria-label="Controles de reproducción">
            <button type="button" class="iw-btn" data-guide="toggle" aria-pressed="${current && isPlaying()}">${current && isPlaying() ? 'Pausar' : current && el?.currentTime > 0 ? 'Reanudar' : 'Reproducir'}</button>
            <button type="button" class="iw-btn" data-guide="back" aria-label="Retroceder ${SKIP_SECONDS} segundos">−${SKIP_SECONDS} s</button>
            <button type="button" class="iw-btn" data-guide="fwd" aria-label="Avanzar ${SKIP_SECONDS} segundos">+${SKIP_SECONDS} s</button>
            <button type="button" class="iw-btn" data-guide="stop">Detener</button>
          </div>
          <div class="iw-guide__progress">
            <span data-guide="time">${current && el ? `${formatDuration(el.currentTime * 1000) || '0:00'} / ${formatDuration(durationMs) || '—'}` : `0:00 / ${formatDuration(durationMs) || '—'}`}</span>
            <label class="iw-guide__volume">Volumen
              <input type="range" min="0" max="1" step="0.05" value="${el ? el.volume : 1}" data-guide="volume" aria-label="Volumen de la audioguía">
            </label>
          </div>
          ${track.sessionOnly ? '<p class="iw-guide__note">Audio adjuntado en esta sesión del Studio: desaparece al recargar.</p>' : ''}
        ` : `
          <p class="iw-guide__pending" data-guide="pending">${track?.transcript ? 'Esta pista todavía no tiene audio. Puedes leer su transcripción.' : 'Esta pista todavía no tiene guion ni audio.'}</p>
        `}
        <p class="iw-guide__notice" data-guide="notice" role="status">${esc(state.notice)}</p>
        ${ownSound}
        <section class="iw-guide__transcript" aria-label="Transcripción">
          <h4>Transcripción</h4>
          ${track?.transcript ? track.transcript.split(/\n{2,}/).map((p) => `<p>${esc(p)}</p>`).join('') : '<p class="iw-guide__empty">Sin transcripción todavía.</p>'}
          ${track?.credits ? `<p class="iw-guide__credits">${esc(track.credits)}</p>` : ''}
        </section>
      </section>`;
  }

  function renderProgress() {
    if (!state.open || !state.player) return;
    const time = panel.querySelector('[data-guide="time"]');
    if (time && state.playingRef === state.selected) {
      const d = Number.isFinite(state.player.duration) ? state.player.duration * 1000 : (trackOf(state.selected)?.durationMs || 0);
      time.textContent = `${formatDuration(state.player.currentTime * 1000) || '0:00'} / ${formatDuration(d) || '—'}`;
    }
  }

  /* -- interaction -------------------------------------------------------------- */

  function openPanel(ref = null) {
    if (ref) state.selected = ref;
    state.open = true;
    render();
    panel.querySelector('[data-guide="title"]')?.focus?.();
  }

  function closePanel() {
    state.open = false;
    render();
    button.focus({ preventScroll: true });
  }

  const onButton = () => (state.open ? closePanel() : openPanel());
  button.addEventListener('click', onButton);

  const onPanelClick = (event) => {
    const target = event.target.closest('[data-guide]');
    if (!target) return;
    const action = target.dataset.guide;
    if (action === 'close') closePanel();
    else if (action === 'select') { state.selected = target.dataset.ref; state.notice = ''; render(); }
    else if (action === 'toggle') {
      if (state.playingRef === state.selected && isPlaying()) pause();
      else play(state.selected);
    } else if (action === 'back') seek(-SKIP_SECONDS);
    else if (action === 'fwd') seek(SKIP_SECONDS);
    else if (action === 'stop') stop();
  };
  panel.addEventListener('click', onPanelClick);
  // Enter/Space on a focused control already produce its click; letting the
  // keydown reach the museum's E/Enter shortcut as well would also activate
  // whatever hotspot is nearest (same rule as the HUD prompt).
  const onControlKey = (event) => {
    if ((event.key === 'Enter' || event.key === ' ') && event.target.closest?.('button, select, input')) event.stopPropagation();
  };
  for (const el of [panel, button, sheetButton]) el.addEventListener('keydown', onControlKey);
  const onPanelInput = (event) => {
    const target = event.target;
    if (target.dataset.guide === 'volume') playerEl().volume = Number(target.value);
    if (target.dataset.guide === 'locale') {
      // Another language is another track: the current one stops.
      if (isPlaying()) pause('Pausada al cambiar de idioma.');
      state.locale = target.value;
      state.playingRef = null;
      if (state.player) state.player.removeAttribute('src');
      render();
    }
  };
  panel.addEventListener('input', onPanelInput);
  panel.addEventListener('change', onPanelInput);

  const onSheetGuide = () => {
    const id = runtime.state.focusedEntityId;
    if (id) openPanel(`work:${id}`);
  };
  sheetButton.addEventListener('click', onSheetGuide);

  /* -- the visit ---------------------------------------------------------------- */

  const offs = [];
  offs.push(runtime.bus.on(EVENTS.SPACE_ENTERED, ({ spaceId }) => {
    // Any room change pauses, whatever the track: a predictable rule beats a
    // clever one, and the visitor resumes with one press.
    if (isPlaying()) pause('Pausada al cambiar de sala.');
    if (parseRef(state.selected).scope === 'room') state.selected = `room:${spaceId}`;
    render();
  }));
  offs.push(runtime.bus.on(EVENTS.ENTITY_FOCUSED, ({ entityId }) => {
    sheetButton.hidden = !guide.works?.[entityId];
    if (guide.works?.[entityId]) {
      const t = guide.works[entityId].locales?.[state.locale];
      sheetButton.textContent = t?.audio?.src ? 'Escuchar cápsula' : 'Cápsula (texto)';
    }
  }));
  offs.push(runtime.bus.on(EVENTS.ENTITY_FOCUS_LEFT, ({ entityId } = {}) => {
    sheetButton.hidden = true;
    const playing = parseRef(state.playingRef);
    if (isPlaying() && playing.scope === 'work' && (!entityId || playing.id === entityId)) pause('Pausada al cerrar la ficha.');
  }));
  offs.push(runtime.bus.on(EVENTS.NARRATION_CUE, () => {
    if (isPlaying()) pause('Pausada: habla el recorrido comentado.');
  }));

  render();
  const api = {
    open: openPanel, close: closePanel, play, pause, stop,
    report: () => ({
      open: state.open, selected: state.selected, locale: state.locale, playingRef: state.playingRef,
      playing: isPlaying(), currentTime: state.player?.currentTime || 0, notice: state.notice,
      players: root.querySelectorAll('audio[data-audioguide]').length
    })
  };
  window.__IW_AUDIOGUIDE = api;

  return () => {
    state.disposed = true;
    for (const off of offs) off?.();
    if (state.player) {
      state.player.pause();
      state.player.removeAttribute('src');
      state.player.load?.();
      state.player.remove();
    }
    audio?.duck?.(false);
    button.removeEventListener('click', onButton);
    for (const el of [panel, button, sheetButton]) el.removeEventListener('keydown', onControlKey);
    sheetButton.remove();
    button.remove();
    panel.remove();
    if (window.__IW_AUDIOGUIDE === api) delete window.__IW_AUDIOGUIDE;
  };
}
