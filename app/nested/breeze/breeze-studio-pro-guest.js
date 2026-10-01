/**
 * Breeze Studio PRO V4.1 — full-room nested guest.
 *
 * Museum owns WorldGraph/lifecycle while the specialised room runs the frozen
 * Breeze Studio PRO V4.1 build. Breeze owns centre-stage interaction only while
 * it is active; Museum furniture remains available around it.
 */

// Served from this repository (imported from escaparates-pro@382e566, see
// experiences/breeze-studio-pro/IMPORT_NOTES.md). Document-relative, so the
// Museum works at any base path.
export const BREEZE_STUDIO_PRO_V41_URL =
  './experiences/breeze-studio-pro/index.html';

const STUDIO_INTERACTIVE_SELECTORS = ['.st-rail', '.st-tree', '.st-ed', '.st-val'];
const MUSEUM_PASS_THROUGH_SELECTORS = ['.iw-prompt'];

export class BreezeStudioProGuest {
  constructor() {
    this.iframe = null;
    this.notice = null;
    this.canvas = null;
    this.lastPose = null;
    this.loaded = false;
    this.error = null;
    this.pointerEvents = 0;
    this.focusEvents = 0;
    this._studioBody = null;
    this._studioPointerSnapshot = null;
  }

  _releaseStudioCenterInput() {
    const body = document.querySelector('.st-body');
    if (!body) return false;

    if (!this._studioPointerSnapshot) {
      this._studioPointerSnapshot = {
        body,
        bodyPointerEvents: body.style.pointerEvents,
        children: STUDIO_INTERACTIVE_SELECTORS.map((selector) => {
          const el = document.querySelector(selector);
          return { selector, el, pointerEvents: el?.style?.pointerEvents || '' };
        }),
        passThrough: MUSEUM_PASS_THROUGH_SELECTORS.flatMap((selector) =>
          [...document.querySelectorAll(selector)].map((el) => ({ selector, el, pointerEvents: el.style.pointerEvents || '' }))
        )
      };
    }

    // The transparent Studio centre plane and transient Museum prompt must not
    // steal pointer input from the specialised Breeze iframe. Only concrete
    // Museum authoring furniture remains interactive while Breeze is active.
    body.style.pointerEvents = 'none';
    for (const selector of STUDIO_INTERACTIVE_SELECTORS) {
      const el = document.querySelector(selector);
      if (el) el.style.pointerEvents = 'auto';
    }
    for (const selector of MUSEUM_PASS_THROUGH_SELECTORS) {
      document.querySelectorAll(selector).forEach((el) => { el.style.pointerEvents = 'none'; });
    }

    this._studioBody = body;
    document.body.dataset.breezeInputOwner = 'guest';
    return true;
  }

  _restoreStudioInput() {
    const snapshot = this._studioPointerSnapshot;
    if (snapshot) {
      snapshot.body.style.pointerEvents = snapshot.bodyPointerEvents;
      for (const item of snapshot.children) {
        if (item.el) item.el.style.pointerEvents = item.pointerEvents;
      }
      for (const item of snapshot.passThrough || []) {
        if (item.el) item.el.style.pointerEvents = item.pointerEvents;
      }
    }
    this._studioPointerSnapshot = null;
    this._studioBody = null;
    delete document.body.dataset.breezeInputOwner;
  }

  /**
   * GALERY-JUANMA-RUBIK-SOTA: before mounting, check that the build is served and
   * that this browser can run it (Breeze simulates its cloth with WebGPU). Either
   * failure becomes an explicit Museum notice with a way out, never a 404 or the
   * product's raw English error inside the room.
   * @returns {Promise<'ok'|'missing'|'no-webgpu'>}
   */
  async _availability() {
    try {
      const response = await fetch(BREEZE_STUDIO_PRO_V41_URL, { method: 'HEAD', cache: 'no-store' });
      if (!response.ok) return 'missing';
    } catch {
      return 'missing';
    }
    try {
      if (!navigator.gpu) return 'no-webgpu';
      const adapter = await navigator.gpu.requestAdapter();
      return adapter ? 'ok' : 'no-webgpu';
    } catch {
      return 'no-webgpu';
    }
  }

