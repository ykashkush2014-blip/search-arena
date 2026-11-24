/**
 * level3d.js — turns a baked level (tile char rows) into one merged,
 * vertex-colored mesh. Geometry is built ONCE per level load and uploaded to
 * the GPU; per-frame cost is a single draw call.
 *
 * World mapping: 2D (x, y) → 3D (X, Z), Y = up. One tile = 16 world units.
 */
import { TILE, Tiles, CHAR_TO_TILE, TileInfo } from '../gfx/tilegen.js';
import { shadeHex, mixHex } from './gl.js';

/** Height and palette per tile type (world units; TILE = 16). */
export const TILE_3D = {
  [Tiles.VOID]: { h: 0, top: '#17111f', side: '#0d0a12' },
  [Tiles.SAND]: { h: 0, top: '#e8c489', side: '#c99a58' },
  [Tiles.SAND_DARK]: { h: 0, top: '#c99a58', side: '#a87c46' },
  [Tiles.STONE]: { h: 0, top: '#8c8478', side: '#6e665c' },
  [Tiles.WALL]: { h: 19, top: '#6e5a44', side: '#4e3f2e' },
  [Tiles.WALL_TOP]: { h: 24, top: '#7c6650', side: '#584636' },
  [Tiles.ROCK]: { h: 11, top: '#8a7a62', side: '#5e5242' },
  [Tiles.WATER]: { h: -3, top: '#2e6e8e', side: '#2e6e8e' },
  [Tiles.WATER_SHALLOW]: { h: -1, top: '#63b3d8', side: '#63b3d8' },
  [Tiles.BRIDGE]: { h: 1, top: '#8c622c', side: '#6e4c22' },
  [Tiles.SPIKES]: { h: 4, top: '#9a9aa8', side: '#5e5e6c' },
  [Tiles.PLANT]: { h: 7, top: '#4c8a2f', side: '#356122' },
  [Tiles.FLOWER]: { h: 0, top: '#e8c489', side: '#c99a58' },
  [Tiles.TORCH]: { h: 13, top: '#ffb04c', side: '#6e4c22' },
  [Tiles.DOOR]: { h: 2, top: '#a87c46', side: '#7c5a34' },
  [Tiles.STAIRS_DOWN]: { h: -2, top: '#8c8478', side: '#6e665c' },
  [Tiles.STAIRS_UP]: { h: 3, top: '#8c8478', side: '#6e665c' },
  [Tiles.CHEST_MARK]: { h: 0, top: '#c99a58', side: '#a87c46' },
  [Tiles.SAND_BAG]: { h: 7, top: '#c9a15e', side: '#8a6a42' },
  [Tiles.CRYSTAL]: { h: 15, top: '#b267e0', side: '#7c3fae' },
  [Tiles.LAVA]: { h: -3, top: '#e0662c', side: '#b2481e' },
  [Tiles.ASH]: { h: 0, top: '#6e6258', side: '#524a42' },
  [Tiles.SALT]: { h: 0, top: '#e8e4dc', side: '#c8c2b8' },
  [Tiles.GRASS]: { h: 0, top: '#6e9c4a', side: '#547a38' },
  [Tiles.TREE]: { h: 17, top: '#3f7c2c', side: '#6e4c22' },
  [Tiles.MARKER]: { h: 0, top: '#b267e0', side: '#7c3fae' },
};

const DEFAULT_TILE_3D = { h: 0, top: '#8c8478', side: '#6e665c' };

/** Lightweight mesh accumulator. */
export class MeshBuilder {
  constructor() {
    this.positions = [];
    this.normals = [];
    this.colors = [];
  }

  get vertexCount() {
    return this.positions.length / 3;
  }

