/**
 * curated.js — curated narrative vocabulary and campaign design tables.
 * The generator (tools/gen-content.js) consumes these to produce the
 * 40-level campaign: names, story beats, ambience lines, NPC pools and
 * boss assignments. Everything here is hand-authored; the generator only
 * assembles and varies it with a seeded RNG (fully deterministic output).
 */

export const CAMPAIGN_SIZE = 40;

export const BIOMES = {
  dunes: {
    id: 'dunes',
    name: { en: 'The Dunes', ar: 'الكثبان' },
    music: 'dunes',
    weights: { sand: 0.6, sandDark: 0.16, rock: 0.08, stone: 0.06, plant: 0.04, flower: 0.02, wall: 0.02, water: 0.02 },
    weatherWeights: ['sandstorm', 'sandstorm', 'clear', 'clear', 'heat'],
    nightWeights: [0.5, 0.5, 0.6, 0.4, 0.5],
  },
  oasis: {
    id: 'oasis',
    name: { en: 'The Oasis', ar: 'الواحة' },
    music: 'dunes',
    weights: { grass: 0.3, sand: 0.26, water: 0.12, plant: 0.1, shallow: 0.06, flower: 0.05, tree: 0.05, rock: 0.04, bridge: 0.02 },
    weatherWeights: ['clear', 'rain', 'clear', 'wind', 'fog'],
  },
  caves: {
    id: 'caves',
    name: { en: 'The Hollows', ar: 'التجاويف' },
    music: 'night',
    weights: { stone: 0.42, wall: 0.18, sandDark: 0.1, rock: 0.08, salt: 0.06, crystal: 0.04, shallow: 0.04, wallTop: 0.04, lava: 0.02, spikes: 0.02 },
    weatherWeights: ['clear', 'clear', 'fog', 'clear', 'storm'],
  },
  temple: {
    id: 'temple',
    name: { en: 'The Ember Temple', ar: 'معبد الجمر' },
    music: 'boss',
    weights: { stone: 0.34, wall: 0.16, ash: 0.12, lava: 0.1, wallTop: 0.08, sandDark: 0.08, rock: 0.06, crystal: 0.04, spikes: 0.02 },
    weatherWeights: ['ember', 'ember', 'clear', 'storm', 'ember'],
  },
};

/** 8 story regions × 5 levels = 40. */
export const REGIONS = [
  {
    id: 'scar',
    name: { en: 'The Sand Scar', ar: 'ندبة الرمل' },
    summary: {
      en: 'A road of broken caravans where the sand first turned hostile.',
      ar: 'طريق القوافل المحطّمة حيث انقلب الرمل عدائيًا لأول مرة.',
    },
    biome: 'dunes',
    levelRange: [1, 5],
  },
  {
    id: 'dunewatch',
    name: { en: 'Dunewatch', ar: 'مرصد الكثبان' },
    summary: {
      en: 'Wind-worn towers watching a desert that no longer sleeps.',
      ar: 'أبراج تآكلتها الرياح تراقب صحراء لم تعد تنام.',
    },
    biome: 'dunes',
    levelRange: [6, 10],
  },
  {
    id: 'mirage',
    name: { en: 'The Mirage Basin', ar: 'حوض السراب' },
    summary: {
      en: 'Water that is not water, grass that is not grass — and things that feed on both.',
      ar: 'ماء ليس ماءً، وعشب ليس عشبًا — وكائنات تتغذى على كليهما.',
    },
    biome: 'oasis',
    levelRange: [11, 15],
  },
  {
    id: 'greenbelt',
    name: { en: 'The Green Belt', ar: 'الحزام الأخضر' },
    summary: {
      en: 'The last living gardens, defended by those who remember the old songs.',
      ar: 'آخر الحدائق الحيّة، يحرسها من يتذكّر الأغاني القديمة.',
    },
    biome: 'oasis',
    levelRange: [16, 20],
  },
  {
    id: 'saltdeep',
    name: { en: 'The Salt Deep', ar: 'العمق الملحي' },
    summary: {
      en: 'Caves where the drowned lights of an older world still flicker.',
      ar: 'كهوف لا تزال فيها أضواء عالم أغرق قديمًا ترتجف.',
    },
    biome: 'caves',
    levelRange: [21, 25],
  },
  {
    id: 'crystalveins',
    name: { en: 'The Crystal Veins', ar: 'عروق الكريستال' },
    summary: {
      en: 'The mountain hums. The crystals answer. Something listens.',
      ar: 'الجبل يطنّ. والكريستال يردّ. وشيء ما يصغي.',
    },
    biome: 'caves',
    levelRange: [26, 30],
  },
  {
    id: 'emberroad',
    name: { en: 'The Ember Road', ar: 'طريق الجمر' },
    summary: {
      en: 'Ash falls like snow on the road to the temple of the storm.',
      ar: 'الرماد يتساقط كالمثلج على الطريق إلى معبد العاصفة.',
    },
    biome: 'temple',
    levelRange: [31, 35],
  },
  {
    id: 'stormspire',
    name: { en: 'The Storm Spire', ar: 'برج العاصفة' },
    summary: {
      en: 'Where the Wraith Lord keeps the memory of the world captive.',
      ar: 'حيث يحتفظ سيد الشياطين بذاكرة العالم أسيرًا.',
    },
    biome: 'temple',
    levelRange: [36, 40],
  },
];

