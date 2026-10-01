/**
 * Immersive Worlds — Experience UI
 *
 * The visitor-facing surface. It is deliberately quiet: a prompt when something
 * is within reach, a label when something is being looked at, a caption and a
 * transport when a tour is running, and nothing else.
 *
 * Two rules shape everything here:
 *
 *   • The UI reads World State; it never writes it. Every control calls a
 *     semantic Action on the runtime, so the interface has no private idea of
 *     what is happening in the world.
 *   • The information in the canvas also exists as text in the DOM
 *     (Constitution §22). The accessibility outline is not a summary bolted on
 *     afterwards — it is generated from the same records the Scene Kit renders,
 *     which is only possible because the data is semantic in the first place.
 */

import { EVENTS } from '../../engine/core/event-bus.js';
import { EXPERIENCE_MODE } from '../../engine/world/world-state.js';
import { KEY_BINDINGS } from './input.js';

/** Programme types, said for a visitor rather than stored for a database. */
const PROGRAMME_LABEL = {
  EXHIBITION: 'Exposición', GUIDED: 'Visita guiada', TALK: 'Charla',
  WORKSHOP: 'Taller', PERFORMANCE: 'Performance', EVENT: 'Actividad'
};

export class ExperienceHUD {
  /**
   * @param {{root:HTMLElement, runtime:import('../../engine/core/runtime.js').Runtime, audio:import('../audio-director.js').AudioDirector}} deps
   */
  constructor({ root, runtime, audio }) {
    this.root = root;
    this.runtime = runtime;
    this.audio = audio;
    this.mapOpen = false;

    this._build();
    this._subscribe();
    this.renderAccessibilityOutline();
    this.update();
  }

