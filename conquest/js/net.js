// Online client: WebSocket link to the authoritative server (server.js).
// The server sends the full world state a few times per second; the client
// patches its local World/Game objects and sends player intents back.
import { World, setWorldData, rleToGrid } from "./world.js";
import { Game } from "./state.js";

const SOCKET_TIMEOUT = 12000;

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
    // "Play now" is resolved client-side from the room list, so it works on the
    // older server (which has no `quickjoin` message) as well as the new one.
    this.wantPublic = false;
    this.quickOpts = {};
    this.quickTimer = null;
  }

  on(event, fn) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(fn);
    return () => this.listeners.get(event).delete(fn);
  }

  once(event, fn) {
    const off = this.on(event, (data) => {
      off();
      fn(data);
    });
    return off;
  }

  emit(event, data) {
    const set = this.listeners.get(event);
    if (set) for (const fn of set) fn(data);
  }

  // ---------------------------------------------------------------- server ---
  //
  // The published game is a static page (Vercel). A static host cannot hold a
  // WebSocket open, so on such a page the browser dials the one address that
  // can run the match: ONLINE_SERVER. Browsers allow that cross-origin — the
  // server answers directly, there is no proxy — which is what gives the public
  // link real online play instead of a local-only demo.
  //
  // Everywhere else (localhost, Fly/Docker, any real game server) the page and
  // the server share an origin and the derived URL is used, exactly as before.
  static get ONLINE_SERVER() {
    return "wss://conquest-online-8129.fly.dev/ws";
  }

  // Hosts that serve the static page and nothing else.
  static isStaticHost(host) {
    const h = String(host || "").split(":")[0].toLowerCase();
    if (!h) return true; // file:// or opaque origin
    return (
      h.endsWith(".vercel.app") ||
      h.endsWith(".now.sh") ||
      h.endsWith(".netlify.app") ||
      h.endsWith(".pages.dev") ||
      h.endsWith(".github.io") ||
      h.endsWith(".web.app") ||
      h.endsWith(".surge.sh")
    );
  }

  // ?server=wss://host/ws  (remembered for the session) redirects the client to
  // a different server without a redeploy — useful for a custom domain.
  static override() {
    try {
      const q = new URLSearchParams(location.search).get("server");
      if (q) {
        localStorage.setItem("conquest.server", q);
        return q;
      }
      return localStorage.getItem("conquest.server") || "";
    } catch {
      return "";
    }
  }

  // True when this page cannot host the game itself and must use ONLINE_SERVER.
  static needsRemote() {
    return NetClient.isStaticHost(location.host) && !NetClient.override();
  }

  url() {
    const forced = NetClient.override();
    if (forced) return forced;
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    if (NetClient.needsRemote()) return NetClient.ONLINE_SERVER;
    return `${proto}//${location.host}/ws`;
  }

  get remote() {
    return this.url() === NetClient.ONLINE_SERVER;
  }

  // ------------------------------------------------------------- lifecycle ---

  connect(name) {
    if (this.ws && (this.status === "online" || this.status === "connecting")) {
      if (name && name !== this.name) this.send({ t: "hello", name, proto: NetClient.PROTOCOL });
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
        this.send({ t: "hello", name: this.name, proto: NetClient.PROTOCOL });
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
          this.emit(
            "error",
            this.remote
              ? "خادم الأونلاين لا يستجيب الآن — أعد المحاولة بعد قليل (اللعب الفردي يعمل دائمًا)"
              : "تعذر الاتصال بالخادم. محليًا شغّله بـ: node server.js"
          );
          resolve(false);
        } else if (wasOnline) {
          this.emit("disconnected");
          this.scheduleReconnect();
        }
      };
    });
  }

  // A match keeps running on the server while our socket is down (the server
  // hands the nation to the AI). Without this the page stayed frozen forever:
  // the player stared at a dead map with no way back into their own match.
  scheduleReconnect() {
    if (this.reconnectTries < 0) return;
    if (!this.room && !this.lastState) return; // nothing to come back to
    clearTimeout(this.reconnectTimer);
    this.reconnectTries = (this.reconnectTries || 0) + 1;
    // 1s, 2s, 4s … capped at 8s, and give up after ~1 minute of trying.
    const delay = Math.min(8000, 1000 * Math.pow(2, Math.min(4, this.reconnectTries - 1)));
    if (this.reconnectTries > 12) {
      this.emit("error", "تعذر استعادة الاتصال بالمباراة. أعد تحميل الصفحة للدخول من جديد");
      return;
    }
    this.emit("reconnecting", { in: delay, attempt: this.reconnectTries });
    this.reconnectTimer = setTimeout(async () => {
      if (this.status === "online") return;
      const room = this.room;
      const name = this.name;
      this.status = "offline"; // force a fresh socket
      this.ws = null;
      const ok = await this.connect(name);
      if (!ok) return; // onclose will schedule the next try
      if (room) this.joinRoom(room);
      this.emit("reconnected", { room });
    }, delay);
  }

  // Bumped whenever the wire format changes in a way an older page cannot
  // read. A tab that was already open when the server was updated keeps its
  // old JavaScript, so the server must be told which format to speak — the
  // alternative is a map that silently stops moving for that player.
  static get PROTOCOL() {
    return 2; // 2 = delta patches (ownersDelta)
  }

  hello(name) {
    this.name = String(name || "").slice(0, 18);
    this.send({ t: "hello", name: this.name, proto: NetClient.PROTOCOL });
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
    // `seat` lets the server hand a returning player their own nation back
    // instead of refusing the join or starting them fresh.
    this.send({ t: "join", room: code, name: this.name, seat: this.seat });
  }

  // Ask for the public worlds. Resolves with the list, or null when the server
  // does not answer (an older build that has no `rooms` message yet).
  listRooms(timeout = 1600) {
    const seen = this.roomList;
    this.send({ t: "rooms" });
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(this.roomList !== seen ? this.roomList : null), timeout);
      this.once("roomlist", (list) => {
        clearTimeout(timer);
        resolve(list);
      });
    });
  }

  // "Play now": join the fullest open world, or open one. Driven by the room
  // list rather than a server-side `quickjoin`, so it also works on a server
  // that predates public worlds — it simply creates a room instead.
  quickJoin(opts = {}) {
    this.wantPublic = true;
    this.quickOpts = opts;
    this.emit("searching", true);
    this.send({ t: "rooms" });
    clearTimeout(this.quickTimer);
    this.quickTimer = setTimeout(() => {
      if (!this.wantPublic) return;
      this.wantPublic = false;
      this.emit("searching", false);
      if (this.status !== "online") return;
      this.emit("notice", { text: "لا توجد عوالم مفتوحة — فتحت لك عالمًا جديدًا", soft: true });
      this.createRoom(this.quickOpts || {});
    }, 1800);
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
    clearTimeout(this.reconnectTimer);
    this.reconnectTries = 0;
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
      case "roomlist": {
        this.roomList = msg.rooms || [];
        this.emit("roomlist", this.roomList);
        if (this.wantPublic) {
          this.wantPublic = false;
          clearTimeout(this.quickTimer);
          this.emit("searching", false);
          const open = this.roomList.filter((r) => r.players < (r.max || 8));
          if (open.length) {
            // Fullest lobby first, so players meet instead of spreading out.
            open.sort((a, b) => b.players - a.players);
            this.emit("notice", { text: `انضممت إلى العالم ${open[0].code}`, soft: true });
            this.joinRoom(open[0].code);
          } else {
            this.createRoom(this.quickOpts || {});
          }
        }
        break;
      }
      case "joined":
        this.emit("joined", msg);
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

    // --- ownership: full grid or delta patch ---
    // The server sends a patch (a few bytes) for the handful of cells that
    // moved, and only falls back to the full grid on first join / reconnect.
    // Patches reference the exact grid they were derived from, so a mismatch
    // simply means "wait for the next full grid" instead of corrupting the map.
    if (state.ownersDelta) {
      if (state.ownersFrom === this.gridVersion && this.gridVersion != null) {
        const { cells, owners } = decodePatch(state.ownersDelta);
        for (let k = 0; k < cells.length; k++) {
          const i = cells[k];
          if (i < 0 || i >= world.size) continue;
          if (world.owner[i] === owners[k]) continue;
          world.owner[i] = owners[k];
          game.dirtyCells.push(i);
        }
        this.gridVersion++;
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
        game.ownerVersion++;
        if (game.dirtyCells.length > 20000) {
          game.dirtyCells.length = 0;
          game.fullRepaint = (game.fullRepaint || 0) + 1;
        }
      }
    } else if (state.owners) {
      this.gridVersion = state.ownersVersion ?? 0;
      const grid = rleToGrid(decodeVarintPairs(state.owners), world.size);
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
  return bytes;
}

// Owners map: base64 of LEB128 varint pairs [zigzaggedOwner, runLength].
// ~58 KB for the whole world instead of ~180 KB as int32 — the difference
// between a match that keeps up and one that freezes the socket.
// Decode a delta patch: pairs of (zigzag(cellIndex - previous), zigzag(owner)).
// Mirrors encodePatch() in server.js.
function decodePatch(b64) {
  const bytes = decodeB64(b64);
  const cells = [];
  const owners = [];
  let i = 0;
  let pos = 0;
  while (i < bytes.length) {
    let shift = 0;
    let v = 0;
    let b;
    do {
      b = bytes[i++];
      v |= (b & 0x7f) << shift;
      shift += 7;
    } while (b & 0x80 && i < bytes.length);
    pos += (v >>> 1) ^ -(v & 1);
    let shift2 = 0;
    let o = 0;
    let c;
    do {
      c = bytes[i++];
      o |= (c & 0x7f) << shift2;
      shift2 += 7;
    } while (c & 0x80 && i < bytes.length);
    const owner = (o >>> 1) ^ -(o & 1);
    cells.push(pos);
    owners.push(owner);
  }
  return { cells, owners };
}

function decodeVarintPairs(b64) {
  const bytes = decodeB64(b64);
  const out = [];
  let i = 0;
  const next = () => {
    let shift = 0;
    let val = 0;
    for (;;) {
      const b = bytes[i++];
      if (b === undefined) return -1;
      val += (b & 0x7f) * Math.pow(2, shift);
      if ((b & 0x80) === 0) return val;
      shift += 7;
    }
  };
  for (;;) {
    const u = next();
    if (u < 0) break;
    const run = next();
    if (run < 0) break;
    out.push(u & 1 ? -((u + 1) / 2) : u / 2, run);
  }
  return Int32Array.from(out);
}

export async function buildMirror(state, opts = {}) {
  const worldData = await ensureWorldData();
  return new NetMirror(state, { ...opts, worldData });
}