/** Boss assignments: level index (1-based) → enemy id + encounter title. */
export const BOSS_LEVELS = {
  8: {
    bossId: 'duneColossus',
    title: { en: 'The Waking Colossus', ar: 'العملاق اليقظ' },
    intro: {
      en: 'The dunes themselves stand up and remember how to hate.',
      ar: 'الكثبان نفسها تقف وتتذكّر كيف تكره.',
    },
    taunt: {
      en: 'THE SAND REMEMBERS EVERY FOOTSTEP.',
      ar: 'الرمل يتذكّر كل خطوة.',
    },
  },
  16: {
    bossId: 'crystalQueen',
    title: { en: 'Queen of the Green Veil', ar: 'ملكة الحجاب الأخضر' },
    intro: {
      en: 'A queen of living crystal sings the oasis into a cage.',
      ar: 'ملكة من كريستال حيّ تغني الواحة إلى قفص.',
    },
    taunt: {
      en: 'EVERY GARDEN BELONGS TO ITS THORNS.',
      ar: 'كل حديقة تخص أشواكها.',
    },
  },
  24: {
    bossId: 'emberLord',
    title: { en: 'Lord of the Deep Forge', ar: 'سادة الأعمق الناريّة' },
    intro: {
      en: 'In the deepest forge, something is hammering the world into a weapon.',
      ar: 'في الأعمق الناريّة الأعمق، شيء ما يطرق العالم ليصنع منه سلاحًا.',
    },
    taunt: {
      en: 'YOU WILL BE SHAPED.',
      ar: 'سيتمّ تشكيلك.',
    },
  },
  32: {
    bossId: 'abyssScorpion',
    title: { en: 'The Abyss Scorpion', ar: 'عقرب الهاوية' },
    intro: {
      en: 'Its tail carries a sting made of stolen aether.',
      ar: 'ذيله يحمل لسعة مصنوعة من أثير مسروق.',
    },
    taunt: {
      en: 'KNEEL BEFORE THE STING.',
      ar: 'انحنِ أمام اللسعة.',
    },
  },
  40: {
    bossId: 'wraithLord',
    title: { en: 'The Wraith Lord', ar: 'سيّد الشياطين' },
    intro: {
      en: 'At the top of the spire, the storm takes a face — and it is yours.',
      ar: 'في قمة البرج، تأخذ العاصفة وجهًا — إنه وجهك.',
    },
    taunt: {
      en: 'I AM WHAT THE DESERT LEARNED.',
      ar: 'أنا ما تعلّمته الصحراء.',
    },
  },
};

/** Village hub levels get full NPC villages; minor camps get 1–2 NPCs. */
export const HUB_LEVELS = [1, 10, 20, 30];
export const CAMP_LEVELS = [5, 15, 25, 35];

/** Enemy rotation by region (generator picks from these pools).
 *  Ids must match src/data/enemies.js exactly. */
