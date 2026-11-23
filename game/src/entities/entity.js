/**
 * entity.js — base entity for everything that lives in the world: players,
 * enemies, NPCs, projectiles and loot drops. Deliberately plain: heavy logic
 * lives in the systems, this class owns position/health/animation bookkeeping.
 */
import { dist2 } from '../core/mathx.js';

export const EntityKind = {
  PLAYER: 'player',
  ENEMY: 'enemy',
  BOSS: 'boss',
  NPC: 'npc',
  PROJECTILE: 'projectile',
  LOOT: 'loot',
  CHEST: 'chest',
  PROP: 'prop',
  PORTAL: 'portal',
};

let nextEntityId = 1;

export function resetEntityIds() {
  nextEntityId = 1;
}

export class Entity {
  /**
   * @param {object} opts { kind, x, y, radius, hp, team }
   */
  constructor(opts = {}) {
    this.id = opts.id ?? nextEntityId++;
    this.kind = opts.kind ?? EntityKind.PROP;
    this.x = opts.x ?? 0;
    this.y = opts.y ?? 0;
    this.vx = 0;
    this.vy = 0;
    this.radius = opts.radius ?? 8;
    this.height = opts.height ?? 16;
    this.team = opts.team ?? 'neutral'; // player | enemy | neutral
    this.hp = opts.hp ?? 1;
    this.maxHp = opts.hp ?? 1;
    this.alive = true;
    this.removeMe = false;
    this.facing = opts.facing ?? 1; // 1 right, -1 left
    this.state = 'idle';
    this.stateTime = 0;
    this.animFrame = 0;
    this.animTimer = 0;
    this.flashTimer = 0;
    this.knockTimer = 0;
    this.invulnTimer = 0;
    this.speed = opts.speed ?? 60;
    this.z = 0; // vertical offset for hops/flying
    this.shadowScale = opts.shadowScale ?? 1;
    this.data = opts.data || {};
  }

  /** Damage entry point. Returns actual damage dealt. */
  takeDamage(amount, opts = {}) {
    if (!this.alive || this.invulnTimer > 0) return 0;
    const dmg = Math.max(0, Math.round(amount));
    if (dmg === 0) return 0;
    this.hp -= dmg;
    this.flashTimer = 0.12;
    if (opts.knockback) {
      const dir = opts.knockDir ?? { x: 0, y: 0 };
      const force = opts.knockback;
      this.vx += dir.x * force;
      this.vy += dir.y * force;
      this.knockTimer = 0.15;
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.die(opts);
    }
    return dmg;
  }

  heal(amount) {
    if (!this.alive) return 0;
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + Math.max(0, Math.round(amount)));
    return this.hp - before;
  }

  die(opts = {}) {
    if (!this.alive) return;
    this.alive = false;
    this.state = 'dead';
    this.stateTime = 0;
    this.onDeath(opts);
  }

  /** Override for death effects (drops, events). */
  onDeath(opts = {}) {
    void opts;
  }

  setState(state) {
    if (this.state === state) return;
    this.state = state;
    this.stateTime = 0;
    this.animFrame = 0;
    this.animTimer = 0;
  }

  isInvulnerable() {
    return this.invulnTimer > 0;
  }

  /** Distance helpers. */
  distTo(other) {
    return Math.sqrt(dist2(this.x, this.y, other.x, other.y));
  }

  distTo2(other) {
    return dist2(this.x, this.y, other.x, other.y);
  }

  /** Base update: timers + integration + simple damping. */
  updateBase(dt) {
    this.stateTime += dt;
    if (this.flashTimer > 0) this.flashTimer -= dt;
    if (this.invulnTimer > 0) this.invulnTimer -= dt;
    if (this.knockTimer > 0) {
      this.knockTimer -= dt;
    } else {
      this.vx *= Math.pow(0.001, dt); // strong damping
      this.vy *= Math.pow(0.001, dt);
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // animation clock (12 fps walk cycle — cheap on weak devices)
    this.animTimer += dt;
    if (this.animTimer >= 1 / 12) {
      this.animTimer -= 1 / 12;
      this.animFrame = (this.animFrame + 1) % 4;
    }
    if (this.z > 0) {
      this.z = Math.max(0, this.z - dt * 40);
    }
    this.update(dt);
  }

  /** Per-kind update — override. */
  update(dt) {
    void dt;
  }

  /** Per-kind render — override. */
  render(ctx, sprites, camera) {
    void ctx;
    void sprites;
    void camera;
  }

  /** Bounding rect for triggers/UI. */
  getBounds() {
    return {
      x: this.x - this.radius,
      y: this.y - this.radius,
      w: this.radius * 2,
      h: this.radius * 2,
    };
  }
}
