/**
 * quests.js — quest state machine: accept, progress via game events, turn in
 * for rewards. Quest definitions come from data/questsData.js + generated
 * seasonal quests (Linear Quest Board integration).
 */
import { gameEvents, Events } from '../core/events.js';

export const QuestState = {
  LOCKED: 'locked',
  AVAILABLE: 'available',
  ACTIVE: 'active',
  READY: 'ready', // objectives complete, needs turn-in
  COMPLETED: 'completed',
  FAILED: 'failed',
};

export const ObjectiveTypes = {
  KILL: 'kill',
  COLLECT: 'collect',
  REACH: 'reach',
  BOSS: 'boss',
  TALK: 'talk',
  CRAFT: 'craft',
  CHEST: 'chest',
  EXPLORE: 'explore',
  SURVIVE: 'survive',
};

export class QuestSystem {
  /**
   * @param {object} questDb — QUESTS map
   */
  constructor(questDb) {
    this.questDb = questDb;
    this.states = new Map(); // questId -> { state, progress: number[], acceptedAt }
    this.listenersBound = false;
    this.activeLimit = 8;
    this.completionOrder = [];
  }

  bindEvents(events = gameEvents) {
    if (this.listenersBound) return this;
    this.listenersBound = true;
    events.on(Events.ENTITY_DEATH, (e) => this._onKill(e));
    events.on(Events.ITEM_PICKUP, (e) => this._onPickup(e));
    events.on(Events.LEVEL_ENTER, (e) => this._onReach(e));
    events.on(Events.BOSS_DEFEAT, (e) => this._onBoss(e));
    events.on(Events.ITEM_CRAFT, (e) => this._onCraft(e));
    events.on(Events.CHEST_OPENED, (e) => this._onChest(e));
    events.on(Events.DIALOGUE_END, (e) => this._onTalk(e));
    return this;
  }

  stateOf(questId) {
    return this.states.get(questId)?.state ?? QuestState.LOCKED;
  }

  progressOf(questId) {
    return this.states.get(questId)?.progress ?? [];
  }

  get(questId) {
    return this.questDb[questId] ?? null;
  }

  /** Unlock a quest (becomes AVAILABLE). Prereq chains call this. */
  unlock(questId) {
    const def = this.get(questId);
    if (!def) return false;
    const current = this.states.get(questId);
    if (current && current.state !== QuestState.LOCKED) return false;
    this.states.set(questId, { state: QuestState.AVAILABLE, progress: (def.objectives ?? []).map(() => 0), acceptedAt: 0 });
    return true;
  }

  /** Bootstrap: unlock every quest without prerequisites. */
  bootstrap() {
    for (const [id, def] of Object.entries(this.questDb)) {
      const prereqs = def.prereqs ?? [];
      if (prereqs.length === 0) this.unlock(id);
    }
    return this;
  }

  canAccept(questId) {
    const def = this.get(questId);
    if (!def) return false;
    const st = this.stateOf(questId);
    if (st !== QuestState.AVAILABLE) return false;
    const active = [...this.states.values()].filter((s) => s.state === QuestState.ACTIVE).length;
    if (active >= this.activeLimit) return false;
    for (const pre of def.prereqs ?? []) {
      if (this.stateOf(pre) !== QuestState.COMPLETED) return false;
    }
    return true;
  }

  accept(questId) {
    if (!this.canAccept(questId)) return false;
    const def = this.get(questId);
    const entry = this.states.get(questId);
    entry.state = QuestState.ACTIVE;
    entry.acceptedAt = Date.now();
    // Collect-type quests snapshot current counts? Simplest: count from accept time.
    gameEvents.emit(Events.QUEST_ACCEPTED, { questId, def });
    // immediate checks (e.g. "talk" objectives already satisfied)
    this._checkCompletion(questId);
    return true;
  }

  /** Increment an objective. Returns true when the quest changed state. */
  increment(questId, objectiveIndex, amount = 1) {
    const def = this.get(questId);
    const entry = this.states.get(questId);
    if (!def || !entry) return false;
    if (entry.state !== QuestState.ACTIVE && entry.state !== QuestState.READY) return false;
    const obj = (def.objectives ?? [])[objectiveIndex];
    if (!obj) return false;
    const before = entry.progress[objectiveIndex] ?? 0;
    entry.progress[objectiveIndex] = Math.min(obj.count ?? 1, before + amount);
    gameEvents.emit(Events.QUEST_PROGRESS, {
      questId,
      objectiveIndex,
      progress: entry.progress[objectiveIndex],
      target: obj.count ?? 1,
    });
    return this._checkCompletion(questId);
  }

  _checkCompletion(questId) {
    const def = this.get(questId);
    const entry = this.states.get(questId);
    if (!def || !entry) return false;
    if (entry.state !== QuestState.ACTIVE) return false;
    const objectives = def.objectives ?? [];
    const done = objectives.every((obj, i) => (entry.progress[i] ?? 0) >= (obj.count ?? 1));
    if (done) {
      entry.state = QuestState.READY;
      return true;
    }
    return false;
  }

