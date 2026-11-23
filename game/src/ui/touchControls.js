/**
 * touchControls.js — on-screen virtual joystick + action buttons for phones
 * and tablets. Rendered as translucent canvas widgets; taps map to abstract
 * Input actions so gameplay code never sees raw touch events.
 */
import { UI_THEME } from '../gfx/palette.js';
import { rectsOverlap, clamp } from '../core/mathx.js';

export class TouchControls {
  /**
   * @param {import('../core/input.js').Input} input
   */
  constructor(input) {
    this.input = input;
    this.enabled = false;
    this.opacity = 0.55;
    this.stick = { x: 0, y: 0, baseX: 0, baseY: 0, active: false, id: null };
    this.buttons = [
      { id: 'attack', label: '⚔', x: -52, y: -52, r: 22, action: 'attack' },
      { id: 'dash', label: '💨', x: -100, y: -20, r: 18, action: 'dash' },
      { id: 'skill1', label: '✦', x: -20, y: -96, r: 17, action: 'skill1' },
      { id: 'skill2', label: '✧', x: -88, y: -88, r: 17, action: 'skill2' },
      { id: 'interact', label: '✋', x: -140, y: -52, r: 16, action: 'interact' },
      { id: 'inventory', label: '🎒', x: 30, y: -30, r: 15, action: 'inventory' },
    ];
    this.pointerMap = new Map(); // pointerId -> buttonId
    this.canvasW = 480;
    this.canvasH = 270;
  }

  setEnabled(on) {
    this.enabled = on;
    if (!on) {
      this.stick.active = false;
      this.pointerMap.clear();
    }
  }

  /**
   * Handle pointer events from the canvas. Coordinates are in internal
   * canvas space (already scaled by the renderer).
   */
  handleTouchStart(x, y, id) {
    if (!this.enabled) return false;
    // stick zone: bottom-left quadrant
    if (x < this.canvasW * 0.45 && y > this.canvasH * 0.45) {
      this.stick.active = true;
      this.stick.id = id;
      this.stick.baseX = x;
      this.stick.baseY = y;
      this.stick.x = 0;
      this.stick.y = 0;
      return true;
    }
    for (const btn of this._buttonRects()) {
      if (rectsOverlap(x, y, 1, 1, btn.sx - btn.r, btn.sy - btn.r, btn.r * 2, btn.r * 2)) {
        this.pointerMap.set(id, btn.id);
        this.input.setVirtual(btn.action, true);
        return true;
      }
    }
    return false;
  }

  handleTouchMove(x, y, id) {
    if (!this.enabled) return false;
    if (this.stick.active && this.stick.id === id) {
      const dx = x - this.stick.baseX;
      const dy = y - this.stick.baseY;
      const maxR = 26;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const clamped = Math.min(len, maxR);
      this.stick.x = (dx / len) * (clamped / maxR);
      this.stick.y = (dy / len) * (clamped / maxR);
      this.input.setVirtualStick(this.stick.x, this.stick.y);
      return true;
    }
    return this.pointerMap.has(id);
  }

  handleTouchEnd(id) {
    if (this.stick.id === id) {
      this.stick.active = false;
      this.stick.id = null;
      this.stick.x = 0;
      this.stick.y = 0;
      this.input.setVirtualStick(0, 0);
    }
    const btnId = this.pointerMap.get(id);
    if (btnId) {
      const btn = this.buttons.find((b) => b.id === btnId);
      if (btn) this.input.setVirtual(btn.action, false);
      this.pointerMap.delete(id);
    }
  }

  _buttonRects() {
    return this.buttons.map((btn) => ({
      ...btn,
      sx: this.canvasW + btn.x,
      sy: this.canvasH + btn.y,
    }));
  }

  render(ctx) {
    if (!this.enabled) return;
    ctx.save();
    ctx.globalAlpha = this.opacity;

    // stick
    const stickX = this.stick.active ? this.stick.baseX : 64;
    const stickY = this.stick.active ? this.stick.baseY : this.canvasH - 56;
    ctx.fillStyle = 'rgba(20,14,28,0.6)';
    ctx.beginPath();
    ctx.arc(stickX, stickY, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = UI_THEME.border;
    ctx.stroke();
    ctx.fillStyle = 'rgba(232,182,76,0.8)';
    ctx.beginPath();
    ctx.arc(stickX + this.stick.x * 18, stickY + this.stick.y * 18, 12, 0, Math.PI * 2);
    ctx.fill();

    // buttons
    for (const btn of this._buttonRects()) {
      const pressed = [...this.pointerMap.values()].includes(btn.id);
      ctx.fillStyle = pressed ? 'rgba(232,182,76,0.85)' : 'rgba(20,14,28,0.62)';
      ctx.beginPath();
      ctx.arc(btn.sx, btn.sy, btn.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = UI_THEME.border;
      ctx.stroke();
      ctx.fillStyle = pressed ? UI_THEME.textDark : UI_THEME.text;
      ctx.font = `${Math.round(btn.r * 0.9)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(btn.label, btn.sx, btn.sy);
    }
    ctx.restore();
    void clamp;
  }
}
