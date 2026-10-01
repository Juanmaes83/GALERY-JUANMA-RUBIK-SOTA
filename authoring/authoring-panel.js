/**
 * Museum — authoring panel (Vertical Slice 01)
 *
 * A creative tool, not a control surface for the engine. Everything here is
 * named the way a curator would name it, and every control edits the experience
 * config rather than poking at the running scene.
 *
 * Sections: INSTITUCIÓN · OBRA · MEDIOS · EXPERIENCIA · VISTA PREVIA.
 */

import { normaliseConfig, exportConfigJSON } from './experience-config.js';
import { ConfigStore } from './config-store.js';

const FIELD = (label, hint = '') =>
  `<label class="au-f"><span class="au-l">${label}</span>${hint ? `<span class="au-h">${hint}</span>` : ''}`;

export class AuthoringPanel {
  /**
   * @param {{config:object, vault:import('./media-vault.js').MediaVault,
   *          artworks:Array<{id:string, title:string}>,
   *          onApply:(config:object)=>Promise<void>|void}} deps
   */
  constructor({ config, vault, artworks, onApply }) {
    this.config = normaliseConfig(config);
    this.vault = vault;
    this.artworks = artworks;
    this.onApply = onApply;
    this.selectedArtworkId = artworks[0]?.id || null;
    // The room's screen, wherever the world put it. Discovered from the record,
    // not hard-coded, so a second museum's projection works the same way.
    this.videoTarget = artworks.find((x) => x.kind === 'PROJECTION') || null;
    this.videoTargetId = this.videoTarget?.id || null;
    this.dirty = false;
    this.root = document.createElement('aside');
    this.root.id = 'au';
    this.root.setAttribute('aria-label', 'Edición de la experiencia');
    document.body.appendChild(this.root);
    this._render();
  }

  _artwork(id = this.selectedArtworkId) {
    // VS02 renamed `artworks` to `entities` and split the single ambiguous media
    // slot into `image` and `video`. This panel is kept runnable as the VS02
    // gauntlet's baseline, so it rides the new model rather than a frozen copy of
    // the old one — its layout is what the comparison is about, not its plumbing.
    if (!this.config.entities[id]) {
      this.config.entities[id] = { title: null, creator: null, year: null, medium: null, description: null, image: null, video: null };
    }
    return this.config.entities[id];
  }

