/**
 * skills.js — active abilities with cooldowns, mana costs and effect
 * dispatch. Skill trees are data-driven (data/skillsData.js).
 */
import { gameEvents, Events } from '../core/events.js';
import { normalize, dist2 } from '../core/mathx.js';

export class SkillSystem {
  /**
   * @param {object} skillDb — SKILLS map from data/skillsData.js
   */
  constructor(skillDb) {
    this.skillDb = skillDb;
    this.unlocked = new Set();
    this.cooldowns = new Map();
    this.equipped = [null, null, null, null]; // 4 hotbar slots
    this.ranks = new Map(); // skillId -> rank
  }

  unlock(skillId) {
    const def = this.skillDb[skillId];
    if (!def) return false;
    if (this.unlocked.has(skillId)) return false;
    this.unlocked.add(skillId);
    this.ranks.set(skillId, 1);
    // auto-slot into the first free hotbar slot
    for (let i = 0; i < this.equipped.length; i += 1) {
      if (!this.equipped[i]) {
        this.equipped[i] = skillId;
        break;
      }
    }
    gameEvents.emit(Events.SKILL_UNLOCKED, { skillId, def });
    return true;
  }

  rankUp(skillId) {
    const def = this.skillDb[skillId];
    if (!def || !this.unlocked.has(skillId)) return false;
    const rank = this.ranks.get(skillId) ?? 1;
    if (rank >= (def.maxRank ?? 5)) return false;
    this.ranks.set(skillId, rank + 1);
    return true;
  }

  rankOf(skillId) {
    return this.ranks.get(skillId) ?? 0;
  }

  isUnlocked(skillId) {
    return this.unlocked.has(skillId);
  }

  cooldownOf(skillId) {
    return this.cooldowns.get(skillId) ?? 0;
  }

  /** Effective cooldown after rank reductions. */
  effectiveCooldown(skillId) {
    const def = this.skillDb[skillId];
    if (!def) return 0;
    const rank = this.rankOf(skillId);
    return (def.cooldown ?? 1) * (1 - Math.min(0.4, (rank - 1) * 0.06));
  }

  manaCost(skillId) {
    const def = this.skillDb[skillId];
    if (!def) return 0;
    return (def.mana ?? 0) * (1 - Math.min(0.25, (this.rankOf(skillId) - 1) * 0.04));
  }

  equip(skillId, slot) {
    if (slot < 0 || slot >= this.equipped.length) return false;
    if (skillId !== null && !this.unlocked.has(skillId)) return false;
    this.equipped[slot] = skillId;
    return true;
  }

  /**
   * Cast a hotbar slot. `ctx` gives access to player, world, particles, audio.
   * Returns { ok, reason, def }.
   */
  castSlot(slot, player, ctx) {
    const skillId = this.equipped[slot];
    if (!skillId) return { ok: false, reason: 'empty' };
    return this.cast(skillId, player, ctx);
  }

  cast(skillId, player, ctx) {
    const def = this.skillDb[skillId];
    if (!def) return { ok: false, reason: 'unknown' };
    if (!this.unlocked.has(skillId)) return { ok: false, reason: 'locked' };
    if (this.cooldownOf(skillId) > 0) return { ok: false, reason: 'cooldown' };
    const cost = this.manaCost(skillId);
    if (player.mana < cost) return { ok: false, reason: 'mana' };
    const handler = SKILL_EFFECTS[def.effect];
    if (!handler) return { ok: false, reason: 'noEffect' };

    player.mana -= cost;
    this.cooldowns.set(skillId, this.effectiveCooldown(skillId));
    const rank = this.rankOf(skillId);
    handler(player, def, rank, ctx);
    gameEvents.emit(Events.SKILL_USED, { skillId, def, rank, player });
    return { ok: true, def, rank };
  }

  update(dt) {
    for (const [id, cd] of this.cooldowns) {
      if (cd > 0) this.cooldowns.set(id, Math.max(0, cd - dt));
    }
  }

  serialize() {
    return {
      unlocked: [...this.unlocked],
      ranks: [...this.ranks.entries()],
      equipped: [...this.equipped],
    };
  }

  static deserialize(data, skillDb) {
    const sys = new SkillSystem(skillDb);
    for (const id of data.unlocked ?? []) {
      sys.unlocked.add(id);
      sys.ranks.set(id, 1);
    }
    for (const [id, rank] of data.ranks ?? []) sys.ranks.set(id, rank);
    sys.equipped = [...(data.equipped ?? [null, null, null, null])];
    return sys;
  }
}

/**
 * Effect implementations. Each receives the player, the skill def, the rank
 * and a context bag { world, combat, particles, audio, enemies }.
 */
