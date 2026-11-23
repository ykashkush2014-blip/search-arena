/**
 * renderer.js — canvas-2D renderer with an internal low-resolution buffer
 * (default 480×270) scaled up with nearest-neighbor. This is the single most
 * important "weak device" trick: the GPU fills far fewer pixels and pixel art
 * stays crisp at any window size.
 *
 * The renderer also caches static tile chunks into offscreen canvases so the
 * per-frame tile draw cost is a handful of blits instead of thousands of rects.
 */
import { clamp } from './mathx.js';

export class Camera {
  constructor(viewW, viewH) {
    this.x = 0;
    this.y = 0;
    this.viewW = viewW;
    this.viewH = viewH;
    this.targetX = 0;
    this.targetY = 0;
    this.smoothing = 1; // 1 = instant
    this.shakeX = 0;
    this.shakeY = 0;
    this.bounds = null; // {x,y,w,h} in world units
    this.zoom = 1;
  }

  follow(x, y, dt, smoothing = 0.12) {
    this.targetX = x - this.viewW / 2;
    this.targetY = y - this.viewH / 2;
    if (smoothing >= 1 || dt <= 0) {
      this.x = this.targetX;
      this.y = this.targetY;
    } else {
      const k = 1 - Math.pow(smoothing, dt * 60);
      this.x += (this.targetX - this.x) * k;
      this.y += (this.targetY - this.y) * k;
    }
    if (this.bounds) {
      const b = this.bounds;
      this.x = clamp(this.x, b.x, Math.max(b.x, b.x + b.w - this.viewW));
      this.y = clamp(this.y, b.y, Math.max(b.y, b.y + b.h - this.viewH));
    }
  }

  centerOn(x, y) {
    this.x = x - this.viewW / 2;
    this.y = y - this.viewH / 2;
    this.targetX = this.x;
    this.targetY = this.y;
  }

  worldToScreen(wx, wy) {
    return { x: wx - this.x + this.shakeX, y: wy - this.y + this.shakeY };
  }

  screenToWorld(sx, sy) {
    return { x: sx + this.x - this.shakeX, y: sy + this.y - this.shakeY };
  }

  isVisible(x, y, margin = 32) {
    return (
      x >= this.x - margin &&
      x <= this.x + this.viewW + margin &&
      y >= this.y - margin &&
      y <= this.y + this.viewH + margin
    );
  }
}

