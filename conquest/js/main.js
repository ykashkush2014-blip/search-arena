// CONQUEST — Arabic-first pixel world-conquest strategy game.
// Wires the menus, the map picker, the in-game HUD and input handling to the
// simulation in state.js and the canvas renderer in render.js.
import { World, PRESETS, initWorld, difficultyOf } from "./world.js";
import { Game } from "./state.js";
import { Renderer } from "./render.js";
import {
  AI_LEVELS, BALANCE, BUILDINGS, BUILDING_BY_KEY, ERAS, MEDALS, MODES,
  RANKS, RESEARCH,
} from "./data.js";
import { CAMPAIGNS, dailyChallenge } from "./campaigns.js";
import { Rng } from "./rng.js";
import { sfx } from "./audio.js";
import { net, NetMirror } from "./net.js";
import { t, tBack, setLang, getLang, loadLang, translateDom, watchDom, registerNationNames, hasSavedLanguage } from "./i18n.js";
import {
  initCrazyGames,
  getSettings,
  onSettingsChange,
  isPortal,
  isInstantMultiplayer,
  getInviteParams,
  preferredLanguage,
  gameplayStart,
  gameplayStop,
  loadingStart,
  loadingStop,
  happytime,
  reportProgress,
  roomJoined,
  roomJoinable,
  roomLeft,
  onJoinRoom,
  getUser,
  requestMidgameAd,
} from "./crazygames.js";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const fmt = (n) => {
  n = Math.round(n || 0);
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (Math.abs(n) >= 1e4) return (n / 1e3).toFixed(0) + "k";
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1) + "k";
  return String(n);
};
const pct = (v) => (v * 100).toFixed(v < 0.1 ? 1 : 0) + "%";
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Nation names carry both languages: `ar` is the Arabic name, `name` the
// English one. Every place that prints a nation goes through nationName() so
// the UI never mixes scripts. Search keeps matching BOTH, so a player can type
// whichever they know.
const nationName = (c) => (getLang() === "en" ? c && (c.name || c.ar) : c && (c.ar || c.name)) || "—";
const campName = (c) => (getLang() === "en" ? c.en || c.ar : c.ar || c.en);
const matchName = (c, q) => {
  if (!q) return true;
  const needle = q.toLowerCase();
  return (
    String(c.ar || "").includes(q) ||
    String(c.name || "").toLowerCase().includes(needle) ||
    String(c.iso || "").toUpperCase() === q.toUpperCase()
  );
};

const ARABIC = "٠١٢٣٤٥٦٧٨٩";
// Arabic-Indic digits are an Arabic-mode nicety; English mode keeps 0-9 so the
// numbers match the rest of the sentence.
const arNum = (n) => (getLang() === "ar" ? String(n).replace(/\d/g, (d) => ARABIC[+d]) : String(n));

// ------------------------------------------------------------- persistence ---

const STORE_KEY = "conquest.io.save.v1";
const PROFIL_KEY = "conquest.io.profile.v1";

const store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage full / private mode */
    }
  },
  del(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

const profile = Object.assign(
  { medals: [], best: 0, games: 0, streak: 0, lastDaily: "", winToday: false, settings: { sound: true, labels: true, speed: 1, drag: true } },
  store.get(PROFIL_KEY, {})
);
const saveSettings = () => store.set(PROFIL_KEY, profile);

function saveProfileMedals(list) {
  for (const id of list || []) {
    if (!profile.medals.includes(id)) profile.medals.push(id);
  }
  store.set(PROFIL_KEY, profile);
}

// ---------------------------------------------------------------- app state ---

const app = {
  screen: "menu",
  mode: "world",
  preset: "world",
  era: "modern",
  aiLevel: "normal",
  goal: 0.5,
  campaign: null,
  daily: null,
  world: null,
  pickWorld: null,
  pickRenderer: null,
  selectedId: null,
  game: null,
  renderer: null,
  raf: 0,
  last: 0,
  tab: "empire",
  brush: null,
  strikeMode: null,
  paused: false,
  speed: 1,
  placeMode: false,
  frameMs: 16,
};

// --------------------------------------------------------------- navigation ---

function show(screen) {
  // Leaving the match (menu, results, lobby) ends the play session for the
  // portal, which uses these edges to pause anything resource-hungry and to
  // measure how long people actually play.
  if (screen !== "game") {
    gameplayStop();
    roomGone();
  }
  app.screen = screen;
  $$(".screen").forEach((el) => (el.hidden = true));
  $("#screen-" + screen).hidden = false;
  if (screen === "country" && app.pickRenderer) {
    requestAnimationFrame(() => {
      app.pickRenderer.resize();
      fitPick();
    });
  }
  if (screen === "game" && app.renderer) {
    requestAnimationFrame(() => {
      app.renderer.resize();
    });
  }
}

// ---------------------------------------------------------------- menu ---

function buildMenu() {
  const grid = $("#mode-grid");
  grid.innerHTML = "";
  const cards = [
    {
      id: "world",
      ar: t("فتح العالم"),
      ico: "🌍",
      desc: t("اختر أي دولة من 236 دولة على خريطة العالم وابدأ من حدودها الحقيقية."),
    },
    {
      id: "history",
      ar: t("الحملات التاريخية"),
      ico: "📜",
      desc: t("7 حملات: الإسكندر، روما، جنكيز خان، القسطنطينية، العالم الجديد، بريطانيا، نابليون."),
    },
    {
      id: "daily",
      ar: t("التحدي اليومي"),
      ico: "⭐",
      desc: t("دولة واحدة للجميع كل يوم، ومعها تعديل خاص. الفوز يبني سلسلتك."),
    },
    {
      id: "online",
      ar: t("أونلاين"),
      ico: "🌐",
      desc: t("العب مع أصدقائك: غرفة بكود، كل لاعب يدير دولة حقيقية على نفس الخريطة."),
    },
  ];
  for (const m of cards) {
    const el = document.createElement("button");
    el.className = "mode-card" + (app.mode === m.id ? " active" : "");
    el.innerHTML = `<div class="ico">${m.ico}</div><h3>${m.ar}</h3><p>${m.desc}</p>`;
    el.onclick = () => {
      app.mode = m.id;
      buildMenu();
    };
    grid.appendChild(el);
  }
  const mc = $("#medal-count");
  mc.textContent = `${profile.medals.length} / ${MEDALS.length}`;
  const cont = $("#btn-continue");
  const save = store.get(STORE_KEY, null);
  cont.hidden = !save;
  if (save) {
    const p = save.nations?.find((n) => n.isPlayer);
    cont.querySelector("small").textContent = p
      ? `${escapeHtml(nationName(p))} • ${new Date(save.savedAt).toLocaleString(getLang() === "ar" ? "ar" : "en")}`
      : "";
  }
}

function startFlow() {
  if (app.mode === "online") {
    openOnlineHome();
    return;
  }
  if (app.mode === "daily") {
    const key = new Date().toISOString().slice(0, 10);
    app.daily = dailyChallenge(key);
    app.preset = "world";
    app.era = "modern";
    app.aiLevel = app.daily.ai || "normal";
    app.goal = app.daily.goal || 0.5;
    app.campaign = null;
    openCountrySelect(true);
    return;
  }
  if (app.mode === "history") {
    openCampaignList();
    return;
  }
  app.campaign = null;
  openCountrySelect(false);
}

// ----------------------------------------------------------------- online ---

const online = {
  open: false,
  lobby: null,
  lastState: null,
  ready: false,
  picked: null,
  lobbyRenderer: null,
  chatOpen: true,
};

function onlineName() {
  let name = ($("#online-name").value || "").trim();
  if (!name) name = profile.settings.name || `قائد-${Math.floor(Math.random() * 900 + 100)}`;
  profile.settings.name = name;
  saveSettings();
  return name;
}

async function openOnlineHome() {
  app.pickEra = "modern";
  online.lobby = null;
  online.ready = false;
  show("online");
  $("#online-home").hidden = false;
  $("#online-lobby").hidden = true;
  $("#online-name").value = profile.settings.name || "";
  // Show the invite code immediately. A friend who followed an invite should
  // see which room they are heading into even if the server is briefly down,
  // and the retry "Join" button then works without retyping.
  const invitedCode = inviteRoomCode();
  if (invitedCode) {
    const box = $("#online-code");
    if (box) box.value = invitedCode;
  }
  setOnlineStatus(net.status === "online" ? t("متصل بالخادم") : t("جاري الاتصال…"), net.status === "online" ? "ok" : "");
  const ok = await net.connect(profile.settings.name || "");
  if (!ok) {
    // On the published page the server is remote, so "run node server.js" is
    // the wrong advice — say what is actually happening.
    setOnlineStatus(
      net.remote
        ? t("خادم الأونلاين لا يستجيب الآن — أعد المحاولة بعد قليل. اللعب الفردي يعمل دائمًا")
        : t("تعذر الاتصال — شغّل الخادم: node server.js"),
      "bad"
    );
    return;
  }
  setOnlineStatus(`متصل بالخادم • ${net.name}${net.remote ? " (أونلاين)" : ""}`, "ok");
  // Two portal entry points drop the player straight into a room instead of
  // the lobby browser: an invite link, and the platform's instant-multiplayer
  // flag (friends list / multiplayer page). Both then put them in a room that
  // is joinable, which is what the portal's Join UI needs.
  const invited = inviteRoomCode();
  if (invited) {
    net.joinRoom(invited);
    toast(t("جارٍ الانضمام إلى غرفة صديق") + " " + invited, "good");
    return;
  }
  if (isInstantMultiplayer()) {
    net.createRoom({
      map: $("#online-map")?.value || "world",
      mode: $("#online-mode")?.value || "normal",
      goal: parseFloat($("#online-goal")?.value) || 0.5,
      aiLevel: $("#online-ai")?.value || "normal",
    });
    return;
  }
  if (!app.pickWorld) {
    app.pickWorld = new World("world", app.era);
    app.pickRenderer = new Renderer($("#pick-canvas"), app.pickWorld, pickStubGame(app.pickWorld));
    attachPickInput();
  }
}

// The portal can send a player here with a room code attached (invite link or
// a friend's "Join"). The SDK exposes it as inviteParams; we also accept a
// plain ?room= code so a normal URL works outside the portal.
function inviteRoomCode() {
  const params = getInviteParams();
  const fromQuery = new URLSearchParams(location.search).get("room");
  const code = (params && (params.room || params.roomId || params.roomName)) || fromQuery;
  return code ? String(code).trim().toUpperCase() : "";
}

function setOnlineStatus(text, cls) {
  const el = $("#online-status");
  if (!el) return;
  el.textContent = text;
  el.className = "online-status " + (cls || "");
}

function lobbyCanvas() {
  return $("#lobby-canvas");
}

function setupLobbyRenderer(view) {
  const canvas = lobbyCanvas();
  if (!canvas) return;
  if (!online.lobbyRenderer || online.lobbyRenderer.canvas !== canvas) {
    // The lobby map reuses the picker renderer, just on another canvas.
    online.lobbyRenderer = new Renderer(canvas, app.pickWorld, pickStubGame(app.pickWorld));
    online.lobbyRenderer.labels = true;
    canvas.dataset.bound = "";
    bindLobbyCanvas(canvas);
  }
  online.lobbyRenderer.resize();
  fitLobbyMap();
  void view;
}

function fitLobbyMap() {
  const r = online.lobbyRenderer;
  if (!r) return;
  const w = r.world;
  const pts = (online.lobby ? online.lobby.seats : [])
    .map((s) => w.countries[s.nationId])
    .filter((c) => c && c.cells > 0);
  if (!pts.length) {
    r.fitTo({ x0: 0, y0: 0, x1: w.w - 1, y1: w.h - 1 }, 0.98);
  } else {
    let x0 = 1e9;
    let y0 = 1e9;
    let x1 = -1e9;
    let y1 = -1e9;
    for (const c of pts) {
      x0 = Math.min(x0, c.x);
      x1 = Math.max(x1, c.x);
      y0 = Math.min(y0, c.y);
      y1 = Math.max(y1, c.y);
    }
    r.fitTo({ x0: x0 - 40, y0: y0 - 30, x1: x1 + 40, y1: y1 + 30 }, 0.92);
  }
  r.renderBase(true);
  r.render();
}

function bindLobbyCanvas(canvas) {
  if (canvas.dataset.bound === "1") return;
  canvas.dataset.bound = "1";
  let down = null;
  canvas.addEventListener("pointerdown", (e) => {
    down = { x: e.clientX, y: e.clientY, cx: online.lobbyRenderer.cam.x, cy: online.lobbyRenderer.cam.y };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!down) return;
    const dx = e.clientX - down.x;
    const dy = e.clientY - down.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) {
      const r = online.lobbyRenderer;
      r.cam.x = down.cx - dx / r.cam.zoom;
      r.cam.y = down.cy - dy / r.cam.zoom;
      r.clampCam();
      r.renderBase();
      r.render();
    }
  });
  canvas.addEventListener("pointerup", (e) => {
    const dx = Math.abs(e.clientX - down.x);
    const dy = Math.abs(e.clientY - down.y);
    down = null;
    if (dx + dy > 5) return;
    // Choosing a nation by tapping the map was fiddly on a phone (you often
    // hit the wrong pixel), so the lobby uses the list instead. Tapping the
    // map still selects nothing and the hint says so.
    void e;
  });
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const r = online.lobbyRenderer;
      r.zoomAt(e.clientX - rect.left, e.clientY - rect.top, e.deltaY < 0 ? 1.18 : 0.85);
      r.renderBase();
      r.render();
    },
    { passive: false }
  );
}

// ------------------------------------------------------- lobby nation list ---
// Same choice as the offline "pick your country" screen, but as a scrollable
// list so it works with a thumb on a phone: search, tap, done.
function nationStars(world, id) {
  let stars = 3;
  try {
    stars = difficultyOf(world, id);
  } catch {
    stars = world.countries[id] && world.countries[id].difficulty ? world.countries[id].difficulty : 3;
  }
  return "★".repeat(Math.max(1, Math.min(5, stars)));
}

function renderNationList() {
  const box = $("#nation-list");
  if (!box || !app.pickWorld) return;
  const world = app.pickWorld;
  const view = online.lobby;
  if (!view) return;
  const q = ($("#nation-search") ? $("#nation-search").value : "").trim();
  const mine = view.seats.find((s) => s.seat === net.seat);
  const myPick = mine ? mine.nationId : null;
  const takenBy = new Map();
  for (const s of view.seats) {
    if (s.seat !== net.seat && s.nationId != null) takenBy.set(s.nationId, s.name);
  }

  const list = world
    .playable()
    .filter((c) => matchName(c, q))
    .sort((a, b) => (a.ar || "").localeCompare(b.ar || "", "ar"));

  if (!list.length) {
    box.innerHTML = `<div class="nation-empty">لا توجد دولة بهذا الاسم</div>`;
    return;
  }
  box.innerHTML = list
    .map((c) => {
      const taken = takenBy.get(c.id);
      const picked = c.id === myPick;
      const cls = `nation-row${picked ? " picked" : ""}${taken ? " taken" : ""}`;
      return `<button class="${cls}" data-nation="${c.id}" ${taken ? "disabled" : ""}>
        <i class="swatch" style="background:rgb(${c.color.r},${c.color.g},${c.color.b})"></i>
        <span class="nm">${escapeHtml(nationName(c))}</span>
        <span class="meta">${c.cells.toLocaleString("ar-EG")} خلية</span>
        <span class="stars">${nationStars(world, c.id)}</span>
      </button>`;
    })
    .join("");

  box.querySelectorAll("[data-nation]").forEach((b) => {
    b.onclick = () => pickLobbyNation(Number(b.dataset.nation));
  });
}

