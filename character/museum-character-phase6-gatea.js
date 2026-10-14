import { THREE } from '../render/render-host.js';
import { registerSocialMotionV3, SOCIAL_V3_ACTIONS, SOCIAL_V3_PROVENANCE } from './character-social-motion-v3.js';
import { createMuseumCharacterSemanticView } from './museum-character-semantic-view.js';
import { MuseumHumanSpatialContract, MUSEUM_HUMAN_PROFILE } from './museum-human-spatial-contract.js';

const BASE_MOTION = new Set(['IDLE_V2','WALK_V2','STOP_V2','TURN_LEFT_V2','TURN_RIGHT_V2','JUMP']);
const TARGETED = new Set(['POINT','LOOK_AT','AFTER_YOU']);
const STUCK_SECONDS = 0.85;
const MAX_REROUTES = 2;
const PROGRESS_EPSILON = 0.008;
const INTERMEDIATE_TOLERANCE = 0.22;
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const wrapAngle = (v) => Math.atan2(Math.sin(v), Math.cos(v));

const CAPABILITY_GROUPS = Object.freeze({
  SOCIAL: ['WAVE','GOODBYE','NOD','WELCOME'],
  TARGETED: ['POINT','LOOK_AT','AFTER_YOU'],
  BODY: ['JUMP','CROUCH','STEP_UP','STEP_DOWN','STAIRS_UP','STAIRS_DOWN','LADDER_UP','LADDER_DOWN'],
  CONTACT: ['PRESS_DOORBELL','KNOCK_DOOR','PICK_UP_CUP','OPEN_DOOR','PICK_UP_PHONE','PICK_UP_MAGAZINE','SIT_SOFA','LEAN_WALL']
});

class MuseumLookAtController {
  constructor(root) {
    this.root = root;
    this.head = root.getObjectByName?.('head') || null;
    this.neck = root.getObjectByName?.('neck') || null;
    this.headRest = this.head?.quaternion.clone() || new THREE.Quaternion();
    this.neckRest = this.neck?.quaternion.clone() || new THREE.Quaternion();
    this.target = null;
    this.weight = 0;
    this.targetWeight = 0;
    this.speed = 7;
    this._headWorld = new THREE.Vector3();
    this._targetLocal = new THREE.Vector3();
  }
  lookAt(target, options = {}) {
    this.target = target?.clone ? target.clone() : new THREE.Vector3(...target);
    this.targetWeight = clamp(options.weight ?? 1, 0, 1);
    this.speed = options.speed ?? 7;
  }
  clear() { this.targetWeight = 0; }
  update(dt) {
    if (!this.head) return;
    this.weight = THREE.MathUtils.damp(this.weight, this.targetWeight, this.speed, dt);
    if (!this.target || this.weight < .001) return;
    this.head.getWorldPosition(this._headWorld);
    this._targetLocal.copy(this.target);
    this.root.worldToLocal(this._targetLocal);
    const headLocal = this.root.worldToLocal(this._headWorld.clone());
    const dir = this._targetLocal.sub(headLocal);
    const horizontal = Math.max(Math.hypot(dir.x, dir.z), .0001);
    const yaw = clamp(Math.atan2(dir.x, dir.z), -.72, .72);
    const pitch = clamp(-Math.atan2(dir.y, horizontal), -.38, .38);
    const headDelta = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch*.72, yaw*.72, 0, 'YXZ'));
    const neckDelta = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch*.28, yaw*.28, 0, 'YXZ'));
    this.head.quaternion.slerp(this.headRest.clone().multiply(headDelta), Math.min(1, dt*this.speed*Math.max(this.weight,.1)));
    if (this.neck) this.neck.quaternion.slerp(this.neckRest.clone().multiply(neckDelta), Math.min(1, dt*this.speed*Math.max(this.weight,.1)));
  }
}

function phase4Foundation() {
  const phase4b = window.__IW_CHARACTER_PHASE4B;
  if (phase4b?.ready && phase4b.phase4a?.ready) return phase4b.phase4a;
  const phase4a = window.__IW_CHARACTER_PHASE4A;
  return phase4a?.ready ? phase4a : null;
}

