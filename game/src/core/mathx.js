/**
 * mathx.js — small, allocation-free math helpers for the game loop.
 * Everything here is pure and Node-safe (no DOM), so tests can import it.
 */

export const TAU = Math.PI * 2;
export const HALF_PI = Math.PI / 2;
export const DEG2RAD = Math.PI / 180;
export const RAD2DEG = 180 / Math.PI;
export const EPSILON = 1e-6;

export function clamp(value, min, max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function clamp01(value) {
  return clamp(value, 0, 1);
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function invLerp(a, b, value) {
  if (Math.abs(b - a) < EPSILON) return 0;
  return (value - a) / (b - a);
}

export function remap(value, inMin, inMax, outMin, outMax) {
  return lerp(outMin, outMax, invLerp(inMin, inMax, value));
}

export function smoothstep(t) {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

export function smootherstep(t) {
  const x = clamp01(t);
  return x * x * x * (x * (x * 6 - 15) + 10);
}

export function moveTowards(current, target, maxDelta) {
  const diff = target - current;
  if (Math.abs(diff) <= maxDelta) return target;
  return current + Math.sign(diff) * maxDelta;
}

export function moveTowardsAngle(current, target, maxDelta) {
  const diff = wrapAngle(target - current);
  if (Math.abs(diff) <= maxDelta) return target;
  return wrapAngle(current + Math.sign(diff) * maxDelta);
}

export function wrapAngle(angle) {
  let a = angle % TAU;
  if (a > Math.PI) a -= TAU;
  if (a < -Math.PI) a += TAU;
  return a;
}

export function angleLerp(a, b, t) {
  return a + wrapAngle(b - a) * t;
}

export function dist(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

export function dist2(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return dx * dx + dy * dy;
}

export function distToSegment(px, py, ax, ay, bx, by) {
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const abLen2 = abx * abx + aby * aby;
  let t = abLen2 > EPSILON ? (apx * abx + apy * aby) / abLen2 : 0;
  t = clamp01(t);
  return dist(px, py, ax + abx * t, ay + aby * t);
}

export function normalize(x, y) {
  const len = Math.sqrt(x * x + y * y);
  if (len < EPSILON) return { x: 0, y: 0, len: 0 };
  return { x: x / len, y: y / len, len };
}

export function dot(x1, y1, x2, y2) {
  return x1 * x2 + y1 * y2;
}

export function cross(x1, y1, x2, y2) {
  return x1 * y2 - y1 * x2;
}

export function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

export function rectContains(rx, ry, rw, rh, px, py) {
  return px >= rx && px <= rx + rw && py >= ry && py <= ry + rh;
}

export function circlesOverlap(x1, y1, r1, x2, y2, r2) {
  const rr = r1 + r2;
  return dist2(x1, y1, x2, y2) <= rr * rr;
}

export function circleRectOverlap(cx, cy, radius, rx, ry, rw, rh) {
  const nearestX = clamp(cx, rx, rx + rw);
  const nearestY = clamp(cy, ry, ry + rh);
  return dist2(cx, cy, nearestX, nearestY) <= radius * radius;
}

export function sign(value) {
  if (value > 0) return 1;
  if (value < 0) return -1;
  return 0;
}

export function floorDiv(a, b) {
  return Math.floor(a / b);
}

export function mod(a, n) {
  return ((a % n) + n) % n;
}

export function roundTo(value, step) {
  return Math.round(value / step) * step;
}

export function approxEqual(a, b, tolerance = 1e-4) {
  return Math.abs(a - b) <= tolerance;
}

export function easeOutQuad(t) {
  const x = clamp01(t);
  return 1 - (1 - x) * (1 - x);
}

export function easeInQuad(t) {
  const x = clamp01(t);
  return x * x;
}

export function easeInOutQuad(t) {
  const x = clamp01(t);
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
}

export function easeOutCubic(t) {
  const x = clamp01(t);
  return 1 - Math.pow(1 - x, 3);
}

export function easeOutBack(t) {
  const x = clamp01(t);
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

export function easeOutElastic(t) {
  const x = clamp01(t);
  if (x === 0 || x === 1) return x;
  const c4 = (2 * Math.PI) / 3;
  return Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * c4) + 1;
}

export function easeOutBounce(t) {
  let x = clamp01(t);
  const n1 = 7.5625;
  const d1 = 2.75;
  if (x < 1 / d1) return n1 * x * x;
  if (x < 2 / d1) {
    x -= 1.5 / d1;
    return n1 * x * x + 0.75;
  }
  if (x < 2.5 / d1) {
    x -= 2.25 / d1;
    return n1 * x * x + 0.9375;
  }
  x -= 2.625 / d1;
  return n1 * x * x + 0.984375;
}

export const EASE = {
  linear: (t) => clamp01(t),
  outQuad: easeOutQuad,
  inQuad: easeInQuad,
  inOutQuad: easeInOutQuad,
  outCubic: easeOutCubic,
  outBack: easeOutBack,
  outElastic: easeOutElastic,
  outBounce: easeOutBounce,
};

/**
 * Hermite spline through two points with optional tangents — used by camera
 * rails and cinematic intro sweeps.
 */
export function hermite(t, p0, p1, m0, m1) {
  const x = clamp01(t);
  const x2 = x * x;
  const x3 = x2 * x;
  return (
    (2 * x3 - 3 * x2 + 1) * p0 +
    (x3 - 2 * x2 + x) * m0 +
    (-2 * x3 + 3 * x2) * p1 +
    (x3 - x2) * m1
  );
}

/**
 * Value noise (deterministic, no state) — used for sand dunes and wind fields.
 */
export function hash2(x, y, seed = 0) {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = (h * 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

export function valueNoise2(x, y, seed = 0) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = smoothstep(fx);
  const sy = smoothstep(fy);
  const n00 = hash2(x0, y0, seed);
  const n10 = hash2(x0 + 1, y0, seed);
  const n01 = hash2(x0, y0 + 1, seed);
  const n11 = hash2(x0 + 1, y0 + 1, seed);
  return lerp(lerp(n00, n10, sx), lerp(n01, n11, sx), sy);
}

export function fbm2(x, y, octaves = 3, seed = 0) {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i += 1) {
    sum += valueNoise2(x * freq, y * freq, seed + i * 101) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return norm > 0 ? sum / norm : 0;
}

/**
 * 2D grid A* helper input check — kept tiny; full search lives in world/pathfinding.js.
 */
export function inGrid(x, y, w, h) {
  return x >= 0 && y >= 0 && x < w && y < h;
}
