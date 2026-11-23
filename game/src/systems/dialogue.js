/**
 * dialogue.js — branching conversation engine. Dialogue graphs are plain data
 * (data/dialogues.js + generated expansions); this engine walks nodes, applies
 * effects (give items, start quests, set flags) and emits events.
 */
import { gameEvents, Events } from '../core/events.js';

export const EffectTypes = {
  GIVE_ITEM: 'giveItem',
  TAKE_ITEM: 'takeItem',
  GIVE_GOLD: 'giveGold',
  GIVE_XP: 'giveXP',
  START_QUEST: 'startQuest',
  COMPLETE_QUEST: 'completeQuest',
  SET_FLAG: 'setFlag',
  OPEN_SHOP: 'openShop',
  HEAL: 'heal',
  TELEPORT: 'teleport',
  PLAY_SOUND: 'playSound',
  UNLOCK_SKILL: 'unlockSkill',
};

export class DialogueSystem {
  /**
   * @param {object} dialogueDb — DIALOGUES map
   */
  constructor(dialogueDb) {
    this.dialogueDb = dialogueDb;
    this.active = null; // { dialogueId, nodeId, history, speaker }
    this.flags = new Set();
    this.seenDialogues = new Set();
    this.onOpen = null;
    this.onClose = null;
    this.onNode = null;
  }

  isTalking() {
    return this.active !== null;
  }

  hasFlag(flag) {
    return this.flags.has(flag);
  }

  setFlag(flag) {
    if (!flag) return;
    this.flags.add(flag);
    gameEvents.emit(Events.FLAG_SET, { flag });
  }

  /** Start a dialogue by id. `npc` is optional context for speaker names. */
  start(dialogueId, npc = null, ctx = {}) {
    const def = this.dialogueDb[dialogueId];
    if (!def) return false;
    const startNode = def.start ?? 'start';
    this.active = {
      dialogueId,
      nodeId: startNode,
      npc,
      history: [],
      ctx,
    };
    this.seenDialogues.add(dialogueId);
    gameEvents.emit(Events.DIALOGUE_START, { dialogueId, npc });
    if (this.onOpen) this.onOpen(this.active);
    this._enterNode(def, startNode);
    return true;
  }

  _enterNode(def, nodeId) {
    const node = def.nodes?.[nodeId];
    if (!node) {
      this.end();
      return;
    }
    if (node.setFlags) {
      for (const flag of node.setFlags) this.setFlag(flag);
    }
    if (node.effects) {
      // effects fire on entering the node
      this._pendingEffects = node.effects;
    } else {
      this._pendingEffects = null;
    }
    if (this.onNode) this.onNode(node, this.active);
  }

  /** Current node data for the UI. */
  currentNode() {
    if (!this.active) return null;
    const def = this.dialogueDb[this.active.dialogueId];
    return def?.nodes?.[this.active.nodeId] ?? null;
  }

  /** Choices available at the current node (conditions filtered). */
  availableChoices(ctx = {}) {
    const node = this.currentNode();
    if (!node) return [];
    const choices = node.choices ?? [];
    return choices.filter((c) => this._checkCondition(c.condition, ctx));
  }

  /**
   * Pick a choice (or continue when there are none).
   * Returns { done, next, effects }.
   */
  choose(index, ctx = {}) {
    if (!this.active) return { done: true };
    const node = this.currentNode();
    if (!node) {
      this.end();
      return { done: true };
    }
    // apply node effects on leave (first visit)
    if (this._pendingEffects) {
      this._applyEffects(this._pendingEffects, ctx);
      this._pendingEffects = null;
    }
    const choices = this.availableChoices(ctx);
    let next = node.next ?? null;
    let effects = node.effects ?? null;
    if (choices.length > 0) {
      const choice = choices[clampIndex(index, choices.length)];
      if (!choice) return { done: false };
      next = choice.next ?? null;
      effects = choice.effects ?? effects;
      if (choice.setFlags) {
        for (const flag of choice.setFlags) this.setFlag(flag);
      }
    }
    this.active.history.push(this.active.nodeId);
    if (!next || next === 'end') {
      if (effects) this._applyEffects(effects, ctx);
      this.end();
      return { done: true, effects };
    }
    const def = this.dialogueDb[this.active.dialogueId];
    this.active.nodeId = next;
    this._enterNode(def, next);
    return { done: false, next, effects };
  }

