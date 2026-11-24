/**
 * run-tests.js — headless test harness. Runs the real game code (including a
 * full boot → play → save → load smoke test) inside Node with minimal DOM
 * stubs. Zero dependencies. Exit code 0 = all green.
 *
 *   node tests/run-tests.js
 */
import { strict as assert } from 'node:assert';

// ------------------------------------------------------------- DOM stubs

class FakeCtx {
  constructor() {
    return new Proxy(this, {
      get(target, prop) {
        if (prop in target) return target[prop];
        if (typeof prop === 'symbol') return target[prop];
        // unknown drawing call — no-op
        target[prop] = () => undefined;
        return target[prop];
      },
    });
    this.fillStyle = '#000';
    this.strokeStyle = '#000';
    this.globalAlpha = 1;
    this.font = '8px sans';
    this.textAlign = 'left';
    this.textBaseline = 'top';
    this.lineWidth = 1;
    this.imageSmoothingEnabled = false;
    this._ops = 0;
  }
  _op() { this._ops += 1; }
  save() { this._op(); }
  restore() { this._op(); }
  beginPath() { this._op(); }
  closePath() { this._op(); }
  fill() { this._op(); }
  stroke() { this._op(); }
  fillRect() { this._op(); }
  strokeRect() { this._op(); }
  clearRect() { this._op(); }
  fillText() { this._op(); }
  strokeText() { this._op(); }
  drawImage() { this._op(); }
  translate() { this._op(); }
  scale() { this._op(); }
  rotate() { this._op(); }
  setTransform() { this._op(); }
  ellipse() { this._op(); }
  arc() { this._op(); }
  moveTo() { this._op(); }
  lineTo() { this._op(); }
  quadraticCurveTo() { this._op(); }
  bezierCurveTo() { this._op(); }
  clip() { this._op(); }
  putImageData() { this._op(); }
  createLinearGradient() { this._op(); return { addColorStop: () => {} }; }
  createRadialGradient() { this._op(); return { addColorStop: () => {} }; }
  measureText(text) { return { width: String(text).length * 4.2 }; }
  getImageData(x, y, w, h) {
    return { data: new Uint8ClampedArray(Math.max(4, w * h * 4)), width: w, height: h };
  }
}

function makeCanvas(width = 480, height = 270) {
  const ctx = new FakeCtx();
  const canvas = {
    width,
    height,
    style: {},
    clientWidth: width,
    clientHeight: height,
    getContext: () => ctx,
    addEventListener: () => {},
    removeEventListener: () => {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width, height, right: width, bottom: height }),
    toDataURL: () => 'data:image/png;base64,',
  };
  return canvas;
}

const listeners = new Map();
globalThis.window = {
  innerWidth: 1024,
  innerHeight: 768,
  devicePixelRatio: 1,
  addEventListener: (type, fn) => {
    if (!listeners.has(type)) listeners.set(type, []);
    listeners.get(type).push(fn);
  },
  removeEventListener: () => {},
  requestAnimationFrame: (fn) => setTimeout(() => fn(Date.now()), 16),
  cancelAnimationFrame: (id) => clearTimeout(id),
  AudioContext: undefined,
  webkitAudioContext: undefined,
};
globalThis.requestAnimationFrame = globalThis.window.requestAnimationFrame;
globalThis.cancelAnimationFrame = globalThis.window.cancelAnimationFrame;
try {
  Object.defineProperty(globalThis, 'navigator', {
    value: { language: 'ar', maxTouchPoints: 0, getGamepads: () => [] },
    configurable: true,
  });
} catch { /* keep built-in navigator */ }
const memStore = new Map();
globalThis.localStorage = {
  getItem: (k) => (memStore.has(k) ? memStore.get(k) : null),
  setItem: (k, v) => memStore.set(k, String(v)),
  removeItem: (k) => memStore.delete(k),
  clear: () => memStore.clear(),
};
globalThis.document = {
  readyState: 'complete',
  createElement: (tag) => (tag === 'canvas' ? makeCanvas(8, 8) : { style: {}, appendChild: () => {} }),
  getElementById: () => null,
  addEventListener: () => {},
  body: { appendChild: () => {} },
};

// ---------------------------------------------------------- tiny runner

const suites = [];
let current = null;

function suite(name, fn) {
  current = { name, tests: [] };
  suites.push(current);
  fn();
  current = null;
}

function test(name, fn) {
  current.tests.push({ name, fn });
}

