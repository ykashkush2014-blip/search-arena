// Static game data: eras, buildings, research, ranks, medals, balance knobs.
// All player-facing copy is Arabic-first with English fallbacks.

export const ERAS = {
  ancient: {
    id: "ancient",
    ar: "العصور القديمة",
    en: "Ancient",
    years: "3000 ق.م",
    costMult: 0.55,
    armyMult: 1.0,
    tint: "ancient",
    unit: { ar: "رماحون", en: "Spearmen" },
    missile: { ar: "منجنيق", en: "Catapult" },
  },
  medieval: {
    id: "medieval",
    ar: "العصور الوسطى",
    en: "Medieval",
    years: "1200 م",
    costMult: 0.7,
    armyMult: 1.15,
    tint: "medieval",
    unit: { ar: "فرسان", en: "Knights" },
    missile: { ar: "مدفع حجري", en: "Bombard" },
  },
  sail: {
    id: "sail",
    ar: "عصر الشراع",
    en: "Age of Sail",
    years: "1650 م",
    costMult: 0.85,
    armyMult: 1.3,
    tint: "sail",
    unit: { ar: "مشاة الخط", en: "Line Infantry" },
    missile: { ar: "مدفع ميدان", en: "Field Cannon" },
  },
  imperial: {
    id: "imperial",
    ar: "العصر الإمبراطوري",
    en: "Imperial",
    years: "1850 م",
    costMult: 1.0,
    armyMult: 1.5,
    tint: "imperial",
    unit: { ar: "بنادق", en: "Riflemen" },
    missile: { ar: "مدفعية", en: "Artillery" },
  },
  modern: {
    id: "modern",
    ar: "العصر الحديث",
    en: "Modern",
    years: "2026 م",
    costMult: 1.25,
    armyMult: 1.8,
    tint: "modern",
    unit: { ar: "مشاة آلية", en: "Mech Infantry" },
    missile: { ar: "صاروخ كروز", en: "Cruise Missile" },
  },
};

// Building slots. Order matters: it is the 1..8 hotkey order.
export const BUILDINGS = [
  {
    key: "city",
    hotkey: "1",
    icon: "city",
    cost: 900,
    ar: "مدينة",
    en: "City",
    descAr: "ترفع سقف الجيش والذهب. كل مستوى +12 ألف جندي.",
    descEn: "Raises troop and treasury caps. +12k troops per level.",
    color: "#e6c86e",
  },
  {
    key: "factory",
    hotkey: "2",
    icon: "factory",
    cost: 620,
    ar: "مصنع",
    en: "Factory",
    descAr: "يدفع الذهب كل ثانية. +16 ذهب للمستوى.",
    descEn: "Produces gold every second. +16 gold per level.",
    color: "#c98a5c",
  },
  {
    key: "lab",
    hotkey: "3",
    icon: "lab",
    cost: 720,
    ar: "مختبر أبحاث",
    en: "Research Lab",
    descAr: "ينتج نقاط بحث. +0.55 نقطة/ثانية للمستوى.",
    descEn: "Generates research points. +0.55/s per level.",
    color: "#7ad0e8",
  },
  {
    key: "port",
    hotkey: "4",
    icon: "port",
    cost: 780,
    ar: "ميناء",
    en: "Port",
    descAr: "يفتح الغزو البحري ويضيف ذهبًا وتجارة.",
    descEn: "Enables naval invasions, adds trade gold.",
    color: "#6fa8d8",
  },
  {
    key: "base",
    hotkey: "5",
    icon: "base",
    cost: 560,
    ar: "قاعدة عسكرية",
    en: "Army Base",
    descAr: "تسرّع تجنيد الجنود. +40 جندي/ثانية للمستوى.",
    descEn: "Recruits troops faster. +40/s per level.",
    color: "#8fae7a",
  },
  {
    key: "bunker",
    hotkey: "6",
    icon: "bunker",
    cost: 480,
    ar: "مخبأ",
    en: "Bunker",
    descAr: "يقوّي الدفاع على حدودك. يبطئ أي هجوم عليك 9%.",
    descEn: "Fortifies borders. Slows attacks on you by 9%.",
    color: "#9aa4b5",
  },
  {
    key: "silo",
    hotkey: "7",
    icon: "silo",
    cost: 4200,
    ar: "منصة صواريخ",
    en: "Missile Silo",
    descAr: "تطلق صواريخ كروز على أي هدف في الخريطة.",
    descEn: "Launches cruise missiles anywhere.",
    color: "#e07a7a",
  },
  {
    key: "aa",
    hotkey: "8",
    icon: "aa",
    cost: 3000,
    ar: "دفاع جوي",
    en: "Air Defense",
    descAr: "يعترض الصواريخ حوله ويخفف الأضرار.",
    descEn: "Intercepts missiles near it.",
    color: "#b58fe0",
  },
];

