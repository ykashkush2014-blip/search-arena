/**
 * actors3d.js — procedural low-poly actor meshes. Every character is a small
 * set of colored boxes (body, head, limbs…) with named parts so the renderer
 * can pose them: walk cycles swing legs/arms, attacks swing the weapon arm,
 * chests open their lid, bosses loom larger.
 *
 * No textures, no downloads — pure vertex color geometry built once per
 * actor type and re-used for every instance via model matrices.
 */
import { shadeHex } from './gl.js';
import { MeshBuilder } from './level3d.js';

/** Enemy family → actor archetype. Unknown families fall back to humanoid. */
export const FAMILY_ARCHETYPES = {
  beast: 'beast',
  insect: 'insect',
  serpent: 'serpent',
  golem: 'golem',
  wraith: 'wraith',
  flyer: 'flyer',
  spirit: 'wraith',
  humanoid: 'humanoid',
  bossGolem: 'boss',
  bossWraith: 'boss',
};

const DEFAULT_COLORS = {
  skin: '#e8b88a',
  cloth: '#4a6fa5',
  accent: '#e8b64c',
  hair: '#2c1808',
  boots: '#4a2c18',
  weapon: null,
};

/**
 * A part is geometry authored around its own pivot (origin = joint).
 * `pivot` places the joint in actor-local space (actor origin = feet center).
 */
function part(name, role, pivot, buildFn) {
  const mb = new MeshBuilder();
  buildFn(mb);
  const arrays = mb.toArrays();
  return { name, role, pivot, ...arrays };
}

function pushBox(mb, cx, cy, cz, w, h, d, color, sideColor) {
  mb.box(cx, cy, cz, w, h, d, color, sideColor ?? color);
}

// ------------------------------------------------------------- archetypes

function buildHumanoid(colors) {
  const c = { ...DEFAULT_COLORS, ...colors };
  const skin = shadeHex(c.skin, 1);
  const cloth = shadeHex(c.cloth, 1);
  const accent = shadeHex(c.accent, 1);
  const hair = shadeHex(c.hair, 1);
  const boots = shadeHex(c.boots, 1);

  return [
    part('torso', 'body', [0, 10, 0], (mb) => {
      pushBox(mb, 0, 0, 0, 8, 11, 5, cloth);
      pushBox(mb, 0, -1, 2.8, 6, 4, 1.2, accent); // chest strap
    }),
    part('head', 'head', [0, 17.5, 0], (mb) => {
      pushBox(mb, 0, 2.2, 0, 6.4, 6.4, 6, skin);
      pushBox(mb, 0, 5.2, -0.4, 6.8, 2, 6.4, hair); // hair cap
      if (c.beard) pushBox(mb, 0, 0.2, 2.8, 5, 3, 1.4, hair);
      if (c.helmet) pushBox(mb, 0, 3.4, 0, 7, 3.4, 6.6, accent);
    }),
    part('armL', 'armL', [-5.6, 14.5, 0], (mb) => {
      pushBox(mb, 0, -3.4, 0, 2.8, 8, 3, cloth);
      pushBox(mb, 0, -7.6, 0, 2.6, 2.6, 2.8, skin);
    }),
    part('armR', 'armR', [5.6, 14.5, 0], (mb) => {
      pushBox(mb, 0, -3.4, 0, 2.8, 8, 3, cloth);
      pushBox(mb, 0, -7.6, 0, 2.6, 2.6, 2.8, skin);
      if (c.weapon === 'sword') {
        pushBox(mb, 0, -11, 1.2, 1.4, 8, 1.4, shadeHex('#c8ccd4', 1));
        pushBox(mb, 0, -8, 1.2, 3.4, 1, 1.6, accent);
      } else if (c.weapon === 'staff') {
        pushBox(mb, 0, -10, 0.8, 1.2, 15, 1.2, shadeHex('#8c622c', 1));
        pushBox(mb, 0, -2.2, 0.8, 2.6, 2.6, 2.6, accent);
      } else if (c.weapon === 'bow') {
        pushBox(mb, 1.2, -8, 1.6, 1, 12, 1, shadeHex('#8c622c', 1));
      }
    }),
    part('legL', 'legL', [-2.6, 8.6, 0], (mb) => {
      pushBox(mb, 0, -4.2, 0, 3.2, 8.6, 3.4, cloth);
      pushBox(mb, 0, -8, 0.6, 3.4, 2, 4.4, boots);
    }),
    part('legR', 'legR', [2.6, 8.6, 0], (mb) => {
      pushBox(mb, 0, -4.2, 0, 3.2, 8.6, 3.4, cloth);
      pushBox(mb, 0, -8, 0.6, 3.4, 2, 4.4, boots);
    }),
    part('shadow', 'shadow', [0, 0.4, 0], (mb) => {
      pushBox(mb, 0, 0, 0, 11, 0.8, 8, [0, 0, 0]);
    }),
  ];
}

