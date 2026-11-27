// Canvas renderer. Draws the political map as chunky pixels (batched per
// scanline), plus country borders, ruins, capitals, buildings, missiles,
// explosions, attack fronts and labels. Deliberately avoids per-cell fillRect
// calls so a 1.8M-cell map stays smooth.
import { BUILDING_BY_KEY } from "./data.js";
import { getLang } from "./i18n.js";

const OCEAN_DEEP = [13, 24, 39];
const OCEAN_SHALLOW = [26, 50, 76];
const OFFMAP_LAND = [40, 45, 54];
const RUIN_COLOR = [104, 88, 68];
const DEAD_LAND = [40, 40, 46];

export class Renderer {
  constructor(canvas, world, game) {
    this.canvas = canvas;
    // Shift+drag build rectangle: two corner cells, or null when idle.
    this.area = null;
    this.ctx = canvas.getContext("2d", { alpha: false });
    this.world = world;
    this.game = game;
    this.cam = { x: 0, y: 0, zoom: 3 };
    this.cellBuf = new Uint8Array(world.size * 4);
    this.oceanBuf = new Uint8Array(world.size * 4);
    this.mapCanvas = document.createElement("canvas");
    this.mapCtx = this.mapCanvas.getContext("2d");
    this.baseCanvas = document.createElement("canvas");
    this.bctx = this.baseCanvas.getContext("2d", { alpha: false });
    this.baseKey = "";
    this.baseOwn = -1;
    this.bufVersion = -1;
    this.showBuildings = true;
    this.dirty = true;
    this.highlight = null;
    this.selected = null;
    this.hoverCell = -1;
    this.brush = null;
    this.brushOk = true;
    this.labels = true;
    this.mode = "paint";
    this.strikeKind = "missile";
    this.dpr = 1;
    this.resize();
    this.buildOcean();
  }

  setGame(game) {
    this.game = game;
    this.world = game.world;
    this.cellBuf = new Uint8Array(game.world.size * 4);
    this.buildOcean();
    this.bufVersion = -1;
    this.bufWar = undefined;
    this.baseOwn = -1;
    this.baseKey = "";
    this.mmCanvas = null;
    this.dirty = true;
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(320, Math.floor(rect.width || 800));
    const h = Math.max(240, Math.floor(rect.height || 600));
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.floor(w * this.dpr);
    this.canvas.height = Math.floor(h * this.dpr);
    this.viewW = w;
    this.viewH = h;
    this.ctx.imageSmoothingEnabled = false;
    this.baseCanvas.width = this.canvas.width;
    this.baseCanvas.height = this.canvas.height;
    this.baseKey = "";
    this.dirty = true;
  }

  // ------------------------------------------------------------- camera ----

  maxZoom() {
    return 16;
  }

  minZoom() {
    return Math.max(0.6, Math.min(this.viewW / this.world.w, this.viewH / this.world.h) * 0.9);
  }

  fitTo(bounds, pad = 0.94) {
    const bw = bounds.x1 - bounds.x0 + 1;
    const bh = bounds.y1 - bounds.y0 + 1;
    const zoom = Math.min((this.viewW * pad) / bw, (this.viewH * pad) / bh);
    this.cam.zoom = Math.max(this.minZoom(), Math.min(this.maxZoom(), zoom));
    this.cam.x = bounds.x0 + bw / 2 - this.viewW / (2 * this.cam.zoom);
    this.cam.y = bounds.y0 + bh / 2 - this.viewH / (2 * this.cam.zoom);
    this.clampCam();
    this.dirty = true;
  }

  centerOn(cx, cy) {
    this.cam.x = cx - this.viewW / (2 * this.cam.zoom);
    this.cam.y = cy - this.viewH / (2 * this.cam.zoom);
    this.clampCam();
    this.dirty = true;
  }

  clampCam() {
    const { w, h } = this.world;
    const vw = this.viewW / this.cam.zoom;
    const vh = this.viewH / this.cam.zoom;
    const padX = Math.min(w * 0.6, vw * 0.3);
    const padY = Math.min(h * 0.6, vh * 0.3);
    if (vw >= w + padX * 2) this.cam.x = (w - vw) / 2;
    else this.cam.x = Math.min(w - vw + padX, Math.max(-padX, this.cam.x));
    if (vh >= h + padY * 2) this.cam.y = (h - vh) / 2;
    else this.cam.y = Math.min(h - vh + padY, Math.max(-padY, this.cam.y));
    this.dirty = true;
  }

  zoomAt(sx, sy, factor) {
    const before = this.screenToWorld(sx, sy);
    this.cam.zoom = Math.max(this.minZoom(), Math.min(this.maxZoom(), this.cam.zoom * factor));
    const after = this.screenToWorld(sx, sy);
    this.cam.x += before.x - after.x;
    this.cam.y += before.y - after.y;
    this.clampCam();
  }

  panBy(dx, dy) {
    this.cam.x += dx;
    this.cam.y += dy;
    this.clampCam();
  }

  screenToWorld(sx, sy) {
    return { x: this.cam.x + sx / this.cam.zoom, y: this.cam.y + sy / this.cam.zoom };
  }

  worldToScreen(wx, wy) {
    return { x: (wx - this.cam.x) * this.cam.zoom, y: (wy - this.cam.y) * this.cam.zoom };
  }

  cellToScreen(i) {
    const w = this.world.w;
    return this.worldToScreen(i % w, (i / w) | 0);
  }

  screenToCell(sx, sy) {
    const p = this.screenToWorld(sx, sy);
    return this.cellAt(p.x, p.y);
  }

