/**
 * Immersive Worlds — Render Host
 *
 * Owns the renderer and the camera *object*. Nothing else may create either.
 *
 * Note the split this file exists to make real:
 *
 *   engine/camera/camera-authority.js  decides the pose   (semantic, no Three.js)
 *   render/render-host.js              applies the pose   (graphics, no semantics)
 *
 * The host is a passive surface: it never decides where the camera should be,
 * and it knows nothing about Museums, Spaces or Entities. A future Showroom
 * Scene Kit reuses it unchanged.
 *
 * Quality policy is applied here because DPR, antialiasing, shadow maps and
 * tone mapping are renderer facts (Constitution §21 — a tier must change what
 * is actually done, not just label the device).
 */

import * as THREE from '../vendor/three/three.module.min.js';

export class RenderHost {
  /**
   * @param {{canvas:HTMLCanvasElement, quality:import('../engine/core/device-tier.js').QualityPolicy}} options
   */
  constructor({ canvas, quality }) {
    this.canvas = canvas;
    this.quality = quality;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: quality.antialias,
      powerPreference: 'high-performance',
      stencil: false
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.shadowMap.enabled = quality.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.info.autoReset = false;

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.05, 220);
    this._target = new THREE.Vector3();

    this.pixelRatio = 1;
    this.width = 1;
    this.height = 1;
    this.resize();
  }

  /** @returns {{aspect:number, vfov:number}} what the framing maths needs */
  viewport() {
    return { aspect: this.camera.aspect, vfov: this.camera.fov };
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(Math.floor(rect.width || this.canvas.clientWidth || 1), 1);
    const height = Math.max(Math.floor(rect.height || this.canvas.clientHeight || 1), 1);
    const ratio = Math.min(window.devicePixelRatio || 1, this.quality.dprCap);

    if (width === this.width && height === this.height && ratio === this.pixelRatio) return false;

    this.width = width;
    this.height = height;
    this.pixelRatio = ratio;

    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;

    // A portrait phone framing a 2 m painting needs a wider lens, or the visitor
    // is pushed unusably far back. Vertical FOV adapts to aspect, once, here.
    this.camera.fov = this.camera.aspect < 1 ? 66 : this.camera.aspect < 1.4 ? 58 : 52;
    this.camera.updateProjectionMatrix();
    return true;
  }

  /** @param {{position:number[], target:number[], fov:number}} pose */
  applyPose(pose) {
    this.camera.position.set(pose.position[0], pose.position[1], pose.position[2]);
    this._target.set(pose.target[0], pose.target[1], pose.target[2]);
    this.camera.lookAt(this._target);
    // The pose's fov is an authored intent; the host reconciles it with the
    // aspect-driven baseline rather than letting either win outright.
    const base = this.camera.aspect < 1 ? 66 : this.camera.aspect < 1.4 ? 58 : 52;
    const wanted = pose.fov ? (pose.fov + base) / 2 : base;
    if (Math.abs(this.camera.fov - wanted) > 0.05) {
      this.camera.fov = wanted;
      this.camera.updateProjectionMatrix();
    }
  }

  applyQuality(policy) {
    this.quality = policy;
    this.renderer.shadowMap.enabled = policy.shadows;
    this.pixelRatio = -1; // force a resize recompute
    this.resize();
  }

  /**
   * Compile shaders and upload textures before a Space is shown.
   * This is the warmup step that keeps first entry into a gallery from
   * stalling on shader compilation (pattern reference IW-REF-002).
   */
  async warm(scene) {
    if (typeof this.renderer.compileAsync === 'function') {
      await this.renderer.compileAsync(scene, this.camera);
    } else {
      this.renderer.compile(scene, this.camera);
    }
  }

  render(scene) {
    this.renderer.info.reset();
    this.renderer.render(scene, this.camera);
  }

  stats() {
    const info = this.renderer.info;
    return {
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      programs: info.programs?.length ?? 0,
      textures: info.memory.textures,
      geometries: info.memory.geometries,
      pixelRatio: this.pixelRatio,
      width: this.width,
      height: this.height
    };
  }

  dispose() {
    this.renderer.dispose();
  }
}

export { THREE };
