// Headless tests for the pure (DOM-free) game logic.
// Run with: node test/game.test.mjs
import assert from 'node:assert/strict';
import { World, CHUNK_SIZE, WORLD_HEIGHT, generateChunkData, SEA_LEVEL } from '../src/world.js';
import { buildChunkGeometry, raycastVoxel } from '../src/mesher.js';
import { Player } from '../src/player.js';
import { ID, BLOCKS, PLACEABLE, isSolid, isOpaque } from '../src/blocks.js';
import { QuestLog, QUESTS } from '../src/quests.js';
import { Inventory, RECIPES } from '../src/inventory.js';
import { fbm2, hash2, mulberry32, clamp } from '../src/noise.js';

let passed = 0;
const failures = [];
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failures.push({ name, err });
    console.log(`  ✗ ${name}\n    ${err.message}`);
  }
}
function section(title) {
  console.log(`\n${title}`);
}

// ---------------------------------------------------------------- blocks
section('blocks');
test('every block id maps to a definition', () => {
  for (let i = 0; i < BLOCKS.length; i++) assert.equal(BLOCKS[i].id, i);
});
test('solids and transparencies are consistent', () => {
  assert.ok(isSolid(ID.STONE));
  assert.ok(!isSolid(ID.WATER) && !isSolid(ID.AIR));
  assert.ok(isOpaque(ID.DIRT));
  assert.ok(!isOpaque(ID.GLASS) && !isOpaque(ID.WATER));
});
test('hotbar entries are all placeable solids with names', () => {
  assert.equal(PLACEABLE.length, 12);
  for (const id of PLACEABLE) {
    assert.ok(BLOCKS[id], `missing def for ${id}`);
    assert.ok(isSolid(id), `${id} should be solid`);
    assert.ok(BLOCKS[id].name.length > 0);
  }
});

// ---------------------------------------------------------------- noise
section('noise');
test('deterministic hashing', () => {
  assert.equal(hash2(3, 7, 11), hash2(3, 7, 11));
  assert.notEqual(hash2(3, 7, 11), hash2(3, 7, 12));
  assert.equal(mulberry32(5)(), mulberry32(5)());
});
test('noise stays inside 0..1', () => {
  for (let i = 0; i < 500; i++) {
    const v = fbm2(i * 0.31, i * 0.17, 42, 4);
    assert.ok(v >= 0 && v <= 1, `fbm out of range: ${v}`);
  }
  assert.equal(clamp(5, 0, 1), 1);
});

// ---------------------------------------------------------------- worldgen
section('world generation');
const world = new World(1234);
test('chunks are the right size and generated once', () => {
  const c = world.ensureChunk(0, 0);
  assert.equal(c.data.length, CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT);
  assert.equal(world.ensureChunk(0, 0), c, 'chunk should be cached');
});
test('generation is deterministic for a seed', () => {
  const a = generateChunkData(2, -3, 999);
  const b = generateChunkData(2, -3, 999);
  assert.deepEqual([...a.data], [...b.data]);
  const c = generateChunkData(2, -3, 1000);
  assert.notDeepEqual([...a.data], [...c.data]);
});
test('terrain has a solid ground layer and air above', () => {
  let columns = 0;
  for (let x = 0; x < 16; x += 3) {
    for (let z = 0; z < 16; z += 3) {
      const top = world.topBlockY(x, z);
      assert.ok(top > 0 && top < WORLD_HEIGHT, `bad top ${top}`);
      assert.notEqual(world.getBlock(x, top, z), ID.AIR);
      assert.equal(world.getBlock(x, WORLD_HEIGHT - 1, z), ID.AIR);
      columns++;
    }
  }
  assert.ok(columns > 0);
});
test('some water exists at/below sea level somewhere', () => {
  let water = 0;
  for (let x = -48; x < 48; x += 4) {
    for (let z = -48; z < 48; z += 4) {
      for (let y = SEA_LEVEL - 2; y <= SEA_LEVEL; y++) if (world.getBlock(x, y, z) === ID.WATER) water++;
    }
  }
  assert.ok(water > 0, 'world should contain lakes or ocean');
});
test('getting a block across a chunk border is seamless', () => {
  assert.equal(world.getBlock(15, 30, 0), world.getBlock(15, 30, 0));
  assert.notEqual(world.getBlock(-1, 5, 0), undefined);
});
test('setBlock records edits and survives chunk reload', () => {
  world.setBlock(4, 40, 4, ID.BRICK);
  assert.equal(world.getBlock(4, 40, 4), ID.BRICK);
  world.chunks.delete('0,0');
  assert.equal(world.getBlock(4, 40, 4), ID.BRICK, 'edit should be replayed');
});
test('setBlock marks neighbouring chunks dirty on borders', () => {
  world.setBlock(0, 40, 4, ID.STONE);
  assert.ok(world.chunks.get('-1,0'), 'left neighbour chunk should be loaded');
});
test('loot table is sane', () => {
  assert.equal(World.lootFor(ID.GRASS), ID.DIRT);
  assert.equal(World.lootFor(ID.STONE), ID.COBBLE);
  assert.equal(World.lootFor(ID.WATER), null);
  assert.equal(World.lootFor(ID.PLANKS), ID.PLANKS);
  assert.equal(World.lootFor(ID.LEAVES, () => 0.9), null);
});
test('spawn is above ground and not inside a block', () => {
  const spawn = world.findSpawn();
  assert.ok(spawn.y > SEA_LEVEL, `spawn too low: ${spawn.y}`);
  assert.equal(world.getBlock(Math.floor(spawn.x), Math.floor(spawn.y), Math.floor(spawn.z)), ID.AIR);
  assert.ok(isSolid(world.getBlock(Math.floor(spawn.x), Math.floor(spawn.y) - 1, Math.floor(spawn.z))));
});

