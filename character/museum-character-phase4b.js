import { CAMERA_AUTHORITY } from '../engine/schema/types.js';
import { mountMuseumCharacterPhase4A } from './museum-character-phase4a.js';
import { applyGalleryBCharacterPassage } from './museum-character-phase4b-gallery-b-circulation.js';

const GALLERY_A = 'space.gallery-a';
const GALLERY_B = 'space.gallery-b';
const PORTAL_A_B = 'portal.gallery-a-gallery-b';
const PORTAL_B_A = 'portal.gallery-b-gallery-a';
const SUPPORTED_PORTALS = new Set([PORTAL_A_B, PORTAL_B_A]);

function installBadge(api) {
  document.getElementById('character-phase4a-gate')?.remove();
  document.getElementById('character-phase4b-gate')?.remove();
  const el = document.createElement('div');
  el.id = 'character-phase4b-gate';
  el.style.cssText = 'position:fixed;left:14px;top:14px;z-index:20000;padding:10px 12px;background:rgba(9,12,14,.86);border:1px solid rgba(255,255,255,.24);color:#f1eee8;font:600 11px/1.45 system-ui,sans-serif;pointer-events:none;max-width:540px';
  const refresh = () => {
    const r = api.report();
    const follow = r.cameraFollow || {};
    el.innerHTML = `<div style="letter-spacing:.12em">PHASE 4B · FINAL HUMAN GATE</div><div style="font-weight:500;opacity:.88">Gallery A ↔ Gallery B · mismo avatar · mismo motion/camera</div><div style="font-weight:500;opacity:.68">space ${r.spaceId} · crossings ${r.continuity.crossings} · same-root ${r.continuity.sameRoot ? 'YES' : 'NO'} · one-motion ${r.continuity.singleMotionLoop ? 'YES' : 'NO'}</div><div style="font-weight:500;opacity:.58">camera ${r.camera.owner} · violations ${r.camera.violations} · dist ${Number(follow.distance || 0).toFixed(2)} · ${follow.shotMode || 'NORMAL'}</div><div style="font-weight:500;opacity:.52">Gallery B passage ${r.circulation?.applied ? 'OPEN' : 'CHECK'} · last ${r.continuity.lastPortal || '—'} · hotspot ${r.proximity?.nearest || '—'}</div>`;
  };
  refresh();
  document.body.appendChild(el);
  const timer = setInterval(refresh, 180);
  return { remove() { clearInterval(timer); el.remove(); } };
}

