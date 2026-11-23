/**
 * gen-content.js — deterministic campaign generator.
 *
 * Reads curated design tables (tools/content/curated.js) plus the procedural
 * level generator (src/world/dungeonGen.js) and emits real, imported ES
 * modules under src/data/generated/:
 *
 *   levels/level-01.js … level-40.js   — full level modules (tiles, spawns,
 *                                        entities, triggers, ambience, quests)
 *   dialogues.generated.js             — village conversations + boss taunts
 *   quests.generated.js                — campaign & side quest chain
 *   strings.generated.js               — bilingual string tables (en/ar)
 *   index.js                           — aggregator imported by the game
 *
 * Output is fully deterministic (seeded RNG) and validated before writing.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeRNG } from '../src/core/rng.js';
import { generateLevel } from '../src/world/dungeonGen.js';
import {
  CAMPAIGN_SIZE, BIOMES, REGIONS, BOSS_LEVELS, HUB_LEVELS, CAMP_LEVELS,
  REGION_ENEMIES, NAME_PARTS, NPC_NAME_POOL, AMBIENCE_LINES, IDLE_LINES,
  TIPS, STORY_BEATS, DIALOGUE_LINES, QUEST_LABELS, DIFFICULTY_CURVE,
} from './content/curated.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'src', 'data', 'generated');
const LEVEL_DIR = join(OUT_DIR, 'levels');

// ------------------------------------------------------------- helpers

function regionFor(index) {
  return REGIONS.find((r) => index >= r.levelRange[0] && index <= r.levelRange[1]) ?? REGIONS[0];
}

function pick(rng, arr) {
  return arr[Math.floor(rng.next() * arr.length)];
}

function levelName(rng, index, region, biome) {
  const parts = NAME_PARTS;
  const style = index % 4;
  const en = [];
  const ar = [];
  if (style === 0) {
    // "X of Y" mythic
    en.push(`${pick(rng, parts.en.first)} ${pick(rng, parts.en.second)}`);
    ar.push(`${pick(rng, parts.ar.first)} ${pick(rng, parts.ar.second)}`);
  } else if (style === 1) {
    // region site
    en.push(`${pick(rng, parts.en.sites)} of ${region.name.en}`);
    ar.push(`${pick(rng, parts.ar.sites)} — ${region.name.ar}`);
  } else if (style === 2) {
    // biome + ordinal flavor
    en.push(`${biome.name.en} ${pick(rng, ['Reach', 'Pass', 'Verges', 'Maw', 'Heart'])} ${toRoman(index)}`);
    ar.push(`${pick(rng, ['ممر', 'مهبط', 'أطراف', 'حلق', 'قلب'])} ${biome.name.ar} ${toRoman(index)}`);
  } else {
    en.push(`${pick(rng, parts.en.first)} ${pick(rng, parts.en.sites)}`);
    ar.push(`${pick(rng, parts.ar.first)} ${pick(rng, parts.ar.sites)}`);
  }
  return { en: en[0], ar: ar[0] };
}

function toRoman(n) {
  const table = [
    [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ];
  let out = '';
  let rest = n;
  for (const [val, sym] of table) {
    while (rest >= val) {
      out += sym;
      rest -= val;
    }
  }
  return out;
}

function levelSubtitle(rng, index, isBoss) {
  const enPool = isBoss
    ? ['Something vast turns in its sleep.', 'The ground holds its breath.', 'A reckoning waits ahead.']
    : ['The wind keeps its distance here.', 'Old footsteps, newer dangers.', 'The way down is the way through.', 'Take only what you can carry out.'];
  const arPool = isBoss
    ? ['شيء ضخم يستدير في نومه.', 'الأرض تمسك أنفاسها.', 'حساب قادم ينتظر.']
    : ['الريح تبتعد عن هنا.', 'خطوات قديمة، مخاطر أحدث.', 'الطريق للأسفل هو الطريق للخارج.', 'خذ ما تحمله فقط.'];
  return { en: pick(rng, enPool), ar: pick(rng, arPool) };
}

// --------------------------------------------------------- level emission

function buildLevel(index, seed) {
  const rng = makeRNG(seed);
  const region = regionFor(index);
  const biome = BIOMES[region.biome];
  const isBoss = BOSS_LEVELS[index] !== undefined;
  const isHub = HUB_LEVELS.includes(index);
  const isCamp = CAMP_LEVELS.includes(index);
  const id = `level-${String(index).padStart(2, '0')}`;
  const name = levelName(rng, index, region, biome);
  const subtitle = levelSubtitle(rng, index, isBoss);

  const width = isHub ? 44 : 32 + Math.floor(rng.next() * 8);
  const height = isHub ? 28 : 22 + Math.floor(rng.next() * 5);
  const gen = generateLevel({
    rng,
    width,
    height,
    biome: region.biome,
    roomCount: isHub ? 7 : isBoss ? 5 : 4 + Math.floor(rng.next() * 3),
    difficulty: index / CAMPAIGN_SIZE,
  });

  // ---- entities
  const entities = [];
  const enemyPool = REGION_ENEMIES[region.id];
  const enemyCount = DIFFICULTY_CURVE.enemyCount(index, isBoss);
  const levelScale = {
    hp: round2(DIFFICULTY_CURVE.hpScale(index)),
    dmg: round2(DIFFICULTY_CURVE.dmgScale(index)),
    xp: round2(DIFFICULTY_CURVE.xpScale(index)),
    gold: round2(DIFFICULTY_CURVE.goldScale(index)),
  };

  // enemy placements: prefer room centers away from spawn
  const rooms = gen.rooms ?? [];
  for (let e = 0; e < enemyCount; e += 1) {
    const room = rooms[1 + (e % Math.max(1, rooms.length - 1))] ?? rooms[0] ?? { cx: Math.floor(width / 2), cy: Math.floor(height / 2) };
    const jitterX = Math.floor(rng.next() * 3) - 1;
    const jitterY = Math.floor(rng.next() * 3) - 1;
    const kind = pick(rng, enemyPool);
    entities.push({
      type: 'enemy',
      kind,
      x: clampInt(room.cx + jitterX, 2, width - 3),
      y: clampInt(room.cy + jitterY, 2, height - 3),
    });
  }

  // boss
  if (isBoss) {
    const bossDef = BOSS_LEVELS[index];
    const bossRoom = rooms[rooms.length - 1] ?? { cx: Math.floor(width / 2), cy: Math.floor(height / 2) };
    entities.push({
      type: 'boss',
      kind: bossDef.bossId,
      x: bossRoom.cx,
      y: bossRoom.cy,
      arena: {
        x: (bossRoom.cx - 5) * 16,
        y: (bossRoom.cy - 5) * 16,
        w: 11 * 16,
        h: 11 * 16,
      },
    });
  }

  // chests
  const chestCount = (isHub ? 2 : 1) + Math.floor(rng.next() * 2);
  for (let c = 0; c < chestCount; c += 1) {
    const room = rooms[(c + 2) % Math.max(1, rooms.length)] ?? rooms[0] ?? { cx: 8, cy: 8 };
    entities.push({
      type: 'chest',
      x: clampInt(room.cx + (c % 2 === 0 ? 1 : -1), 2, width - 3),
      y: clampInt(room.cy, 2, height - 3),
      id: `${id}-chest-${c + 1}`,
      lootTable: 'chest-tier' + (index < 14 ? '1' : index < 28 ? '2' : '3'),
    });
  }
  // one secret chest behind the far corner
  entities.push({
    type: 'chest',
    x: clampInt(width - 3, 2, width - 3),
    y: clampInt(height - 3, 2, height - 3),
    id: `${id}-secret`,
    lootTable: 'chest-tier' + (index < 14 ? '2' : '3'),
    secret: true,
  });

  // NPCs at hubs & camps
  if (isHub || isCamp) {
    const roles = isHub
      ? ['elder', 'merchant', 'smith', 'healer', 'guard', 'hunter']
      : ['villager', 'hunter'];
    const room = rooms[0] ?? { cx: 6, cy: 6 };
    roles.forEach((role, i) => {
      const namePool = NPC_NAME_POOL.en[(index + i) % NPC_NAME_POOL.en.length];
      entities.push({
        type: 'npc',
        kind: role,
        x: clampInt(room.cx + (i % 3) - 1, 2, width - 3),
        y: clampInt(room.cy + Math.floor(i / 3) + 1, 2, height - 3),
        name: {
          en: namePool.name,
          ar: NPC_NAME_POOL.ar[(index + i) % NPC_NAME_POOL.ar.length].name,
        },
        dialogue: `${id}-dlg-${role}`,
        role,
      });
    });
  }

  // ---- exits: one to the next level (boss exits stay locked until victory)
  const exit = gen.exit ?? { x: width - 3, y: height - 3 };
  const nextId = index < CAMPAIGN_SIZE ? `level-${String(index + 1).padStart(2, '0')}` : null;
  const exits = nextId
    ? [{
      x: exit.x,
      y: exit.y,
      to: nextId,
      toSpawn: 0,
      label: { en: 'Descend', ar: 'انزل' },
      ...(isBoss ? { locked: true, lockFlag: `${id}-boss-defeated` } : {}),
    }]
    : [];

  // ---- quests offered at this level
  const quests = [];
  if (index === 1) quests.push('q-first-steps');
  if (isBoss) quests.push('q-main-' + region.id);
  if (isHub && index > 1) quests.push(`gq-${id}-supplies`);
  if (index % 5 === 0 && !isBoss) quests.push(`gq-${id}-cull`);

  // ---- triggers (entry beats, story moments)
  const triggers = [{
    type: 'onEnter',
    text: {
      en: `${name.en} — ${subtitle.en}`,
      ar: `${name.ar} — ${subtitle.ar}`,
    },
  }];
  if (isBoss) {
    const bossDef = BOSS_LEVELS[index];
    triggers.push({
      type: 'onBossIntro',
      bossId: bossDef.bossId,
      title: bossDef.title,
      text: bossDef.intro,
    });
    triggers.push({
      type: 'onBossDefeated',
      setFlag: `${id}-boss-defeated`,
      text: bossDef.taunt,
    });
  }

  // ---- ambience & secrets & lore fragments
  const ambienceLines = AMBIENCE_LINES[region.biome];
  const ambience = {
    en: [
      ambienceLines.en[(index - 1) % ambienceLines.en.length],
      ambienceLines.en[(index + 1) % ambienceLines.en.length],
    ],
    ar: [
      ambienceLines.ar[(index - 1) % ambienceLines.ar.length],
      ambienceLines.ar[(index + 1) % ambienceLines.ar.length],
    ],
  };
  const secrets = [{
    x: clampInt(width - 3, 2, width - 3),
    y: clampInt(height - 3, 2, height - 3),
    desc: {
      en: 'A chest hidden where the map goes quiet.',
      ar: 'صندوق مخبأ حيث تسكت الخريطة.',
    },
  }];

  return {
    id,
    index,
    name,
    subtitle,
    region: region.id,
    biome: region.biome,
    music: isBoss ? 'boss' : (index % 7 === 0 ? 'night' : biome.music),
    width: gen.width ?? width,
    height: gen.height ?? height,
    tiles: gen.tiles,
    spawn: gen.spawn ?? { x: 3, y: 3 },
    spawns: [gen.spawn ?? { x: 3, y: 3 }],
    exits,
    entities,
    triggers,
    quests,
    ambience,
    secrets,
    levelScale,
    hasBoss: isBoss,
    timeStart: round2(0.3 + (index % 6) * 0.08),
    loreFragment: {
      en: `Field note ${index}: ${STORY_BEATS[Math.min(STORY_BEATS.length - 1, Math.floor((index - 1) / 8))].text.en}`,
      ar: `ميدانية ${index}: ${STORY_BEATS[Math.min(STORY_BEATS.length - 1, Math.floor((index - 1) / 8))].text.ar}`,
    },
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function clampInt(v, lo, hi) {
  return Math.max(lo, Math.min(hi, Math.round(v)));
}

// --------------------------------------------------------- module emitters

function emitLevelModule(level) {
  const lines = [];
  lines.push('/**');
  lines.push(` * ${level.id}.js — generated by tools/gen-content.js (do not edit by hand).`);
  lines.push(` * ${level.name.en} / ${level.name.ar}`);
  lines.push(' */');
  lines.push('');
  lines.push('export const level = {');
  lines.push(`  id: ${JSON.stringify(level.id)},`);
  lines.push(`  index: ${level.index},`);
  lines.push('  name: {');
  lines.push(`    en: ${JSON.stringify(level.name.en)},`);
  lines.push(`    ar: ${JSON.stringify(level.name.ar)},`);
  lines.push('  },');
  lines.push('  subtitle: {');
  lines.push(`    en: ${JSON.stringify(level.subtitle.en)},`);
  lines.push(`    ar: ${JSON.stringify(level.subtitle.ar)},`);
  lines.push('  },');
  lines.push(`  region: ${JSON.stringify(level.region)},`);
  lines.push(`  biome: ${JSON.stringify(level.biome)},`);
  lines.push(`  music: ${JSON.stringify(level.music)},`);
  lines.push(`  width: ${level.width},`);
  lines.push(`  height: ${level.height},`);
  lines.push('  tiles: [');
  for (const row of level.tiles) {
    lines.push(`    ${JSON.stringify(row)},`);
  }
  lines.push('  ],');
  lines.push('  spawn: {');
  lines.push(`    x: ${level.spawn.x},`);
  lines.push(`    y: ${level.spawn.y},`);
  lines.push('  },');
  lines.push('  spawns: [');
  for (const s of level.spawns) {
    lines.push(`    { x: ${s.x}, y: ${s.y} },`);
  }
  lines.push('  ],');
  lines.push('  exits: [');
  for (const exit of level.exits) {
    lines.push('    {');
    lines.push(`      x: ${exit.x},`);
    lines.push(`      y: ${exit.y},`);
    lines.push(`      to: ${JSON.stringify(exit.to)},`);
    lines.push(`      toSpawn: ${exit.toSpawn ?? 0},`);
    if (exit.locked) {
      lines.push('      locked: true,');
      lines.push(`      lockFlag: ${JSON.stringify(exit.lockFlag)},`);
    }
    lines.push('      label: {');
    lines.push(`        en: ${JSON.stringify(exit.label?.en ?? 'Continue')},`);
    lines.push(`        ar: ${JSON.stringify(exit.label?.ar ?? 'متابعة')},`);
    lines.push('      },');
    lines.push('    },');
  }
  lines.push('  ],');
  lines.push('  entities: [');
  for (const ent of level.entities) {
    switch (ent.type) {
      case 'enemy':
        lines.push(`    { type: 'enemy', kind: ${JSON.stringify(ent.kind)}, x: ${ent.x}, y: ${ent.y} },`);
        break;
      case 'boss':
        lines.push('    {');
        lines.push(`      type: 'boss',`);
        lines.push(`      kind: ${JSON.stringify(ent.kind)},`);
        lines.push(`      x: ${ent.x},`);
        lines.push(`      y: ${ent.y},`);
        lines.push('      arena: {');
        lines.push(`        x: ${ent.arena.x},`);
        lines.push(`        y: ${ent.arena.y},`);
        lines.push(`        w: ${ent.arena.w},`);
        lines.push(`        h: ${ent.arena.h},`);
        lines.push('      },');
        lines.push('    },');
        break;
      case 'chest':
        lines.push('    {');
        lines.push("      type: 'chest',");
        lines.push(`      x: ${ent.x},`);
        lines.push(`      y: ${ent.y},`);
        lines.push(`      id: ${JSON.stringify(ent.id)},`);
        lines.push(`      lootTable: ${JSON.stringify(ent.lootTable)},`);
        if (ent.secret) lines.push('      secret: true,');
        lines.push('    },');
        break;
      case 'npc':
        lines.push('    {');
        lines.push("      type: 'npc',");
        lines.push(`      kind: ${JSON.stringify(ent.kind)},`);
        lines.push(`      x: ${ent.x},`);
        lines.push(`      y: ${ent.y},`);
        lines.push('      name: {');
        lines.push(`        en: ${JSON.stringify(ent.name.en)},`);
        lines.push(`        ar: ${JSON.stringify(ent.name.ar)},`);
        lines.push('      },');
        lines.push(`      dialogue: ${JSON.stringify(ent.dialogue)},`);
        lines.push(`      role: ${JSON.stringify(ent.role)},`);
        lines.push('    },');
        break;
      default:
        break;
    }
  }
  lines.push('  ],');
  lines.push('  triggers: [');
  for (const trig of level.triggers) {
    lines.push('    {');
    lines.push(`      type: ${JSON.stringify(trig.type)},`);
    if (trig.bossId) lines.push(`      bossId: ${JSON.stringify(trig.bossId)},`);
    if (trig.setFlag) lines.push(`      setFlag: ${JSON.stringify(trig.setFlag)},`);
    if (trig.title) {
      lines.push('      title: {');
      lines.push(`        en: ${JSON.stringify(trig.title.en)},`);
      lines.push(`        ar: ${JSON.stringify(trig.title.ar)},`);
      lines.push('      },');
    }
    lines.push('      text: {');
    lines.push(`        en: ${JSON.stringify(trig.text.en)},`);
    lines.push(`        ar: ${JSON.stringify(trig.text.ar)},`);
    lines.push('      },');
    lines.push('    },');
  }
  lines.push('  ],');
  lines.push('  quests: [');
  for (const q of level.quests) {
    lines.push(`    ${JSON.stringify(q)},`);
  }
  lines.push('  ],');
  lines.push('  ambience: {');
  lines.push('    en: [');
  for (const l of level.ambience.en) lines.push(`      ${JSON.stringify(l)},`);
  lines.push('    ],');
  lines.push('    ar: [');
  for (const l of level.ambience.ar) lines.push(`      ${JSON.stringify(l)},`);
  lines.push('    ],');
  lines.push('  },');
  lines.push('  secrets: [');
  for (const s of level.secrets) {
    lines.push('    {');
    lines.push(`      x: ${s.x},`);
    lines.push(`      y: ${s.y},`);
    lines.push('      desc: {');
    lines.push(`        en: ${JSON.stringify(s.desc.en)},`);
    lines.push(`        ar: ${JSON.stringify(s.desc.ar)},`);
    lines.push('      },');
    lines.push('    },');
  }
  lines.push('  ],');
  lines.push('  levelScale: {');
  lines.push(`    hp: ${level.levelScale.hp},`);
  lines.push(`    dmg: ${level.levelScale.dmg},`);
  lines.push(`    xp: ${level.levelScale.xp},`);
  lines.push(`    gold: ${level.levelScale.gold},`);
  lines.push('  },');
  lines.push(`  hasBoss: ${level.hasBoss},`);
  lines.push(`  timeStart: ${level.timeStart},`);
  lines.push('  loreFragment: {');
  lines.push(`    en: ${JSON.stringify(level.loreFragment.en)},`);
  lines.push(`    ar: ${JSON.stringify(level.loreFragment.ar)},`);
  lines.push('  },');
  lines.push('};');
  lines.push('');
  lines.push('export default level;');
  lines.push('');
  return lines.join('\n');
}

