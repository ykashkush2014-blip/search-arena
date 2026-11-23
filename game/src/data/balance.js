/**
 * balance.js — global balance knobs. Tuning happens here so designers never
 * need to touch systems code.
 */
export const BALANCE = {
  player: {
    baseHp: 100,
    baseMana: 60,
    baseAtk: 10,
    baseDef: 4,
    baseCrit: 0.05,
    baseSpeed: 92,
    hpPerLevel: 12,
    atkPerLevel: 2,
    defPerLevel: 1,
    manaPerLevel: 6,
    xpCurveBase: 100,
    xpCurveGrowth: 1.28,
    staminaMax: 100,
    dashCost: 22,
    dashCooldown: 0.55,
    iframesOnHit: 0.45,
    respawnIframes: 1.2,
  },
  combat: {
    critMultiplier: 1.5,
    defenseSoftCap: 40,
    comboWindow: 0.9,
    comboBonusPerHit: 0.18,
    hitStopBasic: 0.03,
    hitStopCrit: 0.06,
    lifestealCap: 0.25,
  },
  enemies: {
    xpPerLevel: 0.12, // bonus xp scaling per level tier
    hpPerLevel: 0.14,
    atkPerLevel: 0.08,
    goldPerLevel: 0.1,
    aggroGrace: 0.6,
    separationRadius: 14,
    maxActivePerLevel: 22,
  },
  loot: {
    goldBase: 1,
    dropBonusCap: 0.5,
    magnetRange: 42,
    despawnSeconds: 25,
    potionDropChance: 0.08,
  },
  world: {
    dayLength: 480,
    weatherMin: 25,
    weatherMax: 120,
    fogRevealRadius: 11,
    cameraSmoothing: 0.12,
    cameraLookahead: 18,
  },
  economy: {
    sellRatio: 0.5,
    buyInflation: 1,
    reputationDiscountCap: 0.15,
    potionPrice: 40,
    repairDiscount: 0.1,
  },
  performance: {
    particleBudgetLow: 48,
    particleBudgetMed: 160,
    particleBudgetHigh: 360,
    targetFps: 60,
    renderFpsLow: 30,
  },
};

/** Merge partial overrides (tests + tuning tools). */
export function applyBalance(overrides = {}) {
  for (const [section, values] of Object.entries(overrides)) {
    if (BALANCE[section] && typeof values === 'object') {
      Object.assign(BALANCE[section], values);
    }
  }
  return BALANCE;
}

export default BALANCE;