export const REGION_ENEMIES = {
  scar: ['scorpion', 'sandViper'],
  dunewatch: ['jackal', 'scarab', 'sandGolem'],
  mirage: ['dustSpirit', 'mirageStalker', 'sandViper'],
  greenbelt: ['sandMite', 'dustSpirit', 'mirageStalker'],
  saltdeep: ['crystalSpider', 'saltWraith', 'scorpion'],
  crystalveins: ['crystalSpider', 'sandGolem', 'saltWraith'],
  emberroad: ['fireSprite', 'emberHound', 'templeGuardian'],
  stormspire: ['saltWraith', 'emberHound', 'templeGuardian'],
};

// ------------------------------------------------------------- vocabulary

export const NAME_PARTS = {
  en: {
    first: ['Sands', 'Dunes', 'Salt', 'Ember', 'Mirage', 'Wind', 'Sun', 'Moon', 'Star', 'Dust', 'Aether', 'Scorpion', 'Serpent', 'Oasis', 'Scar', 'Spire', 'Vault', 'Garden', 'Forge', 'Veil'],
    second: ['of Silence', 'of Echoes', 'of Ash', 'of Memory', 'of Thirst', 'of the Colossus', 'of the Lost', 'of the Dawn', 'of the Deep', 'of the Last Rain', 'of Whispers', 'of the Broken Road', 'of the Ninth Wind', 'of Hollow Light', 'of the Long Night', 'of Reckoning', 'of the Wanderer', 'of the Forgotten King', 'of Shattered Glass', 'of the Final Storm'],
    sites: ['Crossing', 'Basin', 'Ridge', 'Hollow', 'Steps', 'Terrace', 'Gate', 'Well', 'Shrine', 'Fields', 'Towers', 'Ruins', 'Tunnels', 'Grotto', 'Causeway', 'Anchorage', 'Sanctum', 'Foundry', 'Galleries', 'Approach'],
  },
  ar: {
    first: ['رمال', 'كثبان', 'ملح', 'جمر', 'سراب', 'ريح', 'شمس', 'قمر', 'نجم', 'غبار', 'أثير', 'عقرب', 'ثعبان', 'واحة', 'ندبة', 'برج', 'خزنة', 'حديقة', 'مسبك', 'حجاب'],
    second: ['الصمت', 'الأصداء', 'الرماد', 'الذاكرة', 'العطش', 'العملاق', 'الضالّين', 'الفجر', 'العمق', 'المطر الأخير', 'الهمسات', 'الطريق المكسور', 'الريح التاسعة', 'الضوء الأجوف', 'الليل الطويل', 'الحساب', 'الرحّالة', 'الملك المنسي', 'الزجاج المحطم', 'العاصفة الأخيرة'],
    sites: ['المفترق', 'الحوض', 'الحافة', 'التجويف', 'الدرجات', 'الشرفة', 'البوابة', 'البئر', 'المزار', 'الحقول', 'الأبراج', 'الأطلال', 'الأنفاق', 'الكهف', 'الممر', 'المرسى', 'الحرم', 'المسبك', 'المعرض', 'المدخل'],
  },
};