  /** Close without finishing (walk away). */
  end() {
    if (!this.active) return;
    const { dialogueId, npc } = this.active;
    this.active = null;
    gameEvents.emit(Events.DIALOGUE_END, { dialogueId, npcId: npc?.npcId ?? npc?.id ?? null });
    if (this.onClose) this.onClose();
  }

  // ------------------------------------------------------------ effects

  applyEffects(effects, ctx) {
    this._applyEffects(effects, ctx);
  }

  _applyEffects(effects, ctx = {}) {
    const { player, inventory, quests, shop, skills, world, audio } = ctx;
    for (const effect of effects ?? []) {
      switch (effect.type) {
        case EffectTypes.GIVE_ITEM:
          if (inventory) inventory.add(effect.itemId, effect.count ?? 1);
          break;
        case EffectTypes.TAKE_ITEM:
          if (inventory) inventory.remove(effect.itemId, effect.count ?? 1);
          break;
        case EffectTypes.GIVE_GOLD:
          if (player && player.addGold) player.addGold(effect.amount ?? 0);
          break;
        case EffectTypes.GIVE_XP:
          if (player && player.gainXp) player.gainXp(effect.amount ?? 0);
          break;
        case EffectTypes.START_QUEST:
          if (quests) {
            quests.unlock(effect.questId);
            quests.accept(effect.questId);
          }
          break;
        case EffectTypes.COMPLETE_QUEST:
          if (quests) {
            // force-ready then complete
            const entry = quests.states.get(effect.questId);
            if (entry && entry.state === 'active') {
              const def = quests.get(effect.questId);
              (def.objectives ?? []).forEach((obj, i) => {
                entry.progress[i] = obj.count ?? 1;
              });
              entry.state = 'ready';
            }
            quests.complete(effect.questId, player, inventory);
          }
          break;
        case EffectTypes.SET_FLAG:
          this.setFlag(effect.flag);
          break;
        case EffectTypes.OPEN_SHOP:
          if (shop && effect.shopId) shop.open(effect.shopId);
          break;
        case EffectTypes.HEAL:
          if (player && player.heal) {
            player.heal(effect.amount ?? player.maxHp);
            if (audio) audio.play('heal');
          }
          break;
        case EffectTypes.TELEPORT:
          if (world && world.teleport) {
            world.teleport(effect.levelId ?? null, effect.x ?? null, effect.y ?? null);
          }
          break;
        case EffectTypes.PLAY_SOUND:
          if (audio) audio.play(effect.sound ?? 'uiConfirm');
          break;
        case EffectTypes.UNLOCK_SKILL:
          if (skills) skills.unlock(effect.skillId);
          break;
        default:
          break;
      }
    }
    if (effects && effects.length > 0) {
      gameEvents.emit(Events.TOAST, { kind: 'effects', effects });
    }
  }

  _checkCondition(condition, ctx) {
    if (!condition) return true;
    if (condition.flag && !this.flags.has(condition.flag)) return false;
    if (condition.notFlag && this.flags.has(condition.notFlag)) return false;
    if (condition.minLevel && (!ctx.player || ctx.player.level < condition.minLevel)) return false;
    if (condition.hasItem && (!ctx.inventory || !ctx.inventory.has(condition.hasItem, condition.count ?? 1))) return false;
    if (condition.questState && ctx.quests) {
      const state = ctx.quests.stateOf(condition.questState.id);
      if (state !== condition.questState.state) return false;
    }
    if (condition.gold && (!ctx.player || ctx.player.gold < condition.gold)) return false;
    return true;
  }

  serialize() {
    return { flags: [...this.flags], seen: [...this.seenDialogues] };
  }

  static deserialize(data, dialogueDb) {
    const sys = new DialogueSystem(dialogueDb);
    sys.flags = new Set(data.flags ?? []);
    sys.seenDialogues = new Set(data.seen ?? []);
    return sys;
  }
}

function clampIndex(index, length) {
  if (!Number.isFinite(index)) return 0;
  return Math.max(0, Math.min(length - 1, Math.floor(index)));
}
