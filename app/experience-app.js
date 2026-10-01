/**
 * Immersive Worlds — Published experience shell
 *
 * This is the *visitor* application: it boots the engine, hands it a Museum
 * Scene Kit, wires input and UI, and renders. There is no editing affordance
 * anywhere in it — Author Mode is a different entry point with a different
 * camera authority (author.html).
 *
 * The shell is thin on purpose. Almost everything it does is either DOM wiring
 * or forwarding a semantic Action to the runtime, which is the shape you want
 * when a second front end (embed, kiosk, export) has to exist later.
 */

import { Runtime } from '../engine/core/runtime.js';
import { ACTION, CAMERA_AUTHORITY } from '../engine/schema/types.js';
import { EVENTS } from '../engine/core/event-bus.js';
import { EXPERIENCE_MODE } from '../engine/world/world-state.js';
import { RenderHost } from '../render/render-host.js';
import { MuseumSceneKit } from '../scene-kits/museum/museum-scene-kit.js';
import { MediaLoader } from '../render/media-loader.js';
import { detectTier, isMobileEnv, policyForTier } from '../engine/core/device-tier.js';
import { AudioDirector } from './audio-director.js';
import { ExperienceHUD } from './ui/hud.js';
import { InputSystem } from './ui/input.js';
import { DETERMINISTIC_STATES, STATE_NAMES } from '../qa/deterministic-states.js';
import { applyConfigToWorld, baseConfigFromWorld, normaliseConfig } from '../authoring/experience-config.js';
import { MediaVault } from '../authoring/media-vault.js';
import { NestedRoomController } from './nested/nested-room-controller.js';
import { ConfigStore } from '../authoring/config-store.js';

const params = new URLSearchParams(location.search);
const WORLD_URL = params.get('world') || './worlds/museum-v1.world.json';