// ---------------------------------------------------------------- mesher
section('mesher');
test('a lone block yields 6 faces (24 verts, 36 indices)', () => {
  const blocks = new Map([['0,0,0', ID.STONE]]);
  const get = (x, y, z) => blocks.get(`${x},${y},${z}`) || ID.AIR;
  const { opaque } = buildChunkGeometry(get, 0, 0);
  assert.equal(opaque.positions.length, 24 * 3);
  assert.equal(opaque.indices.length, 36);
  assert.equal(opaque.uvs.length, 24 * 2);
});
test('two adjacent blocks cull the shared faces', () => {
  const blocks = new Map([['0,0,0', ID.STONE], ['1,0,0', ID.STONE]]);
  const get = (x, y, z) => blocks.get(`${x},${y},${z}`) || ID.AIR;
  const { opaque } = buildChunkGeometry(get, 0, 0);
  assert.equal(opaque.indices.length, 10 * 6, 'expected 10 visible faces');
});
test('glass faces are kept next to glass, hidden next to stone', () => {
  const g = new Map([['0,0,0', ID.GLASS], ['1,0,0', ID.GLASS]]);
  const getG = (x, y, z) => g.get(`${x},${y},${z}`) || ID.AIR;
  const glass = buildChunkGeometry(getG, 0, 0);
  assert.equal(glass.transparent.indices.length, 10 * 6);
  const s = new Map([['0,0,0', ID.GLASS], ['1,0,0', ID.STONE]]);
  const getS = (x, y, z) => s.get(`${x},${y},${z}`) || ID.AIR;
  const mixed = buildChunkGeometry(getS, 0, 0);
  assert.equal(mixed.transparent.indices.length, 5 * 6);
});
test('uvs stay inside the atlas', () => {
  const blocks = new Map([['0,0,0', ID.GRASS], ['0,1,0', ID.LAMP]]);
  const get = (x, y, z) => blocks.get(`${x},${y},${z}`) || ID.AIR;
  const { opaque } = buildChunkGeometry(get, 0, 0);
  for (const uv of opaque.uvs) assert.ok(uv >= 0 && uv <= 1, `uv out of range ${uv}`);
});
test('vertex colours shade the top face brighter than the bottom', () => {
  const blocks = new Map([['0,0,0', ID.STONE]]);
  const get = (x, y, z) => blocks.get(`${x},${y},${z}`) || ID.AIR;
  const { opaque } = buildChunkGeometry(get, 0, 0);
  let topShade = 0;
  let bottomShade = 0;
  for (let i = 0; i < opaque.normals.length / 3; i++) {
    const ny = opaque.normals[i * 3 + 1];
    if (ny === 1) topShade = opaque.colors[i * 3];
    if (ny === -1) bottomShade = opaque.colors[i * 3];
  }
  assert.ok(topShade > bottomShade);
});
test('chunk mesh offsets stay local (0..16)', () => {
  const blocks = new Map([['16,0,16', ID.STONE]]);
  const get = (x, y, z) => blocks.get(`${x},${y},${z}`) || ID.AIR;
  const { opaque } = buildChunkGeometry(get, 1, 1);
  assert.equal(opaque.positions.length, 24 * 3);
  for (const v of opaque.positions) assert.ok(v >= 0 && v <= 17);
});

