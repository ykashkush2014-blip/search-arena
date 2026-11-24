// Chunked voxel world. Pure JS + typed arrays so it can be tested headlessly.
import { ID, isSolid, isOpaque } from './blocks.js';
import { fbm2, hash2, mulberry32, clamp } from './noise.js';

export const CHUNK_SIZE = 16;
export const WORLD_HEIGHT = 64;
export const SEA_LEVEL = 20;

export function chunkKey(cx, cz) {
  return cx + ',' + cz;
}

/** Terrain height for a world column (shared by chunk gen and tree placement). */
export function terrainHeight(wx, wz, seed) {
  const cont = fbm2(wx * 0.0055, wz * 0.0055, seed + 31, 3);
  const base = fbm2(wx * 0.017, wz * 0.017, seed, 4);
  const detail = fbm2(wx * 0.08, wz * 0.08, seed + 77, 2);
  const mmask = fbm2(wx * 0.004, wz * 0.004, seed + 5, 3);
  const ridge = 1 - Math.abs(fbm2(wx * 0.02, wz * 0.02, seed + 91, 3) * 2 - 1);
  const peak = Math.pow(clamp((mmask - 0.55) / 0.22, 0, 1.4), 1.5);
  const mount = peak * (10 + ridge * 22);
  // Carve lake basins so every seed has water to explore.
  const lakeN = fbm2(wx * 0.0065, wz * 0.0065, seed + 303, 3);
  const lake = Math.pow(clamp((lakeN - 0.53) / 0.17, 0, 1), 1.1) * 11;
  const h = 24 + (cont - 0.5) * 24 + (base - 0.5) * 10 + (detail - 0.5) * 3 + mount - lake;
  return clamp(Math.floor(h), 3, WORLD_HEIGHT - 10);
}

export function generateChunkData(cx, cz, seed) {
  const S = CHUNK_SIZE;
  const H = WORLD_HEIGHT;
  const data = new Uint8Array(S * S * H);
  const heights = new Int16Array(S * S);
  const idx = (x, y, z) => (y * S + z) * S + x;

  for (let z = 0; z < S; z++) {
    for (let x = 0; x < S; x++) {
      const wx = cx * S + x;
      const wz = cz * S + z;
      const h = terrainHeight(wx, wz, seed);
      heights[z * S + x] = h;

      const beach = h <= SEA_LEVEL + 1;
      const snowy = h > 44;
      for (let y = 0; y <= h; y++) {
        let block;
        if (y === h) {
          block = beach ? ID.SAND : snowy ? ID.SNOW : ID.GRASS;
        } else if (y > h - 4) {
          block = beach ? ID.SAND : ID.DIRT;
        } else {
          block = ID.STONE;
        }
        data[idx(x, y, z)] = block;
      }
      // Fill water up to sea level.
      for (let y = h + 1; y <= SEA_LEVEL; y++) {
        data[idx(x, y, z)] = ID.WATER;
      }
      // Occasional surface rocks for visual interest.
      if (!beach && h > SEA_LEVEL + 1 && hash2(wx, wz, seed + 991) > 0.985) {
        data[idx(x, h + 1, z)] = ID.COBBLE;
      }
    }
  }

  // Trees: deterministic per world cell so neighbouring chunks agree.
  const cell = 7;
  const c0x = Math.floor((cx * S - 3) / cell);
  const c1x = Math.floor((cx * S + S + 3) / cell);
  const c0z = Math.floor((cz * S - 3) / cell);
  const c1z = Math.floor((cz * S + S + 3) / cell);
  for (let gz = c0z; gz <= c1z; gz++) {
    for (let gx = c0x; gx <= c1x; gx++) {
      if (hash2(gx, gz, seed + 4242) < 0.5) continue;
      const jx = Math.floor(hash2(gx, gz, seed + 11) * (cell - 3)) + 1;
      const jz = Math.floor(hash2(gx, gz, seed + 12) * (cell - 3)) + 1;
      const wx = gx * cell + jx;
      const wz = gz * cell + jz;
      const lx = wx - cx * S;
      const lz = wz - cz * S;
      if (lx < -2 || lx > S + 1 || lz < -2 || lz > S + 1) continue;
      const bh = terrainHeight(wx, wz, seed);
      if (bh <= SEA_LEVEL + 1 || bh > 40) continue;
      const trunk = 3 + Math.floor(hash2(gx, gz, seed + 13) * 3);
      const top = bh + trunk;
      if (top + 2 >= H) continue;
      const put = (x, y, z, block, overwrite) => {
        if (x < 0 || x >= S || z < 0 || z >= S || y < 0 || y >= H) return;
        const p = idx(x, y, z);
        if (!overwrite && data[p] !== 0) return;
        data[p] = block;
      };
      for (let y = bh + 1; y <= top; y++) put(lx, y, lz, ID.LOG, true);
      for (let dy = -1; dy <= 2; dy++) {
        const r = dy >= 1 ? 1 : 2;
        for (let dz = -r; dz <= r; dz++) {
          for (let dx = -r; dx <= r; dx++) {
            if (Math.abs(dx) === r && Math.abs(dz) === r && hash2(wx + dx, wz + dz, seed + top + dy) > 0.5) continue;
            if (dx === 0 && dz === 0 && dy <= 0) continue;
            put(lx + dx, top + dy, lz + dz, ID.LEAVES, false);
          }
        }
      }
    }
  }

  // A little lamp-lit ruin near the origin to make spawn feel handcrafted.
  if (cx === 0 && cz === 0) {
    const h = heights[8 * S + 8];
    for (let i = 0; i < 4; i++) {
      const dx = [2, 5, 2, 5][i];
      const dz = [2, 2, 5, 5][i];
      for (let y = 1; y <= 2; y++) data[idx(8 + dx, h + y, 8 + dz)] = ID.BRICK;
    }
    data[idx(8 + 3, h + 3, 8 + 3)] = ID.LAMP;
  }

  return { data, heights };
}