  _mountNotice(stage, { kind, title, body, retry = false }) {
    this.notice?.remove();
    const notice = document.createElement('div');
    notice.dataset.nestedRoomStudio = 'room.breeze';
    notice.dataset.breezeUnavailable = kind;
    notice.setAttribute('role', 'status');
    Object.assign(notice.style, {
      position: 'absolute', inset: '0', zIndex: '13', display: 'grid', placeItems: 'center',
      padding: '2rem', background: '#0a0908', color: '#cfc9be'
    });
    const button = 'margin:1.6rem .6rem 0 0;padding:.8rem 1.2rem;border:1px solid rgba(240,236,228,.34);background:transparent;color:#f0ece4;font:600 .8rem/1 \'Helvetica Neue\',sans-serif;letter-spacing:.08em;cursor:pointer';
    notice.innerHTML = `<div style="max-width:34rem">
      <p style="font:400 .7rem/1 'Helvetica Neue',sans-serif;letter-spacing:.4em;text-transform:uppercase;color:#a49d92">Sala Breeze — Viento sobre mármol</p>
      <h2 style="font:400 1.4rem/1.3 Georgia,serif;margin:1.4rem 0;color:#f0ece4">${title}</h2>
      <p style="font:400 .86rem/1.7 'Helvetica Neue',sans-serif">${body}</p>
      ${retry ? `<button type="button" data-breeze-retry="true" style="${button}">Reintentar</button>` : ''}
      <button type="button" data-breeze-unavailable-exit="true" style="${button}">← Volver a Galería B</button>
    </div>`;
    // Same canonical exit as the Museum's own exit bridge (a WorldGraph portal
    // crossing, see NestedRoomController._installExitBridge); this button only
    // forwards to it, so there is still one exit path.
    notice.querySelector('[data-breeze-unavailable-exit]').addEventListener('click', () => {
      document.querySelector('[data-breeze-museum-exit]')?.click();
    });
    notice.querySelector('[data-breeze-retry]')?.addEventListener('click', () => {
      notice.remove();
      this.notice = null;
      this._guestErrors = [];
      if (this.iframe) this.iframe.src = BREEZE_STUDIO_PRO_V41_URL;
    });
    stage.appendChild(notice);
    this.notice = notice;
  }

  /**
   * Breeze does not recover from a lost GPU device: its frame loop keeps
   * throwing. Watch the guest's uncaught errors and, if they repeat, stand the
   * room down with a notice instead of leaving a frozen black stage.
   */
  _watchGuestHealth(iframe, stage) {
    this._guestErrors = [];
    const onError = () => {
      const now = performance.now();
      this._guestErrors = this._guestErrors.filter((t) => now - t < 5000);
      this._guestErrors.push(now);
      if (this._guestErrors.length >= 3 && !this.notice) {
        this.error = 'Breeze Studio PRO se detuvo (errores repetidos; posible pérdida del dispositivo WebGPU)';
        this._mountNotice(stage, {
          kind: 'stalled',
          title: 'La instalación se ha detenido',
          body: 'La simulación de Breeze se interrumpió en este dispositivo (la tarjeta gráfica la detuvo). Puedes reintentarlo o seguir la visita en Galería B.',
          retry: true
        });
      }
    };
    // Breeze's frame loop is async: after a device loss its failures surface as
    // unhandled promise rejections, not only as error events.
    const attach = () => {
      try {
        iframe.contentWindow?.addEventListener('error', onError);
        iframe.contentWindow?.addEventListener('unhandledrejection', onError);
      } catch { /* cross-origin: not ours to watch */ }
    };
    iframe.addEventListener('load', attach);
    attach();
  }

