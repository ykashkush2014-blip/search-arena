/**
 * tilegen.js — procedural 16×16 tile art. Each tile is painted once into a
 * tiny canvas at boot and then blitted (or baked into chunk caches).
 * No image files are loaded, ever.
 */
import { PALETTE, shade } from './palette.js';
import { hash2 } from '../core/mathx.js';

export const TILE = 16;
export const TILE_SIZE = TILE;

/** Tile type ids used by tilemap.js and the baked level files. */
export const Tiles = {
  VOID: 0,
  SAND: 1,
  SAND_DARK: 2,
  STONE: 3,
  WALL: 4,
  WALL_TOP: 5,
  ROCK: 6,
  WATER: 7,
  WATER_SHALLOW: 8,
  BRIDGE: 9,
  SPIKES: 10,
  PLANT: 11,
  FLOWER: 12,
  TORCH: 13,
  DOOR: 14,
  STAIRS_DOWN: 15,
  STAIRS_UP: 16,
  CHEST_MARK: 17,
  SAND_BAG: 18,
  CRYSTAL: 19,
  LAVA: 20,
  ASH: 21,
  SALT: 22,
  GRASS: 23,
  TREE: 24,
  MARKER: 25,
};

export const TileInfo = {
  [Tiles.VOID]: { solid: true, draw: false, name: 'void' },
  [Tiles.SAND]: { solid: false, draw: true, name: 'sand', slow: 0 },
  [Tiles.SAND_DARK]: { solid: false, draw: true, name: 'sandDark', slow: 0 },
  [Tiles.STONE]: { solid: false, draw: true, name: 'stone', slow: 0 },
  [Tiles.WALL]: { solid: true, draw: true, name: 'wall' },
  [Tiles.WALL_TOP]: { solid: true, draw: true, name: 'wallTop' },
  [Tiles.ROCK]: { solid: true, draw: true, name: 'rock' },
  [Tiles.WATER]: { solid: true, draw: true, name: 'water', liquid: true },
  [Tiles.WATER_SHALLOW]: { solid: false, draw: true, name: 'shallow', slow: 0.45, liquid: true },
  [Tiles.BRIDGE]: { solid: false, draw: true, name: 'bridge', slow: 0 },
  [Tiles.SPIKES]: { solid: false, draw: true, name: 'spikes', damage: 12 },
  [Tiles.PLANT]: { solid: true, draw: true, name: 'plant' },
  [Tiles.FLOWER]: { solid: false, draw: true, name: 'flower' },
  [Tiles.TORCH]: { solid: false, draw: true, name: 'torch', light: true },
  [Tiles.DOOR]: { solid: false, draw: true, name: 'door' },
  [Tiles.STAIRS_DOWN]: { solid: false, draw: true, name: 'stairsDown' },
  [Tiles.STAIRS_UP]: { solid: false, draw: true, name: 'stairsUp' },
  [Tiles.CHEST_MARK]: { solid: false, draw: true, name: 'chestMark' },
  [Tiles.SAND_BAG]: { solid: true, draw: true, name: 'sandbag' },
  [Tiles.CRYSTAL]: { solid: true, draw: true, name: 'crystal', light: true },
  [Tiles.LAVA]: { solid: false, draw: true, name: 'lava', damage: 24, liquid: true },
  [Tiles.ASH]: { solid: false, draw: true, name: 'ash', slow: 0.1 },
  [Tiles.SALT]: { solid: false, draw: true, name: 'salt' },
  [Tiles.GRASS]: { solid: false, draw: true, name: 'grass' },
  [Tiles.TREE]: { solid: true, draw: true, name: 'tree' },
  [Tiles.MARKER]: { solid: false, draw: true, name: 'marker' },
};