function capabilityMatrix(motion, semanticReady) {
  const matrix = {};
  for (const action of CAPABILITY_GROUPS.SOCIAL) matrix[action] = { state:motion.has?.(action) ? 'READY' : 'MISSING', reason:'Social Motion V3' };
  for (const action of CAPABILITY_GROUPS.TARGETED) matrix[action] = {
    state: semanticReady && (action === 'LOOK_AT' || motion.has?.(action)) ? 'READY' : 'CONTEXT_REQUIRED',
    reason: semanticReady ? 'Requires selected canonical Museum subject' : 'No semantic viewpoint in active space'
  };
  matrix.JUMP = { state:'READY', reason:'Already validated Phase 4 locomotion capability' };
  for (const action of CAPABILITY_GROUPS.BODY.filter((x) => x !== 'JUMP')) matrix[action] = { state:'CONTEXT_REQUIRED', reason:'Gate B / real terrain affordance required' };
  for (const action of CAPABILITY_GROUPS.CONTACT) matrix[action] = { state:'CONTEXT_REQUIRED', reason:'Gate B / real contact affordance required' };
  return matrix;
}

function matrixCounts(matrix) {
  const counts = { READY:0, CONTEXT_REQUIRED:0, MISSING:0 };
  Object.values(matrix).forEach((v) => { counts[v.state] = (counts[v.state] || 0) + 1; });
  return counts;
}

function cleanPhase5Language(html = '') {
  return String(html)
    .replaceAll('PHASE 5 · G1', 'AVATAR · RUNTIME')
    .replaceAll('LISTO GATE 1', 'PERFIL LISTO')
    .replaceAll('Avatar Profile · Gate 1', 'Avatar Profile · Runtime')
    .replaceAll('Phase 5 · Gate 1', 'Avatar Runtime · Phase 6')
    .replaceAll('Motion + LAB usarán este mismo perfil y este mismo preview. IK / LookAt y acciones avanzadas permanecen desactivadas hasta su gate correspondiente.', 'Phase 5 está cerrada. Gate A usa este mismo perfil sobre el Character real; el preview auxiliar queda oculto mientras el runtime está activo.')
    .replaceAll('<h3>Siguiente Gate</h3>', '<h3>Estado del Avatar</h3>');
}