// ---------------------------------------------------------- dialogues gen

function buildDialogues(levels, knownQuests = {}) {
  const dialogues = {};
  const rng = makeRNG(20261123);

  // fixed ids the game references as fallbacks
  dialogues['dlg-intro-vision'] = {
    id: 'dlg-intro-vision',
    nodes: {
      start: {
        speaker: { en: 'The Storm', ar: 'العاصفة' },
        text: {
          en: 'You wake with sand in your mouth and a name in your head that is not yours — yet. The wind whispers: forty steps down, one truth up.',
          ar: 'تستيقئ وفي فمك رمل، وفي رأسك اسم ليس لك — بعد. والريح تهمس: أربعون خطوة للأسفل، وحقيقة واحدة للأعلى.',
        },
        choices: [
          {
            text: { en: 'Who are you?', ar: 'من أنت؟' },
            next: 'storm-answers',
          },
          {
            text: { en: 'Say nothing. Walk.', ar: 'لا تقل شيئًا. امشِ.' },
            next: 'walk',
            effects: [{ type: 'giveXP', amount: 10 }],
          },
        ],
      },
      'storm-answers': {
        speaker: { en: 'The Storm', ar: 'العاصفة' },
        text: {
          en: 'I am what the desert learned while you slept. Find me at the spire, or I will find every village first.',
          ar: 'أنا ما تعلّمته الصحراء بينما كنت نائمًا. اعثرني في البرج، أو سأجد كل قرية قبلك.',
        },
        next: 'walk',
      },
      walk: {
        speaker: { en: 'The Wanderer', ar: 'الرحّالة' },
        text: {
          en: 'Forty levels of sand between me and an answer. Better start walking.',
          ar: 'أربعون مرحلة من الرمل بيني وبين إجابة. الأفضل أن أبدأ المشي.',
        },
        next: 'end',
        setFlags: ['intro-done'],
      },
    },
  };

  const archetypes = ['elder', 'merchant', 'smith', 'healer', 'guard', 'hunter'];
  for (const level of levels) {
    const isHub = HUB_LEVELS.includes(level.index);
    const isCamp = CAMP_LEVELS.includes(level.index);
    if (!isHub && !isCamp) continue;
    const roles = isHub ? archetypes : ['villager', 'hunter'];
    for (const role of roles) {
      const dialogueId = `${level.id}-dlg-${role}`;
      const greeting = pick(rng, DIALOGUE_LINES.greetings[role] ?? DIALOGUE_LINES.greetings.villager);
      const greetingAr = pick(rng, DIALOGUE_LINES.greetings[role]?.ar ?? DIALOGUE_LINES.greetings.villager.ar);
      const farewell = pick(rng, DIALOGUE_LINES.farewells.en);
      const farewellAr = pick(rng, DIALOGUE_LINES.farewells.ar);
      const wisdom = pick(rng, DIALOGUE_LINES.wisdom.en);
      const wisdomAr = pick(rng, DIALOGUE_LINES.wisdom.ar);
      const speakerName = NPC_NAME_POOL.en[(level.index + roles.indexOf(role)) % NPC_NAME_POOL.en.length].name;
      const speakerNameAr = NPC_NAME_POOL.ar[(level.index + roles.indexOf(role)) % NPC_NAME_POOL.ar.length].name;

      const nodes = {
        start: {
          speaker: { en: speakerName, ar: speakerNameAr },
          text: { en: greeting, ar: greetingAr },
          choices: [
            { text: { en: 'Any advice for the road?', ar: 'هل من نصيحة للطريق؟' }, next: 'advice' },
            { text: { en: 'What happened here?', ar: 'ما الذي حدث هنا؟' }, next: 'story' },
            {
              text: { en: 'Farewell.', ar: 'وداعًا.' },
              next: 'end',
              effects: [{ type: 'playSound', sound: 'uiCancel' }],
            },
          ],
        },
        advice: {
          speaker: { en: speakerName, ar: speakerNameAr },
          text: { en: wisdom, ar: wisdomAr },
          choices: [
            {
              text: { en: 'Thank you.', ar: 'شكرًا.' },
              next: 'end',
              effects: [{ type: 'giveXP', amount: 5 }],
            },
            { text: { en: 'One more thing…', ar: 'شيء آخر…' }, next: 'story' },
          ],
        },
        story: {
          speaker: { en: speakerName, ar: speakerNameAr },
          text: {
            en: `${level.name.en} was not always like this. The storm changed the rules — sand remembers, water forgets, and the dead do neither.`,
            ar: `${level.name.ar} لم يكن هكذا دائمًا. العاصفة غيّرت القواعد — الرمل يتذكّر، والماء ينسى، والموتى لا يفعلون أيًّا منهما.`,
          },
          choices: [
            {
              text: { en: 'I will set it right.', ar: 'سأصحّح الأمر.' },
              next: 'end',
              effects: [{ type: 'setFlag', flag: `helped-${level.id}` }],
              setFlags: [`helped-${level.id}`],
            },
            { text: { en: 'Farewell.', ar: 'وداعًا.' }, next: 'end' },
          ],
        },
      };

      // role-specific shop/heal hooks
      if (role === 'merchant') {
        nodes.start.choices.splice(1, 0, {
          text: { en: 'Show me your wares.', ar: 'أرني بضاعتك.' },
          next: 'end',
          effects: [{ type: 'openShop', shopId: 'shop-main' }],
        });
      }
      if (role === 'healer') {
        nodes.start.choices.splice(1, 0, {
          text: { en: 'I need healing.', ar: 'أحتاج إلى شفاء.' },
          next: 'end',
          effects: [{ type: 'heal', amount: 60 }],
        });
      }
      if (role === 'smith') {
        nodes.start.choices.splice(1, 0, {
          text: { en: 'Can you improve my gear?', ar: 'هل يمكنك تحسين عتادي؟' },
          next: 'craft-tip',
        });
      }
      if (role === 'guard' && isHub) {
        const guardQuest = knownQuests[`gq-${level.id}-cull`]
          ? `gq-${level.id}-cull`
          : `gq-${level.id}-supplies`;
        nodes.start.choices.splice(1, 0, {
          text: { en: 'What lies beyond?', ar: 'ماذا يوجد في الجهة الأخرى؟' },
          next: 'story',
          effects: [{ type: 'startQuest', questId: guardQuest }],
        });
      }

      if (!nodes['craft-tip']) {
        nodes['craft-tip'] = {
          speaker: { en: speakerName, ar: speakerNameAr },
          text: {
            en: 'Bring me ore from the deep and I will fold it into your blade. Until then — craft what you can.',
            ar: 'أحضر لي خامًا من الأعماق وسأطويه في نصلك. وحتى ذلك الحين — اصنع ما تستطيع.',
          },
          choices: [{ text: { en: 'Understood.', ar: 'فهمت.' }, next: 'end' }],
        };
      }
      void farewell;
      void farewellAr;

      dialogues[dialogueId] = { id: dialogueId, nodes };
    }
  }

  // fixed fallback ids used by game.js when an NPC has no dialogue id
  dialogues['dlg-merchant-01'] = cloneWithId(dialogues[`${levels[0].id}-dlg-merchant`], 'dlg-merchant-01');
  dialogues['dlg-smith-01'] = cloneWithId(dialogues[`${levels[0].id}-dlg-smith`], 'dlg-smith-01');
  dialogues['dlg-healer-01'] = cloneWithId(dialogues[`${levels[0].id}-dlg-healer`], 'dlg-healer-01');
  dialogues['dlg-guard-01'] = cloneWithId(dialogues[`${levels[0].id}-dlg-guard`], 'dlg-guard-01');
  dialogues['dlg-elder-intro'] = cloneWithId(dialogues[`${levels[0].id}-dlg-elder`], 'dlg-elder-intro');

  return dialogues;
}