let nationSearchBound = false;
function bindNationSearch() {
  if (nationSearchBound) return;
  const input = $("#nation-search");
  if (!input) return;
  nationSearchBound = true;
  input.addEventListener("input", () => renderNationList());
}

function pickLobbyNation(nationId) {
  if (!net.room) return;
  if (net.lobby && net.lobby.phase !== "lobby") {
    toast(t("المباراة بدأت — لا يمكن تغيير الدولة"));
    return;
  }
  sfx.click();
  net.pick(nationId);
}

function renderLobby(view) {
  online.lobby = view;
  // Report the room so the portal can offer Join/Invite. A lobby is joinable
  // while it is still filling up.
  roomUpdate(view.room, view.seats.length < view.maxSeats);
  $("#online-home").hidden = true;
  $("#online-lobby").hidden = false;
  $("#room-code").textContent = view.room;
  $("#dock-room").textContent = view.room;
  const isHost = view.hostSeat === net.seat;
  const everyone = view.seats.length >= 2 && view.seats.every((s) => s.ready || !s.connected);
  $("#btn-ready").textContent = online.ready ? t("إلغاء الجاهزية") : t("جاهز ✓");
  $("#btn-ready").className = "btn " + (online.ready ? "green" : "ghost");
  $("#btn-start-online").hidden = !isHost;
  $("#btn-start-online").disabled = !everyone || view.seats.length < 2;
  $("#lobby-sub").textContent =
    view.seats.length < 2
      ? t("شارك الكود مع صديق للبدء")
      : everyone
        ? t("الجميع جاهز — يمكن البدء")
        : t("بانتظار جاهزية اللاعبين…");
  $("#lobby-note").textContent = isHost
    ? t("أنت المضيف — تبدأ المباراة عندما يكون الجميع جاهزًا.")
    : t("انتظر المضيف لبدء المباراة.");

  $("#lobby-chips").innerHTML = [
    `الخريطة: ${PRESETS.find((p) => p.id === view.map)?.ar || view.map}`,
    `العصر: ${ERAS[view.era]?.ar || view.era}`,
    `${t("الهدف:")} ${Math.round(view.goal * 100)}%`,
    `الوضع: ${{ normal: t("كل لاعب لنفسه"), coop: t("تحالف"), ffa: t("آخر صامد") }[view.mode] || view.mode}`,
  ]
    .map((t) => `<span class="chip">${t}</span>`)
    .join("");

  const seatsEl = $("#lobby-seats");
  seatsEl.innerHTML = view.seats
    .map((s) => {
      const st = s.eliminated ? t("خرج") : s.ready ? t("جاهز") : t("بانتظار");
      return `<div class="seat-row ${s.seat === net.seat ? "you" : ""} ${s.connected ? "" : "off"}">
        <i class="swatch" style="background:${s.color ? `rgb(${s.color.r},${s.color.g},${s.color.b})` : "#333"}"></i>
        <span class="nm">${escapeHtml(tBack(nationName({ ar: s.nation, name: s.name })))}${s.seat === net.seat ? " (you)" : ""}<br>
          <small style="color:var(--muted)">${s.nation || t("لم يختر دولة")}${s.iso ? " · " + s.iso : ""}</small></span>
        ${s.seat === view.hostSeat ? '<span class="st host">مضيف</span>' : ""}
        <span class="st ${s.ready ? "ready" : ""}">${st}</span>
      </div>`;
    })
    .join("");

  renderChatLog($("#lobby-chat"), view.chat);
  setupLobbyRenderer(view);
  bindNationSearch();
  renderNationList();
  const mine = view.seats.find((s) => s.seat === net.seat);
  online.ready = !!(mine && mine.ready);
  // Warn only *me* when my pick is not on this map, rather than silently
  // starting me somewhere else (which is what used to happen).
  const mySeat = view.seats.find((s) => s.seat === net.seat);
  if (mySeat && mySeat.nationId != null && !app.pickWorld.active[mySeat.nationId]) {
    toast(t("دولتك ليست على هذه الخريطة — اختر دولة أخرى من القائمة"), "bad");
  }
}

function renderChatLog(el, chat) {
  if (!el) return;
  const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
  el.innerHTML = (chat || [])
    .map((c) =>
      c.seat === -1
        ? `<div class="msg sys">${escapeHtml(c.text)}</div>`
        : `<div class="msg"><b>${escapeHtml(c.name)}:</b> ${escapeHtml(c.text)}</div>`
    )
    .join("");
  if (atBottom) el.scrollTop = el.scrollHeight;
}

// Live state -> local mirror game (rendered by the normal in-game code).
let mirrorPromise = null;
async function applyNetState(state) {
  online.lastState = state;
  if (state.phase === "lobby") return; // still in the lobby
  if (!app.game || app.game.remote !== true || app.game.result) {
    const stateAtBoot = state;
    if (!mirrorPromise) {
      mirrorPromise = (async () => {
        const { getWorldData } = await import("./world.js");
        return new NetMirror(stateAtBoot, {
          worldData: getWorldData(),
          era: state.era || app.pickEra || app.era,
          mode: online.lobby ? online.lobby.mode : "normal",
          seat: net.seat,
        });
      })().catch((err) => {
        console.error("[online] mirror failed", err);
        toast(t("تعذر تحميل حالة المباراة"), "bad");
        return null;
      });
    }
    const mirror = await mirrorPromise;
    if (!mirror) return;
    if (!app.game || app.game !== mirror.game) {
      bootGame(mirror.game, mirror.world);
      app.game.remote = true;
      mirror.apply(stateAtBoot);
      $("#btn-surrender").hidden = false;
      app.netMirror = mirror;
      $("#chat-dock").hidden = false;
      $("#chat-dock").classList.toggle("collapsed", !online.chatOpen);
      sfx.resume();
    }
    return;
  }
  if (app.netMirror) {
    app.netMirror.apply(state);
    // knocked out of a match that is still running: this player is done
    if (state.phase === "playing" && state.nation && (state.nation.out || state.nation.alive === false) && !app.netMirror.shownOut) {
      app.netMirror.shownOut = true;
      showOnlineOut(state);
    }
    if (state.phase === "ended" && !app.netMirror.appliedEnd) {
      app.netMirror.appliedEnd = true;
      updateHud(true);
    }
  }
}

// Intents ---------------------------------------------------------------
function netAct(a, payload) {
  if (app.game && app.game.remote) {
    net.act(a, payload);
    return true;
  }
  return false;
}

// --------------------------------------------------------- country select ---

function openCountrySelect(daily) {
  if (!app.pickWorld) {
    app.pickWorld = new World("world", app.era);
    app.pickRenderer = new Renderer($("#pick-canvas"), app.pickWorld, pickStubGame(app.pickWorld));
    attachPickInput();
  }
  $("#select-title").textContent = daily ? t("تحدي اليوم") : app.mode === "history" ? t("الحملة") : t("اختر دولتك");
  $("#select-sub").textContent = daily
    ? `${app.daily.ar} — ${app.daily.arBlurb}`
    : t("كل دولة لها حدودها الحقيقية وصعوبتها الخاصة");
  $("#era-select").disabled = daily;
  if (app.pickRenderer) app.pickRenderer.campaign = null;
  const filters = document.querySelector(".filters");
  filters.style.display = daily ? "none" : "";
  if (!daily) fillFilters();
  buildCountryList();
  show("country");
  requestAnimationFrame(() => {
    app.pickRenderer.resize();
    fitPick();
    if (daily) pickDailyNation();
  });
}

function fillFilters() {
  const eraSel = $("#era-select");
  eraSel.innerHTML = Object.values(ERAS)
    .map((e) => `<option value="${e.id}" ${e.id === app.era ? "selected" : ""}>${e.ar} (${e.years})</option>`)
    .join("");
  const mapSel = $("#map-select");
  mapSel.innerHTML = PRESETS.map(
    (p) => `<option value="${p.id}" ${p.id === app.preset ? "selected" : ""}>${p.ar}</option>`
  ).join("");
  const aiSel = $("#ai-select");
  aiSel.innerHTML = Object.entries(AI_LEVELS)
    .map(([k, v]) => `<option value="${k}" ${k === app.aiLevel ? "selected" : ""}>الخصوم: ${v.ar}</option>`)
    .join("");
  const goalSel = $("#goal-select");
  const goalLabels = { 0.3: t("الهدف: 30% — حملة سريعة"), 0.5: t("الهدف: 50% — فتح العالم"), 0.75: t("الهدف: 75% — سيطرة كاملة") };
  goalSel.innerHTML = [0.3, 0.5, 0.75]
    .map((g) => `<option value="${g}" ${g === app.goal ? "selected" : ""}>${goalLabels[g]}</option>`)
    .join("");
  eraSel.onchange = () => {
    app.era = eraSel.value;
    app.pickWorld = new World(app.preset, app.era);
    if (app.pickRenderer) app.pickRenderer.world = app.pickWorld;
    fitPick();
    buildCountryList();
  };
  mapSel.onchange = () => {
    app.preset = mapSel.value;
    app.pickWorld = new World(app.preset, app.era);
    if (app.pickRenderer) app.pickRenderer.world = app.pickWorld;
    fitPick();
    buildCountryList();
  };
  aiSel.onchange = () => {
    app.aiLevel = aiSel.value;
  };
  goalSel.onchange = () => {
    app.goal = parseFloat(goalSel.value);
  };
}

function pickStubGame(world) {
  return {
    time: 0,
    byId: [],
    nations: new Map(),
    attacks: [],
    strikes: [],
    explosions: [],
    ownerVersion: 1,
    playerShare: () => 0,
  };
}

let pickGame = null;
function fitPick() {
  const w = app.pickWorld;
  const r = app.pickRenderer;
  if (!r) return;
  const ids = w.playable().map((c) => c.id);
  let x0 = 1e9;
  let y0 = 1e9;
  let x1 = -1e9;
  let y1 = -1e9;
  for (const id of ids) {
    const c = w.countries[id];
    x0 = Math.min(x0, c.x);
    x1 = Math.max(x1, c.x);
    y0 = Math.min(y0, c.y);
    y1 = Math.max(y1, c.y);
  }
  r.fitTo({ x0: x0 - 2, y0: y0 - 2, x1: x1 + 2, y1: y1 + 2 }, 0.95);
  r.renderBase(true);
  r.render();
}

function buildCountryList() {
  const w = app.pickWorld;
  const q = ($("#country-search").value || "").trim();
  const list = $("#country-list");
  const items = w
    .playable()
    .filter((c) => matchName(c, q))
    .sort((a, b) => b.cells - a.cells);
  list.innerHTML = items
    .map((c) => {
      const col = c.color;
      return `<button class="list-item ${app.selectedId === c.id ? "active" : ""}" data-id="${c.id}">
        <i class="swatch" style="background:rgb(${col.r},${col.g},${col.b})"></i>
        <span class="nm">${escapeHtml(nationName(c))}</span>
        <span class="stars">${"★".repeat(c.difficulty)}</span>
      </button>`;
    })
    .join("");
  list.querySelectorAll(".list-item").forEach((el) => {
    el.onclick = () => selectCountry(+el.dataset.id);
  });
  onPickHandlers();
  $("#country-search").oninput = () => buildCountryList();
  if (app.selectedId != null) renderCountryCard(app.selectedId);
}

function renderCountryCard(id) {
  const w = app.pickWorld;
  const c = w.countries[id];
  const card = $("#country-card");
  const col = c.color;
  const neigh = c.neighbors.map((n) => w.countries[n]).filter(Boolean);
  const sea = c.sea.map((n) => w.countries[n]).filter(Boolean);
  const daily = app.mode === "daily";
  card.classList.remove("collapsed");
  card.innerHTML = `
    <button class="card-close" id="card-close">✕</button>
    <div class="cc-head">
      <div class="cc-flag" style="background:rgb(${col.r},${col.g},${col.b})"></div>
      <div><h3>${escapeHtml(nationName(c))}</h3><small>${c.iso || "—"} • ${c.cells.toLocaleString("en")} cells</small></div>
    </div>
    <div class="diff-row"><span>الصعوبة</span><span class="stars">${"★".repeat(c.difficulty)}${"☆".repeat(5 - c.difficulty)}</span></div>
    <div class="stat-grid">
      <div class="stat"><b>${arNum(c.cells)}</b><small>مساحة (خلية)</small></div>
      <div class="stat"><b>${arNum(neigh.length)}</b><small>حدود برية</small></div>
      <div class="stat"><b>${arNum(Math.round(c.area / 1000))}k</b><small>كم² تقريبًا</small></div>
      <div class="stat"><b>${ERAS[app.era].ar}</b><small>العصر</small></div>
    </div>
    <div class="cc-sub" style="font-size:11.5px;color:var(--muted);margin-bottom:4px">الجيران:</div>
    <div class="neigh-list">${
      neigh.length ? neigh.map((n) => `<span class="chip">${escapeHtml(nationName(n))}</span>`).join("") : '<span class="chip">جزيرة — لا حدود برية</span>'
    }</div>
    ${sea.length ? `<div class="neigh-list">${sea.map((n) => `<span class="chip">⛵ ${escapeHtml(nationName(n))}</span>`).join("")}</div>` : ""}
    ${daily ? `<p class="hint">${app.daily.arBlurb}</p>` : ""}
    <div class="card-actions">
      <button class="btn gold" id="btn-start-game">ابدأ الحملة</button>
      <button class="btn ghost" id="btn-pick-random">دولة أخرى 🎲</button>
    </div>
  `;
  card.querySelector("#card-close").onclick = () => card.classList.add("collapsed");
  card.querySelector("#btn-start-game").onclick = () => startGame(id);
  card.querySelector("#btn-pick-random").onclick = daily ? () => pickDailyNation(true) : randomCountry;
}

function selectCountry(id) {
  app.selectedId = id;
  $("#country-card").classList.remove("collapsed");
  $("#country-list").querySelectorAll(".list-item").forEach((el) => {
    el.classList.toggle("active", +el.dataset.id === id);
  });
  renderCountryCard(id);
}

function onPickHandlers() {
  $(".search-row").style.display = "";
  $("#country-search").oninput = () => buildCountryList();
  $("#btn-random").onclick = randomCountry;
}

function offPickHandlers() {
  $("#country-search").oninput = null;
  $("#btn-random").onclick = null;
}

function randomCountry() {
  const w = app.pickWorld;
  const list = w.playable();
  const pool = app.mode === "daily" ? list.filter((c) => c.difficulty >= 3) : list;
  const c = pool[Math.floor(Math.random() * pool.length)];
  selectCountry(c.id);
  if (c) {
    app.pickRenderer.centerOn(c.x, c.y);
    app.pickRenderer.cam.zoom = Math.max(app.pickRenderer.cam.zoom, 2.2);
    app.pickRenderer.renderBase(true);
  }
}

