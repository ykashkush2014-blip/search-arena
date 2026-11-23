/**
 * ui.js — immediate-mode-ish UI toolkit on canvas: panels, buttons, bars,
 * lists, tooltips and a toast queue. All widgets are functions — cheap to
 * call every frame and allocation-light.
 */
import { UI_THEME } from '../gfx/palette.js';
import { clamp, rectsOverlap } from '../core/mathx.js';
import { isRTL, wrapText, fitSize } from '../gfx/font.js';

export class UI {
  constructor(renderer, input) {
    this.renderer = renderer;
    this.input = input;
    this.hot = null; // id of widget under pointer
    this.active = null;
    this.toasts = []; // { text, color, life, maxLife, icon }
    this.tooltip = null;
    this.time = 0;
    this._panels = [];
    this.scroll = new Map(); // panelId -> offset
  }

  // ------------------------------------------------------------- helpers

  get ctx() {
    return this.renderer.bctx;
  }

  beginFrame(dt) {
    this.time += dt;
    this.hot = null;
    this._panels.length = 0;
    this.tooltip = null;
    for (let i = this.toasts.length - 1; i >= 0; i -= 1) {
      const t = this.toasts[i];
      t.life -= dt;
      if (t.life <= 0) this.toasts.splice(i, 1);
    }
  }

  toast(text, opts = {}) {
    this.toasts.push({
      text,
      color: opts.color ?? UI_THEME.text,
      life: opts.life ?? 2.4,
      maxLife: opts.life ?? 2.4,
      icon: opts.icon ?? null,
    });
    if (this.toasts.length > 5) this.toasts.shift();
  }

  // ------------------------------------------------------------- widgets

  panel(x, y, w, h, opts = {}) {
    const ctx = this.ctx;
    ctx.fillStyle = opts.fill ?? UI_THEME.panel;
    ctx.globalAlpha = opts.alpha ?? 0.94;
    ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = opts.border ?? UI_THEME.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    if (opts.title) {
      ctx.fillStyle = UI_THEME.borderDark;
      ctx.fillRect(x + 1, y + 1, w - 2, 16);
      this.text(opts.title, x + w / 2, y + 5, {
        align: 'center',
        color: opts.titleColor ?? UI_THEME.text,
        size: 8,
      });
    }
    this._panels.push({ x, y, w, h, id: opts.id ?? `p${this._panels.length}` });
    return { x, y, w, h };
  }

  button(x, y, w, h, label, opts = {}) {
    const ctx = this.ctx;
    const mouse = this.input.mouse;
    const hover = rectsOverlap(mouse.x, mouse.y, 1, 1, x, y, w, h);
    const pressed = hover && mouse.down;
    const disabled = opts.disabled === true;
    const bg = disabled
      ? UI_THEME.panelLight
      : pressed
        ? UI_THEME.borderDark
        : hover
          ? UI_THEME.panelLight
          : opts.bg ?? UI_THEME.panelLight;
    ctx.fillStyle = bg;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = hover && !disabled ? UI_THEME.accent : UI_THEME.border;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    const size = fitSize(label, w - 10, opts.size ?? 8, 5);
    this.text(label, x + w / 2, y + (h - size) / 2 - 1, {
      align: 'center',
      size,
      color: disabled ? UI_THEME.textDim : opts.color ?? UI_THEME.text,
    });
    const clicked = hover && this.input.mouse.clicked && !disabled;
    if (clicked && opts.onClick) opts.onClick();
    if (hover && opts.tooltip) this.tooltip = opts.tooltip;
    return clicked;
  }

  bar(x, y, w, h, ratio, opts = {}) {
    const ctx = this.ctx;
    ctx.fillStyle = opts.back ?? UI_THEME.hpBack;
    ctx.fillRect(x, y, w, h);
    const fillW = Math.round(w * clamp(ratio, 0, 1));
    if (fillW > 0) {
      ctx.fillStyle = opts.fill ?? UI_THEME.hp;
      ctx.fillRect(x, y, fillW, h);
      if (opts.gloss !== false && h >= 6) {
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillRect(x, y, fillW, 1);
      }
    }
    if (opts.border !== false) {
      ctx.strokeStyle = opts.borderColor ?? 'rgba(0,0,0,0.5)';
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    }
    if (opts.label) {
      this.text(opts.label, x + w / 2, y + h / 2 - 4, {
        align: 'center',
        size: opts.labelSize ?? 7,
        color: opts.labelColor ?? '#fff',
      });
    }
  }