export class Renderer {
  /**
   * @param {HTMLCanvasElement} canvas — the visible canvas
   * @param {object} [opts] { width, height, smoothing }
   */
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.width = opts.width ?? 480;
    this.height = opts.height ?? 270;
    this.ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
    this.buffer = null;
    this.bctx = null;
    if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
      this.buffer = document.createElement('canvas');
      this.buffer.width = this.width;
      this.buffer.height = this.height;
      this.bctx = this.buffer.getContext('2d', { alpha: false });
    } else {
      // Headless test mode: draw straight into the (stub) main context.
      this.bctx = this.ctx;
    }
    this.camera = new Camera(this.width, this.height);
    this.pixelSmoothing = opts.smoothing ?? false;
    this.bctx.imageSmoothingEnabled = this.pixelSmoothing;
    this.frame = 0;
    this.drawCalls = 0;
    this._chunkCache = new Map();
    this._tintCanvas = null;
    this._tintCtx = null;
    this.resize();
  }

  /** Fit the visible canvas to its CSS size while keeping the internal buffer. */
  resize(cssWidth, cssHeight) {
    const w = cssWidth ?? (this.canvas.clientWidth || this.width);
    const h = cssHeight ?? (this.canvas.clientHeight || this.height);
    const dpr = clamp(typeof devicePixelRatio === 'number' ? devicePixelRatio : 1, 1, 2);
    this.canvas.width = Math.max(1, Math.round(w * dpr));
    this.canvas.height = Math.max(1, Math.round(h * dpr));
    this.ctx.imageSmoothingEnabled = this.pixelSmoothing;
  }

  /** Begin a frame: clear the buffer, reset counters. */
  begin(clearColor = '#1a1220') {
    this.frame += 1;
    this.drawCalls = 0;
    const ctx = this.bctx;
    ctx.imageSmoothingEnabled = this.pixelSmoothing;
    ctx.fillStyle = clearColor;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.save();
    ctx.translate(-Math.round(this.camera.x + this.camera.shakeX), -Math.round(this.camera.y + this.camera.shakeY));
    return ctx;
  }

  /** End a frame: restore world transform and blit the buffer scaled to screen. */
  end() {
    this.bctx.restore();
    if (this.bctx !== this.ctx) {
      this.ctx.imageSmoothingEnabled = this.pixelSmoothing;
      this.ctx.drawImage(this.buffer, 0, 0, this.width, this.height, 0, 0, this.canvas.width, this.canvas.height);
    }
    this.drawCalls += 1;
  }

  /** Draw in screen space (HUD) — temporarily cancels the camera transform. */
  beginScreenSpace() {
    this.bctx.restore();
    this.bctx.save();
  }

  /** Resume world space after HUD drawing. */
  endWorldSpace() {
    this.bctx.restore();
    this.bctx.save();
    this.bctx.translate(
      -Math.round(this.camera.x + this.camera.shakeX),
      -Math.round(this.camera.y + this.camera.shakeY),
    );
  }

  // ---------------------------------------------------------------- drawing

  drawRect(x, y, w, h, color, alpha = 1) {
    const ctx = this.bctx;
    if (alpha !== 1) {
      ctx.save();
      ctx.globalAlpha = alpha;
    }
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    if (alpha !== 1) ctx.restore();
    this.drawCalls += 1;
  }

  drawRectOutline(x, y, w, h, color, lineWidth = 1) {
    const ctx = this.bctx;
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(w), Math.round(h));
    this.drawCalls += 1;
  }

  drawCircle(x, y, radius, color, alpha = 1) {
    const ctx = this.bctx;
    ctx.save();
    if (alpha !== 1) ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    this.drawCalls += 1;
  }

  drawLine(x1, y1, x2, y2, color, lineWidth = 1) {
    const ctx = this.bctx;
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    this.drawCalls += 1;
  }

  /**
   * Draw a sprite canvas at (x, y). Sprites are pre-rendered canvases from
   * gfx/spritegen.js — drawing them is a single blit.
   */
  drawSprite(sprite, x, y, opts = {}) {
    if (!sprite) return;
    const ctx = this.bctx;
    const w = opts.w ?? sprite.width;
    const h = opts.h ?? sprite.height;
    const dx = Math.round(x - (opts.anchorX ?? 0) * w);
    const dy = Math.round(y - (opts.anchorY ?? 0) * h);
    ctx.save();
    if (opts.alpha !== undefined && opts.alpha !== 1) ctx.globalAlpha = opts.alpha;
    if (opts.flipX || opts.flipY) {
      ctx.translate(dx + (opts.flipX ? w : 0), dy + (opts.flipY ? h : 0));
      ctx.scale(opts.flipX ? -1 : 1, opts.flipY ? -1 : 1);
      ctx.drawImage(sprite, 0, 0, w, h);
    } else {
      ctx.drawImage(sprite, dx, dy, w, h);
    }
    ctx.restore();
    this.drawCalls += 1;
  }

  /** Draw a sub-rectangle of a sprite sheet. */
  drawSpriteRegion(sprite, sx, sy, sw, sh, dx, dy, dw = sw, dh = sh, opts = {}) {
    if (!sprite) return;
    const ctx = this.bctx;
    ctx.save();
    if (opts.alpha !== undefined && opts.alpha !== 1) ctx.globalAlpha = opts.alpha;
    ctx.drawImage(sprite, sx, sy, sw, sh, Math.round(dx), Math.round(dy), dw, dh);
    ctx.restore();
    this.drawCalls += 1;
  }

  /** Text with a 1px shadow for readability over sand. */
  drawText(text, x, y, opts = {}) {
    const ctx = this.bctx;
    const font = `${opts.bold ? 'bold ' : ''}${opts.size ?? 8}px ${opts.font ?? '"Press Start 2P", monospace'}`;
    ctx.save();
    ctx.font = font;
    ctx.textAlign = opts.align ?? 'left';
    ctx.textBaseline = opts.baseline ?? 'top';
    if (opts.alpha !== undefined) ctx.globalAlpha = opts.alpha;
    if (opts.shadow !== false) {
      ctx.fillStyle = opts.shadowColor ?? 'rgba(0,0,0,0.75)';
      ctx.fillText(text, x + 1, y + 1);
    }
    ctx.fillStyle = opts.color ?? '#ffffff';
    ctx.fillText(text, x, y);
    if (opts.stroke) {
      ctx.strokeStyle = opts.stroke;
      ctx.lineWidth = opts.strokeWidth ?? 1;
      ctx.strokeText(text, x, y);
    }
    ctx.restore();
    this.drawCalls += 1;
  }

  measureText(text, size = 8, font, bold = false) {
    const ctx = this.bctx;
    ctx.save();
    ctx.font = `${bold ? 'bold ' : ''}${size}px ${font ?? '"Press Start 2P", monospace'}`;
    const m = ctx.measureText(text);
    ctx.restore();
    return m && typeof m.width === 'number' ? m.width : text.length * size * 0.6;
  }

  /** Full-screen tint (day/night, sandstorm, damage flash). */
  drawTint(color, alpha) {
    if (alpha <= 0.001) return;
    const ctx = this.bctx;
    ctx.save();
    ctx.globalAlpha = clamp(alpha, 0, 1);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.restore();
    this.drawCalls += 1;
  }

  // ------------------------------------------------------------ chunk cache

  /**
   * Render a static tile block once into an offscreen canvas, then blit it.
   * `key` identifies the block (level id + chunk coords). Invalidate on change.
   */
  getChunkCanvas(key, width, height, drawFn) {
    let chunk = this._chunkCache.get(key);
    if (!chunk) {
      if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
        // Headless: draw live instead of caching.
        drawFn(this.bctx);
        return null;
      }
      chunk = document.createElement('canvas');
      chunk.width = width;
      chunk.height = height;
      const cctx = chunk.getContext('2d');
      drawFn(cctx);
      this._chunkCache.set(key, chunk);
    }
    return chunk;
  }

  drawChunk(key, dx, dy, width, height, drawFn) {
    const chunk = this.getChunkCanvas(key, width, height, drawFn);
    if (chunk) {
      this.bctx.drawImage(chunk, Math.round(dx), Math.round(dy));
      this.drawCalls += 1;
    }
  }

  invalidateChunk(key) {
    if (key === undefined) {
      this._chunkCache.clear();
    } else {
      this._chunkCache.delete(key);
    }
  }

  get cachedChunkCount() {
    return this._chunkCache.size;
  }
}