  async prepare({ canvas }) {
    this.canvas = canvas;
    const stage = canvas?.parentElement;
    if (!stage) throw new Error('Breeze Studio PRO guest requires a Museum stage');
    canvas.style.display = 'none';

    const availability = await this._availability();
    if (availability !== 'ok') {
      this.loaded = false;
      if (availability === 'missing') {
        this.error = 'Breeze Studio PRO V4.1 no está disponible en este despliegue';
        this._mountNotice(stage, {
          kind: 'missing',
          title: 'Sala no disponible en esta edición',
          body: 'Esta sala se ejecuta con Breeze Studio PRO y no está disponible en este despliegue. El resto del museo sigue abierto: vuelve a Galería B para continuar la visita.'
        });
      } else {
        this.error = 'WebGPU no disponible en este navegador';
        this._mountNotice(stage, {
          kind: 'no-webgpu',
          title: 'Esta sala necesita WebGPU',
          body: 'La tela y el viento de esta instalación se simulan en la tarjeta gráfica con WebGPU, y este navegador no lo ofrece. Ábrela con un navegador compatible (por ejemplo, Chrome o Edge actualizados) o continúa la visita en Galería B.'
        });
      }
      return;
    }

    const iframe = document.createElement('iframe');
    iframe.dataset.nestedRoomStudio = 'room.breeze';
    iframe.title = 'Sala Breeze — Breeze Studio PRO V4.1 original';
    iframe.src = BREEZE_STUDIO_PRO_V41_URL;
    iframe.allow = 'autoplay; fullscreen';
    iframe.setAttribute('allowfullscreen', '');
    iframe.tabIndex = 0;
    Object.assign(iframe.style, {
      position: 'absolute', inset: '0', width: '100%', height: '100%', border: '0',
      display: 'block', zIndex: '12', background: '#000',
      pointerEvents: 'auto', touchAction: 'auto'
    });

    iframe.addEventListener('pointerdown', () => {
      this.pointerEvents += 1;
      try { iframe.focus({ preventScroll: true }); } catch { iframe.focus(); }
    }, true);
    iframe.addEventListener('focus', () => { this.focusEvents += 1; });

    stage.appendChild(iframe);
    this.iframe = iframe;
    this._watchGuestHealth(iframe, stage);
    this._releaseStudioCenterInput();

    await new Promise((resolve) => {
      let done = false;
      const finish = (ok, error = null) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        this.loaded = ok;
        this.error = error ? String(error?.message || error) : null;
        resolve();
      };
      iframe.addEventListener('load', () => finish(true), { once: true });
      iframe.addEventListener('error', () => finish(false, new Error('Breeze Studio PRO iframe failed to load')), { once: true });
      const timer = setTimeout(() => finish(true), 12000);
    });
  }

  async activate() {
    this._releaseStudioCenterInput();
    if (this.iframe) {
      this.iframe.style.pointerEvents = 'auto';
      this.iframe.style.zIndex = '12';
    }
    return true;
  }

  setCameraPose(pose) {
    this.lastPose = pose ? { position: [...pose.position], target: [...pose.target], fov: pose.fov } : null;
  }

  update() {}

  suspend() {
    if (this.iframe) this.iframe.style.pointerEvents = 'none';
    this._restoreStudioInput();
  }

  restore() {
    this._releaseStudioCenterInput();
    if (this.iframe) {
      this.iframe.style.pointerEvents = 'auto';
      this.iframe.style.zIndex = '12';
    }
  }

  report() {
    const studioBody = document.querySelector('.st-body');
    const prompt = document.querySelector('.iw-prompt');
    const iframeRect = this.iframe?.getBoundingClientRect?.();
    return {
      backend: 'webgpu-studio-pro-v4.1-original',
      loaded: this.loaded,
      error: this.error,
      donorCommit: 'c86cd3e20d6f981c75f1e39d395c794ad104d802',
      donorUrl: BREEZE_STUDIO_PRO_V41_URL,
      bridge: false,
      interactionMode: 'native-iframe-with-museum-pass-through',
      pointerEvents: this.pointerEvents,
      focusEvents: this.focusEvents,
      iframeZIndex: this.iframe?.style?.zIndex || null,
      iframePointerEvents: this.iframe?.style?.pointerEvents || null,
      studioBodyPointerEvents: studioBody ? getComputedStyle(studioBody).pointerEvents : null,
      museumPromptPointerEvents: prompt ? getComputedStyle(prompt).pointerEvents : null,
      inputOwner: document.body.dataset.breezeInputOwner || null,
      iframeRect: iframeRect ? {
        left: Math.round(iframeRect.left), top: Math.round(iframeRect.top),
        width: Math.round(iframeRect.width), height: Math.round(iframeRect.height)
      } : null,
      hasIframe: Boolean(this.iframe?.isConnected),
      unavailable: Boolean(this.notice?.isConnected),
      notice: this.notice?.isConnected ? this.notice.dataset.breezeUnavailable : null,
      hasMuseumPose: Boolean(this.lastPose)
    };
  }

  async dispose() {
    this._restoreStudioInput();
    if (this.iframe?.parentNode) this.iframe.parentNode.removeChild(this.iframe);
    this.iframe = null;
    if (this.notice?.parentNode) this.notice.parentNode.removeChild(this.notice);
    this.notice = null;
    if (this.canvas) this.canvas.style.display = '';
    this.canvas = null;
    this.loaded = false;
    this.lastPose = null;
    this.pointerEvents = 0;
    this.focusEvents = 0;
  }
}
