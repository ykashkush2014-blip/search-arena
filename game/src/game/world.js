/**
 * world.js — the live simulation: one level at a time, its entities, combat
 * glue, interactions and transitions. The Game class owns scene flow; World
 * owns everything that happens between the tiles.
 */
import { TileMap, TileCollider } from '../world/tilemap.js';
import { Pathfinder } from '../world/pathfinding.js';
import { TileSet, Tiles, TileInfo, TILE } from '../gfx/tilegen.js';
import { Player } from '../entities/player.js';
import { Enemy } from '../entities/enemy.js';
import { BossEntity } from '../entities/boss.js';
import { NPC } from '../entities/npc.js';
import { LootDrop, Chest, Portal, rollLoot, LootType } from '../entities/loot.js';
import { ProjectilePool } from '../entities/projectile.js';
import { stepAI } from '../entities/enemyAI.js';
import { CombatSystem } from '../systems/combat.js';
import { WeatherSystem } from '../systems/weather.js';
import { DayNightSystem } from '../systems/daynight.js';
import { MiniMap } from '../systems/minimap.js';
import { SpatialHash, separateBodies, circlesHit } from '../world/collision.js';
import { gameEvents, Events } from '../core/events.js';
import { ParticleSystem, ParticleType } from '../core/particles.js';
import { clamp, normalize, dist2 } from '../core/mathx.js';
import { BALANCE } from '../data/balance.js';

export class World {
  /**
   * @param {object} game — back-reference (player, content, audio, ui…)
   */
  constructor(game) {
    this.game = game;
    this.levelId = null;
    this.level = null;
    this.map = null;
    this.collider = null;
    this.pathfinder = null;
    this.tileSet = new TileSet('dunes');
    this.entities = [];
    this.enemies = [];
    this.npcs = [];
    this.chests = [];
    this.loot = [];
    this.portals = [];
    this.projectiles = new ProjectilePool(56);
    this.particles = new ParticleSystem(360);
    this.combat = new CombatSystem({ world: this });
    this.weather = new WeatherSystem({ biome: 'dunes' });
    this.dayNight = new DayNightSystem();
    this.minimap = null;
    this.spatial = new SpatialHash(48);
    this.boss = null;
    this.interactionTarget = null;
    this.spawnPoint = { x: 64, y: 64 };
    this.levelTime = 0;
    this.damageTakenThisLevel = 0;
    this.entitiesDirty = true;
  }

  // ------------------------------------------------------------- loading

  /**
   * Load a level by id and spawn everything it defines.
   * @param {string} levelId
   * @param {object} [opts] { spawnIndex, keepPlayer }
   */
  loadLevel(levelId, opts = {}) {
    const content = this.game.content;
    const level = content.level(levelId);
    if (!level) throw new Error(`unknown level ${levelId}`);
    this.levelId = levelId;
    this.level = level;
    this.map = new TileMap(level);
    this.collider = new TileCollider(this.map);
    this.pathfinder = new Pathfinder(this.map);
    this.tileSet = new TileSet(level.biome ?? 'dunes');
    this.minimap = new MiniMap(this.map);
    this.weather = new WeatherSystem({ biome: level.biome ?? 'dunes', initial: level.weather ?? null });
    this.dayNight = new DayNightSystem({ startTime: level.timeStart ?? 0.35 });
    this.levelTime = 0;
    this.damageTakenThisLevel = 0;
    this.boss = null;

    // clear entity registries (player is re-added by the caller)
    this.entities.length = 0;
    this.enemies.length = 0;
    this.npcs.length = 0;
    this.chests.length = 0;
    this.loot.length = 0;
    this.portals.length = 0;
    this.projectiles.clear();
    this.particles.clear();
    this.interactionTarget = null;

    // spawn point
    const spawn = opts.spawn ?? level.spawn ?? { x: 3, y: 3 };
    const spawnPx = this.map.tileToPixel(spawn.x, spawn.y);
    this.spawnPoint = spawnPx;

    // spawn defined entities
    for (const def of level.entities ?? []) {
      this._spawnFromDef(def);
    }
    // exits → portals
    for (const exit of level.exits ?? []) {
      const px = this.map.tileToPixel(exit.x, exit.y);
      const portal = new Portal({
        x: px.x,
        y: px.y,
        to: exit.to,
        toSpawn: exit.toSpawn ?? 0,
        locked: !!exit.locked,
        lockFlag: exit.lockFlag ?? null,
      });
      this.portals.push(portal);
      this.entities.push(portal);
    }

    this.map.reveal(spawnPx.x, spawnPx.y, BALANCE.world.fogRevealRadius);
    gameEvents.emit(Events.LEVEL_ENTER, { levelId, level });
    return level;
  }