export class Chunk {
  constructor(cx, cz, data, heights) {
    this.cx = cx;
    this.cz = cz;
    this.data = data;
    this.heights = heights;
    this.dirty = true;
    this.meshes = [];
    this.generated = true;
  }

  get(x, y, z) {
    if (y < 0 || y >= WORLD_HEIGHT) return 0;
    return this.data[(y * CHUNK_SIZE + z) * CHUNK_SIZE + x];
  }

  set(x, y, z, id) {
    if (y < 0 || y >= WORLD_HEIGHT) return;
    this.data[(y * CHUNK_SIZE + z) * CHUNK_SIZE + x] = id;
    this.dirty = true;
  }

  surfaceHeight(x, z) {
    return this.heights[z * CHUNK_SIZE + x];
  }
}

export class World {
  constructor(seed = 1337) {
    this.seed = seed >>> 0;
    this.chunks = new Map();
    this.edits = new Map(); // chunkKey -> Map(localIndex -> id) so edits survive chunk regen
    this.dirtyQueue = new Set();
  }

  /** Load (generate) a chunk synchronously; returns cached chunk if present. */
  ensureChunk(cx, cz) {
    const key = chunkKey(cx, cz);
    const existing = this.chunks.get(key);
    if (existing) return existing;
    const { data, heights } = generateChunkData(cx, cz, this.seed);
    const edits = this.edits.get(key);
    if (edits) for (const [i, id] of edits) data[i] = id;
    const chunk = new Chunk(cx, cz, data, heights);
    this.chunks.set(key, chunk);
    return chunk;
  }

  getBlock(x, y, z) {
    if (y < 0) return ID.STONE;
    if (y >= WORLD_HEIGHT) return ID.AIR;
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const chunk = this.ensureChunk(cx, cz);
    return chunk.get(x - cx * CHUNK_SIZE, y, z - cz * CHUNK_SIZE);
  }

  isSolidAt(x, y, z) {
    return isSolid(this.getBlock(x, y, z));
  }

  setBlock(x, y, z, id, { record = true } = {}) {
    if (y < 0 || y >= WORLD_HEIGHT) return null;
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const lx = x - cx * CHUNK_SIZE;
    const lz = z - cz * CHUNK_SIZE;
    const chunk = this.ensureChunk(cx, cz);
    const before = chunk.get(lx, y, lz);
    if (before === id) return null;
    chunk.set(lx, y, lz, id);
    if (record) {
      const key = chunkKey(cx, cz);
      let m = this.edits.get(key);
      if (!m) { m = new Map(); this.edits.set(key, m); }
      m.set((y * CHUNK_SIZE + lz) * CHUNK_SIZE + lx, id);
    }
    // Mark neighbours dirty when editing a chunk border.
    this.markDirty(cx, cz);
    if (lx === 0) this.markDirty(cx - 1, cz);
    if (lx === CHUNK_SIZE - 1) this.markDirty(cx + 1, cz);
    if (lz === 0) this.markDirty(cx, cz - 1);
    if (lz === CHUNK_SIZE - 1) this.markDirty(cx, cz + 1);
    return { x, y, z, before, after: id };
  }

  markDirty(cx, cz) {
    const key = chunkKey(cx, cz);
    const chunk = this.chunks.get(key);
    if (chunk) {
      chunk.dirty = true;
      this.dirtyQueue.add(key);
    }
  }

  /** Highest non-air block that is solid or water at this column. */
  topBlockY(x, z) {
    for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
      const b = this.getBlock(x, y, z);
      if (b !== ID.AIR) return y;
    }
    return 0;
  }

  /** Find a safe spawn position (solid ground above water, not inside leaves). */
  findSpawn() {
    for (let r = 0; r < 40; r++) {
      for (let a = 0; a < 8; a++) {
        const x = Math.round(Math.cos((a / 8) * Math.PI * 2) * r);
        const z = Math.round(Math.sin((a / 8) * Math.PI * 2) * r);
        for (let y = WORLD_HEIGHT - 6; y > SEA_LEVEL + 1; y--) {
          const b = this.getBlock(x, y, z);
          if (isOpaque(b) && b !== ID.LEAVES) {
            if (this.getBlock(x, y + 1, z) === ID.AIR && this.getBlock(x, y + 2, z) === ID.AIR) {
              return { x: x + 0.5, y: y + 1, z: z + 0.5 };
            }
          }
        }
      }
    }
    return { x: 0.5, y: 42, z: 0.5 };
  }

  /** Deterministic survival-mode loot: which block a broken block yields. */
  static lootFor(id, rand = Math.random) {
    switch (id) {
      case ID.GRASS: return ID.DIRT;
      case ID.STONE: return ID.COBBLE;
      case ID.LEAVES: return rand() < 0.25 ? ID.LEAVES : null;
      case ID.WATER: return null;
      default: return id;
    }
  }
}

/** Unused helper kept for potential future biome work / debugging. */
export function makeRand(seed) {
  return mulberry32(seed);
}