function buildBeast(colors) {
  const body = shadeHex(colors.body ?? '#c9a15e', 1);
  const dark = shadeHex(colors.dark ?? '#8a6a42', 1);
  const eye = shadeHex(colors.eye ?? '#e05548', 1);
  return [
    part('torso', 'body', [0, 9, 0], (mb) => {
      pushBox(mb, 0, 0, 0, 7, 6, 13, body, dark);
    }),
    part('head', 'head', [0, 10.5, 8], (mb) => {
      pushBox(mb, 0, 0, 0, 5.4, 5, 6, body);
      pushBox(mb, 0, 0.4, 3.4, 3.4, 2.6, 2.4, dark); // snout
      pushBox(mb, -1.6, 1.8, 2.2, 1, 1, 0.8, eye);
      pushBox(mb, 1.6, 1.8, 2.2, 1, 1, 0.8, eye);
    }),
    part('legL', 'legL', [-3, 6.5, -4], (mb) => {
      pushBox(mb, 0, -3.2, 0, 2.4, 6.5, 2.6, dark);
    }),
    part('legR', 'legR', [3, 6.5, -4], (mb) => {
      pushBox(mb, 0, -3.2, 0, 2.4, 6.5, 2.6, dark);
    }),
    part('legLB', 'legLB', [-3, 6.5, 4.5], (mb) => {
      pushBox(mb, 0, -3.2, 0, 2.4, 6.5, 2.6, dark);
    }),
    part('legRB', 'legRB', [3, 6.5, 4.5], (mb) => {
      pushBox(mb, 0, -3.2, 0, 2.4, 6.5, 2.6, dark);
    }),
    part('tail', 'tail', [0, 10, -7], (mb) => {
      pushBox(mb, 0, 1, -3, 1.8, 1.8, 6, dark);
    }),
  ];
}

function buildInsect(colors) {
  const body = shadeHex(colors.body ?? '#a87c46', 1);
  const dark = shadeHex(colors.dark ?? '#6e4c22', 1);
  const glow = shadeHex(colors.glow ?? '#f2c94c', 1);
  return [
    part('torso', 'body', [0, 5, 0], (mb) => {
      pushBox(mb, 0, 0, 0, 9, 5, 11, body, dark);
      pushBox(mb, 0, 2.4, -1, 6, 1.6, 7, dark); // carapace ridge
    }),
    part('head', 'head', [0, 5.5, 7], (mb) => {
      pushBox(mb, 0, 0, 0, 5, 4, 4.6, body);
      pushBox(mb, -1.4, 1, 2.2, 1, 1, 0.8, glow);
      pushBox(mb, 1.4, 1, 2.2, 1, 1, 0.8, glow);
    }),
    part('clawL', 'armL', [-5, 5, 5.5], (mb) => {
      pushBox(mb, -1.6, -1.2, 1.6, 4.6, 1.8, 1.8, dark);
    }),
    part('clawR', 'armR', [5, 5, 5.5], (mb) => {
      pushBox(mb, 1.6, -1.2, 1.6, 4.6, 1.8, 1.8, dark);
    }),
    part('tail', 'tail', [0, 6, -6.5], (mb) => {
      pushBox(mb, 0, 0.8, -2.6, 2.2, 2.2, 6, dark);
      pushBox(mb, 0, 2, -6, 2.8, 3.4, 2.8, glow); // stinger
    }),
    part('legL', 'legL', [-5.4, 3, 0], (mb) => {
      pushBox(mb, -1.8, -1.4, 0, 4, 1.4, 1.4, dark);
    }),
    part('legR', 'legR', [5.4, 3, 0], (mb) => {
      pushBox(mb, 1.8, -1.4, 0, 4, 1.4, 1.4, dark);
    }),
  ];
}