  _spawnFromDef(def) {
    const px = this.map.tileToPixel(def.x, def.y);
    const content = this.game.content;
    switch (def.type) {
      case 'enemy': {
        const edef = content.enemy(def.kind);
        if (!edef) return null;
        const scale = def.levelScale ?? this.level?.levelScale ?? 1;
        const enemy = edef.isBoss
          ? new BossEntity(edef, { x: px.x, y: px.y, levelScale: scale, arena: def.arena })
          : new Enemy(edef, {
            x: px.x,
            y: px.y,
            levelScale: scale,
            patrol: def.patrol?.map(([tx, ty]) => {
              const p = this.map.tileToPixel(tx, ty);
              return [p.x, p.y];
            }),
          });
        enemy.data.map = this.map;
        enemy.data.levelId = this.levelId;
        enemy.onStrike = (e) => this._enemyStrike(e);
        if (enemy.isBoss) {
          this.boss = enemy;
          gameEvents.emit(Events.BOSS_SPAWN, { boss: enemy });
        }
        this.enemies.push(enemy);
        this.entities.push(enemy);
        return enemy;
      }
      case 'npc': {
        const npc = new NPC({
          ...def,
          x: px.x,
          y: px.y,
          name: def.name ?? content.npcName(def.kind),
        });
        this.npcs.push(npc);
        this.entities.push(npc);
        return npc;
      }
      case 'chest': {
        const chest = new Chest({
          x: px.x,
          y: px.y,
          id: def.id,
          lootTable: def.lootTable ? content.lootTable(def.lootTable) : null,
          locked: def.locked,
          requiresKey: def.requiresKey,
          questGated: def.questGated,
          secret: def.secret,
        });
        this.chests.push(chest);
        this.entities.push(chest);
        return chest;
      }
      case 'portal': {
        const portal = new Portal({
          x: px.x,
          y: px.y,
          to: def.to,
          toSpawn: def.toSpawn,
          locked: def.locked,
          lockFlag: def.lockFlag,
        });
        this.portals.push(portal);
        this.entities.push(portal);
        return portal;
      }
      case 'loot': {
        const drop = new LootDrop({
          x: px.x,
          y: px.y,
          lootType: def.lootType ?? LootType.ITEM,
          itemId: def.itemId ?? null,
          amount: def.amount ?? 1,
        });
        this.loot.push(drop);
        this.entities.push(drop);
        return drop;
      }
      default:
        return null;
    }
  }

  // ------------------------------------------------------------- stepping

  update(dt, input) {
    this.levelTime += dt;
    const player = this.game.player;
    if (!player) return;

    // player intent from input
    if (player.alive && !this.game.uiLocked) {
      const move = input.getMoveVector();
      player.moveIntent.x = move.x;
      player.moveIntent.y = move.y;
      if (input.justPressed('attack')) player.tryAttack();
      if (input.justPressed('dash')) {
        if (player.tryDash()) this.game.audio?.play('dash');
      }
      for (let i = 0; i < 4; i += 1) {
        if (input.justPressed(`skill${i + 1}`)) this.game.useSkill(i);
      }
      if (input.justPressed('interact')) this.interact();
    } else {
      player.moveIntent.x = 0;
      player.moveIntent.y = 0;
    }

    // world systems
    this.weather.update(dt);
    this.dayNight.update(dt);
    this.tileSet.update(dt);

    // entities
    player.data.map = this.map;
    player.updateBase(dt);
    this._resolveEntityTiles(player);

    const combatCtx = {
      player,
      dt,
      world: this,
      rng: Math,
    };
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      enemy.data.map = this.map;
      enemy.data.ctx = combatCtx;
      stepAI(enemy, combatCtx);
      enemy.updateBase(dt);
      this._resolveEntityTiles(enemy);
      // enemy melee strike resolution
      if (enemy.state === 'attack' && enemy.windupTimer <= 0 && !enemy.pendingAttack && enemy._struck !== this.levelTime) {
        // handled via onStrike callback
      }
    }
    for (const npc of this.npcs) npc.updateBase(dt);
    for (const chest of this.chests) chest.updateBase(dt);
    for (const portal of this.portals) portal.updateBase(dt);

