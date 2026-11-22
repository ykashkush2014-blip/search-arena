// Zero-dependency HTTP + WebSocket server for CONQUEST.
//
//   node server.js [port]
//
// Serves the static game and hosts online lobbies over a hand-rolled RFC 6455
// WebSocket endpoint (/ws). Rooms are in-memory, one Game instance per room,
// and the simulation runs here (server-authoritative) at 4 ticks/second.
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
// The pinned bootstrap page lives in js/deploypage.js so serverless bundlers
// (Vercel) always trace and include it. Reading deploy/index.html from disk was
// unreliable: includeFiles did not pick it up and "/" returned raw plain text.
import { deployPage, DEPLOY_REF } from "./js/deploypage.js";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
// Serverless hosts cannot serve the game files themselves (no writable disk and
// unreliable file tracing), so there "/" must return the CDN bootstrap.
// Locally we serve the real build so the live preview always reflects the code.
const CAN_BOOTSTRAP = !!process.env.VERCEL;
// Which revision this process serves. Fly/Docker pass GIT_SHA at build time;
// locally we fall back to a marker so a stale process is visible in /health.
const BUILD = (process.env.GIT_SHA || process.env.FLY_IMAGE_REF || "dev").slice(0, 12);
const PORT = Number(process.argv[2] || process.env.PORT || 5173);
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

// ------------------------------------------------------------------ static ---

const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || "/").split("?")[0]);
  // The published page is served from another origin (Vercel) and dials this
  // server directly, so probes like /health must be readable cross-origin.
  // Only the plain-HTTP endpoints need this: the WebSocket handshake is not
  // subject to CORS, and nothing here is authenticated.
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-headers", "content-type");
  if (req.method === "OPTIONS") {
    res.writeHead(204, { "access-control-max-age": "86400" });
    res.end();
    return;
  }
  if (url === "/health") {
    // `build` lets anyone (and publish.sh) confirm which revision is actually
    // running. Without it a stale deploy looks healthy while serving old code.
    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size, clients: clients.size, build: BUILD }));
    return;
  }
  // "/" serves the tiny pinned bootstrap (works on serverless: it loads the
  // game from the CDN). "/play" always serves the full local build, which is
  // what the Node server and the live-preview use (the bootstrap needs the
  // commit to be pushed to GitHub first, so it can lag behind local edits).
  if ((url === "/" || url === "/index.html") && CAN_BOOTSTRAP) {
    res.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-cache",
    });
    res.end(deployPage(DEPLOY_REF));
    return;
  }
  let file = path.join(ROOT, url === "/" || url === "/play" ? "index.html" : url);
  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end("forbidden");
    return;
  }
  fs.stat(file, (err, st) => {
    if (err || st.isDirectory()) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("not found");
      return;
    }
    res.writeHead(200, {
      "content-type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream",
      "cache-control": "no-cache",
    });
    fs.createReadStream(file).pipe(res);
  });
});

// --------------------------------------------------------------- websocket ---

const MAGIC = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const clients = new Set(); // open sockets

function wsHandshake(req, socket) {
  const key = req.headers["sec-websocket-key"];
  if (!key) {
    socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
    return null;
  }
  const accept = crypto.createHash("sha1").update(key + MAGIC).digest("base64");
  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
      "Upgrade: websocket\r\n" +
      "Connection: Upgrade\r\n" +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
  );
  const client = { socket, buffer: Buffer.alloc(0), open: true, id: Math.random().toString(36).slice(2) };
  clients.add(client);
  // Fly's edge proxy closes connections that look idle. A lobby can sit quiet
  // for minutes while players pick nations, so every socket gets a ping.
  client.keep = setInterval(() => sendFrame(client, 0x9, Buffer.alloc(0)), 20000);
  if (client.keep.unref) client.keep.unref();
  socket.on("data", (chunk) => {
    client.buffer = Buffer.concat([client.buffer, chunk]);
    try {
      readFrames(client);
    } catch {
      closeClient(client);
    }
  });
  const drop = () => closeClient(client);
  socket.on("close", drop);
  socket.on("error", drop);
  socket.on("end", drop);
  return client;
}

function closeClient(client) {
  if (!client.open) return;
  client.open = false;
  if (client.keep) clearInterval(client.keep);
  client.keep = null;
  clients.delete(client);
  try {
    client.socket.destroy();
  } catch {
    /* ignore */
  }
  if (client.onClose) client.onClose();
}

