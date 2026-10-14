/**
 * Immersive Worlds — Device tier & quality policy
 *
 * IW-0 Constitution §21: "performance tier must affect expensive features,
 * not merely label the device."
 *
 * This file decides the tier and publishes a QualityPolicy. It does not know
 * what a shadow map is — the Scene Kit and the render host read the policy and
 * apply it. That keeps quality decisions in one place and their realization in
 * the layer that owns rendering.
 */

export const TIERS = Object.freeze({ LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH' });

/**
 * @typedef {Object} QualityPolicy
 * @property {'LOW'|'MEDIUM'|'HIGH'} tier
 * @property {number} dprCap          maximum device pixel ratio to render at
 * @property {boolean} shadows        shadow maps allowed at all
 * @property {number} shadowMapSize   resolution per shadow-casting light
 * @property {number} maxShadowCasters how many lights may cast
 * @property {boolean} environmentIBL generated image-based lighting allowed
 * @property {number} textureScale    multiplier for generated texture resolution
 * @property {boolean} antialias
 * @property {number} warmupBudgetMs  per-frame budget for space warmup work
 * @property {boolean} warmupSpaces   whether shader warmup runs at all
 * @property {boolean} mobile         touch-first device, regardless of tier
 */

const POLICIES = {
  LOW: {
    tier: TIERS.LOW,
    // Below native resolution on purpose: fill rate is the binding constraint
    // on weak GPUs, and 0.85x upscaled beats 1.0x at 20 fps.
    dprCap: 0.85,
    shadows: false,
    shadowMapSize: 512,
    maxShadowCasters: 0,
    environmentIBL: true,
    textureScale: 0.5,
    antialias: false,
    warmupBudgetMs: 6,
    // Mounting every Space to compile shaders is what tips a low-end phone into
    // WebGL context loss. Better a first-frame hitch than a lost context.
    warmupSpaces: false
  },
  MEDIUM: {
    tier: TIERS.MEDIUM,
    dprCap: 1.5,
    shadows: true,
    shadowMapSize: 1024,
    maxShadowCasters: 2,
    environmentIBL: true,
    textureScale: 0.75,
    antialias: true,
    warmupBudgetMs: 10,
    warmupSpaces: true
  },
  HIGH: {
    tier: TIERS.HIGH,
    dprCap: 2,
    shadows: true,
    shadowMapSize: 2048,
    maxShadowCasters: 4,
    environmentIBL: true,
    textureScale: 1,
    antialias: true,
    warmupBudgetMs: 16,
    warmupSpaces: true
  }
};

/**
 * Detect a tier from coarse, stable signals. Deliberately conservative: a wrong
 * HIGH is much worse than a wrong MEDIUM on a phone.
 *
 * @param {{userAgent?:string, deviceMemory?:number, hardwareConcurrency?:number,
 *          maxTouchPoints?:number, screenWidth?:number, devicePixelRatio?:number}} env
 * @returns {'LOW'|'MEDIUM'|'HIGH'}
 */
export function detectTier(env = {}) {
  const ua = env.userAgent || '';
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (env.maxTouchPoints || 0) > 1;
  const memory = env.deviceMemory ?? (mobile ? 4 : 8);
  const cores = env.hardwareConcurrency ?? (mobile ? 4 : 8);
  const width = env.screenWidth ?? 1920;

  if (memory <= 2 || cores <= 2) return TIERS.LOW;
  if (mobile) return width <= 400 || memory <= 4 ? TIERS.LOW : TIERS.MEDIUM;
  if (memory <= 4 || cores <= 4) return TIERS.MEDIUM;
  return TIERS.HIGH;
}

/**
 * @param {'LOW'|'MEDIUM'|'HIGH'} tier
 * @returns {QualityPolicy}
 */
export function policyForTier(tier, { mobile = false } = {}) {
  const policy = { ...(POLICIES[tier] || POLICIES.MEDIUM), mobile };
  // Shadow maps are a fill-rate cost a phone pays on every frame, and at phone
  // scale the shadow is barely legible. Disable them on touch devices whatever
  // the tier says — evidence-backed, from portfolio-itom's MEDIUM profile.
  if (mobile) {
    policy.shadows = false;
    policy.maxShadowCasters = 0;
    policy.dprCap = Math.min(policy.dprCap, 1.5);
  }
  return policy;
}

/** True for touch-first devices. Kept next to detection so both agree. */
export function isMobileEnv(env = {}) {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(env.userAgent || '') || (env.maxTouchPoints || 0) > 1;
}

export class QualityManager {
  /**
   * @param {{bus:import('./event-bus.js').EventBus, tier?:string, env?:object}} options
   */
  constructor({ bus, tier, env } = {}) {
    this.bus = bus;
    this.env = env;
    this.mobile = isMobileEnv(env);
    this.tier = tier || detectTier(env);
    this.policy = policyForTier(this.tier, { mobile: this.mobile });
  }

  /** Explicit override — used by QA states and by an author-facing quality switch. */
  setTier(tier, { reason = 'manual' } = {}) {
    if (!POLICIES[tier] || tier === this.tier) return this.policy;
    this.tier = tier;
    this.policy = policyForTier(tier, { mobile: this.mobile });
    this.bus?.emit('quality:tier-changed', { tier, policy: this.policy, reason });
    return this.policy;
  }
}