  /** Push one triangle (3 vertices). */
  tri(p1, p2, p3, color, normal) {
    // face normal unless provided
    let nx; let ny; let nz;
    if (normal) {
      [nx, ny, nz] = normal;
    } else {
      const ux = p2[0] - p1[0]; const uy = p2[1] - p1[1]; const uz = p2[2] - p1[2];
      const vx = p3[0] - p1[0]; const vy = p3[1] - p1[1]; const vz = p3[2] - p1[2];
      nx = uy * vz - uz * vy;
      ny = uz * vx - ux * vz;
      nz = ux * vy - uy * vx;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len; ny /= len; nz /= len;
    }
    const [r, g, b] = color;
    for (const p of [p1, p2, p3]) {
      this.positions.push(p[0], p[1], p[2]);
      this.normals.push(nx, ny, nz);
      this.colors.push(r, g, b);
    }
  }

  /** Push a quad (2 triangles) given 4 corners in CCW order. */
  quad(a, b, c, d, color, normal) {
    this.tri(a, b, c, color, normal);
    this.tri(a, c, d, color, normal);
  }

  /**
   * Axis-aligned box centered at (cx, cy, cz) with size (w, h, d).
   * cy is the CENTER of the box vertically.
   */
  box(cx, cy, cz, w, h, d, topColor, sideColor = topColor, normal) {
    const x0 = cx - w / 2; const x1 = cx + w / 2;
    const y0 = cy - h / 2; const y1 = cy + h / 2;
    const z0 = cz - d / 2; const z1 = cz + d / 2;
    // top
    this.quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], topColor, normal ?? [0, 1, 0]);
    // bottom (cheap, usually hidden)
    this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], sideColor, [0, -1, 0]);
    // sides
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], sideColor, [0, 0, 1]);
    this.quad([x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0], sideColor, [0, 0, -1]);
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], sideColor, [-1, 0, 0]);
    this.quad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], sideColor, [1, 0, 0]);
  }

  /** Flat quad on the ground (y = h) covering one tile. */
  groundTile(x, z, size, h, color, normal = [0, 1, 0]) {
    const x0 = x; const x1 = x + size;
    const z0 = z; const z1 = z + size;
    this.quad([x0, h, z0], [x0, h, z1], [x1, h, z1], [x1, h, z0], color, normal);
  }

  toArrays() {
    return {
      positions: new Float32Array(this.positions),
      normals: new Float32Array(this.normals),
      colors: new Float32Array(this.colors),
      vertexCount: this.vertexCount,
    };
  }
}

/** Deterministic tiny hash for per-tile color jitter. */
function tileJitter(tx, ty) {
  const n = Math.sin(tx * 127.1 + ty * 311.7) * 43758.5453;
  return (n - Math.floor(n)) * 0.12 - 0.06; // ±6%
}

/**
 * Build the merged static mesh for a level.
 * @param {object} level — baked level module ({ width, height, tiles, biome })
 * @returns {{positions, normals, colors, vertexCount}}
 */
