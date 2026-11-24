// Face-culled chunk mesher producing raw float arrays (no three.js dependency).
import { ID, blockDef, isOpaque, isSolid } from './blocks.js';

const ATLAS_COLS = 4;
import { CHUNK_SIZE as S, WORLD_HEIGHT as H } from './world.js';

// Faces: normal, 4 corners in CCW order (viewed from outside).
const FACES = [
  { n: [1, 0, 0], tile: 1, corners: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
  { n: [-1, 0, 0], tile: 1, corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  { n: [0, 1, 0], tile: 0, corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { n: [0, -1, 0], tile: 2, corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { n: [0, 0, 1], tile: 1, corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { n: [0, 0, -1], tile: 1, corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
];

// UVs inside a tile: [u, v] where u: 0=left..1=right and v: 0=tile bottom..1=tile top.
// Face corners are ordered bottom-left, bottom-right, top-right, top-left.
const UVS = [[0, 0], [1, 0], [1, 1], [0, 1]];
const INSET = 0.02; // avoids sampling the neighbouring tile with nearest filtering

/**
 * Builds geometry for one chunk.
 * @param {(x:number,y:number,z:number)=>number} getBlock world-space getter
 * @returns {{opaque: object, transparent: object}} arrays
 */
export function buildChunkGeometry(getBlock, cx, cz) {
  const ox = cx * S;
  const oz = cz * S;
  const opaque = { positions: [], normals: [], uvs: [], colors: [], indices: [] };
  const transparent = { positions: [], normals: [], uvs: [], colors: [], indices: [] };

  const shadeFor = (ny, y) => {
    // Fake ambient occlusion / directional light baked into vertex colours.
    const base = ny === 1 ? 0.92 : ny === -1 ? 0.5 : 0.74;
    const depth = Math.max(0, 1 - y / 80) * 0.1;
    return Math.min(1, base + depth);
  };

  for (let y = 0; y < H; y++) {
    for (let z = 0; z < S; z++) {
      for (let x = 0; x < S; x++) {
        const id = getBlock(ox + x, y, oz + z);
        if (id === ID.AIR) continue;
        const def = blockDef(id);
        const transparentBlock = !def.opaque;
        const target = transparentBlock ? transparent : opaque;

        for (let f = 0; f < 6; f++) {
          const face = FACES[f];
          const nx = ox + x + face.n[0];
          const ny = y + face.n[1];
          const nz = oz + z + face.n[2];
          const neighbour = getBlock(nx, ny, nz);

          // Skip faces fully hidden by an opaque neighbour, and internal faces
          // between two blocks of the same (transparent) kind.
          if (isOpaque(neighbour)) continue;
          if (neighbour === id) continue;

          const tile = def.tiles[face.tile];
          const tu = tile % 4;
          const tv = Math.floor(tile / 4);
          const base = target.positions.length / 3;
          const shade = shadeFor(face.n[1], y);
          for (let c = 0; c < 4; c++) {
            const corner = face.corners[c];
            target.positions.push(x + corner[0], y + corner[1], z + corner[2]);
            target.normals.push(face.n[0], face.n[1], face.n[2]);
            const uv = UVS[c];
            const u = tu + INSET + uv[0] * (1 - INSET * 2);
            const v = (ATLAS_COLS - 1 - tv) + INSET + uv[1] * (1 - INSET * 2);
            target.uvs.push(u / ATLAS_COLS, v / ATLAS_COLS);
            target.colors.push(shade, shade, shade);
          }
          target.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
        }
      }
    }
  }
  return { opaque, transparent };
}

/** Simple raycast through the voxel grid (Amanatides & Woo). */
export function raycastVoxel(origin, dir, maxDist, getBlock) {
  let x = Math.floor(origin[0]);
  let y = Math.floor(origin[1]);
  let z = Math.floor(origin[2]);
  const stepX = dir[0] > 0 ? 1 : -1;
  const stepY = dir[1] > 0 ? 1 : -1;
  const stepZ = dir[2] > 0 ? 1 : -1;
  const tDeltaX = dir[0] !== 0 ? Math.abs(1 / dir[0]) : Infinity;
  const tDeltaY = dir[1] !== 0 ? Math.abs(1 / dir[1]) : Infinity;
  const tDeltaZ = dir[2] !== 0 ? Math.abs(1 / dir[2]) : Infinity;
  const frac = (v, s) => (s > 0 ? Math.floor(v) + 1 - v : v - Math.floor(v));
  let tMaxX = dir[0] !== 0 ? frac(origin[0], stepX) * tDeltaX : Infinity;
  let tMaxY = dir[1] !== 0 ? frac(origin[1], stepY) * tDeltaY : Infinity;
  let tMaxZ = dir[2] !== 0 ? frac(origin[2], stepZ) * tDeltaZ : Infinity;
  let t = 0;
  let face = null;

  for (let i = 0; i < 512 && t <= maxDist; i++) {
    const b = getBlock(x, y, z);
    if (b !== ID.AIR && isSolid(b)) {
      return { hit: true, x, y, z, block: b, face, distance: t };
    }
    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      x += stepX; t = tMaxX; tMaxX += tDeltaX; face = [-stepX, 0, 0];
    } else if (tMaxY < tMaxZ) {
      y += stepY; t = tMaxY; tMaxY += tDeltaY; face = [0, -stepY, 0];
    } else {
      z += stepZ; t = tMaxZ; tMaxZ += tDeltaZ; face = [0, 0, -stepZ];
    }
  }
  return { hit: false };
}

/**
 * Geometry for a single block at the origin, used for the first-person
 * held-item view model (positions/uvs/normals baked from the atlas).
 */
export function buildBlockGeometry(id) {
  const def = blockDef(id);
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  for (let f = 0; f < 6; f++) {
    const face = FACES[f];
    const tile = def.tiles[face.tile];
    const tu = tile % ATLAS_COLS;
    const tv = Math.floor(tile / ATLAS_COLS);
    const base = positions.length / 3;
    for (let c = 0; c < 4; c++) {
      const corner = face.corners[c];
      positions.push(corner[0] - 0.5, corner[1] - 0.5, corner[2] - 0.5);
      normals.push(face.n[0], face.n[1], face.n[2]);
      const uv = UVS[c];
      const u = tu + INSET + uv[0] * (1 - INSET * 2);
      const v = (ATLAS_COLS - 1 - tv) + INSET + uv[1] * (1 - INSET * 2);
      uvs.push(u / ATLAS_COLS, v / ATLAS_COLS);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return { positions, normals, uvs, indices };
}
