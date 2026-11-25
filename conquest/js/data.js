// Static game data: eras, buildings, research, ranks, medals, balance knobs.
// All player-facing copy is Arabic-first with English fallbacks. Every label
// runs through t() so the whole table is translated once, at load time, by the
// active language in i18n.js.
import { t } from "./i18n.js";

export const ERAS = {
  ancient: {
    id: "ancient",
    ar: t("العصور القديمة"),
    en: "Ancient",
    years: t("3000 ق.م"),
    costMult: 0.55,
    armyMult: 1.0,
    tint: "ancient",
    unit: { ar: t("رماحون"), en: "Spearmen" },
    missile: { ar: t("منجنيق"), en: "Catapult" },
  },
  medieval: {
    id: "medieval",
    ar: t("العصور الوسطى"),
    en: "Medieval",
    years: t("1200 م"),
    costMult: 0.7,
    armyMult: 1.15,
    tint: "medieval",
    unit: { ar: t("فرسان"), en: "Knights" },
    missile: { ar: t("مدفع حجري"), en: "Bombard" },
  },
  sail: {
    id: "sail",
    ar: t("عصر الشراع"),
    en: "Age of Sail",
    years: t("1650 م"),
    costMult: 0.85,
    armyMult: 1.3,
    tint: "sail",
    unit: { ar: t("مشاة الخط"), en: "Line Infantry" },
    missile: { ar: t("مدفع ميدان"), en: "Field Cannon" },
  },
  imperial: {
    id: "imperial",
    ar: t("العصر الإمبراطوري"),
    en: "Imperial",
    years: t("1850 م"),
    costMult: 1.0,
    armyMult: 1.5,
    tint: "imperial",
    unit: { ar: t("بنادق"), en: "Riflemen" },
    missile: { ar: t("مدفعية"), en: "Artillery" },
  },
  modern: {
    id: "modern",
    ar: t("العصر الحديث"),
    en: "Modern",
    years: t("2026 م"),
    costMult: 1.25,
    armyMult: 1.8,
    tint: "modern",
    unit: { ar: t("مشاة آلية"), en: "Mech Infantry" },
    missile: { ar: t("صاروخ كروز"), en: "Cruise Missile" },
  },
};

// Building slots. Order matters: it is the 1..8 hotkey order.
export const BUILDINGS = [
  {
    key: "city",
    hotkey: "1",
    icon: "city",
    cost: 900,
    ar: t("مدينة"),
    en: "City",
    descAr: t("ترفع سقف الجيش والذهب. كل مستوى +12 ألف جندي."),
    descEn: "Raises troop and treasury caps. +12k troops per level.",
    color: "#e6c86e",
  },
  {
    key: "factory",
    hotkey: "2",
    icon: "factory",
    cost: 620,
    ar: t("مصنع"),
    en: "Factory",
    descAr: t("يدفع الذهب كل ثانية. +16 ذهب للمستوى."),
    descEn: "Produces gold every second. +16 gold per level.",
    color: "#c98a5c",
  },
  {
    key: "lab",
    hotkey: "3",
    icon: "lab",
    cost: 720,
    ar: t("مختبر أبحاث"),
    en: "Research Lab",
    descAr: t("ينتج نقاط بحث. +0.55 نقطة/ثانية للمستوى."),
    descEn: "Generates research points. +0.55/s per level.",
    color: "#7ad0e8",
  },
  {
    key: "port",
    hotkey: "4",
    icon: "port",
    cost: 780,
    ar: t("ميناء"),
    en: "Port",
    descAr: t("يفتح الغزو البحري ويضيف ذهبًا وتجارة."),
    descEn: "Enables naval invasions, adds trade gold.",
    color: "#6fa8d8",
  },
  {
    key: "base",
    hotkey: "5",
    icon: "base",
    cost: 560,
    ar: t("قاعدة عسكرية"),
    en: "Army Base",
    descAr: t("تسرّع تجنيد الجنود. +40 جندي/ثانية للمستوى."),
    descEn: "Recruits troops faster. +40/s per level.",
    color: "#8fae7a",
  },
  {
    key: "bunker",
    hotkey: "6",
    icon: "bunker",
    cost: 480,
    ar: t("مخبأ"),
    en: "Bunker",
    descAr: t("يقوّي الدفاع على حدودك. يبطئ أي هجوم عليك 9%."),
    descEn: "Fortifies borders. Slows attacks on you by 9%.",
    color: "#9aa4b5",
  },
  {
    key: "silo",
    hotkey: "7",
    icon: "silo",
    cost: 4200,
    ar: t("منصة صواريخ"),
    en: "Missile Silo",
    descAr: t("تطلق صواريخ كروز على أي هدف في الخريطة."),
    descEn: "Launches cruise missiles anywhere.",
    color: "#e07a7a",
  },
  {
    key: "aa",
    hotkey: "8",
    icon: "aa",
    cost: 3000,
    ar: t("دفاع جوي"),
    en: "Air Defense",
    descAr: t("يعترض الصواريخ حوله ويخفف الأضرار."),
    descEn: "Intercepts missiles near it.",
    color: "#b58fe0",
  },
];