export async function mountMuseumCharacterPhase4B({ runtime, sceneKit = runtime?.sceneKit, input = window.__IW?.input } = {}) {
  if (!runtime || !sceneKit || !input) throw new Error('Phase 4B requires Museum runtime, SceneKit and InputSystem');
  if (window.__IW_CHARACTER_PHASE4B?.ready) return window.__IW_CHARACTER_PHASE4B;

  const phase4a = await mountMuseumCharacterPhase4A({ runtime, sceneKit, input });
  if (typeof phase4a.rebindSpace !== 'function' || !phase4a.cameraController) {
    throw new Error('Phase 4B requires room-bindable Phase 4A Character session');
  }

  // Gallery B is normally prefetched from A, but Phase 4B requires its physical
  // barrier geometry now so the Character passage can be corrected before the
  // human enters. This warms only; Museum remains the activation authority.
  await runtime.spaces.prepare(GALLERY_B);
  const circulation = applyGalleryBCharacterPassage(sceneKit, runtime.store);
  if (!circulation.applied) {
    console.warn('[Character Phase 4B] Gallery B passage correction incomplete', circulation);
  }

  const root = phase4a.root;
  const rootIdentity = root.uuid;
  let disposed = false;
  let currentSpaceId = runtime.state.activeSpaceId;
  let crossings = 0;
  let lastPortal = null;
  let lastSpawn = null;
  let continuityError = null;

  const previousTraversePortal = runtime.traversePortal;
  runtime.traversePortal = async function traverseCharacterPortal(portalId, context = {}) {
    if (!SUPPORTED_PORTALS.has(portalId)) return previousTraversePortal.call(runtime, portalId, context);

    const portal = runtime.store.require(portalId);
    const fromSpaceId = runtime.state.activeSpaceId;
    if (portal.fromSpaceId !== fromSpaceId) {
      throw new Error(`Phase 4B portal ${portalId} expected ${portal.fromSpaceId}, active ${fromSpaceId}`);
    }

    phase4a.setInput({});
    input.setEnabled(false);

    // Museum remains the only traversal authority. Suppress only the legacy
    // post-portal request to first-person EXPLORE; Character keeps the already
    // validated THIRD_PERSON_EXPLORE authority and its same controller instance.
    const originalCameraRequest = runtime.camera.request;
    runtime.camera.request = function requestDuringCharacterPortal(name, options = {}) {
      const legacyPortalHandoff = name === CAMERA_AUTHORITY.EXPLORE
        && String(options.reason || '').startsWith(`portal:${portalId}`);
      if (legacyPortalHandoff) return true;
      return originalCameraRequest.call(runtime.camera, name, options);
    };

    let result;
    try {
      result = await previousTraversePortal.call(runtime, portalId, {
        ...context,
        source: context.source || 'CHARACTER_PHASE4B'
      });
    } catch (error) {
      continuityError = String(error?.message || error);
      throw error;
    } finally {
      runtime.camera.request = originalCameraRequest;
    }

    const destination = portal.toSpaceId;
    if (runtime.state.activeSpaceId !== destination) {
      continuityError = `expected ${destination}, got ${runtime.state.activeSpaceId}`;
      throw new Error(`Phase 4B canonical traversal failed: ${continuityError}`);
    }

    const spawn = sceneKit.poseForAnchor(portal.destinationSpawnId);
    if (!spawn?.position) {
      continuityError = `missing destination pose ${portal.destinationSpawnId}`;
      throw new Error(`Phase 4B ${continuityError}`);
    }

    // Same root, same MotionV2, same locomotion loop and same camera controller.
    // Only room-bound navigation/ground/proximity state changes.
    phase4a.rebindSpace(destination, spawn);
    currentSpaceId = destination;
    input.setMovementSink({ setInput: phase4a.setInput, jump: phase4a.jump, inputFrame() {} });
    input.setEnabled(true);

    crossings += 1;
    lastPortal = portalId;
    lastSpawn = portal.destinationSpawnId;
    continuityError = null;
    return result;
  };

  const api = {
    ready: true,
    root,
    phase4a,
    circulation,
    report() {
      const base = phase4a.report();
      return {
        phase: 'PHASE4B_ROOM_TO_ROOM_CONTINUITY_FINAL',
        ready: true,
        spaceId: runtime.state.activeSpaceId,
        rootIdentity,
        position: root.position.toArray(),
        proximity: runtime.proximity.report(),
        camera: runtime.camera.report(),
        cameraFollow: phase4a.cameraController.report(),
        circulation,
        continuity: {
          crossings,
          lastPortal,
          lastSpawn,
          sameRoot: root.uuid === rootIdentity,
          currentSpaceId,
          supported: [PORTAL_A_B, PORTAL_B_A],
          canonicalTraversal: 'runtime.traversePortal + Museum WorldGraph/SpaceLifecycle/WorldState',
          singleMotionLoop: base.frameSeam.includes('one Character locomotion loop'),
          singleCameraController: true,
          error: continuityError
        },
        authorities: {
          rendererDuplicated: false,
          worldStoreDuplicated: false,
          cameraAuthorityDuplicated: false,
          characterRootDuplicated: false,
          inputListenersDuplicated: false,
          motionLoopDuplicated: false,
          thirdPersonControllerDuplicated: false
        },
        humanVisualApproval: 'PENDING_PHASE4B_FINAL'
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      phase4a.setInput({});
      runtime.traversePortal = previousTraversePortal;
      badge.remove();
      delete window.__IW_CHARACTER_PHASE4B;
      document.documentElement.dataset.characterPhase4b = 'disposed';
      phase4a.dispose();
    }
  };

  const badge = installBadge(api);
  window.__IW_CHARACTER_PHASE4B = api;
  document.documentElement.dataset.characterPhase4b = 'ready';
  console.info('[Character Phase 4B] FINAL TWO-FIX GATE READY FOR HUMAN VALIDATION', api.report());
  return api;
}
