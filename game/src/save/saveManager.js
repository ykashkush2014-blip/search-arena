/**
 * saveManager.js — full game-state serialization: player, inventory, skills,
 * quests, achievements, world progress and settings. Two-slot safe saves with
 * checksums (core/storage.js) plus optional Supabase cloud push.
 */
import { storage } from '../core/storage.js';
import { Inventory } from '../systems/inventory.js';
import { SkillSystem } from '../systems/skills.js';
import { QuestSystem } from '../systems/quests.js';
import { AchievementSystem } from '../systems/achievements.js';
import { WeatherSystem } from '../systems/weather.js';

export const SAVE_VERSION = 3;

export class SaveManager {
  /**
   * @param {object} dbs — { items, skills, quests, achievements }
   * @param {object} [opts] { storage, integrations }
   */
  constructor(dbs, opts = {}) {
    this.dbs = dbs;
    this.storage = opts.storage ?? storage;
    this.integrations = opts.integrations ?? null;
    this.lastSaveAt = 0;
  }

  hasSave() {
    return this.storage.getSaveSlot('main') !== null;
  }

  /**
   * Collect the full state from a running game instance.
   */
  capture(game) {
    return {
      version: SAVE_VERSION,
      savedAt: Date.now(),
      player: {
        name: game.player.name,
        level: game.player.level,
        xp: game.player.xp,
        xpNext: game.player.xpNext,
        gold: game.player.gold,
        hp: game.player.hp,
        mana: game.player.mana,
        x: game.player.x,
        y: game.player.y,
        kills: game.player.kills,
        deaths: game.player.deaths,
        runTime: game.player.runTime,
        baseStats: game.player.baseStats,
      },
      inventory: game.inventory.serialize(),
      skills: game.skills.serialize(),
      quests: game.quests.serialize(),
      achievements: game.achievements.serialize(),
      dialogue: game.dialogue.serialize(),
      weather: game.world?.weather?.serialize() ?? null,
      dayNight: game.world?.dayNight?.serialize() ?? null,
      progress: {
        levelId: game.world?.levelId ?? 'level-01',
        levelsCleared: game.progress?.levelsCleared ?? [],
        chestsOpened: game.progress?.chestsOpened ?? [],
        secretsFound: game.progress?.secretsFound ?? [],
        score: game.progress?.score ?? 0,
      },
      settings: { ...game.settings },
      meta: {
        lang: game.lang,
        playTime: game.totalPlayTime ?? 0,
      },
    };
  }

  /** Save to both local slots and (best-effort) the cloud. */
  save(game, opts = {}) {
    const data = this.capture(game);
    const okMain = this.storage.setSaveSlot('main', data);
    this.storage.setSaveSlot('backup', data);
    this.lastSaveAt = Date.now();
    if (this.integrations && opts.cloud !== false) {
      this.integrations.pushSave(data).catch(() => {});
    }
    return okMain;
  }

  /**
   * Restore into a game instance. Returns true on success.
   */
  load(game) {
    const data = this.storage.getSaveSlot('main') ?? this.storage.getSaveSlot('backup');
    if (!data || typeof data !== 'object') return false;
    return this.apply(game, data);
  }

  /** Apply a save payload (local or cloud) to the game. */
  apply(game, data) {
    try {
      if (data.version > SAVE_VERSION) return false;
      const p = data.player ?? {};
      Object.assign(game.player, {
        name: p.name ?? game.player.name,
        level: p.level ?? 1,
        xp: p.xp ?? 0,
        xpNext: p.xpNext ?? 100,
        gold: p.gold ?? 0,
        kills: p.kills ?? 0,
        deaths: p.deaths ?? 0,
        runTime: p.runTime ?? 0,
      });
      if (p.baseStats) game.player.baseStats = { ...game.player.baseStats, ...p.baseStats };
      game.inventory = Inventory.deserialize(data.inventory ?? { stacks: [] }, this.dbs.items);
      game.inventory.onEquipChanged = (bonuses) => game.player.recalcStats(bonuses);
      game.player.recalcStats(game.inventory.equipmentBonuses());
      game.player.hp = p.hp ?? game.player.stats.maxHp;
      game.player.mana = p.mana ?? game.player.stats.maxMana;
      game.skills = SkillSystem.deserialize(data.skills ?? {}, this.dbs.skills);
      game.quests = QuestSystem.deserialize(data.quests ?? {}, this.dbs.quests);
      game.quests.bindEvents();
      game.achievements = AchievementSystem.deserialize(data.achievements ?? {}, this.dbs.achievements);
      game.achievements.bindEvents();
      if (data.dialogue && game.dialogue) {
        game.dialogue = game.dialogue.constructor.deserialize(data.dialogue, this.dbs.dialogues ?? {});
      }
      game.progress = {
        levelsCleared: data.progress?.levelsCleared ?? [],
        chestsOpened: data.progress?.chestsOpened ?? [],
        secretsFound: data.progress?.secretsFound ?? [],
        score: data.progress?.score ?? 0,
      };
      game.settings = { ...game.settings, ...(data.settings ?? {}) };
      game.lang = data.meta?.lang ?? game.lang;
      game.totalPlayTime = data.meta?.playTime ?? 0;
      game.pendingSpawn = { x: p.x, y: p.y, levelId: data.progress?.levelId ?? 'level-01' };
      return true;
    } catch (err) {
      if (typeof console !== 'undefined') console.error('[SaveManager] apply failed:', err);
      return false;
    }
  }

  /** Quick export/import as JSON text (for sharing/cloud fallback). */
  export(game) {
    return JSON.stringify(this.capture(game));
  }

  import(game, json) {
    try {
      return this.apply(game, JSON.parse(json));
    } catch (err) {
      return false;
    }
  }

  clear() {
    this.storage.remove('save:main');
    this.storage.remove('save:backup');
    this.storage.remove('save:main:meta');
    this.storage.remove('save:backup:meta');
    return this;
  }
}

/** Settings persistence (independent of game saves). */
export function loadSettings(defaults = {}) {
  return { ...defaults, ...(storage.get('settings', {}) ?? {}) };
}

export function persistSettings(settings) {
  return storage.set('settings', settings);
}

export { WeatherSystem };