    // projectiles
    this.projectiles.update(dt, this.entities, {
      map: this.map,
      world: this,
      onProjectileHit: (proj, target) => this._projectileHit(proj, target),
      onProjectileImpact: (proj, target) => {
        if (proj.fromPlayer && !target) {
          this.particles.burst(proj.x, proj.y, 4, { color: '#e8c489', speedMax: 40, life: 0.25 });
        }
      },
    });

    // loot
    for (const drop of this.loot) {
      drop.data.player = player;
      drop.data.map = this.map;
      drop.data.onPickup = (d, p) => this._pickupLoot(d, p);
      drop.updateBase(dt);
    }

    // particle ambience
    const wind = this.weather.wind();
    const rate = this.weather.particleRate();
    if (rate > 0 && this.particles.active < (this.game.performance?.profile?.maxParticles ?? 160)) {
      this.particles.ambient(
        this.game.renderer?.camera.x ?? 0,
        this.game.renderer?.camera.y ?? 0,
        this.game.renderer?.width ?? 480,
        this.game.renderer?.height ?? 270,
        Math.ceil(rate * dt * 4),
        { windX: wind.x, windY: wind.y },
      );
    }
    this.particles.update(dt);
    this.combat.updateFloaters(dt);

    // separation between live enemies
    for (let i = 0; i < this.enemies.length; i += 1) {
      const a = this.enemies[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < this.enemies.length; j += 1) {
        const b = this.enemies[j];
        if (!b.alive) continue;
        separateBodies(a, b, BALANCE.enemies.separationRadius);
      }
    }

    // player attack resolution (one moment per swing)
    if (player.state === 'attack' && player.stateTime < 0.06 && player._swingId !== player.attackCombo + this.levelTime) {
      player._swingId = player.attackCombo + this.levelTime;
      const hits = this.combat.resolvePlayerMelee(player, this.enemies);
      if (hits.length > 0) {
        this.game.audio?.play('hit');
        for (const h of hits) {
          this.particles.burst(h.enemy.x, h.enemy.y - 6, 6, {
            color: ['#f5e9d0', '#e8c489'],
            speedMax: 70,
            life: 0.3,
          });
        }
      } else {
        this.game.audio?.play('attack');
      }
    }

    // tile hazards
    if (player.alive) {
      const tx = Math.floor(player.x / TILE);
      const ty = Math.floor(player.y / TILE);
      const hazard = this.map.damageAt(tx, ty);
      if (hazard > 0 && player.invulnTimer <= 0) {
        this.combat.damagePlayer(player, hazard, { source: null });
        this.game.hud?.onPlayerHit();
      }
    }

    // fog of war reveal
    this.map.reveal(player.x, player.y, BALANCE.world.fogRevealRadius);

    // interaction target scan
    this.interactionTarget = this._scanInteractions(player);