export const BUILDING_BY_KEY = Object.fromEntries(BUILDINGS.map((b) => [b.key, b]));

// Era-specific display names for each slot (same ids/effects).
export const ERA_BUILDING_NAMES = {
  ancient: [
    t("قرية"), t("منجم"), t("معبد الكهنة"), t("مرسى سفن"), t("معسكر"), t("حصن"), t("منجنيق"), t("أبراج مراقبة"),
  ],
  medieval: [
    t("مدينة"), t("ورشة"), t("مكتبة"), t("ميناء"), t("ثكنة"), t("قلعة"), t("مدفع"), t("أبراج حراسة"),
  ],
  sail: [
    t("مدينة"), t("مصنع"), t("أكاديمية"), t("حوض بناء"), t("ثكنة"), t("حصن نجمي"), t("مدفعية"), t("بطاريات"),
  ],
  imperial: [
    t("مدينة"), t("مصنع"), t("جامعة"), t("ميناء"), t("ثكنة"), t("حصن"), t("مدفعية ثقيلة"), t("دفاعات"),
  ],
  modern: [
    t("مدينة"), t("مصنع"), t("مختبر أبحاث"), t("ميناء"), t("قاعدة عسكرية"), t("مخبأ"), t("منصة صواريخ"), t("دفاع جوي"),
  ],
};

export const RESEARCH = [
  {
    key: "weapons",
    ar: t("الأسلحة"),
    en: "Weapons",
    icon: "⚔",
    per: 0.10,
    descAr: t("قوة هجومك +10% لكل مستوى"),
  },
  { key: "defense", ar: t("الدفاعات"), en: "Defense", icon: "🛡", per: 0.09, descAr: t("دفاعك +9% لكل مستوى") },
  { key: "logistics", ar: t("اللوجستيات"), en: "Logistics", icon: "🚚", per: 0.12, descAr: t("سقف جيشك +12%") },
  { key: "economy", ar: t("الاقتصاد"), en: "Economy", icon: "💰", per: 0.12, descAr: t("ذهبك +12%") },
  { key: "population", ar: t("السكان"), en: "Population", icon: "👥", per: 0.10, descAr: t("سقف السكان +10%") },
  { key: "artillery", ar: t("المدفعية"), en: "Artillery", icon: "🎯", per: 0.15, descAr: t("قوة الضربات +15%") },
];

export const MAX_TECH = 5;

export const RANKS = [
  { ar: t("مجنّد"), en: "Recruit", xp: 0 },
  { ar: t("جندي"), en: "Soldier", xp: 60 },
  { ar: t("رقيب"), en: "Sergeant", xp: 180 },
  { ar: t("نقيب"), en: "Captain", xp: 420 },
  { ar: t("رائد"), en: "Major", xp: 900 },
  { ar: t("عقيد"), en: "Colonel", xp: 1800 },
  { ar: t("عميد"), en: "Brigadier", xp: 3400 },
  { ar: t("لواء"), en: "General", xp: 6000 },
  { ar: t("فريق أول"), en: "Field Marshal", xp: 10000 },
  { ar: t("إمبراطور"), en: "Emperor", xp: 16000 },
];

