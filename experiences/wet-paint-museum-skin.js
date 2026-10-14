/**
 * Museum re-skin for the Wet Paint donor.
 *
 * The donor keeps ALL of its real capabilities and controls — sliders, tabs,
 * Growth, modes, the Van Gogh collection, 3D geometry/model sources, uploads and
 * exports. This layer only changes what the visitor perceives: it injects a
 * Museum-palette stylesheet, relabels every visible string into Spanish, hides
 * ONLY the donor shell (branding, language toggle, credits, technical read-outs),
 * and organizes the real controls into Museum accordions. No donor file is edited.
 *
 *   HIDE THE SKIN, NOT THE CAPABILITIES.
 */

// data-i18n key → Spanish, for every control the panel now surfaces.
export const SPANISH_I18N = Object.freeze({
    // Growth
    growthControl: 'Crecimiento',
    restartGrowth: 'Reproducir crecimiento',
    growthTimeline: 'Línea de tiempo',
    pause: 'Pausa',
    // Source & library
    source: 'Fuente',
    importSource: 'Importar imagen o modelo GLB',
    localProcessing: 'JPG / PNG / WebP / GLB · proceso local',
    defaultGeometry: 'Geometría 3D',
    liveStrokeFollow: 'Seguimiento de pincel en vivo',
    sphere: 'Esfera',
    cube: 'Cubo',
    torus: 'Toro',
    knot: 'Nudo',
    modelColor: 'Color del modelo',
    builtInWorks: 'Colección Van Gogh',
    elevenWorks: '11 obras',
    strokeMorph: 'Transición entre obras',
    startTour: 'Recorrido automático',
    restoreScene: 'Restaurar colección',
    preview3d: 'Vista 3D',
    strokeResult: 'Resultado pincelado',
    loadingScenes: 'Cargando colección…',
    // Display
    display: 'Visualización',
    brushOnly: 'Solo pinceladas',
    beigeCanvas: 'Lienzo',
    original: 'Original',
    noStrokes: 'Sin pinceladas',
    brushAndOriginal: 'Mezcla',
    blendedView: 'Pinceladas + original',
    flowSketch: 'Boceto de flujo',
    pencilFlow: 'Líneas de dirección',
    brushLayers: 'Capas de pincel',
    coarse: 'Gruesa',
    structure: 'Estructura',
    medium: 'Media',
    shaping: 'Forma',
    fine: 'Fina',
    texture: 'Textura',
    // Stroke effect
    strokeEffects: 'Efecto de pincelada',
    previewQuality: 'Calidad',
    qualityBalanced: 'Fluida',
    qualityHigh: 'Alta',
    qualityUltra: 'Máxima',
    strokeSize: 'Tamaño de trazo',
    strokeLength: 'Longitud de trazo',
    strokeCount: 'Número de trazos',
    paintThickness: 'Empaste',
    paintDryness: 'Sequedad',
    paintViscosity: 'Viscosidad',
    // Output
    generateExport: 'Salida',
    exportPng: 'Exportar PNG 4K',
    exportVideo: 'Exportar vídeo del crecimiento',
});

// The Van Gogh collection, Spanish titles by scene id (donor manifest carries
// only Chinese + English). Applied to the real scene-card buttons.
export const SCENE_TITLES_ES = Object.freeze({
    sunflowers: 'Girasoles (1887)',
    roses: 'Rosas',
    'auvers-church': 'La iglesia de Auvers',
    'vineyards-auvers': 'Viñedos en Auvers',
    'olive-trees-blue-sky': 'Olivos (The Met)',
    cypresses: 'Cipreses',
    'wheat-field-cypresses': 'Trigal con cipreses',
    'olive-trees-yellow-sky': 'Olivos con cielo amarillo',
    'seascape-saintes-maries': 'Marina en Saintes-Maries',
    'yellow-house': 'La casa amarilla',
    'starry-night': 'La noche estrellada',
});

// Section id → Museum accordion title, order, and default-collapsed state.
const SECTIONS = [
    { id: 'source-controls', title: 'Fuente y biblioteca', order: 1, collapsed: true },
    { id: 'display-controls', title: 'Visualización', order: 2, collapsed: false },
    { id: 'stroke-controls', title: 'Pincelada', order: 3, collapsed: false },
    { id: 'growth-controls', title: 'Crecimiento', order: 4, collapsed: false },
    { id: 'output-controls', title: 'Salida', order: 5, collapsed: false },
];

