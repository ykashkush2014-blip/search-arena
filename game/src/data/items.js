/**
 * items.js — the item database. Every entry is consumed by inventory, shop,
 * crafting, loot tables and the UI icon generator.
 */
import { ITEM_TYPES } from '../systems/inventory.js';

const t = ITEM_TYPES;

export const ITEMS = {
  // ------------------------------------------------------------- weapons
  'rusty-sword': {
    id: 'rusty-sword', name: { en: 'Rusty Sword', ar: 'سيف صدئ' }, type: t.WEAPON, rarity: 'common',
    icon: 'sword', iconColors: { main: '#b8a88c', accent: '#8a6a42', dark: '#4a2c18' },
    stats: { atk: 6, crit: 0.02 }, price: 60, stackable: false,
    desc: { en: 'Seen better decades. Still cuts.', ar: 'رأى عقودًا أفضل. لكنه ما زال يقطع.' },
  },
  'iron-sword': {
    id: 'iron-sword', name: { en: 'Iron Sword', ar: 'سيف حديدي' }, type: t.WEAPON, rarity: 'common',
    icon: 'sword', iconColors: { main: '#c8ccd4', accent: '#8a6a42', dark: '#4a2c18' },
    stats: { atk: 11, crit: 0.03 }, price: 180, stackable: false,
    desc: { en: 'Honest steel for honest work.', ar: 'فولاذ صادق لعمل صادق.' },
  },
  'scimitar-of-dunes': {
    id: 'scimitar-of-dunes', name: { en: 'Scimitar of Dunes', ar: 'منجل الكثبان' }, type: t.WEAPON, rarity: 'rare',
    icon: 'sword', iconColors: { main: '#5a8fe0', accent: '#e8b64c', dark: '#2c2038' },
    stats: { atk: 18, crit: 0.08, speed: 4 }, price: 640, stackable: false,
    desc: { en: 'Its curve follows the wind.', ar: 'انحناؤه يتبع الريح.' },
  },
  'venom-blade': {
    id: 'venom-blade', name: { en: 'Venom Blade', ar: 'نصل السم' }, type: t.WEAPON, rarity: 'epic',
    icon: 'dagger', iconColors: { main: '#63c76a', accent: '#2c7a72', dark: '#184a44' },
    stats: { atk: 22, crit: 0.12, lifesteal: 0.04 }, price: 1100, stackable: false,
    desc: { en: 'Drips patience.', ar: 'يقطّ الصبر.' },
  },
  'ember-fang': {
    id: 'ember-fang', name: { en: 'Ember Fang', ar: 'ناب الجمر' }, type: t.WEAPON, rarity: 'epic',
    icon: 'sword', iconColors: { main: '#f29a4c', accent: '#ffd24c', dark: '#8c4222' },
    stats: { atk: 26, crit: 0.1, fireBonus: 0.15 }, price: 1500, stackable: false,
    desc: { en: 'Warm to the touch, hotter when drawn.', ar: 'دافئ اللمس، وأسخن عند الانتزاع.' },
  },
  'aether-edge': {
    id: 'aether-edge', name: { en: 'Aether Edge', ar: 'حدّ الأثير' }, type: t.WEAPON, rarity: 'legendary',
    icon: 'sword', iconColors: { main: '#b267e0', accent: '#59c2a8', dark: '#2a1440' },
    stats: { atk: 36, crit: 0.16, critDmg: 0.25, speed: 6 }, price: 4200, stackable: false,
    desc: { en: 'Forged from a shard that remembers the ocean of stars.', ar: 'مطعون من شظية تتذكّر محيط النجوم.' },
  },
  'sandstaff': {
    id: 'sandstaff', name: { en: 'Sandstaff', ar: 'عصا الرمل' }, type: t.WEAPON, rarity: 'uncommon',
    icon: 'staff', iconColors: { main: '#8a6a42', accent: '#e8c489', dark: '#4a2c18' },
    stats: { atk: 9, maxMana: 18 }, price: 320, stackable: false,
    desc: { en: 'Whispers when storms are near.', ar: 'يهمس حين تقترب العواصف.' },
  },
  'crystal-staff': {
    id: 'crystal-staff', name: { en: 'Crystal Staff', ar: 'عصا البلور' }, type: t.WEAPON, rarity: 'rare',
    icon: 'staff', iconColors: { main: '#b267e0', accent: '#e8c0f8', dark: '#4c2758' },
    stats: { atk: 16, maxMana: 34, crit: 0.06 }, price: 920, stackable: false,
    desc: { en: 'A canyon echo, held still.', ar: 'صدى وادي، ممسوك بالسكون.' },
  },
  'hunter-bow': {
    id: 'hunter-bow', name: { en: 'Hunter Bow', ar: 'قوس الصياد' }, type: t.WEAPON, rarity: 'uncommon',
    icon: 'bow', iconColors: { main: '#8a6a42', accent: '#e8e2d0', dark: '#4a2c18' },
    stats: { atk: 12, crit: 0.07, speed: 3 }, price: 420, stackable: false,
    desc: { en: 'Strung with patience.', ar: 'مفتول بالصبر.' },
  },
  'dune-dagger': {
    id: 'dune-dagger', name: { en: 'Dune Dagger', ar: 'خنجر الكثيب' }, type: t.WEAPON, rarity: 'common',
    icon: 'dagger', iconColors: { main: '#c8ccd4', accent: '#c9a15e', dark: '#4a2c18' },
    stats: { atk: 8, crit: 0.09, speed: 6 }, price: 210, stackable: false,
    desc: { en: 'Quick as a sidestep.', ar: 'سريع كخطوة جانبية.' },
  },

  // --------------------------------------------------------------- armor
  'cloth-armor': {
    id: 'cloth-armor', name: { en: 'Cloth Robes', ar: 'ثياب قماشية' }, type: t.ARMOR, rarity: 'common',
    icon: 'armor', iconColors: { main: '#b8a88c', accent: '#8a6a42', dark: '#4a2c18' },
    stats: { def: 3, maxHp: 12 }, price: 70, stackable: false,
    desc: { en: 'Better than nothing. Slightly.', ar: 'أفضل من لا شيء. قليلًا.' },
  },
  'leather-armor': {
    id: 'leather-armor', name: { en: 'Leather Harness', ar: 'حزام جلدي' }, type: t.ARMOR, rarity: 'common',
    icon: 'armor', iconColors: { main: '#8a6a42', accent: '#c9a15e', dark: '#4a2c18' },
    stats: { def: 7, maxHp: 22 }, price: 260, stackable: false,
    desc: { en: 'Scorpion-tested.', ar: 'مجرّب ضد العقارب.' },
  },
  'scale-mail': {
    id: 'scale-mail', name: { en: 'Scale Mail', ar: 'درع حرشفي' }, type: t.ARMOR, rarity: 'rare',
    icon: 'armor', iconColors: { main: '#5a8fe0', accent: '#c8ccd4', dark: '#2c2038' },
    stats: { def: 13, maxHp: 40 }, price: 820, stackable: false,
    desc: { en: 'Each scale remembers a different sandstorm.', ar: 'كل حرفة تتذكّر عاصفة مختلفة.' },
  },
  'crystal-carapace': {
    id: 'crystal-carapace', name: { en: 'Crystal Carapace', ar: 'قشرة بلورية' }, type: t.ARMOR, rarity: 'epic',
    icon: 'armor', iconColors: { main: '#b267e0', accent: '#e8c0f8', dark: '#4c2758' },
    stats: { def: 18, maxHp: 60, maxMana: 15 }, price: 1800, stackable: false,
    desc: { en: 'Grown, not forged.', ar: 'متنامٍ، غير مطعون.' },
  },
  'wraithplate': {
    id: 'wraithplate', name: { en: 'Wraithplate', ar: 'درع الشبح' }, type: t.ARMOR, rarity: 'legendary',
    icon: 'armor', iconColors: { main: '#6d4a8c', accent: '#c8a8e8', dark: '#241838' },
    stats: { def: 24, maxHp: 90, lifesteal: 0.05 }, price: 4000, stackable: false,
    desc: { en: 'Worn by those the storm forgot.', ar: 'يرتديه من نسيتهم العاصفة.' },
  },

  // -------------------------------------------------------------- helmet
  'cloth-hood': {
    id: 'cloth-hood', name: { en: 'Cloth Hood', ar: 'غطاء قماشي' }, type: t.HELMET, rarity: 'common',
    icon: 'helmet', iconColors: { main: '#b8a88c', accent: '#8a6a42', dark: '#4a2c18' },
    stats: { def: 2, maxHp: 8 }, price: 55, stackable: false,
    desc: { en: 'Keeps the sun honest.', ar: 'يجعل الشمس صادقة.' },
  },
  'bronze-helm': {
    id: 'bronze-helm', name: { en: 'Bronze Helm', ar: 'خوذة برونزية' }, type: t.HELMET, rarity: 'uncommon',
    icon: 'helmet', iconColors: { main: '#c9a15e', accent: '#e8c489', dark: '#6e5230' },
    stats: { def: 5, maxHp: 16 }, price: 210, stackable: false,
    desc: { en: 'Dented, dependable.', ar: 'مخطوش، لكنه يعتمد عليه.' },
  },
  'crystal-circlet': {
    id: 'crystal-circlet', name: { en: 'Crystal Circlet', ar: 'إكليل بلوري' }, type: t.HELMET, rarity: 'rare',
    icon: 'helmet', iconColors: { main: '#b267e0', accent: '#5a8fe0', dark: '#4c2758' },
    stats: { def: 8, maxMana: 20, crit: 0.04 }, price: 740, stackable: false,
    desc: { en: 'Hums near secrets.', ar: 'يهتزّ قرب الأسرار.' },
  },

  // --------------------------------------------------------------- boots
  'sandals': {
    id: 'sandals', name: { en: 'Worn Sandals', ar: 'نعل بالي' }, type: t.BOOTS, rarity: 'common',
    icon: 'boots', iconColors: { main: '#8a6a42', accent: '#c9a15e', dark: '#4a2c18' },
    stats: { def: 1, speed: 4 }, price: 45, stackable: false,
    desc: { en: 'Every grain knows these soles.', ar: 'كل حبة رمل تعرف هذه النعال.' },
  },
  'dune-runners': {
    id: 'dune-runners', name: { en: 'Dune Runners', ar: 'عدّاءو الكثبان' }, type: t.BOOTS, rarity: 'rare',
    icon: 'boots', iconColors: { main: '#5a8fe0', accent: '#e8b64c', dark: '#2c2038' },
    stats: { def: 3, speed: 12, stamina: 15 }, price: 680, stackable: false,
    desc: { en: 'Leave no prints.', ar: 'لا تترك أثرًا.' },
  },
  'storm-treads': {
    id: 'storm-treads', name: { en: 'Storm Treads', ar: 'خطّوات العاصفة' }, type: t.BOOTS, rarity: 'epic',
    icon: 'boots', iconColors: { main: '#59c2a8', accent: '#bfe8f5', dark: '#184a44' },
    stats: { def: 5, speed: 18, stamina: 30 }, price: 1600, stackable: false,
    desc: { en: 'Walk where the wind already went.', ar: 'امشِ حيث سبقت الريح.' },
  },

  // ---------------------------------------------------------- rings/amulets
  'copper-ring': {
    id: 'copper-ring', name: { en: 'Copper Ring', ar: 'خاتم نحاسي' }, type: t.RING, rarity: 'common',
    icon: 'ring', iconColors: { main: '#c9a15e', accent: '#e8c489', dark: '#6e5230' },
    stats: { atk: 2, maxHp: 6 }, price: 90, stackable: false,
    desc: { en: 'Green around the finger.', ar: 'أخضر حول الإصبع.' },
  },
  'ring-of-echoes': {
    id: 'ring-of-echoes', name: { en: 'Ring of Echoes', ar: 'خاتم الأصداء' }, type: t.RING, rarity: 'rare',
    icon: 'ring', iconColors: { main: '#5a8fe0', accent: '#bfe8f5', dark: '#2c2038' },
    stats: { crit: 0.06, maxMana: 14 }, price: 720, stackable: false,
    desc: { en: 'Repeats what courage said.', ar: 'يكرّر ما قاله الشجاع.' },
  },
  'aether-thread': {
    id: 'aether-thread', name: { en: 'Aether Thread', ar: 'خيط الأثير' }, type: t.AMULET, rarity: 'epic',
    icon: 'amulet', iconColors: { main: '#b267e0', accent: '#59c2a8', dark: '#2a1440' },
    stats: { maxHp: 30, maxMana: 20, goldFind: 0.12 }, price: 1900, stackable: false,
    desc: { en: 'Woven from a memory of stars.', ar: 'منسوج من ذكرى نجوم.' },
  },
  'stormglass-charm': {
    id: 'stormglass-charm', name: { en: 'Stormglass Charm', ar: 'تعويذة زجاج العاصفة' }, type: t.AMULET, rarity: 'rare',
    icon: 'amulet', iconColors: { main: '#63b3d8', accent: '#f5e9d0', dark: '#2a5f8f' },
    stats: { def: 4, xpGain: 0.1, speed: 5 }, price: 860, stackable: false,
    desc: { en: 'The storm inside it never quite lands.', ar: 'ال العاصفة في داخلها لا تهبط أبدًا.' },
  },

  // ---------------------------------------------------------- consumables
  'small-potion': {
    id: 'small-potion', name: { en: 'Small Potion', ar: 'جرعة صغيرة' }, type: t.CONSUMABLE, rarity: 'common',
    icon: 'potion', iconColors: { main: '#e05548', accent: '#f5e9d0', dark: '#8c2c24' },
    price: 40, stackable: true, maxStack: 9, cooldown: 3,
    heal: 35,
    desc: { en: 'Restores 35 health.', ar: 'يستعيد 35 نقطة صحة.' },
  },
  'large-potion': {
    id: 'large-potion', name: { en: 'Large Potion', ar: 'جرعة كبيرة' }, type: t.CONSUMABLE, rarity: 'uncommon',
    icon: 'potion', iconColors: { main: '#e05548', accent: '#ffd24c', dark: '#8c2c24' },
    price: 110, stackable: true, maxStack: 9, cooldown: 3,
    heal: 90,
    desc: { en: 'Restores 90 health.', ar: 'يستعيد 90 نقطة صحة.' },
  },
  'mana-draught': {
    id: 'mana-draught', name: { en: 'Mana Draught', ar: 'جرعة المانا' }, type: t.CONSUMABLE, rarity: 'common',
    icon: 'potion', iconColors: { main: '#5a8fe0', accent: '#bfe8f5', dark: '#2a4a8c' },
    price: 55, stackable: true, maxStack: 9, cooldown: 3,
    mana: 45,
    desc: { en: 'Restores 45 mana.', ar: 'استعد 45 نقطة مانا.' },
  },
  'sand-bread': {
    id: 'sand-bread', name: { en: 'Sand Bread', ar: 'خبز الرمل' }, type: t.CONSUMABLE, rarity: 'common',
    icon: 'food', iconColors: { main: '#c9a15e', accent: '#e8c489', dark: '#8a6a42' },
    price: 18, stackable: true, maxStack: 12, cooldown: 2,
    heal: 16,
    desc: { en: 'Restores 16 health. Crunchy.', ar: 'يستعيد 16 نقطة صحة. مقرمش.' },
  },
  'spiced-tea': {
    id: 'spiced-tea', name: { en: 'Spiced Tea', ar: 'شاي بالبهارات' }, type: t.CONSUMABLE, rarity: 'uncommon',
    icon: 'food', iconColors: { main: '#8c622c', accent: '#e8b64c', dark: '#4a2c18' },
    price: 45, stackable: true, maxStack: 9, cooldown: 5,
    heal: 24, mana: 20,
    desc: { en: 'Restores 24 health and 20 mana.', ar: 'يستعيد 24 صحة و20 مانا.' },
  },
  'elixir-of-storms': {
    id: 'elixir-of-storms', name: { en: 'Elixir of Storms', ar: 'إكسير العواصف' }, type: t.CONSUMABLE, rarity: 'rare',
    icon: 'potion', iconColors: { main: '#59c2a8', accent: '#f5e9d0', dark: '#184a44' },
    price: 260, stackable: true, maxStack: 5, cooldown: 12,
    heal: 60, mana: 60, buff: 'battleShout',
    desc: { en: 'Restores health/mana and grants fury briefly.', ar: 'يستعيد الصحة والمانا ويمنح غضبًا مؤقتًا.' },
  },

  // ------------------------------------------------------------- materials
  'scorpion-tail': {
    id: 'scorpion-tail', name: { en: 'Scorpion Tail', ar: 'ذيل عقرب' }, type: t.MATERIAL, rarity: 'common',
    icon: 'material', iconColors: { main: '#c2a06a', accent: '#8a6a42', dark: '#5f4735' },
    price: 22, stackable: true, maxStack: 99,
    desc: { en: 'Venom still dripping.', ar: 'السم ما زال يقطر.' },
  },
  'viper-fang': {
    id: 'viper-fang', name: { en: 'Viper Fang', ar: 'ناب أفعى' }, type: t.MATERIAL, rarity: 'uncommon',
    icon: 'material', iconColors: { main: '#b8a06a', accent: '#e0c88c', dark: '#7c6238' },
    price: 38, stackable: true, maxStack: 99,
    desc: { en: 'Sharp enough to puncture silence.', ar: 'حاد بما يكفي لخرق الصمت.' },
  },
  'dust-essence': {
    id: 'dust-essence', name: { en: 'Dust Essence', ar: 'جوهر الغبار' }, type: t.MATERIAL, rarity: 'uncommon',
    icon: 'material', iconColors: { main: '#d8c0a0', accent: '#f5e9d0', dark: '#a8886a' },
    price: 30, stackable: true, maxStack: 99,
    desc: { en: 'What spirits leave behind.', ar: 'ما تتركه الأرواح.' },
  },
  'crystal-shard': {
    id: 'crystal-shard', name: { en: 'Crystal Shard', ar: 'شظية بلور' }, type: t.MATERIAL, rarity: 'rare',
    icon: 'gem', iconColors: { main: '#b267e0', accent: '#e8c0f8', dark: '#4c2758' },
    price: 85, stackable: true, maxStack: 99,
    desc: { en: 'Hums the canyon song.', ar: 'يهمس بأغنية الوادي.' },
  },
  'ember-core': {
    id: 'ember-core', name: { en: 'Ember Core', ar: 'قلب الجمر' }, type: t.MATERIAL, rarity: 'rare',
    icon: 'gem', iconColors: { main: '#f29a4c', accent: '#ffd24c', dark: '#a03c12' },
    price: 95, stackable: true, maxStack: 99,
    desc: { en: 'Warmth that refuses to end.', ar: 'دفء يرفض الانتهاء.' },
  },
  'wraith-cloth': {
    id: 'wraith-cloth', name: { en: 'Wraith Cloth', ar: 'قماش الشبح' }, type: t.MATERIAL, rarity: 'rare',
    icon: 'material', iconColors: { main: '#8c6ac0', accent: '#c8a8e8', dark: '#3a2750' },
    price: 78, stackable: true, maxStack: 99,
    desc: { en: 'Lighter than it should be.', ar: 'أخف مما ينبغي.' },
  },
  'sand-glass': {
    id: 'sand-glass', name: { en: 'Sand Glass', ar: 'زجاج رملي' }, type: t.MATERIAL, rarity: 'uncommon',
    icon: 'gem', iconColors: { main: '#e8c489', accent: '#f5e9d0', dark: '#a87c45' },
    price: 42, stackable: true, maxStack: 99,
    desc: { en: 'A memory, half-melted.', ar: 'ذكرى، نصف منصهرة.' },
  },
  'jackal-pelt': {
    id: 'jackal-pelt', name: { en: 'Jackal Pelt', ar: 'جلد ابن آوى' }, type: t.MATERIAL, rarity: 'common',
    icon: 'material', iconColors: { main: '#8a6a4f', accent: '#c9a15e', dark: '#5f4735' },
    price: 26, stackable: true, maxStack: 99,
    desc: { en: 'Thick and patient.', ar: 'سميك وصبور.' },
  },
  'salt-crystal': {
    id: 'salt-crystal', name: { en: 'Salt Crystal', ar: 'بلورة ملح' }, type: t.MATERIAL, rarity: 'common',
    icon: 'gem', iconColors: { main: '#e8ecf0', accent: '#ffffff', dark: '#9aa8b8' },
    price: 18, stackable: true, maxStack: 99,
    desc: { en: 'The flats keep their promises.', ar: 'المسطحات تفي بوعودها.' },
  },

  // ----------------------------------------------------------------- keys
  'temple-key': {
    id: 'temple-key', name: { en: 'Temple Key', ar: 'مفتاح المعبد' }, type: t.KEY, rarity: 'uncommon',
    icon: 'key', iconColors: { main: '#e8b64c', accent: '#f2d8a0', dark: '#6e5230' },
    price: 0, stackable: true, maxStack: 9,
    desc: { en: 'Opens the ember gate.', ar: 'يفتح بوابة الجمر.' },
  },
  'crystal-key': {
    id: 'crystal-key', name: { en: 'Crystal Key', ar: 'مفتاح البلور' }, type: t.KEY, rarity: 'uncommon',
    icon: 'key', iconColors: { main: '#b267e0', accent: '#e8c0f8', dark: '#4c2758' },
    price: 0, stackable: true, maxStack: 9,
    desc: { en: 'Fits a lock that sings.', ar: 'يناسب قفلًا يغنّي.' },
  },

  // --------------------------------------------------------------- quest
  'memory-shard': {
    id: 'memory-shard', name: { en: 'Memory Shard', ar: 'شظية ذكرى' }, type: t.QUEST, rarity: 'epic',
    icon: 'gem', iconColors: { main: '#59c2a8', accent: '#f5e9d0', dark: '#184a44' },
    price: 0, stackable: true, maxStack: 9,
    desc: { en: 'It remembers the ocean of stars.', ar: 'تتذكر محيط النجوم.' },
  },
  'merchant-token': {
    id: 'merchant-token', name: { en: 'Merchant Token', ar: 'رمز التاجر' }, type: t.QUEST, rarity: 'common',
    icon: 'coin', iconColors: { main: '#e8b64c', accent: '#f2d8a0', dark: '#6e5230' },
    price: 0, stackable: true, maxStack: 9,
    desc: { en: 'Proof of a fair trade.', ar: 'دليل على صفقة عادلة.' },
  },

  // ---------------------------------------------------------------- misc
  'gold-pouch': {
    id: 'gold-pouch', name: { en: 'Gold Pouch', ar: 'حقيبة ذهب' }, type: t.MISC, rarity: 'uncommon',
    icon: 'coin', iconColors: { main: '#f2c94c', accent: '#f5e9d0', dark: '#8a6a42' },
    price: 150, stackable: true, maxStack: 99,
    desc: { en: 'Open for a surprise.', ar: 'افتحها لمفاجأة.' },
  },
  'ancient-scroll': {
    id: 'ancient-scroll', name: { en: 'Ancient Scroll', ar: 'لفافة قديمة' }, type: t.MISC, rarity: 'rare',
    icon: 'scroll', iconColors: { main: '#e8e2d0', accent: '#8a6a42', dark: '#4a2c18' },
    price: 220, stackable: true, maxStack: 20,
    desc: { en: 'A skill, if you can read it.', ar: 'مهارة، إن استطعت قراءتها.' },
  },
  'wanderers-compass': {
    id: 'wanderers-compass', name: { en: "Wanderer's Compass", ar: 'بوصلة الرحّالة' }, type: t.MISC, rarity: 'rare',
    icon: 'amulet', iconColors: { main: '#59c2a8', accent: '#e8b64c', dark: '#184a44' },
    price: 300, stackable: false,
    desc: { en: 'Points to what you need.', ar: 'يشير إلى ما تحتاجه.' },
  },
};

/** Lookup helper used across systems. */
export function getItem(id) {
  return ITEMS[id] ?? null;
}

export function itemsByType(type) {
  return Object.values(ITEMS).filter((i) => i.type === type);
}

export function itemsByRarity(rarity) {
  return Object.values(ITEMS).filter((i) => i.rarity === rarity);
}

export default ITEMS;