// One click from the menu straight into a match. The portal allows at most one
// click before gameplay, and this is that click: a random mid-sized nation on
// the world map, default settings, no configuration screen. Players who want to
// choose can still use "اختر دولتك", which is the explicitly labelled button.
function quickStart() {
  if (!app.pickWorld) {
    app.pickWorld = new World("world", app.era);
    app.pickRenderer = new Renderer($("#pick-canvas"), app.pickWorld, pickStubGame(app.pickWorld));
    attachPickInput();
  }
  app.mode = "normal";
  app.campaign = null;
  app.daily = null;
  app.era = app.era || "modern";
  app.preset = "world";
  if (!app.goal) app.goal = 0.5;
  if (!app.aiLevel) app.aiLevel = "normal";
  const pool = app.pickWorld.playable().filter((c) => c.cells > 120);
  const c = pool[Math.floor(Math.random() * pool.length)];
  if (!c) return startFlow();
  startGame(c.id);
  toast(t("⚡ بدأت فورًا") + " — " + nationName(c), "good");
}

function pickDailyNation(showToast) {
  const w = app.pickWorld;
  const list = w
    .playable()
    .filter((c) => (app.daily.smallNation ? c.cells > 40 && c.cells < 900 : c.cells > 120 && c.cells < 14000))
    .sort((a, b) => a.id - b.id);
  const c = list[app.daily.nationIdx % list.length];
  if (!c) return;
  selectCountry(c.id);
  app.pickRenderer.centerOn(c.x, c.y);
  app.pickRenderer.cam.zoom = Math.max(app.pickRenderer.cam.zoom, 2.2);
  app.pickRenderer.renderBase(true);
  if (showToast) toast("دولة اليوم: " + c.ar);
}

function attachPickInput() {
  const canvas = $("#pick-canvas");
  if (canvas.dataset.bound) return;
  canvas.dataset.bound = "1";
  let down = null;
  canvas.addEventListener("pointerdown", (e) => {
    down = { x: e.clientX, y: e.clientY, cx: app.pickRenderer.cam.x, cy: app.pickRenderer.cam.y };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!down) return;
    const r = canvas.getBoundingClientRect();
    const dx = e.clientX - down.x;
    const dy = e.clientY - down.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) {
      app.pickRenderer.cam.x = down.cx - dx / app.pickRenderer.cam.zoom;
      app.pickRenderer.cam.y = down.cy - dy / app.pickRenderer.cam.zoom;
      app.pickRenderer.clampCam();
      app.pickRenderer.renderBase();
      app.pickRenderer.render();
    }
    void r;
  });
  canvas.addEventListener("pointerup", (e) => {
    const dx = Math.abs(e.clientX - down.x);
    const dy = Math.abs(e.clientY - down.y);
    down = null;
    if (dx + dy > 5) return;
    const r = canvas.getBoundingClientRect();
    const cell = app.pickRenderer.screenToCell(e.clientX - r.left, e.clientY - r.top);
    if (cell < 0) return;
    const owner = app.pickWorld.owner[cell];
    if (owner >= 0) selectCountry(owner);
  });
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      app.pickRenderer.zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.18 : 0.85);
      app.pickRenderer.renderBase();
      app.pickRenderer.render();
    },
    { passive: false }
  );
}

// ------------------------------------------------------------ campaigns ---

function openCampaignList() {
  const grid = $("#mode-grid");
  $("#select-title").textContent = t("الحملات التاريخية");
  $("#select-sub").textContent = t("اختر حملة وابدأ من حدودها التاريخية");
  document.querySelector(".filters").style.display = "flex";
  fillFilters();
  ensureCampaignModal();
  $("#era-select").disabled = false;
  show("country");
  const list = $("#country-list");
  offPickHandlers();
  list.innerHTML = CAMPAIGNS.map(
    (c) => `<button class="list-item" data-camp="${c.id}">
      <span class="nm"><b>${c.ar}</b><br><small style="color:var(--muted);font-size:11px">${c.year} • ${ERAS[c.era].ar}</small></span>
      <span class="stars">${"★".repeat(Math.round(c.goal * 10))}</span>
    </button>`
  ).join("");
  list.querySelectorAll("[data-camp]").forEach((el) => {
    el.onclick = () => chooseCampaign(el.dataset.camp);
  });
  $("#btn-random").onclick = () => {
    const camp = CAMPAIGNS[Math.floor(Math.random() * CAMPAIGNS.length)];
    chooseCampaign(camp.id);
  };
  $("#country-search").oninput = null;
  // hide country card + search for campaigns
  $(".search-row").style.display = "none";
  buildCampaignPreview();
}

let campaignModal = null;
function ensureCampaignModal() {
  if (campaignModal) return campaignModal;
  campaignModal = document.createElement("div");
  campaignModal.className = "modal";
  campaignModal.innerHTML = `<div class="modal-card"><header><h3>الحملة</h3><button class="icon-btn" data-close>✕</button></header><div id="camp-body"></div></div>`;
  $("#app").appendChild(campaignModal);
  campaignModal.querySelector("[data-close]").onclick = () => {
    campaignModal.hidden = true;
  };
  return campaignModal;
}

function buildCampaignPreview() {
  $("#country-card").innerHTML = `<div class="card-empty">اختر حملة من القائمة لرؤية تفاصيلها</div>`;
  app.pickRenderer.selected = null;
  highlightCampaign(null);
  app.pickRenderer.renderBase(true);
  app.pickRenderer.render();
}

let campaignSel = null;
function chooseCampaign(id) {
  const camp = CAMPAIGNS.find((c) => c.id === id);
  if (!camp) return;
  campaignSel = camp;
  app.era = camp.era;
  $("#era-select").value = camp.era;
  app.pickWorld = new World("world", camp.era);
  app.pickRenderer.world = app.pickWorld;
  app.goal = camp.goal;
  highlightCampaign(camp);
  const card = $("#country-card");
  card.classList.remove("collapsed");
  card.innerHTML = `
    <button class="card-close" id="card-close">✕</button>
    <h3 style="margin:0 0 4px">${campName(camp)}</h3>
    <small style="color:var(--muted)">${camp.en} • ${camp.year} • ${ERAS[camp.era].ar}</small>
    <p style="font-size:12.5px;line-height:1.7;color:var(--muted)">${t(camp.arBlurb)}</p>
    <div class="stat-grid">
      <div class="stat"><b>${arNum(camp.include.length)}</b><small>${t("دولة تبدأ معك")}</small></div>
      <div class="stat"><b>${camp.goal * 100}%</b><small>${t("الهدف الأرضي")}</small></div>
    </div>
    <div class="card-actions">
      <button class="btn gold" id="btn-start-campaign">${t("ابدأ")} ${campName(camp)}</button>
      <button class="btn ghost" id="btn-camp-back">→ ${t("كل الحملات")}</button>
    </div>`;
  card.querySelector("#card-close").onclick = () => card.classList.add("collapsed");
  card.querySelector("#btn-start-campaign").onclick = () => startCampaign(camp);
  card.querySelector("#btn-camp-back").onclick = () => openCampaignList();
  const focus = app.pickWorld.countries.find((c) => c.name === camp.country);
  if (focus) {
    app.pickRenderer.cam.zoom = 3;
    app.pickRenderer.centerOn(focus.x, focus.y);
  }
  app.pickRenderer.renderBase(true);
  app.pickRenderer.render();
}

function highlightCampaign(camp) {
  app.pickRenderer.highlight = null;
  app.pickRenderer.selected = null;
  app.pickRenderer.campaign = camp;
  app.pickRenderer.renderBase(true);
}

// -------------------------------------------------------------- start game ---

function dailyWorld() {
  const preset = app.mode === "history" ? "world" : app.preset;
  const world = new World(preset, app.era);
  if (app.mode === "daily" && app.daily?.startBuildings) {
    const list = world.playable();
    const c = list[app.daily.nationIdx % list.length];
    if (c) {
      // Enough land to actually place the free buildings on.
      let need = 12;
      for (let i = 0; i < world.size && need > 0; i++) {
        if (world.owner[i] !== c.id) continue;
        const x = i % world.w;
        const y = (i / world.w) | 0;
        let n = 0;
        if (x > 0 && world.owner[i - 1] === c.id) n++;
        if (x < world.w - 1 && world.owner[i + 1] === c.id) n++;
        if (y > 0 && world.owner[i - world.w] === c.id) n++;
        if (y < world.h - 1 && world.owner[i + world.w] === c.id) n++;
        if (n < 3) continue;
        world.owner[i] = c.id;
        const nx = x + (world.owner[i - 1] === c.id ? -1 : 1);
        world.owner[y * world.w + nx] = c.id;
        need--;
      }
      recomputeCounts(world);
    }
  }
  return world;
}

function startGame(countryId) {
  const world = dailyWorld();
  const opts = {
    world,
    era: app.era,
    mode: app.mode,
    goal: app.goal,
    aiLevel: app.aiLevel,
    playerId: countryId,
    seed: Date.now() & 0xffffffff,
  };
  if (app.mode === "daily" && app.daily) {
    opts.startBuildings = app.daily.startBuildings;
    opts.startGold = app.daily.gold;
    opts.daily = app.daily.ar;
  }
  const game = new Game(opts);
  game.startCeasefire(app.mode === "daily" && app.daily?.ceasefire === 0 ? 0 : 25);
  if (app.mode === "daily" && app.daily) {
    const p = game.player();
    if (p && app.daily.gold) p.gold = app.daily.gold;
    const cap = game.capacityOf(p);
    p.army = Math.max(p.army, Math.floor(cap * 0.6));
  }
  bootGame(game);
}

function startCampaign(camp) {
  const world = new World("world", camp.era);
  const playerDef = world.countries.find((c) => c.name === camp.country);
  if (!playerDef) {
    toast(t("هذه الحملة تحتاج خرائط أخرى"));
    return;
  }
  // Empire start: the campaign's historical territory becomes one nation.
  const set = new Set([camp.country, ...camp.include]);
  const owners = world.owner;
  for (let i = 0; i < world.size; i++) {
    const o = owners[i];
    if (o < 0) continue;
    if (set.has(world.countries[o].name)) owners[i] = playerDef.id;
  }
  recomputeCounts(world);
  const game = new Game({
    world,
    era: camp.era,
    mode: "history",
    goal: camp.goal,
    aiLevel: app.aiLevel,
    playerId: playerDef.id,
    seed: Date.now() & 0xffffffff,
    campaign: camp.id,
  });
  game.startCeasefire(25);
  game.campaign = camp;
  bootGame(game, world);
}

function recomputeCounts(world) {
  world.cellCount = new Int32Array(world.countries.length);
  world.cellsOfActive = 0;
  for (let i = 0; i < world.size; i++) {
    const o = world.owner[i];
    if (o >= 0) world.cellCount[o]++;
  }
  for (const c of world.countries) if (world.active[c.id]) world.cellsOfActive += world.cellCount[c.id];
}

// --------------------------------------------------------------- rooms ---
// The portal needs to know which room the player is in so friends can join.
// Our lobby codes are already unique per open room, so they double as roomId.
let roomState = null; // { id, joinable }

function roomGone() {
  if (!roomState) return;
  roomState = null;
  roomLeft();
}

function roomUpdate(id, joinable) {
  if (!id) return roomGone();
  const changed = !roomState || roomState.id !== String(id) || roomState.joinable !== !!joinable;
  roomState = { id: String(id), joinable: !!joinable };
  if (!changed) return;
  // A player mid-match is not joinable; a lobby waiting for players is.
  if (app.screen === "game" && app.game && !app.paused && !app.game.result) roomJoined(id, { joinable: false });
  else roomJoined(id, { joinable: !!joinable });
}

// ------------------------------------------------------------ chat safety ---
// CrazyGames requires a profanity filter on any user-generated text. This is the
// simple word-list kind they recommend, deliberately conservative: it masks the
// letters of an obvious slur and leaves ordinary trash talk alone, because
// over-blocking is its own kind of broken.
const BLOCKED = [
  "fuck", "shit", "bitch", "cunt", "nigger", "nigga", "faggot", "retard", "whore",
  "slut", "bastard", "asshole", "dick", "pussy", "rape", "kys", "hitler", "nazi",
  "كلب", "حقير", "شرموط", "قحبة", "خرا", "زبالة", "تافه",
];

// Letters are compared with diacritics and common leet substitutions folded, so
// "sh1t" and "f u c k" are caught too.
function fold(text) {
  return String(text)
    .toLowerCase()
    .replace(/[0@]/g, "o")
    .replace(/[1!|]/g, "i")
    .replace(/3/g, "e")
    .replace(/4/g, "a")
    .replace(/5\$/g, "s")
    .replace(/7/g, "t")
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, ""); // Arabic diacritics
}

function censor(text) {
  let out = String(text || "").slice(0, 200);
  if (!out.trim()) return "";
  const flat = fold(out);
  for (const word of BLOCKED) {
    const w = fold(word);
    let from = 0;
    for (;;) {
      const at = flat.indexOf(w, from);
      if (at === -1) break;
      // mask the original characters that produced the match
      out = out.slice(0, at) + "*".repeat(Math.min(w.length, out.length - at)) + out.slice(at + w.length);
      from = at + w.length;
    }
  }
  return out;
}

// Hide every chat affordance when the portal forbids chat.
function applyChatSetting() {
  const off = getSettings().disableChat;
  for (const sel of ["#chat-dock", "#lobby-chat", "#chat-input", "#chat-send", "#dock-input", "#dock-send"]) {
    const el = $(sel);
    if (!el) continue;
    if (off) {
      el.hidden = true;
      // a hidden chat still listening for Enter would be a trap
      if (el.tagName === "INPUT") el.setAttribute("disabled", "disabled");
    } else if (el.tagName === "INPUT") {
      el.removeAttribute("disabled");
    }
  }
}

// The portal's muteAudio setting outranks the in-game toggle, so both feed
// through here. With no SDK present getSettings() is all false and the player's
// own preference wins, exactly as before.
function applyAudioSetting() {
  const platformMuted = getSettings().muteAudio;
  sfx.enabled = !platformMuted && profile.settings.sound !== false;
  const toggle = $("#set-sound");
  if (toggle) {
    toggle.checked = profile.settings.sound !== false;
    // Make it obvious that the portal, not the game, is holding audio down.
    toggle.disabled = platformMuted;
    toggle.closest(".row")?.classList.toggle("locked", platformMuted);
  }
}

function bootGame(game, prebuiltWorld) {
  if (prebuiltWorld) {
    app.pickWorld = prebuiltWorld;
    if (app.pickRenderer) app.pickRenderer.world = prebuiltWorld;
  }
  app.game = game;
  // The player is now in a playable state — this is the event the portal uses
  // to stop measuring load time and start measuring play time.
  gameplayStart();
  app.brush = null;
  app.strikeMode = null;
  app.tab = "empire";
  app.paused = false;
  app.speed = profile.settings.speed || 1;
  if (!app.renderer) {
    app.renderer = new Renderer($("#map"), game.world, game);
    attachGameInput();
  } else {
    app.renderer.setGame(game);
    app.renderer.canvas = $("#map");
    app.renderer.ctx = $("#map").getContext("2d", { alpha: false });
  }
  app.renderer.labels = profile.settings.labels !== false;
  applyAudioSetting();
  app.renderer.highlight = null;
  app.renderer.selected = null;
  app.renderer.brush = null;
  const p = game.player();
  game.onMedal = (id) => {
    if (!profile.medals.includes(id)) {
      profile.medals.push(id);
      store.set(PROFIL_KEY, profile);
    }
    saveProfileMedals([id]);
    const m = MEDALS.find((x) => x.id === id);
    if (m) toast(`🏅 وسام جديد: ${m.ar}`, "good");
    renderMedals();
  };
  game.onEnd = (summary) => {
    if (!game.remote) showEnd(summary);
  };
  show("game");
  requestAnimationFrame(() => {
    app.renderer.resize();
    app.renderer.baseKey = "";
    const pl = game.player();
    if (pl) {
      const c = pl.def;
      app.renderer.cam.zoom = 3.4;
      if (game.mode === "history") fitPickBounds(pl);
      else app.renderer.centerOn(c.x, c.y);
    }
    app.renderer.lastBaseAt = 0;
    app.renderer.renderBase(true);
    updateHud(true);
    if (game.mode === "daily") toast(`${game.daily?.ar || t("تحدي اليوم")}: ${app.daily?.arBlurb || ""}`);
    if (game.ceasefireLeft > 0) toast(t("الهدنة سارية — ابنِ قبل أن تبدأ الحرب"));
  });
  if (!app.raf) loop();
  if (!game.remote) store.del(STORE_KEY);
}