export const NPC_NAME_POOL = {
  en: [
    { name: 'Rasha the Merchant', role: 'merchant' },
    { name: 'Sadiq the Elder', role: 'elder' },
    { name: 'Tariq the Guard', role: 'guard' },
    { name: 'Amal the Healer', role: 'healer' },
    { name: 'Bilal the Smith', role: 'smith' },
    { name: 'Najma the Wanderer', role: 'hunter' },
    { name: 'Karim of the Dunes', role: 'villager' },
    { name: 'Layla of the Well', role: 'villager' },
    { name: 'Old Musa', role: 'elder' },
    { name: 'Farida the Keeper', role: 'healer' },
    { name: 'Hassan the Digger', role: 'villager' },
    { name: 'Zahra the Singer', role: 'villager' },
    { name: 'Yusuf the Scout', role: 'hunter' },
    { name: 'Muna the Scribe', role: 'villager' },
    { name: 'Idris the Torchbearer', role: 'guard' },
    { name: 'Salma the Glasswright', role: 'smith' },
    { name: 'The Masked Trader', role: 'merchant' },
    { name: 'Grandmother Huda', role: 'elder' },
    { name: 'Rami the Cook', role: 'villager' },
    { name: 'Dalia the Cartographer', role: 'villager' },
    { name: 'The Stormwatcher', role: 'guard' },
    { name: 'Qasim the Farmer', role: 'villager' },
    { name: 'Noor the Lampmaker', role: 'smith' },
    { name: 'Amina the Quiet', role: 'healer' },
    { name: 'The Last Caravaneer', role: 'merchant' },
  ],
  ar: [
    { name: 'رشا التاجر', role: 'merchant' },
    { name: 'الشيخ صديق', role: 'elder' },
    { name: 'الحارس طارق', role: 'guard' },
    { name: 'المعالجة أمل', role: 'healer' },
    { name: 'الحدّاد بلال', role: 'smith' },
    { name: 'الرحّالة نجمة', role: 'hunter' },
    { name: 'كريم من الكثبان', role: 'villager' },
    { name: 'ليلى البئر', role: 'villager' },
    { name: 'موسى العجوز', role: 'elder' },
    { name: 'فريدة الحارسة', role: 'healer' },
    { name: 'حسان الحافر', role: 'villager' },
    { name: 'زهراء المغنية', role: 'villager' },
    { name: 'يوسف الكشّاف', role: 'hunter' },
    { name: 'منى الكاتبة', role: 'villager' },
    { name: 'إدريس حامل المشعل', role: 'guard' },
    { name: 'سلمى صانعة الزجاج', role: 'smith' },
    { name: 'التاجر المقنّع', role: 'merchant' },
    { name: 'الجدة هدى', role: 'elder' },
    { name: 'رامي الطاهي', role: 'villager' },
    { name: 'داليا راسمة الخرائط', role: 'villager' },
    { name: 'مراقب العاصفة', role: 'guard' },
    { name: 'قاسم الفلاح', role: 'villager' },
    { name: 'نور صانعة المصابيح', role: 'smith' },
    { name: 'أمينة الصامتة', role: 'healer' },
    { name: 'آخر قافلة', role: 'merchant' },
  ],
};

/** Ambience / atmosphere lines shown on level entry and in area intros. */
export const AMBIENCE_LINES = {
  dunes: {
    en: [
      'The wind writes and erases in the same breath.',
      'Footprints fill with light the moment you lift your feet.',
      'Somewhere far behind, the caravan bells have gone quiet.',
      'The sand is warm on top and cold underneath, like a secret.',
      'Shadows here lean toward the nearest shelter.',
    ],
    ar: [
      'الريح تكتب وتمحو في نفس النَفَس.',
      'آثار الأقدام تمتلئ بالضوء لحظة رفع قدميك.',
      'خلفك في البعيد، أجراس القافلة صارت صامتة.',
      'الرمل دافئ على البارد تحته، كأنه سرّ.',
      'الظلال هنا تميل نحو أقرب مأوى.',
    ],
  },
  oasis: {
    en: [
      'Water here tastes like a memory of rain.',
      'The frogs argue politely about the meaning of night.',
      'Green things grow in the shapes of old promises.',
      'Every palm tree leans like it is listening.',
      'Lotuses close their petals when the wind speaks.',
    ],
    ar: [
      'الماء هنا طعمه كذاكرة المطر.',
      'الضفادع تتجادل بأدب حول معنى الليل.',
      'الأشياء الخضراء تنمو على شكل مواعيد قديمة.',
      'كل نخلة تميل كأنها تنصت.',
      'زهر اللوتس يغلق بتلّه حين تتكلم الريح.',
    ],
  },
  caves: {
    en: [
      'Your footsteps come back to you wearing different shoes.',
      'The crystals blink in patterns that almost mean something.',
      'The air tastes of salt and old lightning.',
      'In the dark, counting becomes a kind of courage.',
      'Something drips in a rhythm older than water.',
    ],
    ar: [
      'خطواتك تعود إليك وهي ترتد أحذية مختلفة.',
      'الكريستال يومض بأنماط تعني شيئًا ما على وشك.',
      'الهواء طعمه ملح وبرق قديم.',
      'في العتمة، العدّ يصبح نوعًا من الشجاعة.',
      'شيء ما يقطر بإيقاع أقدم من الماء.',
    ],
  },
  temple: {
    en: [
      'Ash falls upward near the broken pillars.',
      'The heat has a heartbeat, and it is patient.',
      'Every stone here was once someone’s vow.',
      'The murals show a storm with a human face.',
      'Embers drift like slow insects toward the spire.',
    ],
    ar: [
      'الرماد يصعد قرب الأعممة المكسورة.',
      'الحرارة لها نبض قلب، وهي صبورة.',
      'كل حجر هنا كان يومًا عهد أحدهم.',
      'الجداريات تعرض عاصفة بوجه إنسان.',
      'الجمر يتطاشر كحشرات بطيئة نحو البرج.',
    ],
  },
};