function buildGolem(colors) {
  const stone = shadeHex(colors.body ?? '#b08c5c', 1);
  const dark = shadeHex(colors.dark ?? '#7c6244', 1);
  const glow = shadeHex(colors.glow ?? '#63c7c7', 1);
  return [
    part('torso', 'body', [0, 14, 0], (mb) => {
      pushBox(mb, 0, 0, 0, 13, 14, 8, stone, dark);
      pushBox(mb, 0, 2, 4.4, 5, 5, 1.2, glow); // chest core
    }),
    part('head', 'head', [0, 22.5, 0], (mb) => {
      pushBox(mb, 0, 1.6, 0, 7, 6, 6.4, stone);
      pushBox(mb, -1.8, 2.2, 3.2, 1.4, 1, 0.8, glow);
      pushBox(mb, 1.8, 2.2, 3.2, 1.4, 1, 0.8, glow);
    }),
    part('armL', 'armL', [-8.6, 19, 0], (mb) => {
      pushBox(mb, 0, -5, 0, 4.4, 11, 4.6, stone, dark);
      pushBox(mb, 0, -11.4, 0, 5.4, 4.4, 5.4, dark);
    }),
    part('armR', 'armR', [8.6, 19, 0], (mb) => {
      pushBox(mb, 0, -5, 0, 4.4, 11, 4.6, stone, dark);
      pushBox(mb, 0, -11.4, 0, 5.4, 4.4, 5.4, dark);
    }),
    part('legL', 'legL', [-4, 7, 0], (mb) => {
      pushBox(mb, 0, -3.4, 0, 5, 7, 5.4, dark);
    }),
    part('legR', 'legR', [4, 7, 0], (mb) => {
      pushBox(mb, 0, -3.4, 0, 5, 7, 5.4, dark);
    }),
    part('shadow', 'shadow', [0, 0.4, 0], (mb) => {
      pushBox(mb, 0, 0, 0, 18, 0.8, 13, [0, 0, 0]);
    }),
  ];
}

function buildWraith(colors) {
  const body = shadeHex(colors.body ?? '#7c5aa8', 1);
  const dark = shadeHex(colors.dark ?? '#4a3470', 1);
  const glow = shadeHex(colors.glow ?? '#b267e0', 1);
  return [
    part('torso', 'body', [0, 13, 0], (mb) => {
      pushBox(mb, 0, 0, 0, 9, 12, 6, body, dark);
      pushBox(mb, 0, -6.5, 0, 7, 3, 5, dark); // tattered skirt
    }),
    part('head', 'head', [0, 21, 0], (mb) => {
      pushBox(mb, 0, 1.6, 0, 6, 6, 5.6, shadeHex('#9a7ad0', 1));
      pushBox(mb, -1.5, 2, 2.8, 1.2, 1.2, 0.8, glow);
      pushBox(mb, 1.5, 2, 2.8, 1.2, 1.2, 0.8, glow);
    }),
    part('armL', 'armL', [-6.4, 17, 0], (mb) => {
      pushBox(mb, -1, -4.4, 0.6, 2.6, 9, 2.8, body);
      pushBox(mb, -1.6, -9.4, 1, 3, 2.4, 3, glow);
    }),
    part('armR', 'armR', [6.4, 17, 0], (mb) => {
      pushBox(mb, 1, -4.4, 0.6, 2.6, 9, 2.8, body);
      pushBox(mb, 1.6, -9.4, 1, 3, 2.4, 3, glow);
    }),
    part('tail', 'tail', [0, 6, -1], (mb) => {
      pushBox(mb, 0, -2, -1, 5, 4, 4, dark);
    }),
    part('shadow', 'shadow', [0, 0.4, 0], (mb) => {
      pushBox(mb, 0, 0, 0, 12, 0.8, 9, [0, 0, 0]);
    }),
  ];
}

