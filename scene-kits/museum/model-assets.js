/**
 * Governed Museum model assets.
 *
 * Semantic World records name a presentation profile. This registry is the
 * only layer that knows which binary realizes that profile, keeping file paths,
 * licenses and loader details out of World State.
 */

import { GLTFLoader } from '../../vendor/three/addons/loaders/GLTFLoader.js';

export const MARBLE_BUST_PROFILE = 'plinth-glb-marble-bust-v1';

export const MUSEUM_MODEL_ASSETS = Object.freeze({
  [MARBLE_BUST_PROFILE]: Object.freeze({
    assetId: 'museum.marble-bust-01-1k',
    url: new URL('../../assets/models/sculpture/marble_bust_01_1k.glb', import.meta.url).href,
    source: 'Poly Haven — Marble Bust 01',
    author: 'Rico Cilliers',
    license: 'CC0 1.0',
    triangles: 17456,
    bytes: 897296
  })
});

export class MuseumModelAssets {
  constructor() {
    this.loader = new GLTFLoader();
    /** Fetch once, parse per built Space so lifecycle disposal remains safe. */
    this._bytes = new Map();
    this._report = new Map();
  }

  async instantiate(profile) {
    const asset = MUSEUM_MODEL_ASSETS[profile];
    if (!asset) return null;
    try {
      let bytes = this._bytes.get(asset.assetId);
      if (!bytes) {
        const response = await fetch(asset.url, { cache: 'force-cache' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        bytes = await response.arrayBuffer();
        this._bytes.set(asset.assetId, bytes);
      }
      const gltf = await new Promise((resolve, reject) => {
        this.loader.parse(bytes.slice(0), new URL('.', asset.url).href, resolve, reject);
      });
      this._report.set(asset.assetId, { status: 'READY', ...asset });
      return gltf.scene;
    } catch (error) {
      this._report.set(asset.assetId, { status: 'FALLBACK', ...asset, error: String(error?.message || error) });
      console.warn(`[Museum model] ${asset.assetId} usa fallback:`, error);
      return null;
    }
  }

  report() {
    return Object.fromEntries(this._report);
  }
}