/** Villager idle lines (small talk pools per archetype). */
export const IDLE_LINES = {
  merchant: {
    en: ['Fair prices for unfair times.', 'Gold is just water that never quenches.', 'See anything you like?'],
    ar: ['أسعار عادلة لأوقات ظالمة.', 'الذهب ماء لا يروي أبدًا.', 'هل رأيت ما يعجبك؟'],
  },
  elder: {
    en: ['Sit. The sand will wait.', 'We remember so the dunes cannot.', 'Every storm ends. Not every lesson does.'],
    ar: ['اجلس. الرمل سينتظر.', 'نحن نتذكّر حتى لا تتذكّر الكثبان.', 'كل عاصفة تنتهي. وليس كل درس.'],
  },
  guard: {
    en: ['Keep your blade close and your water closer.', 'The watch never ends, it only rotates.', 'Move along, wanderer.'],
    ar: ['أبقِ نصلك قريبًا وماءك أقرب.', 'الحراسة لا تنتهي، بل تتناوب.', 'امشِ أيها الرحّالة.'],
  },
  healer: {
    en: ['Breathe. Even the wind rests.', 'Wounds talk. I translate.', 'Drink before you speak.'],
    ar: ['تنفّس. حتى الريح ترتاح.', 'الجروح تتكلم. أنا أترجم.', 'اشرب قبل أن تتكلم.'],
  },
  smith: {
    en: ['Good steel sings when it is ready.', 'I bend metal. Fate bends me.', 'Bring me ore and I will bring you time.'],
    ar: ['الحديد الجيد يغني حين يجهز.', 'أثني المعدن. والقدر يثنيني.', 'أحضر لي الخام وسأحضر لك الوقت.'],
  },
  hunter: {
    en: ['The desert gives tracks to those who wait.', 'Silence is a weapon. Load it.', 'I never miss twice.'],
    ar: ['الصحراء تعطي الآثار لمن ينتظر.', 'الصمت سلاح. حمّله.', 'أنا لا أخطئ مرتين.'],
  },
  villager: {
    en: ['The well is deeper than it looks.', 'My grandmother says the sand has moods.', 'Another day, another dune.'],
    ar: ['البئر أعمق مما يبدو.', 'جدتي تقول إن للرمل مزاجًا.', 'يوم آخر، كثيب آخر.'],
  },
};

/** Gameplay tips shown on death/level entry. */
export const TIPS = {
  en: [
    'Dash through sandstorms — moving slowly drains you.',
    'Glowing cracks in the floor mean the floor is not your friend.',
    'Bosses change patterns at half health. Watch, then strike.',
    'Craft bandages early. Gold cannot heal you in a dungeon.',
    'Secret chests hide behind walls that look slightly different.',
    'Spend stamina on dodges, not on greed.',
    'Every biome has a weather rhythm. Learn it, and the storm becomes a shield.',
    'Talk to everyone twice. The second sentence is usually the truth.',
  ],
  ar: [
    'انطلق عبر العواصف الرملية — البطء يستنزفك.',
    'الشقوق المتوهجة في الأرض تعني أن الأرض ليست صديقك.',
    'الزعماء يغيرون أنماطهم عند نصف الصحة. راقب ثم اضرب.',
    'اصنع الضمادات مبكرًا. الذهب لا يشفيك في الزنزانة.',
    'الصناديق السرية تختبئ خلف جدران تبدو مختلفة قليلًا.',
    'استهلك التحمّل في المراوغة، لا في الطمع.',
    'لكل منطقة إيقاع طقس. تعلّمه، وتتحول العاصفة إلى درع.',
    'تحدث مع الجميع مرتين. الجملة الثانية هي الحقيقة عادةً.',
  ],
};