function readFrames(client) {
  for (;;) {
    const buf = client.buffer;
    if (buf.length < 2) return;
    const b0 = buf[0];
    const b1 = buf[1];
    const opcode = b0 & 0x0f;
    const masked = (b1 & 0x80) !== 0;
    let len = b1 & 0x7f;
    let offset = 2;
    if (len === 126) {
      if (buf.length < offset + 2) return;
      len = buf.readUInt16BE(offset);
      offset += 2;
    } else if (len === 127) {
      if (buf.length < offset + 8) return;
      const big = buf.readBigUInt64BE(offset);
      if (big > 8n * 1024n * 1024n) {
        closeClient(client);
        return;
      }
      len = Number(big);
      offset += 8;
    }
    let mask = null;
    if (masked) {
      if (buf.length < offset + 4) return;
      mask = buf.subarray(offset, offset + 4);
      offset += 4;
    }
    if (buf.length < offset + len) return;
    let payload = Buffer.from(buf.subarray(offset, offset + len));
    if (mask) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
    client.buffer = buf.subarray(offset + len);

    if (opcode === 0x8) {
      closeClient(client);
      return;
    }
    if (opcode === 0x9) {
      sendFrame(client, 0xa, payload);
      continue;
    }
    if (opcode === 0x1) {
      let msg = null;
      try {
        msg = JSON.parse(payload.toString("utf8"));
      } catch {
        msg = null;
      }
      if (msg && client.onMessage) client.onMessage(msg);
    }
  }
}

function sendFrame(client, opcode, payload) {
  if (!client.open) return;
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  header[0] = 0x80 | opcode;
  try {
    client.socket.write(Buffer.concat([header, payload]));
  } catch {
    closeClient(client);
  }
}

function sendJSON(client, obj) {
  sendFrame(client, 0x1, Buffer.from(JSON.stringify(obj), "utf8"));
}

// ------------------------------------------------------------------- rooms ---

const rooms = new Map();
let roomSeq = 1000;
const corePromise = import("./js/core.js");

function makeCode(rng) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 4; i++) out += alphabet[Math.floor(rng() * alphabet.length)];
  return out;
}

class Room {
  constructor(code) {
    this.code = code;
    this.players = []; // { seat, name, client, connected, eliminated }
    this.game = null;
    this.phase = "lobby"; // lobby | playing | ended
    this.createdAt = Date.now();
    this.lastAt = Date.now();
    this.timer = null;
    this.tickMs = 250;
    this.dirtyBroadcast = false;
    this.chat = [];
    this.map = "world";
    this.era = "modern";
    this.goal = 0.5;
    this.aiLevel = "normal";
    this.mode = "normal"; // normal | coop | ffa
    this.public = true; // listed in the room browser (no code typing needed)
    // Last ownership version sent to this room's players: the map is attached
    // to a state message only when it moves past this.
    this.lastSentGridVersion = -1;
  }

  get hostSeat() {
    return this.players.length ? this.players[0].seat : null;
  }

  broadcast(obj, except) {
    for (const p of this.players) {
      if (!p.connected || p.client === except) continue;
      sendJSON(p.client, obj);
    }
  }

  addPlayer(name, client) {
    if (this.phase !== "lobby" && this.phase !== "ended") return null;
    const used = new Set(this.players.map((p) => p.seat));
    let seat = 0;
    while (used.has(seat)) seat++;
    const player = {
      seat,
      name: String(name || "لاعب").slice(0, 18),
      client,
      connected: true,
      eliminated: false,
    };
    this.players.push(player);
    this.players.sort((a, b) => a.seat - b.seat);
    client.player = player;
    client.room = this;
    return player;
  }

  removePlayer(player) {
    player.connected = false;
    if (this.phase === "playing" && this.game) {
      this.game.setSeatDisconnected(player.seat, true);
      this.broadcast({ t: "notice", text: `${player.name} انقطع — الذكاء الاصطناعي يدير دولته` });
      this.broadcastState();
    } else {
      this.players = this.players.filter((p) => p !== player);
      if (!this.players.length) this.destroy();
      else this.broadcastLobby();
    }
  }

  destroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    rooms.delete(this.code);
  }

  snapshotState() {
    const game = this.game;
    if (!game) return null;
    const seats = this.players.map((p) => {
      const n = game.nationOfSeat(p.seat);
      return {
        seat: p.seat,
        name: p.name,
        connected: p.connected,
        nationId: n ? n.id : null,
        nation: n ? n.ar : null,
        iso: n && n.def ? n.def.iso : "",
        color: n && n.def ? n.def.color : null,
        alive: n ? n.alive : false,
        out: this.game.surrendered.has(p.seat),
        cells: n ? n.cells : 0,
        army: n ? Math.round(n.army) : 0,
        cap: n ? Math.round(n.cap || 0) : 0,
        gold: n ? Math.round(n.gold) : 0,
        research: n ? Math.round(n.research) : 0,
        buildings: n ? n.buildings.length : 0,
        wars: n ? [...n.war].length : 0,
      };
    });
    // Only the frontier of a nation's own wars changes often: send everything,
    // the client recomputes the map from the RLE below.
    const pub = {
      t: "state",
      time: Math.round(game.time * 100) / 100,
      phase: game.onlinePhase,
      result: game.result,
      winners: game.winners || null,
      goal: game.goal,
      ceasefireLeft: Math.round(game.ceasefireLeft * 10) / 10,
      seats,
      ownerVersion: game.ownerVersion,
      attacks: seatAttacks(game),
      feed: game.feed.slice(0, 12),
      offers: game.offers.map((o) => ({ id: o.id, from: o.from, to: o.to, type: o.type })),
      chat: game.lobby.chat,
    };
    return pub;
  }

  broadcastState() {
    const pub = this.snapshotState();
    if (!pub) return;
    // Only ship the map when ownership changed since the previous broadcast —
    // that was the difference between ~1.7 MB/s and a few KB/s per player.
    const base = { ...pub };
    if (this.game.ownerVersion !== this.lastSentGridVersion) {
      base.owners = encodeOwners(this.game);
      base.ownersVersion = this.game.ownerVersion;
      this.lastSentGridVersion = this.game.ownerVersion;
    }
    for (const p of this.players) {
      if (!p.connected) continue;
      sendJSON(p.client, this.stateForSeat(base, p.seat));
    }
  }

  stateForSeat(base, seat) {
    // per-seat economy numbers
    const n = this.game.nationOfSeat(seat);
    return {
      ...base,
      you: seat,
      nation: n
        ? {
          id: n.id,
          cells: n.cells,
          army: Math.round(n.army),
          cap: Math.round(n.cap || 0),
          gold: Math.round(n.gold),
          research: Math.round(n.research),
          tech: n.tech,
          buildings: n.buildings.map((b) => [b.key, b.cell, b.level, Math.round(b.cd * 10) / 10]),
          wars: [...n.war],
          allies: [...n.ally],
          alive: n.alive,
          out: this.game.surrendered.has(seat),
          capital: n.capital,
          stats: n.stats,
          fortifyLeft: Math.max(0, Math.round(((n.fortifyUntil || 0) - this.game.time) * 10) / 10),
        }
        : null,
    };
  }

  start() {
    if (this.game && this.phase === "playing") return "المباراة بدأت";
    if (this.players.some((p) => !p.ready && p.connected)) return "ليس كل اللاعبين جاهزين";
    if (this.players.length < 2) return "تحتاج لاعبين اثنين على الأقل";
    if (this.game && this.phase === "ended") {
      this.game.onlineRematch();
      this.phase = "lobby";
      for (const p of this.players) {
        p.eliminated = false;
        p.ready = true;
      }
      const err = this.game.startOnline();
      if (err) {
        this.game.onlinePhase = "lobby";
        return err;
      }
      this.phase = "playing";
      this.timer = setInterval(() => this.tick(), this.tickMs);
      this.broadcastLobby();
      this.broadcastState();
      return null;
    }
    this.phase = "playing";
    this.buildGame();
    const err = this.game.startOnline();
    if (err) {
      this.phase = "lobby";
      this.game.onlinePhase = "lobby";
      return err;
    }
    this.timer = setInterval(() => this.tick(), this.tickMs);
    this.broadcastLobby();
    this.broadcastState();
    return null;
  }

  buildGame() {
    const core = coreSync;
    if (!core) throw new Error("core not ready");
    const world = new core.World(this.map, this.era);
    const seats = this.players.map((p, i) => {
      const chosen = p.nationId != null ? world.countries[p.nationId] : null;
      const nationId = chosen ? chosen.id : pickStartNation(world, i, this.players.length);
      return { id: p.seat, name: p.name, nationId, ready: true };
    });
    // resolve duplicate picks (second player with the same nation gets a random)
    const taken = new Set();
    for (const s of seats) {
      if (taken.has(s.nationId)) s.nationId = pickStartNation(world, s.id + 3, this.players.length);
      taken.add(s.nationId);
    }
    const lobby = { owner: this.hostSeat, seats, chat: this.chat };
    this.game = new core.Game({
      world,
      era: this.era,
      mode: "world",
      goal: this.goal,
      aiLevel: this.aiLevel,
      lobby,
      onlineMode: this.mode,
    });
    this.game.lobby = lobby;
    lobby.seats = seats;
    this.game.lobby.initialOwners = this.game.snapshotOwnership();
    this.game.lobby.ceasefire = 25;
    this.game.onlinePhase = "lobby";
    this.game.onEnd = (summary) => {
      this.phase = "ended";
      this.game.onlinePhase = "ended";
      for (const p of this.players) {
        const n = this.game.nationOfSeat(p.seat);
        p.eliminated =
          !(n && n.alive) ||
          this.game.surrendered.has(p.seat) ||
          (this.game.winners && !this.game.winners.includes(p.seat));
      }
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
      const results = this.players.map((p) => {
        const n = this.game.nationOfSeat(p.seat);
        return {
          seat: p.seat,
          name: p.name,
          nation: n ? n.ar : "—",
          cells: n ? n.cells : 0,
          share: n ? n.cells / Math.max(1, this.game.totalCells) : 0,
          survived: !!(n && n.alive),
          won: !!(this.game.winners && this.game.winners.includes(p.seat)) && !this.game.surrendered.has(p.seat),
          surrendered: this.game.surrendered.has(p.seat),
        };
      });
      const backToLobby = setTimeout(() => {
        if (this.phase !== "ended" || !this.game || !this.game.result) return;
        this.phase = "lobby";
        this.game.onlinePhase = "lobby";
        for (const p of this.players) {
          p.ready = false;
          p.eliminated = false;
        }
        this.broadcastLobby();
      }, 1200);
      if (backToLobby.unref) backToLobby.unref();
      this.broadcast({
        t: "end",
        result: summary.result,
        reason: summary.reason || null,
        by: summary.by != null ? this.game.byId[summary.by]?.ar || null : null,
        winners: this.game.winners,
        time: Math.round(this.game.time),
        results,
      });
      this.broadcastState();
    };
  }

  tick() {
    this.lastAt = Date.now();
    if (!this.game || this.phase !== "playing") return;
    const t0 = Date.now();
    try {
      this.game.update(this.tickMs / 1000);
    } catch (err) {
      console.error("[room " + this.code + "] update failed:", err);
      return;
    }
    const budget = Date.now() - t0;
    // keep the wall clock honest: run a catch-up tick if the sim was too slow
    if (budget > this.tickMs) this.game.update(Math.min(1, (budget - this.tickMs) / 1000));
    if (this.game.result) {
      this.phase = "ended";
      return;
    }
    this.broadcastState();
  }

  broadcastLobby() {
    for (const p of this.players) {
      if (!p.connected) continue;
      sendJSON(p.client, { t: "lobby", ...this.lobbyView(p) });
    }
  }

  lobbyView(viewer = null) {
    const game = this.game;
    let world = null;
    try {
      world = worldFor(this.map, this.era);
    } catch {
      world = null;
    }
    const nationInfo = (seat, nationId) => {
      const n = game ? game.nationOfSeat(seat) : null;
      if (n) return { nationId: n.id, nation: n.ar, iso: n.def.iso, color: n.def.color, difficulty: n.def.difficulty, cells: n.cells, start: { x: n.def.x, y: n.def.y } };
      const id = nationId != null ? nationId : null;
      const c = id != null && world ? world.countries[id] : null;
      return {
        nationId: id,
        nation: c ? c.ar : null,
        iso: c ? c.iso : "",
        color: c ? c.color : null,
        difficulty: c ? c.difficulty : 1,
        cells: c ? c.cells : 0,
        start: c ? { x: c.x, y: c.y } : null,
      };
    };
    return {
      room: this.code,
      phase: this.phase,
      map: this.map,
      era: this.era,
      goal: this.goal,
      mode: this.mode,
      aiLevel: this.aiLevel,
      hostSeat: this.hostSeat,
      seats: this.players.map((p) => ({
        seat: p.seat,
        name: p.name,
        ready: !!p.ready,
        connected: p.connected,
        eliminated: !!p.eliminated,
        ...nationInfo(p.seat, p.nationId ?? null),
      })),
      chat: this.chat,
      you: viewer ? viewer.seat : null,
      me: viewer
        ? { seat: viewer.seat, name: viewer.name, ready: !!viewer.ready, isHost: viewer.seat === this.hostSeat }
        : null,
      notice: this.notice || "",
    };
  }

  // used by the lobby screen: squadrons + humans ordering
  // seat rows for the room's own UI (used by the server-rendered lobby view)
  standings() {
    if (!this.game) return [];
    return this.players
      .map((p) => {
        const n = this.game.nationOfSeat(p.seat);
        return { seat: p.seat, name: p.name, cells: n ? n.cells : 0, alive: n ? n.alive : false };
      })
      .sort((a, b) => b.cells - a.cells);
  }
}

