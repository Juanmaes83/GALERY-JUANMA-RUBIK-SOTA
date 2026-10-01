/**
 * Museum — Authored media vault
 *
 * Holds the media an author supplies for the length of a session, and gives out
 * a durable reference (`authored:<id>`) that a config can store while the live
 * object URL stays here.
 *
 * REUSE NOTE. The lifecycle is `js/media-manager.js`'s, which this project has
 * already proven: create an object URL, load it through a real element, read the
 * dimensions or duration off that element as the readiness signal, and revoke on
 * replacement. Two of its decisions are worth naming because they are the ones
 * that stop leaks — the URL is revoked when a slot is *replaced*, not only when
 * it is removed; and a file that fails to decode revokes immediately rather than
 * lingering as a half-loaded slot.
 *
 * Adapted rather than imported for the same reason as the config model: that
 * file is an `EP.*` global outside this module's boundary.
 *
 * States, and none of them is skipped:
 *   SELECTED → LOADING → (DECODED) → READY → APPLIED, or → ERROR
 *   any state → RELEASED, exactly once
 *
 * DECODED exists only for video and is not ceremony: a video whose header has
 * parsed is not a video that can show a frame, and an author watching a slow
 * upload deserves to see the difference between "still arriving" and "arrived,
 * now decoding". Images go LOADING → READY because for an image those are the
 * same moment.
 */

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const VIDEO_TYPES = ['video/mp4', 'video/webm'];

/** Long enough for a large file over a slow disk, short enough to be an answer. */
const PROBE_TIMEOUT_MS = 20000;

/** Wide enough to recognise a work, small enough to keep dozens in memory. */
const THUMB_W = 200;

/**
 * One frame of a video, as a data URL.
 *
 * Returns null rather than throwing: a poster is a convenience, and a file that
 * will not paint into a canvas — a cross-origin source, a codec the 2D context
 * declines — is still a perfectly good video for the wall.
 */
function posterFrom(video) {
  try {
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return null;
    const canvas = document.createElement('canvas');
    canvas.width = THUMB_W;
    canvas.height = Math.max(1, Math.round((THUMB_W * h) / w));
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.72);
  } catch {
    return null;
  }
}

/**
 * The browser fills `File.type` from the operating system, and the operating
 * system does not always know. On Windows the MIME for an extension comes from
 * the registry, and `.webm` and `.mp4` frequently have no entry — the file
 * arrives with `type: ''`. Judging only by MIME told an author their perfectly
 * good video was "not a video", which is why images worked and video did not:
 * `.jpg` and `.png` are registered on essentially every machine.
 *
 * So the extension is consulted when the MIME is missing or unhelpful. This does
 * not make acceptance loose — the decoder is still the final judge, and a file
 * that cannot produce a frame still fails, just with a truthful reason.
 */
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];
const VIDEO_EXTENSIONS = ['mp4', 'webm', 'm4v'];

function looksLike(file, kind) {
  const types = kind === 'video' ? VIDEO_TYPES : IMAGE_TYPES;
  const extensions = kind === 'video' ? VIDEO_EXTENSIONS : IMAGE_EXTENSIONS;
  const type = String(file?.type || '').toLowerCase();
  if (types.includes(type)) return true;
  // A type that names the right family but a codec we did not list is still
  // worth handing to the decoder rather than refusing on a string comparison.
  if (type.startsWith(`${kind}/`)) return true;
  if (type) return false;
  const extension = String(file?.name || '').split('.').pop().toLowerCase();
  return extensions.includes(extension);
}

/**
 * What each state is called on screen. Internal enum names are for the code;
 * an author reads Spanish, and reads about their file rather than about our
 * state machine.
 */
