// World loading: decodes the rasterised world from data/world-data.js, builds
// grid helpers, country palettes, presets and per-cell terrain shading.
import { fbm } from "./rng.js";

// The map data is injected so the exact same module can run in the browser
// (dynamic import of data/world-data.js) and on the Node server (readFile).
let WORLD = null;

export async function initWorld() {
  if (WORLD) return WORLD;
  const mod = await import("../data/world-data.js");
  WORLD = mod.WORLD || mod.default;
  return WORLD;
}

export function setWorldData(data) {
  WORLD = data;
  return WORLD;
}

export function getWorldData() {
  return WORLD;
}

export const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export const PRESETS = [
  { id: "world", ar: "العالم", en: "World" },
  { id: "europe", ar: "أوروبا", en: "Europe" },
  { id: "asia", ar: "آسيا", en: "Asia" },
  { id: "africa", ar: "أفريقيا", en: "Africa" },
  { id: "americas", ar: "الأمريكتان", en: "Americas" },
  { id: "oceania", ar: "أوقيانوسيا", en: "Oceania" },
];

export function base64ToInt32(b64) {
  const bin = typeof atob === "function" ? atob(b64) : Buffer.from(b64, "base64").toString("binary");
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Int32Array(bytes.buffer, 0, bytes.length >> 2);
}

export function rleToGrid(rle, length) {
  const out = new Int16Array(length).fill(-1);
  let p = 0;
  for (let i = 0; i < rle.length; i += 2) {
    const v = rle[i];
    const run = rle[i + 1];
    if (run <= 0) continue;
    if (v === -1) {
      p += run;
      continue;
    }
    for (let k = 0; k < run && p < length; k++) out[p++] = v;
  }
  return out;
}

export function gridToRle(grid) {
  const out = [];
  let prev = -2;
  let run = 0;
  for (let i = 0; i < grid.length; i++) {
    const v = grid[i];
    if (v === prev) run++;
    else {
      if (prev !== -2) out.push(prev, run);
      prev = v;
      run = 1;
    }
  }
  if (prev !== -2) out.push(prev, run);
  return Int32Array.from(out);
}

// --------------------------------------------------------------- palettes ---

const HUES = [8, 32, 48, 88, 120, 150, 170, 192, 210, 232, 258, 282, 305, 332];

function hsl(h, s, l) {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  return [
    Math.round(Math.min(255, Math.max(0, (r + m) * 255))),
    Math.round(Math.min(255, Math.max(0, (g + m) * 255))),
    Math.round(Math.min(255, Math.max(0, (b + m) * 255))),
  ];
}

const ERA_TINT = {
  ancient: { sat: 0.34, light: 0.62, warm: 10 },
  medieval: { sat: 0.36, light: 0.58, warm: 4 },
  sail: { sat: 0.4, light: 0.56, warm: 0 },
  imperial: { sat: 0.34, light: 0.56, warm: -4 },
  modern: { sat: 0.42, light: 0.55, warm: 0 },
};

export function countryColor(index, era = "modern") {
  const t = ERA_TINT[era] || ERA_TINT.modern;
  const hue = HUES[index % HUES.length] + (Math.floor(index / HUES.length) * 17) % 30;
  const jitter = ((index * 37) % 13) - 6;
  const [r, g, b] = hsl(hue + t.warm + jitter, t.sat, t.light + ((index * 11) % 7) * 0.008);
  return { r, g, b };
}

// ------------------------------------------------------------ world model ---

export class World {
  constructor(preset = "world", era = "modern") {
    if (!WORLD) throw new Error("World data not loaded — call initWorld() or setWorldData() first");
    const meta = WORLD.meta;
    this.meta = meta;
    this.w = meta.w;
    this.h = meta.h;
    this.size = this.w * this.h;
    this.era = era;

    const full = rleToGrid(base64ToInt32(WORLD.rle), this.size);

    // Country descriptors (index-aligned with the generated data).
    this.countries = WORLD.countries.map((c) => ({
      ...c,
      color: countryColor(c.id, era),
    }));

    this.preset = preset;
    this.active = this.countries.map(() => true);
    if (preset !== "world") {
      const keep = new Set();
      for (const c of this.countries) if (c.region === preset) keep.add(c.id);
      this.active = this.countries.map((c) => keep.has(c.id));
      // Islands that belong to the region but got no region tag stay active.
    }

    // Ownership grid: -1 ocean, -3 out-of-arena land, >=0 country id.
    const owner = new Int16Array(this.size);
    for (let i = 0; i < this.size; i++) {
      const o = full[i];
      if (o < 0) owner[i] = -1;
      else if (!this.active[o]) owner[i] = -3;
      else owner[i] = o;
    }
    this.owner = owner;

    this.cellsOfActive = 0;
    this.cellCount = new Int32Array(this.countries.length);
    for (let i = 0; i < this.size; i++) if (owner[i] >= 0) this.cellCount[owner[i]]++;
    for (const c of this.countries) if (this.active[c.id]) this.cellsOfActive += this.cellCount[c.id];

    // Neighbours restricted to active countries.
    for (const c of this.countries) {
      c.neighbors = c.neighbors.filter((n) => this.active[n]);
      c.sea = c.sea.filter((n) => this.active[n]);
    }

    this.buildShade();
    this.buildCoast();
    this.bounds = this.computeBounds();
  }