export const BUILDING_BY_KEY = Object.fromEntries(BUILDINGS.map((b) => [b.key, b]));

// Era-specific display names for each slot (same ids/effects).
export const ERA_BUILDING_NAMES = {
  ancient: [
    "قرية", "منجم", "معبد الكهنة", "مرسى سفن", "معسكر", "حصن", "منجنيق", "أبراج مراقبة",
  ],
  medieval: [
    "مدينة", "ورشة", "مكتبة", "ميناء", "ثكنة", "قلعة", "مدفع", "أبراج حراسة",
  ],
  sail: [
    "مدينة", "مصنع", "أكاديمية", "حوض بناء", "ثكنة", "حصن نجمي", "مدفعية", "بطاريات",
  ],
  imperial: [
    "مدينة", "مصنع", "جامعة", "ميناء", "ثكنة", "حصن", "مدفعية ثقيلة", "دفاعات",
  ],
  modern: [
    "مدينة", "مصنع", "مختبر أبحاث", "ميناء", "قاعدة عسكرية", "مخبأ", "منصة صواريخ", "دفاع جوي",
  ],
};

export const RESEARCH = [
  {
    key: "weapons",
    ar: "الأسلحة",
    en: "Weapons",
    icon: "⚔",
    per: 0.10,
    descAr: "قوة هجومك +10% لكل مستوى",
  },
  { key: "defense", ar: "الدفاعات", en: "Defense", icon: "🛡", per: 0.09, descAr: "دفاعك +9% لكل مستوى" },
  { key: "logistics", ar: "اللوجستيات", en: "Logistics", icon: "🚚", per: 0.12, descAr: "سقف جيشك +12%" },
  { key: "economy", ar: "الاقتصاد", en: "Economy", icon: "💰", per: 0.12, descAr: "ذهبك +12%" },
  { key: "population", ar: "السكان", en: "Population", icon: "👥", per: 0.10, descAr: "سقف السكان +10%" },
  { key: "artillery", ar: "المدفعية", en: "Artillery", icon: "🎯", per: 0.15, descAr: "قوة الضربات +15%" },
];

export const MAX_TECH = 5;

export const RANKS = [
  { ar: "مجنّد", en: "Recruit", xp: 0 },
  { ar: "جندي", en: "Soldier", xp: 60 },
  { ar: "رقيب", en: "Sergeant", xp: 180 },
  { ar: "نقيب", en: "Captain", xp: 420 },
  { ar: "رائد", en: "Major", xp: 900 },
  { ar: "عقيد", en: "Colonel", xp: 1800 },
  { ar: "عميد", en: "Brigadier", xp: 3400 },
  { ar: "لواء", en: "General", xp: 6000 },
  { ar: "فريق أول", en: "Field Marshal", xp: 10000 },
  { ar: "إمبراطور", en: "Emperor", xp: 16000 },
];

export const MEDALS = [
  { id: "first_blood", ar: "أول ضربة", en: "First Blood", hintAr: "احتلال أول دولة" },
  { id: "five_nations", ar: "الفاتح", en: "Conqueror", hintAr: "احتلال 5 دول" },
  { id: "ten_nations", ar: "الإسكندر", en: "Alexander", hintAr: "احتلال 10 دول" },
  { id: "quick_war", ar: "حرب خاطفة", en: "Blitz", hintAr: "احتلال دولة في أقل من 60 ثانية" },
  { id: "billion_troops", ar: "جيش لا يُهزم", en: "Unstoppable", hintAr: "امتلاك مليون جندي" },
  { id: "capital_hunter", ar: "قنّاص العواصم", en: "Capital Hunter", hintAr: "إسقاط 3 عواصم" },
  { id: "nuke_them", ar: "الفطر", en: "Mushroom", hintAr: "استخدام سلاح نووي" },
  { id: "alliance_king", ar: "دبلوماسي", en: "Diplomat", hintAr: "عقد تحالفين" },
  { id: "survivor", ar: "الصامد", en: "Survivor", hintAr: "صد 10 هجمات" },
  { id: "world_ruler", ar: "حاكم العالم", en: "World Ruler", hintAr: "الوصول إلى 50% من الأرض" },
  { id: "builder", ar: "المعماري", en: "Architect", hintAr: "بناء 25 مبنى" },
  { id: "tech_master", ar: "عالِم", en: "Scientist", hintAr: "الوصول لأعلى مستوى في أي بحث" },
  { id: "no_mercy", ar: "بلا رحمة", en: "No Mercy", hintAr: "احتلال دولة كبرى (أكثر من 1000 خلية)" },
  { id: "comeback", ar: "العودة", en: "Comeback", hintAr: "الفوز بعد خسارة نصف أرضك" },
  { id: "daily_3", ar: "مثابر", en: "Persistent", hintAr: "سلسلة 3 أيام في التحدي اليومي" },
  { id: "speed_demon", ar: "برق", en: "Lightning", hintAr: "احتلال 3 دول في أول 3 دقائق" },
  { id: "peace", ar: "الحكيم", en: "The Wise", hintAr: "إنهاء 3 حروب بوقف إطلاق النار" },
  { id: "navy", ar: "أمير البحر", en: "Sea Lord", hintAr: "نجاح 3 غزوات بحرية" },
  { id: "emperor", ar: "الإمبراطور", en: "Emperor", hintAr: "الوصول لأعلى رتبة" },
];