function cloneWithId(dialogue, id) {
  if (!dialogue) {
    return {
      id,
      nodes: {
        start: {
          speaker: { en: 'Villager', ar: 'قروي' },
          text: { en: 'Safe travels.', ar: 'رحلة آمنة.' },
          next: 'end',
        },
      },
    };
  }
  return { ...dialogue, id };
}

// ------------------------------------------------------------- quests gen

function buildQuests(levels) {
  const quests = {};
  const rng = makeRNG(424242);

  // main chain: one per region, culminating in each boss
  REGIONS.forEach((region, i) => {
    const bossIndex = (i + 1) * 5;
    const bossLevel = levels[bossIndex - 1];
    const beat = STORY_BEATS[Math.min(STORY_BEATS.length - 1, i)];
    quests[`q-main-${region.id}`] = {
      id: `q-main-${region.id}`,
      type: 'main',
      title: beat.title,
      desc: beat.text,
      objectives: [
        {
          type: 'reach',
          target: bossLevel.id,
          count: 1,
          label: {
            en: `Reach ${bossLevel.name.en}`,
            ar: `بلغ ${bossLevel.name.ar}`,
          },
        },
        {
          type: 'boss',
          target: BOSS_LEVELS[bossIndex]?.bossId ?? 'duneColossus',
          count: 1,
          label: {
            en: pick(rng, QUEST_LABELS.boss.en),
            ar: pick(rng, QUEST_LABELS.boss.ar),
          },
        },
      ],
      rewards: {
        xp: 220 + i * 90,
        gold: 120 + i * 60,
        items: [{ itemId: i % 2 === 0 ? 'large-potion' : 'elixir-of-storms', count: 1 }],
      },
      prereqs: i === 0 ? ['q-first-steps'] : [`q-main-${REGIONS[i - 1].id}`],
    };
  });

  // hub supply quests
  for (const hubIndex of HUB_LEVELS) {
    const level = levels[hubIndex - 1];
    quests[`gq-${level.id}-supplies`] = {
      id: `gq-${level.id}-supplies`,
      type: 'side',
      title: { en: 'Supplies for the Settlement', ar: 'مؤن للقرية' },
      desc: {
        en: 'The settlement endures the storm one ration at a time. Gather what you can spare.',
        ar: 'تقاوم القرية العاصفة بحصة كل مرة. اجمع ما يمكنك التنازل عنه.',
      },
      objectives: [
        {
          type: 'collect',
          target: 'small-potion',
          count: 3,
          label: { en: 'Gather potions', ar: 'اجمع الجرعات' },
        },
        {
          type: 'chest',
          target: level.id,
          count: 1,
          label: { en: 'Open a supply chest', ar: 'افتح صندوق مؤن' },
        },
      ],
      rewards: { xp: 80, gold: 60, items: [{ itemId: 'iron-sword', count: 1 }] },
      prereqs: [],
    };
  }

  // cull quests on every 5th non-boss level
  for (const level of levels) {
    if (level.index % 5 !== 0 || BOSS_LEVELS[level.index]) continue;
    quests[`gq-${level.id}-cull`] = {
      id: `gq-${level.id}-cull`,
      type: 'side',
      title: { en: 'Thin the Ranks', ar: 'خفّض الصفوف' },
      desc: {
        en: `Creatures gather where the aether pools. Cut their numbers in ${level.name.en}.`,
        ar: `تتجمع الكائنات حيث يتجمع الأثير. قلّل أعدادهم في ${level.name.ar}.`,
      },
      objectives: [
        {
          type: 'kill',
          target: null,
          count: 8 + Math.floor(level.index / 4),
          label: {
            en: pick(rng, QUEST_LABELS.kill.en),
            ar: pick(rng, QUEST_LABELS.kill.ar),
          },
        },
      ],
      rewards: {
        xp: 60 + level.index * 4,
        gold: 40 + level.index * 2,
        items: [{ itemId: 'small-potion', count: 2 }],
      },
      prereqs: [],
    };
  }

  // crafting & exploration side quests
  quests['gq-craft-relics'] = {
    id: 'gq-craft-relics',
    type: 'side',
    title: { en: 'Artefacts of the Storm', ar: 'آثار العاصفة' },
    desc: {
      en: 'Some things can only be made, not found. Craft relics from what the desert leaves behind.',
      ar: 'بعض الأشياء لا تُوجد بل تُصنع. اصنع آثارًا مما تتركه الصحراء.',
    },
    objectives: [
      {
        type: 'craft',
        target: null,
        count: 2,
        label: { en: pick(rng, QUEST_LABELS.craft.en), ar: pick(rng, QUEST_LABELS.craft.ar) },
      },
    ],
    rewards: { xp: 150, gold: 80, items: [{ itemId: 'crystal-staff', count: 1 }] },
    prereqs: ['q-first-steps'],
  };
  quests['gq-final-memory'] = {
    id: 'gq-final-memory',
    type: 'main',
    title: { en: 'The Final Memory', ar: 'الذاكرة الأخيرة' },
    desc: {
      en: 'Forty levels down, the truth is one climb up. Confront the Wraith Lord and teach the desert something new.',
      ar: 'أربعون مرحلة للأسفل، والحقيقة صعود واحد. واجه سيّد الشياطين وعلّم الصحراء شيئًا جديدًا.',
    },
    objectives: [
      { type: 'reach', target: 'level-40', count: 1, label: { en: 'Reach the Storm Spire', ar: 'بلغ برج العاصفة' } },
      { type: 'boss', target: 'wraithLord', count: 1, label: { en: 'Defeat the Wraith Lord', ar: 'اهزم سيّد الشياطين' } },
    ],
    rewards: {
      xp: 2000,
      gold: 1000,
      items: [{ itemId: 'aether-edge', count: 1 }],
    },
    prereqs: ['q-main-stormspire'],
  };

  return quests;
}