  _render() {
    const a = this._artwork();
    const source = this.artworks.find((x) => x.id === this.selectedArtworkId) || {};
    const video = this.videoTargetId ? this.config.entities[this.videoTargetId]?.video : null;
    const logo = this.config.institution.logo;
    this.root.innerHTML = `
      <header class="au-top">
        <div>
          <p class="au-eyebrow">Edición</p>
          <h1 class="au-title">${this.config.label || 'Experiencia'}</h1>
        </div>
        <button class="au-x" data-act="close" aria-label="Cerrar edición">×</button>
      </header>

      <section class="au-s">
        <h2>Institución</h2>
        <p class="au-note">Aparece en la cabecera de la sala y en la cartela de entrada del vestíbulo.</p>
        ${FIELD('Nombre')}<input data-bind="institution.name" value="${esc(this.config.institution.name)}"></label>
        ${FIELD('Claim')}<input data-bind="institution.claim" value="${esc(this.config.institution.claim)}"></label>
        ${FIELD('Fechas de la colección', 'Aparece bajo el claim en la cartela de entrada')}<input data-bind="institution.dates" value="${esc(this.config.institution.dates)}"></label>
        ${FIELD('Introducción')}<textarea rows="3" data-bind="institution.introduction">${esc(this.config.institution.introduction)}</textarea></label>
        ${FIELD('Logotipo', 'PNG, JPG o WebP')}
          <input type="file" accept="image/png,image/jpeg,image/webp" data-media="logo">
        </label>
        <p class="au-state" data-state="logo">${logo ? `Aplicado · ${esc(logo.name)}` : 'Sin logotipo'}</p>
      </section>

      <section class="au-s">
        <h2>Obra</h2>
        <p class="au-note">Un solo registro. La cartela, el detalle y la colección derivan de él.</p>
        ${FIELD('Obra en edición')}
          <select data-act="pick">
            ${this.artworks.map((x) => `<option value="${esc(x.id)}"${x.id === this.selectedArtworkId ? ' selected' : ''}>${esc(x.title)}</option>`).join('')}
          </select>
        </label>
        ${FIELD('Título')}<input data-bind="artwork.title" placeholder="${esc(source.title || '')}" value="${esc(a.title || '')}"></label>
        ${FIELD('Autoría')}<input data-bind="artwork.creator" placeholder="${esc(source.creator || '')}" value="${esc(a.creator || '')}"></label>
        ${FIELD('Año')}<input data-bind="artwork.year" placeholder="${esc(source.year || '')}" value="${esc(a.year || '')}"></label>
        ${FIELD('Técnica')}<input data-bind="artwork.medium" placeholder="${esc(source.medium || '')}" value="${esc(a.medium || '')}"></label>
        ${FIELD('Texto curatorial')}<textarea rows="3" data-bind="artwork.description" placeholder="${esc(source.description || '')}">${esc(a.description || '')}</textarea></label>
      </section>

      <section class="au-s">
        <h2>Medios</h2>
        ${FIELD('Imagen de la obra', 'JPG, PNG o WebP')}
          <input type="file" accept="image/jpeg,image/png,image/webp" data-media="artworkImage">
        </label>
        <p class="au-state" data-state="artworkImage">${a.image ? `Aplicada · ${esc(a.image.name)}` : 'Imagen original'}</p>
        ${FIELD('Vídeo de la sala', this.videoTarget
          ? `MP4 o WebM · se aplica a «${esc(this.videoTarget.title)}»`
          : 'Esta sala no tiene proyección')}
          <input type="file" accept="video/mp4,video/webm" data-media="artworkVideo"${this.videoTarget ? '' : ' disabled'}>
        </label>
        <p class="au-state" data-state="artworkVideo">${video ? `Aplicado · ${esc(video.name)}` : 'Sin vídeo autorizado'}</p>
      </section>

      <section class="au-s">
        <h2>Experiencia</h2>
        ${FIELD('Tratamiento del paso entre salas')}
          <select data-bind="experience.portalVariant">
            ${['A', 'B', 'C', 'D'].map((v) => `<option value="${v}"${this.config.experience.portalVariant === v ? ' selected' : ''}>${
              { A: 'A · arquitectónico', B: 'B · adaptado', C: 'C · híbrido sutil', D: 'D · motor IW' }[v]
            }</option>`).join('')}
          </select>
        </label>
      </section>

      <section class="au-s">
        <h2>Vista previa</h2>
        <div class="au-row">
          <button class="au-b au-b--go" data-act="apply">Aplicar a la sala</button>
          <button class="au-b" data-act="save">Guardar</button>
          <button class="au-b" data-act="restore">Restaurar</button>
        </div>
        <div class="au-row">
          <button class="au-b" data-act="export">Exportar JSON</button>
          <button class="au-b" data-act="museumB">Cargar Museo B</button>
          <button class="au-b au-b--quiet" data-act="reset">Volver al original</button>
        </div>
        <p class="au-state" data-state="io">${this.dirty ? 'Hay cambios sin aplicar.' : 'Sala al día.'}</p>
      </section>`;
    this._bind();
  }

