/**
 * tilemap.js — tile grid with baked level data, visibility helpers and
 * efficient chunk rendering. The map format is the char-row format produced
 * by tools/gen-content.js (see CHAR_TO_TILE in gfx/tilegen.js).
 */
import { TILE, Tiles, CHAR_TO_TILE, TileInfo, TileSet } from '../gfx/tilegen.js';
import { clamp } from '../core/mathx.js';

/** Chunk size in tiles — matches the chunk cache in renderer.js. */
export const CHUNK = 16;

export class TileMap {
  /**
   * @param {object} level — baked level object (see tools/gen-content.js)
   */
  constructor(level) {
    this.levelId = level.id;
    this.width = level.width;
    this.height = level.height;
    this.tileSize = TILE;
    this.pixelWidth = this.width * TILE;
    this.pixelHeight = this.height * TILE;
    this.tiles = new Uint8Array(this.width * this.height);
    this.variants = new Uint8Array(this.width * this.height);
    this.visible = new Uint8Array(this.width * this.height); // fog of war: 0 unseen 1 seen 2 current
    this._dirtyChunks = new Set();
    this.loadFromRows(level.tiles);
  }

  loadFromRows(rows) {
    if (!Array.isArray(rows) || rows.length !== this.height) {
      throw new Error(`level ${this.levelId}: expected ${this.height} tile rows`);
    }
    for (let y = 0; y < this.height; y += 1) {
      const row = rows[y];
      if (typeof row !== 'string' || row.length !== this.width) {
        throw new Error(`level ${this.levelId}: row ${y} has bad length`);
      }
      for (let x = 0; x < this.width; x += 1) {
        const ch = row[x];
        const tile = CHAR_TO_TILE[ch];
        if (tile === undefined) {
          throw new Error(`level ${this.levelId}: unknown tile char "${ch}" at ${x},${y}`);
        }
        const idx = y * this.width + x;
        this.tiles[idx] = tile;
        this.variants[idx] = (x * 7 + y * 13 + this.levelId.charCodeAt(this.levelId.length - 1)) % 4;
      }
    }
    this._dirtyChunks.clear();
  }

  index(x, y) {
    return y * this.width + x;
  }

  inBounds(x, y) {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  getTile(x, y) {
    if (!this.inBounds(x, y)) return Tiles.VOID;
    return this.tiles[this.index(x, y)];
  }

  setTile(x, y, tileId) {
    if (!this.inBounds(x, y)) return false;
    const idx = this.index(x, y);
    if (this.tiles[idx] === tileId) return true;
    this.tiles[idx] = tileId;
    const cx = Math.floor(x / CHUNK);
    const cy = Math.floor(y / CHUNK);
    this._dirtyChunks.add(`${cx},${cy}`);
    return true;
  }

  getVariant(x, y) {
    return this.variants[this.index(x, y)] || 0;
  }

  isSolid(x, y) {
    const t = this.getTile(x, y);
    const info = TileInfo[t];
    return !info || info.solid;
  }

  isSolidPixel(px, py) {
    return this.isSolid(Math.floor(px / TILE), Math.floor(py / TILE));
  }

  /** Movement speed multiplier at a tile (sand drift, shallow water, …). */
  slowAt(x, y) {
    const info = TileInfo[this.getTile(x, y)];
    return info && info.slow ? info.slow : 0;
  }

  damageAt(x, y) {
    const info = TileInfo[this.getTile(x, y)];
    return info && info.damage ? info.damage : 0;
  }

  tileToPixel(tx, ty) {
    return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 };
  }

  pixelToTile(px, py) {
    return { x: Math.floor(px / TILE), y: Math.floor(py / TILE) };
  }

