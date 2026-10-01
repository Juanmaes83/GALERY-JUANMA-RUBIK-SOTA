/**
 * Immersive Worlds — Input
 *
 * One DOM listener authority. Movement may target legacy first-person Explore or
 * a Character movement sink, but commands (Esc/M/G/E) remain Museum-owned.
 */

export const KEY_BINDINGS = Object.freeze([
  { keys: ['W', '↑'], action: 'Avanzar' },
  { keys: ['S', '↓'], action: 'Retroceder' },
  { keys: ['A', 'D'], action: 'Moverse / girar según modo Explore' },
  { keys: ['←', '→'], action: 'Girar la vista · en detalle, obra anterior o siguiente' },
  { keys: ['E', 'Enter'], action: 'Activar el punto más cercano' },
  { keys: ['Esc'], action: 'Salir del detalle o del recorrido' },
  { keys: ['Rueda'], action: 'En detalle: acercarse a la obra' },
  { keys: ['M'], action: 'Abrir el mapa de salas' },
  { keys: ['G'], action: 'Iniciar el recorrido comentado' },
  { keys: ['Shift'], action: 'Caminar más rápido' },
  { keys: ['Espacio'], action: 'Character Explore: saltar' }
]);

export class InputSystem {
  constructor({ element, explore, focus, onActivate, onEscape, onToggleMap, onStartRoute, onZoom, onStepWork }) {
    this.element = element;
    this.explore = explore;
    this.focus = focus;
    this.callbacks = { onActivate, onEscape, onToggleMap, onStartRoute, onZoom, onStepWork };
    this._keys = new Set();
    this.movementEnabled = true;
    this._pointerLocked = false;
    this._touch = { id: null, originX: 0, originY: 0, lookId: null, lookX: 0, lookY: 0 };
    this._disposers = [];
    this.enabled = true;
    this._turn = 0;
    this._movementSink = null;
    this._bind();
  }

  _on(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    this._disposers.push(() => target.removeEventListener(type, handler, options));
  }

  _bind() {
    this._on(window, 'keydown', (event) => this._onKey(event, true));
    this._on(window, 'keyup', (event) => this._onKey(event, false));
    this._on(window, 'blur', () => { this._keys.clear(); this._applyKeys(); });

    this._on(this.element, 'click', () => {
      if (!this.enabled || !this.movementEnabled || this._movementSink) return;
      if (!this._pointerLocked && this.element.requestPointerLock) this.element.requestPointerLock();
    });
    this._on(document, 'pointerlockchange', () => {
      this._pointerLocked = document.pointerLockElement === this.element;
      this.element.dataset.pointerLocked = String(this._pointerLocked);
    });
    this._on(window, 'mousemove', (event) => {
      if (!this.enabled) return;
      if (this._pointerLocked && this.movementEnabled && !this._movementSink) {
        this.explore.input.lookX += event.movementX;
        this.explore.input.lookY += event.movementY;
      }
      const rect = this.element.getBoundingClientRect();
      this.focus.pointer = {
        x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
        y: ((event.clientY - rect.top) / rect.height) * 2 - 1
      };
    });
    this._on(this.element, 'wheel', (event) => {
      const handled = this.callbacks.onZoom?.(-Math.sign(event.deltaY) * 0.12);
      if (handled) event.preventDefault();
    }, { passive: false });
    this._on(this.element, 'touchstart', (event) => this._onTouchStart(event), { passive: true });
    this._on(this.element, 'touchmove', (event) => this._onTouchMove(event), { passive: false });
    this._on(this.element, 'touchend', (event) => this._onTouchEnd(event), { passive: true });
  }

  _onKey(event, down) {
    if (!this.enabled) return;
    if (isTyping(event.target)) {
      if (down && this._keys.size) { this._keys.clear(); this._applyKeys(); }
      return;
    }
    const code = event.code;
    if (down && !event.repeat) {
      switch (code) {
        case 'KeyE': case 'Enter': this.callbacks.onActivate?.(); break;
        case 'Escape': this.callbacks.onEscape?.(); break;
        case 'KeyM': this.callbacks.onToggleMap?.(); break;
        case 'KeyG': this.callbacks.onStartRoute?.(); break;
        case 'Space': if (this._movementSink && this.movementEnabled) this._movementSink.jump?.(); break;
        case 'ArrowLeft': if (this.callbacks.onStepWork?.(-1)) event.preventDefault(); break;
        case 'ArrowRight': if (this.callbacks.onStepWork?.(1)) event.preventDefault(); break;
        default: break;
      }
    }

    if (!this.movementEnabled) {
      this._keys.clear();
      this._applyKeys();
      return;
    }
    if (down) this._keys.add(code); else this._keys.delete(code);
    if (MOVEMENT_CODES.has(code)) event.preventDefault();
    this._applyKeys();
  }

