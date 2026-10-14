/**
 * Option E — the specialized nested room runtime host.
 *
 * A Museum room may be implemented by a runtime the Museum engine does not own:
 * the Breeze installation needs WebGPU compute for its cloth, and the Museum
 * renders with WebGL and is not migrating. The decision is that such a runtime
 * exists only inside its own room's lifecycle, and never becomes a second
 * engine.
 *
 * The single safety property everything here exists to enforce:
 *
 *   ONLY ONE ROOM PRESENTATION IS AUTHORITATIVE AT A TIME.
 *
 * Not two 3D worlds depth-composing against each other every frame — that is
 * the thing `NO SECOND RENDERING TRUTH` forbids, and it is also the expensive,
 * fragile design. This is an explicit handoff: the Museum's presentation stands
 * down, the guest presents, and on exit the Museum resumes. At any instant
 * exactly one of them is drawing, which is checkable rather than hoped for, and
 * `activePresentation` is what a test asserts on.
 *
 * WHAT THE HOST OWNS AND WHAT IT REFUSES TO OWN
 *
 * The host owns the presentation swap, the guest's canvas, its frame loop and
 * its teardown. It owns none of the product: the route, the Tour Stops, the
 * Director, the Guide and the HUD stay exactly where they are, and the guest is
 * never given a way to reach them. Camera is the sharpest case —
 *
 *   MUSEUM DECIDES CAMERA. THE GUEST RENDERS IT.
 *
 * — so the guest receives a pose and has no input listeners, no controls and no
 * way to write one back. A guest that could move the camera would be a second
 * camera authority, which the Constitution has one rule about and no exceptions
 * to.
 *
 * The guest canvas is inserted *behind* the HUD and is pointer-transparent, so
 * Salir del recorrido, Visita and the transport keep working while a guest is
 * on screen. A room runtime that swallowed the way out would be worse than one
 * that never started.
 *
 * PREPARATION ONLY. Nothing imports this yet.
 */

/** Which presentation is authoritative. Never both. */
export const PRESENTATION = {
  MUSEUM: 'MUSEUM',
  GUEST: 'GUEST'
};

export class NestedRoomHost {
  /**
   * @param {object} deps
   * @param {HTMLElement} deps.stage      the element the Museum canvas lives in
   * @param {HTMLCanvasElement} deps.museumCanvas
   * @param {() => void} [deps.pauseMuseum]   stop the Museum's own frame loop
   * @param {() => void} [deps.resumeMuseum]
   */
  constructor({ stage, museumCanvas, pauseMuseum, resumeMuseum }) {
    this.stage = stage;
    this.museumCanvas = museumCanvas;
    this._pauseMuseum = pauseMuseum || (() => {});
    this._resumeMuseum = resumeMuseum || (() => {});
    /** @type {Map<string, () => object>} */
    this._factories = new Map();
    this._guest = null;
    this._guestId = null;
    this._canvas = null;
    this._raf = 0;
    this._lastFrame = 0;
    this.activePresentation = PRESENTATION.MUSEUM;
    /** Counters a conformance test reads instead of inferring from behaviour. */
    this.stats = { activations: 0, disposals: 0, frames: 0, loops: 0 };
  }

  /** Register a room runtime factory. The host never imports one directly. */
  register(roomId, factory) {
    this._factories.set(roomId, factory);
  }

  get isGuestActive() {
    return this.activePresentation === PRESENTATION.GUEST;
  }

