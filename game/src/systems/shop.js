/**
 * shop.js — merchant inventories, dynamic pricing and buy/sell flow.
 * Shop stocks live in data (merchantStock generated tables included).
 */
import { gameEvents, Events } from '../core/events.js';
import { clamp } from '../core/mathx.js';

export class ShopSystem {
  /**
   * @param {object} shopDb — SHOPS map { shopId: { name, buyMult, sellMult, stock: [{itemId, price?, count?, refresh?}] } }
   * @param {object} itemDb — ITEMS map
   */
  constructor(shopDb, itemDb) {
    this.shopDb = shopDb;
    this.itemDb = itemDb;
    this.openShopId = null;
    this.stockState = new Map(); // shopId -> Map(itemId -> remaining)
    this.reputation = 0; // global haggling reputation
    this.buyCounts = new Map();
  }

  open(shopId) {
    if (!this.shopDb[shopId]) return false;
    this.openShopId = shopId;
    this._ensureStock(shopId);
    gameEvents.emit(Events.UI_OPEN, { screen: 'shop', shopId });
    return true;
  }

  close() {
    this.openShopId = null;
    gameEvents.emit(Events.UI_CLOSE, { screen: 'shop' });
  }

  isOpen() {
    return this.openShopId !== null;
  }

  _ensureStock(shopId) {
    if (this.stockState.has(shopId)) return;
    const def = this.shopDb[shopId];
    const stock = new Map();
    for (const entry of def.stock ?? []) {
      stock.set(entry.itemId, entry.count ?? Infinity);
    }
    this.stockState.set(shopId, stock);
  }

  /** Price for the player to BUY an item. */
  buyPrice(shopId, itemId) {
    const def = this.shopDb[shopId];
    const item = this.itemDb[itemId];
    if (!def || !item) return Infinity;
    const base = item.price ?? 10;
    const mult = (def.buyMult ?? 1) * (1 - clamp(this.reputation * 0.002, 0, 0.15));
    return Math.max(1, Math.round(base * mult));
  }

  /** Price the merchant pays when the player SELLS. */
  sellPrice(shopId, itemId) {
    const def = this.shopDb[shopId];
    const item = this.itemDb[itemId];
    if (!def || !item) return 0;
    const base = item.price ?? 10;
    const mult = (def.sellMult ?? 0.5) * (1 + clamp(this.reputation * 0.001, 0, 0.1));
    return Math.max(1, Math.round(base * mult));
  }

  stockLeft(shopId, itemId) {
    this._ensureStock(shopId);
    const stock = this.stockState.get(shopId);
    return stock.has(itemId) ? stock.get(itemId) : 0;
  }

  listStock(shopId) {
    this._ensureStock(shopId);
    const def = this.shopDb[shopId];
    const stock = this.stockState.get(shopId);
    return (def.stock ?? [])
      .map((entry) => ({
        itemId: entry.itemId,
        def: this.itemDb[entry.itemId],
        price: this.buyPrice(shopId, entry.itemId),
        remaining: stock.get(entry.itemId) ?? 0,
      }))
      .filter((e) => e.def && e.remaining > 0);
  }

  /** Execute a purchase. Returns { ok, cost, reason }. */
  buy(shopId, itemId, count = 1, player = null, inventory = null) {
    const def = this.shopDb[shopId];
    if (!def) return { ok: false, reason: 'noShop' };
    this._ensureStock(shopId);
    const stock = this.stockState.get(shopId);
    const left = stock.has(itemId) ? stock.get(itemId) : 0;
    if (left < count) return { ok: false, reason: 'outOfStock' };
    const price = this.buyPrice(shopId, itemId) * count;
    if (!player || player.gold < price) return { ok: false, reason: 'gold', cost: price };
    if (inventory && inventory.freeSlots() <= 0 && !inventory.has(itemId, 1)) {
      return { ok: false, reason: 'inventoryFull' };
    }
    player.gold -= price;
    if (inventory) inventory.add(itemId, count);
    if (left !== Infinity) stock.set(itemId, left - count);
    this.buyCounts.set(itemId, (this.buyCounts.get(itemId) ?? 0) + count);
    this.reputation += 1;
    gameEvents.emit(Events.ITEM_BUY, { shopId, itemId, count, price });
    gameEvents.emit(Events.GOLD_CHANGED, { player, amount: -price });
    return { ok: true, cost: price };
  }

  /** Sell items back. */
  sell(shopId, itemId, count = 1, player = null, inventory = null) {
    if (!this.shopDb[shopId]) return { ok: false, reason: 'noShop' };
    if (inventory && !inventory.has(itemId, count)) return { ok: false, reason: 'notOwned' };
    const price = this.sellPrice(shopId, itemId) * count;
    if (inventory) inventory.remove(itemId, count);
    if (player) {
      player.gold += price;
      gameEvents.emit(Events.GOLD_CHANGED, { player, amount: price });
    }
    gameEvents.emit(Events.ITEM_SELL, { shopId, itemId, count, price });
    return { ok: true, price };
  }

  /** Restock shops with limited supplies (called on new day). */
  restockAll() {
    for (const [shopId, def] of Object.entries(this.shopDb)) {
      if (!this.stockState.has(shopId)) continue;
      const stock = this.stockState.get(shopId);
      for (const entry of def.stock ?? []) {
        if (entry.refresh === false) continue;
        const current = stock.get(entry.itemId) ?? 0;
        if (current !== Infinity) {
          stock.set(entry.itemId, Math.min(entry.count ?? Infinity, current + (entry.refreshCount ?? 1)));
        }
      }
    }
    return this;
  }

  serialize() {
    return {
      reputation: this.reputation,
      stock: [...this.stockState.entries()].map(([shopId, map]) => [shopId, [...map.entries()]]),
      buyCounts: [...this.buyCounts.entries()],
    };
  }

  static deserialize(data, shopDb, itemDb) {
    const sys = new ShopSystem(shopDb, itemDb);
    sys.reputation = data?.reputation ?? 0;
    for (const [shopId, entries] of data?.stock ?? []) {
      sys.stockState.set(shopId, new Map(entries));
    }
    sys.buyCounts = new Map(data?.buyCounts ?? []);
    return sys;
  }
}