function fitPickBounds(n) {
  const w = app.renderer.world;
  let x0 = 1e9;
  let y0 = 1e9;
  let x1 = -1e9;
  let y1 = -1e9;
  for (let i = 0; i < w.size; i++) {
    if (w.owner[i] !== n.id) continue;
    const x = i % w.w;
    const y = (i / w.w) | 0;
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  if (x0 > x1) return;
  app.renderer.fitTo({ x0, y0, x1, y1 }, 0.82);
}

// -------------------------------------------------------------- game input ---

function attachGameInput() {
  const canvas = $("#map");
  const R = () => app.renderer;
  let drag = null;
  let pinch = null;
  let lastTap = 0;

  canvas.addEventListener("pointerdown", (e) => {
    if (e.button === 2) return;
    canvas.setPointerCapture(e.pointerId);
    const rect = canvas.getBoundingClientRect();
    drag = {
      x: e.clientX,
      y: e.clientY,
      sx: e.clientX - rect.left,
      sy: e.clientY - rect.top,
      cx: R().cam.x,
      cy: R().cam.y,
      moved: false,
      button: e.button,
      t: performance.now(),
    };
    canvas.classList.add("grabbing");
  });

  canvas.addEventListener("pointermove", (e) => {
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const cell = R().screenToCell(sx, sy);
    if (cell !== R().hoverCell) {
      R().hoverCell = cell;
      if (R().brush) R().brushOk = !app.game.canBuild(app.game.player(), R().brush, cell);
      updateTooltip(e.clientX, e.clientY, cell);
    }
    if (drag) {
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) > 5) drag.moved = true;
      if (drag.moved && (profile.settings.drag !== false || e.pointerType !== "touch")) {
        R().cam.x = drag.cx - dx / R().cam.zoom;
        R().cam.y = drag.cy - dy / R().cam.zoom;
        R().clampCam();
        R().renderBase();
        R().render();
      }
    }
  });

  canvas.addEventListener("pointerup", (e) => {
    canvas.classList.remove("grabbing");
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const wasDrag = drag && drag.moved;
    const quick = drag && performance.now() - drag.t < 400;
    drag = null;
    if (wasDrag) return;
    const cell = R().screenToCell(sx, sy);
    if (cell < 0) return;
    if (e.pointerType === "touch") {
      const now = performance.now();
      const isDouble = now - lastTap < 320 && quick;
      lastTap = now;
      if (isDouble) {
        const owner = app.game.owners[cell];
        if (owner >= 0 && owner !== app.game.player()?.id) orderAttack(owner);
        return;
      }
    }
    handleClick(cell, e);
  });

  canvas.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const cell = R().screenToCell(e.clientX - rect.left, e.clientY - rect.top);
    if (cell < 0) return;
    handleRightClick(cell);
  });

  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      R().zoomAt(e.clientX - rect.left, e.clientY - rect.top, e.deltaY < 0 ? 1.16 : 0.86);
      R().renderBase();
      R().render();
    },
    { passive: false }
  );

  canvas.addEventListener("pointerleave", () => {
    $("#tooltip").hidden = true;
    R().hoverCell = -1;
  });

  // two-finger pinch zoom
  canvas.addEventListener(
    "touchmove",
    (e) => {
      if (e.touches.length !== 2) return;
      const [a, b] = e.touches;
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      if (pinch) {
        const rect = canvas.getBoundingClientRect();
        const mx = (a.clientX + b.clientX) / 2 - rect.left;
        const my = (a.clientY + b.clientY) / 2 - rect.top;
        R().zoomAt(mx, my, dist / pinch);
        R().renderBase();
        R().render();
      }
      pinch = dist;
    },
    { passive: true }
  );
  canvas.addEventListener("touchend", () => (pinch = null));

  window.addEventListener("keydown", onKey);
}

function handleClick(cell, e) {
  const game = app.game;
  const R = app.renderer;
  const p = game.player();
  if (!p) return;

  if (app.strikeMode) {
    if (netAct("strike", { cell, kind: app.strikeMode })) {
      sfx.launch();
      app.strikeMode = null;
      R.mode = "paint";
      $("#map").classList.remove("striking");
      updateTab();
      return;
    }
    const err = game.launchStrike(p, cell, app.strikeMode);
    if (err) {
      toast(err, "bad");
      sfx.error();
    } else sfx.launch();
    app.strikeMode = null;
    R.mode = "paint";
    $("#map").classList.remove("striking");
    updateTab();
    return;
  }

  if (app.brush) {
    if (netAct("build", { key: app.brush, cell })) {
      sfx.build();
      if (!e.shiftKey) {
        app.brush = null;
        R.brush = null;
        $("#map").classList.remove("placing");
        updateTab();
      }
      return;
    }
    const err = game.build(p, app.brush, cell);
    if (err) {
      toast(err, "bad");
      sfx.error();
    } else {
      sfx.build();
      if (!e.shiftKey) {
        app.brush = null;
        R.brush = null;
        $("#map").classList.remove("placing");
        updateTab();
      }
    }
    R.renderBase();
    return;
  }

  const owner = game.owners[cell];
  if (owner === p.id && e.shiftKey) {
    const b = p.buildings.find((bb) => bb.cell === cell);
    if (!b) {
      toast(t("لا يوجد مبنى هنا — استخدم Shift مع مبنى للترقية"));
      return;
    }
    if (netAct("upgrade", { cell })) {
      sfx.upgrade();
      return;
    }
    const err = game.upgradeBuilding(p, b);
    toast(err || `${eraName(b.key)} أصبح المستوى ${b.level}`, err ? "bad" : "good");
    if (err) sfx.error();
    else sfx.upgrade();
    app.renderer.renderBase(true);
    updateTab();
    return;
  }
  if (owner === -2) {
    if (netAct("reclaim", { cell })) return;
    const err = game.reclaim(p, cell);
    if (err) toast(err, "bad");
    else sfx.click();
    R.renderBase();
    return;
  }
  if (owner >= 0) {
    const n = game.byId[owner];
    if (!n) return;
    if (owner === p.id) {
      R.selected = owner;
      R.highlight = owner;
      showCountryTooltip(n);
      R.renderBase();
      return;
    }
    // enemy or neutral: remember selection, attack on second intent
    R.selected = owner;
    R.highlight = owner;
    R.renderBase();
    if (game.adjacent(p, n)) {
      if (game.rel(p, n) === "ally") {
        toast(t("حليفك — لا يمكن مهاجمته"), "bad");
        return;
      }
      const lastSel = app.lastAttackSel;
      if (lastSel === owner && performance.now() - (app.lastAttackAt || 0) < 2500) {
        orderAttack(owner);
      } else {
        app.lastAttackSel = owner;
        app.lastAttackAt = performance.now();
        toast(t("اضغط مرة أخرى لبدء الهجوم على") + " " + nationName(n));
      }
    } else if (game.hasPort(p)) {
      if (netAct("attack", { target: n.id, frac: game.attackFraction })) {
        toast(t("غزو بحري على") + " " + nationName(n) + "!");
        sfx.attack();
        return;
      }
      const err = game.launchAttack(p, n, game.attackFraction);
      if (err) toast(err, "bad");
      else toast(t("غزو بحري على") + " " + nationName(n) + "!");
    } else {
      toast(t("ليست على حدودك — تحتاج ميناء لغزو بحري"));
    }
  }
}

function handleRightClick(cell) {
  const game = app.game;
  const owner = game.owners[cell];
  if (owner < 0) return;
  const n = game.byId[owner];
  app.renderer.selected = owner;
  app.renderer.renderBase();
  openDiplo(n.id);
}

// Center the camera on the player's capital (the "home" touch button).
function centerOnCapital() {
  const R = app.renderer;
  const game = app.game;
  if (!R || !game) return;
  const p = game.player();
  if (!p) return;
  const world = game.world;
  const c = world.countries[p.id];
  const cell = p.capital >= 0 ? p.capital : null;
  const x = cell != null ? cell % world.w : c && c.x;
  const y = cell != null ? (cell / world.w) | 0 : c && c.y;
  if (x == null || y == null) return;
  R.centerOn(x, y);
  R.cam.zoom = Math.max(R.cam.zoom, 3);
  R.clampCam();
  R.renderBase();
  R.render();
}

// One-tap attack sheet: every reachable enemy with a rough strength read, so a
// phone player never has to hunt for a border cell to tap.
function openAttackSheet() {
  const game = app.game;
  const p = game && game.player();
  if (!p || !p.alive) return;
  const list = [];
  const seen = new Set();
  const consider = (n) => {
    if (!n || !n.alive || n.id === p.id || seen.has(n.id)) return;
    if (p.ally.has(n.id)) return;
    seen.add(n.id);
    const reach = game.adjacent(p, n);
    if (!reach && !(game.hasPort(p) && game.canReach(p, n))) return;
    const ratio = (p.army * game.attackMult(p)) / Math.max(1, n.army * game.defenseMult(n));
    list.push({ n, naval: !reach, ratio });
  };
  for (const id of p.def.neighbors) consider(game.byId[id]);
  if (game.hasPort(p)) {
    for (const id of game.navalReach(p)) consider(game.byId[id]);
  }
  if (!list.length) return toast(t("لا يوجد هدف على حدودك"), "warn");
  list.sort((a, b) => b.ratio - a.ratio);
  const target =
    app.selected != null && list.find((x) => x.n.id === app.selected)
      ? list.find((x) => x.n.id === app.selected)
      : list[0];
  app.selected = target.n.id;
  app.renderer.selected = target.n.id;
  if (app.renderer.cam && target.n.def.x != null) app.renderer.centerOn(target.n.def.x, target.n.def.y);
  openDiplo(target.n.id);
  return target;
}

function orderAttack(id) {
  const game = app.game;
  const p = game.player();
  const target = game.byId[id];
  if (!target) return;
  if (netAct("attack", { target: id, frac: game.attackFraction })) {
    app.lastAttackSel = null;
    sfx.attack();
    updateEvents();
    return;
  }
  const err = game.launchAttack(p, target, game.attackFraction);
  if (err) {
    toast(err, "bad");
    sfx.error();
  } else sfx.attack();
  app.lastAttackSel = null;
  updateEvents();
}

function onKey(e) {
  if (app.screen !== "game") return;
  const tag = (e.target.tagName || "").toLowerCase();
  if (tag === "input" || tag === "select" || tag === "textarea") return;
  const game = app.game;
  if (!game) return;
  const k = e.key.toLowerCase();
  if (["1", "2", "3", "4", "5", "6", "7", "8"].includes(k)) {
    const def = BUILDINGS[+k - 1];
    if (def) pickBuilding(def.key, e.shiftKey);
    e.preventDefault();
    return;
  }
  if (k === "r") {
    $("#modal-research").hidden = false;
    updateResearch();
  } else if (k === "q") {
    setForce(game.attackFraction - 0.1);
  } else if (k === "e") {
    setForce(game.attackFraction + 0.1);
  } else if (k === " ") {
    e.preventDefault();
    togglePause();
  } else if (k === "escape") {
    closeModals();
    if (app.brush) {
      app.brush = null;
      app.renderer.brush = null;
      $("#map").classList.remove("placing");
    }
  } else if (k === "f") {
    const p = game.player();
    if (p && p.capital >= 0) {
      const s = app.renderer.cellToScreen(p.capital);
      app.renderer.centerOn(s.x, s.y);
      app.renderer.renderBase(true);
    }
  } else if (k === "m") {
    app.game.melt = !app.game.melt;
    updateTab();
  } else if (k === "+" || k === "=") {
    cycleSpeed(1);
  } else if (k === "-") {
    cycleSpeed(-1);
  } else if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) {
    const step = 60 / app.renderer.cam.zoom;
    const d = { w: [0, -1], s: [0, 1], a: [1, 0], d: [-1, 0], arrowup: [0, -1], arrowdown: [0, 1], arrowleft: [1, 0], arrowright: [-1, 0] }[k];
    if (d) {
      app.renderer.panBy(d[0] * step, d[1] * step);
      app.renderer.renderBase();
    }
  }
}

function closeModals() {
  $$(".modal").forEach((m) => (m.hidden = true));
  if (campaignModal) campaignModal.hidden = true;
}

// ----------------------------------------------------------------- loop ---

let autosaveAt = 0;
function autosave() {
  if (!app.game || app.game.result || app.game.remote) return;
  try {
    const data = app.game.serialize();
    data.savedAt = Date.now();
    store.set(STORE_KEY, data);
  } catch {
    /* ignore */
  }
}

function loop(ts) {
  app.raf = requestAnimationFrame(loop);
  const now = ts || performance.now();
  let dt = (now - (app.last || now)) / 1000;
  app.last = now;
  if (dt > 0.25) dt = 0.25;
  if (app.screen !== "game" || !app.game) {
    idleTick();
    return;
  }
  if (!app.paused && !app.game.remote) {
    app.game.update(dt);
    // adaptive simulation speed so weak devices stay above ~30fps
    app.frameMs = app.frameMs * 0.92 + dt * 1000 * 0.08;
    if (app.frameMs > 42) app.game.speed = Math.min(app.speed, 0.65);
    else if (app.frameMs < 26 && app.game.speed < app.speed) app.game.speed = Math.min(app.speed, app.game.speed + 0.02);
  }
  if (app.game.explosions && app.game.explosions.length) {
    const big = app.game.explosions.some((e) => e.kind === "nuke");
    if (big) sfx.nuke();
    else sfx.boom();
  }
  if (!app.game.remote && app.game.time - autosaveAt > 45) {
    autosaveAt = app.game.time;
    autosave();
  }
  const R = app.renderer;
  R.render();
  hudTick(dt);
}

let idleAt = 0;
function idleTick() {
  const now = performance.now();
  if (now - idleAt < 100) return;
  idleAt = now;
  if (app.screen === "menu") menuPulse();
}

// The main menu uses a painted hero image; we only add a slow parallax drift
// so it feels alive without burning CPU.
let menuDrift = 0;
function menuPulse() {
  const bg = $(".bg-map");
  if (!bg) return;
  menuDrift += 0.06;
  const y = 22 + Math.sin(menuDrift * 0.12) * 1.6;
  const sc = 1.02 + Math.sin(menuDrift * 0.09) * 0.012;
  bg.style.backgroundPosition = `center ${y}%`;
  bg.style.backgroundSize = `auto, auto, ${sc * 100}% auto, auto`;
}