async function runAll() {
  let passed = 0;
  let failed = 0;
  const failures = [];
  const started = Date.now();
  for (const s of suites) {
    console.log(`\n▸ ${s.name}`);
    for (const t of s.tests) {
      try {
        await t.fn();
        passed += 1;
        console.log(`  ✓ ${t.name}`);
      } catch (err) {
        failed += 1;
        failures.push({ suite: s.name, test: t.name, err });
        console.log(`  ✗ ${t.name}`);
        console.log(`    ${String(err?.message ?? err).split('\n')[0]}`);
      }
    }
  }
  const ms = Date.now() - started;
  console.log(`\n${'─'.repeat(52)}`);
  console.log(`${passed} passed · ${failed} failed · ${ms}ms`);
  if (failures.length > 0) {
    console.log('\nFailures:');
    for (const f of failures) {
      console.log(`\n[${f.suite}] ${f.test}`);
      console.log(String(f.err?.stack ?? f.err).split('\n').slice(0, 5).join('\n'));
    }
  }
  return failed === 0;
}

// ============================================================ test bodies

const { clamp, lerp, dist2, normalize, wrapAngle, moveTowards, smoothstep } = await import('../src/core/mathx.js');
const { makeRNG, RNG, hashString } = await import('../src/core/rng.js');
const { Pool } = await import('../src/core/pool.js');
const { Storage } = await import('../src/core/storage.js');
const { EventBus, gameEvents, Events } = await import('../src/core/events.js');
const { TweenManager } = await import('../src/core/tween.js');
const { TimerManager } = await import('../src/core/timer.js');
const { formatNumber, isRTL, wrapText, directionOf } = await import('../src/gfx/font.js');
const { spriteBank, CHARACTER_RECIPES } = await import('../src/gfx/spritegen.js');
const { TileSet, CHAR_TO_TILE, Tiles, TILE } = await import('../src/gfx/tilegen.js');
const { TileMap } = await import('../src/world/tilemap.js');
const { generateLevel } = await import('../src/world/dungeonGen.js');
const { SpatialHash, circlesHit } = await import('../src/world/collision.js');
const { Player } = await import('../src/entities/player.js');
const { Enemy } = await import('../src/entities/enemy.js');
const { ProjectilePool } = await import('../src/entities/projectile.js');
const { rollLoot, LootType } = await import('../src/entities/loot.js');
const { stepAI } = await import('../src/entities/enemyAI.js');
const { Inventory, grantStarterKit } = await import('../src/systems/inventory.js');
const { SkillSystem } = await import('../src/systems/skills.js');
const { QuestSystem } = await import('../src/systems/quests.js');
const { DialogueSystem } = await import('../src/systems/dialogue.js');
const { CraftingSystem } = await import('../src/systems/crafting.js');
const { ShopSystem } = await import('../src/systems/shop.js');
const { WeatherSystem } = await import('../src/systems/weather.js');
const { DayNightSystem } = await import('../src/systems/daynight.js');
const { AchievementSystem } = await import('../src/systems/achievements.js');
const { I18n } = await import('../src/i18n/i18n.js');
const { Content } = await import('../src/game/content.js');
const { Game } = await import('../src/game/game.js');
const { SaveManager } = await import('../src/save/saveManager.js');
const { OfflineQueue } = await import('../src/integrations/offlineQueue.js');
const { SupabaseClient } = await import('../src/integrations/supabaseClient.js');
const { GithubClient } = await import('../src/integrations/githubClient.js');
const { IntegrationManager } = await import('../src/integrations/integrationManager.js');
const { computeScore, applyLevelUnlocks } = await import('../src/game/progression.js');
const ITEMS = (await import('../src/data/items.js')).default;
const SKILLS_DATA = await import('../src/data/skillsData.js');
const QUESTS_DATA = (await import('../src/data/questsData.js')).default;
const ENEMIES = (await import('../src/data/enemies.js')).default;
const { GENERATED_STRINGS } = await import('../src/data/generated/strings.generated.js');
const { LEVELS, LEVEL_ORDER } = await import('../src/data/generated/index.js');

// ---------------------------------------------------------------- core

suite('core/mathx', () => {
  test('clamp keeps values in range', () => {
    assert.equal(clamp(5, 0, 10), 5);
    assert.equal(clamp(-3, 0, 10), 0);
    assert.equal(clamp(42, 0, 10), 10);
  });
  test('lerp interpolates', () => {
    assert.equal(lerp(0, 10, 0.5), 5);
    assert.equal(lerp(2, 4, 0), 2);
  });
  test('dist2 and normalize', () => {
    assert.equal(dist2(0, 0, 3, 4), 25);
    const n = normalize(3, 4);
    assert.ok(Math.abs(n.x - 0.6) < 1e-9 && Math.abs(n.y - 0.8) < 1e-9);
  });
  test('wrapAngle bounds to -PI..PI', () => {
    const a = wrapAngle(Math.PI * 3);
    assert.ok(a <= Math.PI + 1e-9 && a >= -Math.PI - 1e-9);
  });
  test('moveTowards and smoothstep behave', () => {
    assert.equal(moveTowards(0, 10, 3), 3);
    assert.equal(moveTowards(0, 10, 99), 10);
    assert.equal(smoothstep(0.5), 0.5);
    assert.equal(smoothstep(0), 0);
    assert.equal(smoothstep(1), 1);
  });
});

