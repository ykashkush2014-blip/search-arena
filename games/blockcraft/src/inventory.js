// Inventory + crafting rules (pure logic, no DOM).
import { ID, BLOCKS, PLACEABLE } from './blocks.js';

export const RECIPES = [
  { id: 'planks', out: ID.PLANKS, count: 4, in: [{ id: ID.LOG, count: 1 }], label: 'ألواح من جذع' },
  { id: 'glass', out: ID.GLASS, count: 2, in: [{ id: ID.SAND, count: 4 }], label: 'زجاج من رمل' },
  { id: 'brick', out: ID.BRICK, count: 2, in: [{ id: ID.COBBLE, count: 4 }], label: 'طوب من حصى' },
  { id: 'lamp', out: ID.LAMP, count: 1, in: [{ id: ID.GLASS, count: 2 }, { id: ID.PLANKS, count: 1 }], label: 'مصباح' },
  { id: 'grass', out: ID.GRASS, count: 1, in: [{ id: ID.DIRT, count: 2 }], label: 'عشب من تراب' },
];

export class Inventory {
  constructor({ creative = false } = {}) {
    this.slots = new Map(); // id -> count
    this.creative = creative;
    this.selected = 0; // index in PLACEABLE
    if (creative) this.refill();
    else {
      // A starting kit so the first minute is fun.
      this.add(ID.PLANKS, 8);
      this.add(ID.LAMP, 1);
    }
  }

  refill() {
    for (const id of PLACEABLE) this.slots.set(id, 64);
  }

  setCreative(on) {
    this.creative = on;
    if (on) this.refill();
  }

  count(id) {
    return this.slots.get(id) || 0;
  }

  add(id, count = 1) {
    if (!id) return 0;
    const next = Math.min(999, this.count(id) + count);
    this.slots.set(id, next);
    return next;
  }

  remove(id, count = 1) {
    if (this.creative) return true;
    const have = this.count(id);
    if (have < count) return false;
    this.slots.set(id, have - count);
    return true;
  }

  get selectedId() {
    return PLACEABLE[this.selected];
  }

  select(index) {
    this.selected = ((index % PLACEABLE.length) + PLACEABLE.length) % PLACEABLE.length;
    return this.selectedId;
  }

  cycle(dir) {
    return this.select(this.selected + dir);
  }

  /** Hotbar view-model for the HUD. */
  hotbar() {
    return PLACEABLE.map((id, i) => ({
      id,
      index: i,
      name: BLOCKS[id].name,
      count: this.creative ? Infinity : this.count(id),
      selected: i === this.selected,
    }));
  }

  canCraft(recipe) {
    return recipe.in.every((req) => this.count(req.id) >= req.count);
  }

  craft(recipe) {
    if (!this.canCraft(recipe)) return false;
    if (!this.creative) {
      for (const req of recipe.in) this.remove(req.id, req.count);
    }
    this.add(recipe.out, recipe.count);
    return true;
  }

  serialize() {
    return { slots: [...this.slots.entries()], selected: this.selected, creative: this.creative };
  }

  restore(data) {
    if (!data) return;
    this.slots = new Map(data.slots || []);
    this.selected = data.selected || 0;
    this.creative = !!data.creative;
  }
}