function buildSerpent(colors) {
  const body = shadeHex(colors.body ?? '#c9b45e', 1);
  const dark = shadeHex(colors.dark ?? '#8a7c34', 1);
  const eye = shadeHex(colors.eye ?? '#e05548', 1);
  return [
    part('seg1', 'body', [0, 5, 2], (mb) => {
      pushBox(mb, 0, 0, 0, 6, 4.6, 8, body, dark);
    }),
    part('seg2', 'body', [0, 4.6, -5], (mb) => {
      pushBox(mb, 0, 0, 0, 5, 4, 7, body, dark);
    }),
    part('seg3', 'tail', [0, 4.2, -11], (mb) => {
      pushBox(mb, 0, 0, -1, 3.4, 3.2, 7, dark);
    }),
    part('head', 'head', [0, 6, 8], (mb) => {
      pushBox(mb, 0, 0.6, 0, 5, 4, 6, body);
      pushBox(mb, -1.4, 1.4, 2.6, 1, 1, 0.8, eye);
      pushBox(mb, 1.4, 1.4, 2.6, 1, 1, 0.8, eye);
    }),
    part('crest', 'head', [0, 8.6, 6], (mb) => {
      pushBox(mb, 0, 0, 0, 1.4, 3, 4, dark);
    }),
    part('shadow', 'shadow', [0, 0.4, 0], (mb) => {
      pushBox(mb, 0, 0, 0, 10, 0.8, 16, [0, 0, 0]);
    }),
  ];
}

function buildFlyer(colors) {
  const body = shadeHex(colors.body ?? '#8a7cc0', 1);
  const dark = shadeHex(colors.dark ?? '#5a4c86', 1);
  const glow = shadeHex(colors.glow ?? '#c8baf0', 1);
  return [
    part('torso', 'body', [0, 14, 0], (mb) => {
      pushBox(mb, 0, 0, 0, 6, 6, 8, body, dark);
    }),
    part('head', 'head', [0, 15, 5.5], (mb) => {
      pushBox(mb, 0, 0.4, 0, 4.2, 4, 4.2, body);
      pushBox(mb, -1.2, 1, 2, 1, 1, 0.8, glow);
      pushBox(mb, 1.2, 1, 2, 1, 1, 0.8, glow);
    }),
    part('wingL', 'wingL', [-3.4, 16, 0], (mb) => {
      pushBox(mb, -4.4, 0.6, -0.6, 9, 0.9, 6, dark);
    }),
    part('wingR', 'wingR', [3.4, 16, 0], (mb) => {
      pushBox(mb, 4.4, 0.6, -0.6, 9, 0.9, 6, dark);
    }),
    part('tail', 'tail', [0, 13.5, -4.5], (mb) => {
      pushBox(mb, 0, -1, -2.4, 1.8, 1.8, 5, dark);
    }),
    part('shadow', 'shadow', [0, 0.4, 0], (mb) => {
      pushBox(mb, 0, 0, 0, 9, 0.8, 8, [0, 0, 0]);
    }),
  ];
}

function buildBoss(colors) {
  const parts = buildGolem({
    body: colors.body ?? '#8a5c9e',
    dark: colors.dark ?? '#5c3a70',
    glow: colors.glow ?? '#e05548',
  });
  // horns + crown shards make bosses readable at a glance
  parts.push(part('hornL', 'head', [-4, 26, 0], (mb) => {
    pushBox(mb, -1.4, 2, -0.4, 1.6, 5, 1.6, shadeHex('#3a2418', 1));
  }));
  parts.push(part('hornR', 'head', [4, 26, 0], (mb) => {
    pushBox(mb, 1.4, 2, -0.4, 1.6, 5, 1.6, shadeHex('#3a2418', 1));
  }));
  return parts;
}