function seatAttacks(game) {
  const out = [];
  for (const a of game.attacks) {
    if (!a.active) continue;
    out.push({
      id: a.id,
      a: a.attacker.id,
      d: a.defender.id,
      troops: Math.round(a.troops),
      ratio: Math.round((a.ratio || 0) * 100) / 100,
      naval: a.naval,
      landing: a.landingAt,
      from: a.attacker.seat,
      to: a.defender.seat,
      fronts: a.fronts.length,
    });
    if (out.length > 160) break;
  }
  return out;
}

// owners grid -> base64 RLE.
//
// The world is 1.8M cells; even run-length encoded that was ~23k int32 pairs
// (~240 KB) and it was re-sent with *every* state update, 4-7 times a second.
// On a real connection that queue backs up until the client stops receiving
// new state: the match looks smooth, then freezes. Two fixes:
//   1. The grid is only attached when its version actually changed (the client
//      already assumed this — it checks `if (state.owners)`).
//   2. Pairs are packed as unsigned LEB128 varints instead of int32, which is
//      ~58 KB instead of ~180 KB for the same data.
// Ownership values are zig-zagged so -1 (ocean) and -3 (out of arena) stay
// valid while ids stay small.
function zig(v) {
  return v < 0 ? -v * 2 - 1 : v * 2;
}
function unzig(u) {
  return u & 1 ? -((u + 1) / 2) : u / 2;
}
function writeVarint(out, n) {
  while (n >= 0x80) {
    out.push((n & 0x7f) | 0x80);
    n = Math.floor(n / 128);
  }
  out.push(n);
}