/** Level-file char -> tile id (kept in sync with tools/gen-content.js). */
export const CHAR_TO_TILE = {
  '.': Tiles.SAND,
  ',': Tiles.SAND_DARK,
  '=': Tiles.STONE,
  '#': Tiles.WALL,
  '^': Tiles.WALL_TOP,
  'r': Tiles.ROCK,
  'w': Tiles.WATER,
  '~': Tiles.WATER_SHALLOW,
  'b': Tiles.BRIDGE,
  'x': Tiles.SPIKES,
  'p': Tiles.PLANT,
  'f': Tiles.FLOWER,
  'o': Tiles.TORCH,
  'd': Tiles.DOOR,
  'v': Tiles.STAIRS_DOWN,
  'u': Tiles.STAIRS_UP,
  'c': Tiles.CHEST_MARK,
  's': Tiles.SAND_BAG,
  'k': Tiles.CRYSTAL,
  'L': Tiles.LAVA,
  'a': Tiles.ASH,
  'l': Tiles.SALT,
  'g': Tiles.GRASS,
  't': Tiles.TREE,
  'm': Tiles.MARKER,
};

function makeCanvas(w, h) {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
    return { width: w, height: h, getContext: () => makeFakeCtx(), __stub: true };
  }
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function makeFakeCtx() {
  const noop = () => undefined;
  return new Proxy(
    {},
    {
      get: (target, prop) => {
        if (prop === 'canvas') return { width: TILE, height: TILE };
        if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
          return () => ({ addColorStop: noop });
        }
        return noop;
      },
      set: () => true,
    },
  );
}

/** Deterministic per-tile noise lookup. */
function tileNoise(x, y, seed) {
  return hash2(x, y, seed);
}

/**
 * Paint a single tile. `variant` allows 4 sub-variants per tile type so large
 * floors do not look repetitive without any texture memory cost.
 */