export async function boot() {
  const canvas = document.getElementById('iw-canvas');
  const uiRoot = document.getElementById('iw-ui');

  const reducedMotion =
    params.get('reducedMotion') === '1' ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const env = {
    userAgent: navigator.userAgent,
    deviceMemory: navigator.deviceMemory,
    hardwareConcurrency: navigator.hardwareConcurrency,
    maxTouchPoints: navigator.maxTouchPoints,
    screenWidth: window.screen?.width,
    devicePixelRatio: window.devicePixelRatio
  };
  const tier = params.get('tier')?.toUpperCase() || detectTier(env);
  const seed = params.get('seed') || 'fundacion-arenas-v1';

  // The authoring layer edits data, and the Museum is built from that data. So
  // the config is applied to the world record here, before anything is
  // constructed — which is why a second institution needs no engine change:
  // every representation already derives from these records.
  const authoringOn = params.get('authoring') === '1';
  const vault = window.__IW_VAULT || (window.__IW_VAULT = new MediaVault());
  const world = await fetch(WORLD_URL, { cache: 'no-store' }).then((response) => {
    if (!response.ok) throw new Error(`No se pudo cargar el mundo (${response.status})`);
    return response.json();
  });

  // The client layer, applied to the data. `window.__IW_CONFIG` lets a re-boot
  // carry the authored config across without persisting it first, which is what
  // makes "apply" feel immediate rather than like a save-and-reload.
  const activeConfig = normaliseConfig(
    window.__IW_CONFIG || ConfigStore.load() || baseConfigFromWorld(world)
  );
  const authoredWorld = applyConfigToWorld(world, activeConfig, (ref) => vault.resolve(ref));

  const renderHost = new RenderHost({ canvas, quality: policyForTier(tier, { mobile: isMobileEnv(env) }) });
  // Media paths in a world file are relative to that file, so an institution can
  // keep its collection next to its world definition.
  const mediaLoader = new MediaLoader({ bus: null, baseUrl: new URL(WORLD_URL, location.href).href });
  const visualStone = params.get('visualStone') === 'baseline' ? 'baseline' : 'premium';
  const glbStone = params.get('glbStone') === 'fallback' ? 'fallback' : 'glb';
  const sceneKit = new MuseumSceneKit({ renderHost, mediaLoader, visualStone, glbStone });
  document.documentElement.dataset.museumVisualStone = visualStone;
  document.documentElement.dataset.museumGlbStone = glbStone;

  const runtime = new Runtime({
    world: authoredWorld,
    sceneKit,
    // The wall label sits low in the frame on desktop and becomes a sheet on a
    // phone. Framing composes the work into what is left, so the label never
    // covers the thing it describes.
    viewport: () => ({
      ...renderHost.viewport(),
      insetRight: 0,
      insetBottom: window.innerWidth >= 900 ? 0.16 : 0.34
    }),
    seed,
    tier,
    env,
    reducedMotion,
    mode: 'EXPERIENCE'
  });

  // The loader could not have the bus at construction time; give it one now so
  // asset failures reach the same event vocabulary as everything else.
  mediaLoader.bus = runtime.bus;

  const audio = new AudioDirector();
  const hud = new ExperienceHUD({ root: uiRoot, runtime, audio });
  // ONE SEMANTIC RECORD → MULTIPLE REPRESENTATIONS. The institution's visitor
  // information is authored once and read here by the person in the room.
  hud.setVisitorInfo(activeConfig.visitor, activeConfig.institution?.name || '');

  // Loading evidence comes from the lifecycle itself, not from a fake timer.
  let readySpaces = 0;
  runtime.bus.on(EVENTS.SPACE_PRELOAD_REQUESTED, ({ spaceId }) => {
    hud.setLoadingProgress(0.25, `Construyendo ${runtime.store.require(spaceId).title.toLowerCase()}…`);
  });
  runtime.bus.on(EVENTS.SPACE_READY, () => {
    readySpaces += 1;
    hud.setLoadingProgress(Math.min(0.35 + readySpaces * 0.3, 0.95), 'Compilando materiales…');
  });

  const input = new InputSystem({
    element: canvas,
    explore: runtime.explore,
    focus: runtime.focus,
    onActivate: () => {
      if (runtime.state.mode === EXPERIENCE_MODE.GUIDED) return;
      if (runtime.state.focusedEntityId) runtime.releaseFocus();
      else runtime.activateNearest();
    },
    onEscape: () => {
      if (hud.mapOpen) return hud.toggleMap(false);
      if (!hud.el.a11y.hidden) return hud.toggleAccessibility(false);
      if (runtime.state.mode === EXPERIENCE_MODE.GUIDED) return runtime.exitRoute();
      if (runtime.state.focusedEntityId) return runtime.releaseFocus();
      if (document.pointerLockElement) document.exitPointerLock();
      return undefined;
    },
    onToggleMap: () => hud.toggleMap(),
    onStartRoute: () => {
      const route = runtime.store.routes[0];
      if (route && runtime.state.mode !== EXPERIENCE_MODE.GUIDED) runtime.startRoute(route.id);
    },
    // These two only mean something while a work is being inspected, and they
    // report back whether they consumed the event so the room keeps its own
    // meaning for the same keys.
    onZoom: (delta) => {
      if (!runtime.state.focusedEntityId || runtime.state.mode === EXPERIENCE_MODE.GUIDED) return false;
      hud.setZoom(hud.zoom + delta);
      return true;
    },
    onStepWork: (delta) => {
      if (!runtime.state.focusedEntityId || runtime.state.mode === EXPERIENCE_MODE.GUIDED) return false;
      return Boolean(runtime.focusNeighbour(delta));
    }
  });

  // Input belongs to the visitor only while the visitor owns the camera.
  runtime.bus.on(EVENTS.CAMERA_AUTHORITY_CHANGED, ({ to }) => {
    input.setEnabled(to === CAMERA_AUTHORITY.EXPLORE);
    if (to !== CAMERA_AUTHORITY.EXPLORE && document.pointerLockElement) document.exitPointerLock();
  });

  // Rooms the Museum does not render itself. A no-op until the visitor reaches
  // one; the world graph decides which Spaces those are, not this file.
  const nested = new NestedRoomController({
    runtime,
    stage: document.getElementById('iw-stage'),
    museumCanvas: canvas
  }).listen(runtime.bus, EVENTS);

  runtime.onFrame = (pose, dt) => {
    input.update(dt);
    // Exactly one presentation is authoritative. While a guest is up the Museum
    // still runs its simulation — the route keeps playing, the Director keeps
    // deciding, the HUD keeps updating — but it does not draw, and the pose it
    // resolved is handed to whoever is drawing instead.
    if (nested.frame(pose)) return;
    renderHost.applyPose(pose);
    // Variant D's destination pass sits exactly where the owned Infinite Worlds
    // render loop puts it: after the visitor camera is placed, before the frame
    // is drawn. A no-op for every other variant.
    sceneKit.renderPortalPass?.(renderHost);
    renderHost.render(sceneKit.scene);
  };

  window.addEventListener('resize', () => renderHost.resize(), { passive: true });

  await runtime.start();
  hud.setLoadingProgress(1, 'La sala está preparada');
  runtime.startLoop();

  // Portal treatment variant, for the Block 2B visual comparison. Default is the
  // approved architectural crossing; the others exist to be looked at, and
  // nothing about them survives a page load that does not ask for one.
// The Museum's canonical representation is D — IW_ENGINE, the proven
// first-party portal. Approved by Juanma on pixel evidence: variant A leaves
// `_thresholdPreset` at NONE, so no portal surface is built, and a crossing
// with no membrane is a naked hard cut with nothing to occlude the world swap
// and nothing for the recoil to look back at.
//
// A, B and C are kept and still reachable by `?portalVariant=`: they are valid
// alternative representations and future authoring options, not dead code. This
// default is scoped to this Museum experience shell and changes nothing for any
// other Immersive Worlds product.
const portalVariant = (params.get('portalVariant') || 'D').toUpperCase();
  sceneKit.setThresholdTreatment?.({ A: 'NONE', B: 'ADAPTED', C: 'SUBTLE', D: 'IW_ENGINE' }[portalVariant] || 'NONE');

  // Authoring is opt-in and additive: without ?authoring=1 nothing below runs and
  // the Museum behaves exactly as it always has.
  //
  // `?shell=vs01` keeps the first vertical slice reachable. It is not dead code
  // kept out of sentiment: the VS02 gauntlet compares against it at the same
  // task, viewport and state, and a baseline you cannot run is a baseline you
  // cannot compare.
  if (authoringOn && params.get('shell') !== 'vs01') {
    await mountStudio({ world, activeConfig, vault, boot, runtime });
  } else if (authoringOn) {
    const [{ AuthoringPanel }] = await Promise.all([import('../authoring/authoring-panel.js')]);
    if (!document.getElementById('au-css')) {
      const link = document.createElement('link');
      link.id = 'au-css'; link.rel = 'stylesheet'; link.href = './authoring/authoring.css';
      document.head.appendChild(link);
    }
    // Works, not signage. The wall panels are the institution's own voice and are
    // edited in the INSTITUCIÓN section; listing them here put a wall at the top
    // of the "obra en edición" picker, so the field an author typed a title into
    // first was not an artwork at all.
    const WORK_KINDS = new Set(['ARTWORK', 'SCULPTURE', 'PROJECTION', 'AUDIO']);
    const artworks = authoredWorld.entities
      .filter((e) => e.content?.title && WORK_KINDS.has(e.kind))
      .map((e) => ({
        id: e.id, kind: e.kind, title: e.content.title, creator: e.content.creator,
        year: e.content.year, medium: e.content.medium, description: e.content.description
      }));

    // Applying re-boots, and a re-boot runs this block again. Without clearing
    // the previous mount, every apply left another editor stacked on top of the
    // last one — duplicate `id="au"` nodes, so closing the editor closed the one
    // underneath and the visible panel never went away.
    document.getElementById('au')?.remove();
    document.getElementById('au-open')?.remove();

    const openBtn = document.createElement('button');
    openBtn.id = 'au-open'; openBtn.textContent = 'Editar';
    document.body.appendChild(openBtn);

    const panel = new AuthoringPanel({
      config: activeConfig,
      vault,
      artworks,
      // Applying re-boots the experience from the authored data. Mutating a
      // built scene in place would mean a second path to every representation,
      // and two paths drift; rebuilding from the record keeps one truth. It
      // costs about a second and needs no developer.
      onApply: async (config) => {
        window.__IW_CONFIG = config;
        const url = new URL(location.href);
        url.searchParams.set('portalVariant', config.experience.portalVariant || 'D');
        history.replaceState(null, '', url);
        if (window.__IW?.runtime) { try { window.__IW.runtime.dispose(); } catch { /* */ } }
        document.getElementById('iw-ui').innerHTML = '';
        await boot();
      }
    });
    openBtn.onclick = () => panel.root.classList.toggle('au--hidden');
    window.__IW_PANEL = panel;
  }

  const requestedState = params.get('state');
  installProbe({ runtime, renderHost, sceneKit, hud, audio, input, mediaLoader, tier, seed, reducedMotion });
  window.__IW.nested = nested;

  if (requestedState && DETERMINISTIC_STATES[requestedState]) {
    // A QA run enters directly, without the human "enter" gesture.
    input.setEnabled(false);
    hud.el.veil.hidden = true;
    await DETERMINISTIC_STATES[requestedState].apply(runtime);
    window.__IW.state = requestedState;
  } else if (document.body.dataset.studio === 'on') {
    // An author is already inside the product; making them click "entrar" before
    // every preview would put a door in the middle of their workspace. Sound
    // still waits for a real gesture, because the browser requires one.
    hud.el.veil.hidden = true;
  } else {
    hud.showEnter(() => {
      audio.resume().then(() => {
        audio.setAmbience(runtime.store.require(runtime.state.activeSpaceId).ambience);
      });
      canvas.focus?.();
    });
  }

  window.__IW.ready = true;
  document.documentElement.dataset.iwReady = 'true';
  return runtime;
}