  /**
   * Hand presentation to a room runtime.
   *
   * Activating while a guest is already up disposes the first one rather than
   * stacking. Two live guests would each hold a device, a canvas and a loop, and
   * the second would look correct while the first quietly kept running — the
   * exact defect the repeated enter/exit test is written to catch.
   */
  async activate(roomId, { pose, config = {}, signal } = {}) {
    if (this._guest) await this.dispose();
    const factory = this._factories.get(roomId);
    if (!factory) throw new Error(`no hay runtime registrado para ${roomId}`);

    const canvas = document.createElement('canvas');
    canvas.dataset.nestedRoom = roomId;
    // Behind the HUD, and transparent to the pointer: the Museum's controls stay
    // reachable while a guest is presenting.
    Object.assign(canvas.style, {
      position: 'absolute', inset: '0', width: '100%', height: '100%',
      display: 'block', zIndex: '5', pointerEvents: 'none'
    });
    this.stage.appendChild(canvas);
    this._canvas = canvas;
    this._sizeToStage();

    const guest = factory();
    this._guest = guest;
    this._guestId = roomId;

    await guest.prepare?.({ canvas, config });
    // The Museum stands down only once the guest is ready to draw. Doing it
    // earlier is how an activation shows a black frame: nothing is presenting
    // for however long preparation takes.
    this._pauseMuseum();
    this.museumCanvas.style.visibility = 'hidden';
    this.activePresentation = PRESENTATION.GUEST;
    await guest.activate?.({ canvas, config, signal });
    if (pose) guest.setCameraPose?.(pose);

    this.stats.activations += 1;
    this._startLoop();
    return true;
  }

  /** Museum's camera, pushed to the guest. The guest never pushes one back. */
  setCameraPose(pose) {
    if (!this._guest || !pose) return false;
    this._guest.setCameraPose?.({
      position: [...pose.position], target: [...pose.target], fov: pose.fov
    });
    return true;
  }

  _sizeToStage() {
    if (!this._canvas) return;
    const r = this.stage.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this._canvas.width = Math.max(1, Math.round(r.width * dpr));
    this._canvas.height = Math.max(1, Math.round(r.height * dpr));
  }

  _startLoop() {
    // One loop, ever. `loops` is incremented so a test can prove that repeated
    // activation did not leave an orphan running behind the current one.
    this._stopLoop();
    this.stats.loops += 1;
    this._lastFrame = performance.now();
    const tick = (now) => {
      if (!this._guest) return;
      const dt = Math.min((now - this._lastFrame) / 1000, 0.1);
      this._lastFrame = now;
      this.stats.frames += 1;
      try { this._guest.update?.(dt); } catch { /* a guest fault must not kill the Museum */ }
      this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  }

  _stopLoop() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
  }

  /** Pause the guest without tearing it down. */
  suspend() {
    if (!this._guest) return false;
    this._stopLoop();
    this._guest.suspend?.();
    return true;
  }

  restore() {
    if (!this._guest) return false;
    this._guest.restore?.();
    this._startLoop();
    return true;
  }

  /**
   * Give presentation back to the Museum and release everything the guest held.
   *
   * Ordered so the visitor never sees an unpresented frame: the Museum is
   * restored and made visible first, and only then is the guest torn down. The
   * canvas is removed last, because a disposed context attached to a visible
   * element is a grey rectangle sitting over the room.
   */
  async dispose() {
    if (!this._guest) return false;
    this._stopLoop();
    const guest = this._guest;
    this._guest = null;

    this.museumCanvas.style.visibility = '';
    this._resumeMuseum();
    this.activePresentation = PRESENTATION.MUSEUM;

    try { await guest.dispose?.(); } catch { /* teardown must not block the room */ }
    if (this._canvas?.parentNode) this._canvas.parentNode.removeChild(this._canvas);
    this._canvas = null;
    this._guestId = null;
    this.stats.disposals += 1;
    return true;
  }

  /** What a conformance test asserts on, rather than inspecting the DOM itself. */
  report() {
    return {
      presentation: this.activePresentation,
      guestId: this._guestId,
      guestCanvases: this.stage.querySelectorAll('[data-nested-room]').length,
      museumCanvasHidden: this.museumCanvas.style.visibility === 'hidden',
      loopRunning: this._raf !== 0,
      ...this.stats
    };
  }
}
