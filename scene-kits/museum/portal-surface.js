/**
 * Museum — Portal Surface (variant D: TRUE IW ENGINE)
 *
 * A faithful reproduction of the owned Infinite Worlds V1.2.3 portal, running
 * inside the Museum. Additive and reversible: nothing here runs unless the
 * portal treatment is set to `IW_ENGINE`, and variants A/B/C are untouched.
 *
 * The source is `labs/infinite-worlds-brand-expression-v1-2/` at commit
 * 453ed40008f838d6187a7e85d93872f7866ad5cb. Every mechanism below was read from
 * that implementation rather than recalled, and the shaders are copied verbatim
 * from its `index.html`.
 *
 * What the source does, in its own render loop:
 *
 *   portal.updateCorners()
 *   CameraUtils.frameCorners(otherWorld.camera, bottomLeft, bottomRight, topLeft, false)
 *   renderer.setRenderTarget(portal.renderTarget)
 *   renderer.render(otherWorld.scene, otherWorld.camera)
 *   renderer.setRenderTarget(previous)
 *   renderer.render(currentWorld.scene, currentWorld.camera)
 *
 * THE ONE STRUCTURAL DIFFERENCE, and the adapter it forces:
 *
 * Infinite Worlds holds two scenes at the same coordinates, so "render the other
 * world" is literally a second scene object. The Museum holds every room in one
 * scene graph, so there is no second scene to hand the renderer. The adapter is
 * a *visibility mask*: while the destination pass runs, the origin room's group
 * is hidden and the destination room's group is shown, then both are restored.
 * That reproduces the same thing the source's two scenes give it — a render
 * target containing the destination and nothing of the room you are standing in
 * — without inventing a second scene graph the Museum does not have.
 *
 * The perceptual properties this preserves are the ones that matter: the
 * destination is a live render driven by its own camera, its perspective is the
 * off-axis portal projection from `frameCorners`, and the surface carries the
 * original shader.
 */

import { THREE } from '../../render/render-host.js';
import * as CameraUtils from '../../vendor/three/addons/utils/CameraUtils.js';

/** Copied verbatim from the source's index.html. */
const VERTEX_SHADER = `precision highp float;varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`;

/** Copied verbatim from the source's index.html. */
const FRAGMENT_SHADER = `#define PI 3.1415
#define TAU 6.2832
uniform sampler2D map;uniform sampler2D noiseMap;uniform float time;uniform float effectIntensity;uniform float effectMultiplier;uniform float distortion;uniform float waveCount;uniform float edgeGlow;uniform float portalSpeed;uniform vec3 tint;uniform float tintAmount;uniform float fringe;varying vec2 vUv;
void main(){vec2 centered=vUv-.5;float angle=atan(centered.y,centered.x);float l=length(centered);float u=angle*2./TAU+time*.1*portalSpeed;float v=fract(l+time*.2*portalSpeed);vec4 noise=texture2D(noiseMap,vec2(u,v));float noiseDisp=noise.r*noise.g*4.*effectMultiplier;float pnt=sin(2.*l*PI*waveCount+noiseDisp+time*5.*portalSpeed)*l;float dx=pnt*cos(angle),dy=pnt*sin(angle);vec4 color=texture2D(map,vUv+vec2(dx,dy)*l*.3*effectIntensity*effectMultiplier*distortion);color*=1.+pnt*.5*effectIntensity;float highlight=smoothstep(.0,.2,dx*dy);color+=highlight*effectIntensity*edgeGlow;float grey=dot(color.rgb,vec3(.299,.587,.114));color.rgb=mix(color.rgb,vec3(grey),effectIntensity*l*effectMultiplier*.8);color.r+=smoothstep(.1,.7,l)*.5*effectIntensity*fringe;color.rgb=mix(color.rgb,color.rgb*tint,tintAmount*smoothstep(.18,.72,l));gl_FragColor=linearToOutputTexel(color);}`;