const MUSEUM_SKIN_CSS = `
:root {
  --wp-ground:#100f0e; --wp-raise:#1a1917; --wp-ink:#ece7dd; --wp-dim:#9a9389;
  --wp-faint:#6f6960; --wp-accent:#bfa06a; --wp-accent-soft:rgba(191,160,106,.13);
  --wp-line:rgba(226,219,205,.14); --wp-line-strong:rgba(226,219,205,.30);
  --wp-sans:'Helvetica Neue', Inter, system-ui, Arial, sans-serif;
}
html, body, #app, .stage, #canvas-mount {
  background:var(--wp-ground) !important; color:var(--wp-ink) !important; font-family:var(--wp-sans) !important;
}
#app { grid-template-columns: minmax(0,1fr) 0px 440px !important; --panel-width:440px !important; }
#control-panel, .panel {
  width:440px !important; min-width:440px !important; max-width:440px !important;
  overflow-y:auto !important; overflow-x:hidden !important;
  background:var(--wp-ground) !important; color:var(--wp-ink) !important;
  border-left:1px solid var(--wp-line) !important; font-family:var(--wp-sans) !important;
}
/* Sections → Museum cards, ordered */
.panel-section {
  background:var(--wp-raise) !important; border:1px solid var(--wp-line) !important;
  border-radius:12px !important; margin:10px !important; padding:0 !important; color:var(--wp-ink) !important;
  overflow:hidden !important;
}
#source-controls{order:1 !important}#display-controls{order:2 !important}
#stroke-controls{order:3 !important}#growth-controls{order:4 !important}#output-controls{order:5 !important}
.panel-section > *:not(.wp-acc-header){ padding-left:14px !important; padding-right:14px !important; }
.panel-section > *:last-child{ padding-bottom:14px !important; }
.panel-section strong, .panel-section b, .panel-section span, .panel-section small,
.panel-section legend, .panel-section label, .panel-section output, .panel-section select {
  color:var(--wp-ink) !important; font-family:var(--wp-sans) !important;
}
.panel-section small { color:var(--wp-dim) !important; }
/* Accordion header */
.wp-acc-header {
  display:flex !important; align-items:center !important; justify-content:space-between !important;
  width:100% !important; padding:13px 14px !important; margin:0 !important;
  background:transparent !important; border:0 !important; border-radius:0 !important;
  color:var(--wp-ink) !important; font:600 13px/1 var(--wp-sans) !important;
  letter-spacing:.06em !important; text-transform:uppercase !important; cursor:pointer !important;
}
.wp-acc-header .wp-acc-chevron { transition:transform .15s ease; color:var(--wp-dim) !important; font-style:normal; }
.panel-section[data-wp-collapsed] .wp-acc-chevron { transform:rotate(-90deg); }
.panel-section[data-wp-collapsed] > *:not(.wp-acc-header){ display:none !important; }
/* Donor's own section titles are redundant with the accordion header */
.panel-section > .section-heading { display:none !important; }
#growth-controls .growth-section-head > div:first-child { display:none !important; }
.growth-section-head { padding-top:0 !important; }
/* Buttons → Museum */
#control-panel button, .panel button {
  background:transparent !important; color:var(--wp-ink) !important;
  border:1px solid var(--wp-line-strong) !important; border-radius:999px !important;
  font-family:var(--wp-sans) !important; letter-spacing:.04em;
}
#control-panel button:hover, .panel button:hover { background:rgba(236,231,221,.08) !important; }
#control-panel button.accent, #control-panel [aria-pressed="true"], .panel [aria-pressed="true"] {
  background:var(--wp-accent-soft) !important; border-color:var(--wp-accent) !important; color:var(--wp-ink) !important;
}
/* Display tabs + brush layers */
.layer-tabs input:checked + .layer-choice,
.brush-layer-switch-grid input:checked + .brush-layer-toggle {
  background:var(--wp-accent-soft) !important; border-color:var(--wp-accent) !important;
}
.layer-choice, .brush-layer-toggle { background:var(--wp-ground) !important; border:1px solid var(--wp-line) !important; color:var(--wp-ink) !important; }
/* Sliders + selects */
#control-panel input[type="range"], .panel input[type="range"] { accent-color:var(--wp-accent) !important; }
#control-panel select, .panel select {
  background:var(--wp-ground) !important; color:var(--wp-ink) !important;
  border:1px solid var(--wp-line-strong) !important; border-radius:8px !important;
}
/* Upload drop → Museum dashed */
.upload-drop {
  background:var(--wp-ground) !important; border:1px dashed var(--wp-line-strong) !important;
  border-radius:10px !important; color:var(--wp-ink) !important;
}
/* 3D geometry + model color */
.default-geometry-grid button, .model-color-palette button, .model-color-custom {
  background:var(--wp-ground) !important; border:1px solid var(--wp-line) !important; color:var(--wp-ink) !important;
}
/* Van Gogh collection grid */
.scene-library { background:transparent !important; border:1px solid var(--wp-line) !important; border-radius:10px !important; }
.scene-library > summary { color:var(--wp-ink) !important; }
.scene-grid { display:grid !important; grid-template-columns:repeat(3, 1fr) !important; gap:8px !important; }
.scene-card {
  display:flex !important; flex-direction:column !important; gap:5px !important;
  background:var(--wp-ground) !important; border:1px solid var(--wp-line) !important;
  border-radius:9px !important; padding:6px !important; cursor:pointer !important; color:var(--wp-ink) !important;
}
.scene-card:hover { border-color:var(--wp-accent) !important; }
.scene-card img { width:100% !important; aspect-ratio:1/1 !important; object-fit:cover !important; border-radius:6px !important; display:block !important; }
.scene-card span { font-size:10.5px !important; line-height:1.25 !important; color:var(--wp-dim) !important; }
/* Export buttons a touch more prominent */
.export-action-button { border-color:var(--wp-line-strong) !important; }
/* HIDE ONLY the donor shell — never a capability */
.panel-head, #language-toggle, .signature-credit, .runtime-probes,
#growth-progress, #panel-resizer, #model-light-control,
#stroke-count, #source-mode, #source-meta, .scene-picker-current,
.fps-badge, .visually-hidden { display:none !important; }
`;

