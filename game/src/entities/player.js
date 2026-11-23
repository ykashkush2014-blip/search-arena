/**
 * player.js — the wanderer. Handles movement feel (accel/dash/i-frames),
 * attack combos, skill casts and interaction checks. Stat math comes from
 * systems/inventory + systems/skills via the shared `stats` object.
 */
import { Entity, EntityKind } from './entity.js';
import { resolveCircleTiles } from '../world/collision.js';
import { normalize, clamp, moveTowards } from '../core/mathx.js';
import { TILE } from '../gfx/tilegen.js';

export const PlayerState = {
  IDLE: 'idle',
  WALK: 'walk',
  ATTACK: 'attack',
  DASH: 'dash',
  HURT: 'hurt',
  DEAD: 'dead',
  CAST: 'cast',
  INTERACT: 'interact',
};

export class Player extends Entity {
  constructor(opts = {}) {
    super({
      kind: EntityKind.PLAYER,
      team: 'player',
      radius: 6,
      hp: opts.maxHp ?? 100,
      speed: opts.speed ?? 92,
      ...opts,
    });
    this.name = opts.name ?? 'Wanderer';
    this.level = 1;
    this.xp = 0;
    this.xpNext = 100;
    this.gold = 0;
    this.baseStats = {
      atk: 10,
      def: 4,
      crit: 0.05,
      critDmg: 1.5,
      speed: 92,
      maxHp: 100,
      maxMana: 60,
      stamina: 100,
      lifesteal: 0,
      goldFind: 0,
      xpGain: 0,
    };
    this.stats = { ...this.baseStats };
    this.mana = this.stats.maxMana;
    this.stamina = this.stats.stamina;
    this.attackCd = 0;
    this.attackCombo = 0;
    this.comboTimer = 0;
    this.dashCd = 0;
    this.skillCds = [0, 0, 0, 0];
    this.interactTarget = null;
    this.moveIntent = { x: 0, y: 0 };
    this.aimDir = { x: 1, y: 0 };
    this.walkDistance = 0;
    this.kills = 0;
    this.deaths = 0;
    this.runTime = 0;
    this.godMode = false;
  }

  /** Recompute derived stats after equipment changes. */
  recalcStats(equipmentBonuses = {}) {
    const s = { ...this.baseStats };
    for (const [key, value] of Object.entries(equipmentBonuses)) {
      if (key in s) s[key] += value;
      else s[key] = value;
    }
    const hpRatio = this.stats.maxHp > 0 ? this.hp / this.stats.maxHp : 1;
    const manaRatio = this.stats.maxMana > 0 ? this.mana / this.stats.maxMana : 1;
    this.stats = s;
    this.maxHp = s.maxHp;
    this.hp = Math.max(1, Math.round(s.maxHp * hpRatio));
    this.mana = Math.round(s.maxMana * manaRatio);
    this.speed = s.speed;
    return s;
  }

  /**
   * Frame update. `world` provides collision map and combat callbacks.
   */
  update(dt) {
    if (this.state === PlayerState.DEAD) return;
    this.runTime += dt;
    if (this.attackCd > 0) this.attackCd -= dt;
    if (this.dashCd > 0) this.dashCd -= dt;
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.attackCombo = 0;
    }
    for (let i = 0; i < this.skillCds.length; i += 1) {
      if (this.skillCds[i] > 0) this.skillCds[i] -= dt;
    }

    // mana regen
    if (this.mana < this.stats.maxMana) {
      this.mana = Math.min(this.stats.maxMana, this.mana + dt * 2.2);
    }
    // stamina regen
    if (this.stamina < this.stats.stamina) {
      this.stamina = Math.min(this.stats.stamina, this.stamina + dt * 18);
    }