/** Main-quest story beats, one per boss milestone. */
export const STORY_BEATS = [
  {
    id: 'beat-awakening',
    title: { en: 'The Awakening', ar: 'الصحوة' },
    text: {
      en: 'The Sand Scar stirs. Something buried under the first dune is calling your name — the same name the storm uses.',
      ar: 'ندبة الرمل تهتزّ. شيء مدفون تحت الكثيب الأول يناديك باسمك — الاسم نفسه الذي تستعمله العاصفة.',
    },
  },
  {
    id: 'beat-colossus',
    title: { en: 'The Waking Colossus', ar: 'العملاق اليقظ' },
    text: {
      en: 'The colossus fell, but its memory flowed into the sand like ink into water. The oasis is now drinking it.',
      ar: 'سقط العملاق، لكن ذاكرته سالت في الرمل كالحبر في الماء. والواحة الآن تشربه.',
    },
  },
  {
    id: 'beat-greenveil',
    title: { en: 'The Green Veil', ar: 'الحجاب الأخضر' },
    text: {
      en: 'The crystal queen is broken. Beneath her garden, stairs descend into a forge that has been hammering since before the sun.',
      ar: 'تحطّمت ملكة الكريستال. تحت حديقتها، درج يهبط إلى مسبك يطرق منذ قبل الشمس.',
    },
  },
  {
    id: 'beat-forge',
    title: { en: 'The Deep Forge', ar: 'المسبك العميق' },
    text: {
      en: 'The ember lord is silenced. In his forge you find a blade half-forged from aether — it is warm, and it pulses like a heart.',
      ar: 'صمت سيد الجمر. في مسبكه تجد نصف سيف مطروق من الأثير — إنه دافئ، وينبض كقلب.',
    },
  },
  {
    id: 'beat-abyss',
    title: { en: 'The Abyss Sting', ar: 'لسعة الهاوية' },
    text: {
      en: 'The scorpion’s sting now points the way: up, into the spire where the storm keeps its face.',
      ar: 'لسعة العقرب الآن تشير الطريق: إلى الأعلى، حيث تحتفظ العاصفة بوجهها.',
    },
  },
  {
    id: 'beat-wraith',
    title: { en: 'What the Desert Learned', ar: 'ما تعلّمته الصحراء' },
    text: {
      en: 'The Wraith Lord wears your face because the desert learned it from you. To end the storm, you must teach it something new.',
      ar: 'سيّد الشياطين يرتدي وجهك لأن الصحراء تعلّمته منك. لإنهاء العاصفة، عليك أن تعلّمها شيئًا جديدًا.',
    },
  },
];

/** Dialogue line pools for generated conversations. */
export const DIALOGUE_LINES = {
  greetings: {
    elder: {
      en: ['Ah, the wanderer returns.', 'You walk like someone carrying a question.', 'The dunes sent you, didn’t they?'],
      ar: ['ها قد عاد الرحّالة.', 'تمشي كمن يحمل سؤالًا.', 'الكثبان أرسلتك، أليس كذلك؟'],
    },
    merchant: {
      en: ['Welcome, welcome! Everything must go — eventually.', 'Coin speaks. I listen.', 'A thirsty traveler and a full purse? Rare combination.'],
      ar: ['أهلًا أهلًا! كل شيء سيُباع — عاجلًا أو آجلًا.', 'الذهب يتكلم. وأنا أصغي.', 'مسافر عطشان ومحفظة ممتلئة؟ مزيج نادر.'],
    },
    guard: {
      en: ['Halt. State your business.', 'The road ahead is sharp. Sharpen your patience.', 'We hold the line so you can cross it.'],
      ar: ['قف. ما طلبك؟', 'الطريق أمامك حادّ. اشحذ صبرك.', 'نحن نصمد حتى تعبر.'],
    },
    healer: {
      en: ['You are leaking life. Let me help.', 'Sit. This will sting less than the truth.', 'The body keeps its own ledger.'],
      ar: ['أنت تتسرّب حياة. دعني أساعدك.', 'جلس. هذا يؤلم أقل من الحقيقة.', 'الجسد يحتفظ بسجلّه الخاص.'],
    },
    smith: {
      en: ['That gear has seen better days.', 'Ore in, legends out. Usually.', 'Your weapon is apologizing for itself.'],
      ar: ['هذا العتاد رأى أيامًا أفضل.', 'خام يدخل، أساطير تخرج. غالبًا.', 'سلاحك يعتذر عن نفسه.'],
    },
    hunter: {
      en: ['You move loud. Work on that.', 'The storm tracks the impatient first.', 'I saw your prints three dunes back.'],
      ar: ['تحركتك صاخبة. عمل على ذلك.', 'العاصفة تصيد الصبورين أولًا.', 'رأيت آثارك قبل ثلاثة كثبان.'],
    },
    villager: {
      en: ['Traveler! Does the outside still exist?', 'May your water never warm.', 'The nights have been longer since the storm.'],
      ar: ['أيها المسافر! هل العالم الخارجي ما زال موجودًا؟', 'ليت ماءك لا يدفأ أبدًا.', 'الليالٍ صارت أطول منذ العاصفة.'],
    },
  },
  farewells: {
    en: ['Go with the wind at your back.', 'May the dunes remember you kindly.', 'Return alive. It is a victory.', 'The road is shorter when shared.'],
    ar: ['امشِ والريح في ظهرك.', 'ليتّ الكثبان تتذكّرك بلطف.', 'عد حيًّا. هذا انتصار.', 'الطريق أقصر حين يُشارَك.'],
  },
  wisdom: {
    en: [
      'The storm is not angry. It is afraid. There is a difference.',
      'Aether is the sand’s memory of being a star.',
      'Every treasure in the deep was someone’s last decision.',
      'The old king built the spire to hold the storm. He forgot storms grow.',
    ],
    ar: [
      'العاصفة ليست غاضبة. إنها خائفة. هناك فرق.',
      'الأثير هو ذاكرة الرمل أنه كان نجمًا.',
      'كل كنز في الأعماق كان قرار أحدهم الأخير.',
      'الملك القديم بنى البرج ليحبس العاصفة. ونسي أن العواصف تنمو.',
    ],
  },
};

