/**
 * dungeonGen.js — procedural level builder used by tools/gen-content.js to
 * bake the 40 campaign levels (and by the endless mode at runtime).
 *
 * Strategy per biome: room-and-corridor over a seeded grid, biome-specific
 * props (oasis pools, crystal clusters, lava veins, salt flats), guaranteed
 * spawn→exit connectivity and a secret alcove in most levels.
 */
import { TILE } from '../gfx/tilegen.js';

export const TILE_CHARS = {
  VOID: '#',
  WALL: '#',
  FLOOR: '.',
  FLOOR_DARK: ',',
  STONE: '=',
  WATER: 'w',
  SHALLOW: '~',
  BRIDGE: 'b',
  SPIKES: 'x',
  PLANT: 'p',
  FLOWER: 'f',
  TORCH: 'o',
  DOOR: 'd',
  STAIRS_DOWN: 'v',
  STAIRS_UP: 'u',
  CHEST: 'c',
  SANDBAG: 's',
  CRYSTAL: 'k',
  LAVA: 'L',
  ASH: 'a',
  SALT: 'l',
  GRASS: 'g',
  TREE: 't',
  MARKER: 'm',
};

/**
 * @param {object} params
 * @param {import('../core/rng.js').RNG} params.rng
 * @param {number} params.width
 * @param {number} params.height
 * @param {string} params.biome  dunes|oasis|salt|canyon|temple
 * @param {number} params.roomCount
 * @param {number} params.difficulty 0..1
 * @returns {{ tiles: string[], rooms: Array, spawn: {x,y}, exit: {x,y}, secrets: Array, props: Array, waterBlobs: Array }}
 */
