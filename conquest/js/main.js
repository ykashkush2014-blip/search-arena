// CONQUEST — Arabic-first pixel world-conquest strategy game.
// Wires the menus, the map picker, the in-game HUD and input handling to the
// simulation in state.js and the canvas renderer in render.js.
import { World, PRESETS, countryColor } from "./world.js";
import { Game } from "./state.js";
import { Renderer } from "./render.js";
import {
  AI_LEVELS, BALANCE, BUILDINGS, BUILDING_BY_KEY, ERAS, MEDALS, MODES,
  RANKS, RESEARCH,
} from "./data.js";
import { CAMPAIGNS, dailyChallenge } from "./campaigns.js";
import { Rng } from "./rng.js";
import { sfx } from "./audio.js";

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

const ARABIC = "٠١٢٣٤٥٦٧٨٩";
const arNum = (n) => String(n).replace(/\d/g, (d) => ARABIC[+d]);

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
      ar: "فتح العالم",
      ico: "🌍",
      desc: "اختر أي دولة من 236 دولة على خريطة العالم وابدأ من حدودها الحقيقية.",
    },
    {
      id: "history",
      ar: "الحملات التاريخية",
      ico: "📜",
      desc: "7 حملات: الإسكندر، روما، جنكيز خان، القسطنطينية، العالم الجديد، بريطانيا، نابليون.",
    },
    {
      id: "daily",
      ar: "التحدي اليومي",
      ico: "⭐",
      desc: "دولة واحدة للجميع كل يوم، ومعها تعديل خاص. الفوز يبني سلسلتك.",
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
    cont.querySelector("small").textContent = p ? `${p.ar} • ${new Date(save.savedAt).toLocaleString("ar")}` : "";
  }
}