/**
 * Mount the VS02 Studio around the running Museum.
 *
 * The shell is furniture: it docks the canvas by setting one attribute on
 * `<body>` and lets the render host measure itself, which it already did from
 * its own element. No engine call changes, no second renderer, no second truth.
 */
async function mountStudio({ world, activeConfig, vault, boot, runtime }) {
  const [{ StudioShell }] = await Promise.all([import('../authoring/studio/studio-shell.js')]);
  // Awaited, not fired and forgotten: the shell measures its own column on first
  // render to letterbox the preview, and a measurement taken before the
  // stylesheet lands measures an unstyled div — which silently pinned the canvas
  // to its minimum height.
  if (!document.getElementById('st-css')) {
    const link = document.createElement('link');
    link.id = 'st-css'; link.rel = 'stylesheet'; link.href = './authoring/studio/studio.css';
    const ready = new Promise((resolve) => { link.onload = resolve; link.onerror = resolve; });
    document.head.appendChild(link);
    await ready;
  }

  // A re-boot runs this again. Clearing the previous mount is what VS01 had to
  // learn the hard way: two nodes with one id, and closing the editor closed the
  // one underneath.
  document.getElementById('st')?.remove();
  document.getElementById('au')?.remove();
  document.getElementById('au-open')?.remove();

  document.body.dataset.studio = 'on';
  // The canvas just changed size. It measures its own element, so one call after
  // the layout settles is the whole integration.
  requestAnimationFrame(() => window.__IW?.renderHost?.resize());

  const rebuild = async (config) => {
    window.__IW_CONFIG = config;
    const url = new URL(location.href);
    url.searchParams.set('portalVariant', config.experience.portalVariant || 'D');
    history.replaceState(null, '', url);
    // Lowering the flag makes every wait on it edge-triggered, for QA and for the
    // studio alike: `ready` left true from the previous boot is how a capture
    // ends up photographing the loading veil.
    if (window.__IW) window.__IW.ready = false;
    if (window.__IW?.runtime) { try { window.__IW.runtime.dispose(); } catch { /* */ } }
    document.getElementById('iw-ui').innerHTML = '';
    await boot();
  };

  const studio = new StudioShell({
    config: activeConfig,
    world,
    vault,

    // The library renders the world's own media in <img>, so it needs the same
    // base the loader resolves against.
    mediaBaseUrl: new URL(WORLD_URL, location.href).href,
    currentRoom: () => {
      const runtime = window.__IW?.runtime;
      if (!runtime) return '';
      try { return runtime.store.require(runtime.state.activeSpaceId)?.title || ''; } catch { return ''; }
    },

    // PREVIEW: the authored project, shown in the docked Museum. The author stays
    // in the studio.
    onApply: rebuild,

    // START: not another Apply. The studio leaves, the canvas returns to the full
    // window, and what remains is the visitor's experience with no authoring
    // furniture in it.
    onStart: async (config) => {
      window.__IW_CONFIG = config;
      studio.destroy();
      delete document.body.dataset.studio;
      const url = new URL(location.href);
      url.searchParams.delete('authoring');
      history.replaceState(null, '', url);
      requestAnimationFrame(() => window.__IW?.renderHost?.resize());
      window.__IW?.hud?.showEnter?.(() => {
        window.__IW.audio?.resume?.();
        document.getElementById('iw-canvas')?.focus?.();
      });
    },

    // Selecting a node walks the preview to where that node lives, so "where does
    // this live" is answered in the room rather than only in the tree.
    onReveal: async (nodeId) => {
      const runtime = window.__IW?.runtime;
      if (!runtime) return;
      const entity = (world.entities || []).find((e) => e.id === nodeId);
      // Institution and exhibition are not entities, but they are not abstract
      // either: they render onto the entry wall. Editing them should show that
      // wall, or the fields appear to change nothing.
      const spaceId = nodeId === 'institution' || nodeId === 'exhibition'
        ? world.startSpaceId
        : entity?.spaceId
        || ((world.spaces || []).some((s) => s.id === nodeId) ? nodeId : null);
      if (!spaceId) return;
      if (spaceId !== runtime.state.activeSpaceId) {
        // Resolve the shortest directed sequence of real WorldGraph portals.
        // The previous one-hop lookup left Breeze and Wet Paint showing Gallery A
        // whenever the selected room was more than one doorway away. This remains
        // a real traversal: no teleport, no second graph and no invented portal.
        const portals = world.portals || [];
        const queue = [{ spaceId: runtime.state.activeSpaceId, path: [] }];
        const visited = new Set([runtime.state.activeSpaceId]);
        let path = null;
        while (queue.length && !path) {
          const current = queue.shift();
          for (const portal of portals.filter((item) => item.fromSpaceId === current.spaceId)) {
            if (visited.has(portal.toSpaceId)) continue;
            const nextPath = [...current.path, portal];
            if (portal.toSpaceId === spaceId) { path = nextPath; break; }
            visited.add(portal.toSpaceId);
            queue.push({ spaceId: portal.toSpaceId, path: nextPath });
          }
        }
        for (const portal of path || []) {
          try { await runtime.traversePortal(portal.id, { source: 'STUDIO' }); }
          catch { break; }
        }
      }

      // Walking to the right room was never the whole promise. An author editing
      // "División tercera" was shown Galería A from across the floor, with five
      // pieces in it and no way to tell which one they were editing — the tree,
      // the editor and the filmstrip all named the work while the one surface
      // that could have pointed at it showed a room.
      //
      // So the piece itself is framed, using the runtime's own focus rather than
      // a pose invented here: the studio still exposes no camera controls, and
      // what an author sees is what the product already does for a visitor
      // inspecting that work. Selecting a room or the institution releases the
      // focus again, because a room is not a subject.
      if (entity) {
        try { runtime.focusEntity(nodeId, {}, { source: 'STUDIO' }); } catch { /* stays in the room */ }
      } else {
        try { runtime.releaseFocus(); } catch { /* nothing was focused */ }
      }
    }
  });

  window.__IW_STUDIO = studio;
  window.__IW_PANEL = studio;   // the QA surface keeps one name for "the editor"

  // The preview can change rooms without the studio asking — a guided beat, a
  // portal, a QA harness. Listening to the world means the badge names the room
  // the visitor is in rather than the last room the studio sent them to.
  // The runtime in scope, not `window.__IW` — the probe that publishes it is
  // installed later in this same boot, so reading the global here would wire the
  // studio to the previous run's bus.
  runtime.bus?.on?.(EVENTS.SPACE_ENTERED, () => studio._refreshLive());
}

