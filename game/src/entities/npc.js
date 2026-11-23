/**
 * npc.js — townsfolk, merchants and quest givers. NPCs are non-combat; they
 * own dialogue references, shop stock and simple idle animation.
 */
import { Entity, EntityKind } from './entity.js';

export class NPC extends Entity {
  /**
   * @param {object} def { kind, x, y, sprite, dialogueId, shop, name, role, questIds }
   */
  constructor(def = {}) {
    super({
      kind: EntityKind.NPC,
      team: 'neutral',
      radius: 7,
      x: def.x,
      y: def.y,
    });
    this.npcId = def.id ?? def.kind ?? 'npc';
    this.name = def.name ?? { en: 'Villager', ar: 'قروي' };
    this.role = def.role ?? 'villager';
    this.sprite = def.sprite ?? def.kind ?? 'merchant';
    this.dialogueId = def.dialogue ?? null;
    this.shop = def.shop ?? null; // shop id in data (systems/shop.js)
    this.questIds = def.questIds ?? [];
    this.wanders = !!def.wanders;
    this.homeX = this.x;
    this.homeY = this.y;
    this.facing = def.facing ?? -1;
    this.bobTimer = Math.random() * Math.PI * 2;
    this.greetingShown = false;
    this.interactRadius = def.interactRadius ?? 26;
    this.palette = def.palette ?? null;
  }

  update(dt) {
    this.bobTimer += dt * 2;
    if (this.wanders) {
      this.wanderTimer = (this.wanderTimer ?? 0) - dt;
      if (this.wanderTimer <= 0) {
        this.wanderTimer = 4 + Math.random() * 6;
        const angle = Math.random() * Math.PI * 2;
        this.vx = Math.cos(angle) * 12;
        this.vy = Math.sin(angle) * 12;
        if (Math.abs(this.vx) > 1) this.facing = this.vx > 0 ? 1 : -1;
      }
      // stay near home
      const dx = this.x - this.homeX;
      const dy = this.y - this.homeY;
      if (dx * dx + dy * dy > 36 * 36) {
        this.vx = -dx * 0.5;
        this.vy = -dy * 0.5;
      }
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.vx *= 0.95;
      this.vy *= 0.95;
    }
  }

  /** Is the player close enough to talk? */
  canInteract(player) {
    if (!player || !player.alive) return false;
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    return dx * dx + dy * dy <= this.interactRadius * this.interactRadius;
  }

  facePlayer(player) {
    if (!player) return;
    this.facing = player.x >= this.x ? 1 : -1;
  }
}

/**
 * Dialogue-trigger helpers shared by world.js and systems/dialogue.js.
 */
export const NPC_ROLES = {
  MERCHANT: 'merchant',
  ELDER: 'elder',
  GUARD: 'guard',
  HEALER: 'healer',
  SMITH: 'smith',
  VILLAGER: 'villager',
  QUEST_GIVER: 'questGiver',
  STORY: 'story',
};
