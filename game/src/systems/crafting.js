/**
 * crafting.js — recipe validation and item forging. Recipes live in
 * data/recipes.js; materials come from monster drops and gathering.
 */
import { gameEvents, Events } from '../core/events.js';

export class CraftingSystem {
  /**
   * @param {object} recipeDb — RECIPES map
   * @param {object} itemDb — ITEMS map (for output defs)
   */
  constructor(recipeDb, itemDb) {
    this.recipeDb = recipeDb;
    this.itemDb = itemDb;
    this.discovered = new Set(Object.keys(recipeDb)); // all recipes known (codex can hide later)
    this.craftCount = new Map();
  }

  getRecipe(recipeId) {
    return this.recipeDb[recipeId] ?? null;
  }

  listRecipes(filter = null) {
    return Object.values(this.recipeDb).filter((r) => {
      if (!filter) return true;
      if (filter.category && r.category !== filter.category) return false;
      if (filter.discoveredOnly && !this.discovered.has(r.id)) return false;
      return true;
    });
  }

  /** Can the inventory satisfy the recipe right now? */
  canCraft(recipeId, inventory) {
    const recipe = this.getRecipe(recipeId);
    if (!recipe) return { ok: false, reason: 'unknown' };
    if (!this.discovered.has(recipeId)) return { ok: false, reason: 'undiscovered' };
    for (const input of recipe.inputs ?? []) {
      if (!inventory.has(input.itemId, input.count ?? 1)) {
        return { ok: false, reason: 'materials', missing: input.itemId };
      }
    }
    const outputDef = this.itemDb[recipe.output];
    if (outputDef && outputDef.type !== 'consumable' && outputDef.type !== 'material' && inventory.freeSlots() <= 0) {
      // equipment needs a free slot
      const stackable = outputDef.stackable !== false;
      if (!stackable || !inventory.has(recipe.output, 1)) {
        return { ok: false, reason: 'inventoryFull' };
      }
    }
    return { ok: true, recipe };
  }

  /**
   * Craft one batch. Returns { ok, outputs } with bonus procs from luck.
   */
  craft(recipeId, inventory, player = null, luckBonus = 0) {
    const check = this.canCraft(recipeId, inventory);
    if (!check.ok) return check;
    const recipe = check.recipe;
    for (const input of recipe.inputs ?? []) {
      inventory.remove(input.itemId, input.count ?? 1);
    }
    const outputs = [];
    const baseCount = recipe.outputCount ?? 1;
    let count = baseCount;
    // luck: chance for a bonus craft
    if (Math.random() < 0.06 + luckBonus) count += 1;
    inventory.add(recipe.output, count);
    outputs.push({ itemId: recipe.output, count });
    // secondary outputs
    for (const extra of recipe.byproducts ?? []) {
      if (Math.random() < (extra.chance ?? 1)) {
        inventory.add(extra.itemId, extra.count ?? 1);
        outputs.push({ itemId: extra.itemId, count: extra.count ?? 1 });
      }
    }
    this.craftCount.set(recipeId, (this.craftCount.get(recipeId) ?? 0) + 1);
    if (player && recipe.xp) player.gainXp(recipe.xp);
    gameEvents.emit(Events.ITEM_CRAFT, {
      itemId: recipe.output,
      count,
      recipeId,
      outputs,
    });
    return { ok: true, outputs, recipe };
  }

  discover(recipeId) {
    if (this.recipeDb[recipeId] && !this.discovered.has(recipeId)) {
      this.discovered.add(recipeId);
      return true;
    }
    return false;
  }

  totalCrafted() {
    let n = 0;
    for (const v of this.craftCount.values()) n += v;
    return n;
  }

  serialize() {
    return {
      discovered: [...this.discovered],
      craftCount: [...this.craftCount.entries()],
    };
  }

  static deserialize(data, recipeDb, itemDb) {
    const sys = new CraftingSystem(recipeDb, itemDb);
    if (data.discovered) sys.discovered = new Set(data.discovered);
    sys.craftCount = new Map(data.craftCount ?? []);
    return sys;
  }
}

/**
 * Recipe helpers used by both the crafting screen and the generator.
 */
export function recipeCost(recipe, itemDb) {
  let cost = 0;
  for (const input of recipe.inputs ?? []) {
    const def = itemDb[input.itemId];
    cost += (def?.price ?? 5) * (input.count ?? 1);
  }
  return cost;
}

export function recipeValue(recipe, itemDb) {
  const def = itemDb[recipe.output];
  return (def?.price ?? 0) * (recipe.outputCount ?? 1);
}

export function recipeProfit(recipe, itemDb) {
  return recipeValue(recipe, itemDb) - recipeCost(recipe, itemDb);
}