  text(text, x, y, opts = {}) {
    const ctx = this.ctx;
    const size = opts.size ?? 8;
    const bold = opts.bold ?? false;
    ctx.save();
    ctx.font = `${bold ? 'bold ' : ''}${size}px ${opts.font ?? '"Courier New", "Noto Sans Arabic", monospace'}`;
    ctx.textAlign = opts.align ?? 'left';
    ctx.textBaseline = opts.baseline ?? 'top';
    if (opts.alpha !== undefined) ctx.globalAlpha = opts.alpha;
    if (opts.shadow !== false) {
      ctx.fillStyle = opts.shadowColor ?? 'rgba(0,0,0,0.75)';
      ctx.fillText(text, x + 1, y + 1);
    }
    ctx.fillStyle = opts.color ?? UI_THEME.text;
    ctx.fillText(text, x, y);
    if (opts.underline) {
      const w = ctx.measureText(text).width;
      const ux = opts.align === 'center' ? x - w / 2 : opts.align === 'right' ? x - w : x;
      ctx.fillRect(ux, y + size + 1, w, 1);
    }
    ctx.restore();
    return size + 2;
  }

  paragraph(text, x, y, maxWidth, opts = {}) {
    const rtl = opts.rtl ?? isRTL(text);
    const size = opts.size ?? 7;
    const measure = (s) => this.renderer.measureText(s, size, opts.font, opts.bold);
    const lines = wrapText(text, maxWidth, measure);
    let cy = y;
    for (const line of lines) {
      const w = measure(line);
      let lx = x;
      if (opts.align === 'center') lx = x + (maxWidth - w) / 2;
      else if (opts.align === 'right' || (rtl && opts.align !== 'left')) lx = x + maxWidth - w;
      this.text(line, lx, cy, { ...opts, size });
      cy += size + (opts.lineHeight ?? 3);
    }
    return cy - y;
  }

  list(x, y, w, h, items, opts = {}) {
    const id = opts.id ?? 'list';
    const rowH = opts.rowH ?? 18;
    const totalH = items.length * rowH;
    let offset = this.scroll.get(id) ?? 0;
    const maxOffset = Math.max(0, totalH - h);
    offset = clamp(offset, 0, maxOffset);
    // wheel scroll
    if (rectsOverlap(this.input.mouse.x, this.input.mouse.y, 1, 1, x, y, w, h)) {
      offset = clamp(offset + this.input.mouse.wheel * rowH * 2, 0, maxOffset);
    }
    this.scroll.set(id, offset);
    const ctx = this.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    let clickedIndex = -1;
    for (let i = 0; i < items.length; i += 1) {
      const iy = y + i * rowH - offset;
      if (iy + rowH < y || iy > y + h) continue;
      const item = items[i];
      const hover = rectsOverlap(this.input.mouse.x, this.input.mouse.y, 1, 1, x, iy, w, rowH);
      const selected = opts.selectedIndex === i;
      if (selected || hover) {
        ctx.fillStyle = selected ? UI_THEME.borderDark : UI_THEME.panelLight;
        ctx.fillRect(x, iy, w, rowH);
      }
      if (opts.renderRow) {
        opts.renderRow(item, x, iy, w, rowH, { hover, selected, index: i });
      } else {
        this.text(String(item.label ?? item), x + 6, iy + (rowH - 8) / 2, {
          size: 7,
          color: item.color ?? UI_THEME.text,
        });
      }
      if (hover && this.input.mouse.clicked) clickedIndex = i;
      if (hover && item.tooltip) this.tooltip = item.tooltip;
    }
    ctx.restore();
    // scrollbar
    if (maxOffset > 0) {
      const thumbH = Math.max(12, (h / totalH) * h);
      const thumbY = y + (offset / maxOffset) * (h - thumbH);
      ctx.fillStyle = UI_THEME.borderDark;
      ctx.fillRect(x + w - 4, thumbY, 3, thumbH);
    }
    return clickedIndex;
  }