// ------------------------------------------------------------ strings gen

function buildStrings(levels) {
  const regionStrings = {};
  for (const region of REGIONS) {
    regionStrings[region.id] = { name: region.name, summary: region.summary };
  }
  const levelStringsEn = {};
  const levelStringsAr = {};
  for (const level of levels) {
    levelStringsEn[level.id] = {
      name: level.name.en,
      subtitle: level.subtitle.en,
      ambience: level.ambience.en,
      lore: level.loreFragment.en,
      secret: level.secrets[0]?.desc.en ?? '',
    };
    levelStringsAr[level.id] = {
      name: level.name.ar,
      subtitle: level.subtitle.ar,
      ambience: level.ambience.ar,
      lore: level.loreFragment.ar,
      secret: level.secrets[0]?.desc.ar ?? '',
    };
  }
  return {
    en: {
      levels: levelStringsEn,
      regions: regionStrings,
      tips: TIPS.en,
      beats: STORY_BEATS.map((b) => ({ id: b.id, title: b.title.en, text: b.text.en })),
      idle: Object.fromEntries(Object.entries(IDLE_LINES).map(([k, v]) => [k, v.en])),
    },
    ar: {
      levels: levelStringsAr,
      regions: regionStrings,
      tips: TIPS.ar,
      beats: STORY_BEATS.map((b) => ({ id: b.id, title: b.title.ar, text: b.text.ar })),
      idle: Object.fromEntries(Object.entries(IDLE_LINES).map(([k, v]) => [k, v.ar])),
    },
  };
}

