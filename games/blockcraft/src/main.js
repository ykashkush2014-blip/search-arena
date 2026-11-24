// Voxel game loop, rendering, UI wiring. Depends on three.js + the pure modules.
import * as THREE from '../vendor/three.module.min.js';
import { ID, BLOCKS, PLACEABLE, isSolid } from './blocks.js';
import { World, CHUNK_SIZE, WORLD_HEIGHT } from './world.js';
import { buildChunkGeometry, buildBlockGeometry, raycastVoxel } from './mesher.js';
import { Player, PLAYER_HEIGHT } from './player.js';
import { Sky } from './sky.js';
import { Input } from './input.js';
import { Inventory, RECIPES } from './inventory.js';
import { QuestLog } from './quests.js';
import { sfx, setMuted, isMuted, unlockAudio } from './audio.js';
import { getAtlasCanvas, createBlockIcon } from './textures.js';
import { formatCoords, biomeName, blockLabel, formatDuration, randomSeed, PHASE_LABEL } from './util.js';

const SAVE_KEY = 'blockcraft.save.v1';
const SETTINGS_KEY = 'blockcraft.settings.v1';
const REACH = 6.5;
const VIEW_RADIUS_DEFAULT = 4;
const MAX_HEALTH = 100;
const FALL_SAFE_SPEED = 13;

const $ = (sel) => document.querySelector(sel);
const el = {
  canvas: $('#scene'),
  hud: $('#hud'),
  menu: $('#menu'),
  pause: $('#pause'),
  inventory: $('#inventory'),
  help: $('#help'),
  win: $('#win'),
  loading: $('#loading'),
  loadingBar: $('#loading-bar'),
  loadingText: $('#loading-text'),
  fatal: $('#fatal'),
  fatalText: $('#fatal-text'),
  hotbar: $('#hotbar'),
  questList: $('#quest-list'),
  questCount: $('#quest-count'),
  quests: $('#quests'),
  invGrid: $('#inv-grid'),
  recipes: $('#recipes'),
  toasts: $('#toasts'),
  minimap: $('#minimap'),
  clock: $('#stat-clock'),
  phase: $('#stat-phase'),
  coords: $('#stat-coords'),
  target: $('#stat-target'),
  fps: $('#stat-fps'),
  chunks: $('#stat-chunks'),
  health: $('#stat-health'),
  hpbar: $('#hpbar'),
  waterTint: $('#water-tint'),
  damageFlash: $('#damage-flash'),
  touchUI: $('#touch-ui'),
  crosshair: $('#crosshair'),
  miniBiome: $('#mini-biome'),
  pauseStats: $('#pause-stats'),
  winStats: $('#win-stats'),
  continueBtn: $('#btn-continue'),
};

class Game {
  constructor() {
    this.mode = 'survival';
    this.seed = randomSeed();
    this.world = null;
    this.player = null;
    this.inventory = new Inventory({ creative: false });
    this.quests = new QuestLog();
    this.settings = loadSettings();
    this.running = false;
    this.paused = true;
    this.pausedByMenu = false;
    this.started = false;
    this.health = MAX_HEALTH;
    this.elapsed = 0;
    this.fpsEMA = 60;
    this.frames = 0;
    this.lastFpsAt = 0;
    this.target = null;
    this.breakCooldown = 0;
    this.placeCooldown = 0;
    this.heldBreak = false;
    this.heldPlace = false;
    this.lastGroundY = null;
    this.fallPeak = 0;
    this.wasInWater = false;
    this.distanceFromSpawn = 0;
    this.highlightTarget = null;
    this.viewRadius = VIEW_RADIUS_DEFAULT;
    this.chunkMaterials = null;
    this.renderDistance = this.settings.renderDistance || VIEW_RADIUS_DEFAULT;
    this.frameHandle = null;
    this.minimapAcc = 0;
    this.clockAcc = 0;
    this.nightAnnounced = false;
    this.setupRenderer();
  }

  // ---------------------------------------------------------------- setup
  setupRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: el.canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(this.computedPixelRatio());
    this.renderer.setSize(el.canvas.clientWidth || window.innerWidth, el.canvas.clientHeight || window.innerHeight, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 600);
    // YXZ keeps yaw/pitch independent (the default XYZ order introduces roll).
    this.camera.rotation.order = 'YXZ';
    this.qualityScale = 1;
    this.sky = new Sky(this.scene, this.renderer);

    const atlasCanvas = getAtlasCanvas();
    this.atlas = new THREE.CanvasTexture(atlasCanvas);
    this.atlas.magFilter = THREE.NearestFilter;
    this.atlas.minFilter = THREE.NearestFilter;
    this.atlas.generateMipmaps = false;
    this.atlas.colorSpace = THREE.SRGBColorSpace;
    this.atlas.wrapS = THREE.ClampToEdgeWrapping;
    this.atlas.wrapT = THREE.ClampToEdgeWrapping;

    this.materialOpaque = new THREE.MeshLambertMaterial({
      map: this.atlas, vertexColors: true, transparent: false,
    });
    this.materialTransparent = new THREE.MeshLambertMaterial({
      map: this.atlas, vertexColors: true, transparent: true, opacity: 0.86,
      depthWrite: false, side: THREE.DoubleSide,
    });

    this.chunkGroup = new THREE.Group();
    this.scene.add(this.chunkGroup);