    const map = this.data.map;
    switch (this.state) {
      case PlayerState.DASH:
        this._updateDash(dt, map);
        break;
      case PlayerState.ATTACK:
        this._updateAttack(dt, map);
        break;
      case PlayerState.HURT:
        if (this.stateTime > 0.18) this.setState(PlayerState.IDLE);
        this._applyMove(dt, map, 0.35);
        break;
      default:
        this._applyMove(dt, map, 1);
        break;
    }
  }

  _applyMove(dt, map, factor) {
    const intent = this.moveIntent;
    const len = Math.sqrt(intent.x * intent.x + intent.y * intent.y);
    if (len > 0.05) {
      this.facing = intent.x >= 0 ? 1 : -1;
      this.aimDir = { x: intent.x / len, y: intent.y / len };
    }
    let slow = 1;
    if (map) {
      const tx = Math.floor(this.x / TILE);
      const ty = Math.floor(this.y / TILE);
      slow = 1 - clamp(map.slowAt(tx, ty), 0, 0.8);
    }
    const targetVx = intent.x * this.stats.speed * factor * slow;
    const targetVy = intent.y * this.stats.speed * factor * slow;
    // acceleration for a slightly weighty feel
    this.vx = moveTowards(this.vx, targetVx, 700 * dt);
    this.vy = moveTowards(this.vy, targetVy, 700 * dt);

    if (map) {
      const resolved = resolveCircleTiles(map, this.x, this.y, this.radius);
      // resolve static tiles first, then integrate velocity
      const moved = resolveCircleTiles(map, this.x + this.vx * dt, this.y + this.vy * dt, this.radius);
      this.x = moved.x;
      this.y = moved.y;
      if (moved.hit) {
        // slide along walls: keep the free axis
        const tryX = resolveCircleTiles(map, this.x + this.vx * dt, this.y, this.radius);
        const tryY = resolveCircleTiles(map, this.x, this.y + this.vy * dt, this.radius);
        if (!tryX.hit) this.x = tryX.x;
        if (!tryY.hit) this.y = tryY.y;
      }
      void resolved;
    } else {
      this.x += this.vx * dt;
      this.y += this.vy * dt;
    }

    const speedNow = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    if (speedNow > 8) {
      this.setState(PlayerState.WALK);
      this.walkDistance += speedNow * dt;
    } else if (this.state === PlayerState.WALK) {
      this.setState(PlayerState.IDLE);
    }
  }

  _updateDash(dt, map) {
    this.invulnTimer = Math.max(this.invulnTimer, 0.02);
    if (map) {
      const moved = resolveCircleTiles(map, this.x + this.vx * dt, this.y + this.vy * dt, this.radius);
      this.x = moved.x;
      this.y = moved.y;
    } else {
      this.x += this.vx * dt;
      this.y += this.vy * dt;
    }
    if (this.stateTime >= 0.16) {
      this.vx *= 0.25;
      this.vy *= 0.25;
      this.setState(PlayerState.IDLE);
    }
  }

  _updateAttack(dt, map) {
    // slight forward drift during the swing
    if (map) {
      const moved = resolveCircleTiles(map, this.x + this.vx * dt, this.y + this.vy * dt, this.radius);
      this.x = moved.x;
      this.y = moved.y;
    }
    if (this.stateTime >= 0.22) {
      this.setState(PlayerState.IDLE);
    }
  }

  // ------------------------------------------------------------- actions

  tryDash() {
    if (this.state === PlayerState.DEAD || this.dashCd > 0) return false;
    if (this.stamina < 22) return false;
    const dir = normalize(this.moveIntent.x, this.moveIntent.y);
    const d = dir.len > 0.1 ? dir : this.aimDir;
    this.stamina -= 22;
    this.dashCd = 0.55;
    this.vx = d.x * 300;
    this.vy = d.y * 300;
    this.invulnTimer = 0.22;
    this.setState(PlayerState.DASH);
    return true;
  }

  /**
   * Start a melee swing. The actual hit resolution is done by combat.js in
   * the same fixed step (attackId lets it de-duplicate hits).
   */
  tryAttack() {
    if (this.state === PlayerState.DEAD || this.attackCd > 0) return false;
    if (this.state === PlayerState.DASH) return false;
    this.attackCombo = (this.attackCombo % 3) + 1;
    this.comboTimer = 0.9;
    this.attackCd = 0.28 - Math.min(0.1, this.attackCombo * 0.03);
    this.setState(PlayerState.ATTACK);
    const dir = normalize(this.moveIntent.x, this.moveIntent.y);
    const d = dir.len > 0.1 ? dir : this.aimDir;
    this.aimDir = d;
    this.vx = d.x * 60;
    this.vy = d.y * 60;
    return true;
  }

  tryCastSkill(index) {
    if (this.state === PlayerState.DEAD) return false;
    if (index < 0 || index >= this.skillCds.length) return false;
    if (this.skillCds[index] > 0) return false;
    return true; // systems/skills.js performs the real checks & effects
  }

  hurt(amount, source = null) {
    if (this.godMode) return 0;
    const mitigated = Math.max(1, Math.round(amount * (1 - clamp(this.stats.def / (this.stats.def + 40), 0, 0.7))));
    const dealt = this.takeDamage(mitigated, {
      knockback: source ? 110 : 0,
      knockDir: source ? normalize(this.x - source.x, this.y - source.y) : { x: 0, y: 0 },
    });
    if (dealt > 0 && this.alive) {
      this.invulnTimer = 0.45;
      this.setState(PlayerState.HURT);
    }
    return dealt;
  }

  onDeath() {
    this.deaths += 1;
    this.setState(PlayerState.DEAD);
  }

  gainXp(amount) {
    const gained = Math.round(amount * (1 + this.stats.xpGain));
    this.xp += gained;
    let leveled = false;
    while (this.xp >= this.xpNext) {
      this.xp -= this.xpNext;
      this.level += 1;
      this.xpNext = Math.round(this.xpNext * 1.28 + 30);
      this.baseStats.maxHp += 12;
      this.baseStats.atk += 2;
      this.baseStats.def += 1;
      this.baseStats.maxMana += 6;
      leveled = true;
    }
    if (leveled) {
      this.hp = this.stats.maxHp;
      this.mana = this.stats.maxMana;
    }
    return { gained, leveled };
  }

  addGold(amount) {
    const total = Math.round(amount * (1 + this.stats.goldFind));
    this.gold += total;
    return total;
  }

  /** Respawn after death (checkpoint). */
  respawn(x, y) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.hp = this.stats.maxHp;
    this.mana = this.stats.maxMana;
    this.stamina = this.stats.stamina;
    this.alive = true;
    this.invulnTimer = 1.2;
    this.setState(PlayerState.IDLE);
    this.attackCombo = 0;
    this.knockTimer = 0;
    this.flashTimer = 0;
  }
}