/**
 * The QA/console surface. Everything a reviewer or a Playwright spec needs to
 * inspect the engine — including the assertions that the architecture's
 * invariants actually held during the run.
 */
function installProbe(context) {
  const { runtime, renderHost, sceneKit, hud, audio, input, mediaLoader, tier, seed, reducedMotion } = context;

  window.__IW = {
    ready: false,
    state: null,
    version: 'IW-2',
    tier,
    seed,
    reducedMotion,
    runtime,
    renderHost,
    hud,
    audio,
    mediaLoader,
    input,

    /** Full runtime report — the object the QA suite writes into its evidence. */
    report: () => ({ ...runtime.report(), media: mediaLoader.report(), models: sceneKit.modelAssetReport?.() || {} }),

    /** Apply a named deterministic state at runtime. */
    async applyState(name) {
      const state = DETERMINISTIC_STATES[name];
      if (!state) throw new Error(`Unknown state "${name}". Known: ${STATE_NAMES.join(', ')}`);
      input.setEnabled(false);
      await state.apply(runtime);
      window.__IW.state = name;
      return runtime.report();
    },

    states: STATE_NAMES,

    /** Wait for N rendered frames — how a spec settles the image before a capture. */
    frames(count = 8) {
      return new Promise((resolve) => {
        let remaining = count;
        const tick = () => (remaining-- <= 0 ? resolve(true) : requestAnimationFrame(tick));
        requestAnimationFrame(tick);
      });
    },

    dispatch: (action, ctx = { source: 'QA' }) => runtime.actions.dispatch(action, ctx),

    /**
     * The architectural assertions, executable.
     *
     * These are the claims IW-1 makes about itself. If one of them returns
     * false, the milestone is not what it says it is.
     */
    assertInvariants() {
      const store = runtime.store;
      const state = runtime.state;
      const results = [];
      const check = (id, claim, pass, detail = '') => results.push({ id, claim, pass: !!pass, detail });

      const identity = store.auditCanonicalIdentity();
      check('INV-CANONICAL', 'Cada id resuelve a exactamente un registro canónico',
        identity.ok, `${identity.total} registros; ${identity.violations.length} violaciones`);

      const sameObject = store.entitiesOf(state.activeSpaceId)
        .every((entity) => store.get(entity.id) === entity);
      check('INV-BY-REFERENCE', 'Las Spaces referencian entidades, no copias', sameObject);

      let noCamera = true;
      let cameraDetail = '';
      try { state.assertNoCameraState(); } catch (error) { noCamera = false; cameraDetail = String(error.message); }
      check('INV-WORLD-NOT-CAMERA', 'World State no contiene estado de cámara', noCamera, cameraDetail);

      check('INV-ONE-CAMERA-WRITER', 'Un único controlador de cámara autoritativo por frame',
        runtime.camera.violations.length === 0,
        `${runtime.camera.report().frame} frames, ${runtime.camera.violations.length} violaciones`);

      const hotspotFields = store.hotspots.every((hotspot) =>
        !('fromSpaceId' in hotspot) && !('toSpaceId' in hotspot) && !('transitionBehaviour' in hotspot));
      const portalFields = store.portals.every((portal) =>
        !('action' in portal) && !('triggerDistance' in portal) && !('interactionVolume' in portal));
      check('INV-HOTSPOT-NOT-PORTAL', 'Hotspot dispara, Portal conecta: sin solape de responsabilidad',
        hotspotFields && portalFields);

      const renderFree = [...store.entities, ...store.spaces, ...store.portals]
        .every((record) => !JSON.stringify(record).match(/"(mesh|material|geometry|shader|object3d)"/i));
      check('INV-SEMANTIC-NOT-VISUAL', 'Ningún registro semántico contiene implementación de render', renderFree);

      // Both interaction paths must speak the declared Action vocabulary, and
      // every action the world references must have a handler. This holds from
      // the first frame, before anything has been dispatched.
      const declared = new Set(Object.keys(ACTION));
      const hotspotActions = store.hotspots.map((hotspot) => hotspot.action?.type);
      const stepActions = store.storySteps.map((step) => step.action?.type).filter(Boolean);
      const used = [...new Set([...hotspotActions, ...stepActions])];
      const undeclared = used.filter((type) => !declared.has(type));
      const unhandled = used.filter((type) => !runtime.actions._handlers.has(type));
      check('INV-SHARED-ACTIONS', 'Hotspots y pasos guiados usan el mismo vocabulario declarado de Action',
        undeclared.length === 0 && unhandled.length === 0,
        `${used.length} acciones en uso: ${used.join(', ')}`);

      check('INV-SCENEKIT-CONTRACT', 'El motor sólo habla con el Scene Kit por contrato',
        runtime.sceneKit.name === 'museum' && typeof runtime.sceneKit.framingForEntity === 'function');

      const unreachable = runtime.graph.unreachableFrom(store.startSpaceId);
      check('INV-GRAPH-CONNECTED', 'Todas las salas son alcanzables desde el inicio',
        unreachable.length === 0, unreachable.join(', '));

      return { ok: results.every((r) => r.pass), results };
    }
  };
}