export const BALANCE = {
  tick: 0.1, // simulation step (seconds)

  // --- economy ---
  baseGoldRate: 3.4,
  goldPerFactory: 17,
  goldPerCell: 0.01,
  portGold: 9,
  // army cap: flat base + land term (sub-linear) + cities
  baseCap: 4000,
  capPerSqrt: 900,
  capPerCell: 1.2,
  capPerCity: 5200,
  baseTroopRate: 760,
  reinforceCapTime: 10, // seconds for an offensive to absorb battlefield reinforcements
  troopRatePerBase: 90,
  troopRateFrac: 0.008,
  popGrowth: 3.2, // per second fraction of (cap - army) handled separately below

  // --- combat ---
  // advances: cells/sec = frontWidthFactor * fronts^0.75 * ratio^0.7 (capped)
  frontWidthFactor: 0.2, // how fast a winning front physically advances
  maxBuildings: 40, // hard cap per nation (grows slightly with land)
  frontSpeedCap: 18, // max cells/sec one offensive can take (hard ceiling)
  capitulation: 0.45, // a nation that loses this share of its land surrenders at once
  haltRatio: 0.24, // attacker/defender engagement ratio below which a front stalls
  attackerAttrition: 0.0085,
  defenderAttrition: 0.022,
  retreatLoss: 0.25,
  bunkerSlow: 0.09,
  bunkerMax: 0.55,
  capitalArmyLoss: 1 / 3,
  capitulateFraction: 0.22,

  // --- strikes ---
  missileCost: 2600,
  missileRadius: 11,
  missileDamage: 26000,
  missileChargeTime: 26,
  maxMissiles: 3,
  nukeRadius: 34,
  nukeDamage: 120000,
  nukeCost: 12000,

  // --- diplomacy ---
  ceasefireCost: 900,
  ceasefireTime: 45,
  allianceTime: 120,
  giftCost: 500,
  betrayalPenalty: 60,

  // --- misc ---
  xpPerCell: 0.02,
  xpPerNation: 40,
  ruinReclaim: 6,
  aiRuinReclaim: 1.6,
  navalSpeed: 55, // cells per second
};

// Difficulty presets for the player's rivals.
export const AI_LEVELS = {
  easy: { ar: "سهل", aggression: 0.55, skill: 0.55, buildRate: 0.6 },
  normal: { ar: "عادي", aggression: 0.8, skill: 0.8, buildRate: 1.0 },
  hard: { ar: "صعب", aggression: 1.05, skill: 1.0, buildRate: 1.35 },
  brutal: { ar: "وحشي", aggression: 1.35, skill: 1.2, buildRate: 1.7 },
};

export const MODES = [
  {
    id: "world",
    ar: "فتح العالم",
    en: "World Conquest",
    descAr: "اختر أي دولة على خريطة العالم وابدأ من حدودها الحقيقية.",
    icon: "globe",
  },
  {
    id: "history",
    ar: "الحملات التاريخية",
    en: "History",
    descAr: "قُد إسكندر أو روما أو جنكيز خان من حدودهم التاريخية.",
    icon: "scroll",
  },
  {
    id: "daily",
    ar: "التحدي اليومي",
    en: "Daily Challenge",
    descAr: "دولة واحدة للجميع كل يوم، وهدف متغيّر. الفوز يبني سلسلتك.",
    icon: "star",
  },
];
