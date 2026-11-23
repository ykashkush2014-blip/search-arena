/**
 * achievementsData.js — achievement definitions (trigger kinds match the
 * events AchievementSystem listens to).
 */
export const ACHIEVEMENTS = {
  'ach-first-blood': {
    id: 'ach-first-blood', name: { en: 'First Blood', ar: 'أول قتيل' },
    desc: { en: 'Defeat your first enemy.', ar: 'اهزم عدوك الأول.' },
    trigger: 'kill', target: 1,
  },
  'ach-scorpion-slayer': {
    id: 'ach-scorpion-slayer', name: { en: 'Scorpion Slayer', ar: 'قاتل العقارب' },
    desc: { en: 'Defeat 25 sand scorpions.', ar: 'اهزم 25 عقرب رمل.' },
    trigger: 'kill', match: { 'target.def.id': 'scorpion' }, target: 25,
  },
  'ach-exterminator': {
    id: 'ach-exterminator', name: { en: 'Exterminator', ar: 'المبيد' },
    desc: { en: 'Defeat 100 enemies.', ar: 'اهزم 100 عدو.' },
    trigger: 'kill', target: 100,
  },
  'ach-boss-breaker': {
    id: 'ach-boss-breaker', name: { en: 'Boss Breaker', ar: 'كاسر الزعماء' },
    desc: { en: 'Defeat your first boss.', ar: 'اهزم زعيمك الأول.' },
    trigger: 'boss', target: 1,
  },
  'ach-colossus': {
    id: 'ach-colossus', name: { en: 'Giant Killer', ar: 'قاتل العمالقة' },
    desc: { en: 'Defeat the Dune Colossus.', ar: 'اهزم عملاق الكثبان.' },
    trigger: 'boss', match: { 'boss.def.id': 'duneColossus' }, target: 1,
  },
  'ach-quest-seeker': {
    id: 'ach-quest-seeker', name: { en: 'Quest Seeker', ar: 'باحث المهام' },
    desc: { en: 'Complete 5 quests.', ar: 'أكمل 5 مهام.' },
    trigger: 'quest', target: 5,
  },
  'ach-quest-master': {
    id: 'ach-quest-master', name: { en: 'Quest Master', ar: 'سيد المهام' },
    desc: { en: 'Complete 15 quests.', ar: 'أكمل 15 مهمة.' },
    trigger: 'quest', target: 15,
  },
  'ach-apprentice': {
    id: 'ach-apprentice', name: { en: 'Apprentice Hands', ar: 'يدا المتدرب' },
    desc: { en: 'Craft 5 items.', ar: 'اصنع 5 عناصر.' },
    trigger: 'craft', target: 5,
  },
  'ach-master-smith': {
    id: 'ach-master-smith', name: { en: 'Master Smith', ar: 'الحدّاد الماهر' },
    desc: { en: 'Craft 25 items.', ar: 'اصنع 25 عنصرًا.' },
    trigger: 'craft', target: 25,
  },
  'ach-level-5': {
    id: 'ach-level-5', name: { en: 'Seasoned', ar: 'متمرس' },
    desc: { en: 'Reach level 5.', ar: 'اصل إلى المستوى 5.' },
    trigger: 'levelup', target: 5,
  },
  'ach-level-10': {
    id: 'ach-level-10', name: { en: 'Desert Hardened', ar: 'مقوّى بالصحراء' },
    desc: { en: 'Reach level 10.', ar: 'اصل إلى المستوى 10.' },
    trigger: 'levelup', target: 10,
  },
  'ach-treasure-hunter': {
    id: 'ach-treasure-hunter', name: { en: 'Treasure Hunter', ar: 'صائد الكنوز' },
    desc: { en: 'Open 10 chests.', ar: 'افتح 10 صناديق.' },
    trigger: 'chest', target: 10,
  },
  'ach-secret-finder': {
    id: 'ach-secret-finder', name: { en: 'Eyes of the Dunes', ar: 'عيون الكثبان' },
    desc: { en: 'Discover 5 secrets.', ar: 'اكتشف 5 أسرار.' },
    trigger: 'secret', target: 5,
  },
  'ach-collector': {
    id: 'ach-collector', name: { en: 'Collector', ar: 'الجامع' },
    desc: { en: 'Pick up 200 items.', ar: 'التقط 200 عنصر.' },
    trigger: 'pickup', target: 200,
  },
  'ach-rich': {
    id: 'ach-rich', name: { en: 'Sand Rich', ar: 'ثري الرمال' },
    desc: { en: 'Hold 2000 gold at once.', ar: 'احمل 2000 قطعة ذهبية دفعة واحدة.' },
    trigger: 'gold', threshold: 2000, target: 1, cumulative: true,
  },
  'ach-storm-chaser': {
    id: 'ach-storm-chaser', name: { en: 'Storm Chaser', ar: 'مطارد العواصف' },
    desc: { en: 'Witness a sandstorm.', ar: 'شهد عاصفة رملية.' },
    trigger: 'weather', match: { weather: 'sandstorm' }, target: 1,
  },
  'ach-night-owl': {
    id: 'ach-night-owl', name: { en: 'Night Walker', ar: 'ماشي الليل' },
    desc: { en: 'Clear a level at night.', ar: 'أكمل مستوى ليلًا.' },
    trigger: 'levelClear', match: { phase: 'night' }, target: 1,
  },
  'ach-hard-lessons': {
    id: 'ach-hard-lessons', name: { en: 'Hard Lessons', ar: 'دروس قاسية' },
    desc: { en: 'Fall in battle 5 times.', ar: 'سقط في المعركة 5 مرات.' },
    trigger: 'death', target: 5,
  },
  'ach-untouchable': {
    id: 'ach-untouchable', name: { en: 'Untouchable', ar: 'المنيع' },
    desc: { en: 'Clear a level without taking damage.', ar: 'أكمل مستوى دون تلقي ضرر.' },
    trigger: 'levelClear', match: { perfect: true }, target: 1,
  },
};

export function getAchievement(id) {
  return ACHIEVEMENTS[id] ?? null;
}

export default ACHIEVEMENTS;
