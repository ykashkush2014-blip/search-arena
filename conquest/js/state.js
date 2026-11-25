// Game simulation: nations, economy, front-line combat, strikes, diplomacy,
// victory conditions and serialisation. No DOM access in this file.
import { BALANCE, BUILDINGS, BUILDING_BY_KEY, ERAS, MAX_TECH, RANKS, RESEARCH } from "./data.js";
import { t } from "./i18n.js";
import { gridToRle, rleToGrid } from "./world.js";

// Relative strength of every nation, used by the online lobby screen.
export function powerSnapshot(game) {
  const rows = [];
  for (const n of game.nations.values()) {
    if (!n.alive) continue;
    rows.push({
      id: n.id,
      seat: n.seat,
      ar: n.ar,
      cells: n.cells,
      army: Math.round(n.army),
      cap: Math.round(n.cap || 0),
      gold: Math.round(n.gold),
      share: n.cells / Math.max(1, game.totalCells),
      buildings: n.buildings.length,
      wars: n.war.size,
    });
  }
  rows.sort((a, b) => (a.seat != null ? -1 : 1) - (b.seat != null ? -1 : 1) || b.share - a.share);
  return { time: game.time, rows, result: game.result };
}
import { Rng } from "./rng.js";

const B = BALANCE;
const ERA_ORDER = ["ancient", "medieval", "sail", "imperial", "modern"];
const RUIN = -2;
const OFFMAP = -3;

let uidCounter = 1;

export class Nation {
  constructor(def, isPlayer, world) {
    this.id = def.id;
    this.name = def.name;
    this.ar = def.ar;
    this.isPlayer = !!isPlayer;
    this.alive = true;
    this.cells = 0;
    this.army = 0;
    this.gold = 0;
    this.tech = { weapons: 0, defense: 0, logistics: 0, economy: 0, population: 0, artillery: 0 };
    this.research = 0;
    this.buildings = []; // {key, cell, level, cd}
    this.capital = def.startCell ?? -1;
    this.originalCells = 0;
    this.war = new Set();
    this.ally = new Set();
    this.peace = new Map(); // id -> timestamp (seconds)
    this.frontier = new Set();
    this.totalFront = 0;
    this.stats = { kills: 0, losses: 0, captures: 0, capitals: 0, strikes: 0, naval: 0 };
    this.ai = null;
    this.cooldown = 0;
    this.agg = null;
    this.lastAttackAt = -99;
    this.pendingOffers = new Map(); // nation id -> {type:'ceasefire'|'alliance', at}
    this.relationsDirty = true;
  }

  get era() {
    return this._era || "modern";
  }
}

class Attack {
  constructor(attacker, defender, troops, opts = {}) {
    this.id = uidCounter++;
    this.attacker = attacker;
    this.defender = defender;
    this.troops = Math.max(1, Math.floor(troops));
    this.startTroops = this.troops;
    // Force the player explicitly ordered to this front (reinforcements add to
    // it; the automatic supply drip does not).
    this.ordered = this.troops;
    this.progress = 0;
    this.naval = !!opts.naval;
    this.landingAt = opts.landingAt ?? -1;
    this.landingTimer = opts.naval ? 1.6 : 0;
    this.fronts = [];
    this.frontTimer = 0;
    this.engaged = 0;
    this.ratio = 1;
    this.active = true;
    this.createdAt = 0;
  }
}

export class Game {
  constructor(opts) {
    this.world = opts.world;
    this.era = opts.era || "modern";
    this.eraIndex = Math.max(0, ERA_ORDER.indexOf(this.era));
    this.mode = opts.mode || "world";
    this.goal = opts.goal ?? 0.5;
    this.aiLevel = opts.aiLevel || "normal";
    this.rng = new Rng(opts.seed ?? Date.now());
    this.time = 0;
    this.paused = false;
    this.speed = 1;
    this.attacks = [];
    this.strikes = []; // missiles in flight
    this.explosions = [];
    this.feed = []; // event log for the HUD
    this.offers = []; // incoming diplomacy offers for the player
    this.result = null;
    this.startedAt = Date.now();
    this.attackFraction = 0.5; // player attack force slider (0.1..1)
    this.daily = opts.daily || null;
    // --- online lobby (multiplayer) ---
    this.onlineMode = opts.onlineMode || "normal"; // normal | coop | ffa
    this.lobby = opts.lobby || null;
    if (this.lobby && !this.lobby.owner) this.lobby.owner = null;
    this.onlinePhase = this.lobby ? "lobby" : "playing";
    this.seatOf = new Map(); // player id -> seat index (online only)
    this.mySeat = null; // local seat (client mirror / server host view)
    this.seatByNation = new Map(); // nation id -> seat index
    this.humanCount = opts.humanCount || 0;
    this.disconnected = new Set(); // seats whose client dropped (AI takes over)
    this.surrendered = new Set();
    this.eliminatedSeats = new Map(); // seat -> {by, at}
    this.melt = false; // player "army -> gold" toggle
    this.ceasefireUntil = 0;
    this.openedAt = 0;
    this.ownerVersion = 1;
    this.warVersion = 1;
    this.dirtyCells = [];
    this.xpTotal = 0;
    this.medals = new Set();
    this.stats = { attacks: 0, conquered: 0, lost: 0, built: 0 };

    this.nations = new Map();
    this.byId = [];
    this.buildNations(opts.playerId);
    this.buildIndex();
    this.computeAllFrontiers();
    for (const n of this.nations.values()) {
      n.originalCells = n.cells;
      this.refreshAgg(n);
    }
    for (const n of this.nations.values()) {
      const cap = this.capacityOf(n);
      n.army = Math.floor(cap * (n.isPlayer ? 0.45 : 0.5));
      if (opts.startGold && n.isPlayer) n.gold = opts.startGold;
      n.gold = n.isPlayer ? 1400 : 600;
    }
    if (opts.startBuildings && opts.playerId != null) {
      const p = this.nations.get(opts.playerId);
      if (p) {
        for (const key of opts.startBuildings) this.freeBuild(p, key, { paid: false });
      }
    }
    this.log("بدء المباراة: " + (this.nations.get(opts.playerId)?.ar || "—"), "info");
    if (this.lobby) {
      this.log(`مباراة أونلاين — ${this.lobby.seats.length} لاعبين`, "good");
    }
  }

  // ------------------------------------------------------------ set-up ---

  buildNations(playerId) {
    const { world } = this;
    const active = world.playable();
    const ids = new Set(active.map((c) => c.id));
    const counts = new Int32Array(world.countries.length);
    for (let i = 0; i < world.size; i++) {
      const o = world.owner[i];
      if (o >= 0) counts[o]++;
    }
    for (const def of active) {
      if (counts[def.id] < 1) continue;
      const n = new Nation(def, def.id === playerId, world);
      n.cells = counts[def.id];
      n._era = this.era;
      n.def = def;
      const level = this.aiLevel;
      const skillMap = { easy: 0.55, normal: 0.8, hard: 1.0, brutal: 1.22 };
      const aggrMap = { easy: 0.5, normal: 0.78, hard: 1.05, brutal: 1.35 };
      // Bigger nations are a bit more patient; tiny ones are scrappy.
      const sizeFactor = Math.min(1.5, Math.max(0.55, Math.log10(n.cells + 10) / 2.2));
      n.ai = {
        aggression: aggrMap[level] * this.rng.range(0.75, 1.25),
        skill: skillMap[level] * this.rng.range(0.85, 1.15),
        buildRate: (level === "easy" ? 0.6 : level === "normal" ? 1 : level === "hard" ? 1.35 : 1.7),
        sizeFactor,
        nextThink: this.rng.range(0.4, 2.2),
        nextBuild: this.rng.range(1.5, 6),
        nextWar: this.rng.range(35, 95) / (0.6 + sizeFactor),
        nextPeace: this.rng.range(30, 120),
        nextDiplo: this.rng.range(20, 70),
        strikes: 0,
        target: -1,
        personality: this.rng.pick(["builder", "warlord", "trader", "opportunist"]),
      };
      if (n.cells < 6) {
        // A tiny nation used to be flagged "lite" and skipped entirely, so
        // micro-states froze forever. Slow them down instead of stopping them.
        n.ai.aggression *= 0.4;
        n.ai.buildRate *= 0.4;
        n.ai.nextThink = Math.max(n.ai.nextThink, 2.5);
      }
      if (this.lobby) {
        const seat = this.lobby.seats.find((s2) => s2.nationId === n.id);
        if (seat) {
          n.seat = seat.id;
          n.isPlayer = true;
          n.ai = null;
          this.humanCount++;
          this.seatByNation.set(n.id, seat.id);
        } else {
          n.seat = null;
          n.isPlayer = false;
        }
      } else if (n.isPlayer) {
        n.seat = 0;
        this.seatByNation.set(n.id, 0);
        this.humanCount = 1;
      }
      this.nations.set(n.id, n);
      this.byId[n.id] = n;
    }
    // Capitals near centroid.
    for (const n of this.nations.values()) {
      const c = world.capitalCandidate(n.id);
      n.capital = c;
    }
  }

  buildIndex() {
    const { world } = this;
    this.owners = world.owner; // mutated in place
    this.totalCells = 0;
    for (const n of this.nations.values()) this.totalCells += n.cells;
    this.idsByCellOwner = null;
  }

  computeAllFrontiers() {
    const { world, owners } = this;
    for (const n of this.nations.values()) {
      n.frontier.clear();
      n._pair = new Map();
      n._byDef = new Map();
    }
    for (let i = 0; i < world.size; i++) {
      const o = owners[i];
      if (o < 0) continue;
      const n = this.nations.get(o);
      if (!n) continue;
      this.updatePair(n, i);
    }
    for (const n of this.nations.values()) n.totalFront = n.frontier.size;
  }



  // ------------------------------------------------------------- helpers ---

  player() {
    return [...this.nations.values()].find((n) => n.isPlayer) || null;
  }

  // Every human seat, in single-player and online alike. `player()` returns
  // just the first one, which is what the offline HUD and camera want; AI
  // diplomacy has to treat *all* human seats as protected.
  humans() {
    return [...this.nations.values()].filter((n) => n.isPlayer);
  }

  // Online: the nation owned by a given seat (null if knocked out).
  nationOfSeat(seat) {
    return [...this.nations.values()].find((n) => n.seat === seat) || null;
  }

  isHuman(n) {
    return !!(n && n.isPlayer);
  }

  get nationList() {
    return [...this.nations.values()];
  }

  log(text, kind = "info", extra = {}) {
    this.feed.unshift({ text, kind, t: this.time, ...extra });
    if (this.feed.length > 90) this.feed.length = 90;
  }

  rel(a, b) {
    if (!a || !b) return "neutral";
    if (a.ally.has(b.id)) return "ally";
    if (a.war.has(b.id)) return "war";
    const until = a.peace.get(b.id) || 0;
    if (until > this.time) return "peace";
    return "neutral";
  }

  relationLabel(a, b) {
    const r = this.rel(a, b);
    return { ally: t("حليف"), war: t("حرب"), peace: t("هدنة"), neutral: t("محايد") }[r];
  }

