/**
 * inventory.js — items, equipment and derived stats. Equipment bonuses feed
 * Player.recalcStats(); consumables route through systems/useEffects.
 */
import { gameEvents, Events } from '../core/events.js';
import { clamp } from '../core/mathx.js';

export const EquipSlots = {
  WEAPON: 'weapon',
  ARMOR: 'armor',
  HELMET: 'helmet',
  BOOTS: 'boots',
  RING: 'ring',
  AMULET: 'amulet',
};

export const ITEM_TYPES = {
  WEAPON: 'weapon',
  ARMOR: 'armor',
  HELMET: 'helmet',
  BOOTS: 'boots',
  RING: 'ring',
  AMULET: 'amulet',
  CONSUMABLE: 'consumable',
  MATERIAL: 'material',
  QUEST: 'quest',
  KEY: 'key',
  MISC: 'misc',
};

export class Inventory {
  /**
   * @param {object} itemDb — ITEMS map from data/items.js
   * @param {number} [capacity]
   */
  constructor(itemDb, capacity = 24) {
    this.itemDb = itemDb;
    this.capacity = capacity;
    this.stacks = []; // { itemId, count, equipped?, meta? }
    this.equipment = {
      weapon: null, armor: null, helmet: null, boots: null, ring: null, amulet: null,
    };
    this.onEquipChanged = null;
    this.sortMode = 'type';
  }

  // ------------------------------------------------------------ queries

  getItemDef(itemId) {
    return this.itemDb[itemId] || null;
  }

  countOf(itemId) {
    let total = 0;
    for (const s of this.stacks) {
      if (s.itemId === itemId) total += s.count;
    }
    return total;
  }

  has(itemId, count = 1) {
    return this.countOf(itemId) >= count;
  }

  get isFull() {
    return this.stacks.length >= this.capacity;
  }

  freeSlots() {
    return Math.max(0, this.capacity - this.stacks.length);
  }

  // ------------------------------------------------------------- adding

  /**
   * Add items. Returns { added, overflow } where overflow is what didn't fit.
   */
  add(itemId, count = 1) {
    const def = this.getItemDef(itemId);
    if (!def) return { added: 0, overflow: count };
    let remaining = count;
    const stackable = def.stackable !== false && def.type !== ITEM_TYPES.WEAPON && def.type !== ITEM_TYPES.ARMOR;
    if (stackable) {
      for (const s of this.stacks) {
        if (s.itemId !== itemId) continue;
        const cap = def.maxStack ?? 99;
        const space = cap - s.count;
        if (space <= 0) continue;
        const take = Math.min(space, remaining);
        s.count += take;
        remaining -= take;
        if (remaining <= 0) break;
      }
    }
    while (remaining > 0 && this.stacks.length < this.capacity) {
      const take = stackable ? Math.min(remaining, def.maxStack ?? 99) : 1;
      this.stacks.push({ itemId, count: take, equipped: false });
      remaining -= take;
    }
    const added = count - remaining;
    if (added > 0) {
      gameEvents.emit(Events.ITEM_PICKUP, { itemId, count: added });
    }
    return { added, overflow: remaining };
  }

  /** Remove items. Returns true when the full amount was removed. */
  remove(itemId, count = 1) {
    let remaining = count;
    for (let i = this.stacks.length - 1; i >= 0 && remaining > 0; i -= 1) {
      const s = this.stacks[i];
      if (s.itemId !== itemId) continue;
      const take = Math.min(s.count, remaining);
      s.count -= take;
      remaining -= take;
      if (s.count <= 0) this.stacks.splice(i, 1);
    }
    return remaining === 0;
  }

  // ---------------------------------------------------------- equipment

  canEquip(itemId) {
    const def = this.getItemDef(itemId);
    return def && Object.values(EquipSlots).includes(def.type);
  }

  equip(itemId) {
    const def = this.getItemDef(itemId);
    if (!def || !Object.values(EquipSlots).includes(def.type)) return false;
    const slot = def.type;
    if (!this.has(itemId, 1)) return false;
    // swap: unequip current into the bag
    const current = this.equipment[slot];
    if (current) {
      this.add(current, 1);
    }
    this.remove(itemId, 1);
    this.equipment[slot] = itemId;
    this._changed();
    return true;
  }

  unequip(slot) {
    const itemId = this.equipment[slot];
    if (!itemId) return false;
    if (this.freeSlots() <= 0) return false;
    this.equipment[slot] = null;
    this.add(itemId, 1);
    this._changed();
    return true;
  }

  equippedItem(slot) {
    return this.equipment[slot] ? this.getItemDef(this.equipment[slot]) : null;
  }