  /** Mark tiles seen (fog of war) inside a radius around the player. */
  reveal(px, py, radiusTiles) {
    const cx = Math.floor(px / TILE);
    const cy = Math.floor(py / TILE);
    const r = Math.ceil(radiusTiles);
    for (let y = cy - r; y <= cy + r; y += 1) {
      for (let x = cx - r; x <= cx + r; x += 1) {
        if (!this.inBounds(x, y)) continue;
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy > r * r) continue;
        const idx = this.index(x, y);
        if (this.visible[idx] < 2) this.visible[idx] = 2;
      }
    }
  }

  /** Soften "current" visibility to "seen" when the player moves away. */
  decayVisibility() {
    for (let i = 0; i < this.visible.length; i += 1) {
      if (this.visible[i] === 2) this.visible[i] = 1;
    }
  }

  isSeen(x, y) {
    return this.inBounds(x, y) && this.visible[this.index(x, y)] > 0;
  }

  /**
   * Render the visible tile window through the TileSet. Tiles at the border
   * of the camera are culled per tile; static areas can additionally be baked
   * into renderer chunk caches by the world renderer.
   */
  render(ctx, tileSet, camera, opts = {}) {
    const showFog = opts.fog === true;
    const startX = clamp(Math.floor(camera.x / TILE) - 1, 0, this.width - 1);
    const startY = clamp(Math.floor(camera.y / TILE) - 1, 0, this.height - 1);
    const endX = clamp(Math.ceil((camera.x + camera.viewW) / TILE) + 1, 0, this.width);
    const endY = clamp(Math.ceil((camera.y + camera.viewH) / TILE) + 1, 0, this.height);
    for (let y = startY; y < endY; y += 1) {
      for (let x = startX; x < endX; x += 1) {
        const idx = this.index(x, y);
        if (showFog && this.visible[idx] === 0) {
          ctx.fillStyle = '#0d0a12';
          ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
          continue;
        }
        const tileId = this.tiles[idx];
        tileSet.draw(ctx, tileId, x * TILE, y * TILE, this.variants[idx]);
        if (showFog && this.visible[idx] === 1) {
          ctx.fillStyle = 'rgba(10,6,16,0.45)';
          ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
        }
      }
    }
  }

  /**
   * BFS flood fill from (x,y) over walkable tiles — used by the generator's
   * connectivity validation and by spawn-area checks.
   */
  floodWalkable(startX, startY) {
    const seen = new Uint8Array(this.width * this.height);
    const stack = [[startX, startY]];
    let count = 0;
    while (stack.length > 0) {
      const [x, y] = stack.pop();
      if (!this.inBounds(x, y)) continue;
      const idx = this.index(x, y);
      if (seen[idx]) continue;
      if (this.isSolid(x, y)) continue;
      seen[idx] = 1;
      count += 1;
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    return { seen, count };
  }

  /** Count walkable tiles (generator sanity checks). */
  countWalkable() {
    let n = 0;
    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        if (!this.isSolid(x, y)) n += 1;
      }
    }
    return n;
  }

  /** Serialize compactly for saves (run-length encoded rows). */
  serializeTiles() {
    const rows = [];
    for (let y = 0; y < this.height; y += 1) {
      let row = '';
      for (let x = 0; x < this.width; x += 1) {
        row += this._tileToChar(this.tiles[this.index(x, y)]);
      }
      rows.push(row);
    }
    return rows;
  }

  _tileToChar(tileId) {
    for (const [ch, id] of Object.entries(CHAR_TO_TILE)) {
      if (id === tileId) return ch;
    }
    return '.';
  }

  /** Destroyable wall helper (pickaxe / explosion). */
  breakTile(x, y) {
    const t = this.getTile(x, y);
    if (t === Tiles.WALL || t === Tiles.ROCK || t === Tiles.SAND_BAG) {
      this.setTile(x, y, Tiles.SAND_DARK);
      return true;
    }
    return false;
  }
}

/**
 * Static collision queries shared by entities. Kept separate from TileMap so
 * entities can work against either a TileMap or a custom collider (tests).
 */
export class TileCollider {
  constructor(map) {
    this.map = map;
  }

  /** Axis-aligned move with tile collision (swept per-axis, no tunneling). */
  moveBox(x, y, w, h, dx, dy) {
    let nx = x + dx;
    let ny = y + dy;
    if (dx !== 0) {
      nx = this._resolveAxis(x, y, w, h, dx, 0);
    }
    if (dy !== 0) {
      ny = this._resolveAxis(x, y, w, h, 0, dy);
    }
    return { x: nx, y: ny };
  }

  _resolveAxis(x, y, w, h, dx, dy) {
    const steps = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 4) || 1;
    let cx = x;
    let cy = y;
    for (let i = 0; i < steps; i += 1) {
      const stepX = cx + dx / steps;
      const stepY = cy + dy / steps;
      if (this.boxHits(stepX, stepY, w, h)) {
        // Binary-search-free pixel creep: revert this step and stop.
        break;
      }
      cx = stepX;
      cy = stepY;
    }
    return dy === 0 ? cx : cy;
  }

  boxHits(x, y, w, h) {
    const left = Math.floor(x / TILE);
    const right = Math.floor((x + w - 0.01) / TILE);
    const top = Math.floor(y / TILE);
    const bottom = Math.floor((y + h - 0.01) / TILE);
    for (let ty = top; ty <= bottom; ty += 1) {
      for (let tx = left; tx <= right; tx += 1) {
        if (this.map.isSolid(tx, ty)) return true;
      }
    }
    return false;
  }
}
