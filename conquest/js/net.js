// Online client: WebSocket link to the authoritative server (server.js).
// The server sends the full world state a few times per second; the client
// patches its local World/Game objects and sends player intents back.
import { World, setWorldData, rleToGrid } from "./world.js";
import { Game } from "./state.js";

const SOCKET_TIMEOUT = 9000;

export class NetClient {
  constructor() {
    this.ws = null;
    this.status = "offline"; // offline | connecting | online | error
    this.name = "";
    this.seat = null;
    this.room = null;
    this.lobby = null;
    this.lastState = null;
    this.latency = 0;
    this.listeners = new Map();
    this.pending = [];
    this.log = [];
    this.reconnectTries = 0;
  }

  on(event, fn) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(fn);
    return () => this.listeners.get(event).delete(fn);
  }

  emit(event, data) {
    const set = this.listeners.get(event);
    if (set) for (const fn of set) fn(data);
  }

  url() {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${location.host}/ws`;
  }

  // ------------------------------------------------------------- lifecycle ---

  connect(name) {
    if (this.ws && (this.status === "online" || this.status === "connecting")) {
      if (name && name !== this.name) this.send({ t: "hello", name });
      return Promise.resolve(this.status === "online");
    }
    this.name = String(name || "").trim() || `لاعب-${Math.floor(Math.random() * 900 + 100)}`;
    this.status = "connecting";
    this.emit("status", this.status);
    return new Promise((resolve) => {
      let settled = false;
      let ws;
      try {
        ws = new WebSocket(this.url());
      } catch (err) {
        this.status = "error";
        this.emit("status", this.status);
        this.emit("error", "تعذر إنشاء اتصال");
        resolve(false);
        return;
      }
      this.ws = ws;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          this.status = "error";
          this.emit("status", this.status);
          this.emit("error", "انتهت مهلة الاتصال بالخادم");
          try {
            ws.close();
          } catch {
            /* ignore */
          }
          resolve(false);
        }
      }, SOCKET_TIMEOUT);

      ws.onopen = () => {
        this.status = "online";
        this.reconnectTries = 0;
        this.emit("status", this.status);
        this.send({ t: "hello", name: this.name });
        for (const msg of this.pending.splice(0)) this.send(msg);
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(true);
        }
      };
      ws.onmessage = (ev) => {
        let msg;
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }
        this.handle(msg);
      };
      ws.onerror = () => {
        this.emit("error", "خطأ في شبكة الاتصال");
      };
      ws.onclose = () => {
        const wasOnline = this.status === "online";
        this.status = "offline";
        this.emit("status", this.status);
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          this.emit("error", "تعذر الاتصال بالخادم. الأونلاين يحتاج تشغيل خادم Node: node server.js (النسخة الثابتة على الإنترنت تلعب فردي فقط)");
          resolve(false);
        } else if (wasOnline) {
          this.emit("disconnected");
        }
      };
    });
  }

  hello(name) {
    this.name = String(name || "").slice(0, 18);
    this.send({ t: "hello", name: this.name });
  }

  send(msg) {
    if (this.ws && this.ws.readyState === 1) {
      this.ws.send(JSON.stringify(msg));
    } else {
      this.pending.push(msg);
    }
  }

  // ----------------------------------------------------------------- lobby ---

  createRoom(opts = {}) {
    this.send({ t: "create", name: this.name, ...opts });
  }

  joinRoom(code) {
    this.send({ t: "join", room: code, name: this.name });
  }

  pick(nationId) {
    this.send({ t: "pick", nationId });
  }

  ready(on) {
    this.send({ t: "ready", ready: !!on });
  }

  start() {
    this.send({ t: "start" });
  }

  chat(text) {
    this.send({ t: "chat", text });
  }

  leave() {
    this.send({ t: "leave" });
    this.room = null;
    this.seat = null;
    this.lobby = null;
    this.lastState = null;
  }

  // ---------------------------------------------------------------- actions ---

  act(a, payload = {}) {
    this.send({ t: "act", a, ...payload });
  }

  // ------------------------------------------------------------------ input ---

  handle(msg) {
    switch (msg.t) {
      case "hello":
        this.name = msg.name;
        this.seat = null;
        this.emit("hello", msg);
        break;
      case "lobby":
        this.room = msg.room;
        this.seat = msg.you;
        this.lobby = msg;
        this.emit("lobby", msg);
        break;
      case "state":
        this.lastState = msg;
        this.emit("state", msg);
        break;
      case "chat":
        this.log.push(msg);
        if (this.log.length > 80) this.log.shift();
        this.emit("chat", msg);
        break;
      case "end":
        this.finished = msg;
      this.emit("end", msg);
        break;
      case "error":
        this.emit("error", msg.text);
        break;
      case "notice":
        this.emit("notice", msg);
        break;
      case "left":
        this.room = null;
        this.seat = null;
        this.lobby = null;
        this.emit("left");
        break;
      case "pong":
        this.latency = Math.round(performance.now() - msg.ts);
        break;
      default:
        break;
    }
  }

  ping() {
    this.send({ t: "ping", ts: performance.now() });
  }
}

export const net = new NetClient();

// ---------------------------------------------------------------------------
// Client-side mirror: builds a local World + Game from the server state so the
// existing renderer, HUD and input code can be reused unchanged.
// ---------------------------------------------------------------------------

function ensureWorldData() {
  // The client already imported the map in main.js via initWorld(); reuse it.
  return import("./world.js").then((m) => m.getWorldData());
}

function stubNation(id, def) {
  return {
    id,
    ar: def.ar,
    name: def.name,
    def,
    iso: def.iso,
    originalCells: def.cells || 0,
    isPlayer: false,
    alive: true,
    cells: 0,
    army: 0,
    gold: 0,
    research: 0,
    tech: { weapons: 0, defense: 0, logistics: 0, economy: 0, population: 0, artillery: 0 },
    buildings: [],
    capital: -1,
    war: new Set(),
    ally: new Set(),
    peace: new Map(),
    frontier: new Set(),
    totalFront: 0,
    stats: { kills: 0, losses: 0, captures: 0, capitals: 0, strikes: 0, naval: 0 },
    ai: { skill: 1, aggression: 1, personality: "opportunist" },
    agg: { city: 0, factory: 0, lab: 0, port: 0, base: 0, bunker: 0, silo: 0, aa: 0 },
    seat: null,
    cap: 1,
  };
}

export class NetMirror {
  constructor(state, opts = {}) {
    this.worldData = opts.worldData;
    this.era = opts.era || "modern";
    this.preset = opts.preset || "world";
    this.seat = state.you != null ? state.you : opts.seat;
    const world = Object.create(World.prototype);
    // Rebuild a World without re-rasterising the map.
    world.meta = this.worldData.meta;
    world.w = this.worldData.meta.w;
    world.h = this.worldData.meta.h;
    world.size = world.w * world.h;
    world.era = this.era;
    world.preset = this.preset;
    world.countries = this.worldData.countries.map((c) => ({ ...c, color: colorOf(c.id, this.era) }));
    world.active = world.countries.map(() => true);
    world.owner = new Int16Array(world.size).fill(-1);
    world.ruins = new Set();
    world.cellCount = new Int32Array(world.countries.length);
    world.msOwnerVersion = -1;
    this.world = world;

    const game = Object.create(Game.prototype);
    game.world = world;
    game.owners = world.owner;
    game.era = this.era;
    game.eraIndex = 0;
    game.mode = "world";
    game.goal = state.goal || 0.5;
    game.aiLevel = opts.aiLevel || "normal";
    game.time = 0;
    game.paused = false;
    game.speed = 1;
    game.attacks = [];
    game.strikes = [];
    game.explosions = [];
    game.feed = [];
    game.offers = [];
    game.result = state.result || null;
    game.stats = { attacks: 0, conquered: 0, lost: 0, built: 0 };
    game.nations = new Map();
    game.byId = [];
    game.attackFraction = 0.5;
    game.melt = false;
    game.openedAt = 0;
    game.ceasefireEndsAt = 0;
    game.ownerVersion = 1;
    game.warVersion = 1;
    game.dirtyCells = [];
    game.daily = null;
    game.onlineMode = opts.mode || "normal";
    game.humanCount = 0;
    game.disconnected = new Set();
    game.surrendered = new Set();
    game.xpTotal = 0;
    game.medals = new Set();
    game.lobby = { seats: [], you: this.seat };
    game.seatOf = new Map();
    game.seatByNation = new Map();
    game.totalCells = 0;
    game.mySeat = this.seat;

    for (let i = 0; i < world.countries.length; i++) {
      const def = world.countries[i];
      const n = stubNation(i, def);
      game.nations.set(i, n);
      game.byId[i] = n;
    }
    this.world.buildShade();
    this.world.buildCoast();
    game.remote = true;
    game.mySeat = this.seat;
    game.isOnline = true;
    // the mirror's "player" is always the nation of this client's seat
    game.player = () => this.me || null;
    game.onlinePhase = "lobby";
    game.capacityOf = (n) => n.cap || 1;
    game.researchCost = (key, n) => 60 + (n.tech[key] || 0) * 45;
    game.resourceRate = (n) => ({
      gold: 2.2 + (n.agg ? (n.agg.factory || 0) * 17 : 0),
      research: 0.35 + (n.agg ? (n.agg.lab || 0) * 0.55 : 0),
    });
    game.troopRate = () => 0;
    game.attackMult = () => 1;
    game.defenseMult = () => 1;
    game.rankName = () => "قائد";
    game.rankIndex = () => 0;
    game.hasPort = (n) => !!(n.agg && n.agg.port);
    game.adjacent = (a, b) => !!(a.def && a.def.neighbors.includes(b.id));
    game.relationLabel = (a, b) => (a.ally.has(b.id) ? "حليف" : a.war.has(b.id) ? "حرب" : "محايد");
    game.rel = (a, b) => (a.ally.has(b.id) ? "ally" : a.war.has(b.id) ? "war" : "neutral");
    this.game = game;
    this.apply(state);
  }

  apply(state) {
    const game = this.game;
    const world = this.world;
    game.time = state.time || 0;
    game.openedAt = 0;
    game.ceasefireEndsAt = game.time + (state.ceasefireLeft || 0);
    game.goal = state.goal || game.goal;
    game.result = state.result || null;
    game.winners = state.winners || null;
    game.onlinePhase = state.phase || game.onlinePhase;

    // ownership grid (sent only when it changed)
    if (state.owners) {
      const grid = rleToGrid(decodeB64(state.owners), world.size);
      let changed = false;
      for (let i = 0; i < world.size; i++) {
        if (grid[i] !== world.owner[i]) {
          world.owner[i] = grid[i];
          game.dirtyCells.push(i);
          changed = true;
        }
      }
      if (changed) {
        if (game.dirtyCells.length > 20000) {
          game.dirtyCells.length = 0;
          game.fullRepaint = (game.fullRepaint || 0) + 1;
        }
        game.ownerVersion++;
      }
      // cell counts
      world.cellCount.fill(0);
      let total = 0;
      for (let i = 0; i < world.size; i++) {
        const o = world.owner[i];
        if (o >= 0) {
          world.cellCount[o]++;
          total++;
        }
      }
      game.totalCells = total;
    }

    // seats -> nations
    game.nations.forEach((n) => {
      n.isPlayer = false;
      n.seat = null;
      n.alive = false;
      n.war = new Set();
      n.ally = new Set();
    });
    for (const s of state.seats || []) {
      const n = s.nationId != null ? game.byId[s.nationId] : null;
      if (!n) continue;
      n.isPlayer = true;
      n.seat = s.seat;
      n.alive = s.alive !== false;
      n.army = s.army || 0;
      n.cells = s.cells != null ? s.cells : world.cellCount[n.id] || 0;
      n.cap = s.cap || n.cap;
      n.gold = s.gold || 0;
      n.research = s.research || 0;

    }

    // everything else alive
    game.nations.forEach((n) => {
      if (n.seat == null) {
        n.alive = world.cellCount[n.id] > 0;
        n.cells = world.cellCount[n.id];
      }
      n.cap = Math.max(1, game.capacityOf(n));
    });

    // my nation
    if (state.nation) {
      const me = game.byId[state.nation.id];
      if (me) {
        this.me = me;
        me.army = state.nation.army;
        me.gold = state.nation.gold;
        me.research = state.nation.research;
        me.tech = state.nation.tech;
        me.buildings = state.nation.buildings.map(([key, cell, level, cd]) => ({ key, cell, level, cd }));
        me.war = new Set(state.nation.wars);
        me.ally = new Set(state.nation.allies);
        me.cells = state.nation.cells;
        me.capital = state.nation.capital;
        me.stats = state.nation.stats;
        me.fortifyUntil = game.time + (state.nation.fortifyLeft || 0);
        me.alive = state.nation.alive;
        me.out = !!state.nation.out;
        me.seat = state.you;
        me.isPlayer = true;
        me.def = me.def || world.countries[me.id];
        this.refreshAgg(me);
      }
    }
    // wars of other humans (from attacks + seats)
    for (const s of state.seats || []) {
      const n = s.nationId != null ? game.byId[s.nationId] : null;
      if (!n || n.seat == null) continue;
      const enemyId = state.warsBySeat && state.warsBySeat[s.seat];
      if (enemyId) for (const id of enemyId) n.war.add(id);
    }

    // attacks
    game.attacks = (state.attacks || []).map((a) => {
      const attacker = game.byId[a.a];
      const defender = game.byId[a.d];
      return {
        id: a.id,
        attacker,
        defender,
        troops: a.troops,
        active: true,
        ratio: a.ratio,
        naval: a.naval,
        landed: !a.naval && a.landing >= 0,
        landingAt: a.landing,
        landingTimer: 0,
        // the exact frontier geometry is server-side; the client only needs
        // the endpoints to draw the arrow and the arrowhead position
        fronts: [[a.landing >= 0 ? a.landing % this.game.world.w : attacker.def.x,
                  a.landing >= 0 ? Math.floor(a.landing / this.game.world.w) : attacker.def.y]],
        progress: 0,
      };
    });

    game.feed = (state.feed || []).slice();
    game.seats = state.seats || [];
    game.offers = (state.offers || []).slice();
    game.lobby.chat = state.chat || [];
    if (state.seatNames) {
      game.lobby.seats = state.seats.map((s) => ({
        id: s.seat,
        name: s.name,
        nationId: s.nationId,
        disconnected: !s.connected,
      }));
    }
    this.ownerVersion = state.ownerVersion;
  }

  // The mirror never simulates, but the HUD asks for the player's land share.
  get ceasefireLeft() {
    return Math.max(0, this.game.ceasefireEndsAt - this.game.time);
  }

  playerShare() {
    const p = this.me;
    if (!p) return 0;
    return p.cells / Math.max(1, this.game.totalCells);
  }

  refreshAgg(n) {
    const agg = { city: 0, factory: 0, lab: 0, port: 0, base: 0, bunker: 0, silo: 0, aa: 0, byKey: {} };
    for (const b of n.buildings) {
      if (!(b.key in agg)) continue;
      agg[b.key] += b.level;
      (agg.byKey[b.key] ||= []).push(b);
    }
    n.agg = agg;
  }
}

function colorOf(index, era) {
  // Same palette function as the local game (kept in sync with world.js).
  const HUES = [8, 32, 48, 88, 120, 150, 170, 192, 210, 232, 258, 282, 305, 332];
  const tint = {
    ancient: { sat: 0.34, light: 0.62, warm: 10 },
    medieval: { sat: 0.36, light: 0.58, warm: 4 },
    sail: { sat: 0.4, light: 0.56 },
    imperial: { sat: 0.34, light: 0.56, warm: -4 },
    modern: { sat: 0.42, light: 0.55, warm: 0 },
  }[era] || { sat: 0.42, light: 0.55, warm: 0 };
  const hue = HUES[index % HUES.length] + (Math.floor(index / HUES.length) * 17) % 30;
  const jitter = ((index * 37) % 13) - 6;
  const h = (((hue + (tint.warm || 0) + jitter) % 360) + 360) % 360;
  const s = tint.sat;
  const l = tint.light + ((index * 11) % 7) * 0.008;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  return {
    r: Math.round(Math.min(255, Math.max(0, (r + m) * 255))),
    g: Math.round(Math.min(255, Math.max(0, (g + m) * 255))),
    b: Math.round(Math.min(255, Math.max(0, (b + m) * 255))),
  };
}

function decodeB64(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Int32Array(bytes.buffer, 0, bytes.length >> 2);
}

export async function buildMirror(state, opts = {}) {
  const worldData = await ensureWorldData();
  return new NetMirror(state, { ...opts, worldData });
}