export const SKILL_EFFECTS = {
  /** Wide melee arc, higher damage than a normal swing. */
  whirlwind(player, def, rank, ctx) {
    const damage = player.stats.atk * (def.mult ?? 1.6) * (1 + rank * 0.12);
    const targets = ctx.enemies ?? [];
    for (const enemy of targets) {
      if (!enemy.alive) continue;
      if (dist2(player.x, player.y, enemy.x, enemy.y) > (def.range ?? 60) ** 2) continue;
      ctx.combat.damageEntity(enemy, damage, {
        source: player,
        element: def.element ?? 'physical',
        knockback: 170,
        critChance: player.stats.crit,
        critDmg: player.stats.critDmg,
      });
    }
    if (ctx.particles) {
      ctx.particles.ring(player.x, player.y, 18, {
        color: ['#e8c489', '#f5e9d0'],
        speed: 90,
        life: 0.4,
      });
    }
    if (ctx.audio) ctx.audio.play('dash');
    player.setState('attack');
  },

  /** Fire projectile from the staff. */
  firebolt(player, def, rank, ctx) {
    const dir = normalize(player.aimDir.x, player.aimDir.y);
    if (ctx.world && ctx.world.spawnPlayerProjectile) {
      ctx.world.spawnPlayerProjectile(player, dir, {
        speed: def.speed ?? 190,
        damage: player.stats.atk * (def.mult ?? 1.4) * (1 + rank * 0.1),
        element: def.element ?? 'fire',
        explodeRadius: def.explodeRadius ?? 0,
        color: '#f29a4c',
        pierce: def.pierce ?? 0,
      });
    }
    if (ctx.audio) ctx.audio.play('attack');
    player.setState('cast');
  },

  /** Heal over time burst. */
  heal(player, def, rank, ctx) {
    const amount = (def.heal ?? 30) * (1 + rank * 0.15);
    player.heal(amount);
    if (ctx.particles) {
      ctx.particles.burst(player.x, player.y, 14, {
        color: ['#63c76a', '#a8e8a8'],
        speedMin: 10,
        speedMax: 40,
        gravity: -30,
        life: 0.7,
      });
    }
    if (ctx.audio) ctx.audio.play('heal');
  },

  /** Dash with damage on the way. */
  shadowStep(player, def, rank, ctx) {
    const dir = normalize(player.moveIntent.x, player.moveIntent.y);
    const d = dir.len > 0.1 ? dir : player.aimDir;
    player.vx = d.x * (def.speed ?? 380);
    player.vy = d.y * (def.speed ?? 380);
    player.invulnTimer = 0.45;
    player.setState('dash');
    player.dashCd = 0;
    const damage = player.stats.atk * (def.mult ?? 1.2) * (1 + rank * 0.1);
    const targets = ctx.enemies ?? [];
    for (const enemy of targets) {
      if (!enemy.alive) continue;
      if (dist2(player.x, player.y, enemy.x, enemy.y) > (def.range ?? 70) ** 2) continue;
      ctx.combat.damageEntity(enemy, damage, {
        source: player,
        element: def.element ?? 'physical',
        knockback: 130,
      });
    }
    if (ctx.particles) {
      ctx.particles.burst(player.x, player.y, 10, { color: '#5a8fe0', speedMax: 60, life: 0.35 });
    }
    if (ctx.audio) ctx.audio.play('dash');
  },

  /** Pull enemies in and damage them. */
  sandVortex(player, def, rank, ctx) {
    const range = def.range ?? 90;
    const targets = ctx.enemies ?? [];
    for (const enemy of targets) {
      if (!enemy.alive) continue;
      const d2 = dist2(player.x, player.y, enemy.x, enemy.y);
      if (d2 > range * range) continue;
      // pull
      const dir = normalize(player.x - enemy.x, player.y - enemy.y);
      const pull = Math.min(90, Math.sqrt(d2) * 0.8);
      enemy.x += dir.x * pull;
      enemy.y += dir.y * pull;
      ctx.combat.damageEntity(enemy, player.stats.atk * (def.mult ?? 1.1) * (1 + rank * 0.12), {
        source: player,
        element: 'sand',
        knockback: 30,
      });
    }
    if (ctx.particles) {
      ctx.particles.ring(player.x, player.y, 26, { color: ['#e8c489', '#c99a58'], speed: 60, life: 0.6 });
    }
    if (ctx.audio) ctx.audio.play('sandstorm');
  },

  /** Freeze/slow nearby enemies. */
  frostNova(player, def, rank, ctx) {
    const range = def.range ?? 100;
    const targets = ctx.enemies ?? [];
    for (const enemy of targets) {
      if (!enemy.alive) continue;
      if (dist2(player.x, player.y, enemy.x, enemy.y) > range * range) continue;
      enemy.stunTimer = Math.max(enemy.stunTimer, (def.slow ?? 1.2) * (1 + rank * 0.1));
      ctx.combat.damageEntity(enemy, player.stats.atk * (def.mult ?? 0.9), {
        source: player,
        element: 'water',
        knockback: 60,
      });
    }
    if (ctx.particles) {
      ctx.particles.ring(player.x, player.y, 22, { color: ['#63b3d8', '#bfe8f5'], speed: 110, life: 0.5 });
    }
    if (ctx.audio) ctx.audio.play('portal');
  },

  /** Temporary damage buff. */
  battleShout(player, def, rank, ctx) {
    player.buffTimers = player.buffTimers ?? {};
    player.buffTimers.atkUp = (def.duration ?? 8) * (1 + rank * 0.08);
    player.stats.atk *= 1 + (def.bonus ?? 0.25);
    if (ctx.particles) {
      ctx.particles.burst(player.x, player.y, 16, { color: ['#e8b64c', '#f2d8a0'], speedMax: 50, life: 0.5, gravity: -20 });
    }
    if (ctx.audio) ctx.audio.play('levelUp');
  },

  /** Multi-shot: three arrows in a fan. */
  multiShot(player, def, rank, ctx) {
    const base = Math.atan2(player.aimDir.y, player.aimDir.x);
    const fan = def.arc ?? 0.5;
    const shots = def.shots ?? 3;
    for (let i = 0; i < shots; i += 1) {
      const t = shots === 1 ? 0.5 : i / (shots - 1);
      const angle = base - fan / 2 + fan * t;
      if (ctx.world && ctx.world.spawnPlayerProjectile) {
        ctx.world.spawnPlayerProjectile(player, { x: Math.cos(angle), y: Math.sin(angle) }, {
          speed: def.speed ?? 200,
          damage: player.stats.atk * (def.mult ?? 0.9) * (1 + rank * 0.08),
          element: 'physical',
          color: '#e8e2d0',
          pierce: 1,
        });
      }
    }
    if (ctx.audio) ctx.audio.play('attack');
    player.setState('attack');
  },
};
