/**
 * timer.js — frame-driven timer scheduler. Everything is driven by the fixed
 * timestep of the engine, so timers behave identically on fast and slow devices.
 */

export class TimerManager {
  constructor() {
    this.timers = [];
    this._nextId = 1;
    this.timeScale = 1;
    this.elapsed = 0;
  }

  /**
   * Schedule a callback.
   * @param {number} delay seconds until first fire
   * @param {Function} fn called with (elapsedTotal) — return true to repeat
   * @param {object} [opts] { repeat: number|-1 (default 0), tag: string, jitter: number }
   * @returns {number} timer id
   */
  add(delay, fn, opts = {}) {
    const timer = {
      id: this._nextId++,
      delay: Math.max(0, delay),
      remaining: Math.max(0, delay),
      fn,
      repeat: opts.repeat ?? 0, // -1 = forever
      tag: opts.tag || null,
      jitter: opts.jitter || 0,
      paused: false,
      elapsed: 0,
    };
    this.timers.push(timer);
    return timer.id;
  }

  /** Convenience: run once after delay. */
  after(delay, fn, tag = null) {
    return this.add(delay, fn, { repeat: 0, tag });
  }

  /** Convenience: run every interval seconds, optionally a fixed number of times. */
  every(interval, fn, repeat = -1, tag = null) {
    return this.add(interval, fn, { repeat, tag });
  }

  /** Convenience: run fn(t) every frame for `duration` seconds. */
  during(duration, fn, tag = null) {
    const timer = this.add(duration, () => false, { repeat: -1, tag });
    const entry = this.timers.find((t) => t.id === timer);
    if (entry) {
      entry.fn = () => {
        fn(entry.elapsed, duration);
        return entry.elapsed < duration;
      };
    }
    return timer;
  }

  cancel(id) {
    const idx = this.timers.findIndex((t) => t.id === id);
    if (idx >= 0) {
      this.timers.splice(idx, 1);
      return true;
    }
    return false;
  }

  cancelTag(tag) {
    let count = 0;
    for (let i = this.timers.length - 1; i >= 0; i -= 1) {
      if (this.timers[i].tag === tag) {
        this.timers.splice(i, 1);
        count += 1;
      }
    }
    return count;
  }

  pauseTag(tag) {
    for (const t of this.timers) if (t.tag === tag) t.paused = true;
  }

  resumeTag(tag) {
    for (const t of this.timers) if (t.tag === tag) t.paused = false;
  }

  clear() {
    this.timers.length = 0;
    return this;
  }

  /** Advance all timers by dt seconds. Called from the engine's fixed update. */
  update(dt) {
    const scaled = dt * this.timeScale;
    this.elapsed += scaled;
    for (let i = this.timers.length - 1; i >= 0; i -= 1) {
      const t = this.timers[i];
      if (t.paused) continue;
      t.elapsed += scaled;
      t.remaining -= scaled;
      if (t.remaining > 0) continue;
      let keep = false;
      try {
        keep = t.fn(t.elapsed) === true;
      } catch (err) {
        if (typeof console !== 'undefined') console.error('[Timer] callback threw:', err);
      }
      if (keep || t.repeat === -1 || t.repeat > 1) {
        if (t.repeat > 1) t.repeat -= 1;
        const base = Math.max(0.001, t.delay);
        t.remaining += base;
        if (t.jitter > 0) t.remaining += base * t.jitter * (Math.random() * 2 - 1);
        // Avoid spiral-of-death if the frame hiccuped badly.
        if (t.remaining < -base * 3) t.remaining = base;
      } else {
        this.timers.splice(i, 1);
      }
    }
  }

  get count() {
    return this.timers.length;
  }
}