export function buildLevelMesh(level) {
  const mb = new MeshBuilder();
  const rows = level.tiles;
  const w = level.width;
  const h = level.height;

  const tileAt = (tx, ty) => {
    if (tx < 0 || ty < 0 || tx >= w || ty >= h) return Tiles.VOID;
    const ch = rows[ty][tx];
    return CHAR_TO_TILE[ch] ?? Tiles.VOID;
  };

  for (let ty = 0; ty < h; ty += 1) {
    for (let tx = 0; tx < w; tx += 1) {
      const id = tileAt(tx, ty);
      const info = TileInfo[id] ?? {};
      if (info.draw === false && id !== Tiles.VOID) continue;

      const def = TILE_3D[id] ?? DEFAULT_TILE_3D;
      const wx = tx * TILE;
      const wz = ty * TILE;
      const jitter = tileJitter(tx, ty);
      const top = shadeHex(def.top, 1 + jitter);
      const side = shadeHex(def.side, 1 + jitter * 0.7);

      // ground plane: every drawable tile gets a floor quad (water/lava dip)
      mb.groundTile(wx, wz, TILE, def.h, top);

      // raised geometry
      if (def.h > 2 && info.solid) {
        // side faces only where the neighbour is lower → fewer triangles
        const nN = tileAt(tx, ty - 1);
        const nS = tileAt(tx, ty + 1);
        const nW = tileAt(tx - 1, ty);
        const nE = tileAt(tx + 1, ty);
        const hN = (TILE_3D[nN] ?? DEFAULT_TILE_3D).h;
        const hS = (TILE_3D[nS] ?? DEFAULT_TILE_3D).h;
        const hW = (TILE_3D[nW] ?? DEFAULT_TILE_3D).h;
        const hE = (TILE_3D[nE] ?? DEFAULT_TILE_3D).h;
        const y0 = def.h;
        const yBase = 0;
        if (hN < y0) {
          mb.quad([wx, yBase, wz], [wx + TILE, yBase, wz], [wx + TILE, y0, wz], [wx, y0, wz], side, [0, 0, -1]);
        }
        if (hS < y0) {
          mb.quad([wx, yBase, wz + TILE], [wx, y0, wz + TILE], [wx + TILE, y0, wz + TILE], [wx + TILE, yBase, wz + TILE], side, [0, 0, 1]);
        }
        if (hW < y0) {
          mb.quad([wx, yBase, wz], [wx, y0, wz], [wx, y0, wz + TILE], [wx, yBase, wz + TILE], side, [-1, 0, 0]);
        }
        if (hE < y0) {
          mb.quad([wx + TILE, yBase, wz], [wx + TILE, yBase, wz + TILE], [wx + TILE, y0, wz + TILE], [wx + TILE, y0, wz], side, [1, 0, 0]);
        }
        // cap
        mb.groundTile(wx, wz, TILE, y0, top);

        // special silhouettes
        if (id === Tiles.TREE) {
          // trunk + canopy blob
          mb.box(wx + TILE / 2, y0 + 4, wz + TILE / 2, 5, 9, 5, shadeHex('#6e4c22', 1 + jitter));
          mb.box(wx + TILE / 2, y0 + 12, wz + TILE / 2, 13, 11, 13, shadeHex('#3f7c2c', 1 + jitter), shadeHex('#2e5c20', 1 + jitter));
        } else if (id === Tiles.CRYSTAL) {
          mb.box(wx + TILE / 2, y0 + 4, wz + TILE / 2, 7, 12, 7, shadeHex('#c88af0', 1 + jitter), shadeHex('#8a4fc0', 1 + jitter));
        } else if (id === Tiles.TORCH) {
          mb.box(wx + TILE / 2, y0 + 2, wz + TILE / 2, 3, 5, 3, shadeHex('#ffb04c', 1 + jitter));
        } else if (id === Tiles.SPIKES) {
          mb.box(wx + TILE / 2, y0 + 1.5, wz + TILE / 2, 10, 3, 10, shadeHex('#c8ccd4', 1 + jitter), side);
        }
      } else if (def.h > 2 && !info.solid && id === Tiles.PLANT) {
        mb.box(wx + TILE / 2, def.h / 2, wz + TILE / 2, 9, def.h, 9, top, side);
      }
    }
  }

  return mb.toArrays();
}

/** Outline mesh for level borders (cheap dark skirt so edges don't glow). */
export function buildSkirtMesh(level) {
  const mb = new MeshBuilder();
  const w = level.width * TILE;
  const h = level.height * TILE;
  const color = [0.06, 0.045, 0.09];
  mb.box(w / 2, -26, -14, w + 60, 52, 28, color, color);
  mb.box(w / 2, -26, h + 14, w + 60, 52, 28, color, color);
  mb.box(-14, -26, h / 2, 28, 52, h + 60, color, color);
  mb.box(w + 14, -26, h / 2, 28, 52, h + 60, color, color);
  mb.box(w / 2, -28, h / 2, w + 60, 4, h + 60, [0.05, 0.04, 0.07], [0.05, 0.04, 0.07]);
  return mb.toArrays();
}

export default buildLevelMesh;