function relabelScenes(doc) {
    doc.querySelectorAll('.scene-card[data-scene-id]').forEach((card) => {
        const id = card.getAttribute('data-scene-id');
        const es = SCENE_TITLES_ES[id];
        if (!es) return;
        const label = card.querySelector('span');
        if (label && label.textContent !== es) label.textContent = es;
        card.setAttribute('aria-label', es);
        card.setAttribute('title', es);
    });
}

function relabel(doc) {
    doc.querySelectorAll('[data-i18n]').forEach((el) => {
        const key = el.getAttribute('data-i18n');
        if (SPANISH_I18N[key] != null && el.textContent !== SPANISH_I18N[key]) el.textContent = SPANISH_I18N[key];
    });
    relabelScenes(doc);
}

function setupAccordions(doc) {
    SECTIONS.forEach(({ id, title, collapsed }) => {
        const sec = doc.getElementById(id);
        if (!sec || sec.querySelector(':scope > .wp-acc-header')) return;
        const header = doc.createElement('button');
        header.type = 'button';
        header.className = 'wp-acc-header';
        header.innerHTML = `<span>${title}</span><i class="wp-acc-chevron" aria-hidden="true">▾</i>`;
        if (collapsed) sec.setAttribute('data-wp-collapsed', '');
        header.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        header.addEventListener('click', () => {
            const isCollapsed = sec.hasAttribute('data-wp-collapsed');
            if (isCollapsed) { sec.removeAttribute('data-wp-collapsed'); header.setAttribute('aria-expanded', 'true'); }
            else { sec.setAttribute('data-wp-collapsed', ''); header.setAttribute('aria-expanded', 'false'); }
        });
        sec.insertBefore(header, sec.firstChild);
    });
}

/**
 * Apply the Museum skin: stylesheet + Spanish relabel + accordions. Idempotent;
 * a MutationObserver keeps labels/scene titles Spanish across the donor's own
 * dynamic re-renders (e.g. when the collection grid finishes loading).
 */
// Some labels are re-written by the donor's own JS after load (the collection
// grid, the auto-tour button, the source-preview label). Relabeling them in JS is
// a race we can lose; a static CSS `content` override always wins and needs no
// timing. The real text is collapsed to font-size:0 and the Spanish shown via
// ::after — the donor keeps its element and value, the visitor sees only Spanish.
function buildDynamicLabelCSS() {
    const sceneRules = Object.entries(SCENE_TITLES_ES)
        .map(([id, es]) => `.scene-card[data-scene-id="${id}"] span::after{content:"${es}";}`)
        .join('\n');
    return `
.scene-card span{font-size:0 !important;}
.scene-card span::after{font-size:10.5px !important;line-height:1.25;color:var(--wp-dim) !important;display:block;}
#scene-tour-toggle{font-size:0 !important;}
#scene-tour-toggle::after{content:"Recorrido automático";font-size:12px !important;letter-spacing:.04em;}
#source-preview-label{font-size:0 !important;}
#source-preview-label::after{content:"Original";font-size:13px !important;}
#model-source-name{font-size:0 !important;}
#model-source-name::after{content:"Modelo";font-size:13px !important;}
${sceneRules}`;
}

export function applyMuseumSkin(iframe) {
    const doc = iframe.contentDocument;
    if (!doc || !doc.head) return false;

    if (!doc.getElementById('wp-museum-skin')) {
        const style = doc.createElement('style');
        style.id = 'wp-museum-skin';
        style.textContent = MUSEUM_SKIN_CSS + buildDynamicLabelCSS();
        doc.head.appendChild(style);
    }
    setupAccordions(doc);
    relabel(doc);

    if (!iframe.__wpSkinObserver) {
        const obs = new MutationObserver(() => {
            try { setupAccordions(doc); relabel(doc); } catch { /* keep observing */ }
        });
        try {
            obs.observe(doc.body, { childList: true, subtree: true, characterData: true });
            iframe.__wpSkinObserver = obs;
        } catch { /* noop */ }
    }
    // The donor renders its collection grid asynchronously (manifest fetch) and the
    // MutationObserver can miss the exact batch. A short self-stopping interval
    // guarantees Spanish converges over the collection once it exists, then stops.
    if (!iframe.__wpRelabelTimer) {
        let ticks = 0;
        iframe.__wpRelabelTimer = setInterval(() => {
            ticks += 1;
            try { relabel(doc); } catch { /* noop */ }
            const cards = doc.querySelectorAll('.scene-card[data-scene-id]').length;
            if ((cards > 0 && ticks >= 6) || ticks >= 30) {
                clearInterval(iframe.__wpRelabelTimer);
                iframe.__wpRelabelTimer = 0;
            }
        }, 350);
    }
    return true;
}
