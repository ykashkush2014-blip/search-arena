/**
 * minimap.js — memory-light minimap built from the tilemap's visibility data.
 * Renders into a tiny offscreen canvas at low frequency (10 FPS) so it costs
 * almost nothing on weak devices.
 */
import { TILE, Tiles } from '../gfx/tilegen.js';
import { clamp } from '../core/mathx.js';

const MINIMAP_SCALE = 2; // pixels per tile on the minimap canvas

export class MiniMap {
  /**
   * @param {import('../world/tilemap.js').TileMap} map
   */
  constructor(map) {
    this.map = map;
    this.width = map.width * MINIMAP_SCALE;
    this.height = map.height * MINIMAP_SCALE;
    this.canvas = null;
    this.ctx = null;
    this.dirty = true;
    this.refreshTimer = 0;
    this.refreshRate = 0.1; // seconds
    this.detail = true;
    if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
      this.canvas = document.createElement('canvas');
      this.canvas.width = this.width;
      this.canvas.height = this.height;
      this.ctx = this.canvas.getContext('2d');
    }
  }

  markDirty() {
    this.dirty = true;
  }

  update(dt) {
    this.refreshTimer -= dt;
    if (this.refreshTimer <= 0) {
      this.refreshTimer = this.refreshRate;
      if (this.dirty || true) {
        this.rebuild();
        this.dirty = false;
      }
    }
  }

  rebuild() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const map = this.map;
    ctx.fillStyle = '#0d0a12';
    ctx.fillRect(0, 0, this.width, this.height);
    for (let y = 0; y < map.height; y += 1) {
      for (let x = 0; x < map.width; x += 1) {
        const seen = map.visible[y * map.width + x];
        if (seen === 0) continue;
        const tile = map.tiles[y * map.width + x];
        const color = MINIMAP_COLORS[tile] ?? '#3a2c48';
        ctx.fillStyle = color;
        ctx.globalAlpha = seen === 1 ? 0.55 : 1;
        ctx.fillRect(x * MINIMAP_SCALE, y * MINIMAP_SCALE, MINIMAP_SCALE, MINIMAP_SCALE);
      }
    }
    ctx.globalAlpha = 1;
  }

  /**
   * Draw the minimap into the HUD area. `entities` marks player/enemies/chests.
   */
  render(ctx, x, y, w, h, entities = [], player = null, opts = {}) {
    if (!this.canvas) return;
    const scale = Math.min(w / this.width, h / this.height);
    const drawW = this.width * scale;
    const drawH = this.height * scale;
    const dx = x + (w - drawW) / 2;
    const dy = y + (h - drawH) / 2;

    // frame
    ctx.fillStyle = 'rgba(10,6,16,0.75)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = opts.border ?? '#c9a15e';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

    ctx.drawImage(this.canvas, dx, dy, drawW, drawH);

    // entity markers (skip on LOW detail)
    if (this.detail) {
      for (const e of entities) {
        if (!e.alive) continue;
        const ex = dx + (e.x / TILE) * MINIMAP_SCALE * scale;
        const ey = dy + (e.y / TILE) * MINIMAP_SCALE * scale;
        if (ex < x || ex > x + w || ey < y || ey > y + h) continue;
        let color = '#e05548';
        let size = 2;
        if (e.kind === 'npc') { color = '#59c2a8'; size = 2; }
        else if (e.kind === 'chest') { color = '#f2c94c'; size = 2; }
        else if (e.kind === 'portal') { color = '#b267e0'; size = 3; }
        else if (e.kind === 'boss') { color = '#ff4040'; size = 3; }
        ctx.fillStyle = color;
        ctx.fillRect(ex - size / 2, ey - size / 2, size, size);
      }
    }
    if (player && player.alive) {
      const px = dx + (player.x / TILE) * MINIMAP_SCALE * scale;
      const py = dy + (player.y / TILE) * MINIMAP_SCALE * scale;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(px - 2, py - 2, 4, 4);
      ctx.fillStyle = '#5a8fe0';
      ctx.fillRect(px - 1, py - 1, 2, 2);
    }
  }

  /** Visibility completion (for the "Explorer" achievements). */
  exploredRatio() {
    let seen = 0;
    let total = 0;
    for (let i = 0; i < this.map.visible.length; i += 1) {
      if (this.map.tiles[i] === Tiles.VOID) continue;
      total += 1;
      if (this.map.visible[i] > 0) seen += 1;
    }
    return total > 0 ? clamp(seen / total, 0, 1) : 0;
  }
}

const MINIMAP_COLORS = {
  [Tiles.SAND]: '#c9a15e',
  [Tiles.SAND_DARK]: '#a8834c',
  [Tiles.STONE]: '#8a7a66',
  [Tiles.WALL]: '#4c3a56',
  [Tiles.WALL_TOP]: '#5c4a66',
  [Tiles.ROCK]: '#6e5a48',
  [Tiles.WATER]: '#3f92c4',
  [Tiles.WATER_SHALLOW]: '#63b3d8',
  [Tiles.BRIDGE]: '#8a6a42',
  [Tiles.SPIKES]: '#c25040',
  [Tiles.PLANT]: '#52a054',
  [Tiles.FLOWER]: '#c26a8c',
  [Tiles.TORCH]: '#f29a4c',
  [Tiles.DOOR]: '#8c622c',
  [Tiles.STAIRS_DOWN]: '#e8b64c',
  [Tiles.STAIRS_UP]: '#e8b64c',
  [Tiles.CHEST_MARK]: '#f2c94c',
  [Tiles.SAND_BAG]: '#b08c5c',
  [Tiles.CRYSTAL]: '#b267e0',
  [Tiles.LAVA]: '#e06a2c',
  [Tiles.ASH]: '#4a3832',
  [Tiles.SALT]: '#d8e0e8',
  [Tiles.GRASS]: '#52a054',
  [Tiles.TREE]: '#2f6f33',
  [Tiles.MARKER]: '#59c2a8',
};