function togglePause() {
  app.paused = !app.paused;
  // A pause is a real play break: tell the portal so it can free resources.
  if (app.paused) gameplayStop();
  else if (app.screen === "game" && app.game && !app.game.result) gameplayStart();
  // Keep the floating touch pad just above the real bottom HUD height, which
  // varies with the mobile tab body. Without this it overlaps the build cards.
  const syncHudHeight = () => {
    const hud = document.querySelector(".hud-bottom");
    const pad = document.getElementById("touch-pad");
    if (!hud || !pad) return;
    const h = Math.round(hud.getBoundingClientRect().height);
    if (h > 0) document.documentElement.style.setProperty("--hud-bottom-h", h + "px");
  };
  syncHudHeight();
  window.addEventListener("resize", syncHudHeight);
  if (typeof ResizeObserver !== "undefined") {
    const hud = document.querySelector(".hud-bottom");
    if (hud) new ResizeObserver(syncHudHeight).observe(hud);
  }

  syncSpeedButtons();
}

function cycleSpeed(dir) {
  const speeds = [1, 1.5, 2.5];
  let i = speeds.indexOf(app.speed);
  if (i < 0) i = 0;
  i = clamp(i + dir, 0, speeds.length - 1);
  app.speed = speeds[i];
  syncSpeedButtons();
}

function syncSpeedButtons() {
  const btn = $("#btn-speed");
  btn.textContent = app.paused ? "❚❚" : app.speed > 1 ? `▶▶${app.speed}` : "▶";
  btn.classList.toggle("on", app.paused || app.speed > 1);
}

// ------------------------------------------------------------------ HUD ---

let hudTimer = 0;
let tabTimer = 0;
let minimapTimer = 0;

function hudTick(dt) {
  hudTimer += dt;
  if (hudTimer < 0.12) return;
  hudTimer = 0;
  updateHud();
  updateEvents();
}

const lastVals = {};
function setRes(sel, value, sub) {
  const el = $(sel);
  const b = el.querySelector("b");
  const txt = fmt(value);
  if (b.textContent !== txt) {
    b.textContent = txt;
    if (lastVals[sel] !== undefined && value > lastVals[sel]) {
      el.classList.remove("flash");
      void el.offsetWidth;
      el.classList.add("flash");
    }
    lastVals[sel] = value;
  }
  if (sub != null) el.querySelector("small").textContent = sub;
}

function updateHud(force) {
  const game = app.game;
  let p = game?.player();
  if (game && game.remote && app.netMirror) p = app.netMirror.me || p;
  if (!p) return;
  const rate = game.resourceRate(p);
  setRes("#res-gold", p.gold, "+" + fmt(rate.gold) + t("/ث"));
  setRes("#res-army", p.army, pct(p.army / Math.max(1, p.cap)));
  setRes("#res-research", p.research, "+" + rate.research.toFixed(1) + t("/ث"));
  $("#nation-name").textContent = p.ar;
  $("#rank-name").textContent = game.rankName(p) + (game.xpTotal > 1 ? ` • ${Math.round(game.xpTotal)} XP` : "");
  const col = p.def.color;
  const flag = $("#flag");
  flag.style.background = `rgb(${col.r},${col.g},${col.b})`;
  flag.textContent = (p.def.iso || t("؟")).slice(0, 2);
  const share = game.playerShare ? game.playerShare() : 0;
  $("#goal-pct").textContent = pct(share);
  $("#goal-bar").style.width = clamp((share / game.goal) * 100, 0, 100) + "%";
  $("#goal-label").textContent = `${t("الهدف:")} ${game.goal * 100}% ${t("من الأرض")}`;
  $("#obj-text").textContent = `سيطر على ${game.goal * 100}% من الأرض`;
  $("#obj-val").textContent = pct(share);
  $("#obj-bar").style.width = clamp((share / game.goal) * 100, 0, 100) + "%";
  const neighbors = p.def.neighbors.map((id) => game.byId[id]).filter((n) => n && n.alive);
  $("#obj-sub").textContent = `أرضك: ${arNum(p.cells)} خلية • جيران: ${arNum(neighbors.length)}`;
  const wars = [...p.war].map((id) => game.byId[id]).filter((n) => n && n.alive);
  const allies = [...p.ally].map((id) => game.byId[id]).filter((n) => n && n.alive);
  $("#obj-extra").innerHTML = `
    <div class="oe"><span>الجيش</span><b>${fmt(p.army)} / ${fmt(p.cap)}</b></div>
    <div class="oe"><span>الحروب</span><b style="color:var(--red)">${arNum(wars.length)}</b></div>
    <div class="oe"><span>التحالفات</span><b style="color:var(--green)">${arNum(allies.length)}</b></div>
    <div class="oe"><span>الترتيب</span><b>${arNum(rankOfNation(game, p))} / ${arNum(game.nations.size)}</b></div>
    ${game.remote ? `<div class="oe"><span>لاعبون</span><b>${arNum((game.seats || []).filter((s) => s.alive).length)} / ${arNum((game.seats || []).length)}</b></div>` : ""}
    <div class="oe tip"><span>💡</span><b style="font-weight:500;color:var(--muted);text-align:left">${currentTip()}</b></div>`;
  // ---- tactical read-out: pincers and allied coordination, live ----
  const tac = $("#obj-tactics");
  if (tac) {
    const mine = (game.attacks || []).filter((a) => a.active && a.attacker === p);
    let best = null;
    let coord = false;
    for (const a of mine) {
      const r = game.tacticalRead(a);
      if (r.directions >= 2 && (!best || r.pincer > best.pincer)) {
        best = { t: a.defender, ...r };
      }
      if (r.coordinated > 1) coord = true;
    }
    const bits = [];
    if (best) bits.push(`<span class="tac pincer">🗡 ${t("كمّاشة على")} ${escapeHtml(nationName(best.t))} ×${best.pincer.toFixed(2)}</span>`);
    if (coord) bits.push(`<span class="tac coord">🤝 ${t("هجوم منسّق مع حلفاء")}</span>`);
    if (allies.length) bits.push(`<span class="tac ally">🛡 ${arNum(allies.length)} حليف يقوّي دفاعك</span>`);
    tac.innerHTML = bits.join("");
  }
  const cez = game.ceasefireLeft;
  const badge = $("#ceasefire-badge");
  if (cez > 0) {
    badge.textContent = t("هدنة") + " " + Math.ceil(cez) + t("ث");
    badge.style.display = "";
    badge.style.background = "rgba(142,217,138,0.16)";
    badge.style.color = "var(--green)";
  } else if (game.openedAt) {
    badge.textContent = t("الحرب!");
    badge.style.background = "rgba(255,125,116,0.16)";
    badge.style.color = "var(--red)";
  }
  // NB: `t` is the translation helper — a local of that name would shadow it.
  const elapsed = Math.max(0, Math.floor(game.time - (game.openedAt || 0)));
  $("#clock").textContent = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;
  $("#force-val").textContent = Math.round(game.attackFraction * 100) + "%";
  $("#force-slider").value = Math.round(game.attackFraction * 100);
  renderFeed();
  tabTimer += 0.12;
  if (force || tabTimer > 0.9) {
    tabTimer = 0;
    updateTab();
  }
  minimapTimer += 0.12;
  if (force || minimapTimer > 0.35) {
    minimapTimer = 0;
    app.renderer.drawMinimap($("#minimap"), (x, y, w2, h2) => {
      const v = $("#mm-view");
      v.style.left = x + 3 + "px";
      v.style.top = y + 3 + "px";
      v.style.width = Math.max(4, w2) + "px";
      v.style.height = Math.max(4, h2) + "px";
    });
  }
  const offers = game.offers.filter((o) => o.to === p.id);
  const badgeD = $("#btn-diplo");
  badgeD.classList.toggle("on", offers.length > 0);
}

const TIPS = [
  t("ابنِ مصنعًا ومدينة في أول 30 ثانية."),
  t("شريط قوة الهجوم 50% يكفي غالبًا — لا ترسل كل جيشك."),
  t("المخبأ يبطئ الهجوم على حدودك 9% لكل مستوى."),
  t("اضغط Shift على مبنى لترقيته للمستوى التالي."),
  t("ميناء يفتح الغزو البحري لأي ساحل في العالم."),
  "Gift الذهب لجارك ليبقى محايدًا أطول.",
  t("منصة صواريخ تحوّل الأرض إلى خرائب لا يعبرها الجيش."),
  t("الجيش يتجدد أسرع عندما يكون أقل من السقف."),
  t("الدفاع الجوي يعترض صواريخ العدو القريبة."),
  "التحصين يمنح +30% دفاع لمدة 20 ثانية.",
  t("اضغط F للعودة إلى عاصمتك."),
  t("كل بحث يرفع قوة جيشك أو اقتصادك بشكل دائم."),
];
let tipIdx = 0;
let tipAt = 0;
function currentTip() {
  const now = performance.now();
  if (now - tipAt > 9000) {
    tipAt = now;
    tipIdx = (tipIdx + 1) % TIPS.length;
  }
  return TIPS[tipIdx];
}

function rankOfNation(game, p) {
  let r = 1;
  for (const n of game.nations.values()) if (n.alive && n.cells > p.cells) r++;
  return r;
}

let feedSig = "";
let lastFeedT = -1;
function playFeedSounds(items) {
  if (!items.length) return;
  for (const f of items) {
    if (f.t <= lastFeedT) break;
    if (/عاصمة/.test(f.text)) sfx.boom();
    else if (/ضربة صاروخية|نووي/.test(f.text)) sfx.nuke();
    else if (/تهجم عليك/.test(f.text)) sfx.alarm();
    else if (/احتلال|استسلمت/.test(f.text)) sfx.capture();
  }
  lastFeedT = items[0].t;
}

function renderFeed() {
  const game = app.game;
  const items = game.feed.slice(0, 7);
  playFeedSounds(items);
  const sig = items.map((f) => f.t + f.text).join("|");
  if (sig === feedSig) return;
  feedSig = sig;
  $("#feed").innerHTML = items
    .map((f) => `<div class="fi ${f.kind || ""}">${escapeHtml(f.text)}</div>`)
    .join("");
}