  capacityOf(n) {
    const cities = n.agg ? n.agg.city : 0;
    // Cities give diminishing returns past the tenth one, so the army cap
    // follows land more than building spam.
    const cityCap = cities <= 10 ? cities * B.capPerCity : 10 * B.capPerCity + (cities - 10) * B.capPerCity * 0.4;
    const land = Math.sqrt(n.cells) * B.capPerSqrt + n.cells * B.capPerCell;
    return Math.floor((B.baseCap + cityCap + land) *
      (1 + n.tech.logistics * 0.12) * (1 + n.tech.population * 0.1));
  }

  // Recompute cached building stats after any build/upgrade/destroy.
  refreshAgg(n) {
    const agg = {
      city: 0, factory: 0, lab: 0, port: 0, base: 0, bunker: 0, silo: 0, aa: 0,
      byKey: {},
    };
    for (const b of n.buildings) {
      if (!BUILDING_BY_KEY[b.key]) continue;
      agg[b.key] += b.level;
      (agg.byKey[b.key] ||= []).push(b);
    }
    n.agg = agg;
    n.cap = this.capacityOf(n);
  }

  buildingCost(key, level) {
    const def = BUILDING_BY_KEY[key];
    const eraMult = (ERAS[this.era] || ERAS.modern).costMult;
    return Math.round(def.cost * eraMult * Math.pow(1.62, level - 1));
  }

  resourceRate(n) {
    const agg = n.agg || { factory: 0, port: 0, lab: 0 };
    const economy = n.tech.economy || 0;
    const gold = (B.baseGoldRate + agg.factory * B.goldPerFactory + (agg.port || 0) * B.portGold +
      n.cells * B.goldPerCell * 0.4) * (1 + economy * 0.12);
    const research = (0.35 + (agg.lab || 0) * 0.55) * (1 + (n.ai ? n.ai.skill : 1) * 0.1);
    return { gold, research };
  }

  troopRate(n) {
    const agg = n.agg || { base: 0 };
    const cap = this.capacityOf(n);
    const fill = Math.max(0, 1 - n.army / Math.max(1, cap));
    const eraMult = (ERAS[this.era] || ERAS.modern).armyMult;
    const base = (B.baseTroopRate + (agg.base || 0) * B.troopRatePerBase) * (0.35 + 0.85 * fill);
    const skill = n.ai ? n.ai.skill : 1;
    return base * (1 + n.tech.population * 0.1) * eraMult * (n.isPlayer ? 1 : 0.92 + skill * 0.18);
  }

  attackMult(n) {
    const era = (ERAS[this.era] || ERAS.modern).armyMult;
    return (1 + n.tech.weapons * 0.1) * era * (n.isPlayer ? 1.02 : 0.94 + (n.ai ? n.ai.skill : 1) * 0.1);
  }

  defenseMult(n, cell) {
    const era = (ERAS[this.era] || ERAS.modern).armyMult;
    let m = (1 + n.tech.defense * 0.09) * era;
    // Alliances are a defensive pact: +18% defence per living ally (max 2).
    m *= 1 + Math.min(2, this.allyCount(n)) * 0.18;
    if (cell != null && this.bunkerCover(n, cell)) m *= 1.35;
    if ((n.fortifyUntil || 0) > this.time) m *= 1.3;
    return m;
  }

  bunkerCover(n, cell) {
    const list = n.agg && n.agg.byKey && n.agg.byKey.bunker;
    if (!list || !list.length) return 0;
    const { world } = this;
    const x = cell % world.w;
    const y = (cell / world.w) | 0;
    for (const b of list) {
      const bx = b.cell % world.w;
      const by = (b.cell / world.w) | 0;
      const r = 5 + b.level * 2;
      if ((bx - x) ** 2 + (by - y) ** 2 <= r * r) return 1;
    }
    return 0;
  }

  // ------------------------------------------------------------ ownership ---

  setOwner(cell, newOwner, opts = {}) {
    const { world, owners } = this;
    const old = owners[cell];
    if (old === newOwner) return;
    if (opts.noRuinCheck === undefined && newOwner >= 0 && old === RUIN) {
      // reclaiming a ruin is allowed
    }
    if (old >= 0) {
      const prev = this.byId[old];
      if (prev) {
        prev.cells--;
        if (prev.cells <= 0) this.eliminate(prev, newOwner >= 0 ? newOwner : -1);
      }
    }
    owners[cell] = newOwner;
    if (!this.ruins) this.ruins = new Set();
    if (newOwner === RUIN) this.ruins.add(cell);
    else this.ruins.delete(cell);
    this.ownerVersion = (this.ownerVersion || 0) + 1;
    if (!this.dirtyCells) this.dirtyCells = [];
    this.dirtyCells.push(cell);
    if (this.dirtyCells.length > 9000) {
      // too many changes to track individually: ask the renderer for a full pass
      this.dirtyCells.length = 0;
      this.fullRepaint = (this.fullRepaint || 0) + 1;
    }
    if (newOwner >= 0) {
      const n = this.byId[newOwner];
      n.cells++;
      // transfer buildings standing on the captured cell
      const prevOwner = old >= 0 ? this.byId[old] : null;
      if (prevOwner) {
        for (let k = prevOwner.buildings.length - 1; k >= 0; k--) {
          const b = prevOwner.buildings[k];
          if (b.cell === cell) {
            if (this.rng.chance(0.5)) {
              prevOwner.buildings.splice(k, 1);
            } else {
              prevOwner.buildings.splice(k, 1);
              b.level = Math.max(1, b.level - 1);
              n.buildings.push(b);
              this.refreshAgg(n);
            }
          }
        }
        if (prevOwner.capital === cell && !prevOwner.isPlayer) prevOwner.capital = -1;
        if (prevOwner.capital === cell) {
          // capital lost: big army hit
          const lost = Math.floor(prevOwner.army * B.capitalArmyLoss);
          prevOwner.army = Math.max(0, prevOwner.army - lost);
          this.log(`سقطت عاصمة ${prevOwner.ar}! خسر ${Math.round(lost).toLocaleString("en-US")} جندي`, "bad", {
            nation: prevOwner.id,
          });
          n.stats.capitals++;
          this.checkMedal("capital_capture");
        }
      }
    }
    // frontier bookkeeping (cells + their cached border pairs)
    this.refreshPairsAround(cell);
  }

  eliminate(n, by) {
    if (!n.alive) return;
    n.alive = false;
    n.cells = 0;
    n.army = 0;
    for (const [id, other] of this.nations) {
      other.war.delete(id);
      other.ally.delete(id);
    }
    this.attacks = this.attacks.filter((a) => a.attacker !== n && a.defender !== n);
    if (n.seat != null) {
      this.surrendered.add(n.seat);
      n.isPlayer = false;
      n.ai = null;
      this.log(`تم احتلال ${n.ar} — خرج صاحبها من اللعبة`, "bad", { seat: n.seat });
      if (this.lobby) this.checkOnlineEnd();
      return;
    }
    if (n.isPlayer) {
      this.finish("lose");
      this.log(t("سقطت دولتك… انتهت الحملة"), "bad");
    } else {
      this.log(`تم احتلال ${n.ar} بالكامل`, "good", { nation: n.id, conquered: n.id });
      this.stats.conquered++;
      if (by != null && this.byId[by]) {
        this.byId[by].stats.captures++;
        this.awardXP(40, this.byId[by]);
      }
      if (this.mode === "history" || this.mode === "daily") {
        // nothing special; goal progress is land based
      }
      this.checkGoal();
    }
  }

  // ---------------------------------------------------------------- build ---

  canBuild(n, key, cell) {
    if (!n.alive) return t("دولتك سقطت");
    if (this.owners[cell] !== n.id) return t("يجب البناء داخل أرضك");
    if (n.gold < this.buildingCost(key, 1)) return t("الذهب غير كافٍ");
    if (n.buildings.some((b) => b.cell === cell)) return t("يوجد مبنى هنا");
    return null;
  }

  build(n, key, cell) {
    const err = this.canBuild(n, key, cell);
    if (err) return err;
    const cost = this.buildingCost(key, 1);
    n.gold -= cost;
    const b = { key, cell, level: 1, cd: 0 };
    n.buildings.push(b);
    this.refreshAgg(n);
    this.stats.built++;
    if (n.isPlayer) {
      this.log(`تم بناء ${BUILDING_BY_KEY[key].ar}`, "good");
      this.checkMedal("build");
    }
    return null;
  }

  freeBuild(n, key, opts = {}) {
    // Place a level-1 building on an owned cell. Prefer cells near the capital
    // and next to existing buildings so AI empires look organic.
    // NOTE: this *charges* the building cost unless opts.paid === false
    // (setup/starting buildings are the only free ones). Before this, the AI
    // built dozens of cities per minute for free, which made land worthless.
    const { world, owners } = this;
    const cost = this.buildingCost(key, 1);
    if (opts.paid !== false) {
      if (!n.alive) return false;
      if (n.gold < cost) return false;
    }
    // Hard cap: past this the empire is maxed out, so conquest — not building
    // spam — is the only way to keep growing. Without it, a big AI snowballs
    // into 5x the gold of a human who is busy taking land and wins by economy.
    const cap = B.maxBuildings ?? 40;
    const scaled = cap + Math.floor(Math.min(40, Math.max(0, n.cells - n.originalCells / 2) / 900));
    if (n.buildings.length >= Math.min(cap * 2, scaled)) return false;
    const free = (i) => owners[i] === n.id && !n.buildings.some((b) => b.cell === i);
    let tries = 0;
    if (n.buildings.length) {
      for (let k = 0; k < 400; k++) {
        const b = n.buildings[Math.floor(this.rng.float() * n.buildings.length)];
        const x = (b.cell % world.w) + this.rng.int(-6, 6);
        const y = ((b.cell / world.w) | 0) + this.rng.int(-6, 6);
        if (x < 0 || y < 0 || x >= world.w || y >= world.h) continue;
        const i = y * world.w + x;
        if (!free(i)) continue;
        if (opts.paid !== false) n.gold -= cost;
        n.buildings.push({ key, cell: i, level: 1, cd: 0 });
        this.refreshAgg(n);
        return true;
      }
    }
    const cx = n.capital >= 0 ? n.capital % world.w : world.countries[n.id].x;
    const cy = n.capital >= 0 ? (n.capital / world.w) | 0 : world.countries[n.id].y;
    while (tries++ < 3000) {
      const x = Math.round(cx + this.rng.range(-40, 40));
      const y = Math.round(cy + this.rng.range(-40, 40));
      if (x < 0 || y < 0 || x >= world.w || y >= world.h) continue;
      const i = y * world.w + x;
      if (!free(i)) continue;
      if (opts.paid !== false) n.gold -= cost;
      n.buildings.push({ key, cell: i, level: 1, cd: 0 });
      this.refreshAgg(n);
      return true;
    }
    return false;
  }

  upgradeBuilding(n, b) {
    if (b.level >= 5) return t("المستوى الأقصى");
    const cost = this.buildingCost(b.key, b.level + 1);
    if (n.gold < cost) return t("الذهب غير كافٍ");
    n.gold -= cost;
    b.level++;
    this.refreshAgg(n);
    return null;
  }

  // --------------------------------------------------------------- combat ---