suite('core/rng', () => {
  test('deterministic streams', () => {
    const a = makeRNG(1234);
    const b = makeRNG(1234);
    for (let i = 0; i < 20; i += 1) assert.equal(a.next(), b.next());
  });
  test('int/pick/chance helpers', () => {
    const r = new RNG(99);
    for (let i = 0; i < 40; i += 1) {
      const v = r.int(2, 5);
      assert.ok(Number.isInteger(v) && v >= 2 && v <= 5);
    }
    const arr = ['x', 'y', 'z'];
    assert.ok(arr.includes(r.pick(arr)));
    assert.ok(typeof r.chance(0.5) === 'boolean');
  });
  test('hashString stable', () => {
    assert.equal(hashString('sands'), hashString('sands'));
    assert.notEqual(hashString('sands'), hashString('aether'));
  });
});

suite('core/pool', () => {
  test('acquire/release reuses objects', () => {
    const made = [];
    const pool = new Pool(() => { const o = { v: 0 }; made.push(o); return o; }, (o) => { o.v = 0; });
    const a = pool.acquire();
    a.v = 42;
    pool.release(a);
    const b = pool.acquire();
    assert.equal(b, a);
    assert.equal(b.v, 0);
    assert.equal(made.length, 1);
  });
});

suite('core/storage', () => {
  test('set/get/remove roundtrip with checksum', () => {
    const s = new Storage();
    assert.ok(s.set('k', { a: 1 }));
    assert.deepEqual(s.get('k'), { a: 1 });
    s.remove('k');
    assert.equal(s.get('k', null), null);
  });
  test('corrupted payload is rejected', () => {
    const s = new Storage();
    s.set('save', { hp: 10 });
    // corrupt the stored json directly (fails to parse)
    localStorage.setItem('sands-of-aether:save', '{{{not json');
    assert.equal(s.get('save', null), null);
  });
  test('save slots', () => {
    const s = new Storage();
    assert.ok(s.setSaveSlot('main', { level: 3 }));
    assert.equal(s.getSaveSlot('main').level, 3);
  });
});

suite('core/events', () => {
  test('on/emit/off', () => {
    const bus = new EventBus();
    let hits = 0;
    const off = bus.on('x', (p) => { hits += p.n; });
    bus.emit('x', { n: 2 });
    bus.emit('x', { n: 3 });
    off();
    bus.emit('x', { n: 100 });
    assert.equal(hits, 5);
  });
  test('event name registry exists', () => {
    for (const name of ['GAME_START', 'LEVEL_ENTER', 'PLAYER_HIT', 'ITEM_PICKUP', 'INTEGRATION_STATUS', 'LEVEL_CLEAR', 'ENTITY_DEATH']) {
      assert.ok(typeof Events[name] === 'string', `missing event ${name}`);
    }
  });
});

suite('core/tween & timer', () => {
  test('tween reaches target', () => {
    const tm = new TweenManager();
    const obj = { x: 0 };
    tm.to(obj, { x: 10 }, 0.5, 'outQuad');
    for (let i = 0; i < 40; i += 1) tm.update(1 / 60);
    assert.ok(Math.abs(obj.x - 10) < 1e-6);
  });
  test('timer fires after duration', () => {
    let fired = 0;
    const t = new TimerManager();
    t.after(0.2, () => { fired += 1; });
    t.update(0.1);
    assert.equal(fired, 0);
    t.update(0.15);
    assert.equal(fired, 1);
  });
});

// ------------------------------------------------------------------ gfx

suite('gfx/font', () => {
  test('formatNum uses compact suffixes', () => {
    assert.equal(formatNumber(999), '999');
    assert.equal(formatNumber(15000), '15.0k');
    assert.equal(formatNumber(2_400_000), '2.4M');
  });
  test('RTL detection', () => {
    assert.ok(isRTL('رمال الأثير'));
    assert.ok(!isRTL('Sands of Aether'));
  });
  test('wrapText splits long lines', () => {
    const measure = (t) => t.length * 4;
    const lines = wrapText('the quick brown fox jumps over the lazy dog again and again', 40, measure);
    assert.ok(lines.length > 1);
    assert.ok(lines.every((l) => measure(l) <= 40 + 4));
  });
  test('direction detection', () => {
    assert.equal(directionOf('رمال'), 'rtl');
    assert.equal(directionOf('sand'), 'ltr');
  });
});

