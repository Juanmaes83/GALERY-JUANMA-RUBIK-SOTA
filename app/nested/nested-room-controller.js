/**
 * Wire the specialised nested-room host into the running Museum.
 *
 * Museum owns the WorldGraph, portals, room lifecycle and outer navigation.
 * A nested guest owns only the specialised room presentation while its Space is
 * active. Exactly one presentation is authoritative at a time.
 */

import { NestedRoomHost } from './nested-room-host.js';
import { BreezeStudioProGuest } from './breeze/breeze-studio-pro-guest.js';

export class NestedRoomController {
  constructor({ runtime, stage, museumCanvas }) {
    this.runtime = runtime;
    this.stage = stage;
    this.host = new NestedRoomHost({
      stage,
      museumCanvas,
      pauseMuseum: () => { this._museumPaused = true; },
      resumeMuseum: () => { this._museumPaused = false; }
    });
    this._museumPaused = false;
    this._roomOrigin = [0, 0, 0];
    this._activating = null;
    this._activeSpaceId = null;
    this._exitButton = null;
    this.lastError = null;
    this.stats = { entered: 0, left: 0, failed: 0 };

    // Full-room graft: preserve the approved Breeze Studio PRO V4.1 rather than
    // rebuilding its authoring capabilities inside Museum.
    this.host.register('room.breeze', () => new BreezeStudioProGuest());
  }

  get isPresenting() { return this.host.isGuestActive; }

  _runtimeIdFor(spaceId) {
    try {
      return this.runtime.store.require(spaceId)?.metadata?.nestedRuntime || null;
    } catch { return null; }
  }

  _originFor(spaceId) {
    try {
      return this.runtime.store.require(spaceId)?.metadata?.roomOrigin || [0, 0, 0];
    } catch { return [0, 0, 0]; }
  }

  _translate(pose) {
    const [ox, oy, oz] = this._roomOrigin;
    return {
      position: [pose.position[0] - ox, pose.position[1] - oy, pose.position[2] - oz],
      target: [pose.target[0] - ox, pose.target[1] - oy, pose.target[2] - oz],
      fov: pose.fov
    };
  }

  listen(bus, EVENTS) {
    bus.on(EVENTS.SPACE_ENTERED, ({ spaceId }) => {
      const runtimeId = this._runtimeIdFor(spaceId);
      if (runtimeId) this._enter(spaceId, runtimeId);
      else if (this.host.isGuestActive) this._leave();
    });
    return this;
  }

  _exitPortalFor(spaceId) {
    try {
      const space = this.runtime.store.require(spaceId);
      for (const portalId of space.portalRefs || []) {
        const portal = this.runtime.store.require(portalId);
        if (portal.fromSpaceId === spaceId && portal.toSpaceId) return portal;
      }
    } catch { /* bounded fallback below */ }
    return null;
  }

  _removeExitBridge() {
    if (this._exitButton?.parentNode) this._exitButton.parentNode.removeChild(this._exitButton);
    this._exitButton = null;
  }

  _installExitBridge(spaceId) {
    this._removeExitBridge();
    const portal = this._exitPortalFor(spaceId);
    if (!portal || !this.stage) return;

    const destination = (() => {
      try { return this.runtime.store.require(portal.toSpaceId)?.title || 'sala anterior'; }
      catch { return 'sala anterior'; }
    })();

    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.breezeMuseumExit = 'true';
    button.textContent = `← ${destination.replace(/\s+—.*$/, '')}`;
    button.setAttribute('aria-label', `Volver a ${destination}`);
    Object.assign(button.style, {
      position: 'absolute',
      left: '18px',
      top: '18px',
      zIndex: '60',
      padding: '10px 14px',
      border: '1px solid rgba(255,255,255,.34)',
      borderRadius: '999px',
      background: 'rgba(10,10,10,.78)',
      color: '#fff',
      font: '600 13px/1 system-ui, sans-serif',
      letterSpacing: '.01em',
      cursor: 'pointer',
      backdropFilter: 'blur(8px)'
    });
    button.addEventListener('click', async () => {
      if (button.disabled) return;
      button.disabled = true;
      try {
        // This is not a modal close. It uses the canonical Breeze -> Gallery B
        // WorldGraph portal, so lifecycle, arrival spawn and Museum state all
        // advance exactly as they do for any other room crossing.
        await this.runtime.traversePortal(portal.id, {
          crossing: true,
          source: 'breeze-studio-pro-exit'
        });
      } catch (error) {
        this.lastError = String(error?.message || error);
        button.disabled = false;
      }
    });
    this.stage.appendChild(button);
    this._exitButton = button;
  }

  async _enter(spaceId, runtimeId) {
    if (this.host.isGuestActive || this._activating) return false;
    this._activeSpaceId = spaceId;
    this._roomOrigin = this._originFor(spaceId);
    const pose = this._translate(this.runtime.camera.pose);
    this._activating = this.host.activate(runtimeId, { pose })
      .then(() => {
        this.stats.entered += 1;
        this._installExitBridge(spaceId);
      })
      .catch((e) => {
        this.lastError = String(e?.message || e);
        this.stats.failed += 1;
        this._removeExitBridge();
        return this.host.dispose().catch(() => {});
      })
      .finally(() => { this._activating = null; });
    return this._activating;
  }

  async _leave() {
    await this._activating?.catch(() => {});
    this._removeExitBridge();
    await this.host.dispose();
    this._activeSpaceId = null;
    this.stats.left += 1;
    return true;
  }

  frame(pose) {
    if (!this.host.isGuestActive) return false;
    this.host.setCameraPose(this._translate(pose));
    return true;
  }

  report() {
    return {
      ...this.host.report(),
      roomOrigin: this._roomOrigin,
      activeSpaceId: this._activeSpaceId,
      museumPaused: this._museumPaused,
      exitBridge: Boolean(this._exitButton?.isConnected),
      lastError: this.lastError,
      guest: this.host._guest?.report?.() ?? null,
      ...this.stats
    };
  }

  async dispose() {
    await this._leave().catch(() => {});
  }
}