  canDeclare(a, b) {
    if (!a || !b || !a.alive || !b.alive) return false;
    if (a.id === b.id) return false;
    if (a.ally.has(b.id)) return false;
    if (this.ceasefireLeft > 0) return false; // opening truce is sacred
    return true;
  }

  declareWar(a, b, silent = false) {
    if (!this.canDeclare(a, b)) return false;
    // Alliance pact: attacking an ally's ally drags you into war with it too.
    // This is what makes alliances mean something (and makes betrayals costly).
    for (const allyId of [...b.ally]) {
      const ally = this.byId[allyId];
      if (ally && ally.alive && ally.id !== a.id && !ally.ally.has(a.id) && !ally.war.has(a.id)) {
        ally.war.add(a.id);
        a.war.add(ally.id);
        this.warVersion = (this.warVersion || 0) + 1;
        if (a.isPlayer || ally.isPlayer) {
          this.log(`${ally.ar} تدخلت في الحرب إلى جانب حليفها ${b.ar}`, a.isPlayer ? "bad" : "info", { nation: ally.id });
        }
      }
    }
    if (a.ally.has(b.id)) {
      a.ally.delete(b.id);
      b.ally.delete(a.id);
      if (a.isPlayer || b.isPlayer) this.log(t("تحالف انكسر… خيانة!"), "bad");
    }
    a.war.add(b.id);
    b.war.add(a.id);
    a.peace.delete(b.id);
    b.peace.delete(a.id);
    this.warVersion = (this.warVersion || 0) + 1;
    if (!silent) {
      this.log(`${a.ar} أعلنت الحرب على ${b.ar}`, b.isPlayer ? "bad" : "info", {
        nation: b.id,
      });
    }
    return true;
  }

  adjacent(a, b) {
    // Do these nations share a land border?
    if (a.def.neighbors.includes(b.id)) return true;
    for (const c of a.frontier) {
      const { world, owners } = this;
      const x = c % world.w;
      const y = (c / world.w) | 0;
      if (x > 0 && owners[c - 1] === b.id) return true;
      if (x < world.w - 1 && owners[c + 1] === b.id) return true;
      if (y > 0 && owners[c - world.w] === b.id) return true;
      if (y < world.h - 1 && owners[c + world.w] === b.id) return true;
    }
    return false;
  }

  // Naval reach: from any neighbour's coast, plus that neighbour's neighbours
  // (one extra "hop" across the water). Before this, holding a single port
  // meant every country on the planet was a legal target, so the whole world
  // declared war on the player at once and buried them in 100+ fronts.
  navalReach(n) {
    const set = new Set();
    for (const id of n.def.neighbors) {
      set.add(id);
      const other = this.byId[id];
      if (other) for (const id2 of other.def.neighbors) set.add(id2);
    }
    set.delete(n.id);
    return set;
  }

  canReach(n, target) {
    if (this.adjacent(n, target)) return true;
    if (!this.hasPort(n)) return false;
    return this.navalReach(n).has(target.id);
  }

  hasPort(n) {
    return !!(n.agg && n.agg.port);
  }

  launchAttack(attacker, defender, fraction) {
    if (!attacker.alive || !defender.alive) return t("دولة غير موجودة");
    if (attacker.ally.has(defender.id)) return t("لا يمكنك مهاجمة حليفك");
    if (attacker.army < 200) return t("جيشك صغير جدًا");
    if (this.ceasefireLeft > 0) return `الهدنة سارية — تبقى ${Math.ceil(this.ceasefireLeft)} ثانية`;
    const naval = !this.adjacent(attacker, defender);
    if (naval && !this.hasPort(attacker)) return t("تحتاج ميناء للغزو البحري");
    if (naval && !this.canReach(attacker, defender)) return t("هذه الدولة بعيدة عن موانئك");
    // Never let a nation commit its last soldiers: keep a garrison floor, so a
    // single over-committed offensive can't leave the homeland defenceless.
    const cap = this.capacityOf ? this.capacityOf(attacker) : attacker.cap || attacker.army;
    const garrison = Math.max(600, cap * (attacker.isPlayer ? 0.18 : 0.25));
    const available = Math.floor(attacker.army - garrison);
    if (available < 200) {
      return attacker.isPlayer
        ? t("احتياطيك منخفض — انتظر تجنيداً أو اسحب قواتك")
        : t("لا يوجد احتياطي كافٍ");
    }
    const existing = this.attacks.find((a) => a.attacker === attacker && a.defender === defender && a.active);
    if (existing) {
      // reinforce the running offensive instead of issuing a duplicate order
      const extra = Math.min(available, Math.floor(attacker.army * fraction));
      attacker.army -= extra;
      existing.troops += extra;
      existing.startTroops += extra;
      existing.ordered = (existing.ordered || 0) + extra;
      if (existing.fronts.length === 0 && !existing.naval) existing.frontTimer = 0;
      return null;
    }
    if (!attacker.war.has(defender.id)) this.declareWar(attacker, defender);
    if (!attacker.isPlayer && this.attacks.length > 150) return "الحد الأقصى للهجمات";
    const troops = Math.min(available, Math.floor(attacker.army * fraction));
    if (troops < 100) return t("جيشك صغير جدًا");
    attacker.army -= troops;
    const atk = new Attack(attacker, defender, troops, { naval });
    atk.createdAt = this.time;
    if (naval) {
      atk.landingTimer = 1.6;
      atk.landingAt = this.findLandingCell(attacker, defender);
      if (atk.landingAt < 0) {
        attacker.army += troops;
        return t("لا يوجد ساحل يمكن الوصول إليه");
      }
    }
    this.attacks.push(atk);
    void naval;
    if (attacker.isPlayer) {
      this.stats.attacks++;
      this.log(`هجوم على ${defender.ar} بـ ${troops.toLocaleString("en-US")} جندي`, "info", {
        nation: defender.id,
      });
    }
    if (defender.isPlayer) {
      this.log(`${attacker.ar} تهجم عليك!`, "bad", { nation: attacker.id });
    }
    return null;
  }