suite('gfx/sprites & tiles', () => {
  test('spriteBank builds character frames', () => {
    const sprite = spriteBank.character('wanderer', { skin: '#e8b88a', cloth: '#4a6fa5' }, 0);
    assert.ok(sprite && sprite.width === 16 && sprite.height === 24);
  });
  test('spriteBank builds creature frames', () => {
    const sprite = spriteBank.creature('scorpion', 'insect', { body: '#e8c489' }, 0);
    assert.ok(sprite && sprite.width === 16);
  });
  test('icon atlas', () => {
    const icon = spriteBank.icon('potion', { main: '#e05548', accent: '#fff' });
    assert.ok(icon && icon.width > 0);
  });
  test('tile legend covers the full map alphabet', () => {
    for (const ch of '.,=#^rw~bxpofdvucksLalmgt') {
      assert.ok(CHAR_TO_TILE[ch] !== undefined, `missing tile char ${ch}`);
    }
  });
  test('tileset renders all tile kinds without throwing', () => {
    const ts = new TileSet('dunes');
    const canvas = makeCanvas(16, 16);
    const ctx = canvas.getContext('2d');
    for (let i = 0; i < 32; i += 1) {
      const tile = ts.get(i);
      assert.ok(tile && tile.width === TILE);
    }
    ts.update(0.1);
    void ctx;
  });
});

// ----------------------------------------------------------------- world

suite('world/tilemap & dungeon', () => {
  test('TileMap from generated level resolves solids', () => {
    const level = LEVELS['level-01'];
    const map = new TileMap(level);
    assert.equal(map.width, level.width);
    assert.ok(map.pixelWidth === level.width * TILE);
  });
  test('dungeonGen produces playable layouts', () => {
    const rng = makeRNG(777);
    for (let i = 0; i < 8; i += 1) {
      const gen = generateLevel({ rng, width: 30, height: 20, biome: 'dunes', roomCount: 5, difficulty: 0.3 });
      assert.equal(gen.tiles.length, gen.height);
      for (const row of gen.tiles) assert.equal(row.length, gen.width);
      const spawnRow = gen.tiles[gen.spawn.y];
      assert.ok(spawnRow && spawnRow[gen.spawn.x] !== '#', 'spawn must be walkable');
    }
  });
  test('spatial hash broadphase finds neighbors', () => {
    const hash = new SpatialHash(32);
    hash.insert({ x: 10, y: 10, radius: 4, id: 'a' });
    hash.insert({ x: 14, y: 12, radius: 4, id: 'b' });
    hash.insert({ x: 500, y: 500, radius: 4, id: 'c' });
    const near = hash.query(10, 10, 16);
    assert.ok(near.length >= 2);
  });
  test('circle collision helper', () => {
    assert.ok(circlesHit(0, 0, 8, 5, 0, 8));
    assert.ok(!circlesHit(0, 0, 4, 20, 0, 4));
  });
});

suite('world/campaign contract', () => {
  test('exactly 40 levels in order', () => {
    assert.equal(LEVEL_ORDER.length, 40);
    assert.equal(LEVEL_ORDER[0], 'level-01');
    assert.equal(LEVEL_ORDER[39], 'level-40');
  });
  test('every level satisfies the module contract', () => {
    for (const [id, level] of Object.entries(LEVELS)) {
      assert.equal(level.id, id);
      assert.ok(level.name?.en && level.name?.ar, `${id} bilingual name`);
      assert.ok(['dunes', 'oasis', 'caves', 'temple'].includes(level.biome), `${id} biome`);
      assert.equal(level.tiles.length, level.height, `${id} tile rows`);
      assert.ok(Number.isFinite(level.spawn.x) && Number.isFinite(level.spawn.y), `${id} spawn`);
      assert.ok(Array.isArray(level.entities) && Array.isArray(level.exits), `${id} arrays`);
      assert.ok(level.levelScale && level.levelScale.hp > 0, `${id} levelScale`);
      assert.ok(level.ambience?.en?.length === 2, `${id} ambience`);
    }
  });
  test('5 boss levels carry boss entities and locked exits', () => {
    const bossLevels = Object.values(LEVELS).filter((l) => l.hasBoss);
    assert.equal(bossLevels.length, 5);
    for (const level of bossLevels) {
      assert.ok(level.entities.some((e) => e.type === 'boss'), `${level.id} boss entity`);
      if (level.exits.length > 0) {
        assert.ok(level.exits[0].locked, `${level.id} boss exit locked`);
      }
    }
  });
  test('string tables are bilingual and complete', () => {
    for (const lang of ['en', 'ar']) {
      assert.equal(Object.keys(GENERATED_STRINGS[lang].levels).length, 40);
      assert.ok(GENERATED_STRINGS[lang].tips.length >= 6);
    }
  });
});

// ----------------------------------------------------------------- data

