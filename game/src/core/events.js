/**
 * events.js — tiny synchronous event bus. Used across systems (quests listen to
 * combat events, achievements listen to quest events, audio listens to UI, …).
 * Node-safe: no DOM references.
 */

export class EventBus {
  constructor() {
    this._handlers = new Map();
    this._once = new Map();
    this._queue = [];
    this._emitting = false;
  }

  /**
   * Subscribe. Returns an unsubscribe function.
   * @param {string} type
   * @param {Function} handler
   * @param {*} [ctx] optional `this` for the handler
   */
  on(type, handler, ctx = null) {
    if (typeof handler !== 'function') throw new TypeError('handler must be a function');
    const list = this._handlers.get(type) || [];
    list.push({ handler, ctx });
    this._handlers.set(type, list);
    return () => this.off(type, handler, ctx);
  }

  /** Subscribe for a single delivery. */
  once(type, handler, ctx = null) {
    const off = this.on(
      type,
      (payload) => {
        off();
        handler.call(ctx, payload);
      },
      ctx,
    );
    return off;
  }

  off(type, handler, ctx = null) {
    const list = this._handlers.get(type);
    if (!list) return;
    const idx = list.findIndex((h) => h.handler === handler && h.ctx === ctx);
    if (idx >= 0) list.splice(idx, 1);
    if (list.length === 0) this._handlers.delete(type);
  }

  /** Remove everything, optionally only one type. */
  clear(type = null) {
    if (type === null) {
      this._handlers.clear();
      this._once.clear();
    } else {
      this._handlers.delete(type);
    }
  }

  /**
   * Emit. Handlers registered during emission do not receive the current event.
   * Re-entrant emits are queued to avoid deep recursion.
   */
  emit(type, payload = null) {
    if (this._emitting) {
      this._queue.push([type, payload]);
      return;
    }
    this._emitting = true;
    try {
      this._deliver(type, payload);
      while (this._queue.length > 0) {
        const [t, p] = this._queue.shift();
        this._deliver(t, p);
      }
    } finally {
      this._emitting = false;
    }
  }

  _deliver(type, payload) {
    const list = this._handlers.get(type);
    if (!list || list.length === 0) return;
    // Copy so handlers can unsubscribe during emission.
    const snapshot = list.slice();
    for (const entry of snapshot) {
      try {
        entry.handler.call(entry.ctx, payload);
      } catch (err) {
        // One bad listener must never break the game loop.
        if (typeof console !== 'undefined') {
          console.error(`[EventBus] handler for "${type}" threw:`, err);
        }
      }
    }
  }

  /** Number of listeners for a type (or total when type omitted). */
  listenerCount(type = null) {
    if (type !== null) {
      const list = this._handlers.get(type);
      return list ? list.length : 0;
    }
    let total = 0;
    for (const list of this._handlers.values()) total += list.length;
    return total;
  }
}

/** Shared global bus for cross-cutting gameplay events. */
export const gameEvents = new EventBus();

/** Canonical event names — keep systems consistent. */
export const Events = {
  // lifecycle
  BOOT: 'boot',
  READY: 'ready',
  RESIZE: 'resize',
  VISIBILITY: 'visibility',
  QUALITY_CHANGED: 'qualityChanged',
  FPS_WARNING: 'fpsWarning',

  // game flow
  GAME_START: 'gameStart',
  GAME_PAUSE: 'gamePause',
  GAME_RESUME: 'gameResume',
  GAME_OVER: 'gameOver',
  LEVEL_ENTER: 'levelEnter',
  LEVEL_CLEAR: 'levelClear',
  LEVEL_EXIT: 'levelExit',
  BOSS_SPAWN: 'bossSpawn',
  BOSS_DEFEAT: 'bossDefeat',

  // entities
  ENTITY_SPAWN: 'entitySpawn',
  ENTITY_DEATH: 'entityDeath',
  ENTITY_HIT: 'entityHit',
  PLAYER_HIT: 'playerHit',
  PLAYER_DEATH: 'playerDeath',
  PLAYER_LEVELUP: 'playerLevelUp',
  PLAYER_HEAL: 'playerHeal',
  PROJECTILE_FIRED: 'projectileFired',

  // economy / items
  ITEM_PICKUP: 'itemPickup',
  ITEM_USE: 'itemUse',
  ITEM_CRAFT: 'itemCraft',
  ITEM_SELL: 'itemSell',
  ITEM_BUY: 'itemBuy',
  GOLD_CHANGED: 'goldChanged',
  CHEST_OPENED: 'chestOpened',

  // progression
  QUEST_ACCEPTED: 'questAccepted',
  QUEST_PROGRESS: 'questProgress',
  QUEST_COMPLETED: 'questCompleted',
  ACHIEVEMENT_UNLOCKED: 'achievementUnlocked',
  DIALOGUE_START: 'dialogueStart',
  DIALOGUE_END: 'dialogueEnd',
  SKILL_UNLOCKED: 'skillUnlocked',
  SKILL_USED: 'skillUsed',
  FLAG_SET: 'flagSet',

  // world
  WEATHER_CHANGED: 'weatherChanged',
  TIME_OF_DAY: 'timeOfDay',
  SECRET_FOUND: 'secretFound',
  TRIGGER_ENTER: 'triggerEnter',
  PORTAL_USED: 'portalUsed',

  // integrations
  INTEGRATION_STATUS: 'integrationStatus',
  LEADERBOARD_UPDATE: 'leaderboardUpdate',
  CLOUD_SYNC: 'cloudSync',
  OFFLINE_QUEUE_FLUSH: 'offlineQueueFlush',
  NEWS_UPDATE: 'newsUpdate',

  // ui
  UI_OPEN: 'uiOpen',
  UI_CLOSE: 'uiClose',
  UI_CLICK: 'uiClick',
  TOAST: 'toast',
  LANGUAGE_CHANGED: 'languageChanged',
};