  _build() {
    // Identity comes from the world record. A second world must not show the
    // first world's institution — that is the whole point of a template.
    const institution = this.runtime.store.metadata?.institution?.replace(/\s*\(.*\)$/, '') ||
      this.runtime.store.title;
    const startSpace = this.runtime.store.require(this.runtime.state.activeSpaceId);

    this.root.innerHTML = `
      <div class="iw-veil" data-el="veil" role="status" aria-live="polite">
        <div class="iw-veil__inner">
          <p class="iw-veil__mark">${escapeHtml(institution)}</p>
          <p class="iw-veil__title" data-el="veilTitle">Preparando la sala…</p>
          <div class="iw-veil__bar"><i data-el="veilBar"></i></div>
          <button class="iw-btn iw-btn--primary" data-el="enter" hidden>Entrar en ${escapeHtml(startSpace.title.toLowerCase())}</button>
          <p class="iw-veil__note">Contenido y obras ficticios, generados en tiempo de ejecución.</p>
        </div>
      </div>

      <header class="iw-topbar">
        <div class="iw-topbar__mark">
          <b>${escapeHtml(institution)}</b>
          <span data-el="spaceTitle">${escapeHtml(startSpace.title)}</span>
        </div>
        <div class="iw-topbar__tools">
          <button class="iw-btn" data-el="mapBtn" aria-expanded="false">Salas <kbd>M</kbd></button>
          <button class="iw-btn" data-el="routeBtn">Recorrido comentado <kbd>G</kbd></button>
          <button class="iw-btn iw-btn--icon" data-el="soundBtn" aria-pressed="false" title="Sonido">Sonido</button>
          <button class="iw-btn iw-btn--icon" data-el="visitBtn" aria-expanded="false" hidden>Visita</button>
          <button class="iw-btn iw-btn--icon" data-el="a11yBtn" aria-expanded="false">Contenido en texto</button>
        </div>
      </header>

      <div class="iw-prompt" data-el="prompt" hidden></div>

      <section class="iw-detail" data-el="detail" hidden aria-live="polite">
        <div class="iw-detail__scrim"></div>

        <button class="iw-detail__step iw-detail__step--prev" data-el="detailPrev" aria-label="Obra anterior">‹</button>
        <button class="iw-detail__step iw-detail__step--next" data-el="detailNext" aria-label="Obra siguiente">›</button>

        <figure class="iw-label" data-el="labelCard">
          <figcaption>
            <h2 data-el="detailTitle"></h2>
            <p class="iw-label__meta" data-el="detailMeta"></p>
            <p class="iw-label__dims" data-el="detailDims"></p>
            <div class="iw-label__more" data-el="labelMore" hidden>
              <p data-el="detailBody"></p>
              <p class="iw-label__credit" data-el="detailCredit" hidden></p>
            </div>
            <button class="iw-label__toggle" data-el="detailMore" aria-expanded="false">Leer la ficha</button>
          </figcaption>
        </figure>

        <div class="iw-detail__foot">
          <span class="iw-detail__count" data-el="detailCount"></span>
          <div class="iw-detail__zoom">
            <button class="iw-detail__zoomBtn" data-el="zoomOut" aria-label="Alejarse de la obra">−</button>
            <span class="iw-detail__zoomBar"><i data-el="zoomBar"></i></span>
            <button class="iw-detail__zoomBtn" data-el="zoomIn" aria-label="Acercarse a la obra">+</button>
          </div>
          <button class="iw-detail__close" data-el="detailClose">Volver a la sala <kbd>Esc</kbd></button>
        </div>
      </section>

      <section class="iw-transport" data-el="transport" hidden>
        <div class="iw-transport__caption" data-el="caption" aria-live="polite"></div>
        <div class="iw-transport__controls">
          <span class="iw-transport__step" data-el="stepCount"></span>
          <button class="iw-btn" data-el="prevBtn">← Anterior</button>
          <button class="iw-btn" data-el="pauseBtn">Pausar</button>
          <button class="iw-btn" data-el="nextBtn">Siguiente</button>
          <button class="iw-btn" data-el="exitBtn">Salir del recorrido <kbd>Esc</kbd></button>
        </div>
        <div class="iw-transport__progress"><i data-el="progress"></i></div>
      </section>

      <div class="iw-map" data-el="map" hidden role="dialog" aria-label="Mapa de salas">
        <div class="iw-map__panel">
          <header>
            <h2>Salas</h2>
            <button class="iw-btn" data-el="mapClose">Cerrar</button>
          </header>
          <svg data-el="mapSvg" viewBox="0 0 320 240" role="img" aria-label="Grafo de salas y pasos entre ellas"></svg>
          <p class="iw-map__note">El mapa representa el grafo del mundo. El recorrido comentado es sólo uno de los caminos posibles.</p>
        </div>
      </div>

      <div class="iw-visit" data-el="visit" hidden role="dialog" aria-label="Información para la visita">
        <div class="iw-visit__panel">
          <header class="iw-visit__head">
            <div>
              <p class="iw-visit__eyebrow">Información para la visita</p>
              <h2 data-el="visitTitle">Visita</h2>
            </div>
            <button class="iw-btn" data-el="visitClose">Cerrar</button>
          </header>
          <div class="iw-visit__scroll" data-el="visitBody"></div>
          <footer class="iw-visit__foot" data-el="visitFoot" hidden></footer>
        </div>
      </div>

      <div class="iw-a11y" data-el="a11y" hidden role="dialog" aria-label="Contenido de la exposición en texto">
        <div class="iw-a11y__panel">
          <header>
            <h2>Contenido en texto</h2>
            <button class="iw-btn" data-el="a11yClose">Cerrar</button>
          </header>
          <div data-el="a11yBody"></div>
          <h3>Controles</h3>
          <ul class="iw-a11y__keys" data-el="keys"></ul>
        </div>
      </div>
    `;

    this.el = {};
    for (const node of this.root.querySelectorAll('[data-el]')) {
      this.el[node.dataset.el] = node;
    }

    this.el.mapBtn.addEventListener('click', () => this.toggleMap());
    this.el.mapClose.addEventListener('click', () => this.toggleMap(false));
    this.el.visitBtn?.addEventListener('click', () => this.toggleVisit());
    this.el.visitClose.addEventListener('click', () => this.toggleVisit(false));
    this.el.a11yBtn.addEventListener('click', () => this.toggleAccessibility());
    this.el.a11yClose.addEventListener('click', () => this.toggleAccessibility(false));
    const route = this.runtime.store.routes[0];
    this.el.routeBtn.hidden = !route;
    if (route) {
      this.el.routeBtn.firstChild.textContent = `${route.title} `;
      this.el.routeBtn.addEventListener('click', () => this.runtime.startRoute(route.id));
    }
    this.el.detailClose.addEventListener('click', () => this.runtime.releaseFocus());
    this.el.detailPrev.addEventListener('click', () => this.runtime.focusNeighbour(-1));
    this.el.detailNext.addEventListener('click', () => this.runtime.focusNeighbour(1));
    this.el.zoomIn.addEventListener('click', () => this.setZoom(this.zoom + 0.25));
    this.el.zoomOut.addEventListener('click', () => this.setZoom(this.zoom - 0.25));
    this.el.detailMore.addEventListener('click', () => this.toggleLabelDetail());
    this.el.pauseBtn.addEventListener('click', () => this._togglePause());
    this.el.nextBtn.addEventListener('click', () => this.runtime.experience.next());
    // The guided tour's own Back. Not the ‹ › of the detail overlay: those move
    // between artworks in Collection Browse, which is a different navigation
    // with a different meaning, and the HUD already has to keep the two legible.
    this.el.prevBtn.addEventListener('click', () => this.runtime.goBackOneStop());
    this.el.exitBtn.addEventListener('click', () => this.runtime.exitRoute());
    this.el.soundBtn.addEventListener('click', () => this._toggleSound());

    this.el.keys.innerHTML = KEY_BINDINGS
      .map((binding) => `<li><span>${binding.keys.map((k) => `<kbd>${k}</kbd>`).join(' ')}</span><em>${binding.action}</em></li>`)
      .join('');
  }