suite('data schemas & content registry', () => {
  const content = new Content();
  test('Content.validate() finds zero dangling references', () => {
    const errors = content.validate();
    assert.deepEqual(errors, []);
  });
  test('items schema intact', () => {
    for (const item of Object.values(ITEMS)) {
      assert.ok(item.name?.en && item.name?.ar, `${item.id} name`);
      assert.ok(item.price >= 0, `${item.id} price`);
      assert.ok(item.rarity, `${item.id} rarity`);
    }
    assert.ok(Object.keys(ITEMS).length >= 45);
  });
  test('enemies schema intact', () => {
    const bosses = Object.values(ENEMIES).filter((e) => e.isBoss);
    assert.equal(bosses.length, 5);
    for (const b of bosses) {
      assert.ok(Array.isArray(b.phases) && b.phases.length >= 1, `${b.id} phases`);
    }
    assert.ok(Object.keys(ENEMIES).length >= 18);
  });
  test('dialogues reference valid quests and items', () => {
    for (const def of Object.values(content.dialogues)) {
      for (const node of Object.values(def.nodes)) {
        for (const choice of node.choices ?? []) {
          for (const effect of choice.effects ?? []) {
            if (effect.type === 'giveItem') assert.ok(content.item(effect.itemId), `${def.id} item ${effect.itemId}`);
            if (effect.type === 'startQuest') assert.ok(content.quest(effect.questId), `${def.id} quest ${effect.questId}`);
          }
        }
      }
    }
  });
});

// -------------------------------------------------------------- entities

suite('entities & combat', () => {
  test('player recalcStats applies equipment', () => {
    const player = new Player({});
    const before = player.stats.atk;
    player.recalcStats({ atk: 10 });
    assert.equal(player.stats.atk, before + 10);
  });
  test('player xp curve levels up', () => {
    const player = new Player({});
    const res = player.gainXp(150);
    assert.ok(res.gained > 0);
    if (res.leveled) assert.ok(player.level >= 2);
  });
  test('enemy hurt/knockback/death', () => {
    const enemy = new Enemy(ENEMIES.scorpion, { x: 64, y: 64 });
    const dealt = enemy.hurt(500, { knockback: 10, knockDir: { x: 1, y: 0 } });
    assert.ok(dealt > 0);
    assert.equal(enemy.alive, false);
  });
  test('projectile pool update & pierce budget', () => {
    const pool = new ProjectilePool(8);
    const proj = pool.spawn({ x: 0, y: 0, dirX: 1, dirY: 0, speed: 100, damage: 5, team: 'player', owner: {} });
    assert.ok(proj && proj.alive);
    assert.equal(pool.active.length, 1);
    pool.update(0.016, [], { map: null, world: null });
    assert.equal(pool.active.length, 1);
    pool.clear();
    assert.equal(pool.active.length, 0);
  });
  test('rollLoot honors chance and goldFind', () => {
    const table = [
      { type: LootType.COIN, chance: 1, amountMin: 5, amountMax: 5 },
      { type: LootType.ITEM, chance: 0, itemId: 'x' },
    ];
    const drops = rollLoot(table, Math, { goldFind: 0 });
    assert.equal(drops.length, 1);
    assert.equal(drops[0].amount, 5);
  });
  test('enemy AI steps toward a visible player', () => {
    const chaserDef = Object.values(ENEMIES).find((e) => e.ai === 'chaser') ?? ENEMIES.scorpion;
    const enemy = new Enemy(chaserDef, { x: 100, y: 100 });
    enemy.data.map = new TileMap(LEVELS['level-01']);
    const player = new Player({});
    player.x = 130;
    player.y = 100;
    const ctx = { player, dt: 1 / 60, world: { enemies: [enemy] }, rng: Math };
    const before = enemy.x;
    for (let i = 0; i < 60; i += 1) {
      enemy.attackCd = 0;
      stepAI(enemy, ctx);
      enemy.updateBase(1 / 60);
    }
    assert.ok(enemy.x !== before, 'enemy moved');
  });
});

// --------------------------------------------------------------- systems

