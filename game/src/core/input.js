/**
 * input.js — unified keyboard / mouse / touch / gamepad input with a virtual
 * stick and buttons for phones. All device-specific plumbing lives here so the
 * gameplay code only reads abstract actions (moveX, moveY, attack, dash, …).
 */

export const Actions = {
  MOVE_UP: 'moveUp',
  MOVE_DOWN: 'moveDown',
  MOVE_LEFT: 'moveLeft',
  MOVE_RIGHT: 'moveRight',
  ATTACK: 'attack',
  DASH: 'dash',
  SKILL1: 'skill1',
  SKILL2: 'skill2',
  INTERACT: 'interact',
  INVENTORY: 'inventory',
  MAP: 'map',
  QUESTS: 'quests',
  CODEX: 'codex',
  SETTINGS: 'settings',
  PAUSE: 'pause',
  CONFIRM: 'confirm',
  CANCEL: 'cancel',
  QUICK_SAVE: 'quickSave',
  QUICK_LOAD: 'quickLoad',
};

const DEFAULT_BINDINGS = {
  [Actions.MOVE_UP]: ['KeyW', 'ArrowUp'],
  [Actions.MOVE_DOWN]: ['KeyS', 'ArrowDown'],
  [Actions.MOVE_LEFT]: ['KeyA', 'ArrowLeft'],
  [Actions.MOVE_RIGHT]: ['KeyD', 'ArrowRight'],
  [Actions.ATTACK]: ['Space', 'KeyJ'],
  [Actions.DASH]: ['ShiftLeft', 'ShiftRight', 'KeyK'],
  [Actions.SKILL1]: ['KeyQ', 'Digit1'],
  [Actions.SKILL2]: ['KeyE', 'Digit2'],
  [Actions.INTERACT]: ['KeyF', 'Enter'],
  [Actions.INVENTORY]: ['KeyI', 'Tab'],
  [Actions.MAP]: ['KeyM'],
  [Actions.QUESTS]: ['KeyL'],
  [Actions.CODEX]: ['KeyC'],
  [Actions.SETTINGS]: ['Escape'],
  [Actions.PAUSE]: ['Escape', 'KeyP'],
  [Actions.CONFIRM]: ['Enter', 'Space'],
  [Actions.CANCEL]: ['Escape', 'Backspace'],
  [Actions.QUICK_SAVE]: ['F5'],
  [Actions.QUICK_LOAD]: ['F9'],
};

export class Input {
  /**
   * @param {object} [opts] { canvas, bindings }
   */
  constructor(opts = {}) {
    this.bindings = { ...DEFAULT_BINDINGS, ...(opts.bindings || {}) };
    this.keys = new Set(); // currently held codes
    this.pressed = new Set(); // pressed this frame
    this.released = new Set(); // released this frame
    this.mouse = { x: 0, y: 0, down: false, clicked: false, wheel: 0, inside: false };
    this.touch = {
      active: false,
      stickX: 0,
      stickY: 0,
      stickId: null,
      stickBaseX: 0,
      stickBaseY: 0,
      tapX: -1,
      tapY: -1,
      taps: [],
    };
    this.enabled = true;
    this.canvas = opts.canvas || null;
    this._listeners = [];
    this._gamepadIndex = -1;
    this._prevGamepadButtons = [];
    this._virtual = new Map(); // action -> boolean (from on-screen buttons)
    this._virtualAxes = { x: 0, y: 0 };
    this._attach();
  }

  // --------------------------------------------------------------- plumbing

  _listen(target, type, handler, opts) {
    target.addEventListener(type, handler, opts);
    this._listeners.push({ target, type, handler, opts });
  }