  _applyKeys() {
    const held = this._keys;
    const forward = (held.has('KeyW') || held.has('ArrowUp') ? 1 : 0) - (held.has('KeyS') || held.has('ArrowDown') ? 1 : 0);
    const run = held.has('ShiftLeft') || held.has('ShiftRight');

    if (this._movementSink) {
      const turn = (held.has('KeyD') || held.has('ArrowRight') ? 1 : 0) - (held.has('KeyA') || held.has('ArrowLeft') ? 1 : 0);
      this.explore.input.forward = 0;
      this.explore.input.right = 0;
      this.explore.input.run = false;
      this._turn = 0;
      this._movementSink.setInput?.({ forward, turn, run });
      return;
    }

    const right = (held.has('KeyD') ? 1 : 0) - (held.has('KeyA') ? 1 : 0);
    this.explore.input.forward = forward;
    this.explore.input.right = right;
    this.explore.input.run = run;
    this._turn = (held.has('ArrowRight') ? 1 : 0) - (held.has('ArrowLeft') ? 1 : 0);
  }

  update(dt) {
    if (this._movementSink) {
      this._movementSink.inputFrame?.(dt);
      return;
    }
    if (this._turn) this.explore.input.lookX += this._turn * dt * 620;
    if (this._touch.lookId !== null) {
      this.explore.input.lookX += this._touch.lookX;
      this.explore.input.lookY += this._touch.lookY;
      this._touch.lookX = 0;
      this._touch.lookY = 0;
    }
  }

  setMovementSink(sink) {
    this._keys.clear();
    this.explore.input.forward = 0;
    this.explore.input.right = 0;
    this.explore.input.run = false;
    this._turn = 0;
    this._movementSink?.setInput?.({ forward: 0, turn: 0, run: false });
    this._movementSink = sink || null;
    this._movementSink?.setInput?.({ forward: 0, turn: 0, run: false });
    if (document.pointerLockElement === this.element && this._movementSink) document.exitPointerLock?.();
  }

  get movementSink() { return this._movementSink; }

  _onTouchStart(event) {
    if (!this.enabled || !this.movementEnabled || this._movementSink) return;
    const rect = this.element.getBoundingClientRect();
    for (const touch of event.changedTouches) {
      const left = touch.clientX - rect.left < rect.width / 2;
      if (left && this._touch.id === null) {
        this._touch.id = touch.identifier; this._touch.originX = touch.clientX; this._touch.originY = touch.clientY;
      } else if (!left && this._touch.lookId === null) {
        this._touch.lookId = touch.identifier; this._touch.lastX = touch.clientX; this._touch.lastY = touch.clientY;
      }
    }
  }

  _onTouchMove(event) {
    if (!this.enabled || !this.movementEnabled || this._movementSink) return;
    for (const touch of event.changedTouches) {
      if (touch.identifier === this._touch.id) {
        event.preventDefault();
        const dx = (touch.clientX - this._touch.originX) / 60;
        const dy = (touch.clientY - this._touch.originY) / 60;
        this.explore.input.forward = clampUnit(-dy); this.explore.input.right = clampUnit(dx);
      } else if (touch.identifier === this._touch.lookId) {
        event.preventDefault();
        this._touch.lookX += (touch.clientX - this._touch.lastX) * 1.6;
        this._touch.lookY += (touch.clientY - this._touch.lastY) * 1.6;
        this._touch.lastX = touch.clientX; this._touch.lastY = touch.clientY;
      }
    }
  }

  _onTouchEnd(event) {
    for (const touch of event.changedTouches) {
      if (touch.identifier === this._touch.id) { this._touch.id = null; this.explore.input.forward = 0; this.explore.input.right = 0; }
      if (touch.identifier === this._touch.lookId) this._touch.lookId = null;
    }
  }

  setEnabled(enabled) {
    this.movementEnabled = enabled;
    if (!enabled) {
      this._keys.clear();
      this.explore.input.forward = 0;
      this.explore.input.right = 0;
      this._turn = 0;
      this._movementSink?.setInput?.({ forward: 0, turn: 0, run: false });
    }
  }

  dispose() {
    this.setMovementSink(null);
    for (const off of this._disposers) off();
    this._disposers = [];
  }
}

const MOVEMENT_CODES = new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space']);
const EDITABLE_TAGS = new Set(['INPUT','TEXTAREA','SELECT']);
function isTyping(target) {
  if (!target || target.nodeType !== 1) return false;
  if (target.isContentEditable) return true;
  if (!EDITABLE_TAGS.has(target.tagName)) return false;
  if (target.disabled) return false;
  return true;
}
function clampUnit(value) { return Math.max(-1, Math.min(1, value)); }