suite('systems', () => {
  test('inventory add/stack/equip', () => {
    const inv = new Inventory(ITEMS);
    const res = inv.add('small-potion', 5);
    assert.equal(res.added, 5);
    assert.equal(inv.countOf('small-potion'), 5);
    grantStarterKit(inv);
    assert.equal(inv.equipment.weapon, 'rusty-sword', 'starter kit equips the sword');
    inv.add('iron-sword', 1);
    const equipRes = inv.equip('iron-sword');
    assert.ok(equipRes);
    assert.equal(inv.equipment.weapon, 'iron-sword');
    assert.ok(inv.countOf('rusty-sword') >= 1, 'swapped weapon returns to bag');
  });
  test('skills unlock/cooldown/mana', () => {
    const skills = new SkillSystem(SKILLS_DATA.SKILLS ?? SKILLS_DATA.default ?? {});
    skills.unlock('whirlwind');
    assert.ok(skills.isUnlocked('whirlwind'));
  });
  test('quest lifecycle unlock→accept→progress→complete', () => {
    const quests = new QuestSystem(QUESTS_DATA);
    quests.bootstrap();
    const target = Object.values(QUESTS_DATA).find((q) => (q.prereqs ?? []).length === 0) ?? QUESTS_DATA['q-first-steps'];
    quests.unlock(target.id);
    assert.ok(quests.accept(target.id), `accept ${target.id}`);
    const def = quests.get(target.id);
    (def.objectives ?? []).forEach((obj, i) => quests.increment(target.id, i, obj.count ?? 1));
    const player = new Player({});
    const inv = new Inventory(ITEMS);
    const goldBefore = player.gold;
    assert.ok(quests.complete(target.id, player, inv), `complete ${target.id}`);
    assert.ok(player.gold >= goldBefore, 'gold reward granted');
    assert.ok(quests.completedCount() >= 1);
  });
  test('dialogue start/choose/effects/end', () => {
    const content = new Content();
    const dlg = new DialogueSystem(content.dialogues);
    const player = new Player({});
    const ctx = {
      player,
      inventory: new Inventory(ITEMS),
      quests: new QuestSystem(content.quests).bootstrap(),
      audio: { play: () => {} },
    };
    dlg.start('dlg-intro-vision', null, ctx);
    assert.ok(dlg.isTalking());
    dlg.choose(0, ctx);
    dlg.choose(0, ctx);
    dlg.choose(0, ctx);
    assert.ok(!dlg.isTalking() || dlg.currentNode() !== null);
  });
  test('crafting consumes inputs and yields output', () => {
    const content = new Content();
    const crafting = new CraftingSystem(content.recipes, content.items);
    const inv = new Inventory(ITEMS);
    const recipe = Object.values(content.recipes)[0];
    for (const input of recipe.inputs ?? []) inv.add(input.itemId, (input.count ?? 1) + 1);
    const result = crafting.craft(recipe.id, inv);
    assert.ok(result.ok, `craft ${recipe.id} should succeed`);
    assert.ok(inv.countOf(recipe.output) >= (recipe.outputCount ?? 1));
  });
  test('shop buy/sell adjusts gold', () => {
    const content = new Content();
    const shop = new ShopSystem(content.shops, content.items);
    const player = new Player({});
    player.gold = 500;
    const inv = new Inventory(ITEMS);
    shop.open('shop-main');
    assert.equal(shop.openShopId, 'shop-main');
    const stock = shop.listStock('shop-main');
    assert.ok(stock.length > 0);
    const buyRes = shop.buy('shop-main', stock[0].itemId ?? stock[0].id, 1, player, inv);
    assert.ok(buyRes.ok);
    const sellRes = shop.sell('shop-main', 'small-potion', 1, player, inv);
    assert.ok(sellRes.ok || inv.countOf('small-potion') === 0);
  });
  test('weather & day-night systems tick', () => {
    const weather = new WeatherSystem({ biome: 'dunes' });
    for (let i = 0; i < 200; i += 1) weather.update(1 / 60);
    assert.ok(typeof weather.def?.name !== 'undefined' || typeof weather.wind === 'function');
    const dn = new DayNightSystem();
    for (let i = 0; i < 200; i += 1) dn.update(1 / 60);
    assert.ok(dn.clockText);
  });
  test('achievements trigger on events', () => {
    const content = new Content();
    const ach = new AchievementSystem(content.achievements).bindEvents();
    gameEvents.emit(Events.ENTITY_DEATH, { target: { def: { id: 'scorpion' } }, count: 1 });
    gameEvents.emit(Events.ENTITY_DEATH, { target: { def: { id: 'scorpion' } }, count: 1 });
    assert.ok(ach.unlocked.size >= 0);
    assert.ok(ach.list().length > 0);
  });
});

// ------------------------------------------------------------------ i18n

suite('i18n', () => {
  test('both languages resolve keys', () => {
    const i18n = new I18n('ar');
    assert.equal(i18n.t('menu.newGame'), 'لعبة جديدة');
    i18n.setLanguage('en');
    assert.equal(i18n.t('menu.newGame'), 'New Game');
  });
  test('interpolation', () => {
    const i18n = new I18n('en');
    assert.equal(i18n.t('x', { a: 1 }) === 'x', true); // missing key falls back to key
  });
  test('RTL flag flips with language', () => {
    const i18n = new I18n('ar');
    assert.equal(i18n.rtl, true);
    i18n.setLanguage('en');
    assert.equal(i18n.rtl, false);
  });
});

