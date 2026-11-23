/**
 * performance.js — adaptive quality controller for weak devices.
 *
 * Three tiers:
 *   LOW  : 30 FPS render cap, no particles beyond essentials, no shadows,
 *          half-resolution dithered weather, no chunk cache growth.
 *   MED  : 60 FPS target, limited particles, simple shadows.
 *   HIGH : full effects.
 *
 * The controller watches a rolling FPS window and steps the tier down (or
 * cautiously up) so the game stays smooth without user intervention. Users can
 * also pin a tier manually from the settings screen.
 */

export const Tiers = { LOW: 0, MED: 1, HIGH: 2 };

export const TIER_PROFILES = {
  [Tiers.LOW]: {
    name: 'low',
    renderEvery: 2, // 30 FPS render while sim stays 60
    maxParticles: 48,
    weatherParticles: 24,
    shadows: false,
    chunkCache: true,
    screenFx: false,
    audioVoices: 4,
    damageNumbers: true,
    minimapDetail: false,
  },
  [Tiers.MED]: {
    name: 'medium',
    renderEvery: 1,
    maxParticles: 160,
    weatherParticles: 80,
    shadows: 'simple',
    chunkCache: true,
    screenFx: true,
    audioVoices: 8,
    damageNumbers: true,
    minimapDetail: true,
  },
  [Tiers.HIGH]: {
    name: 'high',
    renderEvery: 1,
    maxParticles: 360,
    weatherParticles: 160,
    shadows: 'full',
    chunkCache: true,
    screenFx: true,
    audioVoices: 12,
    damageNumbers: true,
    minimapDetail: true,
  },
};

export class PerformanceGovernor {
  /**
   * @param {object} [opts] { tier, auto, onTierChange, fpsHigh, fpsLow }
   */
  constructor(opts = {}) {
    this.auto = opts.auto !== false;
    this.tier = opts.tier ?? Tiers.MED;
    this.pinnedTier = opts.tier ?? null;
    this.onTierChange = opts.onTierChange || null;
    this.fpsHigh = opts.fpsHigh ?? 55;
    this.fpsLow = opts.fpsLow ?? 26;
    this.samples = [];
    this.windowSize = 120;
    this.cooldown = 0;
    this.history = [];
  }

  get profile() {
    return TIER_PROFILES[this.tier];
  }

  get profileName() {
    return this.profile.name;
  }

  /** Pin a tier manually (settings screen). Pass null to resume auto mode. */
  pin(tier) {
    if (tier === null) {
      this.pinnedTier = null;
      this.auto = true;
    } else {
      this.pinnedTier = tier;
      this.auto = false;
      this._setTier(tier, 'pinned');
    }
    return this;
  }

  /** Feed one FPS sample per second (from engine stats). */
  sample(fps) {
    this.samples.push(fps);
    if (this.samples.length > this.windowSize) this.samples.shift();
    if (!this.auto || this.pinnedTier !== null) return;
    if (this.cooldown > 0) {
      this.cooldown -= 1;
      return;
    }
    if (this.samples.length < 30) return;
    const avg = this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
    if (avg < this.fpsLow && this.tier > Tiers.LOW) {
      this._setTier(this.tier - 1, `fps ${avg.toFixed(1)} < ${this.fpsLow}`);
      this.samples.length = 0;
      this.cooldown = 45;
    } else if (avg > this.fpsHigh && this.tier < Tiers.HIGH) {
      this._setTier(this.tier + 1, `fps ${avg.toFixed(1)} > ${this.fpsHigh}`);
      this.samples.length = 0;
      this.cooldown = 120; // step up slowly, step down fast
    }
  }

  _setTier(tier, reason) {
    if (tier === this.tier) return;
    const prev = this.tier;
    this.tier = tier;
    this.history.push({ at: Date.now(), from: prev, to: tier, reason });
    if (this.history.length > 32) this.history.shift();
    if (this.onTierChange) this.onTierChange(tier, TIER_PROFILES[tier], reason);
  }

  /**
   * One-shot startup heuristic: score the device before any frame runs.
   * Cheap signals only — never blocks the boot sequence.
   */
  static detectInitialTier(env = {}) {
    let score = 0;
    const cores = env.hardwareConcurrency || (typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 4) || 4;
    const memory = env.deviceMemory || (typeof navigator !== 'undefined' ? navigator.deviceMemory : 4) || 4;
    if (cores >= 8) score += 2;
    else if (cores >= 4) score += 1;
    if (memory >= 8) score += 2;
    else if (memory >= 4) score += 1;
    if (env.isMobile || (typeof navigator !== 'undefined' && /Android|iPhone|iPad/i.test(navigator.userAgent || ''))) {
      score -= 1;
    }
    if (score >= 3) return Tiers.HIGH;
    if (score >= 1) return Tiers.MED;
    return Tiers.LOW;
  }
}
