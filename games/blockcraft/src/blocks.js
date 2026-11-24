// Block registry. Pure data — safe to import from node tests.

export const ID = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  SAND: 4,
  LOG: 5,
  LEAVES: 6,
  PLANKS: 7,
  BRICK: 8,
  GLASS: 9,
  WATER: 10,
  COBBLE: 11,
  SNOW: 12,
  LAMP: 13,
};

// tiles: [top, side, bottom] indices into the 4x4 texture atlas
export const BLOCKS = [
  { id: 0, name: 'هواء', color: '#000000', tiles: [0, 0, 0], solid: false, opaque: false },
  { id: 1, name: 'عشب', color: '#6fae45', tiles: [0, 1, 2], solid: true, opaque: true },
  { id: 2, name: 'تراب', color: '#8a6141', tiles: [2, 2, 2], solid: true, opaque: true },
  { id: 3, name: 'حجر', color: '#8b8b8b', tiles: [3, 3, 3], solid: true, opaque: true },
  { id: 4, name: 'رمل', color: '#e0d29a', tiles: [4, 4, 4], solid: true, opaque: true },
  { id: 5, name: 'خشب', color: '#6b4a2b', tiles: [6, 5, 6], solid: true, opaque: true },
  { id: 6, name: 'أوراق', color: '#4a8b32', tiles: [7, 7, 7], solid: true, opaque: true },
  { id: 7, name: 'ألواح', color: '#b08a4e', tiles: [8, 8, 8], solid: true, opaque: true },
  { id: 8, name: 'طوب', color: '#a8443a', tiles: [9, 9, 9], solid: true, opaque: true },
  { id: 9, name: 'زجاج', color: '#bfe6f5', tiles: [10, 10, 10], solid: true, opaque: false },
  { id: 10, name: 'ماء', color: '#3f8edc', tiles: [11, 11, 11], solid: false, opaque: false },
  { id: 11, name: 'حصى', color: '#7d7d7d', tiles: [12, 12, 12], solid: true, opaque: true },
  { id: 12, name: 'ثلج', color: '#f2f7ff', tiles: [13, 13, 13], solid: true, opaque: true },
  { id: 13, name: 'مصباح', color: '#ffd86b', tiles: [14, 14, 14], solid: true, opaque: true },
];

export const BLOCK_COUNT = BLOCKS.length;

export function blockDef(id) {
  return BLOCKS[id] || BLOCKS[0];
}

export function isSolid(id) {
  const def = BLOCKS[id];
  return !!def && def.solid;
}

export function isOpaque(id) {
  const def = BLOCKS[id];
  return !!def && def.opaque;
}

export function isTransparent(id) {
  const def = BLOCKS[id];
  return !!def && !def.opaque;
}

/** Blocks the player can put in the hotbar (water is generated only). */
export const PLACEABLE = [
  ID.GRASS, ID.DIRT, ID.STONE, ID.COBBLE, ID.SAND, ID.SNOW,
  ID.LOG, ID.PLANKS, ID.LEAVES, ID.BRICK, ID.GLASS, ID.LAMP,
];
