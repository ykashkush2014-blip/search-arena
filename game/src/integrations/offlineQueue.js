/**
 * offlineQueue.js — durable queue for actions that need the network
 * (score submits, cloud saves). Survives restarts via storage.
 */
export class OfflineQueue {
  /**
   * @param {object} [storage] — core/storage.js instance
   * @param {number} [maxSize]
   */
  constructor(storage = null, maxSize = 40) {
    this.storage = storage;
    this.maxSize = maxSize;
    this.items = [];
    this._load();
  }

  get size() {
    return this.items.length;
  }

  push(kind, payload) {
    this.items.push({ kind, payload, at: Date.now() });
    if (this.items.length > this.maxSize) this.items.shift();
    this._save();
    return this.items.length;
  }

  drain() {
    const out = this.items.slice();
    this.items.length = 0;
    this._save();
    return out;
  }

  peek() {
    return this.items.slice();
  }

  clear() {
    this.items.length = 0;
    this._save();
    return this;
  }

  _load() {
    if (!this.storage) return;
    const saved = this.storage.get('offlineQueue', null);
    if (Array.isArray(saved)) this.items = saved;
  }

  _save() {
    if (!this.storage) return;
    this.storage.set('offlineQueue', this.items);
  }
}
