/**
 * collision.js — entity-level collision: circle-vs-tile resolution, entity
 * separation, hitbox overlap tests and shockwave queries. Pure math + tilemap
 * queries, no DOM — fully testable in Node.
 */
import { TILE } from '../gfx/tilegen.js';
import { dist2, clamp } from '../core/mathx.js';

/**
 * Resolve a circular body against solid tiles using axis-separated push-out.
 * Returns the corrected position and whether a wall was hit.
 */
export function resolveCircleTiles(map, x, y, radius) {
  let nx = x;
  let ny = y;
  let hit = false;
  const minX = Math.floor((x - radius) / TILE);
  const maxX = Math.floor((x + radius) / TILE);
  const minY = Math.floor((y - radius) / TILE);
  const maxY = Math.floor((y + radius) / TILE);
  for (let ty = minY; ty <= maxY; ty += 1) {
    for (let tx = minX; tx <= maxX; tx += 1) {
      if (!map.isSolid(tx, ty)) continue;
      const rectX = tx * TILE;
      const rectY = ty * TILE;
      const closestX = clamp(nx, rectX, rectX + TILE);
      const closestY = clamp(ny, rectY, rectY + TILE);
      const dx = nx - closestX;
      const dy = ny - closestY;
      const d2 = dx * dx + dy * dy;
      if (d2 < radius * radius) {
        hit = true;
        const d = Math.sqrt(d2) || 0.0001;
        const push = radius - d;
        if (d2 > 0.0001) {
          nx += (dx / d) * push;
          ny += (dy / d) * push;
        } else {
          // Center is inside the tile: push out along the smallest axis.
          const overlapLeft = nx + radius - rectX;
          const overlapRight = rectX + TILE - (nx - radius);
          const overlapTop = ny + radius - rectY;
          const overlapBottom = rectY + TILE - (ny - radius);
          const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);
          if (minOverlap === overlapLeft) nx = rectX - radius;
          else if (minOverlap === overlapRight) nx = rectX + TILE + radius;
          else if (minOverlap === overlapTop) ny = rectY - radius;
          else ny = rectY + TILE + radius;
        }
      }
    }
  }
  return { x: nx, y: ny, hit };
}

/** Soft separation between two circular bodies (equal mass). */
export function separateBodies(a, b, minDist = 12) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d2v = dx * dx + dy * dy;
  if (d2v >= minDist * minDist || d2v < 0.0001) return false;
  const d = Math.sqrt(d2v);
  const push = (minDist - d) / 2;
  const ux = dx / d;
  const uy = dy / d;
  a.x -= ux * push;
  a.y -= uy * push;
  b.x += ux * push;
  b.y += uy * push;
  return true;
}

/** Circle vs circle hit test for attacks and projectiles. */
export function circlesHit(x1, y1, r1, x2, y2, r2) {
  return dist2(x1, y1, x2, y2) <= (r1 + r2) * (r1 + r2);
}

/** AABB overlap for triggers and UI regions. */
export function aabbHit(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

/**
 * Cone attack test: is (tx,ty) inside a cone from (cx,cy) facing `dir`?
 */
export function coneHit(cx, cy, dir, arc, range, tx, ty) {
  const dx = tx - cx;
  const dy = ty - cy;
  const d2v = dx * dx + dy * dy;
  if (d2v > range * range) return false;
  const angle = Math.atan2(dy, dx);
  let diff = angle - dir;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return Math.abs(diff) <= arc / 2;
}

/**
 * Knockback impulse with tile resolution — returns the new position.
 */
export function applyKnockback(map, x, y, radius, dirX, dirY, force) {
  const steps = Math.max(1, Math.ceil(force / 4));
  let nx = x;
  let ny = y;
  for (let i = 0; i < steps; i += 1) {
    const stepX = nx + (dirX * force) / steps;
    const stepY = ny + (dirY * force) / steps;
    const resolved = resolveCircleTiles(map, stepX, stepY, radius);
    if (resolved.hit && Math.abs(resolved.x - stepX) > 1 && Math.abs(resolved.y - stepY) > 1) {
      break;
    }
    nx = resolved.x;
    ny = resolved.y;
    if (resolved.hit) break;
  }
  return { x: nx, y: ny };
}

/**
 * Spatial hash for entity queries — keeps "who is near me" O(1)-ish even with
 * dozens of entities on screen.
 */
export class SpatialHash {
  constructor(cellSize = 48) {
    this.cellSize = cellSize;
    this.cells = new Map();
  }

  clear() {
    this.cells.clear();
  }

  _key(cx, cy) {
    return cx * 4096 + cy;
  }

  insert(entity) {
    const cx = Math.floor(entity.x / this.cellSize);
    const cy = Math.floor(entity.y / this.cellSize);
    const key = this._key(cx, cy);
    let bucket = this.cells.get(key);
    if (!bucket) {
      bucket = [];
      this.cells.set(key, bucket);
    }
    bucket.push(entity);
  }

  /** All entities whose cell is within `range` pixels of (x, y). */
  query(x, y, range, out = []) {
    out.length = 0;
    const minCx = Math.floor((x - range) / this.cellSize);
    const maxCx = Math.floor((x + range) / this.cellSize);
    const minCy = Math.floor((y - range) / this.cellSize);
    const maxCy = Math.floor((y + range) / this.cellSize);
    for (let cy = minCy; cy <= maxCy; cy += 1) {
      for (let cx = minCx; cx <= maxCx; cx += 1) {
        const bucket = this.cells.get(this._key(cx, cy));
        if (bucket) {
          for (const e of bucket) out.push(e);
        }
      }
    }
    return out;
  }
}