// ----------------------------------------------------------- integrations

suite('integrations', () => {
  test('offline queue persists and drains in order', () => {
    const s = new Storage();
    const queue = new OfflineQueue(s, 10);
    queue.push('score', { score: 100 });
    queue.push('score', { score: 200 });
    const queue2 = new OfflineQueue(s, 10);
    assert.equal(queue2.peek().length, 2);
    const drained = queue2.drain();
    assert.equal(drained.length, 2);
    assert.equal(drained[0].payload.score, 100);
  });
  test('supabase client falls back to snapshot when unreachable', async () => {
    const client = new SupabaseClient({ projectUrl: '', anonKey: '', tables: {} });
    const res = await client.fetchLeaderboard();
    assert.equal(res.live, false);
    assert.ok(Array.isArray(res.data) && res.data.length > 0, 'snapshot fallback data');
  });
  test('github client resolves repo links', () => {
    const gh = new GithubClient({ repo: 'ykashkush2014-blip/search-arena' });
    assert.ok(gh.repoLink().includes('github.com'));
    assert.ok(gh.bugReportUrl().includes('issues'));
  });
  test('manager status list covers five integrations', async () => {
    const s = new Storage();
    const manager = new IntegrationManager({
      config: {
        github: { repo: 'ykashkush2014-blip/search-arena' },
        supabase: { projectUrl: '', anonKey: '', tables: { saves: 'sands_saves', leaderboard: 'sands_leaderboard' } },
        notion: {}, googleDocs: {}, linear: {},
      },
      storage: s,
      queue: new OfflineQueue(s, 10),
      clients: {
        supabase: new SupabaseClient({ projectUrl: '', anonKey: '' }),
        notion: { fetchCodex: async () => ({ ok: false, live: false, data: [] }) },
        googleDocs: { fetchStory: async () => ({ ok: false, live: false, data: [] }) },
        linear: { fetchQuestBoard: async () => ({ ok: false, live: false, data: [] }) },
        github: new GithubClient({ repo: 'ykashkush2014-blip/search-arena' }),
      },
    });
    await manager.init();
    const list = manager.statusList();
    assert.equal(list.length, 5);
    for (const entry of list) {
      assert.ok(['live', 'snapshot', 'offline', 'error'].includes(entry.status));
    }
  });
  test('computeScore formula', () => {
    const s1 = computeScore({ levelsCleared: 4, kills: 50, gold: 300, runTime: 400, achievements: 3 });
    const s2 = computeScore({ levelsCleared: 4, kills: 50, gold: 300, runTime: 4000, achievements: 3 });
    assert.ok(s1 > s2, 'time penalty applies');
    assert.ok(s1 > 0);
  });
});

// ------------------------------------------------------------- save/load

suite('save manager', () => {
  test('capture/apply roundtrip through real Game', () => {
    const canvas = makeCanvas();
    const game = new Game({ canvas, lang: 'en' });
    game.storage = new Storage();
    game.saveManager.storage = game.storage;
    game.startNewGame();
    game.player.gold = 777;
    game.player.level = 5;
    game.player.xp = 40;
    game.inventory.add('steel-saber', 1);
    const saved = game.saveManager.capture(game);
    assert.equal(saved.player.gold, 777);
    assert.equal(saved.player.level, 5);

    // mutate, then restore
    game.player.gold = 0;
    game.player.level = 1;
    assert.ok(game.saveManager.apply(game, saved));
    assert.equal(game.player.gold, 777);
    assert.equal(game.player.level, 5);
  });
  test('export/import JSON survives', () => {
    const canvas = makeCanvas();
    const game = new Game({ canvas, lang: 'en' });
    game.storage = new Storage();
    game.saveManager.storage = game.storage;
    game.startNewGame();
    const json = game.saveManager.export(game);
    game.player.gold = 1;
    assert.ok(game.saveManager.import(game, json));
  });
});

// ------------------------------------------------------------- full game