let eventsSig = "";
function updateEvents() {
  const game = app.game;
  const p = game?.player();
  if (!p) return;
  const rows = [];
  for (const a of game.attacks) {
    if (!a.active) continue;
    const mine = a.attacker === p;
    const incoming = a.defender === p;
    if (!mine && !incoming) continue;
    const other = mine ? a.defender : a.attacker;
    const ratio = clamp(a.ratio || 0, 0, 2);
    const pct2 = Math.round(clamp(ratio / 1.6, 0.05, 1) * 100);
    rows.push(`<div class="ev ${incoming ? "top" : ""}">
      <div class="ev-row">
        <b>${mine ? "➤ هجومك على " + other.ar : "⚠ " + other.ar + " تهجم عليك"}</b>
        <button class="mini" data-retreat="${a.id}">${mine ? t("انسحاب") : t("تحصين")}</button>
      </div>
      <div class="ev-sub">${fmt(a.troops)} ${t("جندي")} • ${a.naval ? t("بحري") : t("برّي")} ${a.landingTimer > 0 ? "• إنزال…" : ""}${mine && (a.stalled || 0) > 2 ? ` • <b class="warn-txt">الجبهة متعثرة</b>` : ""}${mine && a.directions >= 3 ? ` • <b class="good-txt">كمّاشة</b>` : ""}</div>
      <div class="bar ${mine ? "adv" : ""}"><i style="width:${pct2}%"></i></div>
    </div>`);
  }
  for (const o of game.offers) {
    if (o.to !== p.id) continue;
    const from = game.byId[o.from];
    rows.push(`<div class="ev top">
      <div class="ev-row"><b>عرض من ${from?.ar || t("؟")}</b>
        <span><button class="mini" data-accept="${o.id}">قبول</button>
        <button class="mini" data-decline="${o.id}">رفض</button></span></div>
      <div class="ev-sub">${o.type === "ceasefire" ? t("وقف إطلاق نار") : t("تحالف")}</div>
    </div>`);
  }
  const sig = rows.join("");
  if (sig === eventsSig) return;
  eventsSig = sig;
  const el = $("#events");
  el.innerHTML = rows.join("") || "";
  el.querySelectorAll("[data-retreat]").forEach((b) => {
    b.onclick = () => {
      const a = game.attackById(+b.dataset.retreat);
      if (a && a.attacker === p) {
        if (netAct("retreat", { id: a.id })) return;
        game.retreat(a.id);
      } else {
        if (!netAct("fortify", {}) || !online.lastState) {
          const err = game.fortify(p);
          toast(err || t("تم تحصين الحدود"), err ? "bad" : "good");
        }
      }
      updateEvents();
    };
  });
  el.querySelectorAll("[data-accept]").forEach((b) => {
    b.onclick = () => {
      if (netAct("answer", { id: +b.dataset.accept, accept: true })) return;
      game.answerOffer(+b.dataset.accept, true);
    };
  });
  el.querySelectorAll("[data-decline]").forEach((b) => {
    b.onclick = () => {
      if (netAct("answer", { id: +b.dataset.decline, accept: false })) return;
      game.answerOffer(+b.dataset.decline, false);
    };
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ------------------------------------------------------------------ tabs ---

function updateTab() {
  const game = app.game;
  const p = game?.player();
  if (!p) return;
  const body = $("#tab-body");
  $$("#tabs .tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === app.tab));
  if (app.tab === "empire") {
    body.innerHTML = BUILDINGS.map((def, i) => {
      const cost = game.buildingCost(def.key, 1);
      const owned = p.buildings.filter((b) => b.key === def.key).length;
      const cant = p.gold < cost;
      return `<div class="bcard ${app.brush === def.key ? "active" : ""} ${cant ? "locked" : ""}" data-b="${def.key}">
        <span class="hk">${i + 1}</span>
        <div class="bh"><i class="bi" style="background:${def.color}">${ICONS[def.key] || "★"}</i>${eraName(def.key)}</div>
        <div class="cost">${fmt(cost)} ◈ <span>${owned} ${t("مبنى")}</span></div>
        <div class="desc">${def.descAr}</div>
        <button class="pick">${cant ? t("الذهب غير كافٍ") : t("ابنِ")}</button>
      </div>`;
    }).join("");
    body.querySelectorAll(".bcard").forEach((el) => {
      el.onclick = () => pickBuilding(el.dataset.b);
    });
  } else if (app.tab === "economy") {
    const rate = game.resourceRate(p);
    const factories = p.agg?.factory || 0;
    const cities = p.agg?.city || 0;
    body.innerHTML = `
      <div class="mil-row">
        <div class="mil-box"><b>${fmt(rate.gold)}${t("/ث")}</b><small>${t("دخل الذهب")}</small></div>
        <div class="mil-box"><b>${fmt(p.gold)}</b><small>الخزينة</small></div>
        <div class="mil-box"><b>${cities}</b><small>${t("مدن (سقف")} ${fmt(p.cap)})</small></div>
        <div class="mil-box"><b>${factories}</b><small>مصانع</small></div>
        <div class="mil-box"><b>${Math.round(rate.research * 10) / 10}${t("/ث")}</b><small>${t("بحث")}</small></div>
        <div class="mil-box"><b>${fmt(game.troopRate(p) * 60)}${t("/د")}</b><small>${t("تجنيد")}</small></div>
        <div class="mil-actions">
          <button class="btn ghost" id="btn-up-all">⇧ ترقية المبانٍ</button>
          <button class="btn ghost" id="btn-melt2">${game.melt ? t("إيقاف") : t("تشغيل")} ${t("بيع الجنود")}</button>
        </div>
      </div>
      <div class="hint">Shift + ${t("اضغط على أي مبنى في الخريطة لترقيته. الترقية تصل حتى المستوى 5.")}</div>`;
    body.querySelector("#btn-up-all").onclick = () => {
      let n = 0;
      for (const b of [...p.buildings]) {
        if (b.level >= 5) continue;
        if (game.upgradeBuilding(p, b) === null) n++;
        if (p.gold < 400) break;
      }
      toast(n ? `${t("تمت ترقية")} ${n} ${t("مبنى")}` : t("لا يوجد ذهب كافٍ"), n ? "good" : "bad");
      app.renderer.renderBase(true);
      updateTab();
    };
    body.querySelector("#btn-melt2").onclick = () => {
      game.melt = !game.melt;
      updateTab();
    };
    game.melt2 = null;
  } else if (app.tab === "military") {
    const rate = game.troopRate(p);
    const wars = [...p.war].map((id) => game.byId[id]).filter((n) => n?.alive);
    body.innerHTML = `
      <div class="mil-row">
        <div class="mil-box"><b>${fmt(p.army)}</b><small>الجيش</small></div>
        <div class="mil-box"><b>${fmt(p.cap)}</b><small>السقف</small></div>
        <div class="mil-box"><b>+${fmt(rate)}${t("/ث")}</b><small>${t("تجنيد")}</small></div>
        <div class="mil-box"><b>${game.attackMult(p).toFixed(2)}×</b><small>قوة الهجوم</small></div>
        <div class="mil-box"><b>${(p.agg?.base || 0)}</b><small>${t("قواعد")}</small></div>
        <div class="mil-actions">
          <button class="btn ghost" id="btn-rally">${t("تجنيد فوري")} (${fmt(1800)} ◈)</button>
          <button class="btn ghost" id="btn-war">${t("إعلان حرب…")}</button>
        </div>
        <label class="melt-toggle"><input type="checkbox" id="melt" ${game.melt ? "checked" : ""}/> تحويل الجيش إلى ذهب</label>
      </div>`;
    body.querySelector("#melt").onchange = (e) => {
      if (netAct("melt", { on: e.target.checked })) return;
      game.melt = e.target.checked;
    };
    body.querySelector("#btn-rally").onclick = () => {
      if (app.game.remote) return toast("التجنيد الفوري غير متاح أونلاين", "bad");
      if (p.gold < 1800) return toast(t("الذهب غير كافٍ"), "bad");
      p.gold -= 1800;
      p.army = Math.min(p.cap, p.army + 9000);
      updateTab();
    };
    body.querySelector("#btn-war").onclick = () => {
      if (!wars.length) return toast(t("لا حروب مفتوحة"));
      app.tab = "wars";
      updateTab();
    };
    const warChips = wars
      .map((wn) => `<button class="btn ghost" data-focus="${wn.id}">⚔ ${escapeHtml(nationName(wn))} · ${fmt(wn.army)}</button>`)
      .join("");
    body.insertAdjacentHTML(
      "beforeend",
      `<div class="mil-actions" style="margin-top:6px">${warChips || '<span class="hint">لا حروب مفتوحة حاليًا</span>'}</div>`
    );
    body.querySelectorAll("[data-focus]").forEach((b) => {
      b.onclick = () => {
        const n = game.byId[+b.dataset.focus];
        if (n && n.capital >= 0) {
          const c = n.capital % game.world.w;
          const yy = (n.capital / game.world.w) | 0;
          app.renderer.cam.zoom = Math.max(app.renderer.cam.zoom, 4);
          app.renderer.centerOn(c, yy);
          app.renderer.selected = n.id;
          app.renderer.renderBase(true);
        }
      };
    });
  } else if (app.tab === "navy") {
    const ports = p.agg?.port || 0;
    const targets = p.def.sea.map((id) => game.byId[id]).filter((n) => n?.alive);
    body.innerHTML = `
      <div class="mil-row">
        <div class="mil-box"><b>${ports}</b><small>موانئ</small></div>
        <div class="mil-box"><b>${p.stats.naval}</b><small>غزوات بحرية</small></div>
        <div class="mil-box"><b>${fmt(p.army * game.attackFraction)}</b><small>قوة الإنزال</small></div>
        ${ports ? "" : '<div class="mil-box" style="border-color:#6a4a4a"><b style="color:#ffb4ae">مغلق</b><small>ابنِ ميناء (4)</small></div>'}
      </div>
      ${
        ports
          ? `<div class="mil-actions">${targets
              .slice(0, 8)
              .map((n) => `<button class="btn ghost" data-naval="${n.id}">⛵ ${t("إنزال على")} ${escapeHtml(nationName(n))}</button>`)
              .join("")}</div>`
          : ""
      }`;
    body.querySelectorAll("[data-naval]").forEach((b) => {
      b.onclick = () => {
        const n = game.byId[+b.dataset.naval];
        if (netAct("attack", { target: n.id, frac: game.attackFraction })) {
          toast(`أسطولك يتجه إلى ${n.ar}`, "good");
          return;
        }
        const err = game.launchAttack(p, n, game.attackFraction);
        toast(err || `أسطولك يتجه إلى ${n.ar}`, err ? "bad" : "good");
      };
    });
  } else if (app.tab === "strikes") {
    const silos = (p.agg?.byKey?.silo || []).length;
    const ready = (p.agg?.byKey?.silo || []).filter((b) => b.cd <= 0).length;
    body.innerHTML = `
      <div class="mil-row">
        <div class="mil-box"><b>${silos}</b><small>منصات صواريخ</small></div>
        <div class="mil-box"><b>${ready}</b><small>${t("جاهز للإطلاق")}</small></div>
        <div class="mil-box"><b>${fmt(BALANCE.missileCost)} ◈</b><small>صاروخ كروز</small></div>
        <div class="mil-actions">
          <button class="btn ghost" id="btn-missile" ${ready ? "" : "disabled"}>🚀 صاروخ كروز</button>
          <button class="btn ghost" id="btn-nuke" ${ready && p.gold >= BALANCE.nukeCost ? "" : "disabled"}>☢ سلاح نووي</button>
        </div>
      </div>
      <div class="hint">اختر الهدف على الخريطة بعد الضغط على الزر.</div>`;
    const arm = (kind) => {
      app.strikeMode = kind;
      $("#map").classList.add("striking");
      toast(t("اختر هدف الضربة على الخريطة"));
    };
    body.querySelector("#btn-missile").onclick = () => arm("missile");
    body.querySelector("#btn-nuke").onclick = () => arm("nuke");
  }
}

function eraName(key) {
  const names = {
    ancient: [t("قرية"), t("منجم"), t("معبد الكهنة"), t("مرسى"), t("معسكر"), t("حصن"), t("منجنيق"), t("أبراج")],
    medieval: [t("مدينة"), t("ورشة"), t("مكتبة"), t("ميناء"), t("ثكنة"), t("قلعة"), t("مدفع"), t("حراسة")],
    sail: [t("مدينة"), t("مصنع"), t("أكاديمية"), t("حوض"), t("ثكنة"), t("حصن"), t("مدفعية"), t("بطاريات")],
    imperial: [t("مدينة"), t("مصنع"), t("جامعة"), t("ميناء"), t("ثكنة"), t("حصن"), t("مدفعية"), t("دفاعات")],
    modern: [t("مدينة"), t("مصنع"), t("مختبر"), t("ميناء"), t("قاعدة"), t("مخبأ"), t("منصة صواريخ"), t("دفاع جوي")],
  };
  const idx = BUILDINGS.findIndex((b) => b.key === key);
  return (names[app.era] || names.modern)[idx] || key;
}

const ICONS = { city: "▦", factory: "⚙", lab: "⚗", port: "⚓", base: "⌂", bunker: "⛨", silo: "▲", aa: "✦" };

function pickBuilding(key, sticky) {
  const p = app.game.player();
  const def = BUILDING_BY_KEY[key];
  if (app.game.buildingCost(key, 1) > p.gold) {
    toast(`تحتاج ${fmt(app.game.buildingCost(key, 1))} ذهب`, "bad");
    return;
  }
  app.brush = app.brush === key ? null : key;
  app.renderer.brush = app.brush;
  $("#map").classList.toggle("placing", !!app.brush);
  if (app.brush && !sticky) toast(`اضغط داخل أرضك لوضع ${eraName(key)} — Shift لوضع عدة`);
  updateTab();
}

function setForce(v) {
  app.game.attackFraction = clamp(Math.round(v * 20) / 20, 0.1, 1);
  $("#force-val").textContent = Math.round(app.game.attackFraction * 100) + "%";
  $("#force-slider").value = Math.round(app.game.attackFraction * 100);
}

function updateTooltip(clientX, clientY, cell) {
  const tt = $("#tooltip");
  const game = app.game;
  if (window.matchMedia && window.matchMedia("(hover: none)").matches) {
    tt.hidden = true;
    return;
  }
  if (cell == null || cell < 0) {
    tt.hidden = true;
    return;
  }
  const owner = game.owners[cell];
  if (owner < 0) {
    tt.hidden = true;
    return;
  }
  const n = game.byId[owner];
  if (!n) {
    tt.hidden = true;
    return;
  }
  const p = game.player();
  const rel = p && owner !== p.id ? game.relationLabel(p, n) : null;
  const b = n.buildings.find((bb) => bb.cell === cell);
  tt.innerHTML = `
    <h4><i class="swatch" style="background:rgb(${n.def.color.r},${n.def.color.g},${n.def.color.b});display:inline-block"></i> ${n.ar}</h4>
    <div class="tt-row"><span>الجيش</span><b>${fmt(n.army)}</b></div>
    <div class="tt-row"><span>الأرض</span><b>${fmt(n.cells)}</b></div>
    ${rel ? `<div class="tt-row"><span>العلاقة</span><b>${
      { war: "⚔ حرب", ally: "🤝 حليف", peace: "🕊 هدنة", neutral: t("• محايد") }[game.rel(p, n)]
    }</b></div>` : ""}
    ${b ? `<div class="tt-row"><span>${t("مبنى")}</span><b>${eraName(b.key)} L${b.level}</b></div>` : ""}
    ${owner !== p?.id ? `<div class="tt-hint">${game.adjacent(p, n) ? t("اضغط مرتين للهجوم") : t("غزو بحري (يحتاج ميناء)")}</div>` : '<div class="tt-hint">اضغط للبناء/التحديد</div>'}`;
  tt.hidden = false;
  const rect = $("#screen-game").getBoundingClientRect();
  let x = clientX - rect.left + 14;
  let y = clientY - rect.top + 14;
  tt.style.left = Math.min(x, rect.width - 220) + "px";
  tt.style.top = Math.min(y, rect.height - 150) + "px";
}

function showCountryTooltip(n) {
  const p = app.game.player();
  const rel = game2rel(n);
  toast(`${n.ar} — جيش ${fmt(n.army)} • ${rel}`);
  void p;
}

function game2rel(n) {
  const game = app.game;
  const p = game.player();
  if (!p || p === n) return t("أرضك");
  return game.relationLabel(p, n);
}

// ------------------------------------------------------------ modals ---

function updateResearch() {
  const game = app.game;
  const p = game.player();
  $("#research-pts").textContent = `${Math.floor(p.research)} نقطة`;
  const grid = $("#tech-grid");
  grid.innerHTML = RESEARCH.map((r) => {
    const lvl = p.tech[r.key] || 0;
    const cost = game.researchCost(r.key, p);
    const pips = Array.from({ length: 5 }, (_, i) => `<i class="${i < lvl ? "on" : ""}"></i>`).join("");
    return `<div class="tech">
      <h4>${r.icon} ${r.ar}</h4>
      <div class="pips">${pips}</div>
      <p>${t(r.descAr)} (${t("المستوى")} ${lvl}/5)</p>
      <button data-tech="${r.key}" ${lvl >= 5 ? "disabled" : ""}>${lvl >= 5 ? t("مكتمل") : `${t("ترقية")} • ${cost} ✦`}</button>
    </div>`;
  }).join("");
  grid.querySelectorAll("[data-tech]").forEach((b) => {
    b.onclick = () => {
      if (netAct("research", { key: b.dataset.tech })) {
        setTimeout(updateResearch, 300);
        return;
      }
      const err = app.game.doResearch(app.game.player(), b.dataset.tech);
      if (err) toast(err, "bad");
      updateResearch();
    };
  });
}

let diploTarget = null;
function openDiplo(targetId) {
  const game = app.game;
  const p = game.player();
  if (!p) return;
  diploTarget = targetId;
  $("#modal-diplo").hidden = false;
  renderDiplo();
}

function renderDiplo() {
  const game = app.game;
  const p = game.player();
  const offers = $("#offers");
  offers.innerHTML = game.offers
    .filter((o) => o.to === p.id)
    .map((o) => {
      const from = game.byId[o.from];
      return `<div class="offer"><span class="grow">${from?.ar} تعرض ${o.type === "ceasefire" ? t("وقف إطلاق النار") : t("تحالفًا")}</span>
        <button data-acc="${o.id}">قبول</button><button data-dec="${o.id}">رفض</button></div>`;
    })
    .join("");
  offers.querySelectorAll("[data-acc]").forEach((b) => (b.onclick = () => {
    if (netAct("answer", { id: +b.dataset.acc, accept: true })) {
      setTimeout(renderDiplo, 300);
      return;
    }
    game.answerOffer(+b.dataset.acc, true);
    renderDiplo();
  }));
  offers.querySelectorAll("[data-dec]").forEach((b) => (b.onclick = () => {
    if (netAct("answer", { id: +b.dataset.dec, accept: false })) {
      setTimeout(renderDiplo, 300);
      return;
    }
    game.answerOffer(+b.dataset.dec, false);
    renderDiplo();
  }));

  const list = $("#diplo-list");
  const q = (app.diploQuery || "").trim();
  const all = [...game.nations.values()].filter((n) => n.alive && n.id !== p.id);
  const near = all
    .filter((n) => !q || n.ar.includes(q) || n.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => {
      const wa = p.war.has(a.id) ? 0 : p.ally.has(a.id) ? 1 : 2;
      const wb = p.war.has(b.id) ? 0 : p.ally.has(b.id) ? 1 : 2;
      const na = p.def.neighbors.includes(a.id) ? 0 : 1;
      const nb = p.def.neighbors.includes(b.id) ? 0 : 1;
      return wa - wb || na - nb || b.cells - a.cells;
    })
    .slice(0, 40);
  list.innerHTML = near
    .map((n) => {
      const rel = game.rel(p, n);
      const relTxt = { war: t("حرب"), ally: t("حليف"), peace: t("هدنة"), neutral: t("محايد") }[rel];
      const adjacent = p.def.neighbors.includes(n.id);
      return `<div class="diplo-row">
        <i class="swatch" style="background:rgb(${n.def.color.r},${n.def.color.g},${n.def.color.b})"></i>
        <span class="nm">${escapeHtml(nationName(n))} ${adjacent ? "" : "⛵"}<br><small style="color:var(--muted)">${fmt(n.army)} ${t("جندي")} • ${relTxt}</small></span>
        <span class="actions">
          ${rel === "war" ? `<button data-cease="${n.id}">هدنة</button>` : ""}
          ${rel !== "war" && rel !== "ally" ? `<button data-alliance="${n.id}">تحالف</button>` : ""}
          ${rel !== "war" ? `<button data-dow="${n.id}">حرب</button>` : `<button data-call="${n.id}" title=t("ادعُ حلفاءك للانضمام")>⚔ ادعُ الحلفاء</button>`}
          <button data-gift="${n.id}">هدية</button>
        </span>
      </div>`;
    })
    .join("");
  const search = document.createElement("input");
  search.className = "search";
  search.placeholder = t("ابحث عن دولة…");
  search.value = q;
  search.style.marginBottom = "8px";
  search.oninput = () => {
    app.diploQuery = search.value;
    renderDiplo();
    const again = $("#diplo-list .search");
    if (again) {
      again.focus();
      again.setSelectionRange(again.value.length, again.value.length);
    }
  };
  list.prepend(search);
  list.querySelectorAll("[data-cease]").forEach((b) => (b.onclick = () => doDiplo("ceasefire", +b.dataset.cease)));
  list.querySelectorAll("[data-alliance]").forEach((b) => (b.onclick = () => doDiplo("alliance", +b.dataset.alliance)));
  list.querySelectorAll("[data-gift]").forEach((b) => (b.onclick = () => doDiplo("gift", +b.dataset.gift)));
  list.querySelectorAll("[data-call]").forEach((b) => (b.onclick = () => {
    const n = game.byId[+b.dataset.call];
    if (netAct("callallies", { target: n.id })) {
      setTimeout(renderDiplo, 400);
      return;
    }
    const err = game.callAllies(n);
    toast(err || `حلفاؤك انضموا إلى الحرب ضد ${n.ar}`, err ? "bad" : "good");
    renderDiplo();
  }));
  list.querySelectorAll("[data-dow]").forEach((b) => (b.onclick = () => {
    const n = game.byId[+b.dataset.dow];
    if (netAct("declaw", { target: n.id })) {
      setTimeout(renderDiplo, 300);
      return;
    }
    game.declareWar(p, n);
    renderDiplo();
  }));
}

function doDiplo(type, id) {
  const game = app.game;
  const p = game.player();
  if (netAct("offer", { kind: type, target: id })) {
    setTimeout(renderDiplo, 350);
    return;
  }
  const err = game.propose({ type, from: p.id, to: id });
  toast(err || (type === "ceasefire" ? t("تم إرسال عرض الهدنة") : type === "gift" ? t("أُرسلت الهدية") : t("تم إرسال عرض التحالف")), err ? "bad" : "good");
  renderDiplo();
}

function renderMedals() {
  const grid = $("#medal-grid");
  if (!grid) return;
  grid.innerHTML = MEDALS.map((m) => {
    const on = profile.medals.includes(m.id);
    return `<div class="medal ${on ? "on" : ""}"><div class="mi">${on ? "🏅" : "🔒"}</div><b>${m.ar}</b><small>${m.hintAr}</small></div>`;
  }).join("");
}

// A player who lost their nation while the match is still going.
function showOnlineOut(state) {
  const rows = (state.seats || [])
    .slice()
    .sort((a, b) => b.cells - a.cells)
    .map((r) => {
      const me = r.seat === net.seat;
      return `<div class="row ${me ? "won" : ""}">
        <span>${escapeHtml(r.name)}${me ? " (you)" : ""} — ${escapeHtml(tBack(r.nation) || "—")}</span>
        <b>${r.alive === false ? t("خرج") : (r.cells / Math.max(1, app.game.totalCells) * 100).toFixed(1) + "%"}</b></div>`;
    })
    .join("");
  $("#end-title").textContent = t("💀 خرجت من المباراة");
  $("#end-title").className = "lose";
  $("#end-sub").textContent = t("سقطت دولتك — يمكنك متابعة الآخرين أو انتظار مباراة جديدة.");
  $("#end-stats").innerHTML = "";
  const box = $("#end-online");
  box.hidden = false;
  box.innerHTML = rows + `<div class="rematch-row"><button class="btn ghost" id="btn-leave-match">الخروج من الغرفة</button></div>`;
  $("#btn-leave-match").onclick = () => {
    net.leave();
    mirrorPromise = null;
    app.netMirror = null;
    app.game = null;
    closeModals();
    $("#chat-dock").hidden = true;
    $("#btn-surrender").hidden = true;
    show("menu");
    buildMenu();
  };
  $("#modal-end").hidden = false;
  sfx.lose();
}

function showOnlineEnd(payload) {
  const me = (payload.results || []).find((r) => r.seat === net.seat);
  const won = !!(me && me.won);
  $("#end-title").textContent = won ? t("🏆 فزت بالمباراة!") : t("💀 خسرت المباراة");
  $("#end-title").className = won ? "win" : "lose";
  $("#end-sub").textContent = won
    ? t("سيطرت على الأرض قبل الجميع.")
    : payload.reason === "ai"
      ? `${payload.by || t("دولة") } سيطرت على الأرض أولًا — جرّب مرة أخرى.`
      : me && me.surrendered
        ? t("استسلمت — يمكنك الانتقام في مباراة جديدة.")
        : `وصلت إلى ${((me ? me.share : 0) * 100).toFixed(1)}% من الأرض. حاول مرة أخرى!`;
  const rows = (payload.results || [])
    .sort((a, b) => (b.won ? 1 : 0) - (a.won ? 1 : 0) || b.share - a.share)
    .map(
      (r) => `<div class="row ${r.won ? "won" : ""}">
        <span>${r.won ? "🏆 " : ""}${escapeHtml(r.name)} — ${escapeHtml(tBack(r.nation))}</span>
        <b>${(r.share * 100).toFixed(1)}%${r.surrendered ? " · استسلم" : ""}</b></div>`
    )
    .join("");
  const box = $("#end-online");
  box.hidden = false;
  box.innerHTML =
    rows +
    `<div class="rematch-row"><button class="btn gold" id="btn-rematch">مباراة جديدة</button>
      <button class="btn ghost" id="btn-leave-match">الخروج من الغرفة</button></div>`;
  $("#btn-rematch").onclick = () => {
    net.send({ t: "rematch" });
    toast("بانتظار المضيف لبدء مباراة جديدة…");
    closeModals();
  };
  $("#btn-leave-match").onclick = () => {
    net.leave();
    mirrorPromise = null;
    app.netMirror = null;
    app.game = null;
    closeModals();
    $("#chat-dock").hidden = true;
    $("#btn-surrender").hidden = true;
    show("menu");
    buildMenu();
  };
  $("#end-stats").innerHTML = "";
  $("#modal-end").hidden = false;
  if (won) sfx.win();
  else sfx.lose();
}

function showEnd(summary) {
  $("#end-title").textContent = summary.result === "win" ? t("🏆 النصر!") : t("💀 الهزيمة");
  $("#end-title").className = summary.result === "win" ? "win" : "lose";
  $("#end-sub").textContent =
    summary.result === "win"
      ? `سيطرت على ${pct(summary.share)} من الأرض في ${Math.round(summary.time / 60)} دقيقة.`
      : `وصلت إلى ${pct(summary.share)} من الأرض. حاول مرة أخرى!`;
  $("#end-online").hidden = true;
  $("#end-stats").innerHTML = `
    <div class="stat"><b>${arNum(summary.conquered)}</b><small>دول محتلة</small></div>
    <div class="stat"><b>${arNum(Math.round(summary.time / 60))} د</b><small>مدة الحملة</small></div>
    <div class="stat"><b>${arNum(summary.built)}</b><small>مبانٍ</small></div>
    <div class="stat"><b>${arNum(summary.xp)}</b><small>XP</small></div>`;
  $("#modal-end").hidden = false;
  // The match is over, so this is a real play break and a natural place for a
  // midgame ad: the player is reading results, not in the middle of a fight.
  // The portal enforces its own frequency cap and simply ignores a request
  // that comes too soon, so we never gate this on a timer of our own.
  gameplayStop();
  requestMidgameAd();
  if (summary.result === "win") happytime();
  reportProgress(Math.min(100, Math.round((summary.share || 0) * 100)));
  profile.games++;
  if (summary.result === "win") sfx.win();
  else sfx.lose();
  if (summary.result === "win") {
    profile.best = Math.max(profile.best, summary.share);
    if (app.mode === "daily" && app.daily) {
      const key = app.daily.dateKey;
      if (profile.lastDaily !== key) {
        profile.streak = (profile.streak || 0) + 1;
        profile.lastDaily = key;
      }
    }
  }
  saveProfileMedals([...app.game.medals]);
  store.set(PROFIL_KEY, profile);
  updateHud();
}

function toast(text, kind) {
  const el = document.createElement("div");
  el.className = "toast " + (kind || "");
  el.textContent = text;
  $("#toasts").appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transition = "opacity .3s";
  }, 1900);
  setTimeout(() => el.remove(), 2300);
}

// ---------------------------------------------------------------- boot ---

function howTo() {
  $("#howto-body").innerHTML = `
    <h4>الفكرة</h4>
    <p>تبدأ بدولة حقيقية بحدودها الحقيقية. الهدف: السيطرة على نسبة من الأرض قبل أن تقوم دول أخرى بذلك.</p>
    <h4>البداية</h4>
    <ul>
      <li>أول 25 ثانية هدنة: ابنِ مدنًا ومصانع قبل أن تبدأ الحرب.</li>
      <li>المدينة ترفع سقف جيشك وذهبك. المصنع يزيد ذهبك. القاعدة تسرّع التجنيد.</li>
    </ul>
    <h4>الهجوم</h4>
    <ul>
      <li>اضغط على دولة مجاورة مرة لتحديدها، ومرتين لبدء الهجوم (أو زر الهجوم).</li>
      <li>شريط «قوة الهجوم» يحدد كم من جيشك يشارك في كل هجوم.</li>
      <li>جيشك يتجدد أسرع عندما يكون أقل من السقف — لا ترمِ كل شيء دفعة واحدة.</li>
      <li>كل هجوم يفتح جبهة على طول الحدود المشتركة. إذا كانت قوتك أقل بكثير تتوقف الجبهة.</li>
      <li><code>انسحاب</code> يوقف الهجوم لكنك تخسر 25% من القوة المشاركة.</li>
    </ul>
    <h4>الأسطول والغزو البحري</h4>
    <ul>
      <li>ابنِ ميناء (مفتاح <code>4</code>) ثم اضغط أي دولة ساحلية لا تجاورك.</li>
    </ul>
    <h4>الدبلوماسية</h4>
    <ul>
      <li>يمين الفأرة (أو ضغطة طويلة على الجوال) على أي دولة يفتح قائمة الدبلوماسية: هدنة، تحالف، هدية.</li>
      <li>خيانة التحالف تجعل الجميع يكرهك.</li>
    </ul>
    <h4>الضربات</h4>
    <ul>
      <li>منصة صواريخ تفتح صاروخ كروز (يضرب أي مكان ويحوّل الأرض إلى خرائب).</li>
      <li>الخرائب لا يمكن للجيوش عبورها — أعد استعادتها بسرعة قبل العدو.</li>
      <li>الدفاع الجوي يعترض الصواريخ القريبة.</li>
    </ul>
    <h4>لوحة المفاتيح</h4>
    <ul>
      <li><code>1..8</code> اختيار مبنى • <code>Shift</code> ${t("وضع متعدد")} • <code>R</code> البحث • <code>Q/E</code> قوة الهجوم</li>
      <li><code>Space</code> إيقاف مؤقت • <code>WASD</code> تحريك • <code>F</code> العاصمة • <code>M</code> تحويل الجيش لذهب</li>
    </ul>
    <h4>الجوال</h4>
    <ul>
      <li>اضغط دولة لفتح قائمتها، ضغطة مزدوجة للهجوم، سحب للتحريك، قرص للتكبير.</li>
    </ul>`;
}

async function boot() {
  // The SDK loads in the background and is deliberately NOT awaited: it lives
  // on a CDN, and a slow or blocked request must never delay the first paint.
  // Everything it controls (mute, chat, locale) is applied when it lands, and
  // on a plain file:// page or offline it simply never lands.
  const platformReady = initCrazyGames().then(() => {
    // The portal knows the player's language from their account/region, but it
    // must never override a choice made in this game's Settings.
    if (!hasSavedLanguage() && isPortal()) {
      setLang(preferredLanguage());
      translateDom(document);
    }
    loadingStop();
    applyAudioSetting();
    applyChatSetting();
  });

  // Language first: the saved choice decides dir/lang on <html> before any
  // screen is painted, so the first frame is already in the right language.
  loadLang();
  translateDom(document);
  watchDom(document.body); // keeps lists, HUD and toasts translated while playing
  // The map data is loaded dynamically so the same World class can run on the
  // Node server for online matches (see js/online.js + server.js).
  await initWorld();
  // The map bundle carries both spellings of every country, so the translator
  // can render a bare Arabic nametag as English without a dictionary of 236
  // entries. Registered before the first screen is built.
  try {
    const ref = new World("world", "modern");
    registerNationNames(ref.countries.filter(Boolean).map((c) => [c.ar, c.name]));
  } catch (err) {
    console.warn("nation name table unavailable", err);
  }
  buildMenu();
  renderMedals();
  void platformReady;
  $("#btn-quick").onclick = () => {
    sfx.resume();
    sfx.click();
    quickStart();
  };
  $("#btn-play").onclick = () => {
    sfx.resume();
    sfx.click();
    startFlow();
  };
  $("#btn-howto").onclick = () => ($("#modal-howto").hidden = false);
  $("#btn-medals").onclick = () => ($("#modal-medals").hidden = false);
  $("#btn-continue").onclick = () => {
    const save = store.get(STORE_KEY, null);
    if (!save) return;
    try {
      const world = new World(save.preset || "world", save.era);
      world.owner = new Int16Array(world.size).fill(-1);
      const game = Game.restore(save, world);
      app.mode = save.mode;
      bootGame(game);
    } catch (err) {
      console.error(err);
      toast(t("تعذر تحميل الحفظ"), "bad");
    }
  };
  $("#btn-back-menu").onclick = () => {
    closeModals();
    show("menu");
    buildMenu();
  };
  $("#country-search").oninput = () => buildCountryList();
  $("#btn-random").onclick = randomCountry;
  $("#btn-research").onclick = () => {
    $("#modal-research").hidden = false;
    updateResearch();
  };
  $("#btn-diplo").onclick = () => openDiplo(null);
  $("#btn-menu").onclick = () => ($("#modal-menu").hidden = false);
  // Secondary HUD actions live behind a "more" button on narrow screens so the
  // top bar stops overflowing on phones. On desktop CSS keeps them inline.
  const moreBtn = $("#btn-more");
  const moreBox = $("#hud-more");
  if (moreBtn && moreBox) {
    const setMore = (open) => {
      moreBox.hidden = !open;
      moreBtn.setAttribute("aria-expanded", String(open));
      moreBtn.classList.toggle("on", open);
    };
    moreBtn.onclick = (e) => {
      e.stopPropagation();
      setMore(moreBox.hidden);
    };
    document.addEventListener("click", (e) => {
      if (!moreBox.hidden && !moreBox.contains(e.target) && e.target !== moreBtn) setMore(false);
    });
    // Anything inside closes the popover after use.
    moreBox.querySelectorAll("button").forEach((b) =>
      b.addEventListener("click", () => setMore(false))
    );
  }
  // ---------------------------------------------------------------- online
  $("#btn-online-back").onclick = () => {
    net.leave();
    mirrorPromise = null;
    app.game = null;
    show("menu");
    buildMenu();
  };
  $("#btn-create-room").onclick = async () => {
    const name = onlineName();
    const ok = await net.connect(name);
    if (!ok) return setOnlineStatus(t("تعذر الاتصال بالخادم"), "bad");
    net.createRoom({
      map: $("#online-map").value,
      mode: $("#online-mode").value,
      goal: parseFloat($("#online-goal").value),
      aiLevel: $("#online-ai").value,
    });
  };
  // ---- public worlds: no codes to type ----
  const renderRoomList = (list) => {
    const box = $("#room-list");
    if (!box) return;
    if (!list || !list.length) {
      box.innerHTML = `<div class="room-empty">لا توجد عوالم مفتوحة الآن — اضغط «العب الآن» لتفتح عالمًا</div>`;
      return;
    }
    const modeAr = { normal: t("كل لاعب لنفسه"), coop: t("تحالف"), ffa: t("آخر صامد") };
    box.innerHTML = list
      .map(
        (r) => `<button class="room-row" data-join="${r.code}">
          <b class="room-code-sm">${r.code}</b>
          <span class="room-meta">${r.players}/${r.max} لاعبين · ${modeAr[r.mode] || r.mode} · ${Math.round(r.goal * 100)}%</span>
          <span class="room-host">${r.host}</span>
          <span class="room-go">انضم ›</span>
        </button>`
      )
      .join("");
    box.querySelectorAll("[data-join]").forEach((b) => {
      b.onclick = async () => {
        const ok = await net.connect(onlineName());
        if (!ok) return setOnlineStatus(t("تعذر الاتصال بالخادم"), "bad");
        net.joinRoom(b.dataset.join);
      };
    });
  };

  const refreshRooms = async () => {
    const ok = await net.connect(onlineName());
    if (!ok) {
      renderRoomList([]);
      setOnlineStatus(
        net.remote
          ? t("خادم الأونلاين لا يستجيب الآن — أعد المحاولة بعد قليل")
          : t("الخادم غير متاح — الأونلاين يحتاج تشغيل node server.js"),
        "bad"
      );
      return false;
    }
    net.listRooms();
    return true;
  };

  if ($("#btn-refresh-rooms")) $("#btn-refresh-rooms").onclick = () => refreshRooms();
  if ($("#btn-quick-play"))
    $("#btn-quick-play").onclick = async () => {
      const ok = await net.connect(onlineName());
      if (!ok) {
        return setOnlineStatus(
          net.remote ? t("خادم الأونلاين لا يستجيب الآن — أعد المحاولة بعد قليل") : t("تعذر الاتصال بالخادم"),
          "bad"
        );
      }
      const btn = $("#btn-quick-play");
      if (btn) {
        btn.disabled = true;
        btn.textContent = t("…جارٍ البحث");
      }
      net.quickJoin({
        map: $("#online-map") ? $("#online-map").value : "world",
        mode: $("#online-mode") ? $("#online-mode").value : "normal",
        goal: $("#online-goal") ? parseFloat($("#online-goal").value) : 0.5,
        aiLevel: $("#online-ai") ? $("#online-ai").value : "normal",
      });
    };
  net.on("searching", (on) => {
    const btn = $("#btn-quick-play");
    if (!btn) return;
    btn.disabled = !!on;
    btn.textContent = on ? t("…جارٍ البحث") : t("⚡ العب الآن");
  });
  net.on("roomlist", renderRoomList);
  net.on("hello", () => net.listRooms());

  // A friend accepted an invite while this player is already in a match: the
  // portal calls this listener, and we drop them into that room without a
  // reload. The current match is abandoned deliberately — the invite is the
  // newer intent.
  onJoinRoom((params) => {
    const code = params.room || params.roomId || params.roomName;
    if (!code) return;
    toast(t("انضممت إلى غرفة صديق"), "good");
    if (app.game) {
      app.game = null;
      app.netMirror = null;
    }
    app.mode = "online";
    openOnlineHome().then(() => net.joinRoom(String(code).toUpperCase()));
  });

  $("#btn-join-room").onclick = async () => {
    const name = onlineName();
    const code = ($("#online-code").value || "").trim().toUpperCase();
    if (code.length < 3) return setOnlineStatus(t("اكتب كود الغرفة"), "bad");
    const ok = await net.connect(name);
    if (!ok) return setOnlineStatus(t("تعذر الاتصال بالخادم"), "bad");
    net.joinRoom(code);
  };
  $("#online-code").addEventListener("keydown", (e) => {
    if (e.key === "Enter") $("#btn-join-room").click();
  });
  $("#btn-leave-room").onclick = () => {
    net.leave();
    mirrorPromise = null;
    online.lobby = null;
    $("#online-home").hidden = false;
    $("#online-lobby").hidden = true;
    setOnlineStatus(`متصل بالخادم • ${net.name}`, "ok");
  };
  $("#btn-ready").onclick = () => {
    online.ready = !online.ready;
    net.ready(online.ready);
  };
  $("#btn-start-online").onclick = () => net.start();
  const sendChat = (input, viaLobby) => {
    // The portal can switch chat off for an account (younger players, parental
    // settings). When it does, the inputs stay hidden and this is a no-op.
    if (getSettings().disableChat) {
      input.value = "";
      return;
    }
    const text = (input.value || "").trim();
    if (!text) return;
    const clean = censor(text);
    if (!clean) {
      input.value = "";
      return;
    }
    net.chat(clean);
    input.value = "";
    void viaLobby;
  };
  applyChatSetting();
  onSettingsChange(applyChatSetting);
  $("#chat-send").onclick = () => sendChat($("#chat-input"), true);
  $("#chat-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendChat($("#chat-input"), true);
  });
  $("#dock-send").onclick = () => sendChat($("#dock-input"), false);
  $("#dock-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendChat($("#dock-input"), false);
  });
  $("#dock-chat-toggle").onclick = () => {
    online.chatOpen = !online.chatOpen;
    $("#chat-dock").classList.toggle("collapsed", !online.chatOpen);
  };

  // ------------------------------------------------------------ net events
  net.on("status", (st) => {
    const label = st === "online" ? t("متصل بالخادم") : st === "connecting" ? t("جاري الاتصال…") : t("غير متصل");
    setOnlineStatus(label, st === "online" ? "ok" : st === "offline" ? "bad" : "");
    const dot = $("#dock-ping");
    if (dot) dot.textContent = st === "online" ? "●" : "○";
  });
  net.on("error", (text) => {
    // net.js speaks Arabic because it is shared with the server-side client;
    // translate once here rather than at each of its dozen throw sites.
    const msg = t(text);
    toast(msg, "bad");
    setOnlineStatus(msg, "bad");
  });
  net.on("lobby", (view) => renderLobby(view));
  net.on("state", (state) => {
    applyNetState(state).catch((err) => console.error(err));
  });
  net.on("chat", (msg) => {
    const entry = { seat: msg.seat, name: msg.name, text: msg.text, t: msg.t };
    if (!online.lobby) return;
    online.lobby.chat = [...(online.lobby.chat || []), entry].slice(-60);
    renderChatLog($("#lobby-chat"), online.lobby.chat);
    renderChatLog($("#dock-log"), online.lobby.chat);
  });
  net.on("notice", (msg) => toast(msg.text, msg.bad ? "bad" : msg.soft ? "good" : ""));
  net.on("end", (payload) => showOnlineEnd(payload));
  net.on("left", () => {
    $("#online-home").hidden = false;
    $("#online-lobby").hidden = true;
  });
  net.on("disconnected", () => {
    setOnlineStatus(t("انقطع الاتصال — جارٍ استعادة المباراة"), "bad");
    if (app.screen === "game") toast(t("انقطع الاتصال — جارٍ إعادة الاتصال"), "bad");
  });
  net.on("reconnecting", ({ attempt }) => {
    setOnlineStatus(`جارٍ إعادة الاتصال… (محاولة ${attempt})`, "bad");
  });
  net.on("reconnected", ({ room }) => {
    setOnlineStatus(room ? `عاد الاتصال — عالم ${room}` : t("عاد الاتصال"), "ok");
    toast(room ? t("عاد الاتصال بمباراتك") : t("عاد الاتصال"), "good");
  });
  setInterval(() => {
    if (net.status === "online") {
      net.ping();
      const el = $("#dock-ping");
      if (el) el.textContent = net.latency ? `${net.latency}ms` : "●";
    }
  }, 3000);

  // Yes/no questions go through the in-game modal: a native confirm() can be
  // blocked inside the portal's iframe and renders browser chrome the game
  // cannot style or translate.
  function askConfirm(text, onYes) {
    const modal = $("#modal-confirm");
    if (!modal) return;
    $("#confirm-text").textContent = text;
    modal.hidden = false;
    $("#btn-confirm-yes").onclick = () => {
      modal.hidden = true;
      onYes();
    };
  }

  const btnPriv = $("#btn-privacy");
  if (btnPriv) btnPriv.onclick = () => ($("#modal-privacy").hidden = false);

  const btnSurr = $("#btn-surrender");
  if (btnSurr) {
    btnSurr.onclick = () => {
      if (!net.room) return;
      askConfirm(t("هل تريد الاستسلام؟ ستخرج من المباراة."), () => net.act("surrender"));
    };
  }

  // Fullscreen is banned in-game on CrazyGames: the portal owns the fullscreen
  // button and a second one fights it. Off-portal (double-clicked file, own
  // host) the button is still genuinely useful, so it stays but only there.
  const btnFs = $("#btn-fs");
  if (btnFs) {
    if (isPortal()) {
      btnFs.hidden = true;
      btnFs.onclick = null;
    } else {
      btnFs.onclick = () => {
        const el = document.documentElement;
        if (!document.fullscreenElement) {
          (el.requestFullscreen ? el.requestFullscreen() : Promise.resolve()).catch(() => {});
        } else if (document.exitFullscreen) {
          document.exitFullscreen().catch(() => {});
        }
      };
    }
  }
  $("#btn-speed").onclick = () => {
    if (!app.paused && app.speed === 1) cycleSpeed(1);
    else if (!app.paused && app.speed > 1) togglePause();
    else {
      app.paused = false;
      app.speed = 1;
      syncSpeedButtons();
    }
  };
  $("#btn-resume").onclick = () => ($("#modal-menu").hidden = true);
  $("#btn-save").onclick = () => {
    try {
      const data = app.game.serialize();
      data.savedAt = Date.now();
      store.set(STORE_KEY, data);
      toast(t("تم حفظ اللعبة"), "good");
    } catch (e) {
      toast(t("فشل الحفظ"), "bad");
    }
  };
  $("#btn-settings").onclick = () => {
    const el = $("#settings");
    el.hidden = !el.hidden;
  };
  $("#btn-abandon").onclick = () => {
    closeModals();
    if (app.game && app.game.remote) {
      net.leave();
      mirrorPromise = null;
      app.netMirror = null;
      $("#chat-dock").hidden = true;
      $("#btn-surrender").hidden = true;
    }
    app.game = null;
    show("menu");
    buildMenu();
  };
  $("#btn-again").onclick = () => {
    closeModals();
    app.pickWorld = new World("world", app.era);
    app.pickRenderer.world = app.pickWorld;
    show("menu");
    buildMenu();
  };
  $("#btn-to-menu").onclick = () => {
    closeModals();
    if (app.game && app.game.remote) {
      net.leave();
      mirrorPromise = null;
      app.netMirror = null;
      $("#chat-dock").hidden = true;
      $("#btn-surrender").hidden = true;
    }
    app.game = null;
    show("menu");
    buildMenu();
  };
  $("#set-lang").value = getLang();
  $("#set-lang").onchange = (e) => {
    // A full re-render is the honest way to switch languages: it re-runs every
    // label, list and card in the new one instead of leaving half the UI in the
    // old language. Reloading keeps the match (it is saved/the server owns it).
    setLang(e.target.value);
    translateDom(document);
    location.reload();
  };
  $("#set-sound").checked = profile.settings.sound !== false;
  $("#set-labels").checked = profile.settings.labels !== false;
  $("#set-speed").value = String(profile.settings.speed || 1);
  $("#set-drag").checked = profile.settings.drag !== false;
  $("#set-sound").onchange = (e) => {
    profile.settings.sound = e.target.checked;
    applyAudioSetting();
    sfx.enabled = e.target.checked;
    if (e.target.checked) {
      sfx.resume();
      sfx.upgrade();
    }
    saveSettings();
  };
  $("#set-labels").onchange = (e) => {
    profile.settings.labels = e.target.checked;
    if (app.renderer) {
      app.renderer.labels = e.target.checked;
      app.renderer.baseKey = "";
      app.renderer.renderBase(true);
    }
    saveSettings();
  };
  $("#set-speed").onchange = (e) => {
    app.speed = parseFloat(e.target.value) || 1;
    profile.settings.speed = app.speed;
    saveSettings();
    syncSpeedButtons();
  };
  $("#set-drag").onchange = (e) => {
    profile.settings.drag = e.target.checked;
    saveSettings();
  };
  $("#tabs").onclick = (e) => {
    const tab = e.target.closest(".tab");
    if (!tab) return;
    app.tab = tab.dataset.tab;
    updateTab();
  };
  $("#force-slider").oninput = (e) => setForce(e.target.value / 100);
  $("#force-up").onclick = () => setForce(app.game.attackFraction + 0.1);
  $("#force-down").onclick = () => setForce(app.game.attackFraction - 0.1);

  // ---- floating touch controls (phones/tablets, also handy with a mouse) ----
  const zoomStep = (factor) => {
    const R = app.renderer;
    if (!R || !app.game) return;
    R.zoomAt(R.viewW / 2, R.viewH / 2, factor);
    R.renderBase();
    R.render();
  };
  const tZoomIn = $("#zoom-in");
  const tZoomOut = $("#zoom-out");
  if (tZoomIn) tZoomIn.onclick = () => zoomStep(1.35);
  if (tZoomOut) tZoomOut.onclick = () => zoomStep(0.74);
  // Long-press friendly: fire repeatedly while held.
  for (const [btn, factor] of [[tZoomIn, 1.35], [tZoomOut, 0.74]]) {
    if (!btn) continue;
    let hold = null;
    btn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      hold = setTimeout(() => {
        hold = setInterval(() => zoomStep(factor), 110);
      }, 380);
    });
    const stop = () => { clearTimeout(hold); clearInterval(hold); hold = null; };
    btn.addEventListener("pointerup", stop);
    btn.addEventListener("pointerleave", stop);
    btn.addEventListener("pointercancel", stop);
  }
  const tHome = $("#touch-home");
  if (tHome) tHome.onclick = () => centerOnCapital();
  const tAttack = $("#touch-attack");
  if (tAttack) tAttack.onclick = () => openAttackSheet();
  $$(".modal").forEach((m) => {
    m.addEventListener("pointerdown", (e) => {
      if (e.target === m) m.hidden = true;
    });
    m.querySelectorAll("[data-close]").forEach((b) => (b.onclick = () => (m.hidden = true)));
  });
  window.addEventListener("resize", () => {
    if (app.renderer && app.screen === "game") {
      app.renderer.resize();
      app.renderer.baseKey = "";
      app.renderer.renderBase(true);
    }
    if (app.pickRenderer) {
      app.pickRenderer.resize();
      fitPick();
    }
  });
  syncSpeedButtons();
  if (!app.pickWorld) {
    app.pickWorld = new World("world", app.era);
    app.pickRenderer = new Renderer($("#pick-canvas"), app.pickWorld, pickStubGame(app.pickWorld));
    attachPickInput();
  }
  requestAnimationFrame(() => show("menu"));
}

// Bracket the load for the portal's measurement: loadingStart must come before
// the first real work, loadingStop once the menu is interactive (inside boot).
loadingStart();
boot();

export { app, fmt, toast, online, net };