    // cleanup
    this._cleanup();
    this.minimap?.update(dt);
  }

  _resolveEntityTiles(entity) {
    if (!this.map) return;
    const res = resolveCircle(this.map, entity.x, entity.y, entity.radius);
    entity.x = res.x;
    entity.y = res.y;
    // keep inside map
    entity.x = clamp(entity.x, entity.radius, this.map.pixelWidth - entity.radius);
    entity.y = clamp(entity.y, entity.radius, this.map.pixelHeight - entity.radius);
  }

  _cleanup() {
    for (let i = this.enemies.length - 1; i >= 0; i -= 1) {
      const e = this.enemies[i];
      if (!e.alive && e.deathTime === undefined) {
        e.deathTime = 0;
        this.particles.burst(e.x, e.y - 8, 10, {
          color: ['#c9a15e', '#8a6a42', '#f5e9d0'],
          speedMax: 80,
          life: 0.5,
          gravity: 40,
        });
        this._dropLoot(e);
      }
      if (!e.alive) {
        e.deathTime = (e.deathTime ?? 0) + 0.016;
        if (e.deathTime > 0.45) {
          this.enemies.splice(i, 1);
          const idx = this.entities.indexOf(e);
          if (idx >= 0) this.entities.splice(idx, 1);
        }
      }
    }
    for (let i = this.loot.length - 1; i >= 0; i -= 1) {
      const d = this.loot[i];
      if (d.removeMe || !d.alive) {
        this.loot.splice(i, 1);
        const idx = this.entities.indexOf(d);
        if (idx >= 0) this.entities.splice(idx, 1);
      }
    }
    // victory check: level has boss and boss is dead
    if (this.boss && !this.boss.alive && this.boss.deathSequence !== undefined) {
      this.boss.deathSequence -= 0.016;
      if (this.boss.deathSequence <= 0 && !this._victoryFired) {
        this._victoryFired = true;
        this.game.onLevelCleared?.(this.levelId);
      }
    }
    if (this.enemies.length === 0 && this.level && !this.level.hasBoss && !this._victoryFired) {
      this._victoryFired = true;
      this.game.onLevelCleared?.(this.levelId);
    }
  }

  _dropLoot(enemy) {
    const player = this.game.player;
    const table = enemy.drops ?? [];
    const drops = rollLoot(table, Math, { goldFind: player?.stats?.goldFind ?? 0 });
    for (const d of drops) {
      const drop = new LootDrop({
        x: enemy.x + (Math.random() * 16 - 8),
        y: enemy.y + (Math.random() * 16 - 8),
        lootType: d.lootType,
        itemId: d.itemId,
        amount: d.amount,
      });
      this.loot.push(drop);
      this.entities.push(drop);
    }
  }

  _pickupLoot(drop, player) {
    const game = this.game;
    switch (drop.lootType) {
      case LootType.COIN: {
        const total = player.addGold(drop.amount);
        game.audio?.play('coin');
        this.combat.addFloater(player.x, player.y - 14, `+${total}g`, '#f2c94c', false);
        break;
      }
      case LootType.HEART: {
        player.heal(drop.amount);
        game.audio?.play('heal');
        break;
      }
      case LootType.MANA: {
        player.mana = Math.min(player.stats.maxMana, player.mana + drop.amount);
        game.audio?.play('pickup');
        break;
      }
      case LootType.ITEM:
      default: {
        if (drop.itemId && game.inventory) {
          const res = game.inventory.add(drop.itemId, drop.amount);
          if (res.added > 0) {
            game.audio?.play('pickup');
            const def = game.inventory.getItemDef(drop.itemId);
            this.combat.addFloater(player.x, player.y - 18, def?.name?.[game.lang] ?? drop.itemId, '#63c76a', false);
          }
        }
        break;
      }
    }
    gameEvents.emit(Events.ITEM_PICKUP, { itemId: drop.itemId, count: drop.amount, lootType: drop.lootType });
  }

  _enemyStrike(enemy) {
    const player = this.game.player;
    if (!player || !player.alive) return;
    const range = enemy.attackRange + player.radius + 4;
    if (circlesHit(enemy.x, enemy.y, range, player.x, player.y, player.radius)) {
      this.combat.damagePlayer(player, enemy.atk, { source: enemy });
      this.game.hud?.onPlayerHit();
      this.game.audio?.play('hurt');
      this.particles.burst(player.x, player.y - 6, 6, {
        color: ['#e05548', '#f5e9d0'],
        speedMax: 60,
        life: 0.3,
      });
    }
  }

  _projectileHit(proj, target) {
    if (proj.fromPlayer) {
      this.combat.damageEntity(target, proj.damage, {
        source: this.game.player,
        element: proj.element,
        knockback: proj.knockback,
        critChance: this.game.player.stats.crit,
        critDmg: this.game.player.stats.critDmg,
      });
      this.particles.burst(proj.x, proj.y, 5, {
        color: proj.color,
        speedMax: 60,
        life: 0.25,
      });
    } else if (target && target.team === 'player') {
      this.combat.damagePlayer(target, proj.damage, { source: proj.owner });
      this.game.hud?.onPlayerHit();
    }
  }

  // ------------------------------------------------------- combat helpers

  spawnPlayerProjectile(player, dir, opts = {}) {
    return this.projectiles.spawn({
      x: player.x + dir.x * 12,
      y: player.y - 6 + dir.y * 12,
      dirX: dir.x,
      dirY: dir.y,
      team: 'player',
      owner: player,
      speed: opts.speed ?? 180,
      damage: opts.damage ?? player.stats.atk,
      element: opts.element ?? 'physical',
      pierce: opts.pierce ?? 0,
      explodeRadius: opts.explodeRadius ?? 0,
      color: opts.color ?? '#f5e9d0',
      ...opts,
    });
  }

  spawnEnemyProjectile(enemy, dir, opts = {}) {
    return this.projectiles.spawn({
      x: enemy.x + dir.x * 10,
      y: enemy.y - 4 + dir.y * 10,
      dirX: dir.x,
      dirY: dir.y,
      team: 'enemy',
      owner: enemy,
      speed: opts.speed ?? 130,
      damage: opts.damage ?? enemy.atk,
      element: opts.element ?? enemy.element,
      color: opts.color ?? '#e8c489',
      life: opts.life ?? 2.4,
      ...opts,
    });
  }

  explode(x, y, radius, damage, source, opts = {}) {
    const res = this.combat.explode(x, y, radius, damage, source, opts);
    this.spawnBurst(x, y, radius, opts.element ?? 'sand');
    return res;
  }

  spawnBurst(x, y, radius, element = 'sand') {
    const colors = {
      sand: ['#e8c489', '#c99a58'],
      fire: ['#f29a4c', '#ffd24c'],
      magic: ['#b267e0', '#59c2a8'],
      water: ['#63b3d8', '#bfe8f5'],
      physical: ['#f5e9d0', '#c8ccd4'],
    };
    this.particles.burst(x, y, Math.min(28, Math.round(radius / 2)), {
      color: colors[element] ?? colors.sand,
      speedMax: radius * 1.6,
      life: 0.55,
      gravity: 30,
    });
  }

  healNearbyEnemies(source, radius, amount) {
    for (const e of this.enemies) {
      if (!e.alive || e === source) continue;
      if (dist2(source.x, source.y, e.x, e.y) <= radius * radius) {
        e.heal(amount);
        this.particles.burst(e.x, e.y - 8, 5, {
          color: ['#63c76a', '#a8e8a8'],
          speedMax: 30,
          life: 0.5,
          gravity: -20,
        });
      }
    }
  }

  spawnMinion(boss, x, y) {
    const minionId = this.level?.biome === 'temple' ? 'fireSprite' : 'dustSpirit';
    const edef = this.game.content.enemy(minionId);
    if (!edef) return null;
    const enemy = new Enemy(edef, { x, y, levelScale: this.level?.levelScale ?? 1 });
    enemy.data.map = this.map;
    enemy.onStrike = (e) => this._enemyStrike(e);
    this.enemies.push(enemy);
    this.entities.push(enemy);
    return enemy;
  }

  shakeCamera(strength = 4, duration = 0.3) {
    const cam = this.game.renderer?.camera;
    if (!cam || this.game.settings?.screenShake === false) return;
    this.game.tweens?.shake(cam, 'shakeX', 'shakeY', strength, duration, 'camera');
  }

  getCombatants() {
    const out = this.enemies.slice();
    if (this.game.player) out.push(this.game.player);
    return out;
  }

  // --------------------------------------------------------- interactions

  _scanInteractions(player) {
    let best = null;
    let bestD = Infinity;
    const consider = (entity, hint) => {
      const d2v = dist2(player.x, player.y, entity.x, entity.y);
      if (d2v < 30 * 30 && d2v < bestD) {
        bestD = d2v;
        best = { entity, kind: entity.kind, hint };
      }
    };
    for (const npc of this.npcs) consider(npc, null);
    for (const chest of this.chests) if (!chest.opened) consider(chest, null);
    for (const portal of this.portals) if (!portal.locked) consider(portal, null);
    return best;
  }

  interact() {
    const target = this.interactionTarget;
    const player = this.game.player;
    if (!target || !player) return false;
    const entity = target.entity;
    switch (entity.kind) {
      case 'npc': {
        entity.facePlayer(player);
        this.game.startDialogue(entity);
        return true;
      }
      case 'chest': {
        return this.openChest(entity);
      }
      case 'portal': {
        return this.usePortal(entity);
      }
      default:
        return false;
    }
  }

  openChest(chest) {
    const game = this.game;
    const flags = {
      hasKey: game.inventory?.has('temple-key', 1) || game.inventory?.has('crystal-key', 1),
      ...game.dialogue?.flagsObject?.(),
    };
    const check = chest.canOpen(game.player, flags);
    if (!check.ok) {
      game.audio?.play('error');
      game.ui.toast(game.t(check.reason === 'locked' ? 'toast.offline' : 'toast.offline'), { color: '#e05548' });
      return false;
    }
    chest.open();
    game.audio?.play('chest');
    this.particles.burst(chest.x, chest.y - 8, 12, {
      color: ['#f2c94c', '#e8b64c', '#f5e9d0'],
      speedMax: 70,
      life: 0.6,
    });
    const table = chest.lootTable?.length ? chest.lootTable : [
      { type: 'coin', chance: 1, amountMin: 12, amountMax: 40 },
      { type: 'item', itemId: 'small-potion', chance: 0.4 },
    ];
    const drops = rollLoot(table, Math, { goldFind: game.player.stats.goldFind });
    for (const d of drops) {
      const drop = new LootDrop({
        x: chest.x + (Math.random() * 20 - 10),
        y: chest.y + (Math.random() * 20 - 10),
        lootType: d.lootType,
        itemId: d.itemId,
        amount: d.amount,
      });
      this.loot.push(drop);
      this.entities.push(drop);
    }
    if (chest.secret) {
      gameEvents.emit(Events.SECRET_FOUND, { chest });
    }
    gameEvents.emit(Events.CHEST_OPENED, { chest });
    return true;
  }

  usePortal(portal) {
    if (portal.locked && portal.lockFlag && !this.game.dialogue?.hasFlag(portal.lockFlag)) {
      this.game.audio?.play('error');
      return false;
    }
    this.game.audio?.play('portal');
    gameEvents.emit(Events.PORTAL_USED, { portal });
    this.game.gotoLevel(portal.targetLevel, portal.targetSpawn);
    return true;
  }

  teleport(levelId, x, y) {
    if (levelId && levelId !== this.levelId) {
      this.game.gotoLevel(levelId, 0);
      return;
    }
    const player = this.game.player;
    if (player && x !== null && y !== null) {
      player.x = x;
      player.y = y;
    }
  }

  /** Level clear bookkeeping. */
  markCleared() {
    gameEvents.emit(Events.LEVEL_CLEAR, {
      levelId: this.levelId,
      phase: this.dayNight.phase,
      perfect: this.damageTakenThisLevel === 0,
      time: this.levelTime,
    });
    this._victoryFired = true;
  }
}

/** Circle-vs-tiles resolve used every frame per entity. */
function resolveCircle(map, x, y, radius) {
  // reuse collision.js semantics with a tiny local loop for speed
  let nx = x;
  let ny = y;
  let hit = false;
  const minX = Math.floor((nx - radius) / TILE);
  const maxX = Math.floor((nx + radius) / TILE);
  const minY = Math.floor((ny - radius) / TILE);
  const maxY = Math.floor((ny + radius) / TILE);
  for (let ty = minY; ty <= maxY; ty += 1) {
    for (let tx = minX; tx <= maxX; tx += 1) {
      if (!map.isSolid(tx, ty)) continue;
      const rx = tx * TILE;
      const ry = ty * TILE;
      const cx = clamp(nx, rx, rx + TILE);
      const cy = clamp(ny, ry, ry + TILE);
      const dx = nx - cx;
      const dy = ny - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 < radius * radius) {
        hit = true;
        const d = Math.sqrt(d2) || 0.0001;
        const push = radius - d;
        if (d2 > 0.0001) {
          nx += (dx / d) * push;
          ny += (dy / d) * push;
        }
      }
    }
  }
  return { x: nx, y: ny, hit };
}

export { normalize, ParticleType, TileInfo, Tiles, NPC, Chest };