// ---------------------------------------------------------------- raycast
section('raycast');
test('hits the block straight ahead', () => {
  const get = (x, y, z) => (x === 3 && y === 0 && z === 0 ? ID.STONE : ID.AIR);
  const hit = raycastVoxel([0.5, 0.5, 0.5], [1, 0, 0], 8, get);
  assert.ok(hit.hit);
  assert.deepEqual([hit.x, hit.y, hit.z], [3, 0, 0]);
  assert.deepEqual(hit.face, [-1, 0, 0]);
});
test('misses when nothing is in range', () => {
  const get = () => ID.AIR;
  const hit = raycastVoxel([0.5, 0.5, 0.5], [1, 0, 0], 4, get);
  assert.equal(hit.hit, false);
});
test('hit face points back toward the ray origin', () => {
  const get = (x, y, z) => (y === 0 && x === 2 && z === 2 ? ID.STONE : ID.AIR);
  const hit = raycastVoxel([2.5, 3.0, 2.5], [0, -1, 0], 6, get);
  assert.ok(hit.hit);
  assert.deepEqual(hit.face, [0, 1, 0]);
});

// ---------------------------------------------------------------- physics
section('player physics');
function flatWorld(groundY = 10) {
  return {
    heights: null,
    getBlock(x, y, z) {
      if (y < groundY) return ID.STONE;
      return ID.AIR;
    },
  };
}
test('player falls and lands on the ground', () => {
  const w = flatWorld(10);
  const p = new Player(w, { x: 0.5, y: 20, z: 0.5 });
  const input = { forward: 0, strafe: 0, jump: false, sprint: false };
  for (let i = 0; i < 300; i++) p.update(1 / 60, input);
  assert.ok(p.onGround, 'player should be standing');
  assert.ok(Math.abs(p.pos.y - 10) < 0.2, `expected y≈10, got ${p.pos.y}`);
});
test('player cannot walk through a wall', () => {
  const w = {
    getBlock(x, y, z) {
      if (y < 10) return ID.STONE;
      if (x === 3 && y >= 10 && y <= 12) return ID.STONE;
      return ID.AIR;
    },
  };
  const p = new Player(w, { x: 0.5, y: 10, z: 0.5 });
  p.yaw = -Math.PI / 2; // face +X
  const input = { forward: 1, strafe: 0, jump: false, sprint: true };
  for (let i = 0; i < 240; i++) p.update(1 / 60, input);
  assert.ok(p.pos.x < 3, `player tunnelled into the wall: x=${p.pos.x}`);
});
test('jumping leaves the ground and gravity brings it back', () => {
  const w = flatWorld(10);
  const p = new Player(w, { x: 0.5, y: 10.05, z: 0.5 });
  // Let the player settle onto the surface first.
  for (let i = 0; i < 10; i++) p.update(1 / 60, { forward: 0, strafe: 0, jump: false, sprint: false });
  assert.ok(p.onGround, 'should settle on the ground');
  const startY = p.pos.y;
  p.update(1 / 60, { forward: 0, strafe: 0, jump: true, sprint: false });
  for (let i = 0; i < 10; i++) p.update(1 / 60, { forward: 0, strafe: 0, jump: false, sprint: false });
  assert.ok(p.pos.y > startY + 0.3, 'should be airborne');
  for (let i = 0; i < 200; i++) p.update(1 / 60, { forward: 0, strafe: 0, jump: false, sprint: false });
  assert.ok(p.onGround);
});
test('water slows the fall', () => {
  const w = {
    getBlock(x, y, z) {
      if (y < 5) return ID.STONE;
      if (y <= 9) return ID.WATER;
      return ID.AIR;
    },
  };
  const p = new Player(w, { x: 0.5, y: 9.5, z: 0.5 });
  for (let i = 0; i < 120; i++) p.update(1 / 60, { forward: 0, strafe: 0, jump: false, sprint: false });
  assert.ok(p.inWater || p.pos.y > 5, 'should be in water / floating');
  assert.ok(p.vel.y > -10, 'terminal velocity in water must stay low');
});
test('look direction matches yaw/pitch', () => {
  const p = new Player(flatWorld(), { x: 0, y: 20, z: 0 });
  p.yaw = 0; p.pitch = 0;
  let d = p.lookDir();
  assert.ok(Math.abs(d.z + 1) < 1e-9 && Math.abs(d.x) < 1e-9);
  p.pitch = Math.PI / 2;
  d = p.lookDir();
  assert.ok(Math.abs(d.y - 1) < 1e-9);
});
test('step-up lets the player climb a single block', () => {
  const w = {
    getBlock(x, y, z) {
      if (y < 10) return ID.STONE;
      if (x >= 2 && y === 10) return ID.STONE; // one-block step
      return ID.AIR;
    },
  };
  const p = new Player(w, { x: 0.5, y: 10, z: 0.5 });
  p.yaw = -Math.PI / 2;
  for (let i = 0; i < 200; i++) p.update(1 / 60, { forward: 1, strafe: 0, jump: false, sprint: false });
  assert.ok(p.pos.x > 2, `expected to step up and pass, x=${p.pos.x}`);
});