  _subscribe() {
    const bus = this.runtime.bus;
    bus.on(EVENTS.SPACE_ENTERED, ({ spaceId }) => {
      const space = this.runtime.store.require(spaceId);
      this.el.spaceTitle.textContent = space.title;
      this.audio.setAmbience(space.ambience);
      this._drawMap();
      this.update();
    });
    bus.on(EVENTS.ENTITY_FOCUSED, ({ entityId }) => this._showDetail(entityId));
    bus.on(EVENTS.ENTITY_FOCUS_LEFT, () => this._hideDetail());
    bus.on(EVENTS.WORLD_STATE_CHANGED, () => this.update());
    bus.on(EVENTS.ROUTE_STARTED, () => this.update());
    bus.on(EVENTS.ROUTE_STEP, ({ caption }) => {
      this.el.caption.textContent = caption || '';
      // Counted in stops, not beats.
      //
      // This read `Parada ${index + 1} de ${total}` from the beat index, so the
      // Museum's ten stops were announced as "parada 21 de 33" — the engine's
      // beat machinery, wearing the visitor's word for it. It went unnoticed
      // while the only control was SIGUIENTE, because a beat and a stop advance
      // together often enough to look right. ← ANTERIOR moves by stops and made
      // the counter jump several at a time, which is the same defect finally
      // becoming visible.
      const order = this.runtime.experience.tourOrder;
      const total = this.runtime.experience.tourTotal;
      this.el.stepCount.textContent = order && total ? `Parada ${order} de ${total}` : '';
      this._stepCountText = this.el.stepCount.textContent;
      this.update();
    });
    bus.on(EVENTS.NARRATION_CUE, ({ caption }) => this.audio.speak(caption));
    bus.on(EVENTS.AUDIO_CUE, ({ cue }) => {
      if (typeof cue === 'string' && cue.startsWith('ambience.')) this.audio.setAmbience(cue);
    });
    bus.on(EVENTS.EXPERIENCE_COMPLETED, () => {
      this.audio.stopNarration();
      this.update();
    });
  }

  /* == veil ================================================================= */

  setLoadingProgress(fraction, label) {
    this.el.veilBar.style.width = `${Math.round(fraction * 100)}%`;
    if (label) this.el.veilTitle.textContent = label;
  }