export function paintTile(ctx, tileId, variant = 0, biome = 'dunes', anim = 0) {
  const pal = PALETTE[biome] || PALETTE.dunes;
  const t = TILE;
  switch (tileId) {
    case Tiles.SAND:
    case Tiles.SAND_DARK: {
      const base = tileId === Tiles.SAND ? pal.sand[variant % pal.sand.length] : pal.sandDark;
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, t, t);
      // speckles
      for (let i = 0; i < 7; i += 1) {
        const nx = Math.floor(tileNoise(variant * 13 + i, i * 7, 1) * t);
        const ny = Math.floor(tileNoise(i * 5, variant * 11 + i, 2) * t);
        ctx.fillStyle = i % 2 === 0 ? shade(base, -0.12) : shade(base, 0.1);
        ctx.fillRect(nx, ny, 1 + (i % 2), 1);
      }
      // wind ripples
      if (variant % 2 === 0) {
        ctx.fillStyle = shade(base, -0.08);
        ctx.fillRect(2, 4 + (variant % 3) * 3, 9, 1);
        ctx.fillRect(6, 11 - (variant % 2) * 2, 7, 1);
      }
      break;
    }
    case Tiles.STONE: {
      ctx.fillStyle = pal.sandDark;
      ctx.fillRect(0, 0, t, t);
      ctx.fillStyle = shade(pal.rock, 0.12);
      ctx.fillRect(1, 1, 6, 6);
      ctx.fillRect(9, 2, 5, 5);
      ctx.fillRect(3, 9, 6, 5);
      ctx.fillRect(11, 10, 4, 4);
      ctx.fillStyle = shade(pal.rockDark, 0.1);
      ctx.fillRect(0, 7, t, 1);
      ctx.fillRect(7, 0, 1, t);
      break;
    }
    case Tiles.WALL: {
      ctx.fillStyle = pal.wall;
      ctx.fillRect(0, 0, t, t);
      ctx.fillStyle = pal.wallDark;
      // brick joints
      ctx.fillRect(0, 7, t, 1);
      ctx.fillRect(0, 15, t, 1);
      ctx.fillRect(7, 0, 1, 7);
      ctx.fillRect(3, 8, 1, 7);
      ctx.fillRect(11, 8, 1, 7);
      // shading
      ctx.fillStyle = shade(pal.wallTop, 0.15);
      ctx.fillRect(0, 0, t, 2);
      ctx.fillStyle = shade(pal.wallDark, -0.2);
      ctx.fillRect(0, t - 2, t, 2);
      break;
    }
    case Tiles.WALL_TOP: {
      ctx.fillStyle = pal.wallTop;
      ctx.fillRect(0, 0, t, t);
      ctx.fillStyle = shade(pal.wallTop, 0.2);
      ctx.fillRect(0, 0, t, 3);
      ctx.fillStyle = shade(pal.wallTop, -0.15);
      for (let i = 0; i < 5; i += 1) {
        ctx.fillRect(Math.floor(tileNoise(i, variant, 3) * 14), Math.floor(4 + tileNoise(variant, i, 4) * 11), 2, 1);
      }
      break;
    }
    case Tiles.ROCK: {
      ctx.fillStyle = pal.sand[0];
      ctx.fillRect(0, 0, t, t);
      ctx.fillStyle = pal.rock;
      ctx.fillRect(2, 4, 12, 10);
      ctx.fillRect(4, 2, 8, 3);
      ctx.fillStyle = shade(pal.rock, 0.18);
      ctx.fillRect(4, 3, 5, 2);
      ctx.fillStyle = pal.rockDark;
      ctx.fillRect(3, 12, 10, 2);
      break;
    }
    case Tiles.WATER:
    case Tiles.WATER_SHALLOW: {
      const deep = tileId === Tiles.WATER;
      ctx.fillStyle = deep ? pal.waterDeep : pal.waterShallow;
      ctx.fillRect(0, 0, t, t);
      const wave = Math.floor(anim * 2 + variant) % 4;
      ctx.fillStyle = deep ? pal.water : shade(pal.waterShallow, 0.18);
      for (let i = 0; i < 3; i += 1) {
        const y = (i * 5 + wave * 2) % t;
        ctx.fillRect((i * 6 + wave * 3) % t, y, 6, 1);
      }
      break;
    }
    case Tiles.BRIDGE: {
      ctx.fillStyle = pal.sandDark;
      ctx.fillRect(0, 0, t, t);
      ctx.fillStyle = shade(pal.wallDark, 0.1);
      for (let i = 0; i < 4; i += 1) {
        ctx.fillRect(i * 4, 0, 3, t);
      }
      ctx.fillStyle = shade(pal.wall, 0.2);
      ctx.fillRect(0, 2, t, 1);
      ctx.fillRect(0, 13, t, 1);
      break;
    }
    case Tiles.SPIKES: {
      ctx.fillStyle = pal.sandDark;
      ctx.fillRect(0, 0, t, t);
      ctx.fillStyle = pal.rockDark;
      for (let i = 0; i < 4; i += 1) {
        const x = i * 4 + 1;
        ctx.fillRect(x + 1, 4, 2, 10);
        ctx.fillRect(x, 6, 4, 6);
      }
      ctx.fillStyle = shade(pal.rock, 0.3);
      for (let i = 0; i < 4; i += 1) ctx.fillRect(i * 4 + 2, 4, 1, 3);
      break;
    }
    case Tiles.PLANT: {
      ctx.fillStyle = pal.sand[1];
      ctx.fillRect(0, 0, t, t);
      ctx.fillStyle = pal.plantDark;
      ctx.fillRect(7, 8, 2, 7);
      ctx.fillStyle = pal.plant;
      ctx.fillRect(4, 4, 8, 6);
      ctx.fillRect(2, 6, 4, 3);
      ctx.fillRect(10, 5, 4, 3);
      ctx.fillStyle = shade(pal.plant, 0.2);
      ctx.fillRect(5, 3, 3, 2);
      break;
    }
    case Tiles.FLOWER: {
      ctx.fillStyle = pal.sand[2];
      ctx.fillRect(0, 0, t, t);
      const flowerColors = ['#e05548', '#e8b64c', '#b267e0', '#5a8fe0'];
      for (let i = 0; i < 3; i += 1) {
        const x = 2 + i * 5;
        const y = 4 + ((i + variant) % 3) * 4;
        ctx.fillStyle = pal.plantDark;
        ctx.fillRect(x, y + 2, 1, 4);
        ctx.fillStyle = flowerColors[(i + variant) % flowerColors.length];
        ctx.fillRect(x - 1, y, 3, 3);
      }
      break;
    }
    case Tiles.TORCH: {
      ctx.fillStyle = pal.sand[3];
      ctx.fillRect(0, 0, t, t);
      ctx.fillStyle = '#4a2c18';
      ctx.fillRect(7, 6, 2, 9);
      ctx.fillStyle = '#f29a4c';
      const flick = Math.floor(anim * 6 + variant) % 2;
      ctx.fillRect(6, 2 + flick, 4, 5 - flick);
      ctx.fillStyle = '#ffd24c';
      ctx.fillRect(7, 3 + flick, 2, 3);
      break;
    }
    case Tiles.DOOR: {
      ctx.fillStyle = pal.wallDark;
      ctx.fillRect(0, 0, t, t);
      ctx.fillStyle = '#5c3a20';
      ctx.fillRect(2, 1, 12, 15);
      ctx.fillStyle = '#7a4e2a';
      ctx.fillRect(3, 2, 10, 13);
      ctx.fillStyle = '#2c1808';
      ctx.fillRect(3, 2, 2, 13);
      ctx.fillStyle = '#e8b64c';
      ctx.fillRect(10, 8, 2, 2);
      break;
    }
    case Tiles.STAIRS_DOWN:
    case Tiles.STAIRS_UP: {
      const down = tileId === Tiles.STAIRS_DOWN;
      ctx.fillStyle = pal.wallDark;
      ctx.fillRect(0, 0, t, t);
      for (let i = 0; i < 5; i += 1) {
        const y = down ? i * 3 : t - (i + 1) * 3;
        ctx.fillStyle = shade(pal.rock, 0.1 + i * 0.05);
        ctx.fillRect(i, y, t - i, 3);
      }
      break;
    }
    case Tiles.CHEST_MARK: {
      ctx.fillStyle = pal.sand[2];
      ctx.fillRect(0, 0, t, t);
      ctx.fillStyle = '#6e4a22';
      ctx.fillRect(3, 5, 10, 8);
      ctx.fillStyle = '#8c622c';
      ctx.fillRect(3, 4, 10, 4);
      ctx.fillStyle = '#e8b64c';
      ctx.fillRect(7, 7, 2, 3);
      break;
    }
    case Tiles.SAND_BAG: {
      ctx.fillStyle = pal.sand[1];
      ctx.fillRect(0, 0, t, t);
      ctx.fillStyle = '#b08c5c';
      ctx.fillRect(2, 5, 12, 9);
      ctx.fillRect(4, 3, 8, 3);
      ctx.fillStyle = '#8a6a42';
      ctx.fillRect(2, 11, 12, 3);
      ctx.fillStyle = '#d1ab72';
      ctx.fillRect(4, 4, 6, 2);
      break;
    }
    case Tiles.CRYSTAL: {
      ctx.fillStyle = pal.sandDark;
      ctx.fillRect(0, 0, t, t);
      const glow = ['#b267e0', '#5a8fe0', '#59c2a8'][(variant % 3)];
      ctx.fillStyle = glow;
      ctx.fillRect(7, 2, 3, 12);
      ctx.fillRect(4, 6, 3, 7);
      ctx.fillRect(10, 5, 3, 8);
      ctx.fillStyle = shade(glow, 0.4);
      ctx.fillRect(8, 3, 1, 9);
      break;
    }
    case Tiles.LAVA: {
      ctx.fillStyle = '#a03c12';
      ctx.fillRect(0, 0, t, t);
      const wave = Math.floor(anim * 3 + variant) % 4;
      ctx.fillStyle = '#e06a2c';
      ctx.fillRect(0, wave, t, 3);
      ctx.fillRect(2, (wave + 7) % t, 10, 2);
      ctx.fillStyle = '#ffd24c';
      ctx.fillRect(3, (wave + 1) % t, 5, 1);
      break;
    }
    case Tiles.ASH: {
      ctx.fillStyle = '#3a2c28';
      ctx.fillRect(0, 0, t, t);
      for (let i = 0; i < 6; i += 1) {
        ctx.fillStyle = i % 2 ? '#4a3832' : '#2c201c';
        ctx.fillRect(Math.floor(tileNoise(i, variant, 8) * 14), Math.floor(tileNoise(variant, i, 9) * 14), 2, 2);
      }
      break;
    }
    case Tiles.SALT: {
      ctx.fillStyle = '#e8ecf0';
      ctx.fillRect(0, 0, t, t);
      ctx.fillStyle = '#cdd6de';
      for (let i = 0; i < 4; i += 1) {
        ctx.fillRect(Math.floor(tileNoise(i, variant, 10) * 12), Math.floor(tileNoise(variant, i, 11) * 12), 3, 2);
      }
      break;
    }
    case Tiles.GRASS: {
      ctx.fillStyle = pal.plantDark;
      ctx.fillRect(0, 0, t, t);
      ctx.fillStyle = pal.plant;
      for (let i = 0; i < 6; i += 1) {
        ctx.fillRect(Math.floor(tileNoise(i, variant, 12) * 13), Math.floor(tileNoise(variant, i, 13) * 13), 3, 2);
      }
      break;
    }
    case Tiles.TREE: {
      ctx.fillStyle = pal.sand[1];
      ctx.fillRect(0, 0, t, t);
      ctx.fillStyle = '#6e4a22';
      ctx.fillRect(7, 8, 2, 7);
      ctx.fillStyle = pal.plantDark;
      ctx.fillRect(3, 2, 10, 8);
      ctx.fillStyle = pal.plant;
      ctx.fillRect(5, 0, 6, 6);
      ctx.fillRect(2, 4, 4, 4);
      ctx.fillRect(10, 3, 4, 4);
      break;
    }
    case Tiles.MARKER:
    case Tiles.VOID:
    default: {
      ctx.fillStyle = tileId === Tiles.MARKER ? '#59c2a8' : '#120c18';
      ctx.fillRect(0, 0, t, t);
      if (tileId === Tiles.MARKER) {
        ctx.fillStyle = '#0c3a30';
        ctx.fillRect(6, 6, 4, 4);
      }
      break;
    }
  }
}