  _attach() {
    if (typeof window === 'undefined') return;
    this._listen(window, 'keydown', (e) => {
      if (!this.enabled) return;
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      // Prevent the page from scrolling while playing.
      if (
        e.code.startsWith('Arrow') ||
        e.code === 'Space' ||
        e.code === 'Tab' ||
        e.code === 'F5' ||
        e.code === 'F9'
      ) {
        e.preventDefault();
      }
    });
    this._listen(window, 'keyup', (e) => {
      this.keys.delete(e.code);
      this.released.add(e.code);
    });
    this._listen(window, 'blur', () => {
      this.keys.clear();
      this.touch.active = false;
      this.touch.stickId = null;
    });

    if (this.canvas) {
      const canvas = this.canvas;
      const toLocal = (clientX, clientY) => {
        const rect = canvas.getBoundingClientRect();
        return {
          x: ((clientX - rect.left) / rect.width) * canvas.width,
          y: ((clientY - rect.top) / rect.height) * canvas.height,
        };
      };
      this._listen(canvas, 'mousemove', (e) => {
        const p = toLocal(e.clientX, e.clientY);
        this.mouse.x = p.x;
        this.mouse.y = p.y;
        this.mouse.inside = true;
      });
      this._listen(canvas, 'mousedown', (e) => {
        this.mouse.down = true;
        this.mouse.clicked = true;
        const p = toLocal(e.clientX, e.clientY);
        this.mouse.x = p.x;
        this.mouse.y = p.y;
      });
      this._listen(window, 'mouseup', () => {
        this.mouse.down = false;
      });
      this._listen(canvas, 'wheel', (e) => {
        this.mouse.wheel += Math.sign(e.deltaY);
        e.preventDefault();
      }, { passive: false });
      this._listen(canvas, 'contextmenu', (e) => e.preventDefault());

      // ---- touch: left half = virtual stick, right half = buttons/taps ----
      this._listen(canvas, 'touchstart', (e) => {
        if (!this.enabled) return;
        e.preventDefault();
        for (const t of e.changedTouches) {
          const p = toLocal(t.clientX, t.clientY);
          if (p.x < canvas.width * 0.5 && this.touch.stickId === null) {
            this.touch.stickId = t.identifier;
            this.touch.stickBaseX = p.x;
            this.touch.stickBaseY = p.y;
            this.touch.stickX = 0;
            this.touch.stickY = 0;
            this.touch.active = true;
          } else {
            this.touch.taps.push({ x: p.x, y: p.y, id: t.identifier });
            this.touch.tapX = p.x;
            this.touch.tapY = p.y;
            this.mouse.clicked = true;
            this.mouse.x = p.x;
            this.mouse.y = p.y;
          }
        }
      }, { passive: false });
      this._listen(canvas, 'touchmove', (e) => {
        e.preventDefault();
        for (const t of e.changedTouches) {
          if (t.identifier === this.touch.stickId) {
            const p = toLocal(t.clientX, t.clientY);
            const dx = p.x - this.touch.stickBaseX;
            const dy = p.y - this.touch.stickBaseY;
            const maxR = 24;
            const len = Math.sqrt(dx * dx + dy * dy) || 1;
            const clamped = Math.min(len, maxR);
            this.touch.stickX = (dx / len) * (clamped / maxR);
            this.touch.stickY = (dy / len) * (clamped / maxR);
          }
        }
      }, { passive: false });
      const endTouch = (e) => {
        for (const t of e.changedTouches) {
          if (t.identifier === this.touch.stickId) {
            this.touch.stickId = null;
            this.touch.stickX = 0;
            this.touch.stickY = 0;
            this.touch.active = false;
          }
        }
      };
      this._listen(canvas, 'touchend', endTouch);
      this._listen(canvas, 'touchcancel', endTouch);
    }

    // ---- gamepad (optional; cheap polling) ----
    if (typeof window !== 'undefined') {
      this._listen(window, 'gamepadconnected', (e) => {
        this._gamepadIndex = e.gamepad.index;
      });
      this._listen(window, 'gamepaddisconnected', () => {
        this._gamepadIndex = -1;
      });
    }
  }

  detach() {
    for (const l of this._listeners) l.target.removeEventListener(l.type, l.handler, l.opts);
    this._listeners.length = 0;
  }

  // -------------------------------------------------------------- querying

  isDown(action) {
    if (this._virtual.get(action)) return true;
    const codes = this.bindings[action];
    if (!codes) return false;
    for (const code of codes) if (this.keys.has(code)) return true;
    return false;
  }

  justPressed(action) {
    const codes = this.bindings[action];
    if (!codes) return false;
    for (const code of codes) if (this.pressed.has(code)) return true;
    return false;
  }

  justReleased(action) {
    const codes = this.bindings[action];
    if (!codes) return false;
    for (const code of codes) if (this.released.has(code)) return true;
    return false;
  }

  /** Normalized movement vector from keys + virtual stick + gamepad. */
  getMoveVector() {
    let x = 0;
    let y = 0;
    if (this.isDown(Actions.MOVE_LEFT)) x -= 1;
    if (this.isDown(Actions.MOVE_RIGHT)) x += 1;
    if (this.isDown(Actions.MOVE_UP)) y -= 1;
    if (this.isDown(Actions.MOVE_DOWN)) y += 1;
    x += this._virtualAxes.x + this.touch.stickX;
    y += this._virtualAxes.y + this.touch.stickY;
    // gamepad left stick
    const gp = this._getGamepad();
    if (gp && gp.axes.length >= 2) {
      const gx = gp.axes[0];
      const gy = gp.axes[1];
      if (Math.abs(gx) > 0.2) x += gx;
      if (Math.abs(gy) > 0.2) y += gy;
    }
    const len = Math.sqrt(x * x + y * y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    return { x, y };
  }

  _getGamepad() {
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return null;
    try {
      const pads = navigator.getGamepads();
      return this._gamepadIndex >= 0 ? pads[this._gamepadIndex] : null;
    } catch (err) {
      return null;
    }
  }

  /** Poll gamepad buttons into the pressed map (call once per frame). */
  pollGamepad() {
    const gp = this._getGamepad();
    if (!gp) return;
    const map = [
      [0, Actions.ATTACK],
      [1, Actions.DASH],
      [2, Actions.SKILL1],
      [3, Actions.SKILL2],
      [9, Actions.PAUSE],
    ];
    for (const [idx, action] of map) {
      const down = gp.buttons[idx] && gp.buttons[idx].pressed;
      const was = this._prevGamepadButtons[idx];
      if (down && !was) this.pressed.add(`GP_${action}`);
      this._virtual.set(action, down || this._virtual.get(action) === true);
      this._prevGamepadButtons[idx] = down;
    }
  }

  // ------------------------------------------------- virtual (on-screen) UI

  setVirtual(action, down) {
    this._virtual.set(action, down);
    if (down) this.pressed.add(`V_${action}`);
    else this.released.add(`V_${action}`);
  }

  setVirtualStick(x, y) {
    this._virtualAxes.x = x;
    this._virtualAxes.y = y;
  }

  /** Call at end of frame: clears per-frame edges and tap list. */
  endFrame() {
    this.pressed.clear();
    this.released.clear();
    this.mouse.clicked = false;
    this.mouse.wheel = 0;
    this.touch.taps.length = 0;
    for (const [k, v] of this._virtual) {
      if (v && k.startsWith('V_')) this._virtual.delete(k);
    }
    // gamepad-held actions are re-sourced from pollGamepad each frame
  }
}
