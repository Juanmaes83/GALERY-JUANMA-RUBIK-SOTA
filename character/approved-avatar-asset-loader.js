import { THREE } from '../render/render-host.js';
import { GLTFLoader } from '../vendor/three/addons/loaders/GLTFLoader.js';
import { PHASE3_APPROVED_AVATAR } from './museum-character-phase3.js';

const EXPECTED_THREE_REVISION = '185';
const STAGES = Object.freeze(['DOWNLOAD', 'BYTES', 'SHA256', 'PARSE', 'OBJECT3D']);

function initialPipeline() {
  return Object.fromEntries(STAGES.map((stage) => [stage, { status: 'PENDING', detail: null }]));
}

function setStage(pipeline, stage, status, detail = null, onStage = null) {
  pipeline[stage] = { status, detail };
  onStage?.({ stage, status, detail, pipeline: structuredClone(pipeline) });
}

async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((v) => v.toString(16).padStart(2, '0')).join('');
}

function abortError() {
  const error = new Error('Approved Character load cancelled');
  error.name = 'AbortError';
  return error;
}

/**
 * Single Museum-facing loader for the exact Character 2027 asset approved in Phase 3.
 * It does not normalize, animate, ground, or create authority. It only acquires,
 * provenance-verifies and parses the approved GLB with Museum's pinned Three r185.
 */
export async function loadApprovedCharacterAsset({ signal = null, cachedBytes = null, onStage = null } = {}) {
  const pipeline = initialPipeline();
  const assertLive = () => { if (signal?.aborted) throw abortError(); };

  if (String(THREE.REVISION) !== EXPECTED_THREE_REVISION) {
    const error = new Error(`Character 2027 requires Museum THREE r${EXPECTED_THREE_REVISION}, got r${THREE.REVISION}`);
    error.pipeline = pipeline;
    throw error;
  }

  let bytes = cachedBytes || null;
  try {
    assertLive();
    if (bytes) {
      setStage(pipeline, 'DOWNLOAD', 'CACHE', `${bytes.byteLength} bytes from session cache`, onStage);
    } else {
      setStage(pipeline, 'DOWNLOAD', 'RUNNING', PHASE3_APPROVED_AVATAR.url, onStage);
      const response = await fetch(PHASE3_APPROVED_AVATAR.url, {
        method: 'GET',
        mode: 'cors',
        cache: 'no-store',
        signal
      });
      if (!response.ok) {
        setStage(pipeline, 'DOWNLOAD', 'FAIL', `HTTP ${response.status}`, onStage);
        throw new Error(`Approved Character fetch failed: HTTP ${response.status}`);
      }
      bytes = await response.arrayBuffer();
      setStage(pipeline, 'DOWNLOAD', 'PASS', `HTTP ${response.status}`, onStage);
    }

    assertLive();
    if (bytes.byteLength !== PHASE3_APPROVED_AVATAR.expectedByteLength) {
      setStage(pipeline, 'BYTES', 'FAIL', `${bytes.byteLength} != ${PHASE3_APPROVED_AVATAR.expectedByteLength}`, onStage);
      throw new Error(`Approved Character byteLength mismatch: ${bytes.byteLength}`);
    }
    setStage(pipeline, 'BYTES', 'PASS', `${bytes.byteLength}`, onStage);

    assertLive();
    setStage(pipeline, 'SHA256', 'RUNNING', null, onStage);
    const sha256 = await sha256Hex(bytes);
    if (sha256 !== PHASE3_APPROVED_AVATAR.expectedSha256) {
      setStage(pipeline, 'SHA256', 'FAIL', sha256, onStage);
      throw new Error(`Approved Character SHA mismatch: ${sha256}`);
    }
    setStage(pipeline, 'SHA256', 'PASS', sha256, onStage);

    assertLive();
    setStage(pipeline, 'PARSE', 'RUNNING', 'GLTFLoader r185', onStage);
    const resourcePath = new URL('.', PHASE3_APPROVED_AVATAR.url).href;
    const gltf = await new Promise((resolve, reject) => {
      new GLTFLoader().parse(bytes, resourcePath, resolve, reject);
    });
    setStage(pipeline, 'PARSE', 'PASS', 'GLB parsed', onStage);

    assertLive();
    const visual = gltf?.scene;
    if (!visual?.isObject3D) {
      setStage(pipeline, 'OBJECT3D', 'FAIL', 'Missing Museum-compatible scene Object3D', onStage);
      throw new Error('GLTFLoader did not return a Museum-compatible Object3D');
    }
    setStage(pipeline, 'OBJECT3D', 'PASS', visual.name || visual.type || 'Object3D', onStage);

    return {
      gltf,
      bytes,
      sha256,
      pipeline,
      provenance: {
        ...PHASE3_APPROVED_AVATAR,
        byteLength: bytes.byteLength,
        sha256,
        exactApprovedAssetMatch: true
      }
    };
  } catch (error) {
    error.pipeline = structuredClone(pipeline);
    throw error;
  }
}

export { PHASE3_APPROVED_AVATAR };