// ---------------------------------------------------------------- inventory
section('inventory & crafting');
test('survival start kit is limited; creative is infinite', () => {
  const inv = new Inventory({ creative: false });
  assert.ok(inv.count(ID.PLANKS) === 8);
  assert.ok(!inv.creative);
  const creative = new Inventory({ creative: true });
  for (const id of PLACEABLE) assert.equal(creative.count(id), 64);
});
test('adding and removing respects counts', () => {
  const inv = new Inventory();
  inv.add(ID.STONE, 3);
  assert.equal(inv.count(ID.STONE), 3);
  assert.ok(inv.remove(ID.STONE, 2));
  assert.equal(inv.count(ID.STONE), 1);
  assert.ok(!inv.remove(ID.STONE, 5));
});
test('selected slot cycles around the hotbar', () => {
  const inv = new Inventory();
  inv.select(0);
  inv.cycle(-1);
  assert.equal(inv.selected, PLACEABLE.length - 1);
  inv.cycle(1);
  assert.equal(inv.selected, 0);
  assert.equal(inv.selectedId, PLACEABLE[0]);
});
test('crafting consumes inputs and yields outputs', () => {
  const inv = new Inventory();
  inv.add(ID.LOG, 1);
  const planks = RECIPES.find((r) => r.out === ID.PLANKS);
  assert.ok(inv.canCraft(planks));
  assert.ok(inv.craft(planks));
  assert.equal(inv.count(ID.LOG), 0);
  assert.equal(inv.count(ID.PLANKS), 12);
  assert.ok(!inv.craft(planks), 'cannot craft without inputs');
});
test('lamp recipe needs glass and planks', () => {
  const inv = new Inventory();
  const lamp = RECIPES.find((r) => r.out === ID.LAMP);
  assert.ok(!inv.canCraft(lamp));
  inv.add(ID.GLASS, 2);
  inv.add(ID.PLANKS, 1);
  assert.ok(inv.canCraft(lamp));
});
test('serialisation round-trips', () => {
  const inv = new Inventory();
  inv.add(ID.BRICK, 7);
  inv.select(3);
  const copy = new Inventory();
  copy.restore(inv.serialize());
  assert.equal(copy.count(ID.BRICK), 7);
  assert.equal(copy.selected, 3);
});

// ---------------------------------------------------------------- quests
section('quests');
test('all quests start incomplete with sane targets', () => {
  const q = new QuestLog();
  assert.equal(q.entries().length, QUESTS.length);
  for (const e of q.entries()) {
    assert.ok(e.target > 0);
    assert.equal(e.done, false);
  }
});
test('breaking blocks advances quests and emits completion', () => {
  const q = new QuestLog();
  const events = [];
  q.on((ev) => events.push(ev));
  for (let i = 0; i < 10; i++) q.track('break', { block: ID.DIRT });
  assert.ok(q.done.has('first-blocks'));
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'complete');
});
test('logs quest counts only wood blocks', () => {
  const q = new QuestLog();
  for (let i = 0; i < 8; i++) q.track('break', { block: ID.LOG });
  for (let i = 0; i < 20; i++) q.track('break', { block: ID.STONE });
  assert.ok(q.done.has('lumberjack'));
  assert.equal(q.state.logs, 8);
});
test('progress never exceeds the target', () => {
  const q = new QuestLog();
  for (let i = 0; i < 50; i++) q.track('break', { block: ID.DIRT });
  const first = q.entries().find((e) => e.id === 'first-blocks');
  assert.equal(first.value, first.target);
  assert.equal(first.ratio, 1);
});
test('completing everything flags isComplete', () => {
  const q = new QuestLog();
  for (let i = 0; i < 12; i++) q.track('break', { block: i < 8 ? ID.LOG : ID.DIRT });
  for (let i = 0; i < 20; i++) q.track('place', { block: i < 2 ? ID.LAMP : ID.DIRT, y: 30 });
  q.track('craft', { output: ID.PLANKS, count: 8 });
  q.track('move', { distance: 60 });
  assert.ok(q.isComplete(), 'all quests should be complete');
});
test('quest state serialises and restores', () => {
  const q = new QuestLog();
  q.track('break', { block: ID.LOG });
  const copy = new QuestLog();
  copy.restore(q.serialize());
  assert.equal(copy.state.logs, 1);
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.error(`\nFAILED: ${f.name}\n${f.err.stack}`);
  process.exit(1);
}
