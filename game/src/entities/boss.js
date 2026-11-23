/**
 * boss.js — multi-phase boss behaviors. Each boss def gets a phase table;
 * the BossEntity switches patterns as HP thresholds cross, with arena locks,
 * telegraphed attacks and dramatic death sequences.
 */
import { Enemy } from './enemy.js';
import { dist2, normalize, clamp } from '../core/mathx.js';

export const BossPatterns = {
  /** Spread of sand projectiles. */
  spreadShot(boss, ctx, count = 5, arc = 1.2) {
    const { player, world } = ctx;
    const base = Math.atan2(player.y - boss.y, player.x - boss.x);
    for (let i = 0; i < count; i += 1) {
      const t = count === 1 ? 0.5 : i / (count - 1);
      const angle = base - arc / 2 + arc * t;
      if (world.spawnEnemyProjectile) {
        world.spawnEnemyProjectile(boss, { x: Math.cos(angle), y: Math.sin(angle) }, {
          speed: 130,
          damage: boss.atk * 0.8,
          element: boss.element,
          color: boss.def.projectileColor || '#e8c489',
        });
      }
    }
  },

  /** Charge toward the player. */
  charge(boss, ctx) {
    const { player } = ctx;
    const dir = normalize(player.x - boss.x, player.y - boss.y);
    boss.vx = dir.x * 320;
    boss.vy = dir.y * 320;
    boss.setState('attack');
    boss.chargeTimer = 0.55;
  },

  /** Ground slam with expanding shockwave. */
  slam(boss, ctx) {
    const { world } = ctx;
    if (world.explode) {
      world.explode(boss.x, boss.y, 64, boss.atk * 1.4, boss, { team: 'enemy', element: boss.element, shake: true });
    }
    if (world.shakeCamera) world.shakeCamera(5, 0.35);
  },

  /** Summon minions. */
  summon(boss, ctx) {
    const { world } = ctx;
    if (world.spawnMinion) {
      for (let i = 0; i < 3; i += 1) {
        const angle = (i / 3) * Math.PI * 2;
        world.spawnMinion(boss, boss.x + Math.cos(angle) * 40, boss.y + Math.sin(angle) * 40);
      }
    }
  },

  /** Radial ring burst. */
  ringBurst(boss, ctx, count = 12) {
    const { world } = ctx;
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2;
      if (world.spawnEnemyProjectile) {
        world.spawnEnemyProjectile(boss, { x: Math.cos(angle), y: Math.sin(angle) }, {
          speed: 100,
          damage: boss.atk * 0.6,
          element: boss.element,
          color: boss.def.projectileColor || '#c8a8e8',
        });
      }
    }
  },

  /** Teleport near the player. */
  blink(boss, ctx) {
    const { player, world } = ctx;
    const angle = Math.random() * Math.PI * 2;
    const dist = 50 + Math.random() * 30;
    boss.x = clamp(player.x + Math.cos(angle) * dist, 16, world && world.map ? world.map.pixelWidth - 16 : 2000);
    boss.y = clamp(player.y + Math.sin(angle) * dist, 16, world && world.map ? world.map.pixelHeight - 16 : 2000);
    boss.vx = 0;
    boss.vy = 0;
  },
};

export class BossEntity extends Enemy {
  /**
   * @param {object} def — boss entry from data/enemies.js (isBoss: true)
   * @param {object} opts — { x, y, levelScale, arena }
   */
  constructor(def, opts = {}) {
    super(def, { ...opts, kind: 'boss' });
    this.isBoss = true;
    this.phases = def.phases ?? [
      { until: 0.66, patterns: ['spreadShot', 'charge'], interval: 2.4 },
      { until: 0.33, patterns: ['slam', 'spreadShot', 'summon'], interval: 2.0 },
      { until: 0, patterns: ['ringBurst', 'charge', 'slam', 'blink'], interval: 1.6 },
    ];
    this.phaseIndex = 0;
    this.patternTimer = def.firstPatternDelay ?? 1.2;
    this.currentPattern = null;
    this.chargeTimer = 0;
    this.arena = opts.arena ?? null;
    this.introTimer = 1.1;
    this.enraged = false;
    this.nameSuffix = def.nameSuffix ?? null;
  }

  get hpFraction() {
    return this.maxHp > 0 ? this.hp / this.maxHp : 0;
  }

  update(dt) {
    super.update(dt);
    if (!this.alive) return;
    if (this.introTimer > 0) {
      this.introTimer -= dt;
      this.vx = 0;
      this.vy = 0;
      return;
    }

    // phase transitions
    const frac = this.hpFraction;
    while (this.phaseIndex < this.phases.length - 1 && frac <= this.phases[this.phaseIndex].until) {
      this.phaseIndex += 1;
      this.patternTimer = 0.6;
      this.enraged = this.phaseIndex >= this.phases.length - 1;
      if (this.onPhaseChange) this.onPhaseChange(this, this.phaseIndex);
    }

    if (this.chargeTimer > 0) {
      this.chargeTimer -= dt;
      return;
    }

    this.patternTimer -= dt;
    const phase = this.phases[this.phaseIndex] ?? this.phases[0];
    if (this.patternTimer <= 0) {
      this.patternTimer = phase.interval * (this.enraged ? 0.75 : 1);
      this._firePattern(phase);
    } else if (!this.pendingAttack) {
      // keep pressure on the player between patterns
      const { player } = this.data.ctx ?? {};
      if (player && player.alive) {
        const d2 = dist2(this.x, this.y, player.x, player.y);
        if (d2 > (this.attackRange * 1.2) ** 2) {
          this.moveToward(player.x, player.y, dt, this.enraged ? 0.95 : 0.75);
          this.setState('chase');
        } else {
          this.vx *= 0.85;
          this.vy *= 0.85;
          if (this.attackCd <= 0) this.windupAttack();
        }
      }
    }
  }

  _firePattern(phase) {
    const ctx = this.data.ctx;
    if (!ctx) return;
    const patternName = phase.patterns[Math.floor(Math.random() * phase.patterns.length)];
    const fn = BossPatterns[patternName];
    if (fn) {
      this.currentPattern = patternName;
      this.setState('attack');
      fn(this, ctx);
      if (this.onPattern) this.onPattern(this, patternName);
    }
  }

  onDeath(opts = {}) {
    super.onDeath(opts);
    this.deathSequence = 1.6;
  }
}