  /** Sum of stat bonuses from all equipped items. */
  equipmentBonuses() {
    const bonuses = {};
    for (const slot of Object.keys(this.equipment)) {
      const itemId = this.equipment[slot];
      if (!itemId) continue;
      const def = this.getItemDef(itemId);
      if (!def || !def.stats) continue;
      for (const [stat, value] of Object.entries(def.stats)) {
        bonuses[stat] = (bonuses[stat] ?? 0) + value;
      }
    }
    return bonuses;
  }

  _changed() {
    if (this.onEquipChanged) this.onEquipChanged(this.equipmentBonuses());
    gameEvents.emit(Events.UI_UPDATE ?? 'uiUpdate', { equipment: this.equipment });
  }

  // ---------------------------------------------------------- consumables

  use(itemId, player, extra = {}) {
    const def = this.getItemDef(itemId);
    if (!def || def.type !== ITEM_TYPES.CONSUMABLE) return false;
    if (!this.has(itemId, 1)) return false;
    if (def.cooldown && extra.cooldownTracker) {
      const t = extra.cooldownTracker;
      if ((t[itemId] ?? 0) > 0) return false;
      t[itemId] = def.cooldown;
    }
    this.remove(itemId, 1);
    gameEvents.emit(Events.ITEM_USE, { itemId, player });
    return true;
  }

  // ------------------------------------------------------------ helpers

  totalValue() {
    let sum = 0;
    for (const s of this.stacks) {
      const def = this.getItemDef(s.itemId);
      if (def) sum += (def.price ?? 0) * s.count;
    }
    return sum;
  }

  findByType(type) {
    return this.stacks.filter((s) => {
      const def = this.getItemDef(s.itemId);
      return def && def.type === type;
    });
  }

  clear() {
    this.stacks.length = 0;
    for (const slot of Object.keys(this.equipment)) this.equipment[slot] = null;
    this._changed();
    return this;
  }

  serialize() {
    return {
      stacks: this.stacks.map((s) => ({ itemId: s.itemId, count: s.count })),
      equipment: { ...this.equipment },
      capacity: this.capacity,
    };
  }

  static deserialize(data, itemDb) {
    const inv = new Inventory(itemDb, data.capacity ?? 24);
    for (const s of data.stacks ?? []) inv.stacks.push({ itemId: s.itemId, count: s.count, equipped: false });
    inv.equipment = {
      weapon: null, armor: null, helmet: null, boots: null, ring: null, amulet: null,
      ...(data.equipment ?? {}),
    };
    return inv;
  }

  /** Auto-sort by type then name — keeps the bag readable. */
  sort() {
    const order = [ITEM_TYPES.WEAPON, ITEM_TYPES.ARMOR, ITEM_TYPES.HELMET, ITEM_TYPES.BOOTS,
      ITEM_TYPES.RING, ITEM_TYPES.AMULET, ITEM_TYPES.CONSUMABLE, ITEM_TYPES.MATERIAL,
      ITEM_TYPES.KEY, ITEM_TYPES.QUEST, ITEM_TYPES.MISC];
    this.stacks.sort((a, b) => {
      const da = this.getItemDef(a.itemId) || {};
      const db = this.getItemDef(b.itemId) || {};
      const ta = order.indexOf(da.type ?? 'misc');
      const tb = order.indexOf(db.type ?? 'misc');
      if (ta !== tb) return ta - tb;
      return String(a.itemId).localeCompare(String(b.itemId));
    });
    return this;
  }

  /** Compare an item against the currently equipped one in its slot. */
  compare(itemId) {
    const def = this.getItemDef(itemId);
    if (!def || !Object.values(EquipSlots).includes(def.type)) return null;
    const current = this.equippedItem(def.type);
    const deltas = {};
    const stats = def.stats ?? {};
    const currentStats = current?.stats ?? {};
    const keys = new Set([...Object.keys(stats), ...Object.keys(currentStats)]);
    for (const key of keys) {
      deltas[key] = (stats[key] ?? 0) - (currentStats[key] ?? 0);
    }
    return { item: def, current, deltas };
  }

  /** Clamp helper used by UI to show fill ratio. */
  fillRatio() {
    return clamp(this.stacks.length / this.capacity, 0, 1);
  }
}

/**
 * Starter kit for new characters.
 */
export function grantStarterKit(inventory) {
  inventory.add('rusty-sword', 1);
  inventory.add('cloth-armor', 1);
  inventory.add('sand-bread', 3);
  inventory.add('small-potion', 2);
  inventory.equip('rusty-sword');
  inventory.equip('cloth-armor');
  return inventory;
}
