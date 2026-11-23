/**
 * weather.js — dynamic weather with gameplay effects: sandstorms reduce
 * visibility and speed, heat waves drain stamina, blessed winds boost drops.
 * Weather state feeds the particle system and the full-screen tint.
 */
import { gameEvents, Events } from '../core/events.js';
import { clamp } from '../core/mathx.js';

export const WeatherTypes = {
  CLEAR: 'clear',
  BREEZE: 'breeze',
  SANDSTORM: 'sandstorm',
  HEATWAVE: 'heatwave',
  MIRAGE: 'mirage',
  BLESSED: 'blessed',
};

export const WEATHER_DEFS = {
  [WeatherTypes.CLEAR]: {
    name: { en: 'Clear', ar: 'صحو' },
    duration: [60, 120],
    tint: { color: '#ffffff', alpha: 0 },
    windX: 4,
    windY: -1,
    particleRate: 2,
    effects: {},
  },
  [WeatherTypes.BREEZE]: {
    name: { en: 'Breeze', ar: 'نسيم' },
    duration: [45, 90],
    tint: { color: '#dff0ff', alpha: 0.04 },
    windX: 12,
    windY: -3,
    particleRate: 5,
    effects: { speedMod: 1.03 },
  },
  [WeatherTypes.SANDSTORM]: {
    name: { en: 'Sandstorm', ar: 'عاصفة رملية' },
    duration: [25, 50],
    tint: { color: '#d9a45b', alpha: 0.22 },
    windX: 30,
    windY: -6,
    particleRate: 18,
    effects: { speedMod: 0.85, visibility: 0.55, dodgeCost: 1.15 },
  },
  [WeatherTypes.HEATWAVE]: {
    name: { en: 'Heatwave', ar: 'موجة حر' },
    duration: [30, 60],
    tint: { color: '#ff9040', alpha: 0.12 },
    windX: 2,
    windY: -2,
    particleRate: 3,
    effects: { staminaRegen: 0.7, fireDamage: 1.15 },
  },
  [WeatherTypes.MIRAGE]: {
    name: { en: 'Mirage', ar: 'سراب' },
    duration: [20, 40],
    tint: { color: '#a0d8e8', alpha: 0.08 },
    windX: 6,
    windY: -2,
    particleRate: 4,
    effects: { xpGain: 1.1, enemySpeed: 1.08 },
  },
  [WeatherTypes.BLESSED]: {
    name: { en: 'Blessed Winds', ar: 'رياح مباركة' },
    duration: [25, 45],
    tint: { color: '#8fe8b0', alpha: 0.08 },
    windX: 8,
    windY: -4,
    particleRate: 6,
    effects: { goldFind: 0.25, dropBonus: 0.15, healRegen: 0.6 },
  },
};

export class WeatherSystem {
  constructor(opts = {}) {
    this.rng = opts.rng ?? Math.random;
    this.current = WeatherTypes.CLEAR;
    this.timer = 40;
    this.intensity = 1; // 0..1, ramps up during storms
    this.forecast = [];
    this.forceNext = opts.initial ?? WeatherTypes.CLEAR;
    this.biome = opts.biome ?? 'dunes';
  }

  get def() {
    return WEATHER_DEFS[this.current];
  }

  get effects() {
    return this.def.effects ?? {};
  }

  /** Weighted random pick appropriate for the biome. */
  rollNext() {
    if (this.forceNext) {
      const next = this.forceNext;
      this.forceNext = null;
      return next;
    }
    const table = BIOME_WEATHER[this.biome] ?? BIOME_WEATHER.dunes;
    const roll = this.rng();
    let acc = 0;
    for (const [type, weight] of table) {
      acc += weight;
      if (roll <= acc) return type;
    }
    return WeatherTypes.CLEAR;
  }

  update(dt) {
    this.timer -= dt;
    // intensity envelope: ramp in/out so transitions feel natural
    const def = this.def;
    const [minDur, maxDur] = def.duration ?? [40, 80];
    const total = minDur + (maxDur - minDur); // approximate
    const remaining = clamp(this.timer / Math.max(1, total * 0.3), 0, 1);
    this.intensity = clamp(1 - Math.abs(remaining - 0.5) * 2, 0.25, 1);

    if (this.timer <= 0) {
      this.setWeather(this.rollNext());
    }
  }

  setWeather(type, durationOverride = null) {
    if (!WEATHER_DEFS[type]) type = WeatherTypes.CLEAR;
    this.current = type;
    const [minDur, maxDur] = WEATHER_DEFS[type].duration ?? [40, 80];
    this.timer = durationOverride ?? (minDur + this.rng() * (maxDur - minDur));
    this.intensity = 0.3;
    gameEvents.emit(Events.WEATHER_CHANGED, {
      weather: type,
      def: WEATHER_DEFS[type],
    });
    return this.current;
  }

  /** Current tint for the full-screen overlay (scaled by intensity). */
  tint() {
    const t = this.def.tint ?? { color: '#ffffff', alpha: 0 };
    return { color: t.color, alpha: t.alpha * this.intensity };
  }

  wind() {
    return {
      x: this.def.windX * this.intensity,
      y: this.def.windY * this.intensity,
    };
  }

  particleRate() {
    return (this.def.particleRate ?? 2) * this.intensity;
  }

  serialize() {
    return { current: this.current, timer: this.timer, intensity: this.intensity };
  }

  static deserialize(data, opts = {}) {
    const sys = new WeatherSystem(opts);
    if (data && WEATHER_DEFS[data.current]) {
      sys.current = data.current;
      sys.timer = data.timer ?? 30;
      sys.intensity = data.intensity ?? 1;
    }
    return sys;
  }
}

/** Biome-weighted weather tables. */
export const BIOME_WEATHER = {
  dunes: [
    [WeatherTypes.CLEAR, 0.4],
    [WeatherTypes.BREEZE, 0.2],
    [WeatherTypes.SANDSTORM, 0.25],
    [WeatherTypes.HEATWAVE, 0.1],
    [WeatherTypes.BLESSED, 0.05],
  ],
  oasis: [
    [WeatherTypes.CLEAR, 0.45],
    [WeatherTypes.BREEZE, 0.3],
    [WeatherTypes.BLESSED, 0.15],
    [WeatherTypes.MIRAGE, 0.1],
  ],
  salt: [
    [WeatherTypes.CLEAR, 0.35],
    [WeatherTypes.BREEZE, 0.25],
    [WeatherTypes.MIRAGE, 0.2],
    [WeatherTypes.SANDSTORM, 0.2],
  ],
  canyon: [
    [WeatherTypes.CLEAR, 0.35],
    [WeatherTypes.MIRAGE, 0.25],
    [WeatherTypes.SANDSTORM, 0.2],
    [WeatherTypes.BLESSED, 0.1],
    [WeatherTypes.HEATWAVE, 0.1],
  ],
  temple: [
    [WeatherTypes.CLEAR, 0.3],
    [WeatherTypes.HEATWAVE, 0.3],
    [WeatherTypes.SANDSTORM, 0.2],
    [WeatherTypes.MIRAGE, 0.2],
  ],
};