/** Quest objective label pools. */
export const QUEST_LABELS = {
  kill: {
    en: ['Cull the threat', 'Thin their numbers', 'Drive them back', 'Silence the pack'],
    ar: ['قلّل الخطر', 'خفّض أعدادهم', 'ادفعهم للخلف', 'أصمت القطيع'],
  },
  collect: {
    en: ['Gather supplies', 'Recover what was lost', 'Bring back proof', 'Collect the remnants'],
    ar: ['اجمع المؤن', 'استعد ما فُقد', 'أعد الدليل', 'اجمع البقايا'],
  },
  reach: {
    en: ['Scout the path', 'Reach the landmark', 'Find the way through', 'Mark the route'],
    ar: ['استكشف الطريق', 'بلغ المعلّم', 'اعثر على الممر', 'حدّد المسار'],
  },
  boss: {
    en: ['End the awakening', 'Break the crown', 'Silence the forge', 'Survive the sting', 'Face the storm'],
    ar: ['أنهِ الصحوة', 'حطّم التاج', 'أصمت المسبك', 'اصمد أمام اللسعة', 'واجه العاصفة'],
  },
  chest: {
    en: ['Open what was sealed', 'Claim the cache', 'Unlock the old stores'],
    ar: ['افتح ما أُغلق', 'استحوذ على المخبأ', 'افتح المخزون القديم'],
  },
  craft: {
    en: ['Practice the craft', 'Prepare for the road', 'Shape what you need'],
    ar: ['تمرّن على الصناعة', 'استعد للطريق', 'اصنع ما تحتاجه'],
  },
};

/** Balance knobs used by the generator for per-level scaling. */
export const DIFFICULTY_CURVE = {
  hpScale: (i) => 0.9 + i * 0.085,
  dmgScale: (i) => 0.85 + i * 0.07,
  xpScale: (i) => 1 + i * 0.12,
  goldScale: (i) => 1 + i * 0.06,
  enemyCount: (i, isBoss) => (isBoss ? 4 + Math.floor(i / 6) : 4 + Math.floor(i / 3) + (i % 3)),
};

export default {
  CAMPAIGN_SIZE, BIOMES, REGIONS, BOSS_LEVELS, HUB_LEVELS, CAMP_LEVELS,
  REGION_ENEMIES, NAME_PARTS, NPC_NAME_POOL, AMBIENCE_LINES, IDLE_LINES,
  TIPS, STORY_BEATS, DIALOGUE_LINES, QUEST_LABELS, DIFFICULTY_CURVE,
};