const COPY = {
  image: {
    SELECTED: 'Seleccionada', LOADING: 'Cargando…', DECODED: 'Decodificando…',
    READY: 'Lista', APPLIED: 'En la sala', ERROR: 'No se pudo usar', RELEASED: 'Retirada'
  },
  video: {
    SELECTED: 'Seleccionado', LOADING: 'Cargando…', DECODED: 'Decodificado',
    READY: 'Listo', APPLIED: 'En la sala', ERROR: 'No se pudo usar', RELEASED: 'Retirado'
  }
};

/** The ordered chain, so a UI can draw progress instead of a single word. */
export const ASSET_CHAIN = Object.freeze({
  image: ['SELECTED', 'LOADING', 'READY'],
  video: ['SELECTED', 'LOADING', 'DECODED', 'READY']
});

/**
 * One asset, described for a person: state in words, the facts that prove the
 * file is real, and the reason when it is not.
 */
export function describeAsset(asset, media = null) {
  // A file that came with the project rather than from this session has no vault
  // asset — it is a path the world already resolves. Reporting "Sin archivo"
  // beside its own filename, under a button reading "Cambiar archivo", was three
  // signals giving two different answers in one card.
  if (!asset && media?.src) {
    const chain = ASSET_CHAIN[media.kind] || ASSET_CHAIN.image;
    const facts = [];
    if (media.width && media.height) facts.push(`${media.width}×${media.height}`);
    return {
      state: 'READY', label: 'En el proyecto', name: media.name,
      detail: facts.join(' · '), chain, index: chain.length - 1
    };
  }
  if (!asset) return { label: 'Sin archivo', detail: '', state: null, chain: [], index: -1 };
  const copy = COPY[asset.kind] || COPY.image;
  const chain = ASSET_CHAIN[asset.kind] || ASSET_CHAIN.image;
  const facts = [];
  if (asset.width && asset.height) facts.push(`${asset.width}×${asset.height}`);
  if (asset.duration) facts.push(`${asset.duration.toFixed(1)} s`);
  if (asset.bytes) facts.push(`${(asset.bytes / 1024).toFixed(0)} kB`);
  return {
    state: asset.state,
    label: copy[asset.state] || asset.state,
    name: asset.name,
    detail: asset.state === 'ERROR' ? asset.error : facts.join(' · '),
    chain,
    index: chain.indexOf(asset.state)
  };
}

export class MediaVault {
  constructor({ onChange } = {}) {
    /** @type {Map<string, object>} */
    this.assets = new Map();
    this.onChange = onChange || (() => {});
    this._n = 0;
  }

  /** `authored:<id>` in a config resolves to the live object URL, or null. */
  resolve(reference) {
    if (typeof reference !== 'string' || !reference.startsWith('authored:')) return null;
    const asset = this.assets.get(reference.slice(9));
    return asset && asset.state === 'READY' ? asset.url : null;
  }

  get(id) { return this.assets.get(id) || null; }

  /**
   * Take a file from the author and drive it to READY.
   *
   * Rejects unsupported media loudly: silently accepting a `.mov` and rendering
   * nothing is the failure mode this exists to prevent.
   */
  async accept(file, { kind = 'image' } = {}) {
    const id = `a${(this._n += 1)}_${Date.now().toString(36)}`;
    const asset = {
      id,
      reference: `authored:${id}`,
      kind,
      name: file?.name || 'sin nombre',
      mimeType: file?.type || '',
      bytes: file?.size || 0,
      state: 'SELECTED',
      url: null,
      error: null,
      width: 0,
      height: 0,
      duration: 0,
      thumb: null
    };
    this.assets.set(id, asset);
    this.onChange(asset);

    if (!file) return this._fail(asset, 'No se ha seleccionado ningún archivo.');
    if (!looksLike(file, kind)) {
      const wanted = kind === 'video' ? 'un vídeo MP4 o WebM' : 'una imagen JPG, PNG o WebP';
      return this._fail(asset, `Ese archivo no es ${wanted}. Elige otro y vuelve a intentarlo.`);
    }

    asset.state = 'LOADING';
    this.onChange(asset);
    const url = URL.createObjectURL(file);

    try {
      if (kind === 'video') {
        // Readiness is metadata plus enough buffered data to draw, not the file
        // handle existing. "Selected" is not "ready".
        const meta = await this._probeVideo(url, () => {
          asset.state = 'DECODED';
          this.onChange(asset);
        });
        asset.width = meta.width; asset.height = meta.height; asset.duration = meta.duration;
        asset.thumb = meta.thumb || null;
      } else {
        const meta = await this._probeImage(url);
        asset.width = meta.width; asset.height = meta.height;
        // An image is its own thumbnail; the object URL already points at it.
        asset.thumb = url;
      }
    } catch (error) {
      URL.revokeObjectURL(url);
      return this._fail(asset, String(error?.message || error));
    }

    asset.url = url;
    asset.state = 'READY';
    this.onChange(asset);
    return asset;
  }

