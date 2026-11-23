/**
 * achievements.js — persistent accomplishments with progress counters.
 * Listens on the game event bus; unlocks toast + integrate with cloud sync.
 */
import { gameEvents, Events } from '../core/events.js';

export class AchievementSystem {
  /**
   * @param {object} achievementDb — ACHIEVEMENTS map
   */
  constructor(achievementDb) {
    this.db = achievementDb;
    this.unlocked = new Set();
    this.progress = new Map(); // achievementId -> current count
    this.listenersBound = false;
    this.onUnlock = null;
  }

  bindEvents(events = gameEvents) {
    if (this.listenersBound) return this;
    this.listenersBound = true;
    events.on(Events.ENTITY_DEATH, (e) => this._track('kill', e));
    events.on(Events.BOSS_DEFEAT, (e) => this._track('boss', e));
    events.on(Events.QUEST_COMPLETED, (e) => this._track('quest', e));
    events.on(Events.ITEM_CRAFT, (e) => this._track('craft', e));
    events.on(Events.PLAYER_LEVELUP, (e) => this._track('levelup', e));
    events.on(Events.CHEST_OPENED, (e) => this._track('chest', e));
    events.on(Events.SECRET_FOUND, (e) => this._track('secret', e));
    events.on(Events.ITEM_PICKUP, (e) => this._track('pickup', e));
    events.on(Events.GOLD_CHANGED, (e) => this._track('gold', e));
    events.on(Events.PLAYER_DEATH, (e) => this._track('death', e));
    events.on(Events.WEATHER_CHANGED, (e) => this._track('weather', e));
    events.on(Events.LEVEL_CLEAR, (e) => this._track('levelClear', e));
    return this;
  }

  isUnlocked(id) {
    return this.unlocked.has(id);
  }

  progressOf(id) {
    return this.progress.get(id) ?? 0;
  }

  /** Generic counter bump + unlock check. */
  trackCustom(id, amount = 1) {
    const def = this.db[id];
    if (!def || this.unlocked.has(id)) return false;
    const current = (this.progress.get(id) ?? 0) + amount;
    this.progress.set(id, current);
    return this._maybeUnlock(id, def, current);
  }

  _track(kind, event) {
    for (const [id, def] of Object.entries(this.db)) {
      if (this.unlocked.has(id)) continue;
      if (def.trigger !== kind) continue;
      if (def.match && !this._matches(def.match, event)) continue;
      const amount = this._amountFor(kind, def, event);
      if (amount <= 0) continue;
      const current = (this.progress.get(id) ?? 0) + amount;
      this.progress.set(id, current);
      this._maybeUnlock(id, def, current);
    }
    // instant one-shot achievements
    void event;
  }

  _matches(match, event) {
    for (const [key, value] of Object.entries(match)) {
      const actual = this._deepGet(event, key);
      if (Array.isArray(value)) {
        if (!value.includes(actual)) return false;
      } else if (actual !== value) {
        return false;
      }
    }
    return true;
  }

  _deepGet(obj, path) {
    return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
  }

  _amountFor(kind, def, event) {
    switch (kind) {
      case 'gold':
        return def.cumulative ? Math.max(0, event.amount ?? 0) : (event.amount ?? 0) >= (def.threshold ?? 1) ? 1 : 0;
      case 'pickup':
        return def.match?.itemId ? (event.itemId === def.match.itemId ? event.count ?? 1 : 0) : 1;
      case 'levelup':
        return event.leveled ? 1 : 0;
      default:
        return 1;
    }
  }

  _maybeUnlock(id, def, current) {
    const target = def.target ?? 1;
    if (current < target) return false;
    this.unlocked.add(id);
    gameEvents.emit(Events.ACHIEVEMENT_UNLOCKED, { id, def });
    if (this.onUnlock) this.onUnlock(id, def);
    return true;
  }

  /** Completion ratio for the whole set (UI progress bar). */
  completionRatio() {
    const total = Object.keys(this.db).length;
    return total > 0 ? this.unlocked.size / total : 0;
  }

  list() {
    return Object.entries(this.db).map(([id, def]) => ({
      id,
      def,
      unlocked: this.unlocked.has(id),
      progress: this.progressOf(id),
      target: def.target ?? 1,
    }));
  }

  serialize() {
    return {
      unlocked: [...this.unlocked],
      progress: [...this.progress.entries()],
    };
  }

  static deserialize(data, achievementDb) {
    const sys = new AchievementSystem(achievementDb);
    sys.unlocked = new Set(data.unlocked ?? []);
    sys.progress = new Map(data.progress ?? []);
    return sys;
  }
}
