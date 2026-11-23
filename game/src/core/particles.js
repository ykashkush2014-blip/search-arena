/**
 * particles.js — pooled particle system. Uses StructPool so spawning a burst
 * allocates nothing: critical for weak devices during combat.
 */
import { StructPool } from './pool.js';
import { clamp01 } from './mathx.js';

const FIELDS = [
  'x', 'y', 'vx', 'vy', 'ax', 'ay',
  'life', 'maxLife', 'size', 'sizeEnd',
  'r', 'g', 'b', 'alpha', 'alphaEnd',
  'gravity', 'drag', 'groundY', 'type', 'frame',
];

export const ParticleType = {
  DUST: 0,
  SPARK: 1,
  SMOKE: 2,
  SAND: 3,
  MAGIC: 4,
  BLOOD: 5, // stylized sand-burst for monsters
  LEAF: 6,
  EMBER: 7,
  RING: 8,
  TEXT: 9,
};

export class ParticleSystem {
  /**
   * @param {number} [capacity] hard cap — governor sets this per quality tier
   */
  constructor(capacity = 360) {
    this.pool = new StructPool(FIELDS, capacity);
    this.capacity = capacity;
    this.gravityDefault = 240;
    this.batches = new Map(); // color+type -> precomputed style
    this.emitted = 0;
    this.active = 0;
  }

  /** Quality tier hook: shrink or grow capacity without losing live particles. */
  setCapacity(n) {
    this.capacity = n;
  }

  spawn(opts) {
    if (this.active >= this.capacity) return null;
    const p = this.pool.spawn();
    if (!p) return null;
    this.emitted += 1;
    this.active = this.pool.activeCount;
    p.x = opts.x || 0;
    p.y = opts.y || 0;
    p.vx = opts.vx || 0;
    p.vy = opts.vy || 0;
    p.ax = opts.ax || 0;
    p.ay = opts.ay || 0;
    p.maxLife = Math.max(0.05, opts.life ?? 0.5);
    p.life = p.maxLife;
    p.size = opts.size ?? 2;
    p.sizeEnd = opts.sizeEnd ?? p.size;
    const color = parseColor(opts.color || '#d9b38c');
    p.r = color.r;
    p.g = color.g;
    p.b = color.b;
    p.alpha = opts.alpha ?? 1;
    p.alphaEnd = opts.alphaEnd ?? 0;
    p.gravity = opts.gravity ?? 0;
    p.drag = opts.drag ?? 0;
    p.groundY = opts.groundY ?? Infinity;
    p.type = opts.type ?? ParticleType.DUST;
    p.frame = 0;
    return p;
  }

  /** Radial burst — impacts, magic, sand splashes. */
  burst(x, y, count, opts = {}) {
    const spread = opts.spread ?? Math.PI * 2;
    const dir = opts.dir ?? 0;
    const speedMin = opts.speedMin ?? 20;
    const speedMax = opts.speedMax ?? 80;
    const out = [];
    for (let i = 0; i < count; i += 1) {
      const angle = dir - spread / 2 + Math.random() * spread;
      const speed = speedMin + Math.random() * (speedMax - speedMin);
      const p = this.spawn({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: (opts.life ?? 0.5) * (0.6 + Math.random() * 0.8),
        size: opts.size ?? 2,
        sizeEnd: opts.sizeEnd ?? 0,
        color: Array.isArray(opts.color) ? opts.color[i % opts.color.length] : opts.color,
        alpha: opts.alpha ?? 1,
        alphaEnd: opts.alphaEnd ?? 0,
        gravity: opts.gravity ?? 60,
        drag: opts.drag ?? 1.5,
        type: opts.type ?? ParticleType.DUST,
      });
      if (p) out.push(p);
    }
    return out;
  }

  /** Cone burst — weapon swings, flames. */
  cone(x, y, dir, count, opts = {}) {
    return this.burst(x, y, count, {
      ...opts,
      dir,
      spread: opts.spread ?? 0.9,
    });
  }

  /** Expanding ring (shockwaves). */
  ring(x, y, count, opts = {}) {
    return this.burst(x, y, count, {
      ...opts,
      spread: Math.PI * 2,
      speedMin: opts.speed ?? 40,
      speedMax: opts.speed ?? 90,
      gravity: 0,
      type: ParticleType.RING,
    });
  }

  /** Ambient floating sand for the current biome. */
  ambient(x, y, w, h, count, opts = {}) {
    for (let i = 0; i < count; i += 1) {
      this.spawn({
        x: x + Math.random() * w,
        y: y + Math.random() * h,
        vx: opts.windX ?? 6,
        vy: opts.windY ?? -2,
        life: 1.5 + Math.random() * 2,
        size: 1,
        sizeEnd: 1,
        color: opts.color ?? '#e8cfa8',
        alpha: 0.25 + Math.random() * 0.2,
        alphaEnd: 0,
        gravity: 0,
        drag: 0,
        type: ParticleType.SAND,
      });
    }
  }

  update(dt) {
    this.pool.forEachActive((p) => {
      p.life -= dt;
      if (p.life <= 0) {
        this.pool.kill(p);
        return;
      }
      if (p.drag > 0) {
        const damp = Math.max(0, 1 - p.drag * dt);
        p.vx *= damp;
        p.vy *= damp;
      }
      p.vy += (p.gravity + p.ay) * dt;
      p.vx += p.ax * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.groundY !== Infinity && p.y > p.groundY) {
        p.y = p.groundY;
        p.vy *= -0.35;
        p.vx *= 0.7;
      }
      p.frame += dt;
    });
    this.active = this.pool.activeCount;
  }

  /**
   * Render all particles in one pass. Uses fillRect for dust/sand (cheap) and
   * strokeRect for rings. Colors are batched by rgb triple to limit state
   * changes on weak GPUs.
   */
  render(ctx, camera) {
    if (this.active === 0) return;
    const batches = new Map();
    this.pool.forEachActive((p) => {
      const t = clamp01(p.life / p.maxLife);
      const alpha = p.alpha + (p.alphaEnd - p.alpha) * (1 - t);
      if (alpha <= 0.01) return;
      const size = p.size + (p.sizeEnd - p.size) * (1 - t);
      const key = (p.r << 16) | (p.g << 8) | p.b;
      let bucket = batches.get(key);
      if (!bucket) {
        bucket = { r: p.r, g: p.g, b: p.b, items: [] };
        batches.set(key, bucket);
      }
      bucket.items.push({ x: p.x, y: p.y, s: size, a: alpha, type: p.type });
    });
    for (const bucket of batches.values()) {
      const base = `rgba(${bucket.r},${bucket.g},${bucket.b},`;
      for (const it of bucket.items) {
        if (camera && !camera.isVisible(it.x, it.y, 24)) continue;
        ctx.fillStyle = `${base}${it.a.toFixed(2)})`;
        const s = Math.max(1, it.s);
        if (it.type === ParticleType.RING) {
          ctx.fillRect(it.x - s, it.y - 1, s * 2, 2);
        } else {
          ctx.fillRect(it.x - s / 2, it.y - s / 2, s, s);
        }
      }
    }
  }

  clear() {
    this.pool.clear();
    this.active = 0;
    return this;
  }
}

function parseColor(hex) {
  if (typeof hex !== 'string') return { r: 217, g: 179, b: 140 };
  if (hex.startsWith('#')) {
    let h = hex.slice(1);
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    const n = parseInt(h, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  return { r: 217, g: 179, b: 140 };
}