  idx(x, y) {
    return y * this.w + x;
  }
  xOf(i) {
    return i % this.w;
  }
  yOf(i) {
    return (i / this.w) | 0;
  }

  isLand(i) {
    return this.owner[i] >= 0;
  }
  isOcean(i) {
    return this.owner[i] === -1;
  }

  // Terrain shading is baked into the pixel colours so the map reads as a
  // pixel-art political map: subtle noise inside countries, darker coastlines.
  buildShade() {
    const shade = new Uint8Array(this.size); // 100 = neutral
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const i = y * this.w + x;
        const n = fbm(x * 0.09, y * 0.09, 3, 7);
        let s = 0.9 + n * 0.2;
        if (this.owner[i] === -1) s = 1;
        // faint banding so zoomed-out maps still have texture
        s += (((x * 7 + y * 13) % 5) - 2) * 0.006;
        shade[i] = Math.max(20, Math.min(200, Math.round(s * 100)));
      }
    }
    this.shade = shade;
  }

  buildCoast() {
    const coast = new Uint8Array(this.size);
    const { w, h, owner } = this;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (owner[i] < 0) continue;
        if (
          (x > 0 && owner[i - 1] < 0) ||
          (x < w - 1 && owner[i + 1] < 0) ||
          (y > 0 && owner[i - w] < 0) ||
          (y < h - 1 && owner[i + w] < 0)
        )
          coast[i] = 1;
      }
    }
    this.coast = coast;
  }

  computeBounds() {
    let x0 = 1e9;
    let y0 = 1e9;
    let x1 = -1e9;
    let y1 = -1e9;
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const o = this.owner[y * this.w + x];
        if (o >= 0) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    return { x0, y0, x1, y1 };
  }

  cellsOf(id) {
    return this.cellCount[id] || 0;
  }

  // Country descriptors that are actually playable on this map & alive.
  playable() {
    return this.countries.filter((c) => this.active[c.id] && this.cellCount[c.id] > 0);
  }

  capitalCandidate(id) {
    // Pick the cell closest to the country's centroid on land.
    const c = this.countries[id];
    const cx = c.x;
    const cy = c.y;
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < this.size; i++) {
      if (this.owner[i] !== id) continue;
      const dx = (i % this.w) - cx;
      const dy = ((i / this.w) | 0) - cy;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  countNeighborsDifferent(i, owner) {
    const { w, h } = this;
    const x = i % w;
    const y = (i / w) | 0;
    let n = 0;
    if (x > 0 && owner[i - 1] !== owner[i]) n++;
    if (x < w - 1 && owner[i + 1] !== owner[i]) n++;
    if (y > 0 && owner[i - w] !== owner[i]) n++;
    if (y < h - 1 && owner[i + w] !== owner[i]) n++;
    return n;
  }

  // Countries with at least one cell within `radius` of a cell (used for
  // naval invasion targeting and AI reasoning).
  countriesNear(x, y, radius) {
    const out = new Set();
    const r2 = radius * radius;
    for (let dy = -radius; dy <= radius; dy++) {
      const yy = y + dy;
      if (yy < 0 || yy >= this.h) continue;
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy > r2) continue;
        const xx = x + dx;
        if (xx < 0 || xx >= this.w) continue;
        const o = this.owner[yy * this.w + xx];
        if (o >= 0) out.add(o);
      }
    }
    return out;
  }
}

// Fixed per-country "difficulty" stars (1..5) come from the generator, but we
// blend in the neighbourhood so island nations are not rated as easy prey.
export function difficultyOf(world, id) {
  const c = world.countries[id];
  let stars = c.difficulty || 3;
  if (c.neighbors.length === 0) stars = Math.min(5, stars + 1);
  return Math.max(1, Math.min(5, stars));
}

export function pickRandomPlayable(world, rng, filter) {
  const list = world.playable().filter((c) => (filter ? filter(c) : true));
  return rng.pick(list);
}