  /** Turn in a READY quest and grant rewards. */
  complete(questId, player, inventory) {
    const def = this.get(questId);
    const entry = this.states.get(questId);
    if (!def || !entry || entry.state !== QuestState.READY) return false;
    entry.state = QuestState.COMPLETED;
    this.completionOrder.push(questId);
    const rewards = def.rewards ?? {};
    if (player) {
      if (rewards.xp) {
        const res = player.gainXp(rewards.xp);
        if (res.leveled) gameEvents.emit(Events.PLAYER_LEVELUP, { player, leveled: true });
      }
      if (rewards.gold) player.addGold(rewards.gold);
    }
    if (inventory && rewards.items) {
      for (const it of rewards.items) {
        inventory.add(it.itemId ?? it.id, it.count ?? 1);
      }
    }
    gameEvents.emit(Events.QUEST_COMPLETED, { questId, def, rewards });
    // unlock follow-ups
    for (const [id, other] of Object.entries(this.questDb)) {
      if ((other.prereqs ?? []).includes(questId)) this.unlock(id);
    }
    return true;
  }

  activeQuests() {
    const out = [];
    for (const [id, entry] of this.states) {
      if (entry.state === QuestState.ACTIVE || entry.state === QuestState.READY) {
        out.push({ id, def: this.questDb[id], ...entry });
      }
    }
    return out;
  }

  completedCount() {
    return [...this.states.values()].filter((s) => s.state === QuestState.COMPLETED).length;
  }

  // ------------------------------------------------------------ handlers

  _onKill(e) {
    const target = e.target;
    if (!target || !target.def) return;
    const kind = target.def.id ?? target.kind;
    for (const [id, entry] of this.states) {
      if (entry.state !== QuestState.ACTIVE) continue;
      const def = this.questDb[id];
      (def.objectives ?? []).forEach((obj, i) => {
        if (obj.type === ObjectiveTypes.KILL && obj.target === kind) {
          this.increment(id, i, 1);
        }
      });
    }
  }

  _onPickup(e) {
    for (const [id, entry] of this.states) {
      if (entry.state !== QuestState.ACTIVE) continue;
      const def = this.questDb[id];
      (def.objectives ?? []).forEach((obj, i) => {
        if (obj.type === ObjectiveTypes.COLLECT && obj.target === e.itemId) {
          this.increment(id, i, e.count ?? 1);
        }
      });
    }
  }

  _onReach(e) {
    for (const [id, entry] of this.states) {
      if (entry.state !== QuestState.ACTIVE) continue;
      const def = this.questDb[id];
      (def.objectives ?? []).forEach((obj, i) => {
        if (obj.type === ObjectiveTypes.REACH && obj.target === e.levelId) {
          this.increment(id, i, 1);
        }
      });
    }
  }

  _onBoss(e) {
    const kind = e.boss?.def?.id ?? 'boss';
    for (const [id, entry] of this.states) {
      if (entry.state !== QuestState.ACTIVE) continue;
      const def = this.questDb[id];
      (def.objectives ?? []).forEach((obj, i) => {
        if (obj.type === ObjectiveTypes.BOSS && (obj.target === kind || obj.target === 'any')) {
          this.increment(id, i, 1);
        }
      });
    }
  }

  _onCraft(e) {
    for (const [id, entry] of this.states) {
      if (entry.state !== QuestState.ACTIVE) continue;
      const def = this.questDb[id];
      (def.objectives ?? []).forEach((obj, i) => {
        if (obj.type === ObjectiveTypes.CRAFT && (obj.target === e.itemId || obj.target === 'any')) {
          this.increment(id, i, 1);
        }
      });
    }
  }

  _onChest(e) {
    for (const [id, entry] of this.states) {
      if (entry.state !== QuestState.ACTIVE) continue;
      const def = this.questDb[id];
      (def.objectives ?? []).forEach((obj, i) => {
        if (obj.type === ObjectiveTypes.CHEST) {
          this.increment(id, i, 1);
        }
      });
    }
  }

  _onTalk(e) {
    for (const [id, entry] of this.states) {
      if (entry.state !== QuestState.ACTIVE) continue;
      const def = this.questDb[id];
      (def.objectives ?? []).forEach((obj, i) => {
        if (obj.type === ObjectiveTypes.TALK && obj.target === e.npcId) {
          this.increment(id, i, 1);
        }
      });
    }
  }

  serialize() {
    return {
      states: [...this.states.entries()].map(([id, s]) => [id, s.state, s.progress, s.acceptedAt]),
      completionOrder: [...this.completionOrder],
    };
  }

  static deserialize(data, questDb) {
    const sys = new QuestSystem(questDb);
    for (const [id, state, progress, acceptedAt] of data.states ?? []) {
      sys.states.set(id, { state, progress: progress ?? [], acceptedAt: acceptedAt ?? 0 });
    }
    sys.completionOrder = [...(data.completionOrder ?? [])];
    return sys;
  }
}
