import { StudioShell } from './studio-shell.js';

let installed = false;

export function installMuseumPhase2LayoutFix() {
  if (installed) return;
  installed = true;

  const original = StudioShell.prototype._secondColumn;
  StudioShell.prototype._secondColumn = function phase2UnifiedSecondColumn() {
    const html = original.call(this);
    if (this.domain !== 'content' && this.domain !== 'experience') return html;
    return `<div class="st-tree p2-unified-workspace" data-p2-unified="${this.domain}">${html}</div>`;
  };

  // Phase 1 re-renders the Visitor cards, so listeners attached to the original
  // buttons are not durable. Capture the semantic preview intent at document
  // level instead: map and full visitor preview then share the same reversible
  // contract while retaining the correct mode label.
  document.addEventListener('pointerdown', (event) => {
    const action = event.target?.closest?.('[data-p1-action]');
    if (!action) return;
    window.__IW_PHASE2_REQUESTED_MODE = action.dataset.p1Action === 'preview-map' ? 'map' : 'visitor';
  }, true);

  const studio = window.__IW_STUDIO;
  if (studio) studio.render();
}