  _probeImage(url) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => reject(new Error('La imagen no se pudo decodificar.'));
      image.src = url;
    });
  }

  _probeVideo(url, onDecoded = () => {}) {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.preload = 'auto';
      video.muted = true;
      video.playsInline = true;
      // The header parsed: the file is a video and we know its shape. Not yet
      // playable, and the author is told exactly that.
      video.onloadedmetadata = () => onDecoded();
      let settled = false;
      // A codec the browser half-recognises can leave a load neither resolved
      // nor errored, and the author waits on "Cargando…" with no way to tell a
      // slow file from a dead one. Every proven implementation in this
      // repository bounds the wait; this one did not.
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        teardown();
        reject(new Error('El vídeo tardó demasiado en abrirse. Puede que el códec no sea compatible.'));
      }, PROBE_TIMEOUT_MS);
      // `src = ''` resolves against the page's own address, so the element goes
      // off and loads the document as if it were a video — a wasted request and
      // a spurious error. Removing the attribute and reloading is how the four
      // implementations this was adapted from let a video element go.
      const teardown = () => {
        clearTimeout(timer);
        try { video.pause(); video.removeAttribute('src'); video.load(); } catch { /* already gone */ }
      };
      const done = () => {
        if (settled) return;
        settled = true;
        if (!video.videoWidth) {
          teardown();
          reject(new Error('El vídeo no tiene pista de imagen legible.'));
          return;
        }
        const meta = {
          width: video.videoWidth,
          height: video.videoHeight,
          duration: video.duration || 0,
          // A still, taken while the element is still alive. A catalogue that
          // shows a filename for every video and a picture for every image is
          // a catalogue you cannot skim, and the frame is free here — the
          // decoder has just produced one.
          thumb: posterFrom(video)
        };
        teardown();
        resolve(meta);
      };
      // canplaythrough, not loadedmetadata: metadata alone means the header
      // parsed, which is not the same as being able to show a frame.
      video.oncanplaythrough = done;
      video.onloadeddata = () => { if (video.readyState >= 2) done(); };
      video.onerror = () => {
        if (settled) return;
        settled = true;
        teardown();
        reject(new Error('El vídeo no se pudo decodificar. Prueba con un MP4 (H.264) o un WebM.'));
      };
      video.src = url;
    });
  }

  _fail(asset, message) {
    asset.state = 'ERROR';
    asset.error = message;
    this.onChange(asset);
    return asset;
  }

  /** Revoke and forget. Called on replacement as well as on removal. */
  release(id) {
    const asset = this.assets.get(id);
    if (!asset) return false;
    if (asset.url) URL.revokeObjectURL(asset.url);
    asset.url = null;
    asset.state = 'RELEASED';
    this.assets.delete(id);
    this.onChange(asset);
    return true;
  }

  releaseAll() {
    for (const id of [...this.assets.keys()]) this.release(id);
  }

  report() {
    return [...this.assets.values()].map((a) => ({
      id: a.id, kind: a.kind, name: a.name, state: a.state,
      width: a.width, height: a.height, duration: a.duration, error: a.error
    }));
  }
}