  /** @param {() => void} onEnter */
  showEnter(onEnter) {
    this.el.veilTitle.textContent = 'La sala está preparada';
    this.el.enter.hidden = false;
    this.el.enter.focus();
    this.el.enter.addEventListener('click', () => {
      this.el.veil.classList.add('is-gone');
      setTimeout(() => { this.el.veil.hidden = true; }, 700);
      onEnter();
    }, { once: true });
  }

  /* == state rendering ====================================================== */

  update() {
    const state = this.runtime.state;
    const guided = state.mode === EXPERIENCE_MODE.GUIDED;

    // Two previous/next meanings exist — beat and artwork — and the visitor has
    // to be able to tell which one is live. While browsing, the tour transport
    // says where it will return to instead of implying it is still advancing.
    const browsing = this.runtime.isBrowsingCollection;
    document.body.dataset.browsing = browsing ? 'true' : 'false';
    if (browsing) {
      const origin = this.runtime.experience.currentTourStep;
      this.el.stepCount.textContent = origin
        ? `Colección · vuelve a la parada ${String(origin.order).padStart(2, '0')}`
        : 'Colección';
    } else if (this._stepCountText) {
      this.el.stepCount.textContent = this._stepCountText;
    }

    this.el.transport.hidden = !guided;
    this.el.routeBtn.hidden = guided;
    this.el.pauseBtn.textContent = this.runtime.experience.transport === 'PAUSED' ? 'Reanudar' : 'Pausar';
    // The tour's own controls stand down while the collection is being browsed:
    // one arrow pair at a time may be live, or the two meanings blur.
    this.el.pauseBtn.disabled = browsing;
    // Disabled at the first stop, and while the previous stop is in another room
    // — a cross-room return is not this move, and offering a control that would
    // silently replay the tour is worse than not offering it yet.
    this.el.prevBtn.disabled = browsing || !this.runtime.canGoBack;
    this.el.nextBtn.disabled = browsing;
    this.el.progress.style.width = `${Math.round(this.runtime.experience.progress * 100)}%`;

    const nearest = this.runtime.proximity.nearestHotspot;
    if (nearest && !guided && !state.focusedEntityId) {
      this.el.prompt.hidden = false;
      this.el.prompt.innerHTML = `<kbd>E</kbd><span>${nearest.accessibilityLabel}</span>`;
    } else {
      this.el.prompt.hidden = true;
    }
  }

  /**
   * Focus presentation.
   *
   * The grammar is an exhibition label, not an application panel: a small card
   * low in the frame carrying what a wall label carries — title, attribution,
   * medium, dimensions — with the curatorial text behind one deliberate act of
   * reading. Everything else recedes so the work is the only thing competing
   * for attention. (Quality bar §8, §9.)
   */
  _showDetail(entityId) {
    const entity = this.runtime.store.require(entityId);
    const content = entity.content || {};
    const guided = this.runtime.state.mode === EXPERIENCE_MODE.GUIDED;

    this.el.detail.hidden = false;
    this.el.detail.dataset.guided = String(guided);
    document.body.dataset.focused = 'true';
    this.el.detailTitle.textContent = content.title || entity.id;
    this.el.detailMeta.textContent = [content.creator, content.year].filter(Boolean).join(', ');
    this.el.detailDims.textContent = [
      content.medium,
      entity.size ? `${(entity.size[0] * 100).toFixed(0)} × ${(entity.size[1] * 100).toFixed(0)} cm` : null
    ].filter(Boolean).join(' · ');
    this.el.detailBody.textContent = content.description || entity.accessibility?.description || '';

    const credit = content.media?.credit;
    this.el.detailCredit.hidden = !credit;
    this.el.detailCredit.textContent = credit ? `Imagen: ${credit}` : '';

    // Collapsed by default: the label states what the work is, and reading more
    // is a choice the visitor makes rather than a wall of text they must dismiss.
    this.toggleLabelDetail(false);

    const works = this.runtime.focusableInSpace();
    const index = works.findIndex((work) => work.id === entityId);
    this.el.detailCount.textContent = works.length > 1 ? `${index + 1} / ${works.length}` : '';

    // During a guided route the camera belongs to the Director, so the browse
    // controls stay out of the way — except at the beat where the work itself is
    // the protagonist. That beat (SHOT_INTENT FOCUS, the yield at the end of a
    // Stop) is exactly where the grammar says Collection Browse is entered from,
    // and hiding the controls there was what made an existing capability
    // unreachable rather than absent.
    const soloWork = works.length < 2;
    const browsing = this.runtime.isBrowsingCollection;
    const atYieldBeat = this.runtime.experience.currentStep?.shotIntent === 'FOCUS';
    const canBrowse = !guided || browsing || atYieldBeat;
    this.el.detailPrev.hidden = soloWork || !canBrowse;
    this.el.detailNext.hidden = soloWork || !canBrowse;
    // Closing means two different things and must not read as one: outside the
    // tour it returns the visitor to where they stood; inside it returns them to
    // the stop they left.
    this.el.detailClose.hidden = guided && !browsing;
    if (browsing) this.el.detailClose.textContent = 'Volver a la parada';
    this.el.detail.querySelector('.iw-detail__zoom').hidden = guided;

    this.setZoom(0);
  }

