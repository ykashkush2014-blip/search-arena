/**
 * pool.js — object pooling to keep garbage collection off the hot path.
 * Critical for weak devices: particles, projectiles and float-text recycle
 * the same objects for the whole session.
 */

export class Pool {
  /**
   * @param {Function} factory creates a fresh object
   * @param {Function} [reset] called when an object is released (defaults to noop)
   * @param {number} [initial] prewarm count
   */
  constructor(factory, reset = null, initial = 0) {
    if (typeof factory !== 'function') throw new TypeError('factory must be a function');
    this.factory = factory;
    this.resetFn = reset;
    this.free = [];
    this.live = new Set();
    this.stats = { created: 0, reused: 0, released: 0 };
    if (initial > 0) this.prewarm(initial);
  }

  prewarm(count) {
    for (let i = 0; i < count; i += 1) {
      const obj = this.factory();
      this.stats.created += 1;
      this.free.push(obj);
    }
    return this;
  }

  /** Acquire an object (from the free list when possible). */
  acquire(...args) {
    let obj;
    if (this.free.length > 0) {
      obj = this.free.pop();
      this.stats.reused += 1;
    } else {
      obj = this.factory();
      this.stats.created += 1;
    }
    this.live.add(obj);
    if (typeof obj.acquire === 'function') obj.acquire(...args);
    return obj;
  }

  /** Return an object to the pool. */
  release(obj) {
    if (!this.live.has(obj)) return false;
    this.live.delete(obj);
    if (typeof obj.release === 'function') obj.release();
    if (this.resetFn) this.resetFn(obj);
    this.stats.released += 1;
    this.free.push(obj);
    return true;
  }

  /** Release every live object. */
  releaseAll() {
    for (const obj of [...this.live]) this.release(obj);
    return this;
  }

  get liveCount() {
    return this.live.size;
  }

  get freeCount() {
    return this.free.length;
  }

  /** Hard shrink — useful when switching scenes on memory-constrained devices. */
  trim(maxFree = 32) {
    while (this.free.length > maxFree) this.free.pop();
    return this;
  }
}

/**
 * Pooled array of lightweight records — even cheaper than class instances:
 * used for particles where a plain object with fixed fields is enough.
 */
export class StructPool {
  /**
   * @param {Array<string>} fields
   * @param {number} capacity
   */
  constructor(fields, capacity = 256) {
    this.fields = fields;
    this.capacity = capacity;
    this.items = [];
    for (let i = 0; i < capacity; i += 1) {
      const rec = { active: false };
      for (const f of fields) rec[f] = 0;
      rec.active = false;
      this.items.push(rec);
    }
    this.cursor = 0;
    this.activeCount = 0;
  }

  spawn() {
    // Ring search: bounded O(n) worst case, usually O(1).
    for (let i = 0; i < this.capacity; i += 1) {
      const idx = (this.cursor + i) % this.capacity;
      const rec = this.items[idx];
      if (!rec.active) {
        rec.active = true;
        this.cursor = (idx + 1) % this.capacity;
        this.activeCount += 1;
        return rec;
      }
    }
    return null; // saturated — callers must handle
  }

  kill(rec) {
    if (rec && rec.active) {
      rec.active = false;
      this.activeCount -= 1;
    }
  }

  clear() {
    for (const rec of this.items) rec.active = false;
    this.activeCount = 0;
    this.cursor = 0;
    return this;
  }

  forEachActive(fn) {
    for (let i = 0; i < this.capacity; i += 1) {
      const rec = this.items[i];
      if (rec.active) fn(rec, i);
    }
  }
}