    // Selection outline
    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.002, 1.002, 1.002));
    this.selectionBox = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({
      color: 0x0b0f1a, transparent: true, opacity: 0.85,
    }));
    this.selectionBox.visible = false;
    this.scene.add(this.selectionBox);

    // First-person held block (rendered with its own tiny camera rig).
    this.handScene = new THREE.Scene();
    this.handCamera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.01, 10);
    this.handCamera.rotation.order = 'YXZ';
    this.handGroup = new THREE.Group();
    this.handScene.add(this.handGroup);
    this.handMesh = null;
    this.handSwing = 0;
    this.handLight = new THREE.HemisphereLight('#ffffff', '#6e7a92', 1.5);
    this.handDir = new THREE.DirectionalLight('#ffffff', 1.0);
    this.handDir.position.set(0.4, 1, 0.8);
    this.handScene.add(this.handLight, this.handDir);
    this.handMaterial = new THREE.MeshLambertMaterial({ map: this.atlas, side: THREE.FrontSide });

    window.addEventListener('resize', () => this.onResize());
  }

  computedPixelRatio() {
    const base = Math.min(window.devicePixelRatio || 1, 2);
    return Math.max(0.6, base * (this.qualityScale || 1));
  }

  onResize() {
    // Prefer the canvas' own box so the game also fits inside an embedded iframe.
    const w = el.canvas.clientWidth || window.innerWidth;
    const h = el.canvas.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.renderer.setPixelRatio(this.computedPixelRatio());
    if (this.handCamera) {
      this.handCamera.aspect = w / h;
      this.handCamera.updateProjectionMatrix();
    }
  }

  /** Drops render resolution on slow devices, restores it when there is headroom. */
  autoQuality(dt) {
    this.qualityAcc = (this.qualityAcc || 0) + dt;
    this.qualityFrames = (this.qualityFrames || 0) + 1;
    if (this.qualityAcc < 2.5) return;
    const avgFps = this.qualityFrames / this.qualityAcc;
    this.qualityAcc = 0;
    this.qualityFrames = 0;
    let changed = false;
    if (avgFps < 34 && this.qualityScale > 0.62) { this.qualityScale = Math.max(0.6, this.qualityScale - 0.15); changed = true; }
    else if (avgFps > 57 && this.qualityScale < 1) { this.qualityScale = Math.min(1, this.qualityScale + 0.1); changed = true; }
    if (changed) this.renderer.setPixelRatio(this.computedPixelRatio());
  }

  // ---------------------------------------------------------------- world boot
  async startWorld({ seed, mode, resume = false } = {}) {
    this.mode = mode || this.mode;
    this.seed = seed ?? this.seed;
    showOverlay(el.loading);
    el.loadingBar.style.width = '6%';
    el.loadingText.textContent = 'جارٍ توليد التضاريس…';
    await nextFrame();

    this.disposeWorld();
    this.world = new World(this.seed);
    this.inventory = new Inventory({ creative: this.mode === 'creative' });
    this.quests = new QuestLog();
    this.quests.on((ev) => this.onQuestEvent(ev));
    this.health = MAX_HEALTH;
    this.elapsed = 0;
    this.nightAnnounced = false;

    const spawn = this.world.findSpawn();
    this.spawnPoint = spawn;
    this.player = new Player(this.world, spawn);
    this.player.yaw = Math.PI * 0.15;
    this.sky.timeOfDay = this.mode === 'creative' ? 0.42 : 0.3;

    this.chunkGroup.clear();
    this.chunkMeshes = new Map();
    this.renderDistance = this.settings.renderDistance || VIEW_RADIUS_DEFAULT;
    this.rebuildAround(spawn.x, spawn.z, true);
    el.loadingBar.style.width = '100%';

    this.input = this.input || new Input(el.canvas, this.inputHooks());
    this.bindUIOnce();
    this.refreshHotbar();
    this.updateHandMesh();
    this.refreshQuests();
    this.setHealth(MAX_HEALTH, true);
    this.drawMinimap();

    if (resume) this.loadSaveIntoState();
    this.syncCameraToPlayer();
    hideOverlay(el.loading);
    hideOverlay(el.pause);
    hideOverlay(el.inventory);
    hideOverlay(el.help);
    hideOverlay(el.win);
    this.openModalNode = null;
    this.winShown = false;
    el.menu.classList.add('hidden');
    el.hud.classList.remove('hidden');
    this.started = true;
    this.paused = false;
    this.pausedByMenu = false;
    this.running = true;
    this.lastTime = performance.now();
    if (!this.frameHandle) this.frameHandle = requestAnimationFrame((t) => this.loop(t));
    this.toast(this.mode === 'creative' ? 'وضع البناء الحر — مكعبات لا نهائية!' : 'ابقَ حياً وابنِ عالمك!', 'good');
  }

  disposeWorld() {
    if (this.chunkMeshes) {
      for (const meshes of this.chunkMeshes.values()) {
        for (const m of meshes) {
          this.chunkGroup.remove(m);
          m.geometry.dispose();
        }
      }
      this.chunkMeshes.clear();
    }
  }

  // ---------------------------------------------------------------- chunk meshing
  rebuildAround(px, pz, force = false) {
    const ccx = Math.floor(px / CHUNK_SIZE);
    const ccz = Math.floor(pz / CHUNK_SIZE);
    const R = this.renderDistance;
    const wanted = new Set();
    for (let dz = -R; dz <= R; dz++) {
      for (let dx = -R; dx <= R; dx++) {
        if (dx * dx + dz * dz > (R + 0.5) * (R + 0.5)) continue;
        wanted.add(`${ccx + dx},${ccz + dz}`);
      }
    }
    // Remove out-of-range chunks
    for (const key of [...this.chunkMeshes.keys()]) {
      if (!wanted.has(key)) {
        for (const m of this.chunkMeshes.get(key)) {
          this.chunkGroup.remove(m);
          m.geometry.dispose();
        }
        this.chunkMeshes.delete(key);
        this.world.chunks.delete(key);
      }
    }
    // Build missing / dirty chunks nearest-first
    const todo = [];
    for (const key of wanted) {
      const [cx, cz] = key.split(',').map(Number);
      const chunk = this.world.ensureChunk(cx, cz);
      if (!this.chunkMeshes.has(key) || chunk.dirty || force) todo.push({ cx, cz, key, chunk });
    }
    todo.sort((a, b) => (a.cx - ccx) ** 2 + (a.cz - ccz) ** 2 - ((b.cx - ccx) ** 2 + (b.cz - ccz) ** 2));
    const budget = force ? todo.length : Math.min(3, todo.length);
    for (let i = 0; i < budget; i++) this.buildChunkMesh(todo[i]);
    return todo.length;
  }

  buildChunkMesh({ cx, cz, key, chunk }) {
    const get = (x, y, z) => this.world.getBlock(x, y, z);
    const { opaque, transparent } = buildChunkGeometry(get, cx, cz);
    const existing = this.chunkMeshes.get(key);
    if (existing) {
      for (const m of existing) {
        this.chunkGroup.remove(m);
        m.geometry.dispose();
      }
      this.chunkMeshes.delete(key);
    }
    const meshes = [];
    const build = (data, material) => {
      if (!data.positions.length) return;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(data.normals, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(data.uvs, 2));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(data.colors, 3));
      geo.setIndex(data.indices);
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, material);
      mesh.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);
      mesh.frustumCulled = true;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      this.chunkGroup.add(mesh);
      meshes.push(mesh);
    };
    build(opaque, this.materialOpaque);
    build(transparent, this.materialTransparent);
    this.chunkMeshes.set(key, meshes);
    chunk.dirty = false;
  }

  // ---------------------------------------------------------------- input hooks
  inputHooks() {
    return {
      onEscape: () => this.togglePause(),
      onInventory: () => this.toggleInventory(),
      onFly: () => this.toggleFly(),
      onMap: () => $('#minimap-wrap').classList.toggle('hidden'),
      onMute: () => this.toggleMute(),
      onRespawn: () => this.respawn(),
      onTime: () => this.advanceTime(),
      onSlot: (i) => this.selectSlot(i),
      onWheel: (dir) => this.selectSlot((this.inventory.selected + dir + PLACEABLE.length) % PLACEABLE.length),
      onFirstClick: () => this.requestLook(),
      onPointerLockChange: (locked) => {
        // Losing the pointer (Esc, alt-tab, embedded iframes that forbid pointer
        // lock) must never dead-lock the game: just ask for a click to re-grab
        // the mouse. Pausing stays an explicit action (Esc button or key).
        if (!locked && this.started && !this.paused && !isTouch()) {
          this.needsClickToFocus = true;
        }
      },
    };
  }

  bindUIOnce() {
    if (this.uiBound) return;
    this.uiBound = true;
    // Action buttons on the canvas. The very first click after a menu closes is
    // used only to grab the mouse (so players don't punch a hole by accident).
    el.canvas.addEventListener('mousedown', (e) => {
      if (!this.started || this.paused) return;
      if (isTouch()) {
        if (e.button === 0) { this.heldBreak = true; this.breakBlock(true); }
        return;
      }
      if (this.needsClickToFocus) {
        this.needsClickToFocus = false;
        this.requestLook();
        return;
      }
      if (e.button === 0) { this.heldBreak = true; this.breakBlock(true); }
      if (e.button === 2) { this.heldPlace = true; this.placeBlock(true); }
      if (e.button === 1) { e.preventDefault(); this.breakBlock(true); }
    });
    window.addEventListener('mouseup', () => { this.heldBreak = false; this.heldPlace = false; });
    // Toolbar
    $('#btn-inventory').onclick = () => this.toggleInventory(true);
    $('#btn-fly').onclick = () => this.toggleFly();
    $('#btn-time').onclick = () => this.advanceTime();
    $('#btn-mute').onclick = () => this.toggleMute();
    $('#btn-help').onclick = () => this.openModal(el.help);
    $('#btn-pause').onclick = () => this.togglePause(true);
    $('#btn-map').onclick = () => $('#minimap-wrap').classList.toggle('hidden');
    $('#btn-fullscreen').onclick = () => this.toggleFullscreen();
    $('#btn-quests-toggle').onclick = () => el.quests.classList.toggle('collapsed');
    // Menus
    el.continueBtn.onclick = () => this.continueSaved();
    $('#btn-resume').onclick = () => this.setPaused(false);
    $('#btn-save').onclick = () => this.saveGame(true);
    $('#btn-settings').onclick = () => $('#settings').classList.toggle('hidden');
    $('#btn-quit').onclick = () => this.quitToMenu();
    $('#btn-inv-close').onclick = () => this.closeInventory();
    $('#btn-help-close').onclick = () => this.closeModal(el.help);
    $('#btn-win-again').onclick = () => { this.winShown = false; hideOverlay(el.win); this.openModalNode = null; this.startWorld({ seed: randomSeed(), mode: this.mode }); };
    $('#btn-win-stay').onclick = () => { this.winShown = false; this.closeModal(el.win); };
    document.querySelectorAll('.mode-card').forEach((card) => {
      card.onclick = () => {
        document.querySelectorAll('.mode-card').forEach((c) => {
          c.classList.toggle('active', c === card);
          c.setAttribute('aria-checked', String(c === card));
        });
        this.mode = card.dataset.mode;
        sfx.ui();
      };
    });
    $('#btn-play').onclick = () => { unlockAudio(); sfx.ui(); this.startWorld({ seed: randomSeed(), mode: this.mode }); };

    // Settings
    const sens = $('#set-sens');
    const dist = $('#set-distance');
    const inv = $('#set-invert');
    const snd = $('#set-sound');
    sens.value = Math.round(this.settings.sensitivity * 1000);
    dist.value = this.settings.renderDistance;
    inv.checked = !!this.settings.invertY;
    snd.checked = !this.settings.muted;
    sens.oninput = () => {
      this.settings.sensitivity = Number(sens.value) / 1000;
      if (this.input) this.input.sensitivity = this.settings.sensitivity;
      saveSettings(this.settings);
    };
    dist.onchange = () => {
      const v = Number(dist.value);
      this.settings.renderDistance = v;
      this.renderDistance = v;
      saveSettings(this.settings);
      if (this.world && this.player) this.rebuildAround(this.player.pos.x, this.player.pos.z);
    };
    inv.onchange = () => {
      this.settings.invertY = inv.checked;
      if (this.input) this.input.invertY = inv.checked;
      saveSettings(this.settings);
    };
    snd.onchange = () => {
      this.settings.muted = !snd.checked;
      setMuted(this.settings.muted, 0);
      saveSettings(this.settings);
      this.syncMuteButton();
    };
    setMuted(!!this.settings.muted);

    // Touch controls: joystick + look pad on touch-first devices.
    if (isTouch()) {
      el.touchUI.classList.remove('hidden');
      el.quests.classList.add('collapsed');
      this.bindTouchControls();
      this.bindTouchButtons();
    }

    // Hide cursor-help overlay pieces if no save
    if (localStorage.getItem(SAVE_KEY)) el.continueBtn.classList.remove('hidden');
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.started) this.setPaused(true);
    });
    window.addEventListener('beforeunload', () => {
      if (this.started) this.saveGame(false);
    });
  }

  bindTouchControls() {
    if (this.touchBound) return;
    this.touchBound = true;
    this.input.bindTouch({
      joystick: $('#joystick'), knob: $('#knob'), lookPad: $('#lookpad'),
      jumpBtn: $('#btn-touch-jump'), sprintBtn: $('#btn-touch-sprint'),
    });
  }

  bindTouchButtons() {
    if (this.touchButtonsBound) return;
    this.touchButtonsBound = true;
    const breakBtn = $('#btn-touch-break');
    const placeBtn = $('#btn-touch-place');
    let breakTimer = null;
    const stopBreak = () => { if (breakTimer) { clearInterval(breakTimer); breakTimer = null; } };
    breakBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.breakBlock(true);
      breakTimer = setInterval(() => this.breakBlock(true), 280);
    }, { passive: false });
    breakBtn.addEventListener('touchend', stopBreak);
    breakBtn.addEventListener('touchcancel', stopBreak);
    placeBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.placeBlock(true);
    }, { passive: false });
  }

  requestLook() {
    if (!this.input) return;
    if (document.pointerLockElement === el.canvas) return;
    if (isTouch()) return;
    this.input.requestPointerLock();
  }

  // ---------------------------------------------------------------- actions
  get targetBlock() {
    if (!this.player) return null;
    const dir = this.player.lookDir();
    const eye = [this.player.pos.x, this.player.eyeY, this.player.pos.z];
    return raycastVoxel(eye, [dir.x, dir.y, dir.z], REACH, (x, y, z) => this.world.getBlock(x, y, z));
  }

  breakBlock(fromClick = false) {
    if (this.breakCooldown > 0 || !this.player) return;
    const hit = this.targetBlock;
    if (!hit.hit) return;
    const { x, y, z, block } = hit;
    if (block === ID.WATER) return;
    this.breakCooldown = 0.16;
    this.handSwing = 1;
    this.world.setBlock(x, y, z, ID.AIR);
    this.rebuildAround(this.player.pos.x, this.player.pos.z);
    sfx.breakBlock(BLOCKS[block]?.name === 'حجر' ? 'stone' : block === ID.LOG ? 'wood' : 'dirt');
    let yielded = null;
    if (this.mode === 'creative') {
      yielded = block;
    } else {
      yielded = World.lootFor(block);
    }
    if (yielded) {
      this.inventory.add(yielded, 1);
      this.refreshHotbar();
    }
    if (this.mode === 'survival') {
      const before = this.quests.done.size;
      this.quests.track('break', { block, yield: yielded });
      if (this.quests.done.size !== before) this.refreshQuests();
      else this.refreshQuestProgress();
    }
    this.spawnBreakParticles(x, y, z, block);
  }

  placeBlock(fromClick = false) {
    if (this.placeCooldown > 0 || !this.player) return;
    const hit = this.targetBlock;
    if (!hit.hit || !hit.face) return;
    const id = this.inventory.selectedId;
    if (!this.inventory.creative && this.inventory.count(id) <= 0) {
      this.toast(`لا تملك ${BLOCKS[id].name}! اصنعه من الحقيبة (E)`, 'warn');
      return;
    }
    const x = hit.x + hit.face[0];
    const y = hit.y + hit.face[1];
    const z = hit.z + hit.face[2];
    if (y < 0 || y >= WORLD_HEIGHT) return;
    const existing = this.world.getBlock(x, y, z);
    if (existing !== ID.AIR && existing !== ID.WATER) return;
    // Never place inside the player.
    if (isSolid(id) && this.wouldTrapPlayer(x, y, z)) {
      this.toast('لا يمكنك البناء داخل نفسك', 'warn');
      return;
    }
    if (!this.inventory.remove(id, 1)) return;
    this.world.setBlock(x, y, z, id);
    this.placeCooldown = 0.13;
    this.handSwing = 1;
    this.rebuildAround(this.player.pos.x, this.player.pos.z);
    sfx.placeBlock();
    this.refreshHotbar();
    if (this.mode === 'survival') {
      const before = this.quests.done.size;
      this.quests.track('place', { block: id, y });
      if (this.quests.done.size !== before) this.refreshQuests();
      else this.refreshQuestProgress();
    }
  }

  wouldTrapPlayer(x, y, z) {
    const p = this.player.pos;
    const half = 0.34;
    const overlapX = x + 1 > p.x - half && x < p.x + half;
    const overlapZ = z + 1 > p.z - half && z < p.z + half;
    const overlapY = y + 1 > p.y && y < p.y + PLAYER_HEIGHT;
    return overlapX && overlapZ && overlapY;
  }

  spawnBreakParticles(x, y, z, block) {
    // Cheap instant particle: a few coloured points that fade.
    if (!this.particlePool) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(80 * 3), 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(80 * 3), 3));
      const mat = new THREE.PointsMaterial({ size: 0.14, vertexColors: true, transparent: true, opacity: 0.95 });
      this.particlePool = new THREE.Points(geo, mat);
      this.particlePool.frustumCulled = false;
      this.scene.add(this.particlePool);
      this.particles = [];
    }
    const color = new THREE.Color(BLOCKS[block]?.color || '#999999');
    for (let i = 0; i < 10; i++) {
      this.particles.push({
        x: x + 0.5, y: y + 0.5, z: z + 0.5,
        vx: (Math.random() - 0.5) * 3,
        vy: Math.random() * 3.2 + 0.6,
        vz: (Math.random() - 0.5) * 3,
        life: 0.65,
        color,
      });
    }
    if (this.particles.length > 80) this.particles.splice(0, this.particles.length - 80);
  }

  updateParticles(dt) {
    if (!this.particles || !this.particles.length) {
      if (this.particlePool) {
        this.particlePool.geometry.setDrawRange(0, 0);
      }
      return;
    }
    const posAttr = this.particlePool.geometry.getAttribute('position');
    const colAttr = this.particlePool.geometry.getAttribute('color');
    let n = 0;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      p.vy -= 18 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (n < 80) {
        posAttr.setXYZ(n, p.x, p.y, p.z);
        colAttr.setXYZ(n, p.color.r, p.color.g, p.color.b);
        n++;
      }
    }
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    this.particlePool.geometry.setDrawRange(0, n);
  }

  // ---------------------------------------------------------------- camera / look
  syncCameraToPlayer() {
    const p = this.player;
    const bobAmp = p.onGround ? Math.min(0.05, Math.hypot(p.vel.x, p.vel.z) * 0.008) : 0;
    const bobY = Math.sin(p.bob * 5.2) * bobAmp;
    const bobX = Math.cos(p.bob * 2.6) * bobAmp * 0.7;
    this.camera.position.set(p.pos.x + bobX, p.eyeY + bobY, p.pos.z);
    this.camera.rotation.set(p.pitch, p.yaw, Math.sin(p.bob * 2.6) * 0.006);
  }

  applyLook() {
    if (!this.input) return;
    const look = this.input.consumeLook();
    this.player.yaw -= look.x;
    this.player.pitch -= look.y;
    const lim = Math.PI / 2 - 0.02;
    this.player.pitch = Math.max(-lim, Math.min(lim, this.player.pitch));
  }

  /** Draws the held block in a separate overlay pass with the swing animation. */
  renderHand(dt) {
    if (!this.handGroup || !this.handMesh) return;
    const hide = this.paused || !this.started;
    this.handMesh.visible = !hide;
    if (hide) return;
    this.handSwing = Math.max(0, this.handSwing - dt * 3.4);
    const t = 1 - this.handSwing; // 0 → 1 through the swing
    const swingY = Math.sin(t * Math.PI) * 0.22 * (this.handSwing > 0 ? 1 : 0);
    const swingZ = Math.sin(t * Math.PI * 0.5) * 0.12 * (this.handSwing > 0 ? 1 : 0);
    const bobAmp = this.player.onGround ? Math.min(0.02, Math.hypot(this.player.vel.x, this.player.vel.z) * 0.004) : 0;
    const bx = Math.cos(this.player.bob * 2.6) * bobAmp;
    const by = Math.sin(this.player.bob * 5.2) * bobAmp;
    this.handCamera.aspect = this.camera.aspect;
    this.handCamera.updateProjectionMatrix();
    this.handMesh.position.set(0.4 + bx - swingZ, -0.31 + by - swingY, -1.0);
    this.handMesh.rotation.set(0.18 + swingY * 1.6, 0.72 - swingY * 0.8, -0.1);
    this.renderer.autoClear = false;
    this.renderer.clearDepth();
    this.renderer.render(this.handScene, this.handCamera);
    this.renderer.autoClear = true;
  }

  // ---------------------------------------------------------------- loop
  loop(now) {
    this.frameHandle = requestAnimationFrame((t) => this.loop(t));
    const dtRaw = (now - (this.lastTime ?? now)) / 1000;
    this.lastTime = now;
    const dt = Math.min(0.05, Math.max(0, dtRaw));
    this.fpsEMA += ((dtRaw > 0 ? 1 / dtRaw : 60) - this.fpsEMA) * 0.08;

    if (!this.world || !this.player) return;

    if (!this.paused) {
      this.elapsed += dt;
      this.applyLook();
      const axis = this.input.axis();
      const wasGround = this.player.onGround;
      const prevVy = this.player.vel.y;
      this.player.update(dt, axis);
      this.handleFall(wasGround, prevVy);
      this.breakCooldown = Math.max(0, this.breakCooldown - dt);
      this.placeCooldown = Math.max(0, this.placeCooldown - dt);
      if (this.heldBreak) this.breakBlock();
      if (this.heldPlace) this.placeBlock();

      // Track exploration distance & quest
      const d = Math.hypot(this.player.pos.x - this.spawnPoint.x, this.player.pos.z - this.spawnPoint.z);
      this.distanceFromSpawn = d;

      // Chunk streaming (budgeted) + rebuild around the player when they move chunks
      const ccx = Math.floor(this.player.pos.x / CHUNK_SIZE);
      const ccz = Math.floor(this.player.pos.z / CHUNK_SIZE);
      if (this.lastCCX !== ccx || this.lastCCZ !== ccz || !this.didInitialStream) {
        this.lastCCX = ccx; this.lastCCZ = ccz;
        this.didInitialStream = true;
        this.rebuildAround(this.player.pos.x, this.player.pos.z);
      } else if (Math.random() < 0.55) {
        this.rebuildAround(this.player.pos.x, this.player.pos.z);
      }

      // Water / fall / damage feedback
      if (this.player.inWater && !this.wasInWater) sfx.splash();
      this.wasInWater = this.player.inWater;
      el.waterTint.classList.toggle('on', this.player.inWater);

      // Survival rules
      if (this.mode === 'survival') this.tickSurvival(dt);

      // Auto-save every 30s
      this.saveAcc = (this.saveAcc || 0) + dt;
      if (this.saveAcc > 30) { this.saveAcc = 0; this.saveGame(false); }
    }

    const skyState = this.sky.update(dt, this.camera);
    if (!this.nightAnnounced && skyState.isNight && this.started) {
      this.nightAnnounced = true;
      this.toast('حلّ الليل… ضع مصباحاً لتُضيء عالمك', 'warn');
      sfx.night();
    } else if (this.nightAnnounced && !skyState.isNight) {
      this.nightAnnounced = false;
    }

    this.syncCameraToPlayer();
    this.updateSelection();
    this.autoQuality(dt);
    this.updateParticles(dt);
    this.updateHud(dt);
    if (!isTouch() && this.started) {
      const captured = document.pointerLockElement === el.canvas || this.draggingLook;
      el.canvas.classList.toggle('needs-capture', !captured && !this.paused);
    }
    this.updateQuestDistance();
    this.renderer.render(this.scene, this.camera);
    this.renderHand(dt);
  }

  tickSurvival(dt) {
    const p = this.player;
    // Cold at night outdoors, warmth near lamps.
    if (this.sky.isNight()) {
      const nearLamp = this.hasLampNearby(p.pos, 7);
      if (!nearLamp && !p.inWater) {
        this.coldAcc = (this.coldAcc || 0) + dt;
        if (this.coldAcc > 22) { this.coldAcc = 0; this.damage(4, 'البرد'); }
      } else this.coldAcc = 0;
    } else this.coldAcc = 0;
    if (p.inWater) {
      this.drownAcc = (this.drownAcc || 0) + dt;
      if (this.drownAcc > 12) { this.drownAcc = 0; this.damage(6, 'الغرق'); }
    } else this.drownAcc = 0;
    // Slow regeneration in daylight
    if (!this.sky.isNight() && this.health < MAX_HEALTH) {
      this.regenAcc = (this.regenAcc || 0) + dt;
      if (this.regenAcc > 6) { this.regenAcc = 0; this.setHealth(this.health + 3); }
    }
  }

  hasLampNearby(pos, r) {
    // Cache the answer: scanning thousands of blocks every frame is wasteful.
    const now = performance.now();
    if (this.lampCache && now - this.lampCacheAt < 500) return this.lampCache;
    const result = this.scanLamp(pos, r);
    this.lampCache = result;
    this.lampCacheAt = now;
    return result;
  }

  scanLamp(pos, r) {
    const px = Math.floor(pos.x), py = Math.floor(pos.y), pz = Math.floor(pos.z);
    const R = Math.ceil(r);
    for (let y = py - R; y <= py + R; y++) {
      for (let z = pz - R; z <= pz + R; z++) {
        for (let x = px - R; x <= px + R; x++) {
          if (this.world.getBlock(x, y, z) === ID.LAMP) return true;
        }
      }
    }
    return false;
  }

  handleFall(wasGround, prevVy) {
    const p = this.player;
    if (!p.onGround) {
      if (prevVy < 0) this.fallSpeed = Math.max(this.fallSpeed || 0, -prevVy);
    }
    if (p.onGround && !wasGround) {
      sfx.land();
      if (this.mode === 'survival' && this.fallSpeed > FALL_SAFE_SPEED) {
        const dmg = Math.round((this.fallSpeed - FALL_SAFE_SPEED) * 5.5);
        this.damage(dmg, 'السقوط');
      }
      this.fallSpeed = 0;
    }
    if (p.inWater) this.fallSpeed = 0;
  }

  damage(amount, reason) {
    if (this.mode === 'creative' || amount <= 0) return;
    this.setHealth(this.health - amount);
    el.damageFlash.classList.add('on');
    setTimeout(() => el.damageFlash.classList.remove('on'), 130);
    sfx.hurt();
    if (reason) this.toast(`${reason}! −${amount} صحة`, 'bad');
    if (this.health <= 0) this.respawn();
  }

  setHealth(v, silent = false) {
    this.health = Math.max(0, Math.min(MAX_HEALTH, Math.round(v)));
    el.health.textContent = String(this.health);
    el.hpbar.style.width = `${(this.health / MAX_HEALTH) * 100}%`;
    if (!silent) this.refreshHudChrome();
  }

  refreshHudChrome() {
    el.hpbar.style.background = this.health < 30
      ? 'linear-gradient(90deg, #ff4d4d, #ff8a4d)'
      : 'linear-gradient(90deg, #ff6b6b, #ffd15c)';
  }

  respawn() {
    const spawn = this.spawnPoint || this.world.findSpawn();
    this.player.pos = { x: spawn.x, y: spawn.y + 0.1, z: spawn.z };
    this.player.vel = { x: 0, y: 0, z: 0 };
    this.player.flying = false;
    this.setHealth(MAX_HEALTH);
    this.fallSpeed = 0;
    this.coldAcc = 0;
    this.toast(this.health === MAX_HEALTH ? 'عدت إلى نقطة البداية' : 'استعدت صحتك', 'good');
    saveSettings(this.settings);
  }

  updateSelection() {
    const hit = this.targetBlock;
    this.target = hit.hit ? hit : null;
    if (hit.hit) {
      this.selectionBox.visible = true;
      this.selectionBox.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
      el.crosshair.classList.add('hit');
      el.target.textContent = blockLabel(hit.block);
    } else {
      this.selectionBox.visible = false;
      el.crosshair.classList.remove('hit');
      el.target.textContent = '—';
    }
  }

  updateHud(dt) {
    this.frames += 1;
    const now = performance.now();
    if (now - this.lastFpsAt > 500) {
      el.fps.textContent = String(Math.round(this.fpsEMA));
      el.chunks.textContent = `· ${this.chunkMeshes ? this.chunkMeshes.size : 0} قطعة`;
      this.lastFpsAt = now;
    }
    el.clock.textContent = this.sky.clockLabel();
    el.phase.textContent = PHASE_LABEL(this.sky.timeOfDay);
    el.coords.textContent = formatCoords(this.player.pos);
    // biome via block under the player
    const under = this.world.getBlock(Math.floor(this.player.pos.x), Math.floor(this.player.pos.y) - 1, Math.floor(this.player.pos.z));
    el.miniBiome.textContent = this.player.inWater ? 'ماء' : biomeName(under);

    this.minimapAcc += dt;
    if (this.minimapAcc > 0.35) {
      this.minimapAcc = 0;
      this.drawMinimap();
    }
    // Health tint at low HP
    el.damageFlash.style.opacity = this.health < 30 && this.mode === 'survival' ? '0.25' : '';
  }

  updateQuestDistance() {
    if (this.mode === 'creative' || this.paused) return;
    this.qDistAcc = (this.qDistAcc || 0) + 1;
    if (this.qDistAcc % 45 !== 0) return;
    const before = this.quests.done.size;
    this.quests.track('move', { distance: this.distanceFromSpawn });
    if (this.quests.done.size !== before || this.qDistAcc % 450 === 0) this.refreshQuests();
  }

  drawMinimap() {
    const c = el.minimap;
    if (!c) return;
    const ctx = c.getContext('2d');
    const W = c.width;
    if (!W) return;
    const px = this.player.pos.x;
    const pz = this.player.pos.z;
    const scale = W / 72; // 72 blocks across

    if (!this.miniImage || this.miniImage.width !== W) {
      this.miniImage = ctx.createImageData(W, W);
    }
    const cd = this.miniImage.data;
    const biomeColors = {
      water: [58, 127, 201],
      sand: [224, 210, 154],
      snow: [242, 247, 255],
      grass: [111, 168, 63],
    };
    const CH = 16;
    for (let y = 0; y < W; y++) {
      for (let x = 0; x < W; x++) {
        const wx = Math.floor(px + (x - W / 2) / scale);
        const wz = Math.floor(pz + (y - W / 2) / scale);
        const cx = Math.floor(wx / CH);
        const cz = Math.floor(wz / CH);
        const chunk = this.world.chunks.get(`${cx},${cz}`);
        let col = biomeColors.grass;
        let shade = 1;
        if (chunk) {
          const h = chunk.surfaceHeight(wx - cx * CH, wz - cz * CH);
          if (h <= 20) col = biomeColors.water;
          else if (h <= 21) col = biomeColors.sand;
          else if (h > 44) col = biomeColors.snow;
          shade = 0.78 + Math.min(0.32, h / 90);
        }
        const i = (y * W + x) * 4;
        cd[i] = Math.min(255, col[0] * shade);
        cd[i + 1] = Math.min(255, col[1] * shade);
        cd[i + 2] = Math.min(255, col[2] * shade);
        cd[i + 3] = 255;
      }
    }
    ctx.putImageData(this.miniImage, 0, 0);

    // Player arrow
    ctx.save();
    ctx.translate(W / 2, W / 2);
    ctx.rotate(-this.player.yaw);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#0d1420';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -6.5);
    ctx.lineTo(4.6, 5);
    ctx.lineTo(0, 2.4);
    ctx.lineTo(-4.6, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Spawn marker
    if (this.spawnPoint) {
      const sx = W / 2 + (this.spawnPoint.x - px) * scale;
      const sy = W / 2 + (this.spawnPoint.z - pz) * scale;
      if (sx > 4 && sx < W - 4 && sy > 4 && sy < W - 4) {
        ctx.fillStyle = '#ffd15c';
        ctx.beginPath();
        ctx.arc(sx, sy, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.strokeStyle = 'rgba(255,255,255,.2)';
    ctx.strokeRect(0.5, 0.5, W - 1, W - 1);
  }

  // ---------------------------------------------------------------- UI
  onQuestEvent(ev) {
    if (ev.type === 'complete') {
      sfx.craft();
      for (const q of ev.quests) this.toast(`مهمة مكتملة: ${q.title}`, 'good');
      this.refreshQuests();
      if (ev.all) {
        setTimeout(() => this.showWin(), 700);
      }
    }
  }

  showWin() {
    if (this.mode === 'creative') return; // building sandbox has no victory screen
    this.winShown = true;
    el.winStats.textContent = `الزمن: ${formatDuration(this.elapsed)} · المكعبات المكسورة: ${this.quests.state.broken} · المبنية: ${this.quests.state.placed}`;
    this.openModal(el.win);
    sfx.win();
  }

  /** Cheap update of just the numbers/bars without rebuilding the list DOM. */
  refreshQuestProgress() {
    const entries = this.quests.entries();
    const items = el.questList.children;
    if (items.length !== entries.length) { this.refreshQuests(); return; }
    entries.forEach((q, i) => {
      const li = items[i];
      if (!li) return;
      const count = li.querySelector('.q-count');
      const bar = li.querySelector('.q-bar i');
      if (count) count.textContent = `${Math.min(Math.floor(q.value), q.target)}/${q.target}`;
      if (bar) bar.style.width = `${Math.round(q.ratio * 100)}%`;
    });
    el.questCount.textContent = `${this.quests.done.size}/${entries.length}`;
  }

  refreshQuests() {
    el.quests.classList.toggle('hidden', this.mode === 'creative');
    const entries = this.quests.entries();
    el.questCount.textContent = `${this.quests.done.size}/${entries.length}`;
    el.questList.innerHTML = entries.map((q) => `
      <li class="${q.done ? 'done' : ''}">
        <span class="q-icon">${questIcon(q.id)}</span>
        <span><span class="q-title">${q.title}${q.done ? ' <span class="tick">✓</span>' : ''}</span><br /><span class="q-desc">${q.desc}</span></span>
        <span class="q-count">${Math.min(Math.floor(q.value), q.target)}/${q.target}</span>
        <span class="q-bar"><i style="width:${Math.round(q.ratio * 100)}%"></i></span>
      </li>
    `).join('');
  }

  refreshHotbar() {
    const items = this.inventory.hotbar();
    el.hotbar.innerHTML = '';
    items.forEach((item) => {
      const btn = document.createElement('button');
      btn.className = `slot${item.selected ? ' selected' : ''}${item.count <= 0 ? ' empty' : ''}`;
      btn.title = `${item.name} (${item.index + 1})`;
      btn.setAttribute('aria-label', item.name);
      const icon = createBlockIcon(item.id, BLOCKS[item.id].tiles, 40);
      icon.className = '';
      btn.appendChild(icon);
      const n = document.createElement('span');
      n.className = 'n';
      n.textContent = String(item.index + 1);
      btn.appendChild(n);
      if (!this.inventory.creative) {
        const c = document.createElement('span');
        c.className = 'c';
        c.textContent = String(item.count);
        btn.appendChild(c);
      }
      btn.onclick = () => this.selectSlot(item.index);
      el.hotbar.appendChild(btn);
    });
    // keep selection visible
    const sel = el.hotbar.querySelector('.selected');
    if (sel) sel.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    this.updateHandMesh();
  }

  /** Rebuilds the first-person held block when the hotbar selection changes. */
  updateHandMesh() {
    if (!this.handGroup) return;
    const id = this.inventory.selectedId;
    if (this.handMesh && this.handMesh.userData.blockId === id) return;
    if (this.handMesh) {
      this.handGroup.remove(this.handMesh);
      this.handMesh.geometry.dispose();
      this.handMesh = null;
    }
    const { positions, normals, uvs, indices } = buildBlockGeometry(id);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    const mesh = new THREE.Mesh(geo, this.handMaterial);
    mesh.userData.blockId = id;
    mesh.scale.setScalar(0.11);
    mesh.position.set(0.4, -0.31, -1.0);
    mesh.rotation.set(0.18, 0.72, -0.1);
    this.handMesh = mesh;
    this.handGroup.add(mesh);
  }

  selectSlot(index) {
    this.inventory.select(index);
    this.refreshHotbar();
    sfx.ui();
  }

  togglePause(force) {
    if (!this.started) return;
    if (this.openModalNode && !this.openModalNode.classList.contains('hidden')) {
      // Esc closes whatever modal panel is on top.
      this.closeModal(this.openModalNode);
      return;
    }
    if (force === true) { this.setPaused(true); return; }
    this.setPaused(!this.paused);
  }

  /** Pauses simulation and shows the pause panel unless a modal already owns the screen. */
  setPaused(value, { silent = false } = {}) {
    if (!this.started) return;
    this.paused = value;
    if (value) {
      this.heldBreak = false;
      this.heldPlace = false;
      if (document.pointerLockElement) document.exitPointerLock();
      if (!silent && (!this.openModalNode || this.openModalNode.classList.contains('hidden'))) {
        this.pausedByMenu = true;
        el.pauseStats.textContent = `الزمن: ${formatDuration(this.elapsed)} · المهام: ${this.quests.done.size}/${this.quests.defs.length} · ${this.mode === 'creative' ? 'بناء حر' : 'مغامرة'}`;
        showOverlay(el.pause);
        this.openModalNode = el.pause;
      }
      this.saveGame(false);
    } else {
      this.pausedByMenu = false;
      this.openModalNode = null;
      hideOverlay(el.pause);
      hideOverlay(el.inventory);
      hideOverlay(el.help);
      hideOverlay(el.win);
      const settingsPanel = $('#settings');
      if (settingsPanel) settingsPanel.classList.add('hidden');
      this.lastTime = performance.now();
      if (!isTouch()) this.needsClickToFocus = true;
    }
  }

  /** Opens any full-screen panel and pauses the world. */
  openModal(node) {
    if (!this.started) return;
    if (node === el.inventory) this.renderInventory();
    this.openModalNode = node;
    this.pausedByMenu = true;
    this.paused = true;
    this.heldBreak = false;
    this.heldPlace = false;
    if (document.pointerLockElement) document.exitPointerLock();
    showOverlay(node);
    if (node !== el.win) this.saveGame(false);
  }

  closeModal(node) {
    hideOverlay(node);
    if (this.openModalNode === node) this.openModalNode = null;
    if (this.winShown && node !== el.win) { // stay paused behind the win screen
      return;
    }
    this.setPaused(false);
  }

  toggleInventory(force) {
    if (!this.started) return;
    const isHidden = el.inventory.classList.contains('hidden');
    const show = force === undefined ? isHidden : !!force;
    if (show) this.openModal(el.inventory);
    else this.closeModal(el.inventory);
  }

  closeInventory() {
    this.closeModal(el.inventory);
  }

  renderInventory() {
    el.invGrid.innerHTML = '';
    for (const id of PLACEABLE) {
      const def = BLOCKS[id];
      const count = this.inventory.creative ? '∞' : this.inventory.count(id);
      const cell = document.createElement('button');
      cell.className = `inv-cell${id === this.inventory.selectedId ? ' selected' : ''}${count === 0 ? ' empty' : ''}`;
      cell.title = def.name;
      const icon = createBlockIcon(id, def.tiles, 52);
      cell.appendChild(icon);
      const cnt = document.createElement('span');
      cnt.className = 'cnt';
      cnt.textContent = String(count);
      cell.appendChild(cnt);
      const lbl = document.createElement('span');
      lbl.className = 'lbl';
      lbl.textContent = def.name;
      cell.appendChild(lbl);
      cell.onclick = () => {
        const idx = PLACEABLE.indexOf(id);
        this.selectSlot(idx);
        this.closeModal(el.inventory);
        this.refreshHotbar();
      };
      el.invGrid.appendChild(cell);
    }
    el.recipes.innerHTML = '';
    for (const r of RECIPES) {
      const row = document.createElement('div');
      row.className = 'recipe';
      const icon = createBlockIcon(r.out, BLOCKS[r.out].tiles, 36);
      row.appendChild(icon);
      const mid = document.createElement('div');
      const name = document.createElement('div');
      name.className = 'r-name';
      name.textContent = `${r.label} ×${r.count}`;
      const cost = document.createElement('div');
      cost.className = 'r-cost';
      cost.innerHTML = r.in.map((req) => {
        const have = this.inventory.count(req.id);
        return `<span class="chip${have < req.count ? ' lack' : ''}">${BLOCKS[req.id].name} ${have}/${req.count}</span>`;
      }).join('');
      mid.append(name, cost);
      row.appendChild(mid);
      const btn = document.createElement('button');
      btn.className = 'btn primary';
      btn.textContent = 'اصنع';
      btn.disabled = !this.inventory.canCraft(r);
      btn.onclick = () => {
        if (this.inventory.craft(r)) {
          sfx.craft();
          if (this.mode === 'survival') this.quests.track('craft', { output: r.out, count: r.count });
          this.refreshQuests();
          this.refreshHotbar();
          this.renderInventory();
          this.toast(`صنعت ${BLOCKS[r.out].name} ×${r.count}`, 'good');
        }
      };
      row.appendChild(btn);
      el.recipes.appendChild(row);
    }
  }

  toggleFly() {
    if (!this.player) return;
    const p = this.player;
    if (this.mode !== 'creative' && !p.flying) {
      this.toast('الطيران متاح في وضع البناء الحر فقط', 'warn');
      return;
    }
    p.flying = !p.flying;
    p.vel.y = 0;
    $('#btn-fly').classList.toggle('active', p.flying);
    sfx.ui();
  }

  advanceTime() {
    this.sky.setTime(this.sky.timeOfDay + 0.12);
    this.nightAnnounced = this.sky.isNight();
    sfx.ui();
  }

  toggleMute() {
    this.settings.muted = !isMuted();
    setMuted(this.settings.muted);
    saveSettings(this.settings);
    this.syncMuteButton();
  }

  syncMuteButton() {
    const btn = $('#btn-mute');
    if (!btn) return;
    btn.classList.toggle('active', !!this.settings.muted);
    const em = btn.querySelector('em');
    if (em) em.textContent = this.settings.muted ? 'صامت' : 'الصوت';
    btn.setAttribute('aria-pressed', String(!!this.settings.muted));
  }

  toggleFullscreen() {
    const doc = document;
    if (!doc.fullscreenElement) {
      (doc.documentElement.requestFullscreen?.() || Promise.resolve()).catch(() => {});
    } else {
      doc.exitFullscreen?.();
    }
  }

  toast(message, kind = '') {
    const node = document.createElement('div');
    node.className = `toast ${kind}`;
    node.textContent = message;
    el.toasts.appendChild(node);
    setTimeout(() => node.remove(), 2900);
  }

  quitToMenu() {
    this.saveGame(false);
    this.paused = true;
    this.pausedByMenu = false;
    this.openModalNode = null;
    hideOverlay(el.pause);
    hideOverlay(el.inventory);
    hideOverlay(el.help);
    hideOverlay(el.win);
    if (document.pointerLockElement) document.exitPointerLock();
    el.hud.classList.add('hidden');
    el.menu.classList.remove('hidden');
    this.started = false;
    this.paused = true;
    if (localStorage.getItem(SAVE_KEY)) el.continueBtn.classList.remove('hidden');
  }

  // ---------------------------------------------------------------- persistence
  saveGame(notify) {
    if (!this.world || !this.player || !this.started) return;
    try {
      const edits = [];
      for (const [key, m] of this.world.edits) {
        for (const [i, id] of m) edits.push([key, i, id]);
      }
      const data = {
        v: 1,
        seed: this.seed,
        mode: this.mode,
        time: this.sky.timeOfDay,
        player: { pos: this.player.pos, yaw: this.player.yaw, pitch: this.player.pitch, flying: this.player.flying },
        health: this.health,
        elapsed: this.elapsed,
        inventory: this.inventory.serialize(),
        quests: this.quests.serialize(),
        edits,
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      if (notify) this.toast('تم حفظ اللعبة', 'good');
    } catch (e) {
      if (notify) this.toast('تعذّر الحفظ (مساحة التخزين ممتلئة)', 'bad');
    }
  }

  continueSaved() {
    let data;
    try { data = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch { data = null; }
    if (!data) { this.startWorld({ seed: randomSeed(), mode: this.mode }); return; }
    this.pendingSave = data;
    this.startWorld({ seed: data.seed, mode: data.mode || 'survival', resume: true });
  }

  loadSaveIntoState() {
    const data = this.pendingSave;
    if (!data) return;
    this.pendingSave = null;
    for (const [key, i, id] of data.edits || []) {
      const [cx, cz] = key.split(',').map(Number);
      let m = this.world.edits.get(key);
      if (!m) { m = new Map(); this.world.edits.set(key, m); }
      m.set(i, id);
      const chunk = this.world.chunks.get(key);
      if (chunk) chunk.data[i] = id;
    }
    this.inventory.restore(data.inventory);
    this.quests.restore(data.quests);
    this.player.pos = { ...data.player.pos };
    this.player.yaw = data.player.yaw;
    this.player.pitch = data.player.pitch;
    this.player.flying = !!data.player.flying;
    this.health = data.health ?? MAX_HEALTH;
    this.elapsed = data.elapsed || 0;
    this.sky.timeOfDay = data.time ?? 0.3;
    // Re-mesh everything now that edits are applied.
    for (const key of [...this.chunkMeshes.keys()]) {
      for (const m of this.chunkMeshes.get(key)) { this.chunkGroup.remove(m); m.geometry.dispose(); }
      this.chunkMeshes.delete(key);
    }
    for (const chunk of this.world.chunks.values()) chunk.dirty = true;
    this.rebuildAround(this.player.pos.x, this.player.pos.z, true);
    this.refreshHotbar();
    this.refreshQuests();
    this.setHealth(this.health, true);
    this.toast('تم استعادة حفظك السابق', 'good');
  }
}

// ------------------------------------------------------------------ helpers
const QUEST_ICONS = {
  'first-blocks': '<path d="m5 19 7-7"/><path d="M13.5 4.5 19 10l-3 3-5.5-5.5z"/>',
  foundation: '<path d="M12 3 20 7.5v9L12 21 4 16.5v-9z"/><path d="M4 7.5 12 12l8-4.5"/><path d="M12 12v9"/>',
  lumberjack: '<path d="M6 20 18 8"/><path d="M14 4h6v6"/>',
  crafter: '<path d="m14 4 6 6-9 9H5v-6z"/><path d="m12 6 6 6"/>',
  light: '<path d="M9 20h6"/><path d="M10 17h4"/><path d="M12 3a6 6 0 0 1 3.5 10.9c-.6.5-.5 1.6-.5 2.1h-6c0-.5.1-1.6-.5-2.1A6 6 0 0 1 12 3z"/>',
  tower: '<path d="M8 21V8"/><path d="M16 21V8"/><path d="M8 8h8"/><path d="M12 3v5"/><path d="M5 21h14"/>',
  explorer: '<circle cx="12" cy="12" r="9"/><path d="m15 9-2 5-5 2 2-5z"/>',
};

function questIcon(id) {
  const body = QUEST_ICONS[id] || QUEST_ICONS.explorer;
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
}

function nextFrame() {
  return new Promise((res) => requestAnimationFrame(() => res()));
}
function showOverlay(node) { node.classList.remove('hidden'); }
function hideOverlay(node) { node.classList.add('hidden'); }
function isTouch() {
  // Treat a device as touch-first only when its primary pointer is coarse.
  return window.matchMedia('(pointer: coarse)').matches;
}
function loadSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    return {
      sensitivity: 0.0024,
      renderDistance: VIEW_RADIUS_DEFAULT,
      invertY: false,
      muted: false,
      ...raw,
    };
  } catch {
    return { sensitivity: 0.0024, renderDistance: VIEW_RADIUS_DEFAULT, invertY: false, muted: false };
  }
}
function saveSettings(s) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

// ------------------------------------------------------------------ boot
try {
  const game = new Game();
  window.__blockcraft = game;
  game.input = new Input(el.canvas, game.inputHooks());
  game.input.sensitivity = game.settings.sensitivity;
  game.input.invertY = !!game.settings.invertY;
  game.bindUIOnce();
  game.syncMuteButton();
  if (!localStorage.getItem(SAVE_KEY)) el.continueBtn.classList.add('hidden');
} catch (err) {
  console.error(err);
  showOverlay(el.fatal);
  el.fatalText.textContent = `تأكد من أن متصفحك يدعم WebGL2. (${err && err.message ? err.message : err})`;
}