  _bind() {
    this.root.querySelector('[data-act=close]').onclick = () => this.root.classList.toggle('au--hidden', true);
    this.root.querySelector('[data-act=pick]').onchange = (e) => {
      this.selectedArtworkId = e.target.value; this._render();
    };

    for (const input of this.root.querySelectorAll('[data-bind]')) {
      input.oninput = () => {
        const path = input.dataset.bind;
        const value = input.value;
        if (path.startsWith('artwork.')) this._artwork()[path.slice(8)] = value || null;
        else if (path.startsWith('institution.')) this.config.institution[path.slice(12)] = value;
        else if (path.startsWith('experience.')) this.config.experience[path.slice(11)] = value;
        this._markDirty();
      };
    }

    for (const picker of this.root.querySelectorAll('[data-media]')) {
      picker.onchange = async (e) => {
        const slot = picker.dataset.media;
        const file = e.target.files?.[0];
        const kind = slot === 'artworkVideo' ? 'video' : 'image';
        const state = this.root.querySelector(`[data-state=${slot}]`);
        state.textContent = 'Cargando…';
        state.className = 'au-state au-state--busy';

        // Each medium lands on the entity that can actually show it. A video
        // belongs to the projection, not to a framed canvas, and an image and a
        // video must not share one slot — choosing one would silently discard
        // the other, which is what the label already promised would not happen.
        const targetId = slot === 'artworkVideo'
          ? (this.videoTargetId || this.selectedArtworkId)
          : this.selectedArtworkId;

        // Replacing releases the previous asset: an object URL that is dropped
        // rather than revoked is a leak that never announces itself.
        const previous = slot === 'logo' ? this.config.institution.logo
          : slot === 'artworkVideo' ? this._artwork(targetId).video : this._artwork(targetId).image;
        if (previous?.assetId) this.vault.release(previous.assetId);

        const asset = await this.vault.accept(file, { kind });
        if (asset.state === 'ERROR') {
          state.textContent = asset.error;
          state.className = 'au-state au-state--bad';
          return;
        }
        const ref = {
          kind, src: asset.reference, assetId: asset.id,
          name: asset.name, mimeType: asset.mimeType, bytes: asset.bytes,
          width: asset.width, height: asset.height
        };
        if (slot === 'logo') this.config.institution.logo = ref;
        else if (slot === 'artworkVideo') this._artwork(targetId).video = ref;
        else this._artwork(targetId).image = ref;

        state.textContent = kind === 'video'
          ? `Listo · ${asset.name} · ${asset.width}×${asset.height} · ${asset.duration.toFixed(1)} s`
          : `Lista · ${asset.name} · ${asset.width}×${asset.height}`;
        state.className = 'au-state au-state--ok';
        this._markDirty();
      };
    }

    const act = (name, fn) => { const b = this.root.querySelector(`[data-act=${name}]`); if (b) b.onclick = fn; };
    act('apply', () => this._apply());
    act('save', () => { ConfigStore.save(this.config); this._say('Guardado en este navegador.'); });
    act('restore', () => {
      const stored = ConfigStore.load();
      if (!stored) return this._say('No hay ninguna configuración guardada.', true);
      this.config = stored; this._render(); this._apply();
    });
    act('export', () => {
      const text = exportConfigJSON(this.config);
      navigator.clipboard?.writeText(text).catch(() => {});
      this._say(`Configuración copiada al portapapeles · ${text.length} bytes.`);
      console.info('[authoring] config', text);
    });
    act('museumB', async () => {
      const response = await fetch('./authoring/museum-b.config.json', { cache: 'no-store' });
      this.config = normaliseConfig(await response.json());
      this._render(); this._apply();
    });
    act('reset', () => { this.config = normaliseConfig({ label: 'Original' }); this._render(); this._apply(); });
  }

  _markDirty() {
    this.dirty = true;
    this._say('Hay cambios sin aplicar.');
  }

  _say(message, bad = false) {
    const el = this.root.querySelector('[data-state=io]');
    if (el) { el.textContent = message; el.className = `au-state${bad ? ' au-state--bad' : ''}`; }
  }

  async _apply() {
    this._say('Aplicando…');
    await this.onApply(this.config);
    this.dirty = false;
    this._say('Sala al día.');
  }
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