export const MEDALS = [
  { id: "first_blood", ar: t("أول ضربة"), en: "First Blood", hintAr: t("احتلال أول دولة") },
  { id: "five_nations", ar: t("الفاتح"), en: "Conqueror", hintAr: t("احتلال 5 دول") },
  { id: "ten_nations", ar: t("الإسكندر"), en: "Alexander", hintAr: t("احتلال 10 دول") },
  { id: "quick_war", ar: t("حرب خاطفة"), en: "Blitz", hintAr: t("احتلال دولة في أقل من 60 ثانية") },
  { id: "billion_troops", ar: t("جيش لا يُهزم"), en: "Unstoppable", hintAr: t("امتلاك مليون جندي") },
  { id: "capital_hunter", ar: t("قنّاص العواصم"), en: "Capital Hunter", hintAr: t("إسقاط 3 عواصم") },
  { id: "nuke_them", ar: t("الفطر"), en: "Mushroom", hintAr: t("استخدام سلاح نووي") },
  { id: "alliance_king", ar: t("دبلوماسي"), en: "Diplomat", hintAr: t("عقد تحالفين") },
  { id: "survivor", ar: t("الصامد"), en: "Survivor", hintAr: t("صد 10 هجمات") },
  { id: "world_ruler", ar: t("حاكم العالم"), en: "World Ruler", hintAr: t("الوصول إلى 50% من الأرض") },
  { id: "builder", ar: t("المعماري"), en: "Architect", hintAr: t("بناء 25 مبنى") },
  { id: "tech_master", ar: "عالِم", en: "Scientist", hintAr: t("الوصول لأعلى مستوى في أي بحث") },
  { id: "no_mercy", ar: "بلا رحمة", en: "No Mercy", hintAr: t("احتلال دولة كبرى (أكثر من 1000 خلية)") },
  { id: "comeback", ar: t("العودة"), en: "Comeback", hintAr: t("الفوز بعد خسارة نصف أرضك") },
  { id: "daily_3", ar: t("مثابر"), en: "Persistent", hintAr: t("سلسلة 3 أيام في التحدي اليومي") },
  { id: "speed_demon", ar: t("برق"), en: "Lightning", hintAr: t("احتلال 3 دول في أول 3 دقائق") },
  { id: "peace", ar: t("الحكيم"), en: "The Wise", hintAr: t("إنهاء 3 حروب بوقف إطلاق النار") },
  { id: "navy", ar: t("أمير البحر"), en: "Sea Lord", hintAr: t("نجاح 3 غزوات بحرية") },
  { id: "emperor", ar: t("الإمبراطور"), en: "Emperor", hintAr: t("الوصول لأعلى رتبة") },
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
  // Conquest pace. Measured on Sudan (5,653 cells): cap 14 → 217s, cap 18 →
  // 114s. 24 lands the same conquest near ~85s, which keeps a 50%-of-world
  // online match inside a sitting instead of dragging for many minutes.
  frontSpeedCap: 24, // max cells/sec one offensive can take (hard ceiling)
  capitulation: 0.45, // a nation that loses this share of its land surrenders at once
  haltRatio: 0.2, // attacker/defender engagement ratio below which a front stalls
  // After taking a capital, a nation breaks much faster (was 0.22).
  capitulateFraction: 0.3,
  attackerAttrition: 0.0085,
  defenderAttrition: 0.022,
  retreatLoss: 0.25,
  bunkerSlow: 0.09,
  bunkerMax: 0.55,
  capitalArmyLoss: 1 / 3,

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
  easy: { ar: t("سهل"), aggression: 0.55, skill: 0.55, buildRate: 0.6 },
  normal: { ar: t("عادي"), aggression: 0.8, skill: 0.8, buildRate: 1.0 },
  hard: { ar: t("صعب"), aggression: 1.05, skill: 1.0, buildRate: 1.35 },
  brutal: { ar: t("وحشي"), aggression: 1.35, skill: 1.2, buildRate: 1.7 },
};

export const MODES = [
  {
    id: "world",
    ar: t("فتح العالم"),
    en: "World Conquest",
    descAr: t("اختر أي دولة على خريطة العالم وابدأ من حدودها الحقيقية."),
    icon: "globe",
  },
  {
    id: "history",
    ar: t("الحملات التاريخية"),
    en: "History",
    descAr: t("قُد إسكندر أو روما أو جنكيز خان من حدودهم التاريخية."),
    icon: "scroll",
  },
  {
    id: "daily",
    ar: t("التحدي اليومي"),
    en: "Daily Challenge",
    descAr: t("دولة واحدة للجميع كل يوم، وهدف متغيّر. الفوز يبني سلسلتك."),
    icon: "star",
  },
];
