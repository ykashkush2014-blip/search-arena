/**
 * palette.js — curated color ramps for every biome, UI theme and effect.
 * All art in the game is generated from these palettes, so the whole visual
 * identity fits in a few kilobytes of code instead of texture downloads.
 */

export const PALETTE = {
  // ---- desert dunes -------------------------------------------------
  dunes: {
    sky: '#f4c77b',
    skyNight: '#241b3a',
    sand: ['#e8c489', '#dfb878', '#d6ab68', '#c99a58'],
    sandDark: '#a87c45',
    rock: '#8a6a4f',
    rockDark: '#5f4735',
    wall: '#b08c5c',
    wallDark: '#7c5f3d',
    wallTop: '#d1ab72',
    plant: '#7a9b4c',
    plantDark: '#4c6b2f',
    water: '#3f92c4',
    waterDeep: '#2a5f8f',
    waterShallow: '#63b3d8',
    shadow: 'rgba(60,36,20,0.35)',
    fog: '#e6b877',
  },
  // ---- green oasis --------------------------------------------------
  oasis: {
    sky: '#8fd4d8',
    skyNight: '#12294a',
    sand: ['#d8c793', '#cbb982', '#bfab72', '#b29c62'],
    sandDark: '#8f7b4c',
    rock: '#7d8a6a',
    rockDark: '#4f5a42',
    wall: '#9c8b62',
    wallDark: '#6c5e40',
    wallTop: '#b9a878',
    plant: '#52a054',
    plantDark: '#2f6f33',
    water: '#2fa8c9',
    waterDeep: '#1c6f92',
    waterShallow: '#68cbe0',
    shadow: 'rgba(20,50,30,0.3)',
    fog: '#a8d8c8',
  },
  // ---- salt flats ---------------------------------------------------
  salt: {
    sky: '#d9e3ef',
    skyNight: '#2b2f4a',
    sand: ['#eef1f4', '#e2e7ee', '#d5dce6', '#c6d0dd'],
    sandDark: '#9aa8b8',
    rock: '#9aa6b4',
    rockDark: '#61707f',
    wall: '#b9c4cf',
    wallDark: '#7f8d9b',
    wallTop: '#d5dee6',
    plant: '#7f9f8e',
    plantDark: '#4e6c5c',
    water: '#69a7c9',
    waterDeep: '#3d7396',
    waterShallow: '#9ecbe0',
    shadow: 'rgba(50,60,80,0.28)',
    fog: '#cfd9e4',
  },
  // ---- crystal canyons ----------------------------------------------
  canyon: {
    sky: '#c98de0',
    skyNight: '#2a1440',
    sand: ['#c078b8', '#b267aa', '#a3569b', '#91458a'],
    sandDark: '#6d2f68',
    rock: '#7c4a8a',
    rockDark: '#4c2758',
    wall: '#9a5fa8',
    wallDark: '#5f3370',
    wallTop: '#bb7fc8',
    plant: '#4fb3a8',
    plantDark: '#2c7a72',
    water: '#7a4fd8',
    waterDeep: '#4a2aa0',
    waterShallow: '#a37cec',
    shadow: 'rgba(40,10,60,0.35)',
    fog: '#b28fd0',
  },
  // ---- ember temple --------------------------------------------------
  temple: {
    sky: '#5c2c2c',
    skyNight: '#1c0d14',
    sand: ['#7a4a3a', '#6c3f31', '#5e3428', '#50291f'],
    sandDark: '#381c14',
    rock: '#5c3830',
    rockDark: '#301a14',
    wall: '#7c4a38',
    wallDark: '#462519',
    wallTop: '#9c6248',
    plant: '#c26a3c',
    plantDark: '#8c4222',
    water: '#e06a2c',
    waterDeep: '#a03c12',
    waterShallow: '#f29a4c',
    shadow: 'rgba(20,5,5,0.4)',
    fog: '#8c4632',
  },
};

export const UI_THEME = {
  bg: '#17111f',
  panel: '#241b30',
  panelLight: '#332745',
  border: '#c9a15e',
  borderDark: '#6e5230',
  text: '#f5e9d0',
  textDim: '#b8a888',
  textDark: '#241b30',
  accent: '#e8b64c',
  accentAlt: '#59c2a8',
  danger: '#e05548',
  good: '#63c76a',
  mana: '#5a8fe0',
  hp: '#e05548',
  hpBack: '#4a2020',
  xp: '#c9a15e',
  xpBack: '#3a2c18',
  gold: '#f2c94c',
  shadow: 'rgba(0,0,0,0.55)',
  overlay: 'rgba(10,6,16,0.72)',
};

export const RARITY = {
  common: { label: { en: 'Common', ar: 'شائع' }, color: '#cfcfcf' },
  uncommon: { label: { en: 'Uncommon', ar: 'غير شائع' }, color: '#63c76a' },
  rare: { label: { en: 'Rare', ar: 'نادر' }, color: '#5a8fe0' },
  epic: { label: { en: 'Epic', ar: 'ملحمي' }, color: '#b267e0' },
  legendary: { label: { en: 'Legendary', ar: 'أسطوري' }, color: '#e8b64c' },
};

export const DAMAGE_COLORS = {
  physical: '#f5e9d0',
  fire: '#f29a4c',
  sand: '#e8c489',
  magic: '#b267e0',
  heal: '#63c76a',
  crit: '#ffd24c',
  true: '#ffffff',
};

/** Day/night tint lerp targets (applied as full-screen tint). */
export const TIME_TINTS = {
  dawn: { color: '#ffb070', alpha: 0.12 },
  day: { color: '#ffffff', alpha: 0 },
  dusk: { color: '#ff7a4c', alpha: 0.18 },
  night: { color: '#20204a', alpha: 0.34 },
};

export function shade(hex, amount) {
  // amount -1..1 — darken/lighten a hex color.
  let h = hex.startsWith('#') ? hex.slice(1) : hex;
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  if (amount >= 0) {
    r += (255 - r) * amount;
    g += (255 - g) * amount;
    b += (255 - b) * amount;
  } else {
    r *= 1 + amount;
    g *= 1 + amount;
    b *= 1 + amount;
  }
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
}

export function mix(hexA, hexB, t) {
  const a = parse(hexA);
  const b = parse(hexB);
  const r = Math.round(a.r + (b.r - a.r) * t);
  const g = Math.round(a.g + (b.g - a.g) * t);
  const bl = Math.round(a.b + (b.b - a.b) * t);
  return `rgb(${r},${g},${bl})`;
}

function parse(hex) {
  let h = hex.startsWith('#') ? hex.slice(1) : hex;
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
