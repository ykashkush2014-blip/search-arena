/**
 * combat.js — damage pipeline: melee arcs, crits, lifesteal, elemental
 * modifiers, floating damage numbers and XP/gold awarding. All combat events
 * are emitted on the game bus so quests/achievements/audio can react.
 */
import { coneHit, circlesHit, applyKnockback } from '../world/collision.js';
import { normalize, clamp, dist2 } from '../core/mathx.js';
import { gameEvents, Events } from '../core/events.js';
import { DAMAGE_COLORS } from '../gfx/palette.js';

export const ELEMENTS = {
  physical: { vs: {}, color: DAMAGE_COLORS.physical },
  fire: { vs: { sand: 1.25, plant: 1.5 }, color: DAMAGE_COLORS.fire },
  sand: { vs: { fire: 0.75, water: 1.25 }, color: DAMAGE_COLORS.sand },
  magic: { vs: {}, color: DAMAGE_COLORS.magic },
  water: { vs: { fire: 1.5 }, color: '#63b3d8' },
  true: { vs: {}, color: DAMAGE_COLORS.true },
};

export class CombatSystem {
  /**
   * @param {object} ctx { world, events }
   */
  constructor(ctx = {}) {
    this.ctx = ctx;
    this.floaters = []; // { x, y, vy, text, color, life, crit }
    this.hitStop = 0;
    this.shakeRequest = 0;
    this.comboCount = 0;
    this.comboTimer = 0;
    this.stats = { damageDealt: 0, damageTaken: 0, kills: 0, crits: 0, maxCombo: 0 };
  }

