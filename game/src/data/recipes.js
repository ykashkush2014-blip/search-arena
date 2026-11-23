/**
 * recipes.js — crafting recipes. Inputs are item ids from data/items.js.
 */
export const RECIPES = {
  'forge-iron-sword': {
    id: 'forge-iron-sword', name: { en: 'Forge Iron Sword', ar: 'اطبع سيفًا حديديًا' },
    category: 'weapons', output: 'iron-sword', outputCount: 1, xp: 25,
    inputs: [{ itemId: 'scorpion-tail', count: 3 }, { itemId: 'sand-glass', count: 1 }],
    desc: { en: 'Basic, reliable steel.', ar: 'فولاذ بسيط وموثوق.' },
  },
  'forge-scimitar': {
    id: 'forge-scimitar', name: { en: 'Forge Scimitar of Dunes', ar: 'اطبع منجل الكثبان' },
    category: 'weapons', output: 'scimitar-of-dunes', outputCount: 1, xp: 70,
    inputs: [{ itemId: 'viper-fang', count: 4 }, { itemId: 'sand-glass', count: 3 }, { itemId: 'dust-essence', count: 2 }],
    desc: { en: 'The curve takes patience to set.', ar: 'الانحناء يحتاج صبرًا.' },
  },
  'forge-venom-blade': {
    id: 'forge-venom-blade', name: { en: 'Forge Venom Blade', ar: 'اطبع نصل السم' },
    category: 'weapons', output: 'venom-blade', outputCount: 1, xp: 110,
    inputs: [{ itemId: 'scorpion-tail', count: 8 }, { itemId: 'crystal-shard', count: 2 }, { itemId: 'viper-fang', count: 3 }],
    desc: { en: 'Handle with gloves. Or don\'t.', ar: 'أمسكه بقفازات. أو لا.' },
  },
  'forge-ember-fang': {
    id: 'forge-ember-fang', name: { en: 'Forge Ember Fang', ar: 'اطبع ناب الجمر' },
    category: 'weapons', output: 'ember-fang', outputCount: 1, xp: 160,
    inputs: [{ itemId: 'ember-core', count: 5 }, { itemId: 'sand-glass', count: 4 }, { itemId: 'wraith-cloth', count: 2 }],
    desc: { en: 'Quench it in storm glass.', ar: 'أطفئه في زجاج العاصفة.' },
  },
  'weave-leather-armor': {
    id: 'weave-leather-armor', name: { en: 'Weave Leather Harness', ar: 'انسج حزامًا جلديًا' },
    category: 'armor', output: 'leather-armor', outputCount: 1, xp: 30,
    inputs: [{ itemId: 'jackal-pelt', count: 3 }, { itemId: 'scorpion-tail', count: 2 }],
    desc: { en: 'Stitched from honest hunting.', ar: 'مخيط من صيد صادق.' },
  },
  'forge-scale-mail': {
    id: 'forge-scale-mail', name: { en: 'Forge Scale Mail', ar: 'اطبع درعًا حرشفيًا' },
    category: 'armor', output: 'scale-mail', outputCount: 1, xp: 85,
    inputs: [{ itemId: 'scorpion-tail', count: 6 }, { itemId: 'sand-glass', count: 4 }, { itemId: 'salt-crystal', count: 3 }],
    desc: { en: 'Each scale set one painful at a time.', ar: 'كل حرفة تُركب بألم.' },
  },
  'grow-crystal-carapace': {
    id: 'grow-crystal-carapace', name: { en: 'Grow Crystal Carapace', ar: 'أنبت قشرة بلورية' },
    category: 'armor', output: 'crystal-carapace', outputCount: 1, xp: 150,
    inputs: [{ itemId: 'crystal-shard', count: 8 }, { itemId: 'dust-essence', count: 4 }, { itemId: 'wraith-cloth', count: 2 }],
    desc: { en: 'Water it with patience.', ar: 'اسقه بالصبر.' },
  },
  'craft-dune-runners': {
    id: 'craft-dune-runners', name: { en: 'Craft Dune Runners', ar: 'اصنع عدّاءي الكثبان' },
    category: 'armor', output: 'dune-runners', outputCount: 1, xp: 75,
    inputs: [{ itemId: 'jackal-pelt', count: 4 }, { itemId: 'dust-essence', count: 3 }],
    desc: { en: 'Light feet, lighter prints.', ar: 'خفيفة الأثر.' },
  },
  'brew-small-potion': {
    id: 'brew-small-potion', name: { en: 'Brew Small Potion', ar: 'اخلط جرعة صغيرة' },
    category: 'consumables', output: 'small-potion', outputCount: 2, xp: 12,
    inputs: [{ itemId: 'dust-essence', count: 1 }, { itemId: 'sand-bread', count: 1 }],
    byproducts: [{ itemId: 'small-potion', count: 1, chance: 0.2 }],
    desc: { en: 'Two for the road.', ar: 'اثنتان للطريق.' },
  },
  'brew-elixir': {
    id: 'brew-elixir', name: { en: 'Brew Elixir of Storms', ar: 'اخلط إكسير العواصف' },
    category: 'consumables', output: 'elixir-of-storms', outputCount: 1, xp: 60,
    inputs: [{ itemId: 'dust-essence', count: 3 }, { itemId: 'crystal-shard', count: 1 }, { itemId: 'spiced-tea', count: 1 }],
    desc: { en: 'Bottled courage.', ar: 'شجاعة معبأة.' },
  },
  'bake-sand-bread': {
    id: 'bake-sand-bread', name: { en: 'Bake Sand Bread', ar: 'اخبز خبز الرمل' },
    category: 'consumables', output: 'sand-bread', outputCount: 3, xp: 8,
    inputs: [{ itemId: 'salt-crystal', count: 1 }, { itemId: 'jackal-pelt', count: 1 }],
    desc: { en: 'Do not ask about the recipe.', ar: 'لا تسأل عن الوصفة.' },
  },
  'forge-copper-ring': {
    id: 'forge-copper-ring', name: { en: 'Forge Copper Ring', ar: 'اطبع خاتمًا نحاسيًا' },
    category: 'trinkets', output: 'copper-ring', outputCount: 1, xp: 20,
    inputs: [{ itemId: 'salt-crystal', count: 4 }, { itemId: 'sand-glass', count: 1 }],
    desc: { en: 'Simple, warm, green.', ar: 'بسيط، دافئ، أخضر.' },
  },
  'craft-stormglass': {
    id: 'craft-stormglass', name: { en: 'Craft Stormglass Charm', ar: 'اصنع تعويذة زجاج العاصفة' },
    category: 'trinkets', output: 'stormglass-charm', outputCount: 1, xp: 95,
    inputs: [{ itemId: 'sand-glass', count: 6 }, { itemId: 'dust-essence', count: 4 }, { itemId: 'salt-crystal', count: 2 }],
    desc: { en: 'The storm inside never lands.', ar: 'العاصفة في الداخل لا تهبط.' },
  },
  'carve-crystal-circlet': {
    id: 'carve-crystal-circlet', name: { en: 'Carve Crystal Circlet', ar: 'نقش إكليلًا بلوريًا' },
    category: 'trinkets', output: 'crystal-circlet', outputCount: 1, xp: 90,
    inputs: [{ itemId: 'crystal-shard', count: 4 }, { itemId: 'wraith-cloth', count: 1 }, { itemId: 'sand-glass', count: 2 }],
    desc: { en: 'Sings near secrets.', ar: 'يغنّي قرب الأسرار.' },
  },
  'brew-spiced-tea': {
    id: 'brew-spiced-tea', name: { en: 'Brew Spiced Tea', ar: 'حضّر شايًا بالبهارات' },
    category: 'consumables', output: 'spiced-tea', outputCount: 2, xp: 10,
    inputs: [{ itemId: 'dust-essence', count: 1 }, { itemId: 'salt-crystal', count: 2 }],
    desc: { en: 'Merchant-grade hospitality.', ar: 'ضيافة بمستوى التجار.' },
  },
  'forge-temple-key': {
    id: 'forge-temple-key', name: { en: 'Forge Temple Key', ar: 'اطبع مفتاح المعبد' },
    category: 'keys', output: 'temple-key', outputCount: 1, xp: 40,
    inputs: [{ itemId: 'ember-core', count: 2 }, { itemId: 'sand-glass', count: 2 }],
    desc: { en: 'Warm even when cold.', ar: 'دافئ حتى في البرد.' },
  },
  'cut-crystal-key': {
    id: 'cut-crystal-key', name: { en: 'Cut Crystal Key', ar: 'قصّ مفتاح البلور' },
    category: 'keys', output: 'crystal-key', outputCount: 1, xp: 40,
    inputs: [{ itemId: 'crystal-shard', count: 3 }, { itemId: 'dust-essence', count: 2 }],
    desc: { en: 'Fits a lock that sings.', ar: 'يناسب قفلًا يغنّي.' },
  },
};

export const RECIPE_CATEGORIES = ['weapons', 'armor', 'consumables', 'trinkets', 'keys'];

export function getRecipe(id) {
  return RECIPES[id] ?? null;
}

export default RECIPES;