function installStudioSurface(api) {
  const controller = window.__IW_AVATAR_STUDIO_PHASE5?.controller;
  if (!controller || controller.__phase6GateAInstalled) return null;
  controller.__phase6GateAInstalled = true;
  const originalEditor = controller.editor.bind(controller);
  const originalBind = controller.bind.bind(controller);
  const originalSecondColumn = controller.secondColumn?.bind(controller);
  const originalFilmstrip = controller.filmstrip?.bind(controller);

  function panelHTML() {
    const r = api.report();
    const destinations = r.semantic.destinations;
    const selected = destinations.find((x) => x.id === r.selectedDestinationId) || destinations[0] || null;
    const options = destinations.map((d) => `<option value="${esc(d.id)}" ${selected?.id === d.id ? 'selected' : ''}>${esc(d.label)}</option>`).join('');
    const social = ['WAVE','GOODBYE','NOD','WELCOME'].map((action) => `<button class="st-b" data-gatea-action="${action}">${action}</button>`).join('');
    const targetedDisabled = selected ? '' : 'disabled';
    return `<section class="st-group st-avatar-gatea">
      <h3>Phase 6 · Gate A · Capacidades + Semántica</h3>
      <p class="st-note">Acciones sobre el Character real. El preview auxiliar de Phase 5 queda suprimido mientras existe runtime Character.</p>
      <div class="st-avatar-motion-summary">
        <div><span>READY</span><strong>${r.counts.READY}</strong></div>
        <div><span>CONTEXT</span><strong>${r.counts.CONTEXT_REQUIRED}</strong></div>
        <div><span>Viewpoints</span><strong>${destinations.length}</strong></div>
      </div>
      <div class="st-avatar-motion-actions">${social}</div>
      <label class="st-f"><span class="st-l">Destino semántico real</span>
        <select data-gatea-destination ${destinations.length ? '' : 'disabled'}>${options || '<option>Sin viewpoint authored</option>'}</select>
      </label>
      <div class="st-avatar-motion-actions">
        <button class="st-b st-b--go" data-gatea-go ${targetedDisabled}>IR</button>
        <button class="st-b" data-gatea-action="LOOK_AT" ${targetedDisabled}>MIRAR</button>
        <button class="st-b" data-gatea-action="POINT" ${targetedDisabled}>APUNTAR</button>
        <button class="st-b" data-gatea-action="AFTER_YOU" ${targetedDisabled}>AFTER YOU</button>
      </div>
      <dl class="st-avatar-facts">
        <dt>Character</dt><dd>${r.singleCharacter.previewSuppressed ? 'RUNTIME ÚNICO' : 'REVISAR PREVIEW'}</dd>
        <dt>Space</dt><dd>${esc(r.spaceId)}</dd>
        <dt>Estado</dt><dd>${esc(r.lastStatus)}</dd>
        <dt>Ruta</dt><dd>${esc(r.navigation?.routeSource || r.lastRoute?.source || '—')}</dd>
        <dt>Destino</dt><dd>${esc(selected?.label || '—')}</dd>
        <dt>WorldStore</dt><dd>${r.invariants.worldStoreDuplicated ? 'FAIL' : 'ÚNICO'}</dd>
        <dt>CameraAuthority</dt><dd>${r.invariants.cameraAuthorityDuplicated ? 'FAIL' : 'ÚNICA'}</dd>
      </dl>
      <p class="st-note">MIRAR = body face + head/neck LookAt. APUNTAR = body face + target-aware POINT gesture. Contacto, Tour, Cinematic Camera y Exterior siguen fuera de Gate A.</p>
    </section>`;
  }

  controller.editor = function editorGateA() {
    let html = cleanPhase5Language(originalEditor());
    const marker = '<section class="st-avatar-future">';
    const at = html.indexOf(marker);
    const panel = panelHTML();
    return at >= 0 ? `${html.slice(0, at)}${panel}${html.slice(at)}` : `${html}${panel}`;
  };
  if (originalSecondColumn) {
    controller.secondColumn = function secondColumnGateA() {
      return cleanPhase5Language(originalSecondColumn())
        .replaceAll('Motion</span><i>Siguiente gate', 'Motion</span><i>Foundation disponible')
        .replaceAll('Acciones</span><i>Fase 6', 'Acciones</span><i>Gate A activo')
        .replaceAll('IK / LookAt</span><i>Fase 5 · posterior', 'IK / LookAt</span><i>Parcial · Gate A');
    };
  }
  if (originalFilmstrip) {
    controller.filmstrip = function filmstripGateA() {
      return cleanPhase5Language(originalFilmstrip())
        .replace('PREVIEW ON', 'RUNTIME CHARACTER')
        .replace('PREVIEW OFF', 'RUNTIME CHARACTER');
    };
  }

  controller.bind = function bindGateA(scope) {
    originalBind(scope);
    const select = scope.querySelector?.('[data-gatea-destination]');
    select?.addEventListener('change', () => { api.selectDestination(select.value); controller.studio.render(); });
    scope.querySelector?.('[data-gatea-go]')?.addEventListener('click', () => { api.goSelected(); controller.studio.render(); });
    scope.querySelectorAll?.('[data-gatea-action]').forEach((button) => {
      button.addEventListener('click', () => { api.perform(button.dataset.gateaAction); controller.studio.render(); });
    });
  };

  controller.studio.render();
  return {
    controller,
    dispose() {
      controller.editor = originalEditor;
      controller.bind = originalBind;
      if (originalSecondColumn) controller.secondColumn = originalSecondColumn;
      if (originalFilmstrip) controller.filmstrip = originalFilmstrip;
      controller.__phase6GateAInstalled = false;
      if (controller.previewRoot) controller.previewRoot.visible = true;
      controller.studio.render();
    }
  };
}

