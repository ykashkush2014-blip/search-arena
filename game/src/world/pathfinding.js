/**
 * pathfinding.js — A* on the tile grid plus a cheap "flow" wander helper.
 * Tuned for many concurrent enemies on weak CPUs: small open sets, typed-array
 * bookkeeping and a hard node budget per search.
 */
import { TILE } from '../gfx/tilegen.js';

const NODE_BUDGET = 1400;

class MinHeap {
  constructor() {
    this.items = [];
  }

  get size() {
    return this.items.length;
  }

  push(node) {
    const items = this.items;
    items.push(node);
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (items[parent].f <= items[i].f) break;
      const tmp = items[parent];
      items[parent] = items[i];
      items[i] = tmp;
      i = parent;
    }
  }

  pop() {
    const items = this.items;
    if (items.length === 0) return null;
    const top = items[0];
    const last = items.pop();
    if (items.length > 0) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let smallest = i;
        if (l < items.length && items[l].f < items[smallest].f) smallest = l;
        if (r < items.length && items[r].f < items[smallest].f) smallest = r;
        if (smallest === i) break;
        const tmp = items[smallest];
        items[smallest] = items[i];
        items[i] = tmp;
        i = smallest;
      }
    }
    return top;
  }
}

export class Pathfinder {
  /**
   * @param {import('./tilemap.js').TileMap} map
   */
  constructor(map) {
    this.map = map;
    this.width = map.width;
    this.height = map.height;
    this.gScore = new Float32Array(this.width * this.height);
    this.cameFrom = new Int32Array(this.width * this.height);
    this.stamp = new Int32Array(this.width * this.height);
    this._epoch = 0;
  }

  /**
   * Find a tile path from (sx,sy) to (tx,ty). Returns array of {x,y} tiles
   * (excluding start) or null. Diagonal movement allowed but corner-cutting
   * is rejected.
   */
  findPath(sx, sy, tx, ty, opts = {}) {
    if (!this.map.inBounds(sx, sy) || !this.map.inBounds(tx, ty)) return null;
    if (this.map.isSolid(tx, ty) && !opts.allowGoalSolid) return null;
    const maxNodes = opts.maxNodes ?? NODE_BUDGET;
    const w = this.width;
    const goalIdx = ty * w + tx;
    this._epoch += 1;
    const epoch = this._epoch;

    const open = new MinHeap();
    const startIdx = sy * w + sx;
    this.gScore[startIdx] = 0;
    this.cameFrom[startIdx] = -1;
    this.stamp[startIdx] = epoch;
    open.push({ idx: startIdx, x: sx, y: sy, f: heuristic(sx, sy, tx, ty) });

    let expanded = 0;
    while (open.size > 0 && expanded < maxNodes) {
      const current = open.pop();
      expanded += 1;
      if (current.idx === goalIdx) {
        return this._reconstruct(current.idx, sx, sy);
      }
      const cx = current.x;
      const cy = current.y;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const nx = cx + dx;
          const ny = cy + dy;
          if (!this.map.inBounds(nx, ny)) continue;
          const nIdx = ny * w + nx;
          const isGoal = nIdx === goalIdx;
          if (this.map.isSolid(nx, ny) && !(isGoal && opts.allowGoalSolid)) continue;
          // prevent corner cutting
          if (dx !== 0 && dy !== 0) {
            if (this.map.isSolid(cx + dx, cy) || this.map.isSolid(cx, cy + dy)) continue;
          }
          const stepCost = dx !== 0 && dy !== 0 ? 1.4142 : 1;
          const slow = this.map.slowAt(nx, ny);
          const tentative = this.gScore[current.idx] + stepCost * (1 + slow);
          if (this.stamp[nIdx] !== epoch) {
            this.stamp[nIdx] = epoch;
            this.gScore[nIdx] = Infinity;
          }
          if (tentative < this.gScore[nIdx]) {
            this.gScore[nIdx] = tentative;
            this.cameFrom[nIdx] = current.idx;
            open.push({ idx: nIdx, x: nx, y: ny, f: tentative + heuristic(nx, ny, tx, ty) });
          }
        }
      }
    }
    return null;
  }

  _reconstruct(goalIdx, sx, sy) {
    const path = [];
    let idx = goalIdx;
    let guard = 0;
    while (idx !== -1 && guard < 64 * 64) {
      const x = idx % this.width;
      const y = Math.floor(idx / this.width);
      if (x !== sx || y !== sy) path.push({ x, y });
      idx = this.cameFrom[idx];
      guard += 1;
    }
    path.reverse();
    return path;
  }

  /** Convert a tile path into pixel waypoints (tile centers). */
  toPixels(path) {
    return path.map((p) => ({ x: p.x * TILE + TILE / 2, y: p.y * TILE + TILE / 2 }));
  }

  /**
   * Line of sight between two pixels (Bresenham over solid tiles).
   * Used for aggro checks and arrow shots — much cheaper than A*.
   */
  hasLineOfSight(x1, y1, x2, y2) {
    const steps = Math.ceil(Math.hypot(x2 - x1, y2 - y1) / (TILE * 0.5)) || 1;
    for (let i = 1; i < steps; i += 1) {
      const t = i / steps;
      const px = x1 + (x2 - x1) * t;
      const py = y1 + (y2 - y1) * t;
      if (this.map.isSolidPixel(px, py)) return false;
    }
    return true;
  }

  /** Random walkable tile within radius (for wander targets). */
  randomWalkable(cx, cy, radius, rng = Math.random) {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const tx = cx + Math.floor(rng() * radius * 2) - radius;
      const ty = cy + Math.floor(rng() * radius * 2) - radius;
      if (this.map.inBounds(tx, ty) && !this.map.isSolid(tx, ty)) return { x: tx, y: ty };
    }
    return { x: cx, y: cy };
  }
}

function heuristic(x1, y1, x2, y2) {
  // Octile distance — admissible for 8-way grids.
  const dx = Math.abs(x1 - x2);
  const dy = Math.abs(y1 - y2);
  return Math.max(dx, dy) + 0.4142 * Math.min(dx, dy);
}
