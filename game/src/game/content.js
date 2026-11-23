/**
 * content.js — the content registry: merges hand-written data tables with the
 * generated campaign (levels, dialogues, quests, strings) and the integration
 * snapshots into one lookup API used by the whole game.
 */
import ITEMS from '../data/items.js';
import ENEMIES from '../data/enemies.js';
import SKILLS from '../data/skillsData.js';
import RECIPES from '../data/recipes.js';
import QUESTS from '../data/questsData.js';
import DIALOGUES from '../data/dialogues.js';
import ACHIEVEMENTS from '../data/achievementsData.js';
import LORE from '../data/lore.js';
import { BALANCE } from '../data/balance.js';
import {
  LEVELS, GENERATED_DIALOGUES, GENERATED_QUESTS, LOOT_TABLES, SHOPS,
  LEVEL_ORDER, MERGED_STRINGS,
} from '../data/generated/index.js';
import { SNAPSHOT_CODEX } from '../data/snapshots/codex.js';
import { SNAPSHOT_STORY } from '../data/snapshots/story.js';
import { SNAPSHOT_QUEST_BOARD } from '../data/snapshots/questBoard.js';

export class Content {
  constructor() {
    this.items = { ...ITEMS };
    this.enemies = { ...ENEMIES };
    this.skills = { ...SKILLS };
    this.recipes = { ...RECIPES };
    this.quests = { ...QUESTS, ...(GENERATED_QUESTS ?? {}) };
    this.dialogues = { ...DIALOGUES, ...(GENERATED_DIALOGUES ?? {}) };
    this.achievements = { ...ACHIEVEMENTS };
    this.lore = { ...LORE };
    this.levels = { ...LEVELS };
    this.levelOrder = LEVEL_ORDER ?? Object.keys(LEVELS);
    this.lootTables = { ...LOOT_TABLES };
    this.shops = { ...SHOPS };
    this.strings = MERGED_STRINGS ?? {};
    this.balance = BALANCE;
    this.snapshots = {
      codex: SNAPSHOT_CODEX,
      story: SNAPSHOT_STORY,
      questBoard: SNAPSHOT_QUEST_BOARD,
    };
  }

  // ------------------------------------------------------------ lookups

  item(id) {
    return this.items[id] ?? null;
  }

  enemy(id) {
    return this.enemies[id] ?? null;
  }

  skill(id) {
    return this.skills[id] ?? null;
  }

  recipe(id) {
    return this.recipes[id] ?? null;
  }

  quest(id) {
    return this.quests[id] ?? null;
  }

  dialogue(id) {
    return this.dialogues[id] ?? null;
  }

  level(id) {
    return this.levels[id] ?? null;
  }

  lootTable(id) {
    return this.lootTables[id] ?? null;
  }

  shop(id) {
    return this.shops[id] ?? null;
  }

  npcName(kind) {
    const names = {
      merchant: { en: 'Rasha the Merchant', ar: 'التاجر رشا' },
      elder: { en: 'Elder Sadiq', ar: 'الشيخ صديق' },
      guard: { en: 'Guard Tariq', ar: 'الحارس طارق' },
      healer: { en: 'Amal the Healer', ar: 'المعالجة أمل' },
      smith: { en: 'Bilal the Smith', ar: 'الحدّاد بلال' },
      hunter: { en: 'Najma the Wanderer', ar: 'الرحّالة نجمة' },
    };
    return names[kind] ?? { en: 'Villager', ar: 'قروي' };
  }

  /** Next level id in the campaign order. */
  nextLevelId(currentId) {
    const idx = this.levelOrder.indexOf(currentId);
    if (idx < 0) return this.levelOrder[0] ?? null;
    return this.levelOrder[idx + 1] ?? null;
  }

  firstLevelId() {
    return this.levelOrder[0] ?? 'level-01';
  }

  levelCount() {
    return this.levelOrder.length;
  }

  /** Entries for the codex screens. */
  loreEntries() {
    return [...Object.values(this.lore), ...this.snapshots.codex.filter((c) => c.category === 'lore' || c.category === 'guide')];
  }

  bestiaryEntries() {
    return Object.values(this.enemies).map((e) => ({
      id: e.id,
      name: e.name,
      desc: e.desc,
    }));
  }

  storyEntries() {
    return this.snapshots.story;
  }

  questBoardEntries() {
    return this.snapshots.questBoard;
  }

  /** Validate cross-references (used by tests + the generator). */
  validate() {
    const errors = [];
    for (const [id, level] of Object.entries(this.levels)) {
      if (!level.tiles || level.tiles.length !== level.height) {
        errors.push(`${id}: bad tile rows`);
      }
      for (const exit of level.exits ?? []) {
        if (exit.to && !this.levels[exit.to]) errors.push(`${id}: exit to unknown level ${exit.to}`);
      }
      for (const def of level.entities ?? []) {
        if (def.type === 'enemy' && !this.enemies[def.kind]) errors.push(`${id}: unknown enemy ${def.kind}`);
        if (def.type === 'npc' && def.dialogue && !this.dialogues[def.dialogue]) {
          errors.push(`${id}: unknown dialogue ${def.dialogue}`);
        }
      }
      for (const qid of level.quests ?? []) {
        if (!this.quests[qid]) errors.push(`${id}: unknown quest ${qid}`);
      }
    }
    for (const [id, quest] of Object.entries(this.quests)) {
      for (const pre of quest.prereqs ?? []) {
        if (!this.quests[pre]) errors.push(`${id}: unknown prereq ${pre}`);
      }
      for (const reward of quest.rewards?.items ?? []) {
        const rid = reward.itemId ?? reward.id;
        if (rid && !this.items[rid]) errors.push(`${id}: reward references unknown item ${rid}`);
      }
    }
    for (const [id, recipe] of Object.entries(this.recipes)) {
      if (!this.items[recipe.output]) errors.push(`${id}: output references unknown item ${recipe.output}`);
      for (const input of recipe.inputs ?? []) {
        if (!this.items[input.itemId]) errors.push(`${id}: input references unknown item ${input.itemId}`);
      }
    }
    for (const [id, def] of Object.entries(this.dialogues)) {
      for (const [nodeId, node] of Object.entries(def.nodes ?? {})) {
        for (const choice of node.choices ?? []) {
          if (choice.next && choice.next !== 'end' && !def.nodes[choice.next]) {
            errors.push(`${id}/${nodeId}: choice points to unknown node ${choice.next}`);
          }
          for (const effect of choice.effects ?? []) {
            if (effect.type === 'giveItem' && !this.items[effect.itemId]) {
              errors.push(`${id}/${nodeId}: gives unknown item ${effect.itemId}`);
            }
            if (effect.type === 'startQuest' && !this.quests[effect.questId]) {
              errors.push(`${id}/${nodeId}: starts unknown quest ${effect.questId}`);
            }
          }
        }
        if (node.next && node.next !== 'end' && !def.nodes[node.next]) {
          errors.push(`${id}/${nodeId}: next points to unknown node ${node.next}`);
        }
      }
    }
    return errors;
  }
}

export default Content;