  checkbox(x, y, checked, label, opts = {}) {
    const size = 10;
    const hover = rectsOverlap(this.input.mouse.x, this.input.mouse.y, 1, 1, x, y, size + 4 + this.renderer.measureText(label, 7), size + 2);
    const ctx = this.ctx;
    ctx.fillStyle = UI_THEME.panelLight;
    ctx.fillRect(x, y, size, size);
    ctx.strokeStyle = hover ? UI_THEME.accent : UI_THEME.border;
    ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
    if (checked) {
      ctx.fillStyle = UI_THEME.accent;
      ctx.fillRect(x + 2, y + 2, size - 4, size - 4);
    }
    this.text(label, x + size + 5, y + 1, { size: 7, color: opts.color ?? UI_THEME.text });
    const clicked = hover && this.input.mouse.clicked;
    return clicked;
  }

  /** Horizontal divider. */
  divider(x, y, w, color = UI_THEME.borderDark) {
    const ctx = this.ctx;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, 1);
  }

  /** Icon slot (16×16 item icon inside a bordered box). */
  iconSlot(x, y, sprite, opts = {}) {
    const ctx = this.ctx;
    const size = opts.size ?? 22;
    ctx.fillStyle = opts.bg ?? UI_THEME.panelLight;
    ctx.fillRect(x, y, size, size);
    ctx.strokeStyle = opts.border ?? UI_THEME.borderDark;
    ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
    if (sprite && !sprite.__stub) {
      const pad = Math.floor((size - 16) / 2);
      ctx.drawImage(sprite, x + pad, y + pad);
    }
    if (opts.count !== undefined && opts.count > 1) {
      this.text(`×${opts.count}`, x + size - 2, y + size - 9, { align: 'right', size: 6, color: '#fff' });
    }
    if (opts.rarityColor) {
      ctx.strokeStyle = opts.rarityColor;
      ctx.strokeRect(x + 1.5, y + 1.5, size - 3, size - 3);
    }
  }

  /** Tooltip box near the cursor. */
  drawTooltip() {
    if (!this.tooltip) return;
    const t = this.tooltip;
    const lines = Array.isArray(t) ? t : String(t).split('\n');
    const size = 7;
    let maxW = 40;
    for (const line of lines) maxW = Math.max(maxW, this.renderer.measureText(line, size) + 16);
    const h = lines.length * (size + 3) + 12;
    const mouse = this.input.mouse;
    let x = mouse.x + 12;
    let y = mouse.y + 12;
    const vw = this.renderer.width;
    const vh = this.renderer.height;
    if (x + maxW > vw - 4) x = mouse.x - maxW - 12;
    if (y + h > vh - 4) y = mouse.y - h - 12;
    this.panel(x, y, maxW, h, { alpha: 0.97 });
    let cy = y + 6;
    for (const line of lines) {
      this.text(line, x + 8, cy, {
        size,
        color: line.startsWith('+') ? UI_THEME.good : line.startsWith('-') ? UI_THEME.danger : UI_THEME.text,
      });
      cy += size + 3;
    }
  }

  /** Toast stack render (bottom-center). */
  renderToasts() {
    const vw = this.renderer.width;
    const vh = this.renderer.height;
    let y = vh - 34 - this.toasts.length * 20;
    for (const t of this.toasts) {
      const alpha = clamp(t.life / Math.min(0.5, t.maxLife), 0, 1);
      const w = Math.min(vw - 24, this.renderer.measureText(t.text, 7) + 22);
      const x = (vw - w) / 2;
      const ctx = this.ctx;
      ctx.globalAlpha = alpha * 0.92;
      ctx.fillStyle = UI_THEME.panel;
      ctx.fillRect(x, y, w, 17);
      ctx.strokeStyle = UI_THEME.border;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, 16);
      ctx.globalAlpha = alpha;
      this.text(t.text, x + w / 2, y + 5, { align: 'center', size: 7, color: t.color, shadow: true });
      ctx.globalAlpha = 1;
      y += 20;
    }
  }

  /** Screen dim overlay for modal states. */
  overlay(alpha = 0.55) {
    const ctx = this.ctx;
    ctx.fillStyle = UI_THEME.overlay;
    ctx.globalAlpha = alpha;
    ctx.fillRect(0, 0, this.renderer.width, this.renderer.height);
    ctx.globalAlpha = 1;
  }
}