export function generateLevel(params) {
  const {
    rng,
    width = 44,
    height = 32,
    biome = 'dunes',
    roomCount = 8,
    difficulty = 0.3,
  } = params;

  const grid = [];
  for (let y = 0; y < height; y += 1) {
    grid.push(new Array(width).fill(TILE_CHARS.VOID));
  }

  // ---- 1. rooms -----------------------------------------------------------
  const rooms = [];
  const maxRooms = Math.max(3, roomCount);
  for (let attempt = 0; attempt < maxRooms * 8 && rooms.length < maxRooms; attempt += 1) {
    const w = rng.int(6, 11);
    const h = rng.int(5, 9);
    const x = rng.int(1, width - w - 2);
    const y = rng.int(1, height - h - 2);
    const candidate = { x, y, w, h, cx: x + Math.floor(w / 2), cy: y + Math.floor(h / 2) };
    let overlaps = false;
    for (const room of rooms) {
      if (
        x < room.x + room.w + 2 &&
        x + w + 2 > room.x &&
        y < room.y + room.h + 2 &&
        y + h + 2 > room.y
      ) {
        overlaps = true;
        break;
      }
    }
    if (overlaps) continue;
    rooms.push(candidate);
    carveRoom(grid, candidate);
  }
  if (rooms.length < 3) {
    // Fallback: three stacked rooms so the level is always playable.
    rooms.length = 0;
    const r1 = { x: 3, y: 3, w: 10, h: 8, cx: 8, cy: 7 };
    const r2 = { x: Math.floor(width / 2) - 5, y: Math.floor(height / 2) - 4, w: 10, h: 8, cx: Math.floor(width / 2), cy: Math.floor(height / 2) };
    const r3 = { x: width - 14, y: height - 12, w: 10, h: 8, cx: width - 9, cy: height - 8 };
    for (const r of [r1, r2, r3]) {
      rooms.push(r);
      carveRoom(grid, r);
    }
  }

  // ---- 2. corridors (connect rooms in order + a few extra loops) ----------
  for (let i = 1; i < rooms.length; i += 1) {
    const a = rooms[i - 1];
    const b = rooms[i];
    carveCorridor(grid, a.cx, a.cy, b.cx, b.cy, rng);
  }
  const extraLinks = Math.max(1, Math.floor(rooms.length / 3));
  for (let i = 0; i < extraLinks; i += 1) {
    const a = rng.pick(rooms);
    const b = rng.pick(rooms);
    if (a !== b) carveCorridor(grid, a.cx, a.cy, b.cx, b.cy, rng);
  }

  // ---- 3. biome dressing --------------------------------------------------
  dressBiome(grid, rooms, biome, rng, difficulty);

  // ---- 4. borders --------------------------------------------------------
  for (let x = 0; x < width; x += 1) {
    grid[0][x] = TILE_CHARS.WALL;
    grid[height - 1][x] = TILE_CHARS.WALL;
  }
  for (let y = 0; y < height; y += 1) {
    grid[y][0] = TILE_CHARS.WALL;
    grid[y][width - 1] = TILE_CHARS.WALL;
  }

  // ---- 5. spawn & exit ---------------------------------------------------
  const spawnRoom = rooms[0];
  const exitRoom = rooms[rooms.length - 1];
  const spawn = { x: spawnRoom.cx, y: spawnRoom.cy };
  const exit = { x: exitRoom.cx, y: exitRoom.cy };
  grid[spawn.y][spawn.x] = TILE_CHARS.MARKER;
  grid[exit.y][exit.x] = TILE_CHARS.STAIRS_DOWN;

  // clear a landing pad around spawn & exit
  for (const p of [spawn, exit]) {
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const gx = p.x + dx;
        const gy = p.y + dy;
        if (gx > 0 && gy > 0 && gx < width - 1 && gy < height - 1) {
          if (grid[gy][gx] === TILE_CHARS.WATER || grid[gy][gx] === TILE_CHARS.LAVA || grid[gy][gx] === TILE_CHARS.SPIKES) {
            grid[gy][gx] = TILE_CHARS.FLOOR;
          }
        }
      }
    }
  }

  // ---- 6. secrets & props ------------------------------------------------
  const secrets = [];
  const secretRoom = rooms[Math.floor(rooms.length / 2)];
  if (secretRoom && secretRoom !== spawnRoom) {
    const sx = secretRoom.x + 1;
    const sy = secretRoom.y + 1;
    if (grid[sy] && grid[sy][sx] === TILE_CHARS.FLOOR) {
      grid[sy][sx] = TILE_CHARS.CHEST;
      secrets.push({ x: sx, y: sy, kind: 'chest' });
    }
  }

  const props = [];
  for (const room of rooms) {
    if (rng.chance(0.55)) {
      const px = rng.int(room.x + 1, room.x + room.w - 2);
      const py = rng.int(room.y + 1, room.y + room.h - 2);
      if (grid[py][px] === TILE_CHARS.FLOOR) {
        grid[py][px] = TILE_CHARS.TORCH;
        props.push({ x: px, y: py, kind: 'torch' });
      }
    }
    if (rng.chance(0.35)) {
      const px = rng.int(room.x + 1, room.x + room.w - 2);
      const py = rng.int(room.y + 1, room.y + room.h - 2);
      if (grid[py][px] === TILE_CHARS.FLOOR) {
        props.push({ x: px, y: py, kind: 'deco' });
      }
    }
  }

  // connectivity validation — BFS from spawn must reach exit
  const reachable = bfsReach(grid, spawn.x, spawn.y, width, height);
  if (!reachable.has(`${exit.x},${exit.y}`)) {
    // carve a straight rescue corridor
    carveCorridor(grid, spawn.x, spawn.y, exit.x, exit.y, rng);
  }

  const tiles = grid.map((row) => row.join(''));
  return { tiles, rooms, spawn, exit, secrets, props, width, height };
}

function carveRoom(grid, room) {
  for (let y = room.y; y < room.y + room.h; y += 1) {
    for (let x = room.x; x < room.x + room.w; x += 1) {
      grid[y][x] = TILE_CHARS.FLOOR;
    }
  }
}

function carveCorridor(grid, x1, y1, x2, y2, rng) {
  let x = x1;
  let y = y1;
  const horizontalFirst = rng.chance(0.5);
  const dig = (gx, gy) => {
    if (grid[gy] && gx > 0 && gx < grid[0].length - 1 && gy > 0 && gy < grid.length - 1) {
      if (grid[gy][gx] === TILE_CHARS.VOID) grid[gy][gx] = TILE_CHARS.FLOOR_DARK;
    }
  };
  if (horizontalFirst) {
    while (x !== x2) {
      dig(x, y);
      x += Math.sign(x2 - x);
    }
    while (y !== y2) {
      dig(x, y);
      y += Math.sign(y2 - y);
    }
  } else {
    while (y !== y2) {
      dig(x, y);
      y += Math.sign(y2 - y);
    }
    while (x !== x2) {
      dig(x, y);
      x += Math.sign(x2 - x);
    }
  }
  dig(x2, y2);
}