let lastGridVersion = -1;
let lastGridB64 = null;
function encodeOwners(game) {
  // Reuse the previous encoding while ownership is unchanged; the caller then
  // omits the field entirely.
  if (lastGridVersion === game.ownerVersion && lastGridB64) return lastGridB64;
  const grid = game.owners;
  const out = [];
  let prev = -2;
  let run = 0;
  for (let i = 0; i < grid.length; i++) {
    const v = grid[i];
    if (v === prev) run++;
    else {
      if (prev !== -2) {
        writeVarint(out, zig(prev));
        writeVarint(out, run);
      }
      prev = v;
      run = 1;
    }
  }
  if (prev !== -2) {
    writeVarint(out, zig(prev));
    writeVarint(out, run);
  }
  lastGridVersion = game.ownerVersion;
  lastGridB64 = Buffer.from(out).toString("base64");
  return lastGridB64;
}

const worldCache = new Map();
function worldFor(map, era) {
  const key = `${map}|${era}`;
  if (!worldCache.has(key)) worldCache.set(key, new coreSync.World(map, era));
  return worldCache.get(key);
}

function pickStartNation(world, seed, count) {
  // Deterministic, decently spread starting nations for quick matches.
  const pool = world
    .playable()
    .filter((c) => c.cells >= 150 && c.cells <= 12000 && c.neighbors.length >= 2)
    .sort((a, b) => a.id - b.id);
  const idx = (seed * 37 + count * 11) % Math.max(1, pool.length);
  return pool.length ? pool[idx].id : world.playable()[0].id;
}

// -------------------------------------------------------------- messages ---

