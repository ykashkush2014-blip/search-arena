/**
 * enemies.js — the bestiary. Base stats scale per level via
 * `levelScale` supplied by the level baker (tools/gen-content.js).
 */
export const ENEMIES = {
  scorpion: {
    id: 'scorpion', name: { en: 'Sand Scorpion', ar: 'عقرب الرمل' },
    family: 'insect', hp: 30, atk: 7, def: 2, speed: 42, xp: 12, gold: [4, 10],
    ai: 'chaser', aggroRange: 130, attackRange: 20, attackCd: 1.3,
    radius: 8, element: 'sand', knockResist: 0.1,
    drops: [
      { type: 'coin', chance: 0.8, amountMin: 3, amountMax: 9 },
      { type: 'item', itemId: 'scorpion-tail', chance: 0.42 },
    ],
    desc: { en: 'Patient, armored, and always a little offended.', ar: 'صبور، مدرّع، ومستاء قليلًا دائمًا.' },
  },
  sandViper: {
    id: 'sandViper', name: { en: 'Sand Viper', ar: 'أفعى الرمل' },
    family: 'reptile', hp: 26, atk: 9, def: 1, speed: 58, xp: 15, gold: [5, 12],
    ai: 'ambusher', aggroRange: 150, attackRange: 24, attackCd: 1.6,
    radius: 8, element: 'sand', knockResist: 0.15,
    drops: [
      { type: 'coin', chance: 0.75, amountMin: 4, amountMax: 11 },
      { type: 'item', itemId: 'viper-fang', chance: 0.38 },
    ],
    desc: { en: 'Strikes from the corner of your eye.', ar: 'تهاجم من زاوية عينك.' },
  },
  dustSpirit: {
    id: 'dustSpirit', name: { en: 'Dust Spirit', ar: 'روح الغبار' },
    family: 'spirit', hp: 22, atk: 6, def: 0, speed: 50, xp: 14, gold: [6, 14],
    ai: 'flyer', aggroRange: 160, attackRange: 26, attackCd: 1.4,
    radius: 7, element: 'sand', flying: true, knockResist: 0.4,
    drops: [
      { type: 'coin', chance: 0.7, amountMin: 5, amountMax: 13 },
      { type: 'item', itemId: 'dust-essence', chance: 0.45 },
    ],
    desc: { en: 'What the wind keeps.', ar: 'ما تحتفظ به الريح.' },
  },
  jackal: {
    id: 'jackal', name: { en: 'Dune Jackal', ar: 'ابن آوى الكثيب' },
    family: 'beast', hp: 34, atk: 8, def: 2, speed: 66, xp: 16, gold: [6, 13],
    ai: 'patroller', aggroRange: 170, attackRange: 22, attackCd: 1.1,
    radius: 9, element: 'physical', knockResist: 0.2,
    drops: [
      { type: 'coin', chance: 0.7, amountMin: 5, amountMax: 12 },
      { type: 'item', itemId: 'jackal-pelt', chance: 0.4 },
    ],
    desc: { en: 'Hunts in gossip and pairs.', ar: 'يصطاد بالقيل والثنائيات.' },
  },
  sandGolem: {
    id: 'sandGolem', name: { en: 'Sand Golem', ar: 'تمثال رملي' },
    family: 'elemental', hp: 70, atk: 12, def: 8, speed: 30, xp: 30, gold: [12, 26],
    ai: 'guardian', aggroRange: 110, attackRange: 26, attackCd: 2.0,
    radius: 11, element: 'sand', knockResist: 0.7,
    drops: [
      { type: 'coin', chance: 0.9, amountMin: 10, amountMax: 24 },
      { type: 'item', itemId: 'sand-glass', chance: 0.35 },
    ],
    desc: { en: 'Walking dunes with opinions.', ar: 'كثبان تمشي لها آراؤها.' },
  },
  scarab: {
    id: 'scarab', name: { en: 'Crystal Scarab', ar: 'جعران بلوري' },
    family: 'insect', hp: 40, atk: 10, def: 5, speed: 46, xp: 22, gold: [8, 18],
    ai: 'chaser', aggroRange: 140, attackRange: 20, attackCd: 1.2,
    radius: 8, element: 'physical', knockResist: 0.3,
    drops: [
      { type: 'coin', chance: 0.8, amountMin: 7, amountMax: 16 },
      { type: 'item', itemId: 'crystal-shard', chance: 0.3 },
    ],
    desc: { en: 'Its shell remembers the canyon.', ar: 'قشرته تتذكّر الوادي.' },
  },
  crystalSpider: {
    id: 'crystalSpider', name: { en: 'Crystal Spider', ar: 'عنكبوت بلوري' },
    family: 'insect', hp: 46, atk: 13, def: 4, speed: 54, xp: 26, gold: [9, 20],
    ai: 'ambusher', aggroRange: 170, attackRange: 28, attackCd: 1.5,
    radius: 9, element: 'physical', knockResist: 0.25,
    drops: [
      { type: 'coin', chance: 0.8, amountMin: 8, amountMax: 18 },
      { type: 'item', itemId: 'crystal-shard', chance: 0.4 },
      { type: 'item', itemId: 'wraith-cloth', chance: 0.12 },
    ],
    desc: { en: 'Weaves threads of purple glass.', ar: 'ينسج خيوطًا من الزجاج البنفسجي.' },
  },
  canyonStalker: {
    id: 'canyonStalker', name: { en: 'Canyon Stalker', ar: 'متربّص الوادي' },
    family: 'reptile', hp: 52, atk: 15, def: 5, speed: 62, xp: 32, gold: [11, 24],
    ai: 'ambusher', aggroRange: 190, attackRange: 30, attackCd: 1.4,
    radius: 10, element: 'physical', knockResist: 0.35,
    drops: [
      { type: 'coin', chance: 0.85, amountMin: 10, amountMax: 22 },
      { type: 'item', itemId: 'viper-fang', chance: 0.3 },
      { type: 'item', itemId: 'crystal-shard', chance: 0.22 },
    ],
    desc: { en: 'Wears the canyon colors.', ar: 'يرتدي ألوان الوادي.' },
  },
  saltWraith: {
    id: 'saltWraith', name: { en: 'Salt Wraith', ar: 'شبح الملح' },
    family: 'spirit', hp: 44, atk: 14, def: 3, speed: 52, xp: 30, gold: [10, 22],
    ai: 'flyer', aggroRange: 180, attackRange: 30, attackCd: 1.6,
    radius: 8, element: 'magic', flying: true, knockResist: 0.5,
    drops: [
      { type: 'coin', chance: 0.8, amountMin: 9, amountMax: 20 },
      { type: 'item', itemId: 'salt-crystal', chance: 0.5 },
      { type: 'item', itemId: 'wraith-cloth', chance: 0.18 },
    ],
    desc: { en: 'The flats, standing up.', ar: 'المسطحات، واقفة.' },
  },
  emberHound: {
    id: 'emberHound', name: { en: 'Ember Hound', ar: 'كلب الجمر' },
    family: 'beast', hp: 58, atk: 17, def: 5, speed: 70, xp: 38, gold: [13, 28],
    ai: 'chaser', aggroRange: 200, attackRange: 24, attackCd: 1.1,
    radius: 10, element: 'fire', knockResist: 0.35,
    drops: [
      { type: 'coin', chance: 0.85, amountMin: 12, amountMax: 26 },
      { type: 'item', itemId: 'ember-core', chance: 0.28 },
    ],
    desc: { en: 'Fetches with burning enthusiasm.', ar: 'يعود بالكرة بحماس ملتهب.' },
  },
  fireSprite: {
    id: 'fireSprite', name: { en: 'Fire Sprite', ar: 'جمرة حية' },
    family: 'spirit', hp: 38, atk: 16, def: 2, speed: 56, xp: 34, gold: [11, 24],
    ai: 'ranged', aggroRange: 210, attackRange: 120, attackCd: 1.9,
    radius: 8, element: 'fire', flying: true, knockResist: 0.6,
    drops: [
      { type: 'coin', chance: 0.8, amountMin: 10, amountMax: 22 },
      { type: 'item', itemId: 'ember-core', chance: 0.32 },
    ],
    desc: { en: 'A candle that chose violence.', ar: 'شمعة اختارت العنف.' },
  },
  templeGuardian: {
    id: 'templeGuardian', name: { en: 'Temple Guardian', ar: 'حارس المعبد' },
    family: 'elemental', hp: 95, atk: 20, def: 10, speed: 34, xp: 55, gold: [18, 40],
    ai: 'guardian', aggroRange: 130, attackRange: 30, attackCd: 1.9,
    radius: 12, element: 'fire', knockResist: 0.75,
    drops: [
      { type: 'coin', chance: 0.95, amountMin: 16, amountMax: 38 },
      { type: 'item', itemId: 'ember-core', chance: 0.4 },
      { type: 'item', itemId: 'ancient-scroll', chance: 0.1 },
    ],
    desc: { en: 'Clay that remembers every duel.', ar: 'طين يتذكّر كل مبارزة.' },
  },
  sandMite: {
    id: 'sandMite', name: { en: 'Sand Mite', ar: 'قرادة الرمل' },
    family: 'insect', hp: 16, atk: 4, def: 1, speed: 64, xp: 7, gold: [2, 6],
    ai: 'bomber', aggroRange: 120, attackRange: 18, attackCd: 0.8,
    radius: 6, element: 'physical', knockResist: 0,
    drops: [
      { type: 'coin', chance: 0.55, amountMin: 2, amountMax: 6 },
      { type: 'item', itemId: 'scorpion-tail', chance: 0.15 },
    ],
    desc: { en: 'Approaches with explosive enthusiasm.', ar: 'يقترب بحماس متفجّر.' },
  },
  mirageStalker: {
    id: 'mirageStalker', name: { en: 'Mirage Stalker', ar: 'متربّص السراب' },
    family: 'spirit', hp: 48, atk: 14, def: 4, speed: 60, xp: 36, gold: [12, 26],
    ai: 'support', aggroRange: 200, attackRange: 100, attackCd: 2.4,
    radius: 9, element: 'magic', knockResist: 0.45,
    drops: [
      { type: 'coin', chance: 0.8, amountMin: 11, amountMax: 24 },
      { type: 'item', itemId: 'dust-essence', chance: 0.35 },
    ],
    desc: { en: 'Heals its friends, confuses its enemies.', ar: 'يشفي أصدقاءه ويربك أعداءه.' },
  },
  // ------------------------------------------------------------- bosses
  duneColossus: {
    id: 'duneColossus', name: { en: 'Dune Colossus', ar: 'عملاق الكثبان' },
    family: 'bossGolem', isBoss: true,
    hp: 480, atk: 22, def: 12, speed: 34, xp: 260, gold: [180, 260],
    ai: 'boss', aggroRange: 260, attackRange: 34, attackCd: 2.2,
    radius: 15, element: 'sand', knockResist: 0.9,
    projectileColor: '#e8c489',
    phases: [
      { until: 0.66, patterns: ['spreadShot', 'charge'], interval: 2.6 },
      { until: 0.33, patterns: ['slam', 'spreadShot', 'summon'], interval: 2.1 },
      { until: 0, patterns: ['ringBurst', 'charge', 'slam'], interval: 1.7 },
    ],
    drops: [
      { type: 'item', itemId: 'scimitar-of-dunes', chance: 1 },
      { type: 'item', itemId: 'aether-thread', chance: 0.35 },
      { type: 'coin', chance: 1, amountMin: 200, amountMax: 320 },
    ],
    desc: { en: 'The desert, standing up to stretch.', ar: 'الصحراء، تقف لتتمدد.' },
  },
  crystalQueen: {
    id: 'crystalQueen', name: { en: 'Crystal Queen', ar: 'البلورية الملكة' },
    family: 'bossWraith', isBoss: true,
    hp: 520, atk: 24, def: 10, speed: 48, xp: 320, gold: [220, 320],
    ai: 'boss', aggroRange: 280, attackRange: 40, attackCd: 2.0,
    radius: 14, element: 'magic', knockResist: 0.85,
    projectileColor: '#c8a8e8',
    phases: [
      { until: 0.6, patterns: ['spreadShot', 'blink'], interval: 2.3 },
      { until: 0.3, patterns: ['ringBurst', 'summon', 'blink'], interval: 1.9 },
      { until: 0, patterns: ['ringBurst', 'blink', 'spreadShot'], interval: 1.5 },
    ],
    drops: [
      { type: 'item', itemId: 'crystal-staff', chance: 1 },
      { type: 'item', itemId: 'crystal-carapace', chance: 0.3 },
      { type: 'coin', chance: 1, amountMin: 240, amountMax: 360 },
    ],
    desc: { en: 'Rules a throne of purple glass.', ar: 'تحكم عرشًا من الزجاج البنفسجي.' },
  },
  emberLord: {
    id: 'emberLord', name: { en: 'Ember Lord', ar: 'سيّد الجمر' },
    family: 'bossGolem', isBoss: true,
    hp: 620, atk: 27, def: 13, speed: 40, xp: 400, gold: [260, 400],
    ai: 'boss', aggroRange: 300, attackRange: 38, attackCd: 1.9,
    radius: 15, element: 'fire', knockResist: 0.9,
    projectileColor: '#f29a4c',
    phases: [
      { until: 0.62, patterns: ['slam', 'spreadShot'], interval: 2.2 },
      { until: 0.3, patterns: ['ringBurst', 'charge', 'summon'], interval: 1.8 },
      { until: 0, patterns: ['ringBurst', 'slam', 'charge', 'spreadShot'], interval: 1.4 },
    ],
    drops: [
      { type: 'item', itemId: 'ember-fang', chance: 1 },
      { type: 'item', itemId: 'wraithplate', chance: 0.22 },
      { type: 'coin', chance: 1, amountMin: 300, amountMax: 460 },
    ],
    desc: { en: 'Wagers the desert on every duel.', ar: 'يراهن بالصحراء على كل مبارزة.' },
  },
  abyssScorpion: {
    id: 'abyssScorpion', name: { en: 'Abyss Scorpion', ar: 'عقرب الهاوية' },
    family: 'giant', isBoss: true,
    hp: 720, atk: 30, def: 15, speed: 44, xp: 520, gold: [340, 520],
    ai: 'boss', aggroRange: 320, attackRange: 44, attackCd: 1.8,
    radius: 16, element: 'sand', knockResist: 0.95,
    projectileColor: '#8c6ac0',
    phases: [
      { until: 0.65, patterns: ['spreadShot', 'charge'], interval: 2.0 },
      { until: 0.32, patterns: ['slam', 'ringBurst', 'summon'], interval: 1.7 },
      { until: 0, patterns: ['ringBurst', 'charge', 'slam', 'spreadShot'], interval: 1.3 },
    ],
    drops: [
      { type: 'item', itemId: 'aether-edge', chance: 1 },
      { type: 'item', itemId: 'storm-treads', chance: 0.3 },
      { type: 'coin', chance: 1, amountMin: 400, amountMax: 640 },
    ],
    desc: { en: 'The storm\'s first memory.', ar: 'أول ذكرى للعاصفة.' },
  },
  wraithLord: {
    id: 'wraithLord', name: { en: 'Wraith Lord', ar: 'سيّد الأشباح' },
    family: 'bossWraith', isBoss: true,
    hp: 820, atk: 32, def: 14, speed: 52, xp: 640, gold: [420, 680],
    ai: 'boss', aggroRange: 340, attackRange: 42, attackCd: 1.7,
    radius: 15, element: 'magic', knockResist: 0.95,
    projectileColor: '#c8a8e8',
    phases: [
      { until: 0.7, patterns: ['blink', 'spreadShot'], interval: 1.9 },
      { until: 0.35, patterns: ['ringBurst', 'summon', 'blink'], interval: 1.6 },
      { until: 0, patterns: ['ringBurst', 'blink', 'spreadShot', 'slam'], interval: 1.2 },
    ],
    drops: [
      { type: 'item', itemId: 'wraithplate', chance: 1 },
      { type: 'item', itemId: 'aether-edge', chance: 0.4 },
      { type: 'coin', chance: 1, amountMin: 500, amountMax: 800 },
    ],
    desc: { en: 'Wears every face the desert forgot.', ar: 'يرتدي كل وجه نسيته الصحراء.' },
  },
};

export function getEnemy(id) {
  return ENEMIES[id] ?? null;
}

export function bossList() {
  return Object.values(ENEMIES).filter((e) => e.isBoss);
}

export function regularList() {
  return Object.values(ENEMIES).filter((e) => !e.isBoss);
}

export default ENEMIES;