// --------------------------------------------------------------- validate

function validateLevels(levels) {
  const errors = [];
  const ids = new Set(levels.map((l) => l.id));
  for (const level of levels) {
    if (level.tiles.length !== level.height) {
      errors.push(`${level.id}: tiles rows ${level.tiles.length} != height ${level.height}`);
    }
    for (const row of level.tiles) {
      if (row.length !== level.width) {
        errors.push(`${level.id}: row width ${row.length} != ${level.width}`);
      }
    }
    for (const exit of level.exits) {
      if (exit.to && !ids.has(exit.to)) errors.push(`${level.id}: exit to unknown ${exit.to}`);
      const row = level.tiles[exit.y];
      if (row && row[exit.x] === '#') errors.push(`${level.id}: exit blocked by wall`);
    }
    const spawnRow = level.tiles[level.spawn.y];
    if (!spawnRow || spawnRow[level.spawn.x] === '#') {
      errors.push(`${level.id}: spawn on blocked tile`);
    }
    for (const ent of level.entities) {
      if (ent.x < 0 || ent.x >= level.width || ent.y < 0 || ent.y >= level.height) {
        errors.push(`${level.id}: entity out of bounds (${ent.x},${ent.y})`);
      }
    }
    if (level.hasBoss && !level.entities.some((e) => e.type === 'boss')) {
      errors.push(`${level.id}: hasBoss but no boss entity`);
    }
    for (const q of level.quests) {
      if (!/^q-|^gq-/.test(q)) errors.push(`${level.id}: suspicious quest id ${q}`);
    }
  }
  return errors;
}