  findLandingCell(attacker, defender) {
    const { world, owners } = this;
    // coast cell of the defender that is closest to any attacker cell
    let best = -1;
    let bestD = Infinity;
    for (const cell of defender.frontier) {
      const x = cell % world.w;
      const y = (cell / world.w) | 0;
      // must touch ocean to be a beach
      const coastal =
        (x > 0 && owners[cell - 1] < 0) ||
        (x < world.w - 1 && owners[cell + 1] < 0) ||
        (y > 0 && owners[cell - world.w] < 0) ||
        (y < world.h - 1 && owners[cell + world.w] < 0);
      if (!coastal) continue;
      const dx = x - world.countries[attacker.id].x;
      const dy = y - world.countries[attacker.id].y;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = cell;
      }
    }
    if (best >= 0) return best;
    // fallback: any coastal owned cell at all
    for (let i = 0; i < owners.length; i++) {
      if (owners[i] === defender.id) {
        const x = i % world.w;
        const y = (i / world.w) | 0;
        if ((x > 0 && owners[i - 1] < 0) || (x < world.w - 1 && owners[i + 1] < 0) ||
          (y > 0 && owners[i - world.w] < 0) || (y < world.h - 1 && owners[i + world.w] < 0)) return i;
      }
    }
    return -1;
  }

  attackById(id) {
    return this.attacks.find((a) => a.id === id) || null;
  }

  retreat(attackId) {
    const a = this.attackById(attackId);
    if (!a) return;
    const back = Math.floor(a.troops * (1 - B.retreatLoss));
    a.attacker.army += back;
    a.active = false;
    a.troops = 0;
    if (a.attacker.isPlayer) this.log(t("انسحاب — خسرت 25% من القوة"), "warn");
    this.attacks = this.attacks.filter((x) => x !== a);
  }

  // Incremental border registry: for every owned border cell we remember which
  // neighbouring nation it faces. Ownership changes only touch a handful of
  // cells, so this stays cheap even with 200 nations fighting at once.
  updatePair(n, cell) {
    if (!n) return;
    if (!n._pair) {
      n._pair = new Map(); // attacker cell -> [target cell, defender id]
      n._byDef = new Map(); // defender id -> Set(attacker cell)
    }
    const old = n._pair.get(cell);
    if (old) {
      const set = n._byDef.get(old[1]);
      if (set) set.delete(cell);
      n._pair.delete(cell);
    }
    const { world, owners } = this;
    const w = world.w;
    const x = cell % w;
    const y = (cell / w) | 0;
    const test = (o, target) => {
      if (o < 0 || o === n.id) return false;
      n._pair.set(cell, [target, o]);
      let set = n._byDef.get(o);
      if (!set) n._byDef.set(o, (set = new Set()));
      set.add(cell);
      n.frontier.add(cell);
      return true;
    };
    const ok =
      (x > 0 && test(owners[cell - 1], cell - 1)) ||
      (x < w - 1 && test(owners[cell + 1], cell + 1)) ||
      (y > 0 && test(owners[cell - w], cell - w)) ||
      (y < world.h - 1 && test(owners[cell + w], cell + w));
    if (!ok) n.frontier.delete(cell);
  }

  refreshPairsAround(cell) {
    const { world, owners } = this;
    const w = world.w;
    const x = cell % w;
    const y = (cell / w) | 0;
    const visit = (c) => {
      const o = owners[c];
      if (o >= 0) this.updatePair(this.byId[o], c);
    };
    visit(cell);
    if (x > 0) visit(cell - 1);
    if (x < w - 1) visit(cell + 1);
    if (y > 0) visit(cell - w);
    if (y < world.h - 1) visit(cell + w);
  }

  rebuildFronts(a) {
    const attacker = a.attacker;
    const set = attacker._byDef && attacker._byDef.get(a.defender.id);
    const list = [];
    if (set) {
      for (const cell of set) {
        const pair = attacker._pair.get(cell);
        if (!pair) continue;
        list.push([cell, pair[0]]);
        if (list.length >= 220) break;
      }
    }
    a.fronts = list;
    a.frontTimer = 0.5 + this.rng.float() * 0.3;
  }

  // TACTICS ---------------------------------------------------------------
  // An offensive that pushes from several directions at once splits the
  // defender's attention (a pincer). Coordinated multi-nation offensives get a
  // bigger bonus, which is what makes alliances and timing matter.
  // Returns {directions, pincer, coordinated} where pincer is a 0.85..1.45 mult.
  tacticalRead(a) {
    const defender = a.defender;
    const fronts = a.fronts;
    if (!fronts.length) return { directions: 0, pincer: 1, coordinated: 1 };
    const { world } = this;
    // count how many distinct sides of the defender we are entering from
    const cx = world.countries[defender.id] ? world.countries[defender.id].x : 0;
    const cy = world.countries[defender.id] ? world.countries[defender.id].y : 0;
    const dirs = new Set();
    let sumX = 0, sumY = 0, n = 0;
    for (const [ac] of fronts) {
      const x = ac % world.w;
      const y = (ac / world.w) | 0;
      sumX += x; sumY += y; n++;
      const dx = x - cx, dy = y - cy;
      // 4-way compass with a diagonal band
      const ang = Math.atan2(dy, dx);
      dirs.add(Math.round(((ang + Math.PI) / (Math.PI / 2))) % 4);
    }
    const directions = dirs.size;
    const pincer = Math.min(1.45, 0.85 + (directions - 1) * 0.22);
    // multiple allied nations hitting the same defender at the same time
    let attackers = 0;
    for (const other of this.attacks) {
      if (!other.active) continue;
      if (other.defender !== defender) continue;
      if (other.attacker === a.attacker) continue;
      const atk = other.attacker;
      if (atk.ally.has(a.attacker.id) || a.attacker.ally.has(atk.id)) attackers++;
    }
    const coordinated = 1 + Math.min(2, attackers) * 0.12;
    a.directions = directions;
    void sumX; void sumY; void n;
    return { directions, pincer, coordinated };
  }

  defenderLocalStrength(a) {
    // The defender cannot put its whole army on one border: only the share of
    // its border that this offensive touches fights here (with a floor so a
    // small nation is never defenceless).
    const def = a.defender;
    const pairs = a.fronts.length;
    if (!pairs) return def.army;
    const total = Math.max(1, def.totalFront || pairs);
    const share = Math.min(1, Math.max(0.14, pairs / total));
    return Math.max(150, def.army * share);
  }

  // Troops still standing when an offensive ends are not lost: they march back
  // into the nation's reserve army (or, if the nation has fallen, they simply
  // disband). Without this, every halted offensive silently vaporised tens of
  // thousands of soldiers, which is why big attacks looked like a death spiral.
  endAttack(a, why) {
    if (!a.active) return;
    a.active = false;
    const atk = a.attacker;
    const left = Math.max(0, Math.floor(a.troops));
    a.troops = 0;
    if (left <= 0) return;
    if (atk && atk.alive) {
      const cap = this.capacityOf ? this.capacityOf(atk) : atk.cap || Infinity;
      atk.army = Math.min(cap, (atk.army || 0) + left);
      if (atk.isPlayer && why) this.log(`${why} — عاد ${left.toLocaleString("ar-EG")} جندي إلى الاحتياط`, "info");
    }
  }

  stepAttack(a, dt) {
    const attacker = a.attacker;
    const defender = a.defender;
    if (!attacker.alive || !defender.alive || a.troops <= 0) {
      a.active = false;
      return;
    }
    if (a.naval && !a.landed) {
      a.landingTimer -= dt;
      if (a.landingTimer > 0) return;
      // Establish the beachhead: the landing cell and its neighbourhood go to
      // the attacker (paid for in troops), then the invasion becomes a normal
      // land offensive from that foothold.
      const { world, owners } = this;
      if (a.landingAt < 0 || owners[a.landingAt] !== defender.id) return;
      const w = world.w;
      const x = a.landingAt % w;
      const y = (a.landingAt / w) | 0;
      let taken = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= world.h) continue;
          const i = yy * w + xx;
          if (owners[i] !== defender.id) continue;
          this.setOwner(i, attacker.id);
          taken++;
        }
      }
      a.landed = true;
      a.naval = false;
      a.troops = Math.max(1, a.troops - taken * 160);
      a.fronts = [];
      a.frontTimer = 0;
      this.log(
        attacker.isPlayer
          ? `نجح الإنزال البحري على سواحل ${defender.ar}!`
          : `إنزال بحري من ${attacker.ar} على سواحلك!`,
        attacker.isPlayer ? "good" : "bad",
        { nation: defender.id }
      );
      attacker.stats.naval = (attacker.stats.naval || 0) + 1;
      if (attacker.isPlayer) this.checkMedal("naval");
      return;
    }
    a.frontTimer -= dt;
    if (a.frontTimer <= 0 || a.fronts.length === 0) this.rebuildFronts(a);
    if (!a.fronts.length) {
      if (!a.naval) {
        // The shared border is gone: the offensive has nothing left to attack.
        this.endAttack(a, null);
      }
      return;
    }

    const pairs = a.fronts.length;
    const defLocal = this.defenderLocalStrength(a);
    const tac = this.tacticalRead(a);
    const mult = (this.attackMult(attacker) * tac.pincer * tac.coordinated) /
      Math.max(0.25, this.defenseMult(defender, a.fronts[0][1]));
    const ratio = (a.troops * mult) / Math.max(1, defLocal);
    a.ratio = ratio;
    const force = Math.min(a.troops * mult, defLocal * 3);

    // Battle casualties: the committed force bleeds (it is already subtracted
    // from the nation's army) and so does the defender's army.
    const atkLoss = Math.min(a.troops, force * B.attackerAttrition * dt);
    a.troops -= atkLoss;
    attacker.stats.losses += atkLoss;
    defender.stats.kills += atkLoss;
    if (a.troops <= 0) {
      a.active = false;
      return;
    }
    this.damageArmy(defender, force * B.defenderAttrition * dt, attacker);

    // Reinforcements: a nation keeps feeding an active offensive with fresh
    // troops (up to 1/(reinforceCapTime) of its army per second). Without this,
    // the ~20k committed force decayed to nothing while the enemy rebuilt,
    // which made attacking a bigger neighbour a guaranteed loss.
    // Keep the front supplied, but only up to ~2x the local defence: a stalled
    // or hopeless push must not drain the whole reserve army (that turned a
    // single bad attack into a death spiral). The reserve also keeps a floor,
    // so losing a front never leaves the homeland undefended.
    // Also cap by what one front can physically absorb (~a third of the army),
    // otherwise a long war piles 100k+ soldiers onto a single stalled border
    // instead of keeping them in the national reserve.
    // Absorb at most a fixed slice of the *reserve* (never the troops already
    // committed), so the fed force converges instead of overshooting.
    // How many troops this front may hold: enough to keep pushing against a
    // comparable defence, but bounded by the initial order so a long war never
    // turns one border into a bottomless troop sink.
    // `ordered` is the force the player explicitly put on this front; it only
    // grows when they reinforce, never from the automatic drip feed.
    const ordered = a.ordered || a.startTroops || a.troops;
    const supplyLine = Math.min(defLocal * 2.5, Math.max(ordered * 1.6, defLocal * 1.2));
    const reserve = attacker.cap ? Math.max(attacker.cap * 0.25, 4000) : 4000;
    if (attacker.alive && attacker.army > reserve && a.troops < supplyLine && ratio >= B.haltRatio * 0.85) {
      const feed = Math.min(attacker.army - reserve, Math.min(supplyLine - a.troops, attacker.army * dt / (B.reinforceCapTime ?? 10)));
      if (feed > 0) {
        attacker.army -= feed;
        a.troops += feed;
        // NOTE: startTroops is the *ordered* force (plus explicit reinforcement
        // orders). Growing it with the drip feed made the "we've lost 65% of
        // the attack" abort test unreachable, so stalled fronts ran forever.
      }
    }

    if (ratio < B.haltRatio) {
      // Stalled front: the attacker burns supplies and slowly loses ground.
      a.progress = Math.max(0, a.progress - dt * 0.1);
      a.stalled = (a.stalled || 0) + dt;
      if (a.troops < (a.ordered || a.startTroops) * 0.35 || a.stalled > 18) {
        this.endAttack(a, `توقف الهجوم على ${defender.ar}`);
        if (attacker.isPlayer) this.log(`توقف الهجوم على ${defender.ar} — أرسل تعزيزات أو انسحب`, "warn");
        else if (defender.isPlayer) this.log(`صدّيت هجوم ${attacker.ar}!`, "good");
      }
      return;
    }
    a.stalled = 0;

    const pressure = Math.min(3.4, Math.pow(Math.max(0, ratio - B.haltRatio) / (1 - B.haltRatio), 1.25));
    const adv = Math.min(B.frontSpeedCap ?? 0.75,
      B.frontWidthFactor * Math.pow(pairs, 0.75) * pressure *
      (1 - this.bunkerSlow(defender, a)) * (attacker.ai ? 0.95 + attacker.ai.skill * 0.1 : 1));
    a.progress += adv * dt;

    let guard = 0;
    while (a.progress >= 1 && guard++ < 30) {
      let best = -1;
      let bestScore = Infinity;
      const n = Math.min(pairs, 25);
      for (let k = 0; k < n; k++) {
        const pair = a.fronts[Math.floor(this.rng.float() * a.fronts.length)];
        if (!pair) continue;
        const dc = pair[1];
        if (this.owners[dc] !== defender.id) continue;
        const score = this.rng.float();
        if (score < bestScore) {
          bestScore = score;
          best = dc;
        }
      }
      if (best < 0) {
        this.rebuildFronts(a);
        if (!a.fronts.length) break;
        a.progress -= 1;
        guard += 1;
        continue;
      }
      // Taking ground costs troops in proportion to the local defence, but a
      // single cell must never cost more than a small slice of the offensive:
      // with 130 borders the old (defLocal/pairs)*0.55 formula charged ~2,600
      // per cell, which is more than the whole committed force — that is why
      // advances froze right after a breakthrough.
      const perCell = Math.min(defLocal / Math.max(1, pairs), a.troops * 0.02);
      const cellCost = Math.max(30, Math.min(1200, perCell * 0.55));
      if (a.troops < cellCost) {
        this.endAttack(a, `نفدت قوات الهجوم على ${defender.ar}`);
        break;
      }
      a.troops -= cellCost;
      this.setOwner(best, attacker.id);
      a.progress -= 1;
      attacker.stats.kills += cellCost;
      this.awardXP(B.xpPerCell, attacker);
      defender.stats.losses += cellCost * 0.3;
      if (defender.isPlayer && this.rng.chance(0.04)) {
        this.log(`${attacker.ar} تتقدم على حدودك (+${cellCost} خسائر)`, "bad", { nation: attacker.id });
      }
      if (!defender.alive) break;
      if (a.progress < 1) break;
    }

    if (defender.alive && defender.cells > 0) {
      // Capitulation: losing the capital is decisive, and so is losing half your
      // land — otherwise a big country bleeds for minutes after the outcome is
      // already decided. This is what makes conquest feel fast.
      const capitalLost = defender.capital < 0 || this.owners[defender.capital] !== defender.id;
      const lostShare = 1 - defender.cells / Math.max(1, defender.originalCells);
      const crushed = lostShare >= (B.capitulation ?? 0.5);
      const collapsing = (capitalLost && defender.cells < defender.originalCells * B.capitulateFraction) || defender.cells < 12;
      if (crushed || collapsing) this.capitulate(defender, attacker);
    }
  }

  fortify(n) {
    const cost = 650;
    if (n.gold < cost) return t("الذهب غير كافٍ");
    if ((n.fortifyUntil || 0) > this.time) return t("التحصين فعّال بالفعل");
    n.gold -= cost;
    n.fortifyUntil = this.time + 20;
    if (n.isPlayer) this.log(t("تحصين الحدود +30% دفاع لمدة 20 ثانية"), "good");
    return null;
  }

  bunkerSlow(defender, a) {
    const cover = defender.agg && defender.agg.bunker ? defender.agg.bunker : 0;
    return Math.min(B.bunkerMax, cover * B.bunkerSlow);
  }

  damageArmy(n, amount, by) {
    const dmg = Math.min(n.army, Math.max(0, amount));
    n.army -= dmg;
    n.stats.losses += dmg;
    if (by) by.stats.kills += dmg;
    if (n.army <= 0) n.army = 0;
  }

  capitulate(defender, attacker) {
    this.log(`${defender.ar} استسلمت!`, "good", { nation: defender.id });
    const { owners } = this;
    for (let i = 0; i < owners.length; i++) {
      if (owners[i] === defender.id) this.setOwner(i, attacker.id);
    }
    for (const b of defender.buildings) attacker.buildings.push(b);
    defender.buildings = [];
    this.refreshAgg(attacker);
    this.refreshAgg(defender);
    this.eliminate(defender, attacker.id);
  }

  // --------------------------------------------------------------- strikes ---

  canStrike(n) {
    if (!n.agg || !n.agg.silo) return t("تحتاج منصة صواريخ");
    const ready = n.buildings.filter((b) => b.key === "silo" && b.cd <= 0).length;
    if (ready <= 0) return t("الصاروخ قيد التجهيز");
    if (n.gold < B.missileCost) return t("الذهب غير كافٍ");
    return null;
  }

  launchStrike(n, cell, kind = "missile") {
    const cost = kind === "nuke" ? B.nukeCost : B.missileCost;
    if (!n.agg || !n.agg.silo) return t("تحتاج منصة صواريخ");
    if (n.gold < cost) return t("الذهب غير كافٍ");
    const silo = n.buildings.find((b) => b.key === "silo" && b.cd <= 0);
    if (!silo) return t("الصاروخ قيد التجهيز");
    silo.cd = kind === "nuke" ? B.missileChargeTime * 2 : B.missileChargeTime;
    n.gold -= cost;
    n.stats.strikes++;
    const targetOwner = this.owners[cell];
    this.strikes.push({
      id: uidCounter++,
      from: n.id,
      cell,
      kind,
      t: 0,
      dur: 1.5,
      x0: silo.cell % this.world.w,
      y0: (silo.cell / this.world.w) | 0,
      x1: cell % this.world.w,
      y1: (cell / this.world.w) | 0,
    });
    if (n.isPlayer) this.log(kind === "nuke" ? t("أُطلق سلاح نووي!") : t("أُطلق صاروخ كروز"), "warn");
    return null;
  }

  detonate(strike) {
    const { world } = this;
    const radius = strike.kind === "nuke" ? B.nukeRadius : B.missileRadius;
    const damage = strike.kind === "nuke" ? B.nukeDamage : B.missileDamage;
    const cx = strike.cell % world.w;
    const cy = (strike.cell / world.w) | 0;
    const by = this.byId[strike.from];
    let interceptor = null;
    // air defense check
    for (const [id, n] of this.nations) {
      if (!n.alive || !n.agg || !n.agg.aa || n.id === strike.from) continue;
      if (!n.agg.byKey.aa) continue;
      for (const b of n.agg.byKey.aa) {
        const bx = b.cell % world.w;
        const byy = (b.cell / world.w) | 0;
        const r = 26 + b.level * 6;
        if ((bx - cx) ** 2 + (byy - cy) ** 2 <= r * r && this.owners[cx + cy * world.w - 0] !== undefined) {
          interceptor = b;
          break;
        }
      }
      if (interceptor) break;
    }
    let blocked = false;
    if (interceptor && this.rng.chance(0.35 + interceptor.level * 0.1)) blocked = true;

    const affected = new Map();
    const ruinChance = strike.kind === "nuke" ? 0.55 : 0.28;
    for (let dy = -radius; dy <= radius; dy++) {
      const y = cy + dy;
      if (y < 0 || y >= world.h) continue;
      for (let dx = -radius; dx <= radius; dx++) {
        const x = cx + dx;
        if (x < 0 || x >= world.w) continue;
        if (dx * dx + dy * dy > radius * radius) continue;
        const i = y * world.w + x;
        const o = this.owners[i];
        if (o < 0) continue;
        affected.set(o, (affected.get(o) || 0) + 1);
        if (!blocked && this.rng.chance(ruinChance * 0.06)) {
          // some cells are blown into unowned ruins
          this.setOwner(i, RUIN);
        }
      }
    }
    const scale = (blocked ? 0.25 : 1) * (strike.kind === "nuke" ? 1 : 0.5);
    for (const [id, cells] of affected) {
      const n = this.byId[id];
      if (!n) continue;
      const share = cells / Math.max(1, radius * radius);
      const dmg = Math.min(n.army, damage * scale * Math.min(1, share * 2.4));
      this.damageArmy(n, dmg, by);
      // buildings in blast radius can be destroyed
      for (let k = n.buildings.length - 1; k >= 0; k--) {
        const b = n.buildings[k];
        const bx = b.cell % world.w;
        const byy = (b.cell / world.w) | 0;
        if ((bx - cx) ** 2 + (byy - cy) ** 2 <= radius * radius && this.rng.chance(0.35)) {
          n.buildings.splice(k, 1);
          this.refreshAgg(n);
        }
      }
    }
    this.explosions.push({
      x: cx,
      y: cy,
      r: radius,
      kind: strike.kind,
      t: 0,
      blocked: !!blocked,
      by: strike.from,
    });
    if (by && by.isPlayer) {
      this.log(blocked ? t("اعترض الدفاع الجوي الصاروخ!") : t("إصابة مباشرة!"), blocked ? "warn" : "good");
      if (strike.kind === "nuke") this.checkMedal("nuke");
    }
    const victim = this.nations.get(this.owners[strike.cell]);
    if (victim && victim.isPlayer) this.log(t("ضربة صاروخية على أرضك!"), "bad");
  }

  // ------------------------------------------------------------ diplomacy ---

  propose(offer) {
    // offer: {type:'ceasefire'|'alliance'|'peace', from, to, cost}
    const from = this.byId[offer.from];
    const to = this.byId[offer.to];
    if (!from || !to || !from.alive || !to.alive) return t("دولة غير متاحة");
    if (offer.type === "ceasefire") {
      if (!from.war.has(to.id)) return t("لا توجد حرب");
      if (from.gold < B.ceasefireCost) return t("الذهب غير كافٍ");
      from.gold -= B.ceasefireCost;
      if (to.isPlayer) {
        this.offers.push({ ...offer, id: uidCounter++, at: this.time });
        return null;
      }
      // AI decides
      const willingness = this.aiAcceptsCeasefire(to, from);
      if (willingness) {
        this.makePeace(from, to);
        return null;
      }
      this.log(`${to.ar} رفضت وقف إطلاق النار`, "warn");
      return t("مرفوض");
    }
    if (offer.type === "gift") {
      if (from.gold < B.giftCost) return t("الذهب غير كافٍ");
      from.gold -= B.giftCost;
      to.gold += B.giftCost;
      if (from.isPlayer) this.log(`أرسلت هدية إلى ${to.ar}`, "good");
      if (to.ai) to.ai.attitude = (to.ai.attitude || 0) + 1;
      return null;
    }
    if (offer.type === "alliance") {
      if (from.ally.has(to.id)) return t("أنتما حلفاء بالفعل");
      if (from.ally.size >= 2) return t("لا يمكنك تحالف أكثر من دولتين");
      if (from.gold < 1000) return t("الذهب غير كافٍ");
      from.gold -= 1000;
      if (to.isPlayer) {
        this.offers.push({ ...offer, id: uidCounter++, at: this.time });
      } else if (this.aiAcceptsAlliance(to, from)) {
        this.formAlliance(from, to);
      } else {
        this.log(`${to.ar} رفضت التحالف`, "warn");
        return t("مرفوض");
      }
      return null;
    }
    return t("طلب غير معروف");
  }

  aiAcceptsCeasefire(ai, other) {
    if (!ai.alive) return false;
    const losing = ai.army < other.army * 0.7;
    const weak = ai.war.size > 1 || ai.army < this.capacityOf(ai) * 0.25;
    return this.rng.chance((losing ? 0.75 : 0.35) + (weak ? 0.25 : 0) + ai.ai.skill * 0.1);
  }

  aiAcceptsAlliance(ai, other) {
    if (!ai.alive) return false;
    if (ai.ai.aggression > 1.1) return this.rng.chance(0.25);
    const friendly = !ai.war.has(other.id);
    const threatened = ai.army < this.capacityOf(ai) * 0.45;
    return this.rng.chance((friendly ? 0.35 : 0.1) + (threatened ? 0.3 : 0) + (ai.ai.attitude || 0) * 0.15);
  }

  formAlliance(a, b) {
    a.ally.add(b.id);
    b.ally.add(a.id);
    a.war.delete(b.id);
    b.war.delete(a.id);
    a.peace.delete(b.id);
    b.peace.delete(a.id);
    a.allySince = a.allySince || {};
    b.allySince = b.allySince || {};
    a.allySince[b.id] = this.time;
    b.allySince[a.id] = this.time;
    // An alliance is a defensive pact: defensive strength and troop growth get
    // a real boost, so an ally is worth keeping instead of a free liability.
    this.refreshAgg(a);
    this.refreshAgg(b);
    this.log(`تحالف بين ${a.ar} و${b.ar} — دفاع مشترك`, "good");
    if (a.isPlayer || b.isPlayer) this.checkMedal("alliance");
  }

  // Count of living allies (alliance value scales with this).
  allyCount(n) {
    let c = 0;
    for (const id of n.ally) {
      const o = this.byId[id];
      if (o && o.alive) c++;
    }
    return c;
  }

  // Called on the player's behalf: ask allies to join the war on a target.
  callAllies(target) {
    const p = this.player();
    if (!p || !p.alive || !target || !target.alive) return t("لا يوجد هدف");
    let joined = 0;
    let strikes = 0;
    for (const id of [...p.ally]) {
      const ally = this.byId[id];
      if (!ally || !ally.alive || ally.war.has(target.id)) continue;
      // A pact is a pact: the ally always enters the war (that alone splits the
      // enemy's front and drags its reserves). Only the *offensive* needs a
      // land border or a reachable port.
      this.declareWar(ally, target, true);
      joined++;
      const reachable = this.canReach(ally, target);
      if (reachable) {
        const ratio = (ally.army * this.attackMult(ally)) / Math.max(1, target.army * this.defenseMult(target));
        if (ratio > 0.55) {
          if (!this.launchAttack(ally, target, 0.45)) strikes++;
        }
      } else {
        // Too far to open a front: a real ally sends materiel instead. The
        // expeditionary corps joins the player's capital garrison and the war
        // chest, so even a distant pact is worth signing.
        const corps = Math.floor(ally.army * 0.12);
        const gold = Math.floor(ally.gold * 0.1);
        if (corps > 200) {
          ally.army -= corps;
          p.army = Math.min(this.capacityOf(p), p.army + corps);
          strikes++;
        }
        if (gold > 50) {
          ally.gold -= gold;
          p.gold += gold;
        }
        if (corps > 200 || gold > 50) {
          this.log(`${ally.ar} أرسلت لك ${corps > 200 ? Math.round(corps).toLocaleString("ar-EG") + " جندي" : ""}${corps > 200 && gold > 50 ? " و" : ""}${gold > 50 ? Math.round(gold).toLocaleString("ar-EG") + " ذهب" : ""} دعماً`, "good");
        }
      }
      this.log(
        reachable
          ? `${ally.ar} انضمت إلى حربك ضد ${target.ar} وفتحت جبهة`
          : `${ally.ar} أعلنت الحرب على ${target.ar} دعماً لك`,
        "good",
        { nation: ally.id }
      );
    }
    if (!joined) return t("لم ينضم أي حليف — لا تملك تحالفات حيّة");
    if (!strikes) return null;
    // Silence is bad UX: report that they joined but are far from the front.
    this.log(`حلفاؤك في الحرب، لكن ${strikes} منهم بعيدون عن جبهة ${target.ar}`, "info");
    return null;
  }

  makePeace(a, b) {
    a.war.delete(b.id);
    b.war.delete(a.id);
    this.warVersion = (this.warVersion || 0) + 1;
    a.peace.set(b.id, this.time + B.ceasefireTime);
    b.peace.set(a.id, this.time + B.ceasefireTime);
    for (const atk of this.attacks) {
      if ((atk.attacker === a && atk.defender === b) || (atk.attacker === b && atk.defender === a)) {
        atk.active = false;
      }
    }
    this.attacks = this.attacks.filter((x) => x.active);
    this.computeAllFrontiers();
    this.log(`وقف إطلاق النار بين ${a.ar} و${b.ar}`, "info");
  }

  answerOffer(offerId, accept) {
    const idx = this.offers.findIndex((o) => o.id === offerId);
    if (idx < 0) return;
    const offer = this.offers[idx];
    this.offers.splice(idx, 1);
    const from = this.byId[offer.from];
    const to = this.byId[offer.to];
    if (!from || !to) return;
    if (!accept) {
      this.log(`رفضت عرض ${from.ar}`, "warn");
      return;
    }
    if (offer.type === "ceasefire") this.makePeace(from, to);
    else if (offer.type === "alliance") this.formAlliance(from, to);
  }

  // -------------------------------------------------------------- reclaim ---

  reclaim(n, cell) {
    const { world, owners } = this;
    if (owners[cell] !== RUIN) return t("ليست أرضًا خربة");
    // must be reachable from the player's territory
    const x = cell % world.w;
    const y = (cell / world.w) | 0;
    const near =
      (x > 0 && owners[cell - 1] === n.id) ||
      (x < world.w - 1 && owners[cell + 1] === n.id) ||
      (y > 0 && owners[cell - world.w] === n.id) ||
      (y < world.h - 1 && owners[cell + world.w] === n.id);
    if (!near) return t("الأرض الخربة بعيدة عن حدودك");
    // reclaim a small blob around the click
    let claimed = 0;
    for (let dy = -2; dy <= 2 && claimed < 16; dy++) {
      for (let dx = -2; dx <= 2 && claimed < 16; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || xx >= world.w || yy < 0 || yy >= world.h) continue;
        const i = yy * world.w + xx;
        if (owners[i] === RUIN) {
          this.setOwner(i, n.id);
          claimed++;
        }
      }
    }
    if (claimed && n.isPlayer) this.log(t("استعادة أرض خربة"), "good");
    return null;
  }

  // ------------------------------------------------------------- research ---

  researchCost(key, n) {
    const lvl = n.tech[key] || 0;
    return Math.round(55 * Math.pow(1.75, lvl));
  }

  doResearch(n, key) {
    if (!(key in n.tech)) return t("بحث غير معروف");
    if (n.tech[key] >= MAX_TECH) return t("أعلى مستوى");
    const cost = this.researchCost(key, n);
    if (n.research < cost) return t("نقاط البحث غير كافية");
    n.research -= cost;
    n.tech[key]++;
    if (n.isPlayer) {
      const def = RESEARCH.find((r) => r.key === key);
      this.log(`بحث ${def.ar} → المستوى ${n.tech[key]}`, "good");
      if (n.tech[key] >= MAX_TECH) this.checkMedal("tech");
    }
    return null;
  }

  // ---------------------------------------------------------------- goals ---

  playerShare() {
    const p = this.player();
    if (!p || this.totalCells <= 0) return 0;
    return p.cells / this.totalCells;
  }

  checkGoal() {
    if (this.result) return;
    if (this.lobby) {
      this.checkOnlineEnd();
      return;
    }
    const p = this.player();
    if (!p) return;
    const share = this.playerShare();
    if (share >= this.goal) this.finish("win");
  }

  // Online victory: reach the land goal (normal/coop), own the whole arena
  // (coop with several humans), or be the last human standing (FFA).
  humanCells() {
    let cells = 0;
    for (const n of this.nations.values()) if (n.isPlayer && n.alive) cells += n.cells;
    return cells;
  }

  checkOnlineEnd() {
    if (this.result || !this.lobby) return;
    const total = Math.max(1, this.totalCells);
    // An AI nation reaching the land goal ends the match against the humans.
    for (const n of this.nations.values()) {
      if (n.isPlayer || !n.alive) continue;
      if (n.cells / total >= this.goal) return this.finish("lose", { reason: "ai", by: n.id });
    }
    const alive = [...this.nations.values()].filter((n) => n.isPlayer && n.alive);
    if (this.onlineMode === "coop" && alive.length) {
      if (this.humanCells() / total >= this.goal) return this.finish("win", { winners: alive.map((n) => n.seat) });
    }
    if (this.onlineMode === "ffa") {
      for (const n of alive) if (n.cells / total >= this.goal) return this.finish("win", { winners: [n.seat] });
      if (alive.length <= 1) return this.finish("win", { winners: alive.map((n) => n.seat) });
      return;
    }
    for (const n of alive) {
      if (n.cells / Math.max(1, this.totalCells) >= this.goal) {
        return this.finish("win", { winners: [n.seat] });
      }
    }
    if (!alive.length) {
      // everyone is out: the last seat standing (even if now eliminated) takes it
      const winners = this.winners && this.winners.length ? this.winners : [];
      return this.finish(winners.length ? "win" : "lose", { winners });
    }
  }

  finish(result, extra = {}) {
    if (this.result) return;
    if (this.mySeat == null && this.lobby) this.mySeat = this.lobby.you != null ? this.lobby.you : null;
    const p = this.player();
    this.result = result;
    this.winners = extra.winners || null;
    if (result === "win" && p) {
      this.awardXP(500 * this.goal, p);
      if (this.playerShare() >= 0.5) this.unlockMedal("world_ruler");
      if ((this.lostHalfAt || Infinity) < (this.wonAt || Infinity)) this.unlockMedal("comeback");
    }
    const me = this.lobby ? this.nationOfSeat(this.mySeat) || this.player() : p;
    const stats = {
      result,
      reason: extra.reason || null,
      by: extra.by != null ? extra.by : null,
      seat: this.mySeat != null ? this.mySeat : null,
      time: this.time,
      share: me ? me.cells / Math.max(1, this.totalCells) : 0,
      cells: me ? me.cells : 0,
      conquered: this.stats.conquered,
      attacks: this.stats.attacks,
      built: this.stats.built,
      xp: Math.round(this.xpTotal || 0),
      rank: this.rankName(p),
    };
    this.summary = stats;
    this.log(result === "win" ? t("🏆 النصر! سيطرت على الأرض") : t("💀 الهزيمة"), result === "win" ? "good" : "bad");
    if (this.onEnd) this.onEnd(stats);
  }

  awardXP(amount, n) {
    if (!n || !n.isPlayer) return;
    this.xpTotal = (this.xpTotal || 0) + amount;
    this.xp = this.xpTotal;
  }

  rankIndex() {
    const xp = this.xpTotal || 0;
    let idx = 0;
    for (let i = 0; i < RANKS.length; i++) if (xp >= RANKS[i].xp) idx = i;
    return idx;
  }

  rankName(n) {
    return RANKS[this.rankIndex()].ar;
  }

  unlockMedal(id) {
    this.medals = this.medals || new Set();
    if (this.medals.has(id)) return;
    this.medals.add(id);
    if (this.onMedal) this.onMedal(id);
  }

  checkMedal(kind) {
    const p = this.player();
    if (!p) return;
    if (kind === "capital_capture" && p.stats.capitals >= 3) this.unlockMedal("capital_hunter");
    if (kind === "nuke") this.unlockMedal("nuke_them");
    if (kind === "build" && this.stats.built >= 25) this.unlockMedal("builder");
    if (kind === "tech") this.unlockMedal("tech_master");
    if (kind === "alliance") this.unlockMedal("alliance_king");
    if (kind === "naval" && p.stats.naval >= 3) this.unlockMedal("navy");
    if (p.stats.captures >= 1) this.unlockMedal("first_blood");
    if (p.stats.captures >= 5) this.unlockMedal("five_nations");
    if (p.stats.captures >= 10) this.unlockMedal("ten_nations");
    if (p.army >= 1e6) this.unlockMedal("billion_troops");
    if (this.rankIndex() >= RANKS.length - 1) this.unlockMedal("emperor");
  }

  // Grace period at the start of a match (the classic 25s ceasefire).
  startCeasefire(seconds) {
    this.ceasefireEndsAt = this.time + Math.max(0, seconds);
    this.openedAt = this.ceasefireEndsAt;
  }

  get ceasefireLeft() {
    if (!this.openedAt) return 0;
    return Math.max(0, this.openedAt - this.time);
  }

  // ----------------------------------------------------------------- tick ---

  update(dt) {
    if (this.paused || this.result) return;
    if (this.onlinePhase === "lobby") return; // frozen until the host starts
    const scaled = dt * this.speed;
    if (scaled <= 0) return;
    this.time += scaled;
    const step = Math.min(scaled, 0.25);
    const iterations = Math.max(1, Math.ceil(step / 0.09));
    const sub = step / iterations;
    for (let k = 0; k < iterations; k++) this.substep(sub);
    // resolve finished attacks (survivors march back into the reserve army)
    for (const a of this.attacks) {
      if (!a.active && a.troops > 0) {
        a.attacker.army += a.troops;
        a.troops = 0;
      }
    }
    this.attacks = this.attacks.filter((a) => a.active && a.troops > 0);
    this.checkGoal();
  }

  substep(dt) {
    const { world, owners } = this;

    for (const n of this.nations.values()) {
      if (!n.alive) continue;
      if (!n.agg) this.refreshAgg(n);
      const rate = this.resourceRate(n);
      const skill = n.ai ? n.ai.skill : 0.5;
      n.gold += rate.gold * dt * (n.isPlayer ? 1 : 0.6 + skill * 0.5);
      n.research += rate.research * dt * (n.isPlayer ? 1 : 0.7);
      n.cap = this.capacityOf(n);

      // troop growth / melt
      if (n.isPlayer && this.melt) {
        const sell = Math.min(n.army, n.army * 0.02 * dt + 0.5);
        n.army -= sell;
        n.gold += sell * 0.085;
      } else {
        const cap = n.cap;
        if (n.army < cap * 1.05) {
          n.army += this.troopRate(n) * dt;
          if (n.army > cap) n.army = cap + (n.army - cap) * 0.02;
        }
      }
      if (n.army < 0) n.army = 0;

      // building cooldowns
      for (const b of n.buildings) {
        if (b.cd > 0) b.cd = Math.max(0, b.cd - dt);
      }
      // Passive small-scale AI economy handled in the ai module.
      // NOTE: this used to be gated on `!this.lobby` — but every online match
      // HAS a lobby object, so in online mode all 230+ AI nations stood still
      // while only their armies grew: the world map never moved and the other
      // players were the only thing happening. The lobby only matters during
      // the lobby phase, which is already frozen above (onlinePhase check).
      if (!n.isPlayer && n.ai && !n.ai.lite) this.stepAI(n, dt);
    }

    // combat
    for (const a of this.attacks) {
      if (a.active) this.stepAttack(a, dt);
    }

    // AI nations reclaim their ruined land quickly (the human has to click).
    if (this.ruins && this.ruins.size && this.time % 0.5 < dt) {
      let budget = 6;
      for (const cell of this.ruins) {
        if (budget-- <= 0) break;
        const { world, owners } = this;
        const x = cell % world.w;
        const y = (cell / world.w) | 0;
        let owner = -1;
        let landing = -1;
        if (x > 0 && owners[cell - 1] >= 0) {
          owner = owners[cell - 1];
          landing = cell - 1;
        } else if (x < world.w - 1 && owners[cell + 1] >= 0) {
          owner = owners[cell + 1];
          landing = cell + 1;
        } else if (y > 0 && owners[cell - world.w] >= 0) {
          owner = owners[cell - world.w];
          landing = cell - world.w;
        } else if (y < world.h - 1 && owners[cell + world.w] >= 0) {
          owner = owners[cell + world.w];
          landing = cell + world.w;
        }
        if (owner < 0 || this.rng.chance(0.35)) continue;
        this.setOwner(cell, owner);
        void landing;
      }
    }

    // missiles
    for (const s of this.strikes) {
      s.t += dt;
      if (s.t >= s.dur) {
        this.detonate(s);
        s.done = true;
      }
    }
    this.strikes = this.strikes.filter((s) => !s.done);
    for (const e of this.explosions) e.t += dt;
    this.explosions = this.explosions.filter((e) => e.t < 1.6);

    // expired offers
    if (this.time % 5 < dt) {
      this.offers = this.offers.filter((o) => this.time - o.at < 30);
    }
  }

  stepAI(n, dt) {
    const ai = n.ai;
    // cheap continuous behaviour
    if (n.buildings.length < 40 && this.rng.chance(dt * 0.5 * ai.buildRate)) this.aiBuild(n);
    if (this.rng.chance(dt * 0.35)) this.aiResearch(n);
    ai.nextThink -= dt;
    if (ai.nextThink <= 0) {
      ai.nextThink = 1.2 + this.rng.float() * 1.6;
      this.aiThink(n);
    }
    ai.nextWar -= dt;
    if (ai.nextWar <= 0) {
      ai.nextWar = Math.max(18, (80 / (0.5 + ai.sizeFactor)) * (1.4 - ai.aggression) + this.rng.float() * 30);
      this.aiConsiderWar(n);
    }
    ai.nextPeace -= dt;
    if (ai.nextPeace <= 0) {
      ai.nextPeace = 40 + this.rng.float() * 60;
      this.aiConsiderPeace(n);
    }
    if (n.agg && n.agg.silo && this.rng.chance(dt * 0.01 * ai.aggression)) this.aiStrike(n);
  }

  aiBuild(n) {
    const p = n.ai.personality;
    const weights = {
      builder: { city: 3, factory: 3, lab: 2.4, port: 1, base: 1.4, bunker: 1.2, silo: 0.5, aa: 0.4 },
      warlord: { city: 2, factory: 2, lab: 1, port: 0.7, base: 3, bunker: 1.8, silo: 1.4, aa: 0.9 },
      trader: { city: 2.5, factory: 3.5, lab: 1.6, port: 2.4, base: 1, bunker: 0.8, silo: 0.6, aa: 0.5 },
      opportunist: { city: 2, factory: 2.2, lab: 1.4, port: 1.4, base: 2, bunker: 1.4, silo: 1, aa: 0.7 },
    }[p];
    const keys = BUILDINGS.map((b) => b.key);
    const maxByCells = Math.max(2, Math.min(26, Math.floor(n.cells / 14)));
    if (n.buildings.length < maxByCells && n.gold > 400) {
      let pick = null;
      for (const key of keys) {
        const w = weights[key];
        if (!w) continue;
        const cost = this.buildingCost(key, 1);
        if (n.gold < cost) continue;
        const count = n.buildings.filter((b) => b.key === key).length;
        const want = Math.max(1, Math.round(w * maxByCells / 8));
        if (count >= want) continue;
        if (key === "silo" && n.cells < 60) continue;
        if (this.rng.chance(0.5)) {
          pick = key;
          break;
        }
        pick = pick || key;
      }
      if (pick && this.freeBuild(n, pick)) return;
    }
    // upgrade something affordable
    if (n.gold > 2600 && n.buildings.length && this.rng.chance(0.5)) {
      const b = this.rng.pick(n.buildings);
      if (b && b.level < 5 && n.gold >= this.buildingCost(b.key, b.level + 1)) {
        this.upgradeBuilding(n, b);
      }
    }
  }

  aiResearch(n) {
    const order = {
      builder: ["economy", "population", "logistics", "defense", "weapons", "artillery"],
      warlord: ["weapons", "logistics", "artillery", "defense", "population", "economy"],
      trader: ["economy", "population", "logistics", "defense", "weapons", "artillery"],
      opportunist: ["weapons", "economy", "logistics", "artillery", "defense", "population"],
    }[n.ai.personality];
    for (const key of order) {
      if (n.tech[key] >= MAX_TECH) continue;
      if (n.research >= this.researchCost(key, n)) {
        this.doResearch(n, key);
        return;
      }
    }
  }

  aiThink(n) {
    // make sure a war we are in still has an offensive running
    for (const enemyId of n.war) {
      const enemy = this.byId[enemyId];
      if (!enemy || !enemy.alive) continue;
      const running = this.attacks.some((a) => a.attacker === n && a.defender === enemy && a.active);
      if (running) continue;
      if (!this.canReach(n, enemy)) continue;
      const ratio = n.army / Math.max(1, enemy.army);
      if (ratio > 0.55 * (1.4 - n.ai.aggression * 0.4) || n.army > this.capacityOf(n) * 0.8) {
        if (this.rng.chance(0.55 + n.ai.aggression * 0.2)) {
          this.launchAttack(n, enemy, this.rng.range(0.35, 0.7));
        }
      }
      // pull back hopeless pushes
      for (const a of this.attacks) {
        if (a.attacker === n && a.ratio < 0.3 && this.rng.chance(0.25)) this.retreat(a.id);
      }
    }
  }

  aiConsiderWar(n) {
    if (n.war.size >= 2 && n.ai.aggression < 1.1) return;
    const candidates = [];
    const targets = [...n.def.neighbors];
    if (this.hasPort(n) && this.rng.chance(0.45)) {
      const reach = this.navalReach(n);
      for (const id of n.def.sea) if (reach.has(id)) targets.push(id);
    }
    for (const id of targets) {
      const other = this.byId[id];
      if (!other || !other.alive) continue;
      if (n.ally.has(id)) continue;
      if (n.peace.get(id) > this.time) continue;
      if (n.war.has(id)) continue;
      // don't dogpile a nation that is already collapsing
      const strength = other.army * this.attackMult(other);
      const mine = n.army * this.attackMult(n) * (1 + n.ai.aggression * 0.35);
      const p0 = other.isPlayer ? other : null;
      const isPlayerTarget = !!p0;
      if (isPlayerTarget) {
        const elapsed = this.time - (this.openedAt || 0);
        // The human gets breathing room to build up, and AI coalitions only
        // form once the player has proven to be a threat.
        const grace = this.mode === "daily" ? 45 : 110;
        const aggressive = (p0.stats.captures || 0) >= 2;
        if (elapsed < grace) continue;
        if (!aggressive && mine < strength * 2.1) continue;
        if (aggressive && mine < strength * 1.25) continue;
        const alreadyAtWar = [...p0.war].some((id) => id !== other.id && this.byId[id]?.alive);
        const limit = aggressive ? 2 : 1;
        if (alreadyAtWar && [...p0.war].length >= limit) continue;
      }
      if (mine < strength * 0.75) continue;
      const juicy = other.cells / Math.max(1, n.cells);
      const score = (mine / Math.max(1, strength)) * (0.5 + juicy) * this.rng.range(0.6, 1.5);
      candidates.push({ id, score });
    }
    if (!candidates.length) return;
    candidates.sort((a, b) => b.score - a.score);
    // AI avoids attacking a human that is far stronger, and hesitates early on.
    let target = candidates[0];
    const tn = this.byId[target.id];
    if (tn && tn.isPlayer && (tn.cells > n.cells * 2.2 || this.time < 25)) {
      target = candidates.find((c) => !this.byId[c.id]?.isPlayer) || target;
    }
    if (!target) return;
    if (this.rng.chance(0.55 * n.ai.aggression)) {
      const other = this.byId[target.id];
      this.declareWar(n, other);
      if (!n.isPlayer && !other.isPlayer) {
        // keep the log readable: only surface wars involving neighbours of the player
        const p2 = this.player();
        if (p2 && (n.def.neighbors.includes(p2.id) || other.def.neighbors.includes(p2.id))) {
          this.log(`${n.ar} أعلنت الحرب على ${other.ar}`, "info", { nation: other.id });
        }
      }
    }
  }

  aiConsiderPeace(n) {
    const p = this.player();
    for (const enemyId of [...n.war]) {
      const enemy = this.byId[enemyId];
      if (!enemy || !enemy.alive) {
        n.war.delete(enemyId);
        continue;
      }
      const losing = n.army < enemy.army * 0.6 || n.cells < n.originalCells * 0.55;
      if (losing && this.rng.chance(0.45)) {
        if (n.gold >= B.ceasefireCost) {
          this.propose({ type: "ceasefire", from: n.id, to: enemy.id });
        }
      } else if (p && enemyId === p.id && n.army > p.army * 0.5 && this.rng.chance(0.15)) {
        if (n.gold >= B.ceasefireCost) this.propose({ type: "ceasefire", from: n.id, to: p.id });
      }
    }
    // alliances with friendly neutrals
    if (n.ally.size === 0 && this.rng.chance(0.12 * (n.ai.personality === "trader" ? 2 : 1))) {
      const opts = n.def.neighbors
        .map((id) => this.byId[id])
        .filter((o) => o && o.alive && !n.war.has(o.id) && !o.isPlayer);
      if (opts.length) {
        const other = this.rng.pick(opts);
        if (this.aiAcceptsAlliance(other, n)) this.formAlliance(n, other);
      }
    }
  }

  aiStrike(n) {
    const p = this.player();
    if (!p || !p.alive) return;
    // only strike nations we are at war with
    const enemies = [...n.war].map((id) => this.byId[id]).filter((e) => e && e.alive);
    if (!enemies.length) return;
    if (n.army < this.capacityOf(n) * 0.5) return;
    const enemy = this.rng.pick(enemies);
    if (!enemy.capital || this.owners[enemy.capital] !== enemy.id) return;
    if (n.gold < B.missileCost || !n.buildings.some((b) => b.key === "silo" && b.cd <= 0)) return;
    this.launchStrike(n, enemy.capital);
  }

  // ------------------------------------------------------------- online jobs ---

  onlineLobby() {
    if (!this.lobby) return null;
    const hostId = this.lobby.owner;
    const hostNation = hostId != null ? this.nationOfSeat(hostId) : null;
    const ready = this.lobby.seats.every((st) => st.ready || st.disconnected);
    return {
      map: this.lobby.map || "world",
      era: this.era,
      goal: this.goal,
      mode: this.onlineMode,
      aiLevel: this.aiLevel,
      hostSeat: hostId,
      hostNation: hostNation ? { ar: hostNation.ar, x: hostNation.def.x, y: hostNation.def.y } : null,
      ready,
      seats: this.lobby.seats.map((st) => {
        const n = this.nationOfSeat(st.id);
        return {
          id: st.id,
          name: st.name,
          ready: !!st.ready,
          disconnected: !!st.disconnected,
          nationId: st.nationId,
          nation: n ? n.ar : null,
          iso: n && n.def ? n.def.iso : "",
          color: n && n.def ? n.def.color : null,
          difficulty: n && n.def ? n.def.difficulty : 1,
          cells: n ? n.cells : 0,
          start: n && n.def ? { x: n.def.x, y: n.def.y } : null,
          eliminated: st.eliminated || false,
        };
      }),
      chat: this.lobby.chat || [],
    };
  }

  setSeatReady(seat, ready) {
    const st = this.lobby && this.lobby.seats.find((x) => x.id === seat);
    if (!st) return t("مقعد غير موجود");
    st.ready = !!ready;
    return null;
  }

  setSeatNation(seat, nationId) {
    const st = this.lobby && this.lobby.seats.find((x) => x.id === seat);
    if (!st) return t("مقعد غير موجود");
    if (this.onlinePhase !== "lobby") return t("المباراة بدأت");
    const nation = this.byId[nationId];
    if (!nation || !nation.def) return t("دولة غير صالحة");
    if (this.lobby.seats.some((x) => x.id !== seat && x.nationId === nationId)) return t("الدولة محجوزة");
    const old = this.byId[st.nationId];
    st.nationId = nationId;
    st.ready = false;
    if (old) {
      old.isPlayer = false;
      old.seat = null;
      old.ai = this.makeAI(old);
      this.seatByNation.delete(old.id);
    }
    nation.isPlayer = true;
    nation.seat = seat;
    nation.ai = null;
    if (nation.capital < 0) nation.capital = this.world.capitalCandidate(nation.id);
    this.seatByNation.set(nationId, seat);
    this.log(`${st.name} اختار ${nation.ar}`, "info");
    return null;
  }

  makeAI(n) {
    const level = this.aiLevel;
    const defaults = {
      aggression: { easy: 0.5, normal: 0.78, hard: 1.05, brutal: 1.35 }[level] || 0.78,
      skill: { easy: 0.55, normal: 0.8, hard: 1.0, brutal: 1.22 }[level] || 0.8,
      buildRate: level === "easy" ? 0.6 : level === "normal" ? 1 : level === "hard" ? 1.35 : 1.7,
      sizeFactor: Math.min(1.5, Math.max(0.55, Math.log10(n.cells + 10) / 2.2)),
      nextThink: 1,
      nextBuild: 2,
      nextWar: 40,
      nextPeace: 60,
      nextDiplo: 40,
      strikes: 0,
      target: -1,
      personality: "opportunist",
      lite: n.cells < 6,
    };
    if (!n.agg) this.refreshAgg(n);
    return defaults;
  }

  setSeatDisconnected(seat, on) {
    const st = this.lobby && this.lobby.seats.find((x) => x.id === seat);
    if (!st) return;
    st.disconnected = !!on;
    if (on) {
      this.disconnected.add(seat);
      const n = this.nationOfSeat(seat);
      // the AI takes over until the player comes back
      if (n && n.alive) n.ai = n.ai || this.makeAI(n);
    } else {
      this.disconnected.delete(seat);
      const n = this.nationOfSeat(seat);
      if (n && n.alive && st.ready) n.ai = null;
    }
  }

  startOnline() {
    if (this.onlinePhase !== "lobby") return t("المباراة بدأت بالفعل");
    if (this.lobby.seats.some((st) => !st.ready && !st.disconnected)) return t("ليس كل اللاعبين جاهزين");
    this.onlinePhase = "playing";
    this.startCeasefire(this.lobby.ceasefire ?? 25);
    for (const st of this.lobby.seats) {
      const n = this.nationOfSeat(st.id);
      if (n && n.ai) n.ai = null;
      st.ready = true;
    }
    this.log(t("بدأت المباراة!"), "good");
    return null;
  }

  onlineRematch() {
    if (!this.lobby) return t("لا توجد مباراة أونلاين");
    this.result = null;
    this.winners = null;
    this.attacks = [];
    this.strikes = [];
    this.explosions = [];
    this.feed = [];
    this.offers = [];
    this.time = 0;
    this.openedAt = 0;
    this.xpTotal = 0;
    this.surrendered.clear();
    this.disconnected.clear();
    this.onlinePhase = "lobby";
    for (const n of this.nations.values()) {
      n.alive = true;
      n.cells = 0;
      n.war.clear();
      n.ally.clear();
      n.peace.clear();
      n.buildings = [];
      n.stats = { kills: 0, losses: 0, captures: 0, capitals: 0, strikes: 0, naval: 0 };
      n.fortifyUntil = 0;
      this.refreshAgg(n);
    }
    for (const st of this.lobby.seats) {
      const n = this.nationOfSeat(st.id);
      if (n) n.isPlayer = true;
    }
    this.restoreInitialOwnership();
    for (const n of this.nations.values()) {
      n.originalCells = n.cells;
      this.refreshAgg(n);
      const cap = this.capacityOf(n);
      n.army = Math.floor(cap * (n.isPlayer ? 0.45 : 0.5));
      n.gold = n.isPlayer ? 1400 : 600;
    }
    this.computeAllFrontiers();
    this.ownerVersion++;
    this.log(t("مباراة جديدة — الجميع جاهز؟"), "info");
    return null;
  }

  addChat(seat, text) {
    if (!this.lobby) return t("لا توجد غرفة");
    const st = this.lobby.seats.find((x) => x.id === seat);
    if (!st) return t("مقعد غير موجود");
    const clean = String(text || "").slice(0, 240).replace(/[<>]/g, "");
    if (!clean.trim()) return t("رسالة فارغة");
    this.lobby.chat = this.lobby.chat || [];
    this.lobby.chat.push({ seat, name: st.name, text: clean, t: Math.round(this.time) });
    if (this.lobby.chat.length > 60) this.lobby.chat.shift();
    return null;
  }

  // Snapshot used for rematches in online lobbies.
  snapshotOwnership() {
    return Int16Array.from(this.owners);
  }

  restoreInitialOwnership() {
    const snap = this.lobby && this.lobby.initialOwners;
    if (!snap || snap.length !== this.owners.length) return;
    this.owners.set(snap);
    this.dirtyCells = this.dirtyCells || [];
    this.dirtyCells.length = 0;
    this.fullRepaint = (this.fullRepaint || 0) + 1;
    this.ownerVersion = (this.ownerVersion || 0) + 1;
    this.ruins = new Set();
    for (let i = 0; i < this.owners.length; i++) {
      if (this.owners[i] === -2) this.ruins.add(i);
    }
    for (const n of this.nations.values()) n.cells = 0;
    for (let i = 0; i < this.owners.length; i++) {
      const o = this.owners[i];
      if (o >= 0) {
        const n = this.byId[o];
        if (n) n.cells++;
      }
    }
  }

  // ---------------------------------------------------------------- saving ---

  serialize() {
    const nations = [];
    for (const n of this.nations.values()) {
      nations.push({
        id: n.id,
        ar: n.ar,
        alive: n.alive,
        army: Math.round(n.army),
        gold: Math.round(n.gold),
        research: n.research,
        tech: n.tech,
        cells: n.cells,
        capital: n.capital,
        war: [...n.war],
        ally: [...n.ally],
        peace: [...n.peace],
        buildings: n.buildings.map((b) => [b.key, b.cell, b.level, Math.round(b.cd * 10) / 10]),
        stats: n.stats,
        originalCells: n.originalCells,
        ai: n.ai
          ? {
            aggression: n.ai.aggression,
            skill: n.ai.skill,
            buildRate: n.ai.buildRate,
            sizeFactor: n.ai.sizeFactor,
            personality: n.ai.personality,
            nextThink: n.ai.nextThink,
            nextBuild: n.ai.nextBuild,
            nextWar: n.ai.nextWar,
            nextPeace: n.ai.nextPeace,
            strikes: n.ai.strikes,
          }
          : null,
        isPlayer: n.isPlayer,
      });
    }
    return {
      v: 1,
      era: this.era,
      mode: this.mode,
      goal: this.goal,
      aiLevel: this.aiLevel,
      preset: this.world.preset,
      time: this.time,
      playerId: this.player()?.id ?? null,
      owners: Array.from(gridToRle(this.owners)),
      nations,
      attacks: this.attacks.map((a) => ({
        attacker: a.attacker.id,
        defender: a.defender.id,
        troops: Math.round(a.troops),
        naval: a.naval,
        landingAt: a.landingAt,
        progress: a.progress,
      })),
      feed: this.feed.slice(0, 20),
      stats: this.stats,
      attackFraction: this.attackFraction,
      melt: this.melt,
      result: this.result,
      seed: this.seedValue,
    };
  }

  static restore(save, world) {
    const game = new Game({
      world,
      era: save.era,
      mode: save.mode,
      goal: save.goal,
      aiLevel: save.aiLevel,
      playerId: save.playerId,
    });
    game.time = save.time;
    game.owners = new Int16Array(rleToGrid(Int32Array.from(save.owners), world.size));
    world.owner = game.owners;
    game.nations = new Map();
    game.byId = [];
    for (const ns of save.nations) {
      const def = world.countries[ns.id];
      const n = new Nation(def, ns.isPlayer, world);
      n._era = save.era;
      n.def = def;
      Object.assign(n, {
        alive: ns.alive,
        army: ns.army,
        gold: ns.gold,
        research: ns.research,
        tech: { ...ns.tech },
        cells: ns.cells,
        capital: ns.capital,
        war: new Set(ns.war),
        ally: new Set(ns.ally),
        peace: new Map(ns.peace),
        stats: ns.stats,
        originalCells: ns.originalCells,
      });
      n.buildings = ns.buildings.map(([key, cell, level, cd]) => ({ key, cell, level, cd }));
      if (ns.ai) n.ai = { ...ns.ai, target: -1 };
      game.nations.set(n.id, n);
      game.byId[n.id] = n;
      game.refreshAgg(n);
    }
    game.totalCells = 0;
    for (const n of game.nations.values()) game.totalCells += n.cells;
    game.computeAllFrontiers();
    for (const a of save.attacks || []) {
      const attacker = game.byId[a.attacker];
      const defender = game.byId[a.defender];
      if (!attacker || !defender) continue;
      const atk = new Attack(attacker, defender, a.troops, { naval: a.naval, landingAt: a.landingAt });
      atk.progress = a.progress;
      game.attacks.push(atk);
    }
    game.feed = save.feed || [];
    game.stats = save.stats || game.stats;
    game.attackFraction = save.attackFraction ?? 0.5;
    game.melt = !!save.melt;
    game.result = save.result || null;
    return game;
  }
}
