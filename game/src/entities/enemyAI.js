/**
 * enemyAI.js — behavior state machines. One exported step function per AI
 * style keeps enemy.js lean and makes new behaviors a one-function job.
 *
 * AI styles: chaser, ambusher, ranged, bomber, flyer, patroller, guardian,
 * support, boss (phases live in boss.js).
 */
import { dist2, normalize } from '../core/mathx.js';

/**
 * @param {import('./enemy.js').Enemy} enemy
 * @param {object} ctx { player, dt, world, rng }
 */
export function stepAI(enemy, ctx) {
  const fn = AI_STEPS[enemy.aiName] || AI_STEPS.chaser;
  fn(enemy, ctx);
}

const AI_STEPS = {
  /** Direct melee pursuer. */
  chaser(enemy, ctx) {
    const { player, dt } = ctx;
    if (enemy.pendingAttack) return;
    if (enemy.canAggro(player) || enemy.target) {
      enemy.target = player;
      enemy.faceTarget(player);
      const d2 = dist2(enemy.x, enemy.y, player.x, player.y);
      if (d2 <= enemy.attackRange * enemy.attackRange) {
        enemy.vx *= 0.8;
        enemy.vy *= 0.8;
        if (enemy.attackCd <= 0) enemy.windupAttack();
        enemy.setState('attack');
      } else {
        enemy.moveToward(player.x, player.y, dt, 1);
        enemy.setState('chase');
      }
    } else {
      enemy.wander(dt);
      enemy.setState('idle');
    }
  },

  /** Keeps distance and lunges. */
  ambusher(enemy, ctx) {
    const { player, dt } = ctx;
    if (enemy.pendingAttack) return;
    const d2v = dist2(enemy.x, enemy.y, player.x, player.y);
    const preferred = enemy.attackRange * 2.2;
    if (enemy.canAggro(player)) {
      enemy.target = player;
      enemy.faceTarget(player);
      if (enemy.data.lungeCd > 0) enemy.data.lungeCd -= dt;
      if (d2v <= enemy.attackRange * enemy.attackRange * 1.4 && enemy.attackCd <= 0 && enemy.data.lungeCd <= 0) {
        const dir = normalize(player.x - enemy.x, player.y - enemy.y);
        enemy.vx = dir.x * enemy.speed * 3.2;
        enemy.vy = dir.y * enemy.speed * 3.2;
        enemy.data.lungeCd = 1.6;
        enemy.windupAttack();
        enemy.setState('attack');
      } else if (d2v < preferred * preferred) {
        // back off to preferred range
        const away = normalize(enemy.x - player.x, enemy.y - player.y);
        enemy.moveToward(enemy.x + away.x * 40, enemy.y + away.y * 40, dt, 0.8);
        enemy.setState('chase');
      } else {
        enemy.moveToward(player.x, player.y, dt, 0.75);
        enemy.setState('chase');
      }
    } else {
      enemy.wander(dt);
      enemy.setState('idle');
    }
  },

  /** Ranged caster: keeps distance, fires projectiles via world callback. */
  ranged(enemy, ctx) {
    const { player, dt, world } = ctx;
    if (enemy.pendingAttack) return;
    const d2v = dist2(enemy.x, enemy.y, player.x, player.y);
    const ideal = enemy.attackRange * 1.6;
    if (enemy.canAggro(player)) {
      enemy.target = player;
      enemy.faceTarget(player);
      if (d2v < ideal * ideal * 0.4) {
        const away = normalize(enemy.x - player.x, enemy.y - player.y);
        enemy.moveToward(enemy.x + away.x * 50, enemy.y + away.y * 50, dt, 0.9);
        enemy.setState('chase');
      } else if (d2v > enemy.attackRange * enemy.attackRange) {
        enemy.moveToward(player.x, player.y, dt, 0.7);
        enemy.setState('chase');
      } else {
        enemy.vx *= 0.85;
        enemy.vy *= 0.85;
        if (enemy.attackCd <= 0 && world && world.spawnEnemyProjectile) {
          enemy.attackCd = enemy.attackCdMax;
          const dir = normalize(player.x - enemy.x, player.y - enemy.y);
          world.spawnEnemyProjectile(enemy, dir, {
            speed: 110,
            damage: enemy.atk,
            element: enemy.element,
          });
          enemy.setState('attack');
        } else {
          enemy.setState('idle');
        }
      }
    } else {
      enemy.wander(dt);
      enemy.setState('idle');
    }
  },

  /** Charges and explodes near the player. */
  bomber(enemy, ctx) {
    const { player, dt, world } = ctx;
    const d2v = dist2(enemy.x, enemy.y, player.x, player.y);
    if (enemy.canAggro(player)) {
      enemy.target = player;
      enemy.moveToward(player.x, player.y, dt, 1.25);
      enemy.setState('chase');
      if (d2v < 24 * 24 && !enemy.data.armed) {
        enemy.data.armed = true;
        enemy.setState('attack');
        enemy.data.fuse = 0.7;
      }
    } else {
      enemy.wander(dt);
    }
    if (enemy.data.armed) {
      enemy.data.fuse -= dt;
      enemy.vx *= 0.9;
      enemy.vy *= 0.9;
      if (enemy.data.fuse <= 0 && world && world.explode) {
        world.explode(enemy.x, enemy.y, 42, enemy.atk * 1.6, enemy);
        enemy.hp = 0;
        enemy.die({ source: player });
      }
    }
  },

  /** Flying harasser with sine-wave bobbing. */
  flyer(enemy, ctx) {
    const { player, dt } = ctx;
    enemy.z = 6 + Math.sin(enemy.stateTime * 3) * 2;
    if (enemy.canAggro(player)) {
      enemy.target = player;
      enemy.faceTarget(player);
      const d2 = dist2(enemy.x, enemy.y, player.x, player.y);
      if (d2 <= enemy.attackRange * enemy.attackRange) {
        enemy.vx *= 0.8;
        enemy.vy *= 0.8;
        if (enemy.attackCd <= 0) enemy.windupAttack();
        enemy.setState('attack');
      } else {
        // weave: offset target perpendicular for evasive flight
        const dir = normalize(player.x - enemy.x, player.y - enemy.y);
        const weave = Math.sin(enemy.stateTime * 2.2) * 26;
        enemy.moveToward(player.x - dir.y * weave, player.y + dir.x * weave, dt, 1.05);
        enemy.setState('chase');
      }
    } else {
      enemy.wander(dt);
    }
  },

  /** Patrols a waypoint list, chases when aggro'd. */
  patroller(enemy, ctx) {
    const { player, dt } = ctx;
    if (enemy.canAggro(player)) {
      AI_STEPS.chaser(enemy, ctx);
      return;
    }
    if (enemy.patrol && enemy.patrol.length > 1) {
      const wp = enemy.patrol[enemy.patrolIndex % enemy.patrol.length];
      const d2v = dist2(enemy.x, enemy.y, wp[0], wp[1]);
      if (d2v < 12 * 12) {
        enemy.patrolIndex += 1;
      }
      const next = enemy.patrol[enemy.patrolIndex % enemy.patrol.length];
      enemy.moveToward(next[0], next[1], dt, 0.55);
      enemy.setState('walk');
    } else {
      enemy.wander(dt);
      enemy.setState('idle');
    }
  },

  /** Stationary until the player is close, then heavy attacks. */
  guardian(enemy, ctx) {
    const { player, dt } = ctx;
    const homeD2 = dist2(enemy.x, enemy.y, enemy.homeX, enemy.homeY);
    if (enemy.canAggro(player)) {
      enemy.target = player;
      enemy.faceTarget(player);
      const d2 = dist2(enemy.x, enemy.y, player.x, player.y);
      if (d2 <= enemy.attackRange * enemy.attackRange) {
        enemy.vx *= 0.75;
        enemy.vy *= 0.75;
        if (enemy.attackCd <= 0) enemy.windupAttack();
        enemy.setState('attack');
      } else if (d2 < 200 * 200) {
        enemy.moveToward(player.x, player.y, dt, 0.85);
        enemy.setState('chase');
      }
    } else if (homeD2 > 20 * 20) {
      enemy.moveToward(enemy.homeX, enemy.homeY, dt, 0.6);
      enemy.setState('walk');
    } else {
      enemy.vx *= 0.9;
      enemy.vy *= 0.9;
      enemy.setState('idle');
    }
  },

  /** Heals/buffs nearby allies, flees from the player. */
  support(enemy, ctx) {
    const { player, dt, world } = ctx;
    const d2v = dist2(enemy.x, enemy.y, player.x, player.y);
    if (d2v < 110 * 110) {
      const away = normalize(enemy.x - player.x, enemy.y - player.y);
      enemy.moveToward(enemy.x + away.x * 60, enemy.y + away.y * 60, dt, 1);
      enemy.setState('chase');
    } else {
      enemy.vx *= 0.92;
      enemy.vy *= 0.92;
      enemy.setState('idle');
    }
    if (enemy.attackCd <= 0 && world && world.healNearbyEnemies) {
      enemy.attackCd = enemy.attackCdMax * 1.5;
      world.healNearbyEnemies(enemy, 12, enemy.atk);
      enemy.setState('attack');
    }
  },

  /** Boss placeholder — real behavior is boss.js. */
  boss(enemy, ctx) {
    AI_STEPS.chaser(enemy, ctx);
  },
};

export { AI_STEPS };
