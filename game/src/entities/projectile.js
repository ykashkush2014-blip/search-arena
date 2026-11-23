/**
 * projectile.js — pooled projectiles (arrows, fire bolts, sand spears).
 * Projectiles never allocate during flight: the world holds a ProjectilePool.
 */
import { Entity, EntityKind } from './entity.js';
import { dist2 } from '../core/mathx.js';

export class Projectile extends Entity {
  constructor(opts = {}) {
    super({
      kind: EntityKind.PROJECTILE,
      team: opts.team ?? 'enemy',
      radius: opts.radius ?? 4,
      x: opts.x,
      y: opts.y,
    });
    this.speed = opts.speed ?? 160;
    this.dirX = opts.dirX ?? 1;
    this.dirY = opts.dirY ?? 0;
    this.damage = opts.damage ?? 8;
    this.element = opts.element ?? 'physical';
    this.life = opts.life ?? 2.2;
    this.pierce = opts.pierce ?? 0;
    this.hitSet = new Set();
    this.trailTimer = 0;
    this.owner = opts.owner ?? null;
    this.homing = opts.homing ?? 0;
    this.color = opts.color ?? '#f5e9d0';
    this.size = opts.size ?? 3;
    this.gravity = opts.gravity ?? 0;
    this.explodeRadius = opts.explodeRadius ?? 0;
    this.knockback = opts.knockback ?? 60;
    this.fromPlayer = this.team === 'player';
  }

  acquire(opts = {}) {
    this.x = opts.x ?? 0;
    this.y = opts.y ?? 0;
    this.dirX = opts.dirX ?? 1;
    this.dirY = opts.dirY ?? 0;
    this.speed = opts.speed ?? 160;
    this.damage = opts.damage ?? 8;
    this.element = opts.element ?? 'physical';
    this.life = opts.life ?? 2.2;
    this.pierce = opts.pierce ?? 0;
    this.team = opts.team ?? 'enemy';
    this.fromPlayer = this.team === 'player';
    this.owner = opts.owner ?? null;
    this.alive = true;
    this.removeMe = false;
    this.hitSet.clear();
    this.homing = opts.homing ?? 0;
    this.color = opts.color ?? '#f5e9d0';
    this.size = opts.size ?? 3;
    this.gravity = opts.gravity ?? 0;
    this.explodeRadius = opts.explodeRadius ?? 0;
    this.knockback = opts.knockback ?? 60;
    this.invulnTimer = 0;
    this.flashTimer = 0;
    this.vx = 0;
    this.vy = 0;
    return this;
  }

  release() {
    this.alive = false;
    this.removeMe = true;
  }

  update(dt) {
    if (!this.alive) return;
    this.life -= dt;
    if (this.life <= 0) {
      this.release();
      return;
    }
    if (this.homing > 0 && this.data.homingTarget && this.data.homingTarget.alive) {
      const t = this.data.homingTarget;
      const dx = t.x - this.x;
      const dy = t.y - this.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const turn = Math.min(1, this.homing * dt);
      this.dirX += (dx / len - this.dirX) * turn;
      this.dirY += (dy / len - this.dirY) * turn;
      const norm = Math.sqrt(this.dirX * this.dirX + this.dirY * this.dirY) || 1;
      this.dirX /= norm;
      this.dirY /= norm;
    }
    this.vy += this.gravity * dt;
    this.x += (this.dirX * this.speed + this.vx) * dt;
    this.y += (this.dirY * this.speed + this.vy) * dt;
    this.trailTimer += dt;

    const map = this.data.map;
    if (map && map.isSolidPixel(this.x, this.y)) {
      this.onImpact(null);
      return;
    }
    if (this.x < -32 || this.y < -32 || this.x > (map ? map.pixelWidth + 32 : 4000) || this.y > (map ? map.pixelHeight + 32 : 4000)) {
      this.release();
    }
  }

  onImpact(target) {
    if (!this.alive) return;
    if (target) this.hitSet.add(target.id);
    if (this.explodeRadius > 0 && this.data.world && this.data.world.explode) {
      this.data.world.explode(this.x, this.y, this.explodeRadius, this.damage, this.owner, {
        team: this.team,
        element: this.element,
      });
    } else if (target) {
      // direct damage handled by combat system listening to impact events
      if (this.data.onProjectileHit) this.data.onProjectileHit(this, target);
    }
    if (this.data.onProjectileImpact) this.data.onProjectileImpact(this, target);
    if (this.pierce <= 0) {
      this.release();
    } else {
      this.pierce -= 1;
    }
  }

  /** Cheap target scan used by the world each step. */
  scanTargets(entities) {
    for (const e of entities) {
      if (!e.alive || e === this.owner) continue;
      if (e.team === this.team) continue;
      if (e.kind !== EntityKind.PLAYER && e.kind !== EntityKind.ENEMY && e.kind !== EntityKind.BOSS) continue;
      if (this.hitSet.has(e.id)) continue;
      const rr = e.radius + this.size;
      if (dist2(this.x, this.y, e.x, e.y) <= rr * rr) {
        this.onImpact(e);
        return e;
      }
    }
    return null;
  }
}

/**
 * Simple fixed-capacity pool for projectiles.
 */
export class ProjectilePool {
  constructor(capacity = 48) {
    this.capacity = capacity;
    this.items = [];
    for (let i = 0; i < capacity; i += 1) {
      const p = new Projectile();
      p.release(); // prewarm: mark free so spawn() can acquire it
      this.items.push(p);
    }
  }

  spawn(opts) {
    for (const p of this.items) {
      if (!p.alive) return p.acquire(opts);
    }
    return null; // saturated — oldest projectile is sacrificed
  }

  update(dt, entities, ctx) {
    for (const p of this.items) {
      if (!p.alive) continue;
      p.data.map = ctx.map;
      p.data.world = ctx.world;
      p.data.onProjectileHit = ctx.onProjectileHit;
      p.data.onProjectileImpact = ctx.onProjectileImpact;
      p.update(dt);
      if (p.alive) p.scanTargets(entities);
    }
  }

  get active() {
    return this.items.filter((p) => p.alive);
  }

  clear() {
    for (const p of this.items) p.release();
    return this;
  }
}