function startFlow() {
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

// --------------------------------------------------------- country select ---

function openCountrySelect(daily) {
  if (!app.pickWorld) {
    app.pickWorld = new World("world", app.era);
    app.pickRenderer = new Renderer($("#pick-canvas"), app.pickWorld, pickStubGame(app.pickWorld));
    attachPickInput();
  }
  $("#select-title").textContent = daily ? "تحدي اليوم" : app.mode === "history" ? "الحملة" : "اختر دولتك";
  $("#select-sub").textContent = daily
    ? `${app.daily.ar} — ${app.daily.arBlurb}`
    : "كل دولة لها حدودها الحقيقية وصعوبتها الخاصة";
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
  const goalLabels = { 0.3: "الهدف: 30% — حملة سريعة", 0.5: "الهدف: 50% — فتح العالم", 0.75: "الهدف: 75% — سيطرة كاملة" };
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
    .filter((c) => !q || c.ar.includes(q) || c.name.toLowerCase().includes(q.toLowerCase()) || (c.iso || "").includes(q.toUpperCase()))
    .sort((a, b) => b.cells - a.cells);
  list.innerHTML = items
    .map((c) => {
      const col = c.color;
      return `<button class="list-item ${app.selectedId === c.id ? "active" : ""}" data-id="${c.id}">
        <i class="swatch" style="background:rgb(${col.r},${col.g},${col.b})"></i>
        <span class="nm">${c.ar}</span>
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
      <div><h3>${c.ar}</h3><small>${c.name} • ${c.iso || "—"}</small></div>
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
      neigh.length ? neigh.map((n) => `<span class="chip">${n.ar}</span>`).join("") : '<span class="chip">جزيرة — لا حدود برية</span>'
    }</div>
    ${sea.length ? `<div class="neigh-list">${sea.map((n) => `<span class="chip">⛵ ${n.ar}</span>`).join("")}</div>` : ""}
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
  $("#select-title").textContent = "الحملات التاريخية";
  $("#select-sub").textContent = "اختر حملة وابدأ من حدودها التاريخية";
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
    <h3 style="margin:0 0 4px">${camp.ar}</h3>
    <small style="color:var(--muted)">${camp.en} • ${camp.year} • ${ERAS[camp.era].ar}</small>
    <p style="font-size:12.5px;line-height:1.7;color:var(--muted)">${camp.arBlurb}</p>
    <div class="stat-grid">
      <div class="stat"><b>${arNum(camp.include.length)}</b><small>دولة تبدأ معك</small></div>
      <div class="stat"><b>${camp.goal * 100}%</b><small>هدف الأرض</small></div>
    </div>
    <div class="card-actions">
      <button class="btn gold" id="btn-start-campaign">ابدأ ${camp.ar}</button>
      <button class="btn ghost" id="btn-camp-back">→ كل الحملات</button>
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
    toast("هذه الحملة تحتاج خرائط أخرى");
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

function bootGame(game, prebuiltWorld) {
  if (prebuiltWorld) {
    app.pickWorld = prebuiltWorld;
    if (app.pickRenderer) app.pickRenderer.world = prebuiltWorld;
  }
  app.game = game;
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
  sfx.enabled = profile.settings.sound !== false;
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
  game.onEnd = (summary) => showEnd(summary);
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
    if (game.mode === "daily") toast(`${game.daily?.ar || "تحدي اليوم"}: ${app.daily?.arBlurb || ""}`);
    if (game.ceasefireLeft > 0) toast("الهدنة سارية — ابنِ قبل أن تبدأ الحرب");
  });
  if (!app.raf) loop();
  store.del(STORE_KEY);
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
      toast("لا يوجد مبنى هنا — استخدم Shift مع مبنى للترقية");
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
        toast("حليفك — لا يمكن مهاجمته", "bad");
        return;
      }
      const lastSel = app.lastAttackSel;
      if (lastSel === owner && performance.now() - (app.lastAttackAt || 0) < 2500) {
        orderAttack(owner);
      } else {
        app.lastAttackSel = owner;
        app.lastAttackAt = performance.now();
        toast(`اضغط مرة أخرى لبدء الهجوم على ${n.ar}`);
      }
    } else if (game.hasPort(p)) {
      const err = game.launchAttack(p, n, game.attackFraction);
      if (err) toast(err, "bad");
      else toast(`غزو بحري على ${n.ar}!`, "good");
    } else {
      toast("ليست على حدودك — تحتاج ميناء لغزو بحري");
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

function orderAttack(id) {
  const game = app.game;
  const p = game.player();
  const target = game.byId[id];
  if (!target) return;
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
  if (!app.game || app.game.result) return;
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
  if (!app.paused) {
    app.game.update(dt);
    // adaptive simulation speed so weak devices stay above ~30fps
    app.frameMs = app.frameMs * 0.92 + dt * 1000 * 0.08;
    if (app.frameMs > 42) app.game.speed = Math.min(app.speed, 0.65);
    else if (app.frameMs < 26 && app.game.speed < app.speed) app.game.speed = Math.min(app.speed, app.game.speed + 0.02);
  }
  if (app.game.explosions.length) {
    const big = app.game.explosions.some((e) => e.kind === "nuke");
    if (big) sfx.nuke();
    else sfx.boom();
  }
  if (app.game.time - autosaveAt > 45) {
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
  const p = game?.player();
  if (!p) return;
  const rate = game.resourceRate(p);
  setRes("#res-gold", p.gold, "+" + fmt(rate.gold) + "/ث");
  setRes("#res-army", p.army, pct(p.army / Math.max(1, p.cap)));
  setRes("#res-research", p.research, "+" + rate.research.toFixed(1) + "/ث");
  $("#nation-name").textContent = p.ar;
  $("#rank-name").textContent = game.rankName(p) + (game.xpTotal > 1 ? ` • ${Math.round(game.xpTotal)} XP` : "");
  const col = p.def.color;
  const flag = $("#flag");
  flag.style.background = `rgb(${col.r},${col.g},${col.b})`;
  flag.textContent = (p.def.iso || "؟").slice(0, 2);
  const share = game.playerShare();
  $("#goal-pct").textContent = pct(share);
  $("#goal-bar").style.width = clamp((share / game.goal) * 100, 0, 100) + "%";
  $("#goal-label").textContent = `الهدف: ${game.goal * 100}% من الأرض`;
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
    <div class="oe tip"><span>💡</span><b style="font-weight:500;color:var(--muted);text-align:left">${currentTip()}</b></div>`;
  const cez = game.ceasefireLeft;
  const badge = $("#ceasefire-badge");
  if (cez > 0) {
    badge.textContent = "هدنة " + Math.ceil(cez) + "ث";
    badge.style.display = "";
    badge.style.background = "rgba(142,217,138,0.16)";
    badge.style.color = "var(--green)";
  } else if (game.openedAt) {
    badge.textContent = "الحرب!";
    badge.style.background = "rgba(255,125,116,0.16)";
    badge.style.color = "var(--red)";
  }
  const t = Math.floor(game.time - (game.openedAt || 0));
  $("#clock").textContent = `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
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
  "ابنِ مصنعًا ومدينة في أول 30 ثانية.",
  "شريط قوة الهجوم 50% يكفي غالبًا — لا ترسل كل جيشك.",
  "المخبأ يبطئ الهجوم على حدودك 9% لكل مستوى.",
  "اضغط Shift على مبنى لترقيته للمستوى التالي.",
  "ميناء يفتح الغزو البحري لأي ساحل في العالم.",
  "Gift الذهب لجارك ليبقى محايدًا أطول.",
  "منصة صواريخ تحوّل الأرض إلى خرائب لا يعبرها الجيش.",
  "الجيش يتجدد أسرع عندما يكون أقل من السقف.",
  "الدفاع الجوي يعترض صواريخ العدو القريبة.",
  "التحصين يمنح +30% دفاع لمدة 20 ثانية.",
  "اضغط F للعودة إلى عاصمتك.",
  "كل بحث يرفع قوة جيشك أو اقتصادك بشكل دائم.",
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
        <button class="mini" data-retreat="${a.id}">${mine ? "انسحاب" : "تحصين"}</button>
      </div>
      <div class="ev-sub">${fmt(a.troops)} جندي • ${a.naval ? "بحري" : "برّي"} ${a.landingTimer > 0 ? "• إنزال…" : ""}</div>
      <div class="bar ${mine ? "adv" : ""}"><i style="width:${pct2}%"></i></div>
    </div>`);
  }
  for (const o of game.offers) {
    if (o.to !== p.id) continue;
    const from = game.byId[o.from];
    rows.push(`<div class="ev top">
      <div class="ev-row"><b>عرض من ${from?.ar || "؟"}</b>
        <span><button class="mini" data-accept="${o.id}">قبول</button>
        <button class="mini" data-decline="${o.id}">رفض</button></span></div>
      <div class="ev-sub">${o.type === "ceasefire" ? "وقف إطلاق نار" : "تحالف"}</div>
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
      if (a && a.attacker === p) game.retreat(a.id);
      else {
        const err = game.fortify(p);
        toast(err || "تم تحصين الحدود", err ? "bad" : "good");
      }
      updateEvents();
    };
  });
  el.querySelectorAll("[data-accept]").forEach((b) => {
    b.onclick = () => game.answerOffer(+b.dataset.accept, true);
  });
  el.querySelectorAll("[data-decline]").forEach((b) => {
    b.onclick = () => game.answerOffer(+b.dataset.decline, false);
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
        <div class="cost">${fmt(cost)} ◈ <span>${owned} مبنى</span></div>
        <div class="desc">${def.descAr}</div>
        <button class="pick">${cant ? "ذهب غير كافٍ" : "ابنِ"}</button>
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
        <div class="mil-box"><b>${fmt(rate.gold)}/ث</b><small>دخل الذهب</small></div>
        <div class="mil-box"><b>${fmt(p.gold)}</b><small>الخزينة</small></div>
        <div class="mil-box"><b>${cities}</b><small>مدن (سقف ${fmt(p.cap)})</small></div>
        <div class="mil-box"><b>${factories}</b><small>مصانع</small></div>
        <div class="mil-box"><b>${Math.round(rate.research * 10) / 10}/ث</b><small>بحث</small></div>
        <div class="mil-box"><b>${fmt(game.troopRate(p) * 60)}/د</b><small>تجنيد</small></div>
        <div class="mil-actions">
          <button class="btn ghost" id="btn-up-all">⇧ ترقية المبانٍ</button>
          <button class="btn ghost" id="btn-melt2">${game.melt ? "إيقاف" : "تشغيل"} بيع الجنود</button>
        </div>
      </div>
      <div class="hint">Shift + اضغط على أي مبنى في الخريطة لترقيته. الترقية تصل حتى المستوى 5.</div>`;
    body.querySelector("#btn-up-all").onclick = () => {
      let n = 0;
      for (const b of [...p.buildings]) {
        if (b.level >= 5) continue;
        if (game.upgradeBuilding(p, b) === null) n++;
        if (p.gold < 400) break;
      }
      toast(n ? `تمت ترقية ${n} مبنى` : "لا يوجد ذهب كافٍ", n ? "good" : "bad");
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
        <div class="mil-box"><b>+${fmt(rate)}/ث</b><small>تجنيد</small></div>
        <div class="mil-box"><b>${game.attackMult(p).toFixed(2)}×</b><small>قوة الهجوم</small></div>
        <div class="mil-box"><b>${(p.agg?.base || 0)}</b><small>قواعد</small></div>
        <div class="mil-actions">
          <button class="btn ghost" id="btn-rally">تجنيد فوري (${fmt(1800)} ◈)</button>
          <button class="btn ghost" id="btn-war">إعلان حرب…</button>
        </div>
        <label class="melt-toggle"><input type="checkbox" id="melt" ${game.melt ? "checked" : ""}/> تحويل الجيش إلى ذهب</label>
      </div>`;
    body.querySelector("#melt").onchange = (e) => {
      game.melt = e.target.checked;
    };
    body.querySelector("#btn-rally").onclick = () => {
      if (p.gold < 1800) return toast("الذهب غير كافٍ", "bad");
      p.gold -= 1800;
      p.army = Math.min(p.cap, p.army + 9000);
      updateTab();
    };
    body.querySelector("#btn-war").onclick = () => {
      if (!wars.length) return toast("لا حروب مفتوحة");
      app.tab = "wars";
      updateTab();
    };
    const warChips = wars
      .map((wn) => `<button class="btn ghost" data-focus="${wn.id}">⚔ ${wn.ar} · ${fmt(wn.army)}</button>`)
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
              .map((n) => `<button class="btn ghost" data-naval="${n.id}">⛵ إنزال على ${n.ar}</button>`)
              .join("")}</div>`
          : ""
      }`;
    body.querySelectorAll("[data-naval]").forEach((b) => {
      b.onclick = () => {
        const n = game.byId[+b.dataset.naval];
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
        <div class="mil-box"><b>${ready}</b><small>جاهز للإطلاق</small></div>
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
      toast("اختر هدف الضربة على الخريطة");
    };
    body.querySelector("#btn-missile").onclick = () => arm("missile");
    body.querySelector("#btn-nuke").onclick = () => arm("nuke");
  }
}

function eraName(key) {
  const names = {
    ancient: ["قرية", "منجم", "معبد الكهنة", "مرسى", "معسكر", "حصن", "منجنيق", "أبراج"],
    medieval: ["مدينة", "ورشة", "مكتبة", "ميناء", "ثكنة", "قلعة", "مدفع", "حراسة"],
    sail: ["مدينة", "مصنع", "أكاديمية", "حوض", "ثكنة", "حصن", "مدفعية", "بطاريات"],
    imperial: ["مدينة", "مصنع", "جامعة", "ميناء", "ثكنة", "حصن", "مدفعية", "دفاعات"],
    modern: ["مدينة", "مصنع", "مختبر", "ميناء", "قاعدة", "مخبأ", "منصة صواريخ", "دفاع جوي"],
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
      { war: "⚔ حرب", ally: "🤝 حليف", peace: "🕊 هدنة", neutral: "• محايد" }[game.rel(p, n)]
    }</b></div>` : ""}
    ${b ? `<div class="tt-row"><span>مبنى</span><b>${eraName(b.key)} L${b.level}</b></div>` : ""}
    ${owner !== p?.id ? `<div class="tt-hint">${game.adjacent(p, n) ? "اضغط مرتين للهجوم" : "غزو بحري (يحتاج ميناء)"}</div>` : '<div class="tt-hint">اضغط للبناء/التحديد</div>'}`;
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
  if (!p || p === n) return "أرضك";
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
      <p>${r.descAr} (المستوى ${lvl}/5)</p>
      <button data-tech="${r.key}" ${lvl >= 5 ? "disabled" : ""}>${lvl >= 5 ? "مكتمل" : `ترقية • ${cost} ✦`}</button>
    </div>`;
  }).join("");
  grid.querySelectorAll("[data-tech]").forEach((b) => {
    b.onclick = () => {
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
      return `<div class="offer"><span class="grow">${from?.ar} تعرض ${o.type === "ceasefire" ? "وقف إطلاق النار" : "تحالفًا"}</span>
        <button data-acc="${o.id}">قبول</button><button data-dec="${o.id}">رفض</button></div>`;
    })
    .join("");
  offers.querySelectorAll("[data-acc]").forEach((b) => (b.onclick = () => {
    game.answerOffer(+b.dataset.acc, true);
    renderDiplo();
  }));
  offers.querySelectorAll("[data-dec]").forEach((b) => (b.onclick = () => {
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
      const relTxt = { war: "حرب", ally: "حليف", peace: "هدنة", neutral: "محايد" }[rel];
      const adjacent = p.def.neighbors.includes(n.id);
      return `<div class="diplo-row">
        <i class="swatch" style="background:rgb(${n.def.color.r},${n.def.color.g},${n.def.color.b})"></i>
        <span class="nm">${n.ar} ${adjacent ? "" : "⛵"}<br><small style="color:var(--muted)">${fmt(n.army)} جندي • ${relTxt}</small></span>
        <span class="actions">
          ${rel === "war" ? `<button data-cease="${n.id}">هدنة</button>` : ""}
          ${rel !== "war" && rel !== "ally" ? `<button data-alliance="${n.id}">تحالف</button>` : ""}
          ${rel !== "war" ? `<button data-dow="${n.id}">حرب</button>` : ""}
          <button data-gift="${n.id}">هدية</button>
        </span>
      </div>`;
    })
    .join("");
  const search = document.createElement("input");
  search.className = "search";
  search.placeholder = "ابحث عن دولة…";
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
  list.querySelectorAll("[data-dow]").forEach((b) => (b.onclick = () => {
    const n = game.byId[+b.dataset.dow];
    game.declareWar(p, n);
    renderDiplo();
  }));
}

function doDiplo(type, id) {
  const game = app.game;
  const p = game.player();
  const err = game.propose({ type, from: p.id, to: id });
  toast(err || (type === "ceasefire" ? "تم إرسال عرض الهدنة" : type === "gift" ? "أُرسلت الهدية" : "تم إرسال عرض التحالف"), err ? "bad" : "good");
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

function showEnd(summary) {
  $("#end-title").textContent = summary.result === "win" ? "🏆 النصر!" : "💀 الهزيمة";
  $("#end-title").className = summary.result === "win" ? "win" : "lose";
  $("#end-sub").textContent =
    summary.result === "win"
      ? `سيطرت على ${pct(summary.share)} من الأرض في ${Math.round(summary.time / 60)} دقيقة.`
      : `وصلت إلى ${pct(summary.share)} من الأرض. حاول مرة أخرى!`;
  $("#end-stats").innerHTML = `
    <div class="stat"><b>${arNum(summary.conquered)}</b><small>دول محتلة</small></div>
    <div class="stat"><b>${arNum(Math.round(summary.time / 60))} د</b><small>مدة الحملة</small></div>
    <div class="stat"><b>${arNum(summary.built)}</b><small>مبانٍ</small></div>
    <div class="stat"><b>${arNum(summary.xp)}</b><small>XP</small></div>`;
  $("#modal-end").hidden = false;
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
      <li><code>1..8</code> اختيار مبنى • <code>Shift</code> وضع متعدد • <code>R</code> البحث • <code>Q/E</code> قوة الهجوم</li>
      <li><code>Space</code> إيقاف مؤقت • <code>WASD</code> تحريك • <code>F</code> العاصمة • <code>M</code> تحويل الجيش لذهب</li>
    </ul>
    <h4>الجوال</h4>
    <ul>
      <li>اضغط دولة لفتح قائمتها، ضغطة مزدوجة للهجوم، سحب للتحريك، قرص للتكبير.</li>
    </ul>`;
}

function boot() {
  buildMenu();
  renderMedals();
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
      toast("تعذر تحميل الحفظ", "bad");
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
  $("#btn-fs").onclick = () => {
    const el = document.documentElement;
    if (!document.fullscreenElement) {
      (el.requestFullscreen ? el.requestFullscreen() : Promise.resolve()).catch(() => {});
    } else if (document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
  };
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
      toast("تم حفظ اللعبة", "good");
    } catch (e) {
      toast("فشل الحفظ", "bad");
    }
  };
  $("#btn-settings").onclick = () => {
    const el = $("#settings");
    el.hidden = !el.hidden;
  };
  $("#btn-abandon").onclick = () => {
    closeModals();
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
    app.game = null;
    show("menu");
    buildMenu();
  };
  $("#set-sound").checked = profile.settings.sound !== false;
  $("#set-labels").checked = profile.settings.labels !== false;
  $("#set-speed").value = String(profile.settings.speed || 1);
  $("#set-drag").checked = profile.settings.drag !== false;
  $("#set-sound").onchange = (e) => {
    profile.settings.sound = e.target.checked;
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
    const t = e.target.closest(".tab");
    if (!t) return;
    app.tab = t.dataset.tab;
    updateTab();
  };
  $("#force-slider").oninput = (e) => setForce(e.target.value / 100);
  $("#force-up").onclick = () => setForce(app.game.attackFraction + 0.1);
  $("#force-down").onclick = () => setForce(app.game.attackFraction - 0.1);
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

boot();

export { app, fmt, toast };
