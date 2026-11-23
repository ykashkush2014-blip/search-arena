/**
 * daynight.js — day/night cycle with lighting tints and gameplay hooks
 * (enemies stronger at night, better loot at dawn). One in-game day defaults
 * to 8 real minutes so players see full cycles during a session.
 */
import { gameEvents, Events } from '../core/events.js';
import { TIME_TINTS } from '../gfx/palette.js';
import { clamp, lerp, smoothstep } from '../core/mathx.js';

export const DAY_PHASES = ['dawn', 'day', 'dusk', 'night'];

export const PHASE_BOUNDS = {
  dawn: [0.18, 0.3],
  day: [0.3, 0.72],
  dusk: [0.72, 0.84],
  night: [0.84, 1.18], // wraps past 1.0 into 0..0.18
};

export class DayNightSystem {
  /**
   * @param {object} [opts] { dayLength, startTime, paused }
   */
  constructor(opts = {}) {
    this.dayLength = opts.dayLength ?? 480; // seconds per full cycle
    this.time = opts.startTime ?? 0.35; // fraction 0..1 (0.35 ≈ mid-morning)
    this.day = 1;
    this.paused = opts.paused === true;
    this.onPhaseChange = null;
    this._lastPhase = this.phase;
  }

  get phase() {
    const t = this.time;
    if (t >= 0.18 && t < 0.3) return 'dawn';
    if (t >= 0.3 && t < 0.72) return 'day';
    if (t >= 0.72 && t < 0.84) return 'dusk';
    return 'night';
  }

  get isNight() {
    return this.phase === 'night';
  }

  get clockText() {
    const totalMinutes = Math.floor(this.time * 24 * 60);
    const h = Math.floor(totalMinutes / 60) % 24;
    const m = totalMinutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  update(dt) {
    if (this.paused) return;
    const before = this.time;
    this.time += dt / this.dayLength;
    if (this.time >= 1) {
      this.time -= 1;
      this.day += 1;
      gameEvents.emit(Events.TIME_OF_DAY, { day: this.day, phase: 'midnight', wrapped: true });
    }
    const phase = this.phase;
    if (phase !== this._lastPhase) {
      this._lastPhase = phase;
      gameEvents.emit(Events.TIME_OF_DAY, { day: this.day, phase });
      if (this.onPhaseChange) this.onPhaseChange(phase, this.day);
    }
    void before;
  }

  /** Full-screen tint for the current time (smooth blend between phases). */
  tint() {
    const t = this.time;
    // keyframes: night → dawn → day → dusk → night
    const keys = [
      { t: 0.0, ...TIME_TINTS.night },
      { t: 0.18, ...TIME_TINTS.night },
      { t: 0.26, ...TIME_TINTS.dawn },
      { t: 0.34, ...TIME_TINTS.day },
      { t: 0.68, ...TIME_TINTS.day },
      { t: 0.78, ...TIME_TINTS.dusk },
      { t: 0.88, ...TIME_TINTS.night },
      { t: 1.0, ...TIME_TINTS.night },
    ];
    for (let i = 1; i < keys.length; i += 1) {
      if (t <= keys[i].t) {
        const a = keys[i - 1];
        const b = keys[i];
        const k = smoothstep((t - a.t) / Math.max(0.0001, b.t - a.t));
        return {
          color: mixHex(a.color, b.color, k),
          alpha: lerp(a.alpha, b.alpha, k),
        };
      }
    }
    return { color: '#ffffff', alpha: 0 };
  }

  /** Ambient light level 0..1 (1 = full day) for sprite shading. */
  lightLevel() {
    const t = this.time;
    if (t < 0.18 || t > 0.88) return 0.35;
    if (t < 0.3) return lerp(0.35, 1, (t - 0.18) / 0.12);
    if (t < 0.72) return 1;
    return lerp(1, 0.35, clamp((t - 0.72) / 0.16, 0, 1));
  }

  /** Gameplay modifiers per phase. */
  modifiers() {
    switch (this.phase) {
      case 'night':
        return { enemyDamage: 1.2, enemyHp: 1.15, xpGain: 1.15, dropBonus: 0.05 };
      case 'dawn':
        return { goldFind: 0.15, dropBonus: 0.1, xpGain: 1.05 };
      case 'dusk':
        return { enemyDamage: 1.1, xpGain: 1.1 };
      default:
        return {};
    }
  }

  serialize() {
    return { time: this.time, day: this.day, dayLength: this.dayLength };
  }

  static deserialize(data) {
    return new DayNightSystem({
      time: data?.time ?? 0.35,
      day: data?.day ?? 1,
      dayLength: data?.dayLength ?? 480,
    });
  }
}

function mixHex(a, b, t) {
  const pa = hexToRgb(a);
  const pb = hexToRgb(b);
  return `rgb(${Math.round(pa.r + (pb.r - pa.r) * t)},${Math.round(pa.g + (pb.g - pa.g) * t)},${Math.round(pa.b + (pb.b - pa.b) * t)})`;
}

function hexToRgb(hex) {
  if (!hex.startsWith('#')) return { r: 255, g: 255, b: 255 };
  let h = hex.slice(1);
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
