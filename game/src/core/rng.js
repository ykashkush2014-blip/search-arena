/**
 * rng.js — deterministic seeded RNG (mulberry32 + sfc32 streams).
 * The whole content pipeline and all procedural generation rely on this file,
 * so a seed always reproduces the same dungeon, drops and weather.
 */

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sfc32(a, b, c, d) {
  return function next() {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    const t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    const out = (t + d) | 0;
    c = (c + out) | 0;
    return (out >>> 0) / 4294967296;
  };
}

export class RNG {
  /**
   * @param {number|string} seed — number or string (hashed to a number).
   */
  constructor(seed = 1) {
    this.seed = typeof seed === 'string' ? hashString(seed) : (seed | 0) || 1;
    this.reset();
  }

  reset() {
    const s = this.seed >>> 0;
    this._next = mulberry32(s);
    // Warm the stream so nearby seeds diverge quickly.
    for (let i = 0; i < 8; i += 1) this._next();
    this._stream = sfc32(s ^ 0x9e3779b9, s + 0x165667b1, s ^ 0x85ebca6b, s + 0xc2b2ae35);
    for (let i = 0; i < 12; i += 1) this._stream();
    return this;
  }

  /** Float in [0, 1). */
  next() {
    return this._stream();
  }

  /** Float in [min, max). */
  range(min, max) {
    return min + this.next() * (max - min);
  }

  /** Integer in [min, max] inclusive. */
  int(min, max) {
    if (max < min) {
      const t = min;
      min = max;
      max = t;
    }
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** True with probability p (0..1). */
  chance(p) {
    return this.next() < p;
  }

  /** Pick one element of an array. */
  pick(array) {
    if (!array || array.length === 0) return undefined;
    return array[Math.floor(this.next() * array.length)];
  }

  /** Pick n distinct elements (copies). */
  sample(array, n) {
    const pool = array.slice();
    const out = [];
    const count = Math.min(n, pool.length);
    for (let i = 0; i < count; i += 1) {
      const idx = Math.floor(this.next() * pool.length);
      out.push(pool[idx]);
      pool.splice(idx, 1);
    }
    return out;
  }

  /** Weighted pick. entries: [{ w: number, ... }] or [value, weight] pairs. */
  weighted(entries, weightKey = 'w') {
    if (!entries || entries.length === 0) return undefined;
    let total = 0;
    for (const e of entries) {
      total += Array.isArray(e) ? e[1] : Number(e[weightKey] ?? 1);
    }
    if (total <= 0) return Array.isArray(entries[0]) ? entries[0][0] : entries[0];
    let roll = this.next() * total;
    for (const e of entries) {
      const w = Array.isArray(e) ? e[1] : Number(e[weightKey] ?? 1);
      roll -= w;
      if (roll <= 0) return Array.isArray(e) ? e[0] : e;
    }
    return Array.isArray(entries[entries.length - 1])
      ? entries[entries.length - 1][0]
      : entries[entries.length - 1];
  }

  /** In-place Fisher-Yates shuffle, returns the same array. */
  shuffle(array) {
    for (let i = array.length - 1; i > 0; i -= 1) {
      const j = Math.floor(this.next() * (i + 1));
      const tmp = array[i];
      array[i] = array[j];
      array[j] = tmp;
    }
    return array;
  }

  /** Normal (Box-Muller), mean 0 stddev 1. */
  normal() {
    let u = 0;
    let v = 0;
    while (u === 0) u = this.next();
    while (v === 0) v = this.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(Math.PI * 2 * v);
  }

  /** Angle in radians. */
  angle() {
    return this.next() * Math.PI * 2;
  }

  /** Point in a circle of radius r around (cx, cy). */
  inCircle(cx, cy, r) {
    const a = this.angle();
    const d = Math.sqrt(this.next()) * r;
    return { x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d };
  }

  /** Fork a child stream derived from this one (and a label). */
  fork(label = 'fork') {
    const mixed = (this.next() * 4294967296) >>> 0;
    return new RNG((mixed ^ hashString(String(label))) >>> 0);
  }

  /** Snapshot/restore internal state for rollback or replays. */
  getState() {
    return { seed: this.seed, counter: this._counter = (this._counter || 0) + 1 };
  }
}

export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Convenience factory. */
export function makeRNG(seed) {
  return new RNG(seed);
}

/**
 * WorldRNG — named sub-streams so gameplay systems never interfere with each
 * other's determinism (combat drops vs weather vs dungeon layout).
 */
export class WorldRNG {
  constructor(seed) {
    this.seed = typeof seed === 'string' ? hashString(seed) : (seed | 0) || 1;
    this.streams = new Map();
  }

  stream(name) {
    if (!this.streams.has(name)) {
      this.streams.set(name, new RNG((this.seed ^ hashString(name)) >>> 0));
    }
    return this.streams.get(name);
  }

  resetAll() {
    for (const rng of this.streams.values()) rng.reset();
    return this;
  }
}