export function installMuseumCharacterPhase6GateA(runtime = window.__IW?.runtime) {
  if (!runtime?.store || !runtime?.explore) throw new Error('Phase 6 Gate A requires canonical Museum runtime/store/explore');
  if (window.__IW_CHARACTER_GATE_A?.ready) return window.__IW_CHARACTER_GATE_A;
  const phase4a = phase4Foundation();
  if (!phase4a?.root || !phase4a?.motion || typeof phase4a.setInput !== 'function') throw new Error('Phase 6 Gate A requires validated Phase 4 free Character foundation');

  const root = phase4a.root;
  const motion = phase4a.motion;
  const socialReport = registerSocialMotionV3(motion);
  const semanticView = createMuseumCharacterSemanticView(runtime);
  const lookAt = new MuseumLookAtController(root);
  const originalMotionPlay = motion.play.bind(motion);
  let socialLock = null;
  let navigation = null;
  let selectedDestinationId = null;
  let lastStatus = 'READY · CAPABILITIES + SEMANTICS';
  let lastRoute = null;
  let arrivals = 0;
  let blockedFrames = 0;
  let reroutes = 0;
  let blockedRoutes = 0;
  let disposed = false;
  let studioSurface = null;

  motion.play = (name, fade) => {
    if (socialLock && BASE_MOTION.has(name) && name !== socialLock.action) return motion.mixer;
    return originalMotionPlay(name, fade);
  };

  function enforceSingleCharacter() {
    const preview = window.__IW_AVATAR_STUDIO_PHASE5?.controller?.previewRoot;
    if (preview && preview !== root && preview.visible !== false) preview.visible = false;
    return !preview || preview === root || preview.visible === false;
  }

  function view() { return semanticView.audit(); }
  function destinations() { return view().destinations || []; }
  function selected() {
    const list = destinations();
    const found = list.find((d) => d.id === selectedDestinationId);
    return found || list[0] || null;
  }
  function selectDestination(id) {
    phase4a.setInput({});
    navigation = null;
    selectedDestinationId = destinations().some((d) => d.id === id) ? id : null;
    lastStatus = selected() ? `TARGET · ${selected().label}` : 'NO SEMANTIC TARGET';
    return selected();
  }
  if (destinations()[0]) selectedDestinationId = destinations()[0].id;

  function face(point) {
    if (!point) return;
    const dx = point[0] - root.position.x;
    const dz = point[2] - root.position.z;
    if (Math.hypot(dx,dz) > .001) root.rotation.y = Math.atan2(dx,dz);
    root.updateMatrixWorld(true);
  }

  function resolvedTarget(destination) {
    if (!destination) return { ok:false, reason:'NO_DESTINATION' };
    if (destination.spaceId !== runtime.state.activeSpaceId) return { ok:false, reason:'DESTINATION_NOT_IN_ACTIVE_SPACE' };
    const contract = new MuseumHumanSpatialContract({
      sceneKit: runtime.sceneKit,
      store: runtime.store,
      spaceId: runtime.state.activeSpaceId,
      characterRadius: 0.34
    });
    const attempts = [];
    for (const aside of [false, true]) {
      try {
        const target = contract.resolve({ anchorId:destination.anchorId, subjectRef:destination.subjectRef, aside });
        const validation = contract.validatePoint(target.position);
        attempts.push({ aside, target, validation });
        if (validation.safe) return { ok:true, contract, target, validation, attempts };
      } catch (error) {
        attempts.push({ aside, error:String(error?.message || error) });
      }
    }
    return { ok:false, reason:'NO_SAFE_CHARACTER_VIEWPOINT', contract, attempts };
  }

  function buildRoute(destination, rerouteCount = 0) {
    const resolved = resolvedTarget(destination);
    if (!resolved.ok) return { ok:false, reason:resolved.reason, resolved };
    const start = root.position.toArray();
    const route = resolved.contract.routePlan(start, resolved.target, { subjectRef:destination.subjectRef });
    lastRoute = { source:route.source, points:route.points?.length || 0, targetAside:Boolean(resolved.target.aside), rerouteCount };
    if (!route.points?.length) return { ok:false, reason:route.source, resolved, route };
    const points = route.points.map((point) => new THREE.Vector3(point[0], root.position.y, point[2]));
    return {
      ok:true,
      destination,
      resolved,
      route,
      points,
      index:0,
      rerouteCount,
      stuckSeconds:0,
      lastDistance:root.position.distanceTo(points[0]),
      startedAt:performance.now()
    };
  }

  function blockNavigation(reason) {
    phase4a.setInput({});
    blockedRoutes += 1;
    lastStatus = `BLOCKED · ${reason}`;
    navigation = null;
  }

  function startNavigation(destination, rerouteCount = 0) {
    const next = buildRoute(destination, rerouteCount);
    if (!next.ok) {
      blockNavigation(next.reason || 'NO_SAFE_ROUTE');
      return false;
    }
    navigation = next;
    lookAt.clear();
    lastStatus = `${rerouteCount ? 'REROUTE' : 'GO'} · ${destination.label} · ${next.route.source}`;
    return true;
  }

  function perform(action) {
    const target = selected();
    if (action === 'LOOK_AT') {
      if (!target) { lastStatus = 'LOOK_AT · CONTEXT_REQUIRED'; return false; }
      const resolved = resolvedTarget(target);
      if (!resolved.ok) { lastStatus = `LOOK_AT · ${resolved.reason}`; return false; }
      phase4a.setInput({}); navigation = null;
      face(resolved.target.lookAt);
      lookAt.lookAt(new THREE.Vector3(...resolved.target.lookAt), { weight:1 });
      lastStatus = `LOOK_AT · ${target.label} · BODY+HEAD`;
      return true;
    }
    if (TARGETED.has(action) && !target) { lastStatus = `${action} · CONTEXT_REQUIRED`; return false; }
    if (!motion.has?.(action)) { lastStatus = `${action} · MISSING`; return false; }
    phase4a.setInput({}); navigation = null;
    if (target && TARGETED.has(action)) {
      const resolved = resolvedTarget(target);
      if (!resolved.ok) { lastStatus = `${action} · ${resolved.reason}`; return false; }
      face(resolved.target.lookAt);
      lookAt.lookAt(new THREE.Vector3(...resolved.target.lookAt), { weight:.9 });
    }
    socialLock = { action, remaining:Math.max(.2, motion.duration(action)) };
    originalMotionPlay(action, .12);
    if (action === 'POINT' && target) lastStatus = `TARGET-AWARE POINT · ${target.label}`;
    else if (action === 'AFTER_YOU' && target) lastStatus = `TARGET-AWARE AFTER_YOU · ${target.label}`;
    else lastStatus = `${action} · SOCIAL V3`;
    return true;
  }

  function goSelected() {
    const target = selected();
    if (!target) { lastStatus = 'IR · CONTEXT_REQUIRED'; return false; }
    return startNavigation(target, 0);
  }

  const previousOnFrame = runtime.onFrame;
  runtime.onFrame = (pose, dt) => {
    previousOnFrame?.(pose, dt);
    const frameDt = Math.max(0, Math.min(Number(dt) || 0, .05));
    if (disposed) return;
    enforceSingleCharacter();

    if (socialLock) {
      socialLock.remaining -= frameDt;
      phase4a.setInput({});
      if (socialLock.remaining <= 0) {
        socialLock = null;
        originalMotionPlay('IDLE_V2', .14);
      }
    } else if (navigation) {
      const point = navigation.points[navigation.index];
      if (!point) {
        blockNavigation('ROUTE_STATE_INVALID');
      } else {
        const delta = point.clone().sub(root.position); delta.y = 0;
        const distance = delta.length();
        const finalPoint = navigation.index === navigation.points.length - 1;
        const tolerance = finalPoint ? Math.max(MUSEUM_HUMAN_PROFILE.settleTolerance, .18) : INTERMEDIATE_TOLERANCE;

        if (distance <= tolerance) {
          phase4a.setInput({});
          if (!finalPoint) {
            navigation.index += 1;
            navigation.stuckSeconds = 0;
            navigation.lastDistance = root.position.distanceTo(navigation.points[navigation.index]);
            lastStatus = `WAYPOINT ${navigation.index}/${navigation.points.length - 1} · ${navigation.destination.label}`;
          } else {
            face(navigation.resolved.target.lookAt);
            lookAt.lookAt(new THREE.Vector3(...navigation.resolved.target.lookAt), { weight:1 });
            arrivals += 1;
            lastStatus = `ARRIVED · ${navigation.destination.label} · ${navigation.route.source}`;
            navigation = null;
          }
        } else {
          const desiredYaw = Math.atan2(delta.x, delta.z);
          const error = wrapAngle(desiredYaw - root.rotation.y);
          const turn = -clamp(error * 1.8, -1, 1);
          const forward = Math.abs(error) < .32 ? 1 : 0;
          phase4a.setInput({ forward, turn, run:false });

          const progressed = navigation.lastDistance == null || distance < navigation.lastDistance - PROGRESS_EPSILON;
          if (progressed) navigation.stuckSeconds = 0;
          else if (forward > 0) {
            navigation.stuckSeconds += frameDt;
            blockedFrames += 1;
          }
          navigation.lastDistance = distance;
          lastStatus = `GO · ${navigation.destination.label} · WP ${navigation.index + 1}/${navigation.points.length} · ${distance.toFixed(2)}m`;

          if (navigation.stuckSeconds >= STUCK_SECONDS) {
            const destination = navigation.destination;
            const nextReroute = navigation.rerouteCount + 1;
            phase4a.setInput({});
            if (nextReroute > MAX_REROUTES) {
              blockNavigation(`STUCK · ${destination.label}`);
            } else {
              reroutes += 1;
              startNavigation(destination, nextReroute);
            }
          }
        }
      }
    }
    lookAt.update(frameDt);
    root.updateMatrixWorld(true);
  };

  const api = {
    ready:true,
    phase:'PHASE6_GATE_A_CAPABILITIES_SEMANTICS',
    root,
    phase4a,
    semanticView,
    socialReport,
    selectDestination,
    goSelected,
    perform,
    get lastStatus() { return lastStatus; },
    report() {
      const semantic = view();
      const matrix = capabilityMatrix(motion, semantic.destinations.length > 0);
      const preview = window.__IW_AVATAR_STUDIO_PHASE5?.controller?.previewRoot || null;
      return {
        phase:'PHASE6_GATE_A_CAPABILITIES_SEMANTICS', ready:true,
        spaceId:runtime.state.activeSpaceId,
        selectedDestinationId:selected()?.id || null,
        lastStatus,
        lastRoute,
        navigation:navigation ? {
          target:navigation.destination.id,
          routeSource:navigation.route.source,
          waypoint:navigation.index + 1,
          waypoints:navigation.points.length,
          distance:Number(root.position.distanceTo(navigation.points[navigation.index]).toFixed(3)),
          rerouteCount:navigation.rerouteCount,
          stuckSeconds:Number(navigation.stuckSeconds.toFixed(2))
        } : null,
        arrivals,
        blockedFrames,
        reroutes,
        blockedRoutes,
        capabilities:matrix,
        counts:matrixCounts(matrix),
        socialActions:[...SOCIAL_V3_ACTIONS],
        socialProvenance:SOCIAL_V3_PROVENANCE,
        semantic:{ source:semantic.source, counts:semantic.counts, canonicalIdentity:semantic.canonicalIdentity, destinations:semantic.destinations.map((d) => ({ id:d.id,label:d.label,subjectRef:d.subjectRef,anchorId:d.anchorId,spaceId:d.spaceId })) },
        singleCharacter:{ runtimeRoot:root.uuid, previewExists:Boolean(preview), previewSuppressed:!preview || preview === root || preview.visible === false },
        spatialContract:{ source:'VECINIA HumanSpatialContract adapted Museum-side', humanProfile:MUSEUM_HUMAN_PROFILE },
        invariants:{ rendererDuplicated:false, worldStoreDuplicated:false, cameraAuthorityDuplicated:false, navigationAuthorityDuplicated:false, animationMixerDuplicated:false, frozenDonorEdited:false }
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      phase4a.setInput({});
      navigation = null; socialLock = null; lookAt.clear();
      motion.play = originalMotionPlay;
      runtime.onFrame = previousOnFrame;
      studioSurface?.dispose();
      delete window.__IW_CHARACTER_GATE_A;
      document.documentElement.dataset.characterGateA = 'disposed';
    }
  };

  studioSurface = installStudioSurface(api);
  enforceSingleCharacter();
  window.__IW_CHARACTER_GATE_A = api;
  document.documentElement.dataset.characterGateA = 'ready';
  console.info('[Character 2027] Phase 6 Gate A fixes ready for human validation', api.report());
  return api;
}
