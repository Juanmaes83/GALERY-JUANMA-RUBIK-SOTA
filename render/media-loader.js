/**
 * Immersive Worlds — Media loader
 *
 * The step that turns Immersive Worlds from a demo into a template: an
 * institution declares its own images and videos in the world file, and they
 * appear on the walls.
 *
 * Two rules shape this file.
 *
 *   1. **A broken file never leaves a hole in a wall.** Every load has a
 *      timeout and a fallback. If the image 404s, the entity still hangs, using
 *      the generated placeholder plate, and `asset:error` is emitted so QA and
 *      the authoring layer can see it. A gallery with one missing file is a
 *      gallery with a placeholder, not a gallery with a black rectangle.
 *
 *   2. **The engine never loads anything.** It declares what an entity is made
 *      of; this file — inside the render layer — resolves it. Swap the Scene
 *      Kit and the same declarations still work.
 *
 * Textures are cached and reference-counted, because the same file may hang in
 * two Spaces and Space disposal must not free a texture another Space is using.
 */

import { THREE } from './render-host.js';

const DEFAULT_TIMEOUT_MS = 12000;

export class MediaLoader {
  /**
   * @param {{bus:import('../engine/core/event-bus.js').EventBus, baseUrl?:string, timeoutMs?:number}} deps
   */
  constructor({ bus, baseUrl = '', timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    this.bus = bus;
    this.baseUrl = baseUrl;
    this.timeoutMs = timeoutMs;

    /** @type {Map<string, {texture:THREE.Texture, refs:number, video?:HTMLVideoElement}>} */
    this._cache = new Map();
    /** @type {Map<string, Promise<any>>} */
    this._inflight = new Map();
    /** Every load attempt, for the evidence bundle. */
    this.log = [];
  }

  _resolve(src) {
    if (!src) return src;
    if (/^(https?:)?\/\//.test(src) || src.startsWith('data:') || src.startsWith('blob:')) return src;
    return this.baseUrl ? new URL(src, this.baseUrl).href : src;
  }

  _record(entry) {
    this.log.push(entry);
    if (this.log.length > 200) this.log.shift();
  }

  /**
   * @param {import('../engine/schema/types.js').Media} media
   * @param {{entityId:string}} context
   * @returns {Promise<{texture:THREE.Texture|null, aspect:number|null, kind:string, fallback:boolean, video?:HTMLVideoElement}>}
   */
  async load(media, context = {}) {
    if (!media || media.kind === 'GENERATED' || !media.src) {
      return { texture: null, aspect: media?.aspect ?? null, kind: 'GENERATED', fallback: false };
    }

    const url = this._resolve(media.src);
    const cached = this._cache.get(url);
    if (cached) {
      cached.refs += 1;
      return {
        texture: cached.texture,
        aspect: cached.aspect,
        kind: media.kind,
        fallback: false,
        video: cached.video
      };
    }

    if (this._inflight.has(url)) return this._inflight.get(url);

    const started = performance.now();
    const promise = (media.kind === 'VIDEO' ? this._loadVideo(url, media, context) : this._loadImage(url))
      .then((result) => {
        this._cache.set(url, { ...result, refs: 1 });
        this._record({
          entityId: context.entityId ?? null, url, kind: media.kind,
          ok: true, ms: Math.round(performance.now() - started)
        });
        this.bus?.emit('asset:ready', { entityId: context.entityId, url, kind: media.kind });
        return { ...result, kind: media.kind, fallback: false };
      })
      .catch((error) => {
        // The world keeps working. This is the whole point of the fallback.
        this._record({
          entityId: context.entityId ?? null, url, kind: media.kind,
          ok: false, ms: Math.round(performance.now() - started), error: String(error?.message || error)
        });
        this.bus?.emit('asset:error', {
          entityId: context.entityId, url, kind: media.kind,
          message: String(error?.message || error)
        });
        return { texture: null, aspect: media.aspect ?? null, kind: 'GENERATED', fallback: true };
      })
      .finally(() => this._inflight.delete(url));

    this._inflight.set(url, promise);
    return promise;
  }

  _loadImage(url) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      const timer = setTimeout(() => {
        image.src = '';
        reject(new Error(`timeout after ${this.timeoutMs} ms`));
      }, this.timeoutMs);

      image.onload = () => {
        clearTimeout(timer);
        const texture = new THREE.Texture(image);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = 8;
        texture.generateMipmaps = true;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.needsUpdate = true;
        resolve({ texture, aspect: image.naturalWidth / image.naturalHeight });
      };
      image.onerror = () => {
        clearTimeout(timer);
        reject(new Error('image failed to load'));
      };
      image.src = url;
    });
  }

  _loadVideo(url, media, context = {}) {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.loop = media.loop !== false;
      // Muted is not a style choice: an unmuted video cannot autoplay, and a
      // gallery where the screens are frozen until someone clicks is broken.
      video.muted = media.muted !== false;
      video.playsInline = true;
      video.preload = 'auto';
      if (media.poster) video.poster = this._resolve(media.poster);

      const timer = setTimeout(() => reject(new Error(`timeout after ${this.timeoutMs} ms`)), this.timeoutMs);

      const ready = () => {
        clearTimeout(timer);
        const texture = new THREE.VideoTexture(video);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = false;
        video.play().then(
          () => { texture.userData.playing = true; },
          (error) => {
            // Autoplay can still be refused — by a policy, by a frame without
            // the permission, by a hostile tab. The frame stays visible, so the
            // wall does not go black, but the refusal is recorded rather than
            // swallowed: a projection that is frozen must not report success.
            texture.userData.playing = false;
            texture.userData.playError = error?.name || String(error);
            this._record({ entityId: context.entityId ?? null, url, kind: media.kind,
              ok: true, ms: 0, error: `autoplay refused: ${error?.name || error}` });
            // Recording it is not enough on its own: a refusal leaves a still
            // frame on the wall for the rest of the visit, which looks exactly
            // like a video that is playing very slowly. A refused policy is
            // satisfied by the visitor's first gesture, so the retry rides on
            // it — the pattern `breeze-studio-pro` already uses. The visitor
            // never learns there was a problem; the screen simply starts.
            this._retryOnGesture(video, texture);
          }
        );
        resolve({ texture, aspect: video.videoWidth / video.videoHeight || media.aspect || 16 / 9, video });
      };

      video.addEventListener('loadeddata', ready, { once: true });
      video.addEventListener('error', () => {
        clearTimeout(timer);
        reject(new Error('video failed to load'));
      }, { once: true });
      video.src = url;
    });
  }

  /**
   * Wait for the visitor's first gesture, then start the video they cannot yet
   * see is stopped. One listener per refused video, removed once it has served.
   */
  _retryOnGesture(video, texture) {
    const events = ['pointerdown', 'keydown', 'touchstart'];
    const attempt = () => {
      video.play().then(
        () => {
          texture.userData.playing = true;
          texture.userData.playError = null;
          for (const type of events) window.removeEventListener(type, attempt);
        },
        () => { /* still refused; the next gesture tries again */ }
      );
    };
    for (const type of events) window.addEventListener(type, attempt, { passive: true });
  }

  /** Release one reference; the texture is freed when the last Space lets go. */
  release(src) {
    const url = this._resolve(src);
    const entry = this._cache.get(url);
    if (!entry) return;
    entry.refs -= 1;
    if (entry.refs > 0) return;
    releaseVideo(entry.video);
    entry.texture.dispose();
    this._cache.delete(url);
  }

  /** QA evidence: what loaded, what fell back, and how long it took. */
  report() {
    const attempts = this.log.length;
    const failures = this.log.filter((entry) => !entry.ok);
    return {
      attempts,
      loaded: attempts - failures.length,
      failed: failures.length,
      cached: this._cache.size,
      slowestMs: this.log.reduce((max, entry) => Math.max(max, entry.ms || 0), 0),
      failures: failures.slice(-5)
    };
  }

  disposeAll() {
    for (const [, entry] of this._cache) {
      releaseVideo(entry.video);
      entry.texture.dispose();
    }
    this._cache.clear();
  }
}

/**
 * Let a video element go the way the proven modules in this repository do.
 *
 * `video.src = ''` does not clear the source: an empty string resolves against
 * the document's own address, so the element dutifully fetches the page and
 * tries to decode HTML as video — a wasted request and an error event fired at
 * teardown, when nobody is listening for a reason. Removing the attribute and
 * calling `load()` is the teardown `js/media-manager.js`, `breeze-studio-pro`
 * and `kinetic-letter-curtain-pro-v2` all use.
 */
function releaseVideo(video) {
  if (!video) return;
  try {
    video.pause();
    video.removeAttribute('src');
    video.load();
  } catch { /* the element is already beyond caring */ }
}
