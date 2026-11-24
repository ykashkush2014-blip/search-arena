// Stateless helpers shared by the HUD and the game loop.
import { BLOCKS } from './blocks.js';

export function formatCoords(pos) {
  return `${Math.floor(pos.x)} / ${Math.floor(pos.y)} / ${Math.floor(pos.z)}`;
}

export function biomeName(surfaceBlock) {
  switch (surfaceBlock) {
    case 4: return 'شاطئ';
    case 12: return 'قمم ثلجية';
    case 10: return 'بحيرة';
    default: return 'سهول';
  }
}

export function blockLabel(id) {
  return BLOCKS[id]?.name || '—';
}

/** Converts seconds to a short m:ss label. */
export function formatDuration(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

/** Chooses a human-friendly seed from the current time. */
export function randomSeed() {
  return (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
}

export const PHASE_LABEL = (timeOfDay) => {
  if (timeOfDay < 0.21) return 'ليل';
  if (timeOfDay < 0.32) return 'فجر';
  if (timeOfDay < 0.68) return 'نهار';
  if (timeOfDay < 0.79) return 'غروب';
  return 'ليل';
};