  /** @param {boolean} [force] */
  toggleLabelDetail(force) {
    const open = force ?? this.el.labelMore.hidden;
    this.el.labelMore.hidden = !open;
    this.el.detailMore.setAttribute('aria-expanded', String(open));
    this.el.detailMore.textContent = open ? 'Cerrar la ficha' : 'Leer la ficha';
  }

  /** @param {number} zoom 0..1 */
  setZoom(zoom) {
    const value = Math.max(0, Math.min(1, zoom));
    this.runtime.setDetailZoom(value);
    this.el.zoomBar.style.transform = `scaleX(${value})`;
    this.el.zoomIn.disabled = value >= 1;
    this.el.zoomOut.disabled = value <= 0;
  }

  get zoom() {
    return this.runtime.focus.zoom;
  }

  _hideDetail() {
    this.el.detail.hidden = true;
    document.body.dataset.focused = 'false';
    this.setZoom(0);
  }

  _togglePause() {
    const director = this.runtime.experience;
    if (director.transport === 'PAUSED') {
      director.resume();
    } else {
      director.pause();
      this.audio.stopNarration();
    }
    this.update();
  }

  async _toggleSound() {
    if (!this.audio.running) {
      const ok = await this.audio.resume();
      if (ok) {
        this.audio.setMuted(false);
        this.audio.setAmbience(this.runtime.store.require(this.runtime.state.activeSpaceId).ambience);
      }
    } else {
      this.audio.setMuted(!this.audio.muted);
    }
    const on = this.audio.running && !this.audio.muted;
    this.el.soundBtn.setAttribute('aria-pressed', String(on));
    this.el.soundBtn.textContent = on ? 'Sonido activo' : 'Sonido';
  }

  /* == map ================================================================== */

  toggleMap(force) {
    this.mapOpen = force ?? !this.mapOpen;
    this.el.map.hidden = !this.mapOpen;
    this.el.mapBtn.setAttribute('aria-expanded', String(this.mapOpen));
    if (this.mapOpen) this._drawMap();
  }

  /**
   * The map is drawn from WorldGraph, not from a hand-authored diagram — which
   * is the point of keeping the graph as data (World Graph ≠ World Map).
   */
  _drawMap() {
    const graph = this.runtime.graph;
    const store = this.runtime.store;
    const active = this.runtime.state.activeSpaceId;
    const visited = this.runtime.state.visitedSpaceIds;

    // Lay the nodes out from the real floor plan: the map is a plan, not a blob.
    const positions = new Map();
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const space of store.spaces) {
      const [x, , z] = space.bounds.origin;
      positions.set(space.id, { x, z });
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    }
    const pad = 42;
    const scale = Math.min((320 - pad * 2) / Math.max(maxX - minX, 1), (240 - pad * 2) / Math.max(maxZ - minZ, 1));
    const project = ({ x, z }) => ({
      x: pad + (x - minX) * scale,
      y: pad + (z - minZ) * scale
    });