let coreSync = null;

function setupClient(client) {
  client.session = { name: null, room: null, seat: null };

  client.onMessage = (msg) => {
    const room = client.room;
    const player = client.player;
    switch (msg.t) {
      case "hello": {
        client.session.name = String(msg.name || "لاعب").slice(0, 18);
        if (client.player) client.player.name = client.session.name;
        sendJSON(client, { t: "hello", name: client.session.name, online: true });
        if (client.room) client.room.broadcastLobby();
        break;
      }
      case "create": {
        if (room) return sendJSON(client, { t: "error", text: "أنت في غرفة بالفعل" });
        let code;
        do {
          code = makeCode(Math.random);
        } while (rooms.has(code));
        const r = new Room(code);
        if (msg.map) r.map = String(msg.map).slice(0, 16);
        if (msg.era) r.era = String(msg.era).slice(0, 16);
        if (msg.mode) r.mode = ["normal", "coop", "ffa"].includes(msg.mode) ? msg.mode : "normal";
        if (msg.goal) r.goal = Math.min(0.95, Math.max(0.1, Number(msg.goal) || 0.5));
        if (msg.aiLevel) r.aiLevel = String(msg.aiLevel).slice(0, 16);
        rooms.set(code, r);
        r.addPlayer(client.session.name || msg.name || "لاعب", client);
        if (msg.nationId != null) client.player.nationId = Number(msg.nationId);
        r.broadcast({ seat: -1, name: "غرفة", text: `${client.player.name} أنشأ الغرفة ${code}`, at: Date.now(), t: "chat" });
        r.broadcastLobby();
        break;
      }
      case "rooms": {
        // Public room browser: no codes to type, just tap a world and join.
        // Only rooms that are still in the lobby (joinable) are listed.
        const now = Date.now();
        const list = [];
        for (const r of rooms.values()) {
          if (r.phase !== "lobby") continue;
          if (r.players.length >= 8) continue;
          const live = r.players.filter((p) => p.connected).length;
          if (!live) continue;
          list.push({
            code: r.code,
            host: r.players[0] ? r.players[0].name : "—",
            players: live,
            max: 8,
            map: r.map,
            mode: r.mode,
            goal: r.goal,
            aiLevel: r.aiLevel,
            age: Math.round((now - r.createdAt) / 1000),
          });
        }
        list.sort((a, b) => b.players - a.players || a.age - b.age);
        sendJSON(client, { t: "roomlist", rooms: list.slice(0, 40), at: now });
        break;
      }
      case "quickjoin": {
        // "Play now": drop the player into the fullest joinable lobby, or open
        // a fresh one if the world is empty. No code, no ceremony.
        if (room) return sendJSON(client, { t: "error", text: "أنت في غرفة بالفعل" });
        let best = null;
        for (const r of rooms.values()) {
          if (r.phase !== "lobby") continue;
          if (r.players.filter((p) => p.connected).length >= 8) continue;
          if (!r.players.some((p) => p.connected)) continue;
          if (!best || r.players.length > best.players.length) best = r;
        }
        if (best) {
          best.addPlayer(client.session.name || msg.name || "لاعب", client);
          if (msg.nationId != null) client.player.nationId = Number(msg.nationId);
          best.lastAt = Date.now();
          best.broadcast({ seat: -1, name: "غرفة", text: `${client.player.name} انضم`, at: Date.now(), t: "chat" });
          best.broadcastLobby();
          sendJSON(client, { t: "joined", room: best.code, quick: true });
          break;
        }
        let code;
        do {
          code = makeCode(Math.random);
        } while (rooms.has(code));
        const fresh = new Room(code);
        fresh.public = true;
        rooms.set(code, fresh);
        fresh.addPlayer(client.session.name || msg.name || "لاعب", client);
        if (msg.nationId != null) client.player.nationId = Number(msg.nationId);
        fresh.broadcastLobby();
        sendJSON(client, { t: "joined", room: code, quick: true, created: true });
        break;
      }
      case "join": {
        if (room) return sendJSON(client, { t: "error", text: "أنت في غرفة بالفعل" });
        const code = String(msg.room || "").toUpperCase().trim();
        const r = rooms.get(code);
        if (!r) return sendJSON(client, { t: "error", text: "الغرفة غير موجودة" });
        if (r.players.length >= 8) return sendJSON(client, { t: "error", text: "الغرفة ممتلئة" });
        if (r.phase === "playing") return sendJSON(client, { t: "error", text: "المباراة بدأت — انتظر جولة جديدة" });
        r.addPlayer(client.session.name || msg.name || "لاعب", client);
        if (msg.nationId != null) client.player.nationId = Number(msg.nationId);
        r.lastAt = Date.now();
        r.broadcast({ seat: -1, name: "غرفة", text: `${client.player.name} انضم`, at: Date.now(), t: "chat" });
        r.broadcastLobby();
        if (r.phase === "ended" && r.game) {
          r.broadcastState();
        }
        break;
      }
      case "pick": {
        if (!room || !player) return;
        if (room.phase === "playing") return sendJSON(client, { t: "error", text: "المباراة بدأت" });
        const err = room.game
          ? room.game.setSeatNation(player.seat, Number(msg.nationId))
          : setLobbyNation(room, player, Number(msg.nationId));
        if (err) sendJSON(client, { t: "error", text: err });
        room.broadcastLobby();
        if (room.game && room.game.onlinePhase === "lobby") room.broadcastState();
        break;
      }
      case "ready": {
        if (!room || !player) return;
        player.ready = !!msg.ready;
        room.broadcastLobby();
        // auto-start when everyone is ready (host included)
        if (room.phase === "lobby" && room.players.length >= 2 && room.players.every((p) => p.ready || !p.connected)) {
          const err = room.start();
          if (err) room.broadcast({ t: "error", text: err });
        }
        break;
      }
      case "start": {
        if (!room) return;
        if (player.seat !== room.hostSeat) return sendJSON(client, { t: "error", text: "المضيف فقط يبدأ المباراة" });
        const err = room.start();
        if (err) sendJSON(client, { t: "error", text: err });
        break;
      }
      case "config": {
        if (!room || !player) return;
        if (player.seat !== room.hostSeat) return;
        if (room.phase !== "lobby") return;
        if (msg.map) room.map = String(msg.map).slice(0, 16);
        if (msg.mode) room.mode = ["normal", "coop", "ffa"].includes(msg.mode) ? msg.mode : room.mode;
        if (msg.goal) room.goal = Math.min(0.95, Math.max(0.1, Number(msg.goal) || room.goal));
        if (msg.aiLevel) room.aiLevel = String(msg.aiLevel).slice(0, 16);
        if (room.game) {
          room.game.goal = room.goal;
          room.game.aiLevel = room.aiLevel;
          room.game.onlineMode = room.mode;
        }
        room.broadcastLobby();
        break;
      }
      case "chat": {
        if (!room || !player) return;
        const text = String(msg.text || "").slice(0, 240).replace(/[<>]/g, "");
        if (!text.trim()) return;
        const entry = { seat: player.seat, name: player.name, text, at: Date.now() };
        room.chat.push(entry);
        if (room.chat.length > 60) room.chat.shift();
        console.log(`[${room.code}] chat ${player.name}: ${text}`);
        room.broadcast({ ...entry, t: "chat" });
        room.broadcastLobby();
        break;
      }
      case "act": {
        if (!room || !player || !room.game) return;
        const game = room.game;
        if (process.env.CONQUEST_DEBUG) console.log(`[${room.code}] act ${msg.a} seat ${player.seat} phase ${game.onlinePhase}`);
        if (game.onlinePhase !== "playing") {
          if (process.env.CONQUEST_DEBUG) console.log(`[${room.code}] act ignored — phase ${game.onlinePhase}`);
          return;
        }
        const n = game.nationOfSeat(player.seat);
        if (!n) {
          if (process.env.CONQUEST_DEBUG) console.log(`[${room.code}] act ignored — no nation for seat ${player.seat}`);
          return;
        }
        const err = applyAction(game, n, msg);
        if (err) sendJSON(client, { t: "notice", text: err, bad: true });
        break;
      }
      case "ping":
        sendJSON(client, { t: "pong", ts: msg.ts });
        break;
      case "rematch": {
        if (!room || !player) return;
        player.ready = true;
        room.broadcast({ seat: -1, name: "غرفة", text: `${player.name} يريد مباراة جديدة`, at: Date.now(), t: "chat" });
        room.broadcastLobby();
        if (room.phase === "ended" && room.players.length >= 2 && room.players.every((p) => p.ready || !p.connected)) {
          const err = room.start();
          if (err) room.broadcast({ t: "error", text: err });
        }
        break;
      }
      case "leave": {
        if (room) room.removePlayer(player);
        client.room = null;
        client.player = null;
        sendJSON(client, { t: "left" });
        break;
      }
      default:
        break;
    }
  };

  client.onClose = () => {
    const room = client.room;
    const player = client.player;
    if (room && player) room.removePlayer(player);
  };
}

