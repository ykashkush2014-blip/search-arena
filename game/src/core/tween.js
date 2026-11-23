/**
 * tween.js — lightweight property tweening with easing. Used for UI panels,
 * camera pushes, damage flashes and floating reward text.
 */
import { EASE, clamp01, lerp } from './mathx.js';

export class TweenManager {
  constructor() {
    this.tweens = [];
    this._nextId = 1;
  }

  /**
   * Tween numeric properties of `target` toward `to` over `duration` seconds.
   * @param {object} target
   * @param {object} to { prop: value, ... }
   * @param {number} duration seconds
   * @param {string|Function} [ease] key of EASE or custom fn(t)->t
   * @param {object} [opts] { delay, onUpdate, onComplete, tag, from }
   * @returns {number} tween id
   */
  to(target, to, duration = 0.3, ease = 'outQuad', opts = {}) {
    const easeFn = typeof ease === 'function' ? ease : EASE[ease] || EASE.outQuad;
    const from = {};
    for (const key of Object.keys(to)) {
      from[key] = opts.from && key in opts.from ? opts.from[key] : Number(target[key] ?? 0);
    }
    const tween = {
      id: this._nextId++,
      target,
      from,
      to: { ...to },
      duration: Math.max(0.0001, duration),
      easeFn,
      elapsed: 0,
      delay: opts.delay || 0,
      onUpdate: opts.onUpdate || null,
      onComplete: opts.onComplete || null,
      tag: opts.tag || null,
      done: false,
    };
    this.tweens.push(tween);
    return tween.id;
  }

  /** Shake helper for impacts. */
  shake(target, propX, propY, strength = 3, duration = 0.25, tag = null) {
    const baseX = target[propX];
    const baseY = target[propY];
    const id = this.to(
      target,
      { [propX]: baseX, [propY]: baseY },
      duration,
      'outQuad',
      {
        tag,
        from: { [propX]: baseX + strength, [propY]: baseY - strength },
        onUpdate: (t, k) => {
          const decay = 1 - k;
          target[propX] = baseX + (Math.random() * 2 - 1) * strength * decay;
          target[propY] = baseY + (Math.random() * 2 - 1) * strength * decay;
        },
        onComplete: () => {
          target[propX] = baseX;
          target[propY] = baseY;
        },
      },
    );
    return id;
  }

  /** Kill a tween by id. */
  cancel(id) {
    const idx = this.tweens.findIndex((t) => t.id === id);
    if (idx >= 0) {
      this.tweens.splice(idx, 1);
      return true;
    }
    return false;
  }

  cancelTag(tag) {
    let count = 0;
    for (let i = this.tweens.length - 1; i >= 0; i -= 1) {
      if (this.tweens[i].tag === tag) {
        this.tweens.splice(i, 1);
        count += 1;
      }
    }
    return count;
  }

  /** Immediately complete every tween on a target (used on scene exit). */
  finishTarget(target) {
    for (const t of this.tweens) {
      if (t.target === target) t.elapsed = t.duration;
    }
    this.update(0);
  }

  clear() {
    this.tweens.length = 0;
    return this;
  }

  update(dt) {
    for (let i = this.tweens.length - 1; i >= 0; i -= 1) {
      const t = this.tweens[i];
      if (t.delay > 0) {
        t.delay -= dt;
        if (t.delay > 0) continue;
      }
      t.elapsed += dt;
      const k = clamp01(t.elapsed / t.duration);
      const eased = t.easeFn(k);
      for (const key of Object.keys(t.to)) {
        t.target[key] = lerp(t.from[key], t.to[key], eased);
      }
      if (t.onUpdate) {
        try {
          t.onUpdate(t.target, k);
        } catch (err) {
          if (typeof console !== 'undefined') console.error('[Tween] onUpdate threw:', err);
        }
      }
      if (k >= 1) {
        if (t.onComplete) {
          try {
            t.onComplete(t.target);
          } catch (err) {
            if (typeof console !== 'undefined') console.error('[Tween] onComplete threw:', err);
          }
        }
        this.tweens.splice(i, 1);
      }
    }
  }

  get count() {
    return this.tweens.length;
  }
}
