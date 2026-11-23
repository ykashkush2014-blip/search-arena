/**
 * progression.js — skill grants, level-up rewards and unlock rules.
 */
import { gameEvents, Events } from '../core/events.js';

/** Skills a fresh character starts with. */
export function grantStartingSkills(skillSystem) {
  skillSystem.unlock('whirlwind');
  skillSystem.unlock('heal');
  return skillSystem;
}

/** Skill unlock schedule by player level. */
export const SKILL_UNLOCKS = {
  1: ['whirlwind', 'heal'],
  3: ['firebolt'],
  5: ['shadowStep'],
  7: ['multiShot'],
  9: ['sandVortex'],
  12: ['frostNova'],
  15: ['battleShout'],
};

/**
 * Check and apply any level-gated unlocks after a level-up.
 */
export function applyLevelUnlocks(player, skills, quests) {
  const level = player.level;
  const granted = [];
  for (const [reqLevel, ids] of Object.entries(SKILL_UNLOCKS)) {
    if (level < Number(reqLevel)) continue;
    for (const id of ids) {
      if (!skills.isUnlocked(id) && skills.unlock(id)) {
        granted.push(id);
      }
    }
  }
  if (granted.length > 0) {
    gameEvents.emit(Events.SKILL_UNLOCKED, { granted });
  }
  // side-quest unlocks
  if (level >= 4 && quests) {
    quests.unlock('q-hidden-chests');
    quests.unlock('q-apprentice-crafter');
  }
  if (level >= 6 && quests) {
    quests.unlock('q-storm-survivor');
    quests.unlock('q-guardian-duty');
  }
  return granted;
}

/**
 * Score formula for leaderboards: rewards depth, speed and combat.
 */
export function computeScore({ levelsCleared = 0, kills = 0, gold = 0, runTime = 0, achievements = 0 }) {
  const timePenalty = Math.max(0, runTime - 600) * 0.05;
  return Math.round(
    levelsCleared * 500 +
    kills * 25 +
    gold * 0.5 +
    achievements * 150 -
    timePenalty,
  );
}