function setLobbyNation(room, player, nationId) {
  if (room.players.some((p) => p !== player && p.nationId === nationId)) return "الدولة محجوزة";
  player.nationId = nationId;
  player.ready = false;
  return null;
}

function applyAction(game, n, msg) {
  switch (msg.a) {
    case "attack": {
      const target = game.byId[Number(msg.target)];
      if (!target) return "دولة غير موجودة";
      const frac = Math.min(1, Math.max(0.05, Number(msg.frac) || 0.5));
      return game.launchAttack(n, target, frac);
    }
    case "build": {
      if (!["city", "factory", "lab", "port", "base", "bunker", "silo", "aa"].includes(msg.key)) return "مبنى غير معروف";
      return game.build(n, msg.key, Number(msg.cell));
    }
    case "upgrade": {
      const b = n.buildings.find((x) => x.cell === Number(msg.cell));
      if (!b) return "لا يوجد مبنى هنا";
      return game.upgradeBuilding(n, b);
    }
    case "research":
      return game.doResearch(n, String(msg.key));
    case "strike": {
      const err = game.launchStrike(n, Number(msg.cell), msg.kind === "nuke" ? "nuke" : "missile");
      return err;
    }
    case "reclaim":
      return game.reclaim(n, Number(msg.cell));
    case "fortify":
      return game.fortify(n);
    case "retreat": {
      const a = game.attackById(Number(msg.id));
      if (!a || a.attacker !== n) return "هجوم غير موجود";
      game.retreat(a.id);
      return null;
    }
    case "declaw": {
      const target = game.byId[Number(msg.target)];
      if (!target) return "دولة غير موجودة";
      if (!game.canDeclare(n, target)) return "لا يمكن إعلان الحرب الآن";
      game.declareWar(n, target);
      return null;
    }
    case "offer": {
      const type = ["ceasefire", "alliance", "gift"].includes(msg.kind) ? msg.kind : null;
      if (!type) return "عرض غير معروف";
      return game.propose({ type, from: n.id, to: Number(msg.target) });
    }
    case "callallies": {
      const target = game.byId[Number(msg.target)];
      if (!target || !target.alive) return "هدف غير صالح";
      return game.callAllies(target);
    }
    case "answer": {
      const offer = game.offers.find((o) => o.id === Number(msg.id));
      if (!offer || offer.to !== n.id) return "عرض غير صالح";
      game.answerOffer(offer.id, !!msg.accept);
      return null;
    }
    case "melt":
      n.melt = !!msg.on;
      return null;
    case "surrender": {
      game.surrendered.add(n.seat);
      n.isPlayer = false;
      n.ai = null;
      game.log(`${n.ar} استسلمت — خرج صاحبها من المباراة`, "bad", { seat: n.seat });
      game.checkOnlineEnd();
      return null;
    }
    default:
      return "أمر غير معروف";
  }
}

// ------------------------------------------------------------------ start ---

server.on("upgrade", (req, socket) => {
  const url = (req.url || "").split("?")[0];
  if (url !== "/ws") {
    socket.end("HTTP/1.1 404 Not Found\r\n\r\n");
    return;
  }
  const client = wsHandshake(req, socket);
  if (client) setupClient(client);
});

export default server;

corePromise
  .then((core) => {
    coreSync = core;
    if (process.env.VERCEL) return; // serverless: the platform owns the listener
    server.listen(PORT, "0.0.0.0", () => {
      console.log(`CONQUEST server → http://0.0.0.0:${PORT}  (websocket: /ws)`);
    });
  })
  .catch((err) => {
    console.error("failed to load simulation core:", err);
    process.exit(1);
  });

// Reap empty/idle rooms.
setInterval(() => {
  const now = Date.now();
  for (const room of [...rooms.values()]) {
    const live = room.players.some((p) => p.connected);
    if (!live || now - room.lastAt > 1000 * 60 * 45) room.destroy();
  }
}, 30000);