  cellAt(wx, wy) {
    const x = Math.floor(wx);
    const y = Math.floor(wy);
    if (x < 0 || y < 0 || x >= this.world.w || y >= this.world.h) return -1;
    return y * this.world.w + x;
  }

  // ------------------------------------------------------------- buffers ---

  buildOcean() {
    const { w, h } = this.world;
    const buf = this.oceanBuf;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const n = Math.sin(x * 0.021) * Math.cos(y * 0.017) + Math.sin((x + y * 1.3) * 0.008) * 0.8;
        const t = Math.max(0, Math.min(1, 0.5 + n * 0.34 - (y / h) * 0.25));
        const o = (y * w + x) * 4;
        buf[o] = OCEAN_DEEP[0] + (OCEAN_SHALLOW[0] - OCEAN_DEEP[0]) * t;
        buf[o + 1] = OCEAN_DEEP[1] + (OCEAN_SHALLOW[1] - OCEAN_DEEP[1]) * t;
        buf[o + 2] = OCEAN_DEEP[2] + (OCEAN_SHALLOW[2] - OCEAN_DEEP[2]) * t;
        buf[o + 3] = 255;
        if ((x & 7) === 0 || (y & 7) === 0) {
          buf[o] += 2;
          buf[o + 1] += 3;
          buf[o + 2] += 4;
        }
      }
    }
  }

  // Full recompute of the colour buffer (only on load / era change).
  fullBuffer() {
    const { world, game } = this;
    const { w, h, owner } = world;
    for (let i = 0; i < w * h; i++) this.paintCell(i);
    this.bufVersion = game.ownerVersion || 0;
    this.dirty = true;
    this.bh = h;
    void owner;
  }

  // Colour a single cell into the buffer (shared by full & incremental paths).
  paintCell(i) {
    const { world, game } = this;
    const o = world.owner[i];
    const buf = this.cellBuf;
    const b = i * 4;
    buf[b + 3] = 255;
    if (o === -1) {
      buf[b] = this.oceanBuf[b];
      buf[b + 1] = this.oceanBuf[b + 1];
      buf[b + 2] = this.oceanBuf[b + 2];
      return;
    }
    if (o === -2) {
      buf[b] = RUIN_COLOR[0];
      buf[b + 1] = RUIN_COLOR[1];
      buf[b + 2] = RUIN_COLOR[2];
      return;
    }
    if (o === -3) {
      buf[b] = OFFMAP_LAND[0];
      buf[b + 1] = OFFMAP_LAND[1];
      buf[b + 2] = OFFMAP_LAND[2];
      return;
    }
    const n = game.nations.get(o);
    if (!n || !n.alive) {
      buf[b] = DEAD_LAND[0];
      buf[b + 1] = DEAD_LAND[1];
      buf[b + 2] = DEAD_LAND[2];
      return;
    }
    const col = (n.def || world.countries[o]).color;
    const sh = world.shade[i] * 0.01;
    let r = col.r * sh;
    let g = col.g * sh;
    let bl = col.b * sh;
    // Bake the border into the pixels: cells that touch another nation (or the
    // sea) get a darker rim, and war fronts glow red. This keeps the map
    // crunchy and pixel-perfect at every zoom level with zero line artefacts.
    const w2 = world.w;
    const x = i % w2;
    const y = (i / w2) | 0;
    let edge = 0;
    let war = false;
    const chk = (j) => {
      const o2 = world.owner[j];
      if (o2 === o) return;
      edge = 1;
      if (o2 >= 0 && n.war && n.war.has(o2)) war = true;
    };
    if (x > 0) chk(i - 1);
    if (x < w2 - 1) chk(i + 1);
    if (y > 0) chk(i - w2);
    if (y < world.h - 1) chk(i + w2);
    if (edge) {
      if (war) {
        r = r * 0.55 + 190 * 0.45;
        g = g * 0.55 + 40 * 0.45;
        bl = bl * 0.55 + 36 * 0.45;
      } else {
        r *= 0.66;
        g *= 0.66;
        bl *= 0.7;
      }
    }
    buf[b] = Math.min(255, r);
    buf[b + 1] = Math.min(255, g);
    buf[b + 2] = Math.min(255, bl);
  }

  // Repaint only the cells that changed since the last frame.
  applyDirty() {
    const game = this.game;
    const list = game.dirtyCells;
    if (this.bufRepaint !== game.fullRepaint) {
      this.bufRepaint = game.fullRepaint;
      this.bufWar = game.warVersion;
      this.fullBuffer();
      if (list) list.length = 0;
      return;
    }
    if (this.bufWar !== game.warVersion) {
      this.bufWar = game.warVersion;
      this.fullBuffer();
      if (list) list.length = 0;
      return;
    }
    if (this.bufVersion === undefined || this.bufVersion < 0) {
      this.fullBuffer();
      if (list) list.length = 0;
      return;
    }
    if (!list || !list.length) {
      this.bufVersion = game.ownerVersion || 0;
      return;
    }
    const w = this.world.w;
    const h = this.world.h;
    const seen = this._seen || (this._seen = new Set());
    seen.clear();
    for (let k = 0; k < list.length; k++) {
      const i = list[k];
      if (seen.has(i)) continue;
      seen.add(i);
      this.paintCell(i);
      const x = i % w;
      const y = (i / w) | 0;
      // neighbours too, so coastlines and thin borders repaint correctly
      if (x > 0) this.paintCell(i - 1);
      if (x < w - 1) this.paintCell(i + 1);
      if (y > 0) this.paintCell(i - w);
      if (y < h - 1) this.paintCell(i + w);
    }
    list.length = 0;
    this.bufVersion = game.ownerVersion || 0;
  }

  drawMap(ctx) {
    if (!ctx) ctx = this.ctx;
    const world = this.world;
    const w = world.w;
    const zoom = this.cam.zoom;
    const camX = this.cam.x;
    const camY = this.cam.y;

    this.applyDirty();

    const firstCol = Math.max(0, Math.floor(camX) - 1);
    const lastCol = Math.min(w - 1, Math.ceil(camX + this.viewW / zoom) + 1);
    const firstRow = Math.max(0, Math.floor(camY) - 1);
    const lastRow = Math.min(world.h - 1, Math.ceil(camY + this.viewH / zoom) + 1);
    const cols = lastCol - firstCol + 1;
    const rows = lastRow - firstRow + 1;
    if (cols <= 0 || rows <= 0) return;

    if (this.mapCanvas.width !== cols || this.mapCanvas.height !== rows) {
      this.mapCanvas.width = cols;
      this.mapCanvas.height = rows;
    }
    const img = this.mapCtx.createImageData(cols, rows);
    const data = img.data;
    const src = this.cellBuf;
    const { coast, owner } = world;
    for (let y = 0; y < rows; y++) {
      const rowStart = (firstRow + y) * w + firstCol;
      let si = rowStart * 4;
      let di = y * cols * 4;
      for (let x = 0; x < cols; x++) {
        let r = src[si];
        let g = src[si + 1];
        let bl = src[si + 2];
        const i = rowStart + x;
        if (coast[i] && owner[i] >= 0) {
          r = Math.min(255, r * 1.1 + 13);
          g = Math.min(255, g * 1.12 + 14);
          bl = Math.min(255, bl * 1.05 + 12);
        }
        data[di] = r;
        data[di + 1] = g;
        data[di + 2] = bl;
        data[di + 3] = 255;
        si += 4;
        di += 4;
      }
    }
    this.mapCtx.putImageData(img, 0, 0);

    ctx.imageSmoothingEnabled = false;
    const dx = (firstCol - camX) * zoom;
    const dy = (firstRow - camY) * zoom;
    const snap = this.dpr;
    const sdx = Math.round(dx * snap) / snap;
    const sdy = Math.round(dy * snap) / snap;
    ctx.drawImage(this.mapCanvas, 0, 0, cols, rows, sdx, sdy, cols * zoom, rows * zoom);
  }

  // ------------------------------------------------------------- borders ---

  drawBorders(ctx) {
    if (!ctx) ctx = this.ctx;
    const { world, game } = this;
    const { w, h, owner } = world;
    const zoom = this.cam.zoom;
    if (zoom < 1.05) return;
    const firstCol = Math.max(1, Math.floor(this.cam.x) - 1);
    const lastCol = Math.min(w - 2, Math.ceil(this.cam.x + this.viewW / zoom) + 1);
    const firstRow = Math.max(1, Math.floor(this.cam.y) - 1);
    const lastRow = Math.min(h - 2, Math.ceil(this.cam.y + this.viewH / zoom) + 1);
    ctx.lineWidth = zoom > 6 ? 1.4 : 1;
    ctx.setLineDash([]);

    const buckets = new Map();
    const push = (color, x1, y1, x2, y2) => {
      let arr = buckets.get(color);
      if (!arr) buckets.set(color, (arr = []));
      arr.push(x1, y1, x2, y2);
    };
    const atWar = new Set();
    for (const n of game.nations.values()) {
      for (const id of n.war) {
        atWar.add(n.id < id ? n.id + ":" + id : id + ":" + n.id);
      }
    }
    const sad = (a, b) => (a < b ? a + ":" + b : b + ":" + a);

    for (let y = firstRow; y <= lastRow; y++) {
      for (let x = firstCol; x <= lastCol; x++) {
        const i = y * w + x;
        const o = owner[i];
        const r = owner[i + 1];
        if (o !== r) {
          let color = "rgba(10,12,18,0.72)";
          if (o >= 0 && r >= 0 && atWar.has(sad(o, r))) color = "rgba(255,96,86,0.95)";
          else if (o === -2 || r === -2) color = "rgba(60,46,34,0.45)";
          push(color, x + 1, y, x + 1, y + 1);
        }
        const d = owner[i + w];
        if (o !== d) {
          let color = "rgba(10,12,18,0.72)";
          if (o >= 0 && d >= 0 && atWar.has(sad(o, d))) color = "rgba(255,96,86,0.95)";
          else if (o === -2 || d === -2) color = "rgba(60,46,34,0.45)";
          push(color, x, y + 1, x + 1, y + 1);
        }
      }
    }
    const camX = this.cam.x;
    const camY = this.cam.y;
    for (const [color, arr] of buckets) {
      ctx.strokeStyle = color;
      ctx.beginPath();
      for (let k = 0; k < arr.length; k += 4) {
        ctx.moveTo((arr[k] - camX) * zoom, (arr[k + 1] - camY) * zoom);
        ctx.lineTo((arr[k + 2] - camX) * zoom, (arr[k + 3] - camY) * zoom);
      }
      ctx.stroke();
    }
  }

  // ------------------------------------------------------------- overlays ---

  drawOverlay() {
    const ctx = this.ctx;
    const game = this.game;
    const zoom = this.cam.zoom;

    // selected / hovered country ring at its capital
    const id = this.selected != null ? this.selected : this.highlight;
    if (id != null) {
      const n = game.byId[id];
      if (n && n.alive && n.capital >= 0) {
        const s = this.cellToScreen(n.capital);
        ctx.save();
        ctx.globalAlpha = 0.25 + Math.sin(game.time * 3) * 0.08;
        ctx.strokeStyle = "#ffe9a8";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 22, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    this.drawBuildings(ctx, zoom);
    this.drawCapitals(ctx, zoom);
    this.drawAttacks(ctx, zoom);
    this.drawStrikes(ctx, zoom);
    if (this.brush && this.hoverCell >= 0) this.drawBrush(ctx, zoom);
    if (this.area) this.drawArea(ctx, zoom);
    if (this.labels && zoom > 1.5) this.drawLabels(ctx, zoom);
  }

  drawBuildings(ctx, zoom) {
    if (zoom < 1.15) return;
    const { game } = this;
    const lod = zoom >= 2.4;
    const w = this.world.w;
    for (const n of game.nations.values()) {
      if (!n.alive) continue;
      for (const b of n.buildings) {
        const x = ((b.cell % w) - this.cam.x) * zoom;
        const y = (((b.cell / w) | 0) - this.cam.y) * zoom;
        if (x < -30 || y < -30 || x > this.viewW + 30 || y > this.viewH + 30) continue;
        this.drawIcon(ctx, b, x, y, zoom, lod);
      }
    }
  }

  drawIcon(ctx, b, x, y, size, lod) {
    const def = BUILDING_BY_KEY[b.key];
    if (!def) return;
    const s = Math.max(4, size * 0.92);
    const h = s / 2;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "rgba(8,10,16,0.55)";
    ctx.fillRect(-h - 0.5, -h - 0.5, s + 1, s + 1);
    ctx.fillStyle = def.color;
    if (!lod) {
      ctx.fillRect(-h * 0.55, -h * 0.55, s * 0.55, s * 0.55);
      ctx.restore();
      return;
    }
    const u = s / 8;
    switch (b.key) {
      case "city":
        ctx.fillRect(-h, -h * 0.3, s * 0.42, s * 0.8);
        ctx.fillRect(-h * 0.1, -h * 0.8, s * 0.34, s * 0.8);
        ctx.fillRect(h * 0.4, -h * 0.1, s * 0.34, s * 0.6);
        break;
      case "factory":
        ctx.fillRect(-h, -h * 0.15, s, s * 0.65);
        ctx.beginPath();
        ctx.moveTo(-h, -h * 0.15);
        ctx.lineTo(-h * 0.1, -h * 0.8);
        ctx.lineTo(-h * 0.1, -h * 0.15);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#d8d8d8";
        ctx.fillRect(h * 0.45, -h * 1.05, u, s * 0.42);
        break;
      case "lab":
        ctx.fillRect(-h, -h * 0.25, s, s * 0.7);
        ctx.beginPath();
        ctx.arc(0, -h * 0.4, s * 0.3, Math.PI, 0);
        ctx.fill();
        ctx.fillStyle = "#e6fbff";
        ctx.fillRect(-u * 0.6, -h * 0.75, u * 1.2, u * 1.2);
        break;
      case "port":
        ctx.fillRect(-h, -h * 0.05, s * 0.3, s * 0.65);
        ctx.fillRect(-h * 0.7, -h * 0.05, s * 0.85, u);
        ctx.fillStyle = "#eef4ff";
        ctx.beginPath();
        ctx.moveTo(h * 0.05, -h * 0.1);
        ctx.lineTo(h * 0.05, -h * 1.0);
        ctx.lineTo(h * 0.85, -h * 0.35);
        ctx.closePath();
        ctx.fill();
        break;
      case "base":
        ctx.beginPath();
        ctx.moveTo(0, -h);
        ctx.lineTo(h, h * 0.6);
        ctx.lineTo(-h, h * 0.6);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#243320";
        ctx.fillRect(-u * 0.6, -h * 0.05, u * 1.2, u * 1.2);
        break;
      case "bunker":
        ctx.beginPath();
        ctx.arc(0, h * 0.15, h * 0.95, Math.PI, 0);
        ctx.fill();
        ctx.fillStyle = "#333a44";
        ctx.fillRect(-u * 1.3, h * 0.1, u * 2.6, u);
        break;
      case "silo":
        ctx.beginPath();
        ctx.ellipse(0, h * 0.15, h * 0.9, h * 0.42, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#f0e6d0";
        ctx.beginPath();
        ctx.moveTo(-u, h * 0.15);
        ctx.lineTo(0, -h * 1.1);
        ctx.lineTo(u, h * 0.15);
        ctx.closePath();
        ctx.fill();
        break;
      case "aa":
        ctx.fillRect(-h, h * 0.15, s, u * 1.6);
        ctx.fillRect(-u * 0.7, -h * 0.4, u * 1.4, s * 0.6);
        ctx.fillStyle = "#f8f4ff";
        ctx.fillRect(-u * 1.3, -h * 0.5, u * 2.6, u);
        break;
      default:
        ctx.fillRect(-h * 0.55, -h * 0.55, s * 0.55, s * 0.55);
    }
    if (b.cd > 0) {
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      ctx.fillRect(-h, h * 0.8, s, u * 0.7);
      ctx.fillStyle = "#ffb85c";
      ctx.fillRect(-h, h * 0.8, s * (1 - Math.min(1, b.cd / 26)), u * 0.7);
    } else if (b.level > 1) {
      ctx.fillStyle = "#ffd97a";
      for (let i = 0; i < b.level; i++) ctx.fillRect(-h + i * (u * 1.15), h * 0.75, u * 0.85, u * 0.85);
    }
    ctx.restore();
  }

  drawCapitals(ctx, zoom) {
    if (zoom < 0.9) return;
    const { game } = this;
    const w = this.world.w;
    for (const n of game.nations.values()) {
      if (!n.alive || n.capital < 0) continue;
      const x = ((n.capital % w) - this.cam.x) * zoom;
      const y = (((n.capital / w) | 0) - this.cam.y) * zoom;
      if (x < -40 || y < -40 || x > this.viewW + 40 || y > this.viewH + 40) continue;
      const size = Math.max(3.5, Math.min(9, zoom * 1.9));
      ctx.save();
      ctx.translate(x, y - size * 0.7);
      ctx.fillStyle = n.isPlayer ? "#ffe9a8" : "rgba(14,16,22,0.85)";
      ctx.strokeStyle = n.isPlayer ? "#7a5410" : "#f2e6c4";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let k = 0; k < 5; k++) {
        const a = -Math.PI / 2 + (k * 4 * Math.PI) / 5;
        const xx = Math.cos(a) * size;
        const yy = Math.sin(a) * size;
        if (k === 0) ctx.moveTo(xx, yy);
        else ctx.lineTo(xx, yy);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  drawAttacks(ctx, zoom) {
    const { game } = this;
    const w = this.world.w;
    // Any AI-vs-AI offensive near the camera is drawn, not just the ones that
    // touch the player. The whole point of a world war is that you can see it:
    // the old rule hid every other nation's fighting unless you happened to
    // zoom past 1.6×, so a map with 160 AI wars in it looked completely dead.
    // Near = inside the visible frame plus a margin, measured in world cells for
    // the current zoom. The margin is generous (a full screen in each direction)
    // so a war one pan away is already drawn instead of popping in.
    const viewCellsX = (this.canvas.width || 1200) / zoom;
    const viewCellsY = (this.canvas.height || 700) / zoom;
    const near = (cell) => {
      const x = cell % w;
      const y = (cell / w) | 0;
      return Math.abs(x - this.cam.x) < viewCellsX * 1.5 && Math.abs(y - this.cam.y) < viewCellsY * 1.5;
    };
    for (const a of game.attacks) {
      if (!a.active) continue;
      const involved = a.attacker.isPlayer || a.defender.isPlayer;
      if (!involved) {
        if (zoom < 0.85) continue;
        const shown = (a.fronts.length ? a.fronts : [a.landingAt || -1]).some((c) => c >= 0 && near(c));
        const home = a.attacker.capital != null && a.attacker.capital >= 0 ? near(a.attacker.capital) : false;
        if (!shown && !home) continue;
      }
      const targets = a.fronts;
      if (a.naval) {
        // The fleet follows the water route the simulation computed, so the
        // ships visibly go around continents instead of flying over them.
        const route = a.route;
        if (!route || route.length < 2) continue;
        const mine = a.attacker.isPlayer;
        const atSea = !a.landed;
        const sx = (c) => (c % w) - this.cam.x;
        const sy = (c) => ((c / w) | 0) - this.cam.y;
        ctx.save();
        // the sailed path, faint: it shows the route without shouting
        ctx.globalAlpha = atSea ? 0.42 : 0.16;
        ctx.strokeStyle = mine ? "#8fe3ff" : "#ff9d8f";
        ctx.lineWidth = Math.max(1, zoom * 0.22);
        ctx.setLineDash([5, 6]);
        ctx.beginPath();
        for (let i = 0; i < route.length; i += 2) {
          const px = sx(route[i]) * zoom;
          const py = sy(route[i]) * zoom;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
        ctx.setLineDash([]);

        if (atSea && a.crossing > 0) {
          // position along the polyline, 0 at the port and 1 at the beach
          const t = Math.min(1, Math.max(0, 1 - a.landingTimer / a.crossing));
          const at = (k) => {
            const idx = Math.min(route.length - 1, Math.max(0, k * (route.length - 1)));
            const i0 = Math.floor(idx);
            const i1 = Math.min(route.length - 1, i0 + 1);
            const f = idx - i0;
            const c0 = route[i0];
            const c1 = route[i1];
            return {
              x: (sx(c0) + (sx(c1) - sx(c0)) * f) * zoom,
              y: (sy(c0) + (sy(c1) - sy(c0)) * f) * zoom,
            };
          };
          // a small convoy, spaced back along the route
          for (let i = 0; i < 3; i++) {
            const k = Math.max(0, t - i * 0.035);
            const p0 = at(k);
            const p1 = at(Math.min(1, k + 0.01));
            const ang = Math.atan2(p1.y - p0.y, p1.x - p0.x);
            const s2 = Math.max(3, Math.min(9, zoom * 0.7));
            ctx.save();
            ctx.translate(p0.x, p0.y);
            ctx.rotate(ang);
            // hull
            ctx.fillStyle = i === 0 ? "#ffffff" : "rgba(220,240,255,0.85)";
            ctx.beginPath();
            ctx.moveTo(s2 * 0.6, 0);
            ctx.lineTo(-s2 * 0.5, s2 * 0.34);
            ctx.lineTo(-s2 * 0.3, 0);
            ctx.lineTo(-s2 * 0.5, -s2 * 0.34);
            ctx.closePath();
            ctx.fill();
            // wake
            ctx.strokeStyle = "rgba(160,220,255,0.55)";
            ctx.lineWidth = Math.max(1, s2 * 0.12);
            ctx.beginPath();
            ctx.moveTo(-s2 * 0.55, 0);
            ctx.lineTo(-s2 * 1.4, 0);
            ctx.stroke();
            ctx.restore();
          }
          // the destination pulses while the fleet is still at sea
          const endP = at(1);
          ctx.globalAlpha = 0.4 + 0.4 * Math.sin(game.time * 5);
          ctx.strokeStyle = mine ? "#8fe3ff" : "#ff9d8f";
          ctx.lineWidth = Math.max(1, zoom * 0.18);
          ctx.beginPath();
          ctx.arc(endP.x, endP.y, Math.max(4, zoom * 0.8), 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
        continue;
      }
      if (!targets.length) continue;
      // An attack used to be a scatter of static dots, which reads as "dirt" at
      // a glance: the map looked exactly the same whether a war was raging or
      // not. Two cues fix that — a short arrow travelling from the staging cell
      // into the front, and a pulse on the front itself — so combat is legible
      // without opening a panel.
      const mine = a.attacker.isPlayer;
      const hue = mine ? "255,235,150" : "255,120,110";
      const n = Math.min(involved ? 26 : 6, targets.length);
      const phase = (game.time * 14) | 0;
      const size = Math.max(1.5, zoom * 0.4);
      const pulse = 0.5 + 0.5 * Math.sin(game.time * 6 + a.seed);
      for (let k = 0; k < n; k++) {
        const pair = targets[(k * 61 + phase) % targets.length];
        const from = pair[0];
        const cell = pair[1];
        const x = ((cell % w) - this.cam.x) * zoom;
        const y = (((cell / w) | 0) - this.cam.y) * zoom;
        if (x < -10 || y < -10 || x > this.viewW + 10 || y > this.viewH + 10) continue;

        // Arrow: from the staging cell towards the front, animated along its
        // length so several arrows visibly march at once.
        const fx = ((from % w) - this.cam.x) * zoom;
        const fy = (((from / w) | 0) - this.cam.y) * zoom;
        if (Math.abs(x - fx) + Math.abs(y - fy) > 4) {
          const t = ((game.time * 1.6 + (k % 7) / 7) % 1);
          const hx = fx + (x - fx) * t;
          const hy = fy + (y - fy) * t;
          const ang = Math.atan2(y - fy, x - fx);
          const len = Math.max(4, Math.min(16, Math.hypot(x - fx, y - fy) * 0.28));
          ctx.save();
          ctx.strokeStyle = `rgba(${hue},${0.35 + 0.45 * t})`;
          ctx.fillStyle = `rgba(${hue},${0.45 + 0.5 * t})`;
          ctx.lineWidth = Math.max(1, zoom * 0.22);
          // shaft
          ctx.beginPath();
          ctx.moveTo(hx - Math.cos(ang) * len, hy - Math.sin(ang) * len);
          ctx.lineTo(hx, hy);
          ctx.stroke();
          // head
          ctx.beginPath();
          ctx.moveTo(hx, hy);
          ctx.lineTo(hx - Math.cos(ang - 0.5) * len * 0.55, hy - Math.sin(ang - 0.5) * len * 0.55);
          ctx.lineTo(hx - Math.cos(ang + 0.5) * len * 0.55, hy - Math.sin(ang + 0.5) * len * 0.55);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }

        // Front flare: a soft ring that breathes, marking the contested cell.
        const r = Math.max(2.4, zoom * 0.55) * (0.85 + pulse * 0.5);
        ctx.save();
        ctx.globalAlpha = 0.5 + pulse * 0.4;
        ctx.strokeStyle = `rgba(${hue},0.95)`;
        ctx.lineWidth = Math.max(1, zoom * 0.16);
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 0.75;
        ctx.fillStyle = `rgba(${hue},0.95)`;
        ctx.fillRect(x - size / 2, y - size / 2, size, size);
        ctx.restore();
      }
    }
  }

  drawStrikes(ctx, zoom) {
    const { game } = this;
    const w = this.world.w;
    for (const s of game.strikes) {
      const t = Math.min(1, s.t / s.dur);
      const x = s.x0 + (s.x1 - s.x0) * t;
      const y = s.y0 + (s.y1 - s.y0) * t - Math.sin(t * Math.PI) * 24;
      const px = (x - this.cam.x) * zoom;
      const py = (y - this.cam.y) * zoom;
      const tx = (s.x1 - this.cam.x) * zoom;
      const ty = (s.y1 - this.cam.y) * zoom;
      ctx.save();
      ctx.strokeStyle = "rgba(255,190,120,0.4)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      ctx.fillStyle = "#ffe0a8";
      const sz = Math.max(2.5, zoom * 0.35);
      ctx.fillRect(px - sz / 2, py - sz / 2, sz, sz);
      ctx.restore();
    }
    for (const e of game.explosions) {
      const t = e.t / 1.6;
      const r = Math.max(3, e.r * zoom * (0.35 + t * 1.4));
      const px = (e.x - this.cam.x) * zoom;
      const py = (e.y - this.cam.y) * zoom;
      ctx.save();
      const g = ctx.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, `rgba(255,255,225,${1 - t})`);
      g.addColorStop(0.35, `rgba(255,165,70,${0.9 - t * 0.85})`);
      g.addColorStop(1, "rgba(70,36,18,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      void w;
    }
  }

  // The cell a click would build on. It used to be a 1.5px outline that
  // disappeared against the map's borders, so "where exactly is my building
  // going" was guesswork. Now it is a filled, pulsing square with a solid
  // outline, clipped to the cell, so the answer is obvious.
  drawBrush(ctx, zoom) {
    const s = this.cellToScreen(this.hoverCell);
    const ok = this.brushOk;
    const size = Math.max(9, zoom * 1.45);
    const x = s.x - size / 2;
    const y = s.y - size / 2;
    const fill = ok ? "rgba(184,240,160,0.30)" : "rgba(255,143,143,0.30)";
    const line = ok ? "#b8f0a0" : "#ff8f8f";
    const pulse = 0.55 + 0.45 * Math.sin((this.game?.time || 0) * 7);
    ctx.save();
    // soft halo so the square reads on any terrain colour
    ctx.fillStyle = ok ? "rgba(184,240,160,0.12)" : "rgba(255,143,143,0.12)";
    ctx.beginPath();
    ctx.arc(s.x, s.y, size * 0.95, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, size, size);
    ctx.globalAlpha = pulse;
    ctx.strokeStyle = line;
    ctx.lineWidth = Math.max(2, zoom * 0.16);
    ctx.strokeRect(x, y, size, size);
    // corner ticks: they make the square read as a selection, not a tile
    ctx.globalAlpha = 1;
    const t = size * 0.34;
    ctx.lineWidth = Math.max(2, zoom * 0.2);
    ctx.beginPath();
    ctx.moveTo(x, y + t); ctx.lineTo(x, y); ctx.lineTo(x + t, y);
    ctx.moveTo(x + size - t, y + size); ctx.lineTo(x + size, y + size); ctx.lineTo(x + size, y + size - t);
    ctx.stroke();
    ctx.restore();
  }

  // The rectangle being dragged for an area build: a translucent fill plus a
  // grid of dots on every cell that will be built, so the player sees exactly
  // what they are about to pay for before releasing.
  drawArea(ctx, zoom) {
    const { a, b, ok } = this.area;
    const w = this.world.w;
    const ax = a % w;
    const ay = (a / w) | 0;
    const bx = b % w;
    const by = (b / w) | 0;
    const x0 = Math.min(ax, bx);
    const x1 = Math.max(ax, bx);
    const y0 = Math.min(ay, by);
    const y1 = Math.max(ay, by);
    const px = (x0 - this.cam.x) * zoom;
    const py = (y0 - this.cam.y) * zoom;
    const pw = (x1 - x0 + 1) * zoom;
    const ph = (y1 - y0 + 1) * zoom;
    ctx.save();
    ctx.fillStyle = ok ? "rgba(184,240,160,0.18)" : "rgba(255,143,143,0.18)";
    ctx.strokeStyle = ok ? "rgba(184,240,160,0.9)" : "rgba(255,143,143,0.9)";
    ctx.lineWidth = Math.max(1, zoom * 0.2);
    ctx.fillRect(px, py, pw, ph);
    ctx.strokeRect(px, py, pw, ph);
    // one dot per cell that will receive a building
    ctx.fillStyle = ok ? "rgba(200,255,180,0.75)" : "rgba(255,180,180,0.7)";
    const r = Math.max(1, zoom * 0.16);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        ctx.beginPath();
        ctx.arc((x - this.cam.x) * zoom + zoom / 2, (y - this.cam.y) * zoom + zoom / 2, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  drawLabels(ctx, zoom) {
    const { game, world } = this;
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const size = Math.max(10, Math.min(19, zoom * 2.6));
    ctx.font = `700 ${size}px "Cairo", "Tajawal", system-ui, sans-serif`;
    // Big nations first, so they always win a slot; then a hard budget of
    // labels on screen. Without the budget, zooming out drew a dozen names on
    // top of each other in Europe and none of them was readable.
    const list = [...game.nations.values()].sort((a, b) => b.cells - a.cells);
    const budget = zoom > 3 ? 40 : zoom > 2 ? 22 : 10;
    let drawn = 0;
    for (const n of list) {
      if (!n.alive) continue;
      if (drawn >= budget) break;
      const c = n.def || world.countries[n.id];
      // Threshold scales with the zoom: below it the name is smaller than its
      // own territory and would just overlap its neighbours.
      if (n.cells * zoom * zoom < 2400) continue;
      const x = (c.x - this.cam.x) * zoom;
      // Nation names are data, not copy: the map bundle carries both spellings.
      // Canvas text is invisible to the DOM translator, so this is the one
      // place that has to pick the field itself.
      const label = getLang() === "en" ? c.name || n.ar : n.ar || c.name;
      const y = (c.y - this.cam.y) * zoom;
      if (x < -60 || y < -30 || x > this.viewW + 60 || y > this.viewH + 30) continue;
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(8,10,16,0.75)";
      ctx.strokeText(label, x, y);
      ctx.fillStyle = n.isPlayer ? "#ffe9a8" : "rgba(255,255,255,0.9)";
      ctx.fillText(label, x, y);
      drawn++;
    }
    ctx.restore();
  }

  // ------------------------------------------------------------- minimap ---

  // Minimap: rendered from the same colour buffer, only the cells that
  // changed since the previous frame are rewritten.
  drawMinimap(canvas, view) {
    const w = this.world.w;
    const h = this.world.h;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      this.mmCanvas = null;
    }
    const ctx = canvas.getContext("2d");
    if (!this.mmCanvas || this.mmCanvas.__ownerVersion !== this.game.ownerVersion) {
      const off = this.mmCanvas || document.createElement("canvas");
      off.width = w;
      off.height = h;
      off.__ownerVersion = this.game.ownerVersion;
      const octx = off.getContext("2d");
      const img = octx.createImageData(w, h);
      const d = img.data;
      const nations = this.game.nations;
      const { owner } = this.world;
      for (let i = 0; i < w * h; i++) {
        const o = owner[i];
        const b = i * 4;
        if (o === -1) {
          d[b] = 16;
          d[b + 1] = 28;
          d[b + 2] = 44;
        } else if (o === -2) {
          d[b] = 92;
          d[b + 1] = 78;
          d[b + 2] = 60;
        } else if (o < 0) {
          d[b] = 40;
          d[b + 1] = 45;
          d[b + 2] = 54;
        } else {
          const n = nations.get(o);
          if (n && n.alive) {
            const c = n.def.color;
            d[b] = c.r;
            d[b + 1] = c.g;
            d[b + 2] = c.b;
          } else {
            d[b] = 44;
            d[b + 1] = 44;
            d[b + 2] = 50;
          }
        }
        d[b + 3] = 255;
      }
      octx.putImageData(img, 0, 0);
      this.mmCanvas = off;
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(off, 0, 0);
    }
    if (view) {
      const cw = canvas.clientWidth || 210;
      const ch = canvas.clientHeight || 86;
      const sx = (this.cam.x / w) * cw;
      const sy = (this.cam.y / h) * ch;
      const sw = (this.viewW / this.cam.zoom / w) * cw;
      const sh = (this.viewH / this.cam.zoom / h) * ch;
      view(sx, sy, sw, sh);
    }
  }

  camKeyFor() {
    const c = this.cam;
    return [c.x.toFixed(3), c.y.toFixed(3), c.zoom.toFixed(4), this.viewW, this.viewH, this.dpr,
      this.labels ? 1 : 0, this.showBuildings ? 1 : 0].join("|");
  }

  renderBase(force) {
    const camKey = this.camKeyFor();
    const ownKey = (this.game.ownerVersion || 0) + ":" + (this.game.warVersion || 0);
    const camSame = camKey === this.baseKey;
    const ownSame = ownKey === this.baseOwn;
    if (camSame && ownSame) return;
    if (camSame && !ownSame) {
      // Ownership changed (a capture). Rebuilding the static layer is the most
      // expensive path, so throttle it a little during big offensives.
      const now = performance.now();
      if (!force && this.lastBaseAt && now - this.lastBaseAt < 90) return;
    }
    this.lastBaseAt = performance.now();
    this.baseKey = camKey;
    this.baseOwn = ownKey;
    const b = this.bctx;
    b.setTransform(1, 0, 0, 1, 0, 0);
    b.imageSmoothingEnabled = false;
    b.fillStyle = "#0a1220";
    b.fillRect(0, 0, this.baseCanvas.width, this.baseCanvas.height);
    b.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawMap(b);
    // static markers (buildings, capitals, labels) are cached too
    this.drawBuildings(b, this.cam.zoom);
    this.drawCapitals(b, this.cam.zoom);
    if (this.labels && this.cam.zoom > 1.5) this.drawLabels(b, this.cam.zoom);
    this.dirty = false;
  }

  render() {
    this.renderBase(false);
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.baseCanvas, 0, 0);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawDynamic(ctx, this.cam.zoom);
    // Keep one frame alive even when the game loop is paused or between ticks:
    // the hover square has to be on screen the instant the pointer moves, not on
    // the next simulation frame. Cheap (drawImage of a ready base layer).
    this.requestFrame();
  }

  // Coalesce redraws into one per animation frame. Anything that changes the
  // overlay (hover cell, brush, area rectangle, camera) calls this, so the
  // square never lags behind the cursor.
  requestFrame() {
    if (this._framePending) return;
    this._framePending = true;
    const run = () => {
      this._framePending = false;
      this.render();
    };
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(run);
    else setTimeout(run, 16);
  }

  // Animated layer: selection ring, attack fronts, missiles, explosions, brush.
  // Highlight the historical territory of the campaign being previewed.
  drawCampaignOverlay(ctx, zoom) {
    const camp = this.campaign;
    if (!camp) return;
    const w = this.world.w;
    const names = new Set([camp.country, ...camp.include]);
    const cells = [];
    for (let i = 0; i < this.world.size; i++) {
      const o = this.world.owner[i];
      if (o < 0) continue;
      if (names.has(this.world.countries[o].name)) cells.push(i);
    }
    if (!cells.length) return;
    ctx.save();
    ctx.globalAlpha = 0.18 + Math.sin(performance.now() / 380) * 0.05;
    ctx.fillStyle = "#f4d27a";
    const size = Math.max(1, zoom * 0.9);
    for (const i of cells) {
      const x = ((i % w) - this.cam.x) * zoom;
      const y = (((i / w) | 0) - this.cam.y) * zoom;
      ctx.fillRect(x, y, size, size);
    }
    ctx.restore();
    // outline the merged empire
    ctx.save();
    ctx.strokeStyle = "rgba(255,236,170,0.85)";
    ctx.lineWidth = Math.max(1, zoom * 0.22);
    ctx.beginPath();
    const set = new Uint8Array(this.world.size);
    for (const i of cells) set[i] = 1;
    for (const i of cells) {
      const x = i % w;
      const y = (i / w) | 0;
      const sx = (x - this.cam.x) * zoom;
      const sy = (y - this.cam.y) * zoom;
      const size2 = zoom;
      if (x > 0 && !set[i - 1]) {
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx, sy + size2);
      }
      if (x < w - 1 && !set[i + 1]) {
        ctx.moveTo(sx + size2, sy);
        ctx.lineTo(sx + size2, sy + size2);
      }
      if (i >= w && !set[i - w]) {
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + size2, sy);
      }
      if (i + w < this.world.size && !set[i + w]) {
        ctx.moveTo(sx, sy + size2);
        ctx.lineTo(sx + size2, sy + size2);
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  drawDynamic(ctx, zoom) {
    const game = this.game;
    const id = this.selected != null ? this.selected : this.highlight;
    if (id != null) {
      const n = game.byId[id];
      if (n && n.alive && n.capital >= 0) {
        const s = this.cellToScreen(n.capital);
        ctx.save();
        ctx.globalAlpha = 0.22 + Math.sin(game.time * 3) * 0.08;
        ctx.strokeStyle = "#ffe9a8";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 22, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
    if (this.campaign) this.drawCampaignOverlay(ctx, zoom);
    this.drawAttacks(ctx, zoom);
    this.drawStrikes(ctx, zoom);
    if (this.brush && this.hoverCell >= 0) this.drawBrush(ctx, zoom);
  }
}