/**
 * The source loads its noise from `assets.codepen.io/264161/noise_1.jpg`, which
 * this environment cannot reach and which is not part of the owned snapshot.
 * Generated here instead, deterministically, with the smooth low-frequency
 * character the shader expects — it samples `noise.r * noise.g` as a
 * displacement field, so white noise would read as static rather than as flow.
 * Declared as an adapter in the fidelity audit.
 */
function makeNoiseTexture(size = 256) {
  const data = new Uint8Array(size * size * 4);
  // Value noise with a few octaves — a stand-in for the source's photographic
  // noise plate, matching its role rather than its exact pixels.
  const lattice = [];
  let seed = 0x2f6b3f;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };
  for (let o = 0; o < 3; o += 1) {
    const n = 4 << o;
    const grid = new Float32Array((n + 1) * (n + 1));
    for (let i = 0; i < grid.length; i += 1) grid[i] = rand();
    lattice.push({ n, grid });
  }
  const smooth = (t) => t * t * (3 - 2 * t);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let value = 0;
      let amp = 0.6;
      for (const { n, grid } of lattice) {
        const fx = (x / size) * n; const fy = (y / size) * n;
        const x0 = Math.floor(fx); const y0 = Math.floor(fy);
        const tx = smooth(fx - x0); const ty = smooth(fy - y0);
        const g = (i, j) => grid[(j % (n + 1)) * (n + 1) + (i % (n + 1))];
        const top = g(x0, y0) * (1 - tx) + g(x0 + 1, y0) * tx;
        const bot = g(x0, y0 + 1) * (1 - tx) + g(x0 + 1, y0 + 1) * tx;
        value += (top * (1 - ty) + bot * ty) * amp;
        amp *= 0.5;
      }
      const i = (y * size + x) * 4;
      const c = Math.max(0, Math.min(255, Math.round(value * 255)));
      // Slight channel decorrelation: the shader multiplies r by g.
      data[i] = c;
      data[i + 1] = Math.max(0, Math.min(255, Math.round(value * 220 + 24)));
      data[i + 2] = c;
      data[i + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

export class PortalSurface {
  /**
   * @param {{scene:THREE.Scene, threshold:object, originGroup:THREE.Object3D,
   *          destinationGroup:THREE.Object3D}} deps
   */
  constructor({ scene, threshold, originGroup, destinationGroup }) {
    this.scene = scene;
    this.threshold = threshold;
    this.originGroup = originGroup;
    this.destinationGroup = destinationGroup;

    // Source: `new THREE.WebGLRenderTarget(2048, 2048, { type: THREE.HalfFloatType })`.
    this.renderTarget = new THREE.WebGLRenderTarget(2048, 2048, { type: THREE.HalfFloatType });
    this.noiseMap = makeNoiseTexture();

    // Source: the destination is drawn by its own camera, not the visitor's.
    this.destinationCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 400);

    const geometry = new THREE.PlaneGeometry(threshold.width, threshold.height);
    geometry.computeBoundingBox();

    // Source uniform set, in the source's order and defaults.
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: this.renderTarget.texture },
        noiseMap: { value: this.noiseMap },
        time: { value: 0 },
        effectIntensity: { value: 1 },
        effectMultiplier: { value: 1 },
        distortion: { value: 1 },
        waveCount: { value: 5 },
        edgeGlow: { value: 1 },
        portalSpeed: { value: 1 },
        tint: { value: new THREE.Color(0xffffff) },
        tintAmount: { value: 0 },
        fringe: { value: 1 }
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER
    });

    this.plane = new THREE.Mesh(geometry, this.material);
    this.plane.name = `portal-surface:${threshold.portalId}`;
    // Standing in the plane of the wall, facing back along the crossing axis so
    // its front side is what the approaching visitor sees.
    this.plane.position.set(
      threshold.centre[0],
      threshold.centre[1] + threshold.height / 2,
      threshold.centre[2]
    );
    if (Math.abs(threshold.axis[0]) > 0.5) {
      this.plane.rotation.y = threshold.axis[0] > 0 ? -Math.PI / 2 : Math.PI / 2;
    } else if (threshold.axis[2] < 0) {
      this.plane.rotation.y = Math.PI;
    }
    this.scene.add(this.plane);

    // Source: `this.corners = { bottomLeft, bottomRight, topLeft }`.
    this.corners = {
      bottomLeft: new THREE.Vector3(),
      bottomRight: new THREE.Vector3(),
      topLeft: new THREE.Vector3()
    };
    this.time = 0;
    this._effectIntensity = 1;
    this._effectMultiplier = 1;
    this.visible = false;
    this.plane.visible = false;
  }

  /** Source: `Portal.updateCorners()`, unchanged. */
  updateCorners() {
    const { min, max } = this.plane.geometry.boundingBox;
    this.plane.localToWorld(this.corners.bottomLeft.set(min.x, min.y, 0));
    this.plane.localToWorld(this.corners.bottomRight.set(max.x, min.y, 0));
    this.plane.localToWorld(this.corners.topLeft.set(min.x, max.y, 0));
  }

  /** Source: `set effectIntensity(v)` — writes straight through to the uniform. */
  set effectIntensity(v) {
    this._effectIntensity = v;
    this.material.uniforms.effectIntensity.value = v;
  }

  get effectIntensity() { return this._effectIntensity; }

  set effectMultiplier(v) {
    this._effectMultiplier = v;
    this.material.uniforms.effectMultiplier.value = v;
  }

  get effectMultiplier() { return this._effectMultiplier; }

  /** Source: `Portal.loop(dt)` — time advances scaled by the multiplier. */
  loop(dt) {
    this.time += dt * this._effectMultiplier;
    this.material.uniforms.time.value = this.time;
  }

  /**
   * Source: `App.syncCameras()` — the destination camera takes the visitor
   * camera's position and orientation, so the portal shows the destination from
   * where the visitor actually stands.
   */
  syncCameras(visitorCamera) {
    this.destinationCamera.position.copy(visitorCamera.position);
    this.destinationCamera.quaternion.copy(visitorCamera.quaternion);
  }

  /**
   * Source: `App.render()`. The destination pass, then the caller's own pass.
   *
   * The visibility mask is the Museum adapter for the source's two scenes: with
   * one scene graph there is no second scene to render, so the origin room is
   * hidden for the duration of the destination pass and restored immediately.
   */
  renderDestination(renderer, visitorCamera, scene) {
    if (!this.visible) return false;

    this.updateCorners();
    this.syncCameras(visitorCamera);

    const { bottomLeft, bottomRight, topLeft } = this.corners;
    CameraUtils.frameCorners(this.destinationCamera, bottomLeft, bottomRight, topLeft, false);

    const previousTarget = renderer.getRenderTarget();
    // The portal surface must not appear inside its own reflection.
    const planeWasVisible = this.plane.visible;
    const originWasVisible = this.originGroup ? this.originGroup.visible : null;
    const destinationWasVisible = this.destinationGroup ? this.destinationGroup.visible : null;
    this.plane.visible = false;
    if (this.originGroup) this.originGroup.visible = false;
    if (this.destinationGroup) this.destinationGroup.visible = true;

    renderer.setRenderTarget(this.renderTarget);
    renderer.render(scene, this.destinationCamera);
    renderer.setRenderTarget(previousTarget);

    this.plane.visible = planeWasVisible;
    if (this.originGroup) this.originGroup.visible = originWasVisible;
    if (this.destinationGroup) this.destinationGroup.visible = destinationWasVisible;
    return true;
  }

  setVisible(visible) {
    this.visible = visible;
    this.plane.visible = visible;
  }

  dispose() {
    this.scene.remove(this.plane);
    this.plane.geometry.dispose();
    this.material.dispose();
    this.renderTarget.dispose();
    this.noiseMap.dispose();
  }
}