  /**
   * Resolve a player melee swing. Called once per attack state entry.
   */
  resolvePlayerMelee(player, enemies, opts = {}) {
    const arc = opts.arc ?? 1.9;
    const range = opts.range ?? 30 + player.attackCombo * 3;
    const baseDamage = player.stats.atk * (1 + (player.attackCombo - 1) * 0.18);
    const hits = [];
    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      if (!coneHit(player.x, player.y, Math.atan2(player.aimDir.y, player.aimDir.x), arc, range + enemy.radius, enemy.x, enemy.y)) {
        continue;
      }
      const result = this.damageEntity(enemy, baseDamage, {
        source: player,
        element: opts.element ?? 'physical',
        knockback: 120,
        critChance: player.stats.crit,
        critDmg: player.stats.critDmg,
        lifesteal: player.stats.lifesteal,
      });
      if (result.dealt > 0) hits.push({ enemy, ...result });
    }
    if (hits.length > 0) {
      this.hitStop = hits.some((h) => h.crit) ? 0.06 : 0.03;
      this.shakeRequest = Math.max(this.shakeRequest, hits.length > 1 ? 3 : 1.6);
      this.comboCount += hits.length;
      this.comboTimer = 2.2;
      this.stats.maxCombo = Math.max(this.stats.maxCombo, this.comboCount);
    }
    return hits;
  }

  /**
   * Damage any entity with the full pipeline. Returns { dealt, crit }.
   */
  damageEntity(target, amount, opts = {}) {
    if (!target || !target.alive) return { dealt: 0, crit: false };
    let dmg = amount;
    const element = opts.element ?? 'physical';
    const table = ELEMENTS[element];
    if (table && target.element && table.vs[target.element]) {
      dmg *= table.vs[target.element];
    }
    let crit = false;
    const critChance = opts.critChance ?? 0;
    if (critChance > 0 && Math.random() < critChance) {
      dmg *= opts.critDmg ?? 1.5;
      crit = true;
      this.stats.crits += 1;
    }
    const before = target.hp;
    const knockDir = opts.knockDir ?? (opts.source
      ? normalize(target.x - opts.source.x, target.y - opts.source.y)
      : { x: 0, y: 0 });
    const dealt = target.hurt
      ? target.hurt(dmg, { source: opts.source, knockback: opts.knockback ?? 0, knockDir })
      : target.takeDamage(dmg, { knockback: opts.knockback ?? 0, knockDir });
    const realDealt = dealt || Math.min(before, Math.round(dmg));
    this.stats.damageDealt += realDealt;
    if (target.team === 'player') this.stats.damageTaken += realDealt;

    // lifesteal
    if (opts.lifesteal > 0 && opts.source && opts.source.heal) {
      opts.source.heal(realDealt * opts.lifesteal);
    }

    // floating number
    this.addFloater(target.x, target.y - 12, String(Math.round(realDealt)), crit ? DAMAGE_COLORS.crit : (table ? table.color : '#fff'), crit);

    gameEvents.emit(Events.ENTITY_HIT, {
      target,
      source: opts.source,
      amount: realDealt,
      crit,
      element,
    });

    if (!target.alive) {
      this.onKill(target, opts.source);
    }
    return { dealt: realDealt, crit };
  }

  onKill(target, killer) {
    this.stats.kills += 1;
    gameEvents.emit(Events.ENTITY_DEATH, { target, killer });
    if (killer && killer.kind === 'player') {
      killer.kills += 1;
    }
    // award XP + gold
    if (target.xpValue && killer && killer.gainXp) {
      const res = killer.gainXp(target.xpValue);
      gameEvents.emit(Events.PLAYER_LEVELUP, { player: killer, ...res });
      this.addFloater(target.x, target.y - 20, `+${res.gained} XP`, '#c9a15e', false);
    }
    if (killer && killer.addGold && target.goldMax !== undefined) {
      const gold = target.goldMin + Math.floor(Math.random() * Math.max(1, target.goldMax - target.goldMin));
      if (gold > 0) {
        const total = killer.addGold(gold);
        gameEvents.emit(Events.GOLD_CHANGED, { player: killer, amount: total });
      }
    }
    if (target.isBoss) {
      gameEvents.emit(Events.BOSS_DEFEAT, { boss: target, killer });
    }
  }

  /** Player takes damage from any source. */
  damagePlayer(player, amount, opts = {}) {
    if (!player || !player.alive) return 0;
    const dealt = player.hurt(amount, opts.source);
    if (dealt > 0) {
      this.addFloater(player.x, player.y - 14, String(dealt), DAMAGE_COLORS.physical, false);
      this.shakeRequest = Math.max(this.shakeRequest, 2.5);
      gameEvents.emit(Events.PLAYER_HIT, { player, amount: dealt, source: opts.source });
    }
    if (!player.alive) {
      gameEvents.emit(Events.PLAYER_DEATH, { player, source: opts.source });
    }
    return dealt;
  }

  /** Area explosion (bombs, boss slams, barrels). */
  explode(x, y, radius, damage, source, opts = {}) {
    const world = this.ctx.world;
    const team = opts.team ?? (source && source.team === 'player' ? 'player' : 'enemy');
    const victims = [];
    const targets = world ? world.getCombatants() : [];
    for (const e of targets) {
      if (!e.alive || e.team === team) continue;
      if (dist2(x, y, e.x, e.y) <= (radius + e.radius) * (radius + e.radius)) {
        const dir = normalize(e.x - x, e.y - y);
        const res = this.damageEntity(e, damage, {
          source,
          element: opts.element ?? 'physical',
          knockback: 160,
          knockDir: dir,
        });
        victims.push({ entity: e, ...res });
        if (e.knockback) e.knockback(dir.x, dir.y, 160);
      }
    }
    if (opts.shake !== false) this.shakeRequest = Math.max(this.shakeRequest, 5);
    if (world && world.spawnBurst) {
      world.spawnBurst(x, y, radius, opts.element ?? 'sand');
    }
    return victims;
  }

  // --------------------------------------------------------- floaters

  addFloater(x, y, text, color = '#fff', crit = false) {
    if (this.floaters.length > 40) this.floaters.shift();
    this.floaters.push({
      x,
      y,
      vy: -34,
      text,
      color,
      crit,
      life: crit ? 0.9 : 0.65,
      maxLife: crit ? 0.9 : 0.65,
    });
  }

  updateFloaters(dt) {
    for (let i = this.floaters.length - 1; i >= 0; i -= 1) {
      const f = this.floaters[i];
      f.life -= dt;
      if (f.life <= 0) {
        this.floaters.splice(i, 1);
        continue;
      }
      f.y += f.vy * dt;
      f.vy *= 0.92;
    }
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.comboCount = 0;
    }
    if (this.hitStop > 0) this.hitStop -= dt;
    if (this.shakeRequest > 0) this.shakeRequest = Math.max(0, this.shakeRequest - dt * 18);
  }

  renderFloaters(ctx, camera) {
    for (const f of this.floaters) {
      if (!camera.isVisible(f.x, f.y, 24)) continue;
      const alpha = clamp(f.life / f.maxLife, 0, 1);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = f.crit ? 'bold 10px monospace' : '8px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillText(f.text, f.x + 1, f.y + 1);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
      ctx.restore();
    }
  }

  /** Hit-stop helper: the world checks this to freeze simulation briefly. */
  get frozen() {
    return this.hitStop > 0;
  }
}

/**
 * Pure damage formula — exported for tests and the balance spreadsheet.
 */
export function computeDamage(attack, defense, multiplier = 1, crit = false, critDmg = 1.5) {
  const mitigated = attack * multiplier * (40 / (40 + Math.max(0, defense)));
  return Math.max(1, Math.round(mitigated * (crit ? critDmg : 1)));
}

export function computeDps(attack, attackSpeed, crit, critDmg, defense) {
  const hit = computeDamage(attack, defense, 1, false, critDmg);
  const expected = hit * (1 + crit * (critDmg - 1));
  return expected * attackSpeed;
}

export { circlesHit, applyKnockback };
