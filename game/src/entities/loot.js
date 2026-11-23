/**
 * loot.js — dropped coins, items and hearts with magnet pickup. Also the
 * Chest entity. Everything here is pooled-friendly and allocation-light.
 */
import { Entity, EntityKind } from './entity.js';
import { dist2, normalize, clamp } from '../core/mathx.js';

export const LootType = {
  COIN: 'coin',
  ITEM: 'item',
  HEART: 'heart',
  MANA: 'mana',
  XP: 'xp',
};

export class LootDrop extends Entity {
  constructor(opts = {}) {
    super({
      kind: EntityKind.LOOT,
      team: 'neutral',
      radius: 5,
      x: opts.x,
      y: opts.y,
    });
    this.reset(opts);
  }

  reset(opts = {}) {
    this.x = opts.x ?? 0;
    this.y = opts.y ?? 0;
    this.lootType = opts.lootType ?? LootType.COIN;
    this.itemId = opts.itemId ?? null;
    this.amount = opts.amount ?? 1;
    this.alive = true;
    this.removeMe = false;
    this.pickupDelay = opts.pickupDelay ?? 0.35;
    this.magnetRange = opts.magnetRange ?? 42;
    this.bobTimer = Math.random() * Math.PI * 2;
    const angle = Math.random() * Math.PI * 2;
    const power = 30 + Math.random() * 60;
    this.vx = Math.cos(angle) * power;
    this.vy = Math.sin(angle) * power;
    this.friction = 6;
    this.life = 25; // despawn after 25s
    this.z = 2;
    this.data = {};
    return this;
  }

  update(dt) {
    if (!this.alive) return;
    this.life -= dt;
    if (this.life <= 0) {
      this.removeMe = true;
      return;
    }
    if (this.pickupDelay > 0) this.pickupDelay -= dt;
    this.bobTimer += dt * 4;

    // friction on the toss
    const damp = Math.max(0, 1 - this.friction * dt);
    this.vx *= damp;
    this.vy *= damp;
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // magnet toward the player
    const player = this.data.player;
    if (player && player.alive && this.pickupDelay <= 0) {
      const d2v = dist2(this.x, this.y, player.x, player.y);
      if (d2v < this.magnetRange * this.magnetRange) {
        const dir = normalize(player.x - this.x, player.y - this.y);
        const pull = clamp(240 - Math.sqrt(d2v), 60, 240);
        this.x += dir.x * pull * dt;
        this.y += dir.y * pull * dt;
      }
      if (d2v < (player.radius + 8) * (player.radius + 8)) {
        this.alive = false;
        this.removeMe = true;
        if (this.data.onPickup) this.data.onPickup(this, player);
      }
    }
    // keep drops inside walkable space
    const map = this.data.map;
    if (map && map.isSolidPixel(this.x, this.y)) {
      this.x -= this.vx * dt * 1.5;
      this.y -= this.vy * dt * 1.5;
      this.vx = 0;
      this.vy = 0;
    }
  }
}

/**
 * Build a loot table roll. Table entries: [{ type, itemId?, amount, weight, chance }].
 */
export function rollLoot(table, rng = Math, bonus = {}) {
  const out = [];
  const goldFind = bonus.goldFind ?? 0;
  // normalize the rng to a 0..1 sampler (RNG class exposes .next, Math exposes .random)
  const sample = typeof rng?.next === 'function'
    ? () => rng.next()
    : typeof rng?.random === 'function'
      ? () => rng.random()
      : () => Math.random();
  for (const entry of table) {
    const chance = (entry.chance ?? 1) * (entry.type === LootType.COIN ? 1 + goldFind : 1);
    if (sample() > chance) continue;
    let amount = entry.amount ?? 1;
    if (entry.amountMin !== undefined) {
      const hi = entry.amountMax ?? entry.amountMin;
      amount = entry.amountMin + Math.floor(sample() * (hi - entry.amountMin + 1));
    }
    out.push({
      lootType: entry.type,
      itemId: entry.itemId ?? null,
      amount,
    });
  }
  return out;
}

export class Chest extends Entity {
  /**
   * @param {object} opts { x, y, lootTable, locked, id, secret }
   */
  constructor(opts = {}) {
    super({
      kind: EntityKind.CHEST,
      team: 'neutral',
      radius: 8,
      x: opts.x,
      y: opts.y,
    });
    this.chestId = opts.id ?? `chest-${Math.floor(Math.random() * 1e6)}`;
    this.lootTable = opts.lootTable ?? [];
    this.locked = !!opts.locked;
    this.opened = !!opts.opened;
    this.secret = !!opts.secret;
    this.openAnim = 0;
    this.requiresKey = opts.requiresKey ?? null;
    this.questGated = opts.questGated ?? null;
    this.table = opts.table ?? null;
  }

  canOpen(player, flags = {}) {
    if (this.opened) return { ok: false, reason: 'alreadyOpen' };
    if (this.locked && this.requiresKey && !(flags.hasKey ?? false)) {
      return { ok: false, reason: 'locked' };
    }
    if (this.questGated && !(flags[this.questGated] ?? false)) {
      return { ok: false, reason: 'quest' };
    }
    return { ok: true };
  }

  open() {
    if (this.opened) return false;
    this.opened = true;
    this.openAnim = 0.001;
    return true;
  }

  update(dt) {
    if (this.openAnim > 0 && this.openAnim < 1) {
      this.openAnim = Math.min(1, this.openAnim + dt * 3);
    }
  }
}

export class Portal extends Entity {
  constructor(opts = {}) {
    super({
      kind: EntityKind.PORTAL,
      team: 'neutral',
      radius: 10,
      x: opts.x,
      y: opts.y,
    });
    this.targetLevel = opts.to ?? null;
    this.targetSpawn = opts.toSpawn ?? 0;
    this.locked = !!opts.locked;
    this.lockFlag = opts.lockFlag ?? null;
    this.animTimer = 0;
  }

  update(dt) {
    this.animTimer += dt;
  }
}
