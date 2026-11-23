/**
 * storage.js — versioned persistent storage with a memory fallback so the game
 * (and the headless tests) work when localStorage is unavailable. Backed by
 * localStorage in the browser; no external dependencies.
 */

const SCHEMA_VERSION = 3;
const PREFIX = 'sands-of-aether:';

/** In-memory shim used by tests and privacy-mode browsers. */
class MemoryBackend {
  constructor() {
    this.map = new Map();
  }
  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }
  setItem(key, value) {
    this.map.set(key, String(value));
  }
  removeItem(key) {
    this.map.delete(key);
  }
  key(index) {
    return [...this.map.keys()][index] ?? null;
  }
  get length() {
    return this.map.size;
  }
}

function detectBackend() {
  try {
    if (typeof localStorage !== 'undefined') {
      const probe = `${PREFIX}__probe__`;
      localStorage.setItem(probe, '1');
      localStorage.removeItem(probe);
      return localStorage;
    }
  } catch (err) {
    /* private mode / disabled storage */
  }
  return new MemoryBackend();
}

export class Storage {
  constructor(backend = detectBackend()) {
    this.backend = backend;
    this.failures = 0;
    this.memoryMirror = new Map();
  }

  _full(key) {
    return PREFIX + key;
  }

  /**
   * Store a JSON-serializable value. Returns true on success.
   */
  set(key, value) {
    const payload = JSON.stringify({ v: SCHEMA_VERSION, t: Date.now(), d: value });
    this.memoryMirror.set(key, payload);
    try {
      this.backend.setItem(this._full(key), payload);
      return true;
    } catch (err) {
      // Quota exceeded or backend failure — keep the memory copy so the
      // current session still works, and report the failure.
      this.failures += 1;
      if (typeof console !== 'undefined') {
        console.warn('[Storage] set failed for', key, err && err.message);
      }
      return false;
    }
  }

  /**
   * Read a value. Returns `fallback` when missing or corrupt.
   */
  get(key, fallback = null) {
    let raw = null;
    try {
      raw = this.backend.getItem(this._full(key));
    } catch (err) {
      raw = null;
    }
    if (raw == null) raw = this.memoryMirror.get(key) ?? null;
    if (raw == null) return fallback;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && 'd' in parsed) {
        return migrate(key, parsed, fallback);
      }
      return parsed;
    } catch (err) {
      return fallback;
    }
  }

  has(key) {
    return this.get(key, undefined) !== undefined;
  }

  remove(key) {
    this.memoryMirror.delete(key);
    try {
      this.backend.removeItem(this._full(key));
    } catch (err) {
      /* ignore */
    }
  }

  /** All stored keys without the namespace prefix. */
  keys() {
    const out = new Set(this.memoryMirror.keys());
    try {
      for (let i = 0; i < this.backend.length; i += 1) {
        const k = this.backend.key(i);
        if (k && k.startsWith(PREFIX)) out.add(k.slice(PREFIX.length));
      }
    } catch (err) {
      /* ignore */
    }
    return [...out];
  }

  clearAll() {
    for (const key of this.keys()) this.remove(key);
    return this;
  }

  /**
   * Compact two-slot save (primary + backup) with checksums — protects weak
   * devices against torn writes when the browser kills the tab.
   */
  setSaveSlot(slot, value) {
    const body = JSON.stringify(value);
    const sum = checksum(body);
    const ok = this.set(`save:${slot}`, { body, sum });
    this.set(`save:${slot}:meta`, { savedAt: Date.now(), bytes: body.length, sum });
    return ok;
  }

  getSaveSlot(slot) {
    const record = this.get(`save:${slot}`, null);
    if (!record || typeof record !== 'object' || typeof record.body !== 'string') return null;
    if (record.sum !== checksum(record.body)) {
      // Torn/corrupt write — fall back to the backup slot.
      if (slot !== 'backup') return this.getSaveSlot('backup');
      return null;
    }
    try {
      return JSON.parse(record.body);
    } catch (err) {
      return null;
    }
  }

  /** Push a lightweight sync status marker (used by integrations). */
  markSync(tool, status, detail = null) {
    const stamps = this.get('syncStamps', {}) || {};
    stamps[tool] = { status, detail, at: Date.now() };
    return this.set('syncStamps', stamps);
  }

  getSyncStamps() {
    return this.get('syncStamps', {}) || {};
  }
}

function migrate(key, parsed, fallback) {
  // Future schema migrations hook in here, keyed by parsed.v.
  if (parsed.v > SCHEMA_VERSION) return fallback;
  return parsed.d;
}

function checksum(str) {
  // FNV-1a — fast, dependency-free integrity check.
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

/** Singleton shared by the game; tests can construct private instances. */
export const storage = new Storage();
