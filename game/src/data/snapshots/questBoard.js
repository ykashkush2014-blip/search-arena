/**
 * snapshots/questBoard.js — baked copy of the Linear seasonal quest board.
 * The live board is the Linear project "Sands of Aether — Seasonal Quest
 * Board / لوحة المهام الموسمية" (team YUS), provisioned 2026-11-23.
 */
export const SNAPSHOT_QUEST_BOARD = [
  {
    id: 'YUS-5',
    name: {
      en: 'S1 Main: The Awakening (quest chain)',
      ar: 'الموسم 1 — الصحوة (سلسلة المهام)',
    },
    desc: {
      en: 'Season 1 opens: explore the Sand Scar, awaken the Colossus, and descend through 40 levels of memory-sand toward the Storm Spire. Mirrored in-game as the q-main-* quest chain.',
      ar: 'الموسم الأول: استكشف ندبة الرمل، أيقظ العملاق، وانزل عبر 40 مرحلة من رمل الذاكرة نحو برج العاصفة. يُعكس داخل اللعبة كسلسلة مهام q-main-*.',
    },
    priority: 2,
    state: 'Backlog',
    labels: ['seasonal', 'main'],
    kind: 'main',
    url: 'https://linear.app/yusefkash/issue/YUS-5/s1-main-the-awakening-alshwh-quest-chain',
  },
  {
    id: 'YUS-6',
    name: {
      en: 'S1 Finale: Defeat the Wraith Lord',
      ar: 'الموسم 1 — هزيمة سيّد الشياطين',
    },
    desc: {
      en: 'Climb the Storm Spire and face the Wraith Lord — the desert learned your face; teach it something new. In-game: level-40, boss wraithLord, quest gq-final-memory.',
      ar: 'اصعد برج العاصفة وواجه سيّد الشياطين — الصحراء تعلّمتك؛ علّمها شيئًا جديدًا. داخل اللعبة: المرحلة 40، الزعيم wraithLord.',
    },
    priority: 1,
    state: 'Backlog',
    labels: ['seasonal', 'boss'],
    kind: 'boss',
    url: 'https://linear.app/yusefkash/issue/YUS-6/s1-finale-defeat-the-wraith-lord-hzymh-syd-alshyatyn',
  },
  {
    id: 'YUS-7',
    name: {
      en: 'S1 Bounty: Sandstorm Survivor',
      ar: 'الموسم 1 — مكافأة: ناجي العاصفة',
    },
    desc: {
      en: 'Survive 3 sandstorms in one run and post your score to the Supabase leaderboard. In-game quest: q-storm-survivor.',
      ar: 'اصمد أمام 3 عواصف رملية في جولة واحدة وانشر نتيجتك في لوحة المتصدرين. مهمة اللعبة: q-storm-survivor.',
    },
    priority: 3,
    state: 'Backlog',
    labels: ['seasonal', 'bounty'],
    kind: 'seasonal',
    url: 'https://linear.app/yusefkash/issue/YUS-7/s1-bounty-sandstorm-survivor-najy-alaasfh',
  },
  {
    id: 'YUS-8',
    name: {
      en: 'S1 Crafting: Forge an Aether Relic',
      ar: 'الموسم 1 — الصناعة: اصنع أثيريّة',
    },
    desc: {
      en: 'Craft 2 relics at the forge and share a screenshot of your loadout. In-game quest: gq-craft-relics.',
      ar: 'اصنع قطعتين من الآثار في المسبك وشارك لقطة من عتادك. مهمة اللعبة: gq-craft-relics.',
    },
    priority: 3,
    state: 'Backlog',
    labels: ['seasonal', 'crafting'],
    kind: 'seasonal',
    url: 'https://linear.app/yusefkash/issue/YUS-8/s1-crafting-forge-an-aether-relic-asna-athyryh',
  },
  {
    id: 'YUS-9',
    name: {
      en: 'S1 Community: Share Your Run',
      ar: 'الموسم 1 — المجتمع: شارك جولتك',
    },
    desc: {
      en: 'Share your best run: post your Supabase leaderboard score and the story of your favourite moment in the dunes. Open to all wanderers.',
      ar: 'شارك أفضل جولة لك: انشر نتيجتك في لوحة المتصدرين وحكاية لحظتك المفضلة في الكثبان. مفتوحة لكل الرحّالة.',
    },
    priority: 4,
    state: 'Backlog',
    labels: ['seasonal', 'community'],
    kind: 'community',
    url: 'https://linear.app/yusefkash/issue/YUS-9/s1-community-share-your-run-shark-jwltk',
  },
];

export default SNAPSHOT_QUEST_BOARD;