function dressBiome(grid, rooms, biome, rng, difficulty) {
  const height = grid.length;
  const width = grid[0].length;
  const blob = (char, count, sizeMin, sizeMax) => {
    for (let i = 0; i < count; i += 1) {
      const cx = rng.int(2, width - 3);
      const cy = rng.int(2, height - 3);
      const r = rng.int(sizeMin, sizeMax);
      for (let dy = -r; dy <= r; dy += 1) {
        for (let dx = -r; dx <= r; dx += 1) {
          if (dx * dx + dy * dy > r * r) continue;
          const gx = cx + dx;
          const gy = cy + dy;
          if (grid[gy] && grid[gy][gx] === TILE_CHARS.FLOOR) {
            grid[gy][gx] = char;
          }
        }
      }
    }
  };

  switch (biome) {
    case 'dunes': {
      blob(TILE_CHARS.FLOOR_DARK, 5 + Math.floor(difficulty * 3), 1, 3);
      blob(TILE_CHARS.PLANT, 6, 1, 1);
      blob(TILE_CHARS.FLOWER, 4, 1, 2);
      if (difficulty > 0.45) blob(TILE_CHARS.SPIKES, 2, 1, 1);
      blob(TILE_CHARS.SANDBAG, 3, 1, 1);
      break;
    }
    case 'oasis': {
      blob(TILE_CHARS.SHALLOW, 4, 1, 3);
      blob(TILE_CHARS.WATER, 2, 1, 2);
      blob(TILE_CHARS.GRASS, 8, 1, 2);
      blob(TILE_CHARS.TREE, 5, 1, 1);
      blob(TILE_CHARS.FLOWER, 5, 1, 1);
      break;
    }
    case 'salt': {
      blob(TILE_CHARS.SALT, 9, 1, 3);
      blob(TILE_CHARS.CRYSTAL, 3, 1, 1);
      if (difficulty > 0.4) blob(TILE_CHARS.SPIKES, 3, 1, 1);
      blob(TILE_CHARS.PLANT, 3, 1, 1);
      break;
    }
    case 'canyon': {
      blob(TILE_CHARS.CRYSTAL, 6, 1, 2);
      blob(TILE_CHARS.FLOOR_DARK, 6, 1, 3);
      blob(TILE_CHARS.SPIKES, 3 + Math.floor(difficulty * 3), 1, 1);
      blob(TILE_CHARS.SHALLOW, 2, 1, 2);
      break;
    }
    case 'temple': {
      blob(TILE_CHARS.ASH, 7, 1, 3);
      blob(TILE_CHARS.LAVA, 3 + Math.floor(difficulty * 3), 1, 2);
      blob(TILE_CHARS.STONE, 8, 1, 3);
      blob(TILE_CHARS.SPIKES, 3, 1, 1);
      break;
    }
    default:
      blob(TILE_CHARS.FLOOR_DARK, 4, 1, 2);
  }

  // sprinkle walkable decoration inside rooms
  for (const room of rooms) {
    for (let y = room.y + 1; y < room.y + room.h - 1; y += 1) {
      for (let x = room.x + 1; x < room.x + room.w - 1; x += 1) {
        if (grid[y][x] !== TILE_CHARS.FLOOR) continue;
        const roll = rng.next();
        if (roll < 0.02) grid[y][x] = TILE_CHARS.FLOWER;
        else if (roll < 0.035 && biome !== 'temple') grid[y][x] = TILE_CHARS.PLANT;
      }
    }
  }
}

function bfsReach(grid, sx, sy, width, height) {
  const seen = new Set();
  const stack = [[sx, sy]];
  while (stack.length > 0) {
    const [x, y] = stack.pop();
    const key = `${x},${y}`;
    if (seen.has(key)) continue;
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    const ch = grid[y][x];
    if (ch === TILE_CHARS.VOID || ch === TILE_CHARS.WALL) continue;
    seen.add(key);
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  return seen;
}

/**
 * Convert a generateLevel result into the baked level shape consumed by the
 * runtime (TileMap + entity spawn lists).
 */
export function toLevelTiles(result) {
  return result.tiles;
}

export { TILE };
