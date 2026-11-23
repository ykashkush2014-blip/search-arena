/**
 * enemy.js — generic enemy body. Behavior comes from enemyAI.js state
 * machines; this file owns stats, hurt/death, drops and XP.
 */
import { Entity, EntityKind } from './entity.js';
import { resolveCircleTiles, applyKnockback } from '../world/collision.js';
import { normalize, dist2 } from '../core/mathx.js';

export class Enemy extends Entity {
  /**
   * @param {object} def — entry from data/enemies.js
   * @param {object} opts — { x, y, level, patrol }
   */
  constructor(def, opts = {}) {
    // levelScale may be a plain multiplier (number) or the level module
    // contract object { hp, dmg, xp, gold }.
    const ls = opts.levelScale ?? 1;
    const mul = typeof ls === 'object' && ls !== null ? ls : { hp: ls, dmg: ls, xp: ls, gold: ls };
    const hpMul = mul.hp ?? 1;
    const dmgMul = mul.dmg ?? 1;
    const xpMul = mul.xp ?? 1;
    const goldMul = mul.gold ?? 1;
    const hp = Math.round((def.hp ?? 20) * hpMul);
    super({
      kind: opts.kind ?? EntityKind.ENEMY,
      team: 'enemy',
      radius: def.radius ?? 8,
      hp,
      x: opts.x,
      y: opts.y,
      speed: def.speed ?? 40,
    });
    this.def = def;
    this.name = def.name;
    this.atk = (def.atk ?? 5) * dmgMul;
    this.defense = def.def ?? 0;
    this.xpValue = Math.round((def.xp ?? 10) * xpMul);
    this.goldMin = Math.round((def.gold ? def.gold[0] : 2) * goldMul);
    this.goldMax = Math.round((def.gold ? def.gold[1] : 6) * goldMul);
    this.aggroRange = def.aggroRange ?? 120;
    this.attackRange = def.attackRange ?? 18;
    this.attackCdMax = def.attackCd ?? 1.2;
    this.attackCd = Math.random() * this.attackCdMax;
    this.aiName = def.ai ?? 'chaser';
    this.drops = def.drops ?? [];
    this.flying = !!def.flying;
    this.patrol = opts.patrol || null;
    this.patrolIndex = 0;
    this.homeX = this.x;
    this.homeY = this.y;
    this.target = null;
    this.stunTimer = 0;
    this.windupTimer = 0;
    this.pendingAttack = false;
    this.isBoss = false;
    this.element = def.element || 'physical';
    this.knockResist = def.knockResist ?? 0;
  }

  update(dt) {
    if (!this.alive) return;
    if (this.attackCd > 0) this.attackCd -= dt;
    if (this.stunTimer > 0) {
      this.stunTimer -= dt;
      this.vx *= 0.85;
      this.vy *= 0.85;
    }
    if (this.pendingAttack) {
      this.windupTimer -= dt;
      if (this.windupTimer <= 0) {
        this.pendingAttack = false;
        this.onAttackStrike();
      }
    }
    const map = this.data.map;
    if (map) {
      const moved = resolveCircleTiles(map, this.x + this.vx * dt, this.y + this.vy * dt, this.radius);
      this.x = moved.x;
      this.y = moved.y;
    } else {
      this.x += this.vx * dt;
      this.y += this.vy * dt;
    }
  }

  /** Begin the windup for a melee strike (AI calls this). */
  windupAttack() {
    if (this.attackCd > 0 || this.pendingAttack) return false;
    this.pendingAttack = true;
    this.windupTimer = 0.28;
    this.attackCd = this.attackCdMax;
    this.setState('attack');
    return true;
  }

  /** Called when the windup completes — combat.js listens via world. */
  onAttackStrike() {
    this.setState('chase');
    if (this.onStrike) this.onStrike(this);
  }

  hurt(amount, opts = {}) {
    if (!this.alive) return 0;
    const mitigated = Math.max(1, Math.round(amount * (1 - this.defense / (this.defense + 50))));
    const resist = 1 - this.knockResist;
    const dealt = this.takeDamage(mitigated, {
      knockback: (opts.knockback ?? 90) * resist,
      knockDir: opts.knockDir ?? { x: 0, y: 0 },
    });
    if (dealt > 0) {
      this.stunTimer = Math.max(this.stunTimer, 0.12);
      // aggro on hit
      if (opts.source && !this.target) this.target = opts.source;
    }
    return dealt;
  }

  knockback(dirX, dirY, force) {
    const map = this.data.map;
    const resist = 1 - this.knockResist;
    if (map) {
      const res = applyKnockback(map, this.x, this.y, this.radius, dirX, dirY, force * resist);
      this.x = res.x;
      this.y = res.y;
    } else {
      this.x += dirX * force * resist;
      this.y += dirY * force * resist;
    }
    this.stunTimer = Math.max(this.stunTimer, 0.15);
  }

  onDeath(opts = {}) {
    this.setState('dead');
    this.deathTime = 0;
    void opts;
  }

  /** Distance-based aggro check used by AI. */
  canAggro(target) {
    if (!target || !target.alive) return false;
    return dist2(this.x, this.y, target.x, target.y) <= this.aggroRange * this.aggroRange;
  }

  faceTarget(target) {
    if (!target) return;
    this.facing = target.x >= this.x ? 1 : -1;
  }

  /** Move toward a world point at a fraction of max speed. */
  moveToward(x, y, dt, factor = 1) {
    const dir = normalize(x - this.x, y - this.y);
    const targetVx = dir.x * this.speed * factor;
    const targetVy = dir.y * this.speed * factor;
    this.vx += (targetVx - this.vx) * Math.min(1, dt * 8);
    this.vy += (targetVy - this.vy) * Math.min(1, dt * 8);
    if (Math.abs(dir.x) > 0.05) this.facing = dir.x > 0 ? 1 : -1;
    return dir;
  }

  /** Idle drift — small noise motion near home. */
  wander(dt, rng = Math) {
    if (rng.chance ? rng.chance(0.01) : Math.random() < 0.01) {
      const angle = Math.random() * Math.PI * 2;
      this.vx = Math.cos(angle) * this.speed * 0.35;
      this.vy = Math.sin(angle) * this.speed * 0.35;
    }
    this.vx *= 0.96;
    this.vy *= 0.96;
    void dt;
  }
}
