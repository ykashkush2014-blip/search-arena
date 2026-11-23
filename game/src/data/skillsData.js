/**
 * skillsData.js — active skill definitions (effects dispatch in
 * systems/skills.js → SKILL_EFFECTS).
 */
export const SKILLS = {
  whirlwind: {
    id: 'whirlwind', name: { en: 'Whirlwind', ar: 'دوّامة' }, glyph: '⚔',
    effect: 'whirlwind', mana: 16, cooldown: 4.5, mult: 1.6, range: 58, maxRank: 5,
    desc: { en: 'A wide spinning strike hitting all nearby enemies.', ar: 'ضربة دوّامية تضرب كل الأعداء القريبين.' },
  },
  firebolt: {
    id: 'firebolt', name: { en: 'Firebolt', ar: 'سهم النار' }, glyph: '🔥',
    effect: 'firebolt', mana: 12, cooldown: 1.6, mult: 1.45, speed: 190, element: 'fire', maxRank: 5,
    desc: { en: 'Hurl a bolt of sandfire.', ar: 'ارمِ سهمًا من نار الرمل.' },
  },
  heal: {
    id: 'heal', name: { en: 'Second Wind', ar: 'نسمة ثانية' }, glyph: '✚',
    effect: 'heal', mana: 22, cooldown: 9, heal: 34, maxRank: 5,
    desc: { en: 'Restore a burst of health.', ar: 'استعد جرعة صحة.' },
  },
  shadowStep: {
    id: 'shadowStep', name: { en: 'Shadow Step', ar: 'خطوة الظل' }, glyph: '💨',
    effect: 'shadowStep', mana: 14, cooldown: 5, mult: 1.2, speed: 380, maxRank: 5,
    desc: { en: 'Dash through enemies, damaging them.', ar: 'انقضّ عبر الأعداء محدثًا الضرر.' },
  },
  sandVortex: {
    id: 'sandVortex', name: { en: 'Sand Vortex', ar: 'دوّامة الرمل' }, glyph: '🌀',
    effect: 'sandVortex', mana: 20, cooldown: 7, mult: 1.15, range: 92, maxRank: 5,
    desc: { en: 'Pull enemies in and scour them with sand.', ar: 'اسحب الأعداء واجلدهم بالرمل.' },
  },
  frostNova: {
    id: 'frostNova', name: { en: 'Frost Nova', ar: 'فجر الصقيع' }, glyph: '❄',
    effect: 'frostNova', mana: 18, cooldown: 8, mult: 0.95, range: 96, slow: 1.3, maxRank: 5,
    desc: { en: 'Chill and slow all nearby enemies.', ar: 'برّد الأعداء القريبين وبطئهم.' },
  },
  battleShout: {
    id: 'battleShout', name: { en: 'Battle Shout', ar: 'صيحة القتال' }, glyph: '📣',
    effect: 'battleShout', mana: 15, cooldown: 14, bonus: 0.25, duration: 8, maxRank: 5,
    desc: { en: 'Boost attack power for a short time.', ar: 'عزز القوة الهجومية لفترة قصيرة.' },
  },
  multiShot: {
    id: 'multiShot', name: { en: 'Multi Shot', ar: 'إطلاق مضاعف' }, glyph: '🏹',
    effect: 'multiShot', mana: 13, cooldown: 2.2, mult: 0.95, shots: 3, arc: 0.55, speed: 200, maxRank: 5,
    desc: { en: 'Fire three arrows in a fan.', ar: 'أطلق ثلاث سهام في مروحة.' },
  },
};

export const SKILL_ORDER = [
  'whirlwind', 'firebolt', 'heal', 'shadowStep',
  'sandVortex', 'frostNova', 'battleShout', 'multiShot',
];

export function getSkill(id) {
  return SKILLS[id] ?? null;
}

export default SKILLS;
