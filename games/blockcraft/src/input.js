// Input: keyboard, mouse (pointer lock and drag-look), touch joystick + look pad.
export class Input {
  constructor(domElement, hooks = {}) {
    this.dom = domElement;
    this.hooks = hooks;
    this.keys = new Set();
    this.mouse = { dx: 0, dy: 0 };
    this.lookDelta = { x: 0, y: 0 };
    this.dragging = false;
    this.lastTouch = null;
    this.pointerLocked = false;
    this.touchMove = { x: 0, y: 0 }; // -1..1 joystick
    this.touchLook = { x: 0, y: 0 };
    this.touchActive = false;
    this.jumpTouch = false;
    this.sprintTouch = false;
    this.sensitivity = 0.0024;
    this.invertY = false;
    this.onAction = null; // ('break'|'place'|'pick')
    this.bind();
  }

  bind() {
    const isTypingTarget = (e) => e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName);

    window.addEventListener('keydown', (e) => {
      if (isTypingTarget(e)) return;
      const code = e.code;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(code)) e.preventDefault();
      this.keys.add(code);
      if (e.repeat) return;
      if (code === 'Escape') this.hooks.onEscape?.();
      if (code === 'KeyE') this.hooks.onInventory?.();
      if (code === 'KeyF') this.hooks.onFly?.();
      if (code === 'KeyM') this.hooks.onMap?.();
      if (code === 'KeyQ') this.hooks.onMute?.();
      if (code === 'KeyR') this.hooks.onRespawn?.();
      if (code === 'KeyT') this.hooks.onTime?.();
      if (code.startsWith('Digit')) {
        const n = Number(code.slice(5));
        if (n >= 1 && n <= 9) this.hooks.onSlot?.(n - 1);
        if (n === 0) this.hooks.onSlot?.(9);
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    this.dom.addEventListener('mousedown', (e) => {
      if (!document.pointerLockElement && e.button === 0) {
        // First click grabs the mouse; if pointer lock is unavailable, drag to look.
        this.hooks.onFirstClick?.();
      }
      if (document.pointerLockElement === this.dom) {
        if (e.button === 0) this.onAction?.('break');
        if (e.button === 2) this.onAction?.('place');
        if (e.button === 1) { e.preventDefault(); this.onAction?.('pick'); }
      } else if (e.button === 0) {
        this.dragging = true;
      }
    });
    window.addEventListener('mouseup', () => { this.dragging = false; });
    this.dom.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === this.dom) {
        this.lookDelta.x += e.movementX * this.sensitivity;
        this.lookDelta.y += e.movementY * this.sensitivity * (this.invertY ? -1 : 1);
      } else if (this.dragging) {
        this.lookDelta.x += e.movementX * this.sensitivity;
        this.lookDelta.y += e.movementY * this.sensitivity * (this.invertY ? -1 : 1);
      }
    });
    this.dom.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.hooks.onWheel?.(Math.sign(e.deltaY));
    }, { passive: false });

    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.dom;
      this.hooks.onPointerLockChange?.(this.pointerLocked);
    });
  }

  requestPointerLock() {
    // Available only on desktop browsers with a real pointer.
    if (window.matchMedia('(pointer: coarse)').matches) return;
    const p = this.dom.requestPointerLock?.();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  }

  consumeLook() {
    const out = { x: this.lookDelta.x, y: this.lookDelta.y };
    this.lookDelta.x = 0;
    this.lookDelta.y = 0;
    return out;
  }

  axis() {
    let forward = 0;
    let strafe = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) forward += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) forward -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) strafe += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) strafe -= 1;
    forward += this.touchMove.y;
    strafe += this.touchMove.x;
    forward = Math.max(-1, Math.min(1, forward));
    strafe = Math.max(-1, Math.min(1, strafe));
    return {
      forward,
      strafe,
      jump: this.keys.has('Space') || this.jumpTouch,
      down: this.keys.has('ShiftLeft') && false,
      sprint: this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.sprintTouch,
    };
  }

  bindTouch({ joystick, knob, lookPad, jumpBtn, sprintBtn, actionBreak, actionPlace }) {
    const setKnob = (dx, dy) => {
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
    };
    let joyId = null;
    const center = () => {
      const r = joystick.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width / 2 };
    };
    const handleJoy = (t) => {
      const c = center();
      let dx = t.clientX - c.x;
      let dy = t.clientY - c.y;
      const len = Math.hypot(dx, dy);
      const max = c.r * 0.82;
      if (len > max) { dx = (dx / len) * max; dy = (dy / len) * max; }
      setKnob(dx, dy);
      this.touchMove.x = dx / max;
      this.touchMove.y = -dy / max;
    };
    joystick.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      joyId = t.identifier;
      this.touchActive = true;
      handleJoy(t);
    }, { passive: false });
    joystick.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) if (t.identifier === joyId) handleJoy(t);
    }, { passive: false });
    const endJoy = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === joyId) {
          joyId = null;
          this.touchMove.x = 0;
          this.touchMove.y = 0;
          setKnob(0, 0);
        }
      }
    };
    joystick.addEventListener('touchend', endJoy);
    joystick.addEventListener('touchcancel', endJoy);

    let lookId = null;
    let last = null;
    lookPad.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      lookId = t.identifier;
      last = { x: t.clientX, y: t.clientY };
    }, { passive: false });
    lookPad.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier !== lookId) continue;
        const dx = t.clientX - last.x;
        const dy = t.clientY - last.y;
        last = { x: t.clientX, y: t.clientY };
        this.lookDelta.x += dx * 0.0045;
        this.lookDelta.y += dy * 0.0045;
      }
    }, { passive: false });
    const endLook = (e) => {
      for (const t of e.changedTouches) if (t.identifier === lookId) { lookId = null; last = null; }
    };
    lookPad.addEventListener('touchend', endLook);
    lookPad.addEventListener('touchcancel', endLook);

    const tap = (el, onDown, onUp) => {
      el.addEventListener('touchstart', (e) => { e.preventDefault(); onDown?.(); }, { passive: false });
      el.addEventListener('touchend', (e) => { e.preventDefault(); onUp?.(); }, { passive: false });
      el.addEventListener('touchcancel', () => onUp?.());
    };
    tap(jumpBtn, () => { this.jumpTouch = true; }, () => { this.jumpTouch = false; });
    tap(sprintBtn, () => { this.sprintTouch = true; }, () => { this.sprintTouch = false; });
  }
}