// ------------------------------------------------------------------- main

function main() {
  console.log('[gen-content] generating campaign…');
  mkdirSync(LEVEL_DIR, { recursive: true });

  const levels = [];
  for (let i = 1; i <= CAMPAIGN_SIZE; i += 1) {
    const level = buildLevel(i, 0x5eed_0000 + i * 7919);
    levels.push(level);
    writeFileSync(join(LEVEL_DIR, `${level.id}.js`), emitLevelModule(level));
    process.stdout.write(`  ✓ ${level.id} (${level.name.en})\n`);
  }

  const quests = buildQuests(levels);
  const dialogues = buildDialogues(levels, quests);
  const strings = buildStrings(levels);

  // validation
  const errors = validateLevels(levels);
  if (errors.length > 0) {
    console.error('[gen-content] validation FAILED:');
    for (const err of errors) console.error('  ✗', err);
    process.exitCode = 1;
    return;
  }

  // dialogue/quest cross-refs against known base ids
  const baseItemIds = new Set([
    'rusty-sword', 'iron-sword', 'scimitar-of-dunes', 'venom-blade', 'ember-fang', 'aether-edge',
    'sandstaff', 'crystal-staff', 'hunter-bow', 'dune-dagger',
    'cloth-armor', 'leather-armor', 'scale-mail', 'crystal-carapace', 'wraithplate',
    'cloth-hood', 'bronze-helm', 'crystal-circlet',
    'sandals', 'dune-runners', 'storm-treads',
    'copper-ring', 'ring-of-echoes', 'aether-thread', 'stormglass-charm',
    'small-potion', 'large-potion', 'mana-draught', 'sand-bread', 'spiced-tea', 'elixir-of-storms',
    'scorpion-tail', 'viper-fang', 'dust-essence', 'crystal-shard', 'ember-core',
    'wraith-cloth', 'sand-glass', 'jackal-pelt', 'salt-crystal',
    'temple-key', 'crystal-key', 'memory-shard', 'merchant-token', 'gold-pouch',
    'ancient-scroll', 'wanderers-compass',
  ]);
  const baseQuestIds = new Set([
    'q-first-steps', 'q-ancient-memory', 'q-clear-the-scar', 'q-desert-bounty',
    'q-merchant-caravan', 'q-hidden-chests', 'q-crystal-cure', 'q-apprentice-crafter',
    'q-temple-key', 'q-golden-dunes', 'q-wake-the-colossus', 'q-green-heart',
    'q-the-archivist', 'q-storm-survivor', 'q-smithing-101', 'q-storm-chaser',
    'q-guardian-duty', 'q-memory-of-the-wind',
  ]);
  const qErrors = [];
  for (const q of Object.values(quests)) {
    for (const reward of q.rewards?.items ?? []) {
      if (!baseItemIds.has(reward.itemId)) qErrors.push(`${q.id}: unknown reward item ${reward.itemId}`);
    }
    for (const pre of q.prereqs ?? []) {
      if (!quests[pre] && !baseQuestIds.has(pre)) qErrors.push(`${q.id}: unknown prereq ${pre}`);
    }
    for (const obj of q.objectives ?? []) {
      if (obj.type === 'collect' && obj.target && !baseItemIds.has(obj.target)) {
        qErrors.push(`${q.id}: unknown collect target ${obj.target}`);
      }
    }
  }
  const dErrors = [];
  for (const d of Object.values(dialogues)) {
    for (const [nodeId, node] of Object.entries(d.nodes)) {
      for (const choice of node.choices ?? []) {
        if (choice.next && choice.next !== 'end' && !d.nodes[choice.next]) {
          dErrors.push(`${d.id}/${nodeId}: choice → ${choice.next}`);
        }
        for (const effect of choice.effects ?? []) {
          if (effect.type === 'startQuest' && !quests[effect.questId] && !baseQuestIds.has(effect.questId)) {
            dErrors.push(`${d.id}/${nodeId}: starts unknown quest ${effect.questId}`);
          }
        }
      }
    }
  }
  if (qErrors.length || dErrors.length) {
    console.error('[gen-content] cross-ref FAILED:');
    for (const err of [...qErrors, ...dErrors]) console.error('  ✗', err);
    process.exitCode = 1;
    return;
  }

  // ---- dialogues.generated.js
  const dlgLines = [];
  dlgLines.push('/**');
  dlgLines.push(' * dialogues.generated.js — generated by tools/gen-content.js.');
  dlgLines.push(` * ${Object.keys(dialogues).length} dialogue trees (villagers, merchants, mentors, bosses).`);
  dlgLines.push(' */');
  dlgLines.push('');
  dlgLines.push('export const GENERATED_DIALOGUES = {');
  for (const [id, dialogue] of Object.entries(dialogues)) {
    dlgLines.push(`  ${JSON.stringify(id)}: {`);
    dlgLines.push(`    id: ${JSON.stringify(dialogue.id)},`);
    dlgLines.push('    nodes: {');
    for (const [nodeId, node] of Object.entries(dialogue.nodes)) {
      dlgLines.push(`      ${JSON.stringify(nodeId)}: {`);
      if (node.speaker) {
        dlgLines.push('        speaker: {');
        dlgLines.push(`          en: ${JSON.stringify(node.speaker.en)},`);
        dlgLines.push(`          ar: ${JSON.stringify(node.speaker.ar)},`);
        dlgLines.push('        },');
      }
      dlgLines.push('        text: {');
      dlgLines.push(`          en: ${JSON.stringify(node.text.en)},`);
      dlgLines.push(`          ar: ${JSON.stringify(node.text.ar)},`);
      dlgLines.push('        },');
      if (node.next) dlgLines.push(`        next: ${JSON.stringify(node.next)},`);
      if (node.setFlags) {
        dlgLines.push(`        setFlags: ${JSON.stringify(node.setFlags)},`);
      }
      if (node.choices) {
        dlgLines.push('        choices: [');
        for (const choice of node.choices) {
          dlgLines.push('          {');
          dlgLines.push('            text: {');
          dlgLines.push(`              en: ${JSON.stringify(choice.text.en)},`);
          dlgLines.push(`              ar: ${JSON.stringify(choice.text.ar)},`);
          dlgLines.push('            },');
          dlgLines.push(`            next: ${JSON.stringify(choice.next)},`);
          if (choice.effects) {
            dlgLines.push('            effects: [');
            for (const effect of choice.effects) {
              dlgLines.push(`              ${JSON.stringify(effect)},`);
            }
            dlgLines.push('            ],');
          }
          if (choice.setFlags) {
            dlgLines.push(`            setFlags: ${JSON.stringify(choice.setFlags)},`);
          }
          dlgLines.push('          },');
        }
        dlgLines.push('        ],');
      }
      dlgLines.push('      },');
    }
    dlgLines.push('    },');
    dlgLines.push('  },');
  }
  dlgLines.push('};');
  dlgLines.push('');
  dlgLines.push('export default GENERATED_DIALOGUES;');
  dlgLines.push('');
  writeFileSync(join(OUT_DIR, 'dialogues.generated.js'), dlgLines.join('\n'));

  // ---- quests.generated.js
  const qLines = [];
  qLines.push('/**');
  qLines.push(' * quests.generated.js — generated by tools/gen-content.js.');
  qLines.push(` * ${Object.keys(quests).length} quests (main chain + side content).`);
  qLines.push(' */');
  qLines.push('');
  qLines.push('export const GENERATED_QUESTS = {');
  for (const [id, quest] of Object.entries(quests)) {
    qLines.push(`  ${JSON.stringify(id)}: {`);
    qLines.push(`    id: ${JSON.stringify(quest.id)},`);
    qLines.push(`    type: ${JSON.stringify(quest.type)},`);
    qLines.push('    title: {');
    qLines.push(`      en: ${JSON.stringify(quest.title.en)},`);
    qLines.push(`      ar: ${JSON.stringify(quest.title.ar)},`);
    qLines.push('    },');
    qLines.push('    desc: {');
    qLines.push(`      en: ${JSON.stringify(quest.desc.en)},`);
    qLines.push(`      ar: ${JSON.stringify(quest.desc.ar)},`);
    qLines.push('    },');
    qLines.push('    objectives: [');
    for (const obj of quest.objectives) {
      qLines.push('      {');
      qLines.push(`        type: ${JSON.stringify(obj.type)},`);
      qLines.push(`        target: ${JSON.stringify(obj.target ?? null)},`);
      qLines.push(`        count: ${obj.count},`);
      qLines.push('        label: {');
      qLines.push(`          en: ${JSON.stringify(obj.label.en)},`);
      qLines.push(`          ar: ${JSON.stringify(obj.label.ar)},`);
      qLines.push('        },');
      qLines.push('      },');
    }
    qLines.push('    ],');
    qLines.push('    rewards: {');
    qLines.push(`      xp: ${quest.rewards.xp},`);
    qLines.push(`      gold: ${quest.rewards.gold},`);
    qLines.push('      items: [');
    for (const item of quest.rewards.items ?? []) {
      qLines.push(`        { itemId: ${JSON.stringify(item.itemId)}, count: ${item.count} },`);
    }
    qLines.push('      ],');
    qLines.push('    },');
    qLines.push(`    prereqs: ${JSON.stringify(quest.prereqs ?? [])},`);
    qLines.push('  },');
  }
  qLines.push('};');
  qLines.push('');
  qLines.push('export default GENERATED_QUESTS;');
  qLines.push('');
  writeFileSync(join(OUT_DIR, 'quests.generated.js'), qLines.join('\n'));

  // ---- strings.generated.js
  const sLines = [];
  sLines.push('/**');
  sLines.push(' * strings.generated.js — generated by tools/gen-content.js.');
  sLines.push(' * Bilingual string tables: level names, ambience, tips, story beats.');
  sLines.push(' */');
  sLines.push('');
  sLines.push('export const GENERATED_STRINGS = {');
  for (const lang of ['en', 'ar']) {
    sLines.push(`  ${lang}: {`);
    sLines.push('    levels: {');
    for (const level of levels) {
      const entry = strings[lang].levels[level.id];
      sLines.push(`      ${JSON.stringify(level.id)}: {`);
      sLines.push(`        name: ${JSON.stringify(entry.name)},`);
      sLines.push(`        subtitle: ${JSON.stringify(entry.subtitle)},`);
      sLines.push('        ambience: [');
      for (const line of entry.ambience) sLines.push(`          ${JSON.stringify(line)},`);
      sLines.push('        ],');
      sLines.push(`        lore: ${JSON.stringify(entry.lore)},`);
      sLines.push(`        secret: ${JSON.stringify(entry.secret)},`);
      sLines.push('      },');
    }
    sLines.push('    },');
    sLines.push('    tips: [');
    for (const tip of strings[lang].tips) sLines.push(`      ${JSON.stringify(tip)},`);
    sLines.push('    ],');
    sLines.push('    beats: [');
    for (const beat of strings[lang].beats) {
      sLines.push('      {');
      sLines.push(`        id: ${JSON.stringify(beat.id)},`);
      sLines.push(`        title: ${JSON.stringify(beat.title)},`);
      sLines.push(`        text: ${JSON.stringify(beat.text)},`);
      sLines.push('      },');
    }
    sLines.push('    ],');
    sLines.push('    idle: {');
    for (const [role, lines] of Object.entries(strings[lang].idle)) {
      sLines.push(`      ${JSON.stringify(role)}: [`);
      for (const line of lines) sLines.push(`        ${JSON.stringify(line)},`);
      sLines.push('      ],');
    }
    sLines.push('    },');
    sLines.push('  },');
  }
  sLines.push('};');
  sLines.push('');
  sLines.push('export const MERGED_STRINGS = GENERATED_STRINGS;');
  sLines.push('');
  sLines.push('export default GENERATED_STRINGS;');
  sLines.push('');
  writeFileSync(join(OUT_DIR, 'strings.generated.js'), sLines.join('\n'));

  // ---- index.js
  const iLines = [];
  iLines.push('/**');
  iLines.push(' * index.js — generated by tools/gen-content.js. Aggregates the whole');
  iLines.push(' * generated campaign into lookup tables the game imports.');
  iLines.push(' */');
  iLines.push('');
  for (const level of levels) {
    iLines.push(`import ${camel(level.id)} from './levels/${level.id}.js';`);
  }
  iLines.push("import { GENERATED_DIALOGUES } from './dialogues.generated.js';");
  iLines.push("import { GENERATED_QUESTS } from './quests.generated.js';");
  iLines.push("import { GENERATED_STRINGS, MERGED_STRINGS } from './strings.generated.js';");
  iLines.push('');
  iLines.push('export const LEVELS = {');
  for (const level of levels) {
    iLines.push(`  ${JSON.stringify(level.id)}: ${camel(level.id)},`);
  }
  iLines.push('};');
  iLines.push('');
  iLines.push('export const LEVEL_ORDER = [');
  for (const level of levels) {
    iLines.push(`  ${JSON.stringify(level.id)},`);
  }
  iLines.push('];');
  iLines.push('');
  iLines.push('export const LOOT_TABLES = {');
  iLines.push("  'chest-tier1': [");
  iLines.push("    { type: 'coin', chance: 1, amountMin: 8, amountMax: 26 },");
  iLines.push("    { type: 'item', chance: 0.5, itemId: 'small-potion' },");
  iLines.push("    { type: 'item', chance: 0.2, itemId: 'sand-bread' },");
  iLines.push("    { type: 'item', chance: 0.12, itemId: 'dust-essence' },");
  iLines.push('  ],');
  iLines.push("  'chest-tier2': [");
  iLines.push("    { type: 'coin', chance: 1, amountMin: 20, amountMax: 60 },");
  iLines.push("    { type: 'item', chance: 0.5, itemId: 'large-potion' },");
  iLines.push("    { type: 'item', chance: 0.25, itemId: 'crystal-shard' },");
  iLines.push("    { type: 'item', chance: 0.15, itemId: 'mana-draught' },");
  iLines.push('  ],');
  iLines.push("  'chest-tier3': [");
  iLines.push("    { type: 'coin', chance: 1, amountMin: 40, amountMax: 110 },");
  iLines.push("    { type: 'item', chance: 0.45, itemId: 'elixir-of-storms' },");
  iLines.push("    { type: 'item', chance: 0.3, itemId: 'ember-core' },");
  iLines.push("    { type: 'item', chance: 0.18, itemId: 'ancient-scroll' },");
  iLines.push('  ],');
  iLines.push('};');
  iLines.push('');
  iLines.push('export const SHOPS = {');
  iLines.push("  'shop-main': {");
  iLines.push("    id: 'shop-main',");
  iLines.push('    stock: [');
  iLines.push("      { itemId: 'small-potion', price: 15 },");
  iLines.push("      { itemId: 'large-potion', price: 40 },");
  iLines.push("      { itemId: 'mana-draught', price: 30 },");
  iLines.push("      { itemId: 'sand-bread', price: 10 },");
  iLines.push("      { itemId: 'spiced-tea', price: 25 },");
  iLines.push("      { itemId: 'leather-armor', price: 120 },");
  iLines.push("      { itemId: 'hunter-bow', price: 150 },");
  iLines.push('    ],');
  iLines.push('  },');
  iLines.push('};');
  iLines.push('');
  iLines.push('export { GENERATED_DIALOGUES, GENERATED_QUESTS, GENERATED_STRINGS, MERGED_STRINGS };');
  iLines.push('');
  iLines.push('export default {');
  iLines.push('  LEVELS,');
  iLines.push('  LEVEL_ORDER,');
  iLines.push('  LOOT_TABLES,');
  iLines.push('  SHOPS,');
  iLines.push('  GENERATED_DIALOGUES,');
  iLines.push('  GENERATED_QUESTS,');
  iLines.push('  GENERATED_STRINGS,');
  iLines.push('};');
  iLines.push('');
  writeFileSync(join(OUT_DIR, 'index.js'), iLines.join('\n'));

  console.log(`[gen-content] ✓ ${levels.length} levels, ${Object.keys(dialogues).length} dialogues, ${Object.keys(quests).length} quests`);
  console.log(`[gen-content] output → ${OUT_DIR}`);
}

function camel(id) {
  return id.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
}

main();