function buildChest(colors) {
  const wood = shadeHex(colors.wood ?? '#8c622c', 1);
  const metal = shadeHex(colors.metal ?? '#e8b64c', 1);
  return [
    part('base', 'body', [0, 4, 0], (mb) => {
      pushBox(mb, 0, 0, 0, 11, 8, 8, wood, shadeHex('#6e4c22', 1));
      pushBox(mb, 0, 0, 4.2, 11, 1.4, 0.8, metal);
    }),
    part('lid', 'lid', [0, 8, -4], (mb) => {
      pushBox(mb, 0, 1.8, 4, 11, 3.6, 8, shadeHex(wood, 1.12), shadeHex('#6e4c22', 1));
      pushBox(mb, 0, 2, 8.2, 3, 3, 1, metal);
    }),
    part('shadow', 'shadow', [0, 0.4, 0], (mb) => {
      pushBox(mb, 0, 0, 0, 13, 0.8, 10, [0, 0, 0]);
    }),
  ];
}

function buildLoot(colors) {
  const main = shadeHex(colors.main ?? '#f2c94c', 1);
  return [
    part('gem', 'body', [0, 4, 0], (mb) => {
      pushBox(mb, 0, 0, 0, 4.4, 5, 4.4, main);
      pushBox(mb, 0, 3, 0, 2.6, 2, 2.6, shadeHex(main, 1.3));
    }),
    part('shadow', 'shadow', [0, 0.4, 0], (mb) => {
      pushBox(mb, 0, 0, 0, 7, 0.8, 6, [0, 0, 0]);
    }),
  ];
}

const ARCHETYPE_BUILDERS = {
  humanoid: buildHumanoid,
  beast: buildBeast,
  insect: buildInsect,
  golem: buildGolem,
  wraith: buildWraith,
  serpent: buildSerpent,
  flyer: buildFlyer,
  boss: buildBoss,
  chest: buildChest,
  loot: buildLoot,
};

/**
 * Actor mesh cache: build once per (archetype + colors) combination.
 */
export class ActorBank {
  constructor() {
    this.cache = new Map();
  }

  /**
   * @param {string} archetype — key of ARCHETYPE_BUILDERS
   * @param {object} colors — palette consumed by the builder
   */
  get(archetype, colors = {}) {
    const key = `${archetype}|${JSON.stringify(colors)}`;
    let mesh = this.cache.get(key);
    if (!mesh) {
      const builder = ARCHETYPE_BUILDERS[archetype] ?? buildHumanoid;
      mesh = { archetype, parts: builder(colors) };
      this.cache.set(key, mesh);
    }
    return mesh;
  }

  /** Resolve archetype for an enemy def. */
  forEnemy(def, colors = {}) {
    const arch = FAMILY_ARCHETYPES[def?.family] ?? 'humanoid';
    return this.get(def?.isBoss ? 'boss' : arch, colors);
  }

  clear() {
    this.cache.clear();
  }
}

export const actorBank = new ActorBank();

/**
 * Per-frame pose values the renderer reads to swing limbs.
 * Returns swing angles (radians) per role.
 */
export function poseFor(anim = {}) {
  const walk = anim.walkPhase ?? 0;
  const walking = anim.walking ? 1 : 0;
  const swing = Math.sin(walk) * 0.7 * walking;
  const attack = anim.attackT ?? 0; // 0..1
  const attackSwing = attack > 0 ? Math.sin(Math.min(1, attack) * Math.PI) * 1.5 : 0;
  return {
    legL: swing,
    legR: -swing,
    armL: -swing * 0.8,
    armR: swing * 0.8 - attackSwing,
    legLB: -swing * 0.9,
    legRB: swing * 0.9,
    wingL: Math.sin(walk * 2) * 0.5 * walking + (anim.flying ? 0.35 : 0),
    wingR: -Math.sin(walk * 2) * 0.5 * walking - (anim.flying ? 0.35 : 0),
    tail: Math.sin(walk * 0.8) * 0.25 * walking,
    head: Math.sin(walk * 0.5) * 0.06 * walking,
    body: 0,
    lid: anim.openT ? -Math.min(1, anim.openT) * 1.9 : 0,
    shadow: 0,
  };
}

export default ActorBank;