/**
 * TileSet — caches painted tiles per (biome, tileId, variant).
 * Animated tiles (water/lava/torch) hold 4 frames.
 */
export class TileSet {
  constructor(biome = 'dunes') {
    this.biome = biome;
    this.cache = new Map();
    this.animCache = new Map();
    this.animTime = 0;
  }

  key(tileId, variant) {
    return `${this.biome}:${tileId}:${variant}`;
  }

  get(tileId, variant = 0) {
    const k = this.key(tileId, variant);
    let canvas = this.cache.get(k);
    if (!canvas) {
      canvas = makeCanvas(TILE, TILE);
      const ctx = canvas.getContext('2d');
      paintTile(ctx, tileId, variant, this.biome, 0);
      this.cache.set(k, canvas);
    }
    return canvas;
  }

  getAnimated(tileId, frame) {
    const k = `${this.biome}:${tileId}:${frame}`;
    let canvas = this.animCache.get(k);
    if (!canvas) {
      canvas = makeCanvas(TILE, TILE);
      const ctx = canvas.getContext('2d');
      paintTile(ctx, tileId, frame, this.biome, frame);
      this.animCache.set(k, canvas);
    }
    return canvas;
  }

  update(dt) {
    this.animTime += dt;
  }

  get animFrame() {
    return Math.floor(this.animTime * 3) % 4;
  }

  isAnimated(tileId) {
    return tileId === Tiles.WATER || tileId === Tiles.LAVA || tileId === Tiles.TORCH || tileId === Tiles.WATER_SHALLOW;
  }

  draw(ctx, tileId, x, y, variant = 0) {
    if (!TileInfo[tileId] || !TileInfo[tileId].draw) return;
    const img = this.isAnimated(tileId) ? this.getAnimated(tileId, this.animFrame) : this.get(tileId, variant);
    if (img.__stub) return;
    ctx.drawImage(img, Math.round(x), Math.round(y));
  }
}
