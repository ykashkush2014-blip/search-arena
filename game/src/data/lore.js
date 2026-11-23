/**
 * lore.js — in-game lore entries for the Codex (merged with the Notion
 * snapshot by game/content.js).
 */
export const LORE = {
  'lore-aether-wells': {
    id: 'lore-aether-wells', category: 'lore',
    name: { en: 'Aether Wells', ar: 'آبار الأثير' },
    desc: {
      en: 'Deep beneath each oasis lies a well of liquid starlight. The old songs say the desert was once an ocean of it.',
      ar: 'تحت كل واحة بئر من ضوء النجوم السائل. الأغاني القديمة تقول إن الصحراء كانت يومًا محيطًا منه.',
    },
  },
  'lore-memory-glass': {
    id: 'lore-memory-glass', category: 'crafting',
    name: { en: 'Memory Glass', ar: 'زجاج الذكريات' },
    desc: {
      en: 'Sand struck by aether-light fuses into glass that remembers. Smiths prize it; merchants price it; the wise hoard it.',
      ar: 'الرمل الذي يضربه ضوء الأثير ينصهر في زجاج يتذكّر. يقدّره الحدّادون ويسعّره التجار ويكتنزه الحكماء.',
    },
  },
  'lore-storm-paths': {
    id: 'lore-storm-paths', category: 'guide',
    name: { en: 'Storm Paths', ar: 'مسارات العاصفة' },
    desc: {
      en: 'Between the dunes run invisible roads the wind repeats. Follow them to travel fast — or to be lost forever.',
      ar: 'بين الكثبان طرق غير مرئية يتكرر عليها الريح. اتبعها لتنتقل سريعًا — أو لتضل إلى الأبد.',
    },
  },
  'lore-the-well-cracked': {
    id: 'lore-the-well-cracked', category: 'lore',
    name: { en: 'The Cracked Well', ar: 'البئر المتصدّع' },
    desc: {
      en: 'Three nights before you woke, the oldest well split open. The song began then, and so did the storms.',
      ar: 'قبل ثلاث ليالٍ من استيقاظك، شقّ أقدم بئرٍ انفتح. بدأت الأغنية حينها، وكذلك العواصف.',
    },
  },
  'lore-wanderers-glass': {
    id: 'lore-wanderers-glass', category: 'lore',
    name: { en: 'The Wanderer\'s Bottle', ar: 'قارورة الرحّالة' },
    desc: {
      en: 'Every wanderer carries a glass bottle. Empty, it is a flask. Full of shards, it is a map of everything the storm forgot.',
      ar: 'كل رحّال يحمل قارورة زجاج. فارغة، هي قِربة. مملوءة بالشظايا، هي خريطة لكل ما نسيته العاصفة.',
    },
  },
  'lore-salt-sleepers': {
    id: 'lore-salt-sleepers', category: 'bestiary',
    name: { en: 'Salt Sleepers', ar: 'النائمون في الملح' },
    desc: {
      en: 'The white flats are not empty. Beneath the crust, giants dream in brine, and the crystals hum their dreams.',
      ar: 'المسطحات البيضاء ليست فارغة. تحت القشرة، عملاقة تحلم بالمحلول، والبلورات تهمس بأحلامها.',
    },
  },
  'lore-canyon-market': {
    id: 'lore-canyon-market', category: 'lore',
    name: { en: 'The Echo Market', ar: 'سوق الأصداء' },
    desc: {
      en: 'In the canyon of echoes, traders once bartered memories. The stalls still stand, and the spirits still haggle.',
      ar: 'في وادي الأصداء، كان التجار يقايضون الذكريات. الأكشاك ما زالت قائمة، والأرواح ما زالت تساوم.',
    },
  },
  'lore-ember-duels': {
    id: 'lore-ember-duels', category: 'bestiary',
    name: { en: 'The Dueling Rings', ar: 'حلبات المبارزة' },
    desc: {
      en: 'Below the temple, rings of cooled lava mark old duels. The Ember Lord wages rematches against any who descend.',
      ar: 'تحت المعبد، حلبات من الحمم المبرّدة تحدد مبارزات قديمة. سيّد الجمر يراهن بإعادة المبارزة على من يهبط.',
    },
  },
  'lore-weather-reading': {
    id: 'lore-weather-reading', category: 'guide',
    name: { en: 'Reading the Sky', ar: 'قراءة السماء' },
    desc: {
      en: 'Green dawns bring blessed winds. Copper sunsets promise storms. When the stars hum, the mirage spirits walk.',
      ar: 'الفجر الأخضر يجلب رياحًا مباركة. الغروب النحاسي يوحي بالعواصف. وحين تهتزّ النجوم، تمشي أرواح السراب.',
    },
  },
  'lore-combat-arts': {
    id: 'lore-combat-arts', category: 'guide',
    name: { en: 'The Three Cuts', ar: 'الضربات الثلاث' },
    desc: {
      en: 'The wanderer\'s sword dance has three steps: strike, step, strike. The third cut is always the one they remember.',
      ar: 'رقصة سيف الرحّالة ثلاث خطوات: اضرب، اخطُ، اضرب. الضربة الثالثة هي دائمًا ما يتذكّرونها.',
    },
  },
};

export function getLore(id) {
  return LORE[id] ?? null;
}

export function loreByCategory(category) {
  return Object.values(LORE).filter((l) => l.category === category);
}

export default LORE;