    const edges = graph.edges
      .filter((edge, index, all) => all.findIndex((other) => other.from === edge.to && other.to === edge.from) >= index)
      .map((edge) => {
        const a = project(positions.get(edge.from));
        const b = project(positions.get(edge.to));
        const dashed = edge.behaviour === 'TELEPORT';
        return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="iw-map__edge${dashed ? ' is-teleport' : ''}" />`;
      })
      .join('');

    const nodes = store.spaces
      .map((space) => {
        const p = project(positions.get(space.id));
        const cls = space.id === active ? 'is-active' : visited.has(space.id) ? 'is-visited' : '';
        return `
          <g class="iw-map__node ${cls}">
            <circle cx="${p.x}" cy="${p.y}" r="7" />
            <text x="${p.x}" y="${p.y - 13}" text-anchor="middle">${space.title.replace(/ —.*$/, '')}</text>
          </g>`;
      })
      .join('');

    this.el.mapSvg.innerHTML = edges + nodes;
  }

  /* == accessibility ======================================================== */

  /**
   * The institution's own information, for the person standing in the room.
   *
   * `AUTHORING DATA → MUST REACH VISITOR EXPERIENCE.` This is the other end of
   * the Visitante workspace: the same semantic record, drawn as something a
   * visitor reads rather than something an author fills in. No field, no label
   * for an empty value, and no control that belongs to the Studio.
   *
   * A section with nothing in it is not rendered at all. An institution that
   * has not published its parking arrangements should not have a heading that
   * says "Aparcamiento" above a blank — that reads as a broken page rather than
   * as an institution that simply did not say.
   */
  setVisitorInfo(visitor, institutionName = '') {
    const v = visitor || {};
    const has = (x) => typeof x === 'string' && x.trim().length > 0;
    const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const programme = Array.isArray(v.programme) ? v.programme.filter((p) => has(p.title)) : [];

    const anything = ['hours', 'address', 'admission', 'accessibility', 'transport',
      'parking', 'contact', 'notes', 'ticketUrl', 'bookingUrl', 'directionsUrl']
      .some((k) => has(v[k])) || programme.length > 0;

    // Nothing authored means no button. An empty panel behind a button that
    // promises information is worse than no button at all.
    if (this.el.visitBtn) this.el.visitBtn.hidden = !anything;
    if (!anything) {
      this.el.visitBody.innerHTML = '';
      if (this.el.visitFoot) { this.el.visitFoot.innerHTML = ''; this.el.visitFoot.hidden = true; }
      return;
    }

    if (institutionName) this.el.visitTitle.textContent = `Visitar ${institutionName}`;

    const fact = (title, value) => (has(value)
      ? `<div class="iw-visit__fact"><h3>${esc(title)}</h3><p>${esc(value).replace(/\n/g, '<br>')}</p></div>` : '');

    // Actions are links because that is what they are. The Museum does not hold
    // inventory and must not imply it does.
    // Order is the institution's priority: buy, book, find. Emphasis goes to
    // whichever of them actually exists — an institution with free entry and a
    // booking link had its only action drawn as a secondary control, because
    // "primary" was pinned to the ticket link rather than to the first offered.
    const actions = [
      has(v.ticketUrl) ? ['Comprar entrada', v.ticketUrl] : null,
      has(v.bookingUrl) ? ['Reservar visita', v.bookingUrl] : null,
      has(v.directionsUrl) ? ['Cómo llegar', v.directionsUrl] : null
    ].filter(Boolean).map(([label, href], i) => [label, href, i === 0]);

    const when = (item) => [item.start, item.end].filter(has).join(' — ');

    /**
     * Three groups, because a visitor asks three questions in order: can I go,
     * what is on, and what do I need to know before I set off.
     *
     * The previous version answered all nine fields in one column of identical
     * label-and-paragraph rows — the same shape whether it was opening hours or
     * a parking note — which reads as a record being displayed rather than an
     * institution speaking. Nothing is removed here and nothing is hidden: the
     * fields, their order within each group, and the CTA semantics are the ones
     * that were there. What changes is which of them the eye reaches first.
     */
    const plan = [
      fact('Accesibilidad', v.accessibility),
      fact('Cómo llegar', v.transport),
      fact('Aparcamiento', v.parking),
      fact('Contacto', v.contact),
      fact('Más información', v.notes)
    ].join('');

    this.el.visitBody.innerHTML = `
      <div class="iw-visit__key">
        ${fact('Horarios', v.hours)}
        ${fact('Dirección', v.address)}
        ${fact('Entrada', v.admission)}
      </div>
      <div class="iw-visit__cols">
        ${programme.length ? `
          <section class="iw-visit__col">
            <h3>Programación</h3>
            <ul class="iw-visit__prog">
              ${programme.map((item) => `
                <li>
                  <b>${esc(item.title)}</b>
                  <span>${esc(PROGRAMME_LABEL[item.type] || 'Actividad')}${
  has(when(item)) ? ` · ${esc(when(item))}` : ''}${has(item.location) ? ` · ${esc(item.location)}` : ''}</span>
                  ${has(item.description) ? `<p>${esc(item.description)}</p>` : ''}
                  ${has(item.bookingUrl)
    ? `<a class="iw-visit__link" href="${esc(item.bookingUrl)}"
                      target="_blank" rel="noopener noreferrer">Reservar</a>` : ''}
                </li>`).join('')}
            </ul>
          </section>` : ''}
        ${plan.trim() ? `
          <section class="iw-visit__col iw-visit__col--plan">
            <h3>Planificar la visita</h3>
            ${plan}
          </section>` : ''}
      </div>`;

    // The actions live in a bar pinned to the foot of the panel rather than
    // inline among the sections. Inline, "Reservar visita" sat wherever the
    // preceding text left it — on a 390 px phone that was below the fold behind
    // 460 px of scroll. Pinned, the primary action is on screen the whole time
    // the panel is open, at every width, which is what the layer is for.
    const foot = this.el.visitFoot;
    if (foot) {
      foot.hidden = actions.length === 0;
      foot.innerHTML = actions.map(([label, href, primary]) => `
        <a class="iw-btn ${primary ? 'iw-btn--primary' : ''}" href="${esc(href)}"
          target="_blank" rel="noopener noreferrer">${esc(label)}</a>`).join('');
    }
  }

  toggleVisit(force) {
    const open = force ?? this.el.visit.hidden;
    this.el.visit.hidden = !open;
    this.el.visitBtn?.setAttribute('aria-expanded', String(open));
  }

  toggleAccessibility(force) {
    const open = force ?? this.el.a11y.hidden;
    this.el.a11y.hidden = !open;
    this.el.a11yBtn.setAttribute('aria-expanded', String(open));
  }

  /**
   * Every Space and Entity as readable text, generated from the canonical
   * records. A screen reader, a search engine and a curator all get the same
   * content the canvas is showing.
   */
  renderAccessibilityOutline() {
    const store = this.runtime.store;
    this.el.a11yBody.innerHTML = store.spaces
      .map((space) => {
        const entities = store.entitiesOf(space.id);
        const items = entities
          .map((entity) => `
            <li>
              <strong>${escapeHtml(entity.content?.title || entity.id)}</strong>
              <span>${escapeHtml([entity.content?.creator, entity.content?.year, entity.content?.medium].filter(Boolean).join(' · '))}</span>
              <p>${escapeHtml(entity.accessibility?.description || entity.content?.description || '')}</p>
              ${entity.accessibility?.transcript ? `<p class="iw-a11y__transcript">Transcripción: ${escapeHtml(entity.accessibility.transcript)}</p>` : ''}
            </li>`)
          .join('');
        const exits = this.runtime.graph
          .exits(space.id)
          .map((portal) => escapeHtml(portal.accessibilityLabel))
          .join('; ');
        return `
          <section>
            <h3>${escapeHtml(space.title)}</h3>
            <ul>${items}</ul>
            <p class="iw-a11y__exits">Salidas: ${exits || 'ninguna'}</p>
          </section>`;
      })
      .join('');
  }
}

const KIND_LABEL = {
  ARTWORK: 'Obra',
  SCULPTURE: 'Escultura',
  VIDEO: 'Vídeo',
  AUDIO: 'Registro sonoro',
  TEXT: 'Texto de sala',
  OBJECT_3D: 'Objeto'
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character]));
}
