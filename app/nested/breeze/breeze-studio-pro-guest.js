/**
 * Breeze Studio PRO V4.1 — full-room nested guest.
 *
 * Museum owns WorldGraph/lifecycle while the specialised room runs the frozen
 * Breeze Studio PRO V4.1 build. Breeze owns centre-stage interaction only while
 * it is active; Museum furniture remains available around it.
 */

export const BREEZE_STUDIO_PRO_V41_URL =
  '/labs/website-modules-source/breeze-studio-pro/index.html';

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
   * GALERY-JUANMA-RUBIK-SOTA: Breeze Studio PRO V4.1 is a separate product and is
   * not part of this repository. Probe it before mounting so a missing build
   * becomes an explicit, observable room notice instead of a 404 inside the
   * iframe. When the build is served at BREEZE_STUDIO_PRO_V41_URL the original
   * path below runs unchanged.
   */
  async _isAvailable() {
    try {
      const response = await fetch(BREEZE_STUDIO_PRO_V41_URL, { method: 'HEAD', cache: 'no-store' });
      return response.ok;
    } catch {
      return false;
    }
  }

  _mountUnavailableNotice(stage) {
    const notice = document.createElement('div');
    notice.dataset.nestedRoomStudio = 'room.breeze';
    notice.dataset.breezeUnavailable = 'true';
    notice.setAttribute('role', 'status');
    Object.assign(notice.style, {
      position: 'absolute', inset: '0', zIndex: '12', display: 'grid', placeItems: 'center',
      padding: '2rem', background: '#0a0908', color: '#cfc9be'
    });
    notice.innerHTML = `<div style="max-width:34rem">
      <p style="font:400 .7rem/1 'Helvetica Neue',sans-serif;letter-spacing:.4em;text-transform:uppercase;color:#a49d92">Sala Breeze — Viento sobre mármol</p>
      <h2 style="font:400 1.4rem/1.3 Georgia,serif;margin:1.4rem 0;color:#f0ece4">Sala no disponible en esta edición</h2>
      <p style="font:400 .86rem/1.7 'Helvetica Neue',sans-serif">Esta sala se ejecuta con Breeze Studio PRO, un producto independiente que no se incluye en este repositorio. El resto del museo sigue disponible: vuelve a Galería B para continuar la visita.</p>
      <button type="button" data-breeze-unavailable-exit="true" style="margin-top:1.6rem;padding:.8rem 1.2rem;border:1px solid rgba(240,236,228,.34);background:transparent;color:#f0ece4;font:600 .8rem/1 'Helvetica Neue',sans-serif;letter-spacing:.08em;cursor:pointer">← Volver a Galería B</button>
    </div>`;
    // Same canonical exit as the Museum's own exit bridge (a WorldGraph portal
    // crossing, see NestedRoomController._installExitBridge); this button only
    // forwards to it, so there is still one exit path.
    notice.querySelector('[data-breeze-unavailable-exit]').addEventListener('click', () => {
      document.querySelector('[data-breeze-museum-exit]')?.click();
    });
    stage.appendChild(notice);
    this.notice = notice;
  }

  async prepare({ canvas }) {
    this.canvas = canvas;
    const stage = canvas?.parentElement;
    if (!stage) throw new Error('Breeze Studio PRO guest requires a Museum stage');
    canvas.style.display = 'none';

    if (!(await this._isAvailable())) {
      this._mountUnavailableNotice(stage);
      this.loaded = false;
      this.error = 'Breeze Studio PRO V4.1 no está incluido en este repositorio';
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
