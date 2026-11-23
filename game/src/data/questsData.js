/**
 * questsData.js — the campaign quest chain plus side quests. Quest logic
 * lives in systems/quests.js; seasonal quests come from the Linear snapshot.
 */
import { ObjectiveTypes as Obj } from '../systems/quests.js';

export const QUESTS = {
  // ------------------------------------------------------- main campaign
  'q-first-steps': {
    id: 'q-first-steps', type: 'main',
    title: { en: 'First Steps', ar: 'الخطوات الأولى' },
    desc: {
      en: 'The well has cracked and the dunes are restless. Prove you can survive the sand.',
      ar: 'البئر تصدّع والكثبان قلقة. أثبت أنك تستطيع النجاة في الرمل.',
    },
    objectives: [{ type: Obj.KILL, target: 'scorpion', count: 5, label: { en: 'Defeat sand scorpions', ar: 'اهزم عقارب الرمل' } }],
    rewards: { xp: 80, gold: 60, items: [{ itemId: 'small-potion', count: 2 }] },
    prereqs: [],
  },
  'q-tail-collection': {
    id: 'q-tail-collection', type: 'main',
    title: { en: 'Venom Economy', ar: 'اقتصاد السم' },
    desc: {
      en: 'The merchant Rasha can work scorpion tails into something useful.',
      ar: 'التاجر رشا تستطيع تحويل ذيول العقارب إلى شيء مفيد.',
    },
    objectives: [{ type: Obj.COLLECT, target: 'scorpion-tail', count: 4, label: { en: 'Collect scorpion tails', ar: 'اجمع ذيول العقارب' } }],
    rewards: { xp: 110, gold: 90, items: [{ itemId: 'iron-sword', count: 1 }] },
    prereqs: ['q-first-steps'],
  },
  'q-reach-oasis': {
    id: 'q-reach-oasis', type: 'main',
    title: { en: 'The Last Oasis', ar: 'الواحة الأخيرة' },
    desc: {
      en: 'Travelers speak of green water beyond the dunes. Find it.',
      ar: 'يتحدث المسافرون عن ماء أخضر خلف الكثبان. أعثر عليه.',
    },
    objectives: [{ type: Obj.REACH, target: 'level-09', count: 1, label: { en: 'Reach the oasis', ar: 'بلغ الواحة' } }],
    rewards: { xp: 160, gold: 120 },
    prereqs: ['q-tail-collection'],
  },
  'q-salt-flats': {
    id: 'q-salt-flats', type: 'main',
    title: { en: 'White Blind', ar: 'البياض المبهر' },
    desc: {
      en: 'The salt flats hide a sleeping giant. Cross them.',
      ar: 'تمسطحات الملح تخفي عملاقًا نائمًا. اعبرها.',
    },
    objectives: [{ type: Obj.REACH, target: 'level-17', count: 1, label: { en: 'Cross the salt flats', ar: 'اعبر مسطحات الملح' } }],
    rewards: { xp: 240, gold: 180, items: [{ itemId: 'stormglass-charm', count: 1 }] },
    prereqs: ['q-reach-oasis'],
  },
  'q-colossus': {
    id: 'q-colossus', type: 'main',
    title: { en: 'The Sleeping Giant', ar: 'العملاق النائم' },
    desc: {
      en: 'Wake the Dune Colossus and put it back to sleep — permanently.',
      ar: 'أيقظ عملاق الكثبان وأعده إلى النوم — للأبد.',
    },
    objectives: [{ type: Obj.BOSS, target: 'duneColossus', count: 1, label: { en: 'Defeat the Dune Colossus', ar: 'اهزم عملاق الكثبان' } }],
    rewards: { xp: 400, gold: 350, items: [{ itemId: 'large-potion', count: 3 }] },
    prereqs: ['q-salt-flats'],
  },
  'q-canyon-echoes': {
    id: 'q-canyon-echoes', type: 'main',
    title: { en: 'Echoes', ar: 'أصداء' },
    desc: {
      en: 'The canyon trades memories for passage. Gather shards.',
      ar: 'الوادي يتبادل الذكريات مقابل العبور. اجمع الشظايا.',
    },
    objectives: [
      { type: Obj.COLLECT, target: 'crystal-shard', count: 6, label: { en: 'Collect crystal shards', ar: 'اجمع شظايا البلور' } },
      { type: Obj.KILL, target: 'crystalSpider', count: 4, label: { en: 'Defeat crystal spiders', ar: 'اهزم عنكبوتيات البلور' } },
    ],
    rewards: { xp: 320, gold: 260, items: [{ itemId: 'crystal-staff', count: 1 }] },
    prereqs: ['q-colossus'],
  },
  'q-queen': {
    id: 'q-queen', type: 'main',
    title: { en: 'The Crystal Queen', ar: 'البلورية الملكة' },
    desc: {
      en: 'Her throne of purple glass hums with every echo. Silence it.',
      ar: 'عرشها من الزجاج البنفسجي يهتزّ مع كل صدى. أصمتِه.',
    },
    objectives: [{ type: Obj.BOSS, target: 'crystalQueen', count: 1, label: { en: 'Defeat the Crystal Queen', ar: 'اهزم البلورية الملكة' } }],
    rewards: { xp: 520, gold: 420, items: [{ itemId: 'ring-of-echoes', count: 1 }] },
    prereqs: ['q-canyon-echoes'],
  },
  'q-temple-descent': {
    id: 'q-temple-descent', type: 'main',
    title: { en: 'Down the Stairs', ar: 'أسفل الدرج' },
    desc: {
      en: 'The temple heat remembers. Take a key and descend.',
      ar: 'حرارة المعبد تتذكّر. خذ المفتاح واهبط.',
    },
    objectives: [
      { type: Obj.COLLECT, target: 'temple-key', count: 1, label: { en: 'Obtain the temple key', ar: 'احصل على مفتاح المعبد' } },
      { type: Obj.REACH, target: 'level-33', count: 1, label: { en: 'Reach the ember temple', ar: 'بلغ معبد الجمر' } },
    ],
    rewards: { xp: 420, gold: 320 },
    prereqs: ['q-queen'],
  },
  'q-ember-lord': {
    id: 'q-ember-lord', type: 'main',
    title: { en: 'The Ember Wager', ar: 'رهان الجمر' },
    desc: {
      en: 'The Ember Lord bets the desert on your defeat. Refuse the wager.',
      ar: 'سيّد الجمر يراهن بالصحراء على هزيمتك. ارفض الرهان.',
    },
    objectives: [{ type: Obj.BOSS, target: 'emberLord', count: 1, label: { en: 'Defeat the Ember Lord', ar: 'اهزم سيّد الجمر' } }],
    rewards: { xp: 700, gold: 600, items: [{ itemId: 'elixir-of-storms', count: 2 }] },
    prereqs: ['q-temple-descent'],
  },
  'q-storm-eye': {
    id: 'q-storm-eye', type: 'main',
    title: { en: 'The Storm Remembers', ar: 'العاصفة تتذكّر' },
    desc: {
      en: 'At the eye of the great storm the Wraith Lord waits with every forgotten face.',
      ar: 'في عين العاصفة العظيمة ينتظر سيّد الأشباح بكل الوجوه المنسيّة.',
    },
    objectives: [
      { type: Obj.KILL, target: 'abyssScorpion', count: 1, label: { en: 'Defeat the Abyss Scorpion', ar: 'اهزم عقرب الهاوية' } },
      { type: Obj.BOSS, target: 'wraithLord', count: 1, label: { en: 'Defeat the Wraith Lord', ar: 'اهزم سيّد الأشباح' } },
    ],
    rewards: { xp: 1200, gold: 1000, items: [{ itemId: 'aether-edge', count: 1 }, { itemId: 'memory-shard', count: 3 }] },
    prereqs: ['q-ember-lord'],
  },

  // ------------------------------------------------------------ side quests
  'q-scrap-metal': {
    id: 'q-scrap-metal', type: 'side',
    title: { en: 'Scrap and Sentiment', ar: 'خردة ومشاعر' },
    desc: {
      en: 'The smith Bilal needs anything hard enough to forge.',
      ar: 'الحدّاد بلال يحتاج أي شيء صعب بما يكفي للطرق.',
    },
    objectives: [{ type: Obj.COLLECT, target: 'scorpion-tail', count: 6, label: { en: 'Collect hard materials', ar: 'اجمع المواد الصلبة' } }],
    rewards: { xp: 90, gold: 110, items: [{ itemId: 'bronze-helm', count: 1 }] },
    prereqs: [],
  },
  'q-jackal-hunt': {
    id: 'q-jackal-hunt', type: 'side',
    title: { en: 'The Jackal Pact', ar: 'عهد ابن الآوى' },
    desc: {
      en: 'The herds are thinning. Cull the jackals before they cull the herds.',
      ar: 'القطعان تتناقص. قلّل ابن آوى قبل أن يقلّلها.',
    },
    objectives: [{ type: Obj.KILL, target: 'jackal', count: 8, label: { en: 'Defeat dune jackals', ar: 'اهزم ذئاب الكثبان' } }],
    rewards: { xp: 140, gold: 130, items: [{ itemId: 'hunter-bow', count: 1 }] },
    prereqs: [],
  },
  'q-hidden-chests': {
    id: 'q-hidden-chests', type: 'side',
    title: { en: 'Memory Collector', ar: 'جامع الذكريات' },
    desc: {
      en: 'Secrets sleep in every level. Wake ten of them.',
      ar: 'الأسرار تنام في كل مستوى. أيقظ عشرة منها.',
    },
    objectives: [{ type: Obj.CHEST, count: 10, label: { en: 'Open secret chests', ar: 'افتح الصناديق السرية' } }],
    rewards: { xp: 300, gold: 250, items: [{ itemId: 'aether-thread', count: 1 }] },
    prereqs: [],
  },
  'q-apprentice-crafter': {
    id: 'q-apprentice-crafter', type: 'side',
    title: { en: 'Apprentice Hands', ar: 'يدا المتدرب' },
    desc: {
      en: 'Craft your future with your own two hands.',
      ar: 'اصنع مستقبلك بيديك.',
    },
    objectives: [{ type: Obj.CRAFT, target: 'any', count: 6, label: { en: 'Craft items', ar: 'اصنع عناصر' } }],
    rewards: { xp: 200, gold: 160, items: [{ itemId: 'ancient-scroll', count: 2 }] },
    prereqs: [],
  },
  'q-spirit-talker': {
    id: 'q-spirit-talker', type: 'side',
    title: { en: 'Diplomacy, Mostly', ar: 'دبلوماسية، في الغالب' },
    desc: {
      en: 'Someone has to talk to the spirits. Might as well be you.',
      ar: 'علينا أحد التحدث إلى الأرواح. قد تكون أنت.',
    },
    objectives: [{ type: Obj.KILL, target: 'dustSpirit', count: 6, label: { en: 'Quiet the dust spirits', ar: 'هدّئ أرواح الغبار' } }],
    rewards: { xp: 120, gold: 100, items: [{ itemId: 'mana-draught', count: 3 }] },
    prereqs: [],
  },
  'q-guardian-duty': {
    id: 'q-guardian-duty', type: 'side',
    title: { en: 'Clay and Duty', ar: 'طين وواجب' },
    desc: {
      en: 'The temple guardians patrol out of habit. Break the habit.',
      ar: 'حراس المعبد يجوبون من العادة. اكسر العادة.',
    },
    objectives: [{ type: Obj.KILL, target: 'templeGuardian', count: 3, label: { en: 'Defeat temple guardians', ar: 'اهزم حراس المعبد' } }],
    rewards: { xp: 260, gold: 220, items: [{ itemId: 'scale-mail', count: 1 }] },
    prereqs: ['q-temple-descent'],
  },
  'q-viper-venom': {
    id: 'q-viper-venom', type: 'side',
    title: { en: 'Fang Accounting', ar: 'محاسبة الأنياب' },
    desc: {
      en: 'Viper fangs are currency in some circles. Collect a purse.',
      ar: 'أنياب الأفعى عملة في بعض الدوائر. اجمع كيسًا.',
    },
    objectives: [{ type: Obj.COLLECT, target: 'viper-fang', count: 5, label: { en: 'Collect viper fangs', ar: 'اجمع أنياب الأفعى' } }],
    rewards: { xp: 100, gold: 140 },
    prereqs: [],
  },
  'q-storm-survivor': {
    id: 'q-storm-survivor', type: 'side',
    title: { en: 'Stormwalker', ar: 'عاصف المشي' },
    desc: {
      en: 'Endure the storm and the heat both.',
      ar: 'اصمد أمام العاصفة والحرارة معًا.',
    },
    objectives: [
      { type: Obj.KILL, target: 'sandGolem', count: 3, label: { en: 'Defeat sand golems', ar: 'اهزم التماثيل الرملية' } },
      { type: Obj.KILL, target: 'emberHound', count: 4, label: { en: 'Defeat ember hounds', ar: 'اهزم كلاب الجمر' } },
    ],
    rewards: { xp: 280, gold: 200, items: [{ itemId: 'storm-treads', count: 1 }] },
    prereqs: ['q-colossus'],
  },
};

export function getQuest(id) {
  return QUESTS[id] ?? null;
}

export function mainQuests() {
  return Object.values(QUESTS).filter((q) => q.type === 'main');
}

export function sideQuests() {
  return Object.values(QUESTS).filter((q) => q.type === 'side');
}

export default QUESTS;