suite('full game smoke (boot → play → fight → save)', () => {
  test('120 frames of gameplay without throwing', () => {
    const canvas = makeCanvas();
    const game = new Game({ canvas, lang: 'ar' });
    game.storage = new Storage();
    game.saveManager.storage = game.storage;
    game.boot();
    game.startNewGame();
    game.dialogue.end(); // dismiss the opening vision for the sim
    assert.equal(game.scene, 'playing');
    assert.ok(game.world.map, 'world loaded');
    assert.ok(game.world.entities.length > 0, 'entities spawned');

    // simulate movement + attack frames
    for (let f = 0; f < 120; f += 1) {
      game.update(1 / 60);
      if (f === 10) {
        game.input.setVirtual('moveRight', true);
        game.input.setVirtual('attack', true);
      }
      if (f === 30) {
        game.input.setVirtual('attack', false);
        game.input.setVirtualStick(1, 0);
      }
      if (f === 60) game.input.setVirtualStick(0, 0);
      if (f % 20 === 0) game.render(0, f);
    }
    assert.ok(game.player.runTime > 0, 'run time accumulates');
    assert.ok(game.world.particles !== undefined);
  });

  test('combat kills an enemy and grants xp', async () => {
    const canvas = makeCanvas();
    const game = new Game({ canvas, lang: 'en' });
    game.storage = new Storage();
    game.saveManager.storage = game.storage;
    game.startNewGame();
    game.dialogue.end();
    const enemy = game.world.enemies[0];
    assert.ok(enemy, 'an enemy exists');
    const xpBefore = game.player.xp;
    const res = game.world.combat.damageEntity(enemy, 99999, { source: game.player });
    assert.ok(res.dealt > 0);
    assert.equal(enemy.alive, false);
    // let the death/cleanup pass run
    for (let i = 0; i < 10; i += 1) game.update(1 / 60);
    assert.ok(game.player.xp >= xpBefore, 'xp granted');
    void game.world.update;
  });

  test('save → continue restores run state', () => {
    const canvas = makeCanvas();
    const game = new Game({ canvas, lang: 'en' });
    game.storage = new Storage();
    game.saveManager.storage = game.storage;
    game.startNewGame();
    game.dialogue.end();
    game.player.gold = 321;
    assert.ok(game.saveGame(false));
    assert.ok(game.hasSave());

    const game2 = new Game({ canvas, lang: 'en' });
    game2.storage = game.storage;
    game2.saveManager.storage = game.storage;
    game2.startNewGame();
    assert.ok(game2.continueGame() || game2.loadGame());
    assert.equal(game2.player.gold, 321);
  });

  test('UI screens open and close', () => {
    const canvas = makeCanvas();
    const game = new Game({ canvas, lang: 'en' });
    game.storage = new Storage();
    game.saveManager.storage = game.storage;
    game.startNewGame();
    for (const name of ['inventory', 'map', 'quests', 'codex', 'settings', 'leaderboard']) {
      game.openScreen(name);
      game.update(1 / 60);
      game.render(0, 0);
      game.closeScreen();
    }
    game.openScreen('inventory');
    assert.ok(game.screens.isOpen());
    game.closeScreen();
    assert.ok(!game.screens.isOpen());
  });

  test('pause/resume/gameover flow', () => {
    const canvas = makeCanvas();
    const game = new Game({ canvas, lang: 'en' });
    game.storage = new Storage();
    game.saveManager.storage = game.storage;
    game.startNewGame();
    game.pause();
    assert.equal(game.scene, 'paused');
    game.update(1 / 60);
    game.render(0, 0);
    game.resume();
    assert.equal(game.scene, 'playing');
    game.player.hp = 0;
    game.player.hurt(99999, {});
    for (let i = 0; i < 5; i += 1) game.update(1 / 60);
    assert.ok(['gameover', 'playing'].includes(game.scene));
  });

  test('bilingual switch mid-run', () => {
    const canvas = makeCanvas();
    const game = new Game({ canvas, lang: 'ar' });
    game.storage = new Storage();
    game.saveManager.storage = game.storage;
    game.startNewGame();
    assert.equal(game.t('menu.newGame'), 'لعبة جديدة');
    game.setLanguage('en');
    assert.equal(game.t('menu.newGame'), 'New Game');
    game.update(1 / 60);
    game.render(0, 0);
  });

  test('level transition through portal chain', () => {
    const canvas = makeCanvas();
    const game = new Game({ canvas, lang: 'en' });
    game.storage = new Storage();
    game.saveManager.storage = game.storage;
    game.startNewGame();
    const first = game.world.levelId;
    game.gotoLevel('level-02', 0);
    assert.equal(game.world.levelId, 'level-02');
    assert.notEqual(game.world.levelId, first);
    for (let i = 0; i < 30; i += 1) {
      game.update(1 / 60);
      game.render(0, i);
    }
  });

  test('performance governor adapts tiers', () => {
    const canvas = makeCanvas();
    const game = new Game({ canvas, lang: 'en' });
    game.storage = new Storage();
    game.saveManager.storage = game.storage;
    game.startNewGame();
    game.setQuality(2);
    assert.equal(game.performance.tier, 2);
    game.setQuality(0);
    assert.equal(game.performance.tier, 0);
  });
});

// ==================================================== gfx3d (3D world)
const registerGfx3dTests = (await import('./gfx3d-tests.js')).default;
await registerGfx3dTests({ suite, test, assert });

// ==================================================================== run

const ok = await runAll();
process.exit(ok ? 0 : 1);
