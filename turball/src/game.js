// Boostball Arena — rendering, UI, audio and game flow.
import * as THREE from '../vendor/three.module.min.js';
import {
  FIELD,
  Car,
  Ball,
  collideCarBall,
  collideCars,
  computeAIInput,
  assignRoles,
  BOOST_PADS,
  TEAM_COLORS,
  clamp,
  damp,
} from './engine.js';

const $ = (sel) => document.querySelector(sel);
const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------
// renderer / scene
// ---------------------------------------------------------------------------
const canvas = $('#game');
let renderer = null;
let MAX_ANISO = 4;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  MAX_ANISO = Math.min(8, renderer.capabilities.getMaxAnisotropy());
} catch (err) {
  // No WebGL (old browser / blocked context): the simulation still runs, we just
  // cannot draw. Surface a hint instead of dying with a blank screen.
  console.warn('WebGL is unavailable in this browser.', err);
  renderer = null;
  const warn = document.createElement('div');
  warn.id = 'webgl-warning';
  warn.textContent = 'WebGL is unavailable — enable hardware acceleration to play.';
  document.body.appendChild(warn);
}

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x060a14, 0.0052);

const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 900);
camera.position.set(0, 16, 36);

// ---------------------------------------------------------------------------
// texture helpers
// ---------------------------------------------------------------------------
function canvasTexture(w, h, draw, { repeat = null, srgb = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(c);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat[0], repeat[1]);
  }
  tex.anisotropy = MAX_ANISO;
  return tex;
}

const glowTex = canvasTexture(128, 128, (ctx, w, h) => {
  const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
});

const sparkTex = canvasTexture(64, 64, (ctx, w, h) => {
  const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.7)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
});

function makeFieldTexture() {
  // 16 px per world unit -> 64 x 88 units
  return canvasTexture(1024, 1408, (ctx, w, h) => {
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#14294c');
    bg.addColorStop(0.5, '#0c1b36');
    bg.addColorStop(1, '#14294c');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    const top = ctx.createLinearGradient(0, 0, 0, h / 2);
    top.addColorStop(0, 'rgba(255,124,28,0.24)');
    top.addColorStop(1, 'rgba(255,124,28,0)');
    ctx.fillStyle = top;
    ctx.fillRect(0, 0, w, h / 2);
    const bot = ctx.createLinearGradient(0, h, 0, h / 2);
    bot.addColorStop(0, 'rgba(39,168,255,0.24)');
    bot.addColorStop(1, 'rgba(39,168,255,0)');
    ctx.fillStyle = bot;
    ctx.fillRect(0, h / 2, w, h / 2);

    // grid
    ctx.strokeStyle = 'rgba(80,170,255,0.14)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 64) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    for (let y = 0; y <= h; y += 64) {
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();

    // markings
    ctx.shadowColor = 'rgba(90,205,255,1)';
    ctx.shadowBlur = 22;
    ctx.strokeStyle = 'rgba(180,240,255,0.95)';
    ctx.lineWidth = 6;
    ctx.strokeRect(26, 26, w - 52, h - 52);

    ctx.beginPath();
    ctx.moveTo(26, h / 2);
    ctx.lineTo(w - 26, h / 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 176, 0, TAU);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 10, 0, TAU);
    ctx.fillStyle = 'rgba(160,235,255,0.9)';
    ctx.fill();

    // goal boxes (18 x 8 units)
    const boxW = 18 * 16;
    const boxD = 8 * 16;
    ctx.strokeRect(w / 2 - boxW / 2, 26, boxW, boxD);
    ctx.strokeRect(w / 2 - boxW / 2, h - 26 - boxD, boxW, boxD);

    // penalty arcs
    ctx.beginPath();
    ctx.arc(w / 2, 26, 150, 0.25, Math.PI - 0.25);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(w / 2, h - 26, 150, Math.PI + 0.25, TAU - 0.25);
    ctx.stroke();

    // corner ticks
    ctx.lineWidth = 4;
    for (const [cx, cy, a] of [
      [26, 26, 0],
      [w - 26, 26, Math.PI / 2],
      [w - 26, h - 26, Math.PI],
      [26, h - 26, -Math.PI / 2],
    ]) {
      ctx.beginPath();
      ctx.arc(cx, cy, 46, a, a + Math.PI / 2);
      ctx.stroke();
    }

    // speckle
    ctx.shadowBlur = 0;
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = `rgba(120,200,255,${Math.random() * 0.05})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
  });
}

function makeWallTexture() {
  return canvasTexture(
    256,
    256,
    (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(110,210,255,0.5)';
      ctx.lineWidth = 2;
      ctx.shadowColor = 'rgba(80,190,255,0.9)';
      ctx.shadowBlur = 6;
      for (let x = 0; x <= w; x += 64) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0; y <= h; y += 64) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
    },
    { repeat: [10, 4] },
  );
}

function makeNetTexture() {
  return canvasTexture(
    128,
    128,
    (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(210,245,255,0.55)';
      ctx.lineWidth = 2;
      for (let i = -h; i < w + h; i += 16) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i + h, h);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(i, h);
        ctx.lineTo(i + h, 0);
        ctx.stroke();
      }
    },
    { repeat: [3, 2] },
  );
}

// ---------------------------------------------------------------------------
// particles
// ---------------------------------------------------------------------------
class Sparks {
  constructor(scene, count = 1100) {
    this.count = count;
    this.cursor = 0;
    this.pos = new Float32Array(count * 3);
    this.col = new Float32Array(count * 3);
    this.base = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    this.maxLife = new Float32Array(count);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.geo = geo;

    const mat = new THREE.PointsMaterial({
      size: 0.72,
      map: sparkTex,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);

    for (let i = 0; i < count; i++) this.pos[i * 3 + 1] = -999;
  }

  spawn(pos, count, color, speed = 8, life = 0.8, upward = 0) {
    const c = color instanceof THREE.Color ? color : new THREE.Color(color);
    for (let n = 0; n < count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.count;
      const theta = Math.random() * TAU;
      const phi = Math.acos(2 * Math.random() - 1);
      const s = speed * (0.25 + Math.random() * 0.75);
      this.pos[i * 3] = pos.x + (Math.random() - 0.5) * 0.7;
      this.pos[i * 3 + 1] = pos.y + (Math.random() - 0.5) * 0.7;
      this.pos[i * 3 + 2] = pos.z + (Math.random() - 0.5) * 0.7;
      this.vel[i * 3] = Math.sin(phi) * Math.cos(theta) * s;
      this.vel[i * 3 + 1] = Math.cos(phi) * s * 0.65 + upward;
      this.vel[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * s;
      const jitter = 0.75 + Math.random() * 0.45;
      this.base[i * 3] = c.r * jitter;
      this.base[i * 3 + 1] = c.g * jitter;
      this.base[i * 3 + 2] = c.b * jitter;
      this.col[i * 3] = this.base[i * 3];
      this.col[i * 3 + 1] = this.base[i * 3 + 1];
      this.col[i * 3 + 2] = this.base[i * 3 + 2];
      this.life[i] = life * (0.55 + Math.random() * 0.9);
      this.maxLife[i] = this.life[i] || 1;
    }
  }

  update(dt) {
    const damping = Math.exp(-1.3 * dt);
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.pos[i * 3 + 1] = -999;
        this.col[i * 3] = this.col[i * 3 + 1] = this.col[i * 3 + 2] = 0;
        continue;
      }
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.vel[i * 3 + 1] -= 11 * dt;
      this.vel[i * 3] *= damping;
      this.vel[i * 3 + 1] *= damping;
      this.vel[i * 3 + 2] *= damping;
      if (this.pos[i * 3 + 1] < 0.1) {
        this.pos[i * 3 + 1] = 0.1;
        this.vel[i * 3 + 1] *= -0.4;
      }
      const f = Math.pow(this.life[i] / this.maxLife[i], 0.7);
      this.col[i * 3] = this.base[i * 3] * f;
      this.col[i * 3 + 1] = this.base[i * 3 + 1] * f;
      this.col[i * 3 + 2] = this.base[i * 3 + 2] * f;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------
// car model
// ---------------------------------------------------------------------------
class CarView {
  constructor(team) {
    const color = TEAM_COLORS[team];
    this.team = team;
    this.group = new THREE.Group();
    this.group.rotation.order = 'YXZ';

    const bodyMat = new THREE.MeshStandardMaterial({
      color,
      metalness: 0.55,
      roughness: 0.3,
      emissive: color,
      emissiveIntensity: 0.22,
    });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0x0d1220, metalness: 0.8, roughness: 0.35 });
    const tyreMat = new THREE.MeshStandardMaterial({ color: 0x070a12, metalness: 0.2, roughness: 0.85 });
    const rimMat = new THREE.MeshStandardMaterial({
      color: 0xcfefff,
      emissive: color,
      emissiveIntensity: 0.9,
      metalness: 0.9,
      roughness: 0.2,
    });

    // chassis + nose
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.88, 0.42, 3.15), bodyMat);
    chassis.position.y = 0.06;
    chassis.castShadow = true;
    this.group.add(chassis);

    const nose = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.26, 0.9), bodyMat);
    nose.position.set(0, 0.0, -1.7);
    nose.rotation.x = 0.18;
    nose.castShadow = true;
    this.group.add(nose);

    const tail = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.3, 0.55), trimMat);
    tail.position.set(0, 0.12, 1.5);
    this.group.add(tail);

    // cabin
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.26, 0.34, 1.55), trimMat);
    cabin.position.set(0, 0.4, 0.14);
    cabin.castShadow = true;
    this.group.add(cabin);

    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x6fd6ff,
      emissive: 0x2a7fa8,
      emissiveIntensity: 0.65,
      metalness: 0.9,
      roughness: 0.12,
      transparent: true,
      opacity: 0.9,
    });
    const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.14, 0.34, 0.06), glassMat);
    windshield.position.set(0, 0.1, -0.66);
    windshield.rotation.x = 0.62;
    this.group.add(windshield);

    const rearGlass = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.26, 0.06), glassMat);
    rearGlass.position.set(0, 0.1, 0.86);
    rearGlass.rotation.x = -0.6;
    this.group.add(rearGlass);

    // roof stripe + side accents
    const accentMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 2.6), accentMat);
    stripe.position.set(0, 0.585, -0.1);
    this.group.add(stripe);
    for (const sx of [-1, 1]) {
      const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.12, 2.3), rimMat);
      skirt.position.set(sx * 0.96, 0.0, 0);
      this.group.add(skirt);
    }

    // spoiler
    const wing = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.08, 0.52), trimMat);
    wing.position.set(0, 0.6, 1.46);
    this.group.add(wing);
    for (const sx of [-0.7, 0.7]) {
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.28, 0.1), trimMat);
      strut.position.set(sx, 0.48, 1.4);
      this.group.add(strut);
    }

    // tail light bar
    const tailLight = new THREE.Mesh(
      new THREE.BoxGeometry(1.66, 0.09, 0.06),
      new THREE.MeshBasicMaterial({ color: 0xff4a3d }),
    );
    tailLight.position.set(0, 0.2, 1.79);
    this.group.add(tailLight);

    // headlights
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xf4fbff });
    for (const sx of [-0.6, 0.6]) {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.08), lightMat);
      hl.position.set(sx, 0.12, -1.82);
      this.group.add(hl);
    }

    // wheels (pivot for steering, spinner for rolling)
    this.spinners = [];
    this.frontPivots = [];
    const wheelGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.36, 16);
    const rimGeo = new THREE.CylinderGeometry(0.23, 0.23, 0.38, 10);
    for (const sx of [-1, 1]) {
      for (const sz of [-1.02, 1.02]) {
        const pivot = new THREE.Group();
        pivot.position.set(sx * 0.98, -0.17, sz);
        const spinner = new THREE.Group();
        const wheel = new THREE.Mesh(wheelGeo, tyreMat);
        wheel.rotation.z = Math.PI / 2;
        wheel.castShadow = true;
        spinner.add(wheel);
        const rim = new THREE.Mesh(rimGeo, rimMat);
        rim.rotation.z = Math.PI / 2;
        spinner.add(rim);
        pivot.add(spinner);
        this.group.add(pivot);
        this.spinners.push(spinner);
        if (sz < 0) this.frontPivots.push(pivot);
      }
    }

    // boost nozzles + flames
    const nozzleMat = new THREE.MeshStandardMaterial({
      color: 0x10151f,
      metalness: 0.9,
      roughness: 0.3,
      emissive: color,
      emissiveIntensity: 0.5,
    });
    const flameMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const flameGeo = new THREE.ConeGeometry(0.22, 1.35, 8, 1, true);
    flameGeo.translate(0, 0.675, 0);
    this.flames = [];
    for (const sx of [-0.45, 0.45]) {
      const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.3, 10), nozzleMat);
      nozzle.rotation.x = Math.PI / 2;
      nozzle.position.set(sx, 0.06, 1.78);
      this.group.add(nozzle);

      const flame = new THREE.Mesh(flameGeo, flameMat);
      flame.rotation.x = Math.PI / 2;
      flame.position.set(sx, 0.06, 1.8);
      flame.visible = false;
      this.group.add(flame);
      this.flames.push(flame);
    }

    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTex,
        color,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    glow.scale.set(2.6, 2.6, 1);
    glow.position.set(0, -0.25, 1.6);
    this.group.add(glow);
    this.tailGlow = glow;

    this.boostLight = new THREE.PointLight(color, 0, 14, 2);
    this.boostLight.position.set(0, 0.1, 1.9);
    this.group.add(this.boostLight);

    this._q = new THREE.Quaternion();
  }

  update(car) {
    this.group.position.copy(car.pos);
    this.group.quaternion.copy(car.visualQuaternion(this._q));
    for (const s of this.spinners) s.rotation.x = -car.wheelSpin;
    for (const p of this.frontPivots) p.rotation.y = -car.steerVisual * 0.45;

    const boosting = car.boosting;
    for (const f of this.flames) {
      f.visible = boosting;
      if (boosting) {
        const s = 0.7 + Math.random() * 0.55;
        f.scale.set(1, s, 1);
        f.material.opacity = 0.65 + Math.random() * 0.3;
      }
    }
    this.boostLight.intensity = boosting ? 14 : 0;
    this.tailGlow.material.opacity = boosting ? 0.9 : 0.45;
  }

  dispose(scene) {
    scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
        else o.material.dispose();
      }
    });
  }
}

// ---------------------------------------------------------------------------
// world: arena, ball, pads, effects
// ---------------------------------------------------------------------------
class World {
  constructor(scene) {
    this.scene = scene;
    this.time = 0;
    this.sparks = new Sparks(scene, 1100);
    this.shockwaves = [];
    this.build();
  }

  build() {
    const scene = this.scene;

    // --- sky dome ---
    const skyTex = canvasTexture(16, 256, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#02040a');
      g.addColorStop(0.42, '#071127');
      g.addColorStop(0.62, '#0d2145');
      g.addColorStop(1, '#050810');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    });
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(420, 24, 16),
      new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false }),
    );
    scene.add(sky);

    // stars
    const starPos = new Float32Array(1400 * 3);
    for (let i = 0; i < 1400; i++) {
      const r = 240 + Math.random() * 120;
      const t = Math.random() * TAU;
      const p = Math.acos(Math.random());
      starPos[i * 3] = Math.sin(p) * Math.cos(t) * r;
      starPos[i * 3 + 1] = Math.abs(Math.cos(p)) * r * 0.8 + 10;
      starPos[i * 3 + 2] = Math.sin(p) * Math.sin(t) * r;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const stars = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({
        color: 0x9fd8ff,
        size: 1.5,
        transparent: true,
        opacity: 0.85,
        map: sparkTex,
        depthWrite: false,
        fog: false,
      }),
    );
    scene.add(stars);

    // --- lighting ---
    scene.add(new THREE.HemisphereLight(0x9ecbff, 0x0a1022, 1.15));
    const sun = new THREE.DirectionalLight(0xdfeeff, 2.5);
    sun.position.set(26, 54, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -58;
    sc.right = 58;
    sc.top = 60;
    sc.bottom = -60;
    sc.near = 1;
    sc.far = 160;
    sun.shadow.bias = -0.0007;
    sun.shadow.normalBias = 0.02;
    scene.add(sun);

    // team lights behind each goal
    this.blueLight = new THREE.PointLight(0x2f9dff, 260, 55, 2);
    this.blueLight.position.set(0, 6, -FIELD.halfL + 3);
    scene.add(this.blueLight);
    this.orangeLight = new THREE.PointLight(0xff7b1c, 260, 55, 2);
    this.orangeLight.position.set(0, 6, FIELD.halfL - 3);
    scene.add(this.orangeLight);

    // --- pitch ---
    const fieldTex = makeFieldTexture();
    const pitch = new THREE.Mesh(
      new THREE.PlaneGeometry(FIELD.halfW * 2, FIELD.halfL * 2),
      new THREE.MeshStandardMaterial({
        map: fieldTex,
        emissive: 0xffffff,
        emissiveMap: fieldTex,
        emissiveIntensity: 0.55,
        metalness: 0.45,
        roughness: 0.42,
      }),
    );
    pitch.rotation.x = -Math.PI / 2;
    pitch.receiveShadow = true;
    scene.add(pitch);

    // dark surround so the pitch floats in space
    const surround = new THREE.Mesh(
      new THREE.PlaneGeometry(400, 400),
      new THREE.MeshStandardMaterial({ color: 0x060c18, metalness: 0.3, roughness: 0.9 }),
    );
    surround.rotation.x = -Math.PI / 2;
    surround.position.y = -0.06;
    scene.add(surround);

    const outerGrid = new THREE.Mesh(
      new THREE.PlaneGeometry(420, 420),
      new THREE.MeshBasicMaterial({
        map: canvasTexture(256, 256, (ctx, w, h) => {
          ctx.clearRect(0, 0, w, h);
          ctx.strokeStyle = 'rgba(90,190,255,0.55)';
          ctx.lineWidth = 2;
          for (let i = 0; i <= w; i += 32) {
            ctx.beginPath();
            ctx.moveTo(i, 0);
            ctx.lineTo(i, h);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, i);
            ctx.lineTo(w, i);
            ctx.stroke();
          }
        }, { repeat: [26, 26] }),
        transparent: true,
        opacity: 0.1,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      }),
    );
    outerGrid.rotation.x = -Math.PI / 2;
    outerGrid.position.y = -0.04;
    scene.add(outerGrid);

    // glowing rim
    const rimMat = new THREE.MeshBasicMaterial({ color: 0x35c8ff });
    const rimGeoX = new THREE.BoxGeometry(FIELD.halfW * 2 + 0.4, 0.08, 0.16);
    const rimGeoZ = new THREE.BoxGeometry(0.16, 0.08, FIELD.halfL * 2 + 0.4);
    for (const sz of [-1, 1]) {
      const rim = new THREE.Mesh(rimGeoX, rimMat);
      rim.position.set(0, 0.04, sz * FIELD.halfL);
      scene.add(rim);
    }
    for (const sx of [-1, 1]) {
      const rim = new THREE.Mesh(rimGeoZ, rimMat);
      rim.position.set(sx * FIELD.halfW, 0.04, 0);
      scene.add(rim);
    }

    // --- walls ---
    const wallTex = makeWallTexture();
    this.wallTex = wallTex;
    const wallMat = new THREE.MeshBasicMaterial({
      map: wallTex,
      color: 0x7fd6ff,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    const wallGeoZ = new THREE.PlaneGeometry(FIELD.halfW * 2, FIELD.height);
    const wallGeoX = new THREE.PlaneGeometry(FIELD.halfL * 2, FIELD.height);
    for (const sz of [-1, 1]) {
      const wall = new THREE.Mesh(wallGeoZ, wallMat);
      wall.position.set(0, FIELD.height / 2, sz * FIELD.halfL);
      scene.add(wall);
    }
    for (const sx of [-1, 1]) {
      const wall = new THREE.Mesh(wallGeoX, wallMat);
      wall.rotation.y = Math.PI / 2;
      wall.position.set(sx * FIELD.halfW, FIELD.height / 2, 0);
      scene.add(wall);
    }

    // wall tops + corner posts
    const topMat = new THREE.MeshBasicMaterial({ color: 0x59d8ff, transparent: true, opacity: 0.85 });
    for (const sz of [-1, 1]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(FIELD.halfW * 2, 0.18, 0.3), topMat);
      bar.position.set(0, FIELD.height, sz * FIELD.halfL);
      scene.add(bar);
    }
    for (const sx of [-1, 1]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.18, FIELD.halfL * 2), topMat);
      bar.position.set(sx * FIELD.halfW, FIELD.height, 0);
      scene.add(bar);
    }

    // --- goals ---
    this.buildGoal(1, TEAM_COLORS.orange);
    this.buildGoal(-1, TEAM_COLORS.blue);

    // --- boost pads ---
    this.padViews = new Map();
    for (const pad of BOOST_PADS) this.padViews.set(pad, this.buildPad(pad));

    // --- ball ---
    this.buildBall();

    // --- player marker ---
    this.playerRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.78, 0.045, 6, 36),
      new THREE.MeshBasicMaterial({
        color: 0x9ef2ff,
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.playerRing.rotation.x = -Math.PI / 2;
    this.playerRing.visible = false;
    scene.add(this.playerRing);
  }

  buildGoal(side, color) {
    const z = side * FIELD.halfL;
    const frameMat = new THREE.MeshBasicMaterial({ color });

    const addGlow = (px, py, sx, sy, opacity = 0.85) => {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowTex,
          color,
          transparent: true,
          opacity,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      sprite.scale.set(sx, sy, 1);
      sprite.position.set(px, py, z);
      this.scene.add(sprite);
      return sprite;
    };

    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.6, FIELD.goalHeight, 0.6), frameMat);
      post.position.set(sx * FIELD.goalHalfW, FIELD.goalHeight / 2, z);
      this.scene.add(post);
      addGlow(sx * FIELD.goalHalfW, FIELD.goalHeight / 2, 5.5, 10, 0.45);
    }
    const bar = new THREE.Mesh(new THREE.BoxGeometry(FIELD.goalHalfW * 2 + 0.6, 0.6, 0.6), frameMat);
    bar.position.set(0, FIELD.goalHeight, z);
    this.scene.add(bar);
    addGlow(0, FIELD.goalHeight, 17, 4.5, 0.5);

    // net
    const netTex = makeNetTexture();
    const netMat = new THREE.MeshBasicMaterial({
      map: netTex,
      color,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const back = new THREE.Mesh(new THREE.PlaneGeometry(FIELD.goalHalfW * 2, FIELD.goalHeight), netMat);
    back.position.set(0, FIELD.goalHeight / 2, z + side * FIELD.goalDepth);
    this.scene.add(back);

    for (const sx of [-1, 1]) {
      const sideNet = new THREE.Mesh(new THREE.PlaneGeometry(FIELD.goalDepth, FIELD.goalHeight), netMat);
      sideNet.rotation.y = Math.PI / 2;
      sideNet.position.set(sx * FIELD.goalHalfW, FIELD.goalHeight / 2, z + (side * FIELD.goalDepth) / 2);
      this.scene.add(sideNet);
    }
    const topNet = new THREE.Mesh(new THREE.PlaneGeometry(FIELD.goalHalfW * 2, FIELD.goalDepth), netMat);
    topNet.rotation.x = -Math.PI / 2;
    topNet.position.set(0, FIELD.goalHeight, z + (side * FIELD.goalDepth) / 2);
    this.scene.add(topNet);

    // team-coloured glow inside the mouth so the goal reads from across the pitch
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(FIELD.goalHalfW * 2 - 0.6, FIELD.goalHeight - 0.6),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.16,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    panel.position.set(0, FIELD.goalHeight / 2, z + side * (FIELD.goalDepth - 0.6));
    this.scene.add(panel);

    const floorGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(FIELD.goalHalfW * 2 + 2, 10),
      new THREE.MeshBasicMaterial({
        map: glowTex,
        color,
        transparent: true,
        opacity: 0.14,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    floorGlow.rotation.x = -Math.PI / 2;
    floorGlow.position.set(0, 0.05, z - side * 5);
    this.scene.add(floorGlow);

    const light = new THREE.PointLight(color, 220, 55, 2);
    light.position.set(0, 9, z - side * 6);
    this.scene.add(light);
  }

  buildPad(pad) {
    const group = new THREE.Group();
    const color = pad.big ? 0xffc34d : 0x6ff0ff;
    const radius = pad.big ? 2.1 : 1.35;

    const base = new THREE.Mesh(
      new THREE.CircleGeometry(radius, 6),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.16,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    base.rotation.x = -Math.PI / 2;
    base.position.y = 0.03;
    group.add(base);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(radius * 0.82, radius, 6),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.04;
    group.add(ring);

    const orb = new THREE.Mesh(
      new THREE.OctahedronGeometry(pad.big ? 0.55 : 0.36),
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: color,
        emissiveIntensity: 2,
        metalness: 0.4,
        roughness: 0.2,
      }),
    );
    orb.position.y = pad.big ? 1.5 : 1.1;
    group.add(orb);

    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTex,
        color,
        transparent: true,
        opacity: 0.75,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    halo.scale.setScalar(radius * 3.4);
    halo.position.y = orb.position.y;
    group.add(halo);

    group.position.set(pad.x, 0, pad.z);
    this.scene.add(group);
    return { group, ring, orb, halo, radius };
  }

  buildBall() {
    const group = new THREE.Group();
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(FIELD.ballRadius * 0.97, 32, 24),
      new THREE.MeshStandardMaterial({
        color: 0x0b1a30,
        emissive: 0x2a86b8,
        emissiveIntensity: 0.9,
        metalness: 0.65,
        roughness: 0.3,
      }),
    );
    core.castShadow = true;
    group.add(core);

    const wire = new THREE.Mesh(
      new THREE.IcosahedronGeometry(FIELD.ballRadius * 1.015, 1),
      new THREE.MeshBasicMaterial({
        color: 0x9beaff,
        wireframe: true,
        transparent: true,
        opacity: 0.75,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    group.add(wire);

    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTex,
        color: 0x63d8ff,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    halo.scale.set(16, 16, 1);
    group.add(halo);

    const light = new THREE.PointLight(0x65d8ff, 130, 30, 2);
    group.add(light);

    this.ballGroup = group;
    this.ballCore = core;
    this.ballWire = wire;
    this.ballHalo = halo;
    this.ballLight = light;
    this.scene.add(group);
  }

  addCar(car) {
    const view = new CarView(car.team);
    this.scene.add(view.group);
    return view;
  }

  removeCar(view) {
    view.dispose(this.scene);
  }

  update(dt, time) {
    this.time = time;
    this.wallTex.offset.y = (time * 0.06) % 1;
    this.blueLight.intensity = 240 + Math.sin(time * 2.1) * 50;
    this.orangeLight.intensity = 240 + Math.cos(time * 1.7) * 50;

    // pads
    for (const pad of BOOST_PADS) {
      const view = this.padViews.get(pad);
      if (!view) continue;
      view.ring.rotation.z = time * (pad.big ? 0.9 : 1.4);
      view.orb.rotation.y = time * 1.6;
      view.orb.position.y = (pad.big ? 1.5 : 1.1) + Math.sin(time * 2 + pad.x) * 0.18;
      view.halo.position.y = view.orb.position.y;
      const pulse = 0.65 + Math.sin(time * 3 + pad.z) * 0.2;
      view.halo.material.opacity = pulse;
      view.ring.material.opacity = view.group.visible ? 0.55 + pulse * 0.35 : 0;
    }

    // shockwaves
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.shockwaves[i];
      sw.life -= dt;
      const t = 1 - sw.life / sw.maxLife;
      sw.mesh.scale.setScalar(1 + t * 9);
      sw.mesh.material.opacity = Math.max(0, (1 - t) * 0.85);
      if (sw.life <= 0) {
        this.scene.remove(sw.mesh);
        sw.mesh.geometry.dispose();
        sw.mesh.material.dispose();
        this.shockwaves.splice(i, 1);
      }
    }
  }

  spawnShockwave(pos, color) {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1.15, 48),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    mesh.position.copy(pos);
    mesh.lookAt(camera.position);
    this.scene.add(mesh);
    this.shockwaves.push({ mesh, life: 0.9, maxLife: 0.9 });
  }

  updateBall(ball, dt) {
    this.ballGroup.position.copy(ball.pos);
    const angle = ball.spinSpeed * dt;
    if (angle > 0) {
      this.ballWire.rotateOnWorldAxis(ball.spinAxis, angle);
      this.ballCore.rotateOnWorldAxis(ball.spinAxis, angle);
    }
    const pulse = 0.5 + Math.sin(this.time * 5) * 0.12;
    this.ballHalo.material.opacity = pulse;
    this.ballLight.intensity = 70 + pulse * 60;
    this.ballHalo.scale.setScalar(12 + pulse * 2);
  }

  setPlayerRing(pos, visible) {
    this.playerRing.visible = visible;
    if (!visible) return;
    this.playerRing.position.set(pos.x, 0.07, pos.z);
    const s = 1 + Math.sin(this.time * 5) * 0.05;
    this.playerRing.scale.setScalar(s);
  }
}

// ---------------------------------------------------------------------------
// audio
// ---------------------------------------------------------------------------
class GameAudio {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.muted = false;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    const master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    this.master = master;

    // engine hum
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    this.engineFilter = filter;
    const engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    filter.connect(engineGain);
    engineGain.connect(master);
    this.engineGain = engineGain;

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 52;
    osc.connect(filter);
    osc.start();
    this.engineOsc = osc;

    const sub = ctx.createOscillator();
    sub.type = 'square';
    sub.frequency.value = 26;
    sub.connect(filter);
    sub.start();
    this.engineSub = sub;

    // boost noise
    this.noiseBuf = this.makeNoise(2);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1400;
    bp.Q.value = 1.1;
    const ng = ctx.createGain();
    ng.gain.value = 0;
    src.connect(bp);
    bp.connect(ng);
    ng.connect(master);
    src.start();
    this.boostGain = ng;
    this.boostFilter = bp;
    this.ready = true;
  }

  makeNoise(seconds) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  tone(freq, dur, type = 'sine', vol = 0.2, slideTo = null, when = 0) {
    if (!this.ready || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(vol, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }

  noiseBurst(power = 1, dur = 0.3, freq = 900) {
    if (!this.ready || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(Math.min(0.6, power), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  engine(speed, boosting, active) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const s = Math.min(1, Math.abs(speed) / 42);
    this.engineGain.gain.setTargetAtTime(active ? 0.035 + s * 0.07 : 0, t, 0.12);
    this.engineOsc.frequency.setTargetAtTime(48 + s * 140, t, 0.12);
    this.engineSub.frequency.setTargetAtTime(24 + s * 40, t, 0.12);
    this.engineFilter.frequency.setTargetAtTime(340 + s * 1500, t, 0.12);
    this.boostGain.gain.setTargetAtTime(boosting ? 0.13 : 0, t, 0.06);
  }

  hit(power) {
    const p = clamp(power / 34, 0.05, 0.55);
    this.noiseBurst(p, 0.25, 700 + power * 24);
    this.tone(85 + Math.min(70, power), 0.22, 'sine', Math.min(0.3, p * 0.6), 45);
  }

  bump() {
    this.noiseBurst(0.18, 0.18, 420);
  }

  jump() {
    this.tone(300, 0.12, 'triangle', 0.1, 520);
  }

  flip() {
    this.tone(180, 0.2, 'sawtooth', 0.08, 620);
  }

  pickup(big = false) {
    this.tone(big ? 660 : 880, 0.12, 'triangle', big ? 0.16 : 0.09, big ? 1320 : 1180);
  }

  beep(high = false) {
    this.tone(high ? 880 : 440, 0.12, 'square', 0.08);
  }

  goal() {
    if (!this.ready) return;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((n, i) => this.tone(n, 0.5, 'triangle', 0.16, null, i * 0.09));
    this.tone(130.8, 0.9, 'sine', 0.22, 65);
    this.noiseBurst(0.25, 1.1, 1600);
  }

  whistle() {
    this.tone(1900, 0.18, 'sine', 0.12, 2100);
    this.tone(1900, 0.3, 'sine', 0.1, 1600, 0.2);
  }
}

// ---------------------------------------------------------------------------
// input
// ---------------------------------------------------------------------------
const keys = new Set();
let pointerBoost = false;
const touch = { active: false, throttle: 0, steer: 0, jump: false, boost: false, drift: false };

window.addEventListener('keydown', (e) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
  keys.add(e.code);
  if (e.code === 'Escape') game.togglePause();
  if (e.code === 'KeyC') game.toggleBallCam();
  if (e.code === 'Tab') game.showScoreboard(true);
  if (e.code === 'Enter') game.enterPressed();
  if (e.code === 'KeyM') game.toggleMute();
});
window.addEventListener('keyup', (e) => {
  keys.delete(e.code);
  if (e.code === 'Tab') game.showScoreboard(false);
});
window.addEventListener('blur', () => {
  keys.clear();
  pointerBoost = false;
});
canvas.addEventListener('pointerdown', (e) => {
  if (e.button === 0) pointerBoost = true;
  if (e.pointerType === 'touch') pointerBoost = true;
});
window.addEventListener('pointerup', () => {
  pointerBoost = false;
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

function setupTouchControls() {
  const isTouch = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  if (!isTouch) return;
  $('#touch').classList.remove('hidden');

  const stick = $('#stick');
  const knob = $('#stick-knob');
  let stickId = null;
  const updateStick = (e) => {
    const r = stick.getBoundingClientRect();
    let dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    let dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > 1) {
      dx /= len;
      dy /= len;
    }
    knob.style.transform = `translate(${dx * 34}px, ${dy * 34}px)`;
    touch.steer = Math.abs(dx) > 0.15 ? dx : 0;
    touch.throttle = Math.abs(dy) > 0.15 ? -dy : 0;
  };
  stick.addEventListener('pointerdown', (e) => {
    stickId = e.pointerId;
    stick.setPointerCapture(e.pointerId);
    updateStick(e);
  });
  stick.addEventListener('pointermove', (e) => {
    if (e.pointerId === stickId) updateStick(e);
  });
  const release = (e) => {
    if (e.pointerId !== stickId) return;
    stickId = null;
    touch.steer = 0;
    touch.throttle = 0;
    knob.style.transform = 'translate(0px, 0px)';
  };
  stick.addEventListener('pointerup', release);
  stick.addEventListener('pointercancel', release);

  document.querySelectorAll('[data-touch-action]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      if (btn.dataset.touchAction === 'pause') game.togglePause();
      if (btn.dataset.touchAction === 'cam') game.toggleBallCam();
    });
  });

  document.querySelectorAll('[data-touch]').forEach((btn) => {
    const key = btn.dataset.touch;
    const on = (e) => {
      e.preventDefault();
      touch[key] = true;
    };
    const off = (e) => {
      e.preventDefault();
      touch[key] = false;
    };
    btn.addEventListener('pointerdown', on);
    btn.addEventListener('pointerup', off);
    btn.addEventListener('pointercancel', off);
    btn.addEventListener('pointerleave', off);
  });
}

// ---------------------------------------------------------------------------
// game
// ---------------------------------------------------------------------------
class Game {
  constructor() {
    this.world = new World(scene);
    this.audio = new GameAudio();
    this.ball = new Ball();
    this.pads = BOOST_PADS.map((p) => ({ ...p, timer: 0, view: this.world.padViews.get(p) }));
    this.cars = [];
    this.carViews = new Map();
    this.player = null;
    this.score = { blue: 0, orange: 0 };
    this.mode = '1v1';
    this.difficulty = 'pro';
    this.phase = 'menu';
    this.prevPhase = 'playing';
    this.timeLeft = 180;
    this.overtime = false;
    this.countdown = 0;
    this.goalTimer = 0;
    this.lastScorer = null;
    this.accum = 0;
    this.time = 0;
    this.camPos = new THREE.Vector3(0, 16, 34);
    this.camLook = new THREE.Vector3(0, 2, 0);
    this.camShake = 0;
    this.ballCam = false;
    this.centerTimer = 0;
    this.bannerTimer = 0;
    this.hudAcc = 0;
    this.scoreboardAcc = 0;
    this.trailAcc = 0;
    this.skill = { rookie: 0.62, pro: 0.84, allstar: 1 };
    this.isTouch = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this.lastCount = 4;

    this.menuScreen = $('#menu');
    this.pauseScreen = $('#pause');
    this.resultScreen = $('#result');
    this.hud = $('#hud');
    this.touchRoot = $('#touch');

    this.bindUI();
    this.setAttract();
  }

  // -- UI wiring ------------------------------------------------------------
  bindUI() {
    document.querySelectorAll('#mode-seg button').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#mode-seg button').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.mode = btn.dataset.mode;
      });
    });
    document.querySelectorAll('#diff-seg button').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#diff-seg button').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.difficulty = btn.dataset.diff;
      });
    });
    $('#btn-play').addEventListener('click', () => this.startMatch());
    $('#btn-resume').addEventListener('click', () => this.togglePause());
    $('#btn-quit').addEventListener('click', () => this.quitToMenu());
    $('#btn-again').addEventListener('click', () => this.startMatch());
    $('#btn-menu').addEventListener('click', () => this.quitToMenu());
  }

  showScreen(screen) {
    for (const el of [this.menuScreen, this.pauseScreen, this.resultScreen]) {
      el.classList.add('hidden');
    }
    const showHud = screen === 'hud';
    this.hud.classList.toggle('hidden', !showHud);
    if (screen && !showHud) screen.classList.remove('hidden');
    if (this.touchRoot) this.touchRoot.classList.toggle('hidden', !(showHud && this.isTouch));
  }

  // -- match lifecycle ------------------------------------------------------
  setAttract() {
    this.phase = 'menu';
    this.player = null;
    this.clearCars();
    this.ball.reset(0, 0);
    this.camPos.set(0, 15, 34);
    this.camLook.set(0, 3, 0);
    this.showScreen(this.menuScreen);
  }

  startMatch() {
    this.audio.init();
    this.audio.whistle();
    this.clearCars();

    this.score = { blue: 0, orange: 0 };
    this.timeLeft = 180;
    this.overtime = false;
    this.lastScorer = null;
    this.centerTimer = 0;
    this.bannerTimer = 0;
    this.camShake = 0;
    this.ballCam = false;
    $('#cam-flag').classList.add('hidden');
    this.accum = 0;

    const skill = this.skill[this.difficulty] ?? 0.84;
    const player = new Car('blue', false, 1);
    player.name = 'YOU';
    this.player = player;
    const cars = [player];
    if (this.mode === '2v2') {
      const mate = new Car('blue', true, skill * 0.96);
      mate.name = 'MATE';
      cars.push(mate);
    }
    const botCount = this.mode === '2v2' ? 2 : 1;
    for (let i = 0; i < botCount; i++) {
      const bot = new Car('orange', true, skill);
      bot.name = `BOT ${i + 1}`;
      cars.push(bot);
    }
    this.cars = cars;
    for (const car of cars) this.carViews.set(car, this.world.addCar(car));

    this.resetPositions();
    this.phase = 'countdown';
    this.countdown = 3.2;
    this.center('READY', 1.2);

    this.lastCount = 4;
    this.showScreen('hud');
    this.updateHUD(0);
    this.audio.engine(0, false, true);
  }

  clearCars() {
    for (const view of this.carViews.values()) {
      this.world.removeCar(view);
    }
    this.carViews.clear();
    this.cars = [];
    this.world.setPlayerRing(new THREE.Vector3(), false);
  }

  resetPositions() {
    const blueCars = this.cars.filter((c) => c.team === 'blue');
    const orangeCars = this.cars.filter((c) => c.team === 'orange');
    const blueSpots = blueCars.length > 1 ? [[-7, -27, Math.PI], [7, -27, Math.PI]] : [[0, -28, Math.PI]];
    const orangeSpots = orangeCars.length > 1 ? [[7, 27, 0], [-7, 27, 0]] : [[0, 28, 0]];
    blueCars.forEach((c, i) => {
      const s = blueSpots[i % blueSpots.length];
      c.reset(s[0], s[1], s[2]);
    });
    orangeCars.forEach((c, i) => {
      const s = orangeSpots[i % orangeSpots.length];
      c.reset(s[0], s[1], s[2]);
    });
    this.ball.reset(0, 0);
    for (const pad of this.pads) {
      pad.timer = 0;
      pad.view.group.visible = true;
    }
    this.world.setPlayerRing(new THREE.Vector3(), false);
  }

  kickoff() {
    this.resetPositions();
    this.phase = 'countdown';
    this.countdown = 2.4;
    this.lastCount = 4;
    this.center('KICKOFF', 1);
  }

  onGoal(team) {
    this.score[team]++;
    this.lastScorer = team;
    this.phase = 'goal';
    this.goalTimer = 2;
    this.camShake = 1.1;
    this.hud.classList.remove('hidden');

    const goalZ = team === 'blue' ? FIELD.halfL : -FIELD.halfL;
    const pos = new THREE.Vector3(this.ball.pos.x * 0.8, Math.max(2.4, this.ball.pos.y), goalZ);
    this.world.sparks.spawn(pos, 170, new THREE.Color(TEAM_COLORS[team]), 26, 1.5, 8);
    this.world.sparks.spawn(pos, 60, new THREE.Color(0xffffff), 18, 1.1, 5);
    this.world.spawnShockwave(pos, TEAM_COLORS[team]);
    this.world.spawnShockwave(pos, 0xffffff);
    this.audio.goal();
    this.banner(team === 'blue' ? 'BLUE SCORES!' : 'ORANGE SCORES!', team);
    flash(team);
  }

  endMatch() {
    this.phase = 'result';
    this.audio.whistle();
    const playerWon = this.score.blue > this.score.orange;
    const draw = this.score.blue === this.score.orange;
    $('#result-kicker').textContent = this.overtime ? 'OVERTIME WINNER' : 'FULL TIME';
    $('#result-title').textContent = draw ? 'DRAW' : playerWon ? 'VICTORY' : 'DEFEAT';
    $('#result-title').className = playerWon ? 'win' : draw ? 'draw' : 'lose';
    $('#result-score').textContent = `${this.score.blue} — ${this.score.orange}`;
    this.showScreen(this.resultScreen);
    if (this.touchRoot) this.touchRoot.classList.add('hidden');
    this.audio.engine(0, false, false);
  }

  quitToMenu() {
    this.audio.engine(0, false, false);
    this.setAttract();
  }

  enterPressed() {
    if (this.phase === 'menu' || this.phase === 'result') this.startMatch();
  }

  togglePause() {
    if (this.phase === 'paused') {
      this.phase = this.prevPhase || 'playing';
      this.showScreen('hud');
      this.audio.engine(this.player ? this.player.speed : 0, false, true);
      return;
    }
    if (!['playing', 'overtime', 'countdown', 'goal'].includes(this.phase)) return;
    this.prevPhase = this.phase;
    this.phase = 'paused';
    this.showScreen(this.pauseScreen);
    this.audio.engine(0, false, false);
  }

  toggleBallCam() {
    if (!this.player) return;
    this.ballCam = !this.ballCam;
    $('#cam-flag').classList.toggle('hidden', !this.ballCam);
  }

  toggleMute() {
    this.audio.muted = !this.audio.muted;
    if (this.audio.ready) this.audio.master.gain.value = this.audio.muted ? 0 : 0.5;
  }

  // -- HUD helpers ----------------------------------------------------------
  center(text, seconds = 1) {
    const el = $('#center-msg');
    el.textContent = text;
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
    this.centerTimer = seconds;
    el.style.opacity = '1';
  }

  banner(text, team) {
    const el = $('#banner');
    el.textContent = text;
    el.className = team === 'blue' ? 'blue show' : 'orange show';
    this.bannerTimer = 2;
  }

  showScoreboard(show) {
    const el = $('#scoreboard');
    if (!el) return;
    el.classList.toggle('hidden', !show);
    if (show) this.renderScoreboard();
  }

  renderScoreboard() {
    const body = $('#sb-body');
    const rows = this.cars
      .map((car) => {
        const boost = Math.round(car.boost);
        const cls = car.team === 'blue' ? 'blue' : 'orange';
        const you = car === this.player ? ' you' : '';
        return `<div class="sb-row ${cls}${you}">
          <span class="sb-name">${car.name || car.team}</span>
          <span class="sb-boost"><i style="width:${boost}%"></i></span>
          <span class="sb-num">${boost}</span>
        </div>`;
      })
      .join('');
    body.innerHTML = rows || '<div class="sb-row">No players</div>';
  }

  updateHUD(dt) {
    const player = this.player;
    if (!player) return;
    $('#score-blue').textContent = this.score.blue;
    $('#score-orange').textContent = this.score.orange;

    const secs = Math.max(0, Math.ceil(this.timeLeft));
    const clock = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    $('#timer').textContent = this.overtime ? 'OT' : clock;
    const label =
      this.phase === 'countdown'
        ? 'KICKOFF'
        : this.phase === 'paused'
          ? 'PAUSED'
          : this.phase === 'result'
            ? 'FULL TIME'
            : this.overtime
              ? 'SUDDEN DEATH'
              : 'LIVE';
    $('#clock-label').textContent = label;

    const boost = Math.round(player.boost);
    $('#boost-ring').style.setProperty('--boost', boost);
    $('#boost-value').textContent = boost;
    $('#speed-value').textContent = Math.round(Math.abs(player.speed) * 3.6);

    if (this.centerTimer > 0) {
      this.centerTimer -= dt;
      if (this.centerTimer <= 0) $('#center-msg').style.opacity = '0';
    }
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) $('#banner').classList.remove('show');
    }

    this.scoreboardAcc += dt;
    if (!$('#scoreboard').classList.contains('hidden') && this.scoreboardAcc > 0.2) {
      this.scoreboardAcc = 0;
      this.renderScoreboard();
    }
  }

  // -- simulation -----------------------------------------------------------
  playerInput() {
    const k = keys;
    let throttle = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    let steer = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    let jump = k.has('Space');
    let boost = pointerBoost;
    let drift = k.has('ShiftLeft') || k.has('ShiftRight');
    if (touch.active || touch.jump || touch.boost || touch.drift) {
      if (Math.abs(touch.steer) > 0.12 || Math.abs(touch.throttle) > 0.12) {
        throttle = touch.throttle;
        steer = touch.steer;
      }
      jump = jump || touch.jump;
      boost = boost || touch.boost;
      drift = drift || touch.drift;
    }
    return { throttle, steer, jump, boost, drift, pitch: throttle, roll: steer };
  }

  physics(h) {
    const cars = this.cars;
    for (const team of ['blue', 'orange']) {
      assignRoles(cars.filter((c) => c.team === team), this.ball);
    }
    for (const car of cars) {
      const input = car.isBot ? computeAIInput(car, this.ball, cars, h) : this.playerInput();
      car.step(h, input);
      if (car === this.player) {
        if (car.justJumped) this.audio.jump();
        if (car.justFlipped) this.audio.flip();
      }
    }
    collideCars(cars);

    for (const car of cars) {
      const cooldown = car.hitCooldown;
      const hit = collideCarBall(car, this.ball);
      if (hit > 3 && cooldown <= 0) {
        const distToPlayer = this.player ? car.pos.distanceTo(this.player.pos) : 999;
        const near = distToPlayer < 40;
        if (near) this.audio.hit(hit);
        this.camShake = Math.max(this.camShake, Math.min(0.5, hit * 0.012) * (car === this.player ? 1 : 0.4));
        this.world.sparks.spawn(
          new THREE.Vector3(this.ball.pos.x, this.ball.pos.y, this.ball.pos.z),
          Math.min(26, 4 + Math.round(hit * 0.6)),
          new THREE.Color(TEAM_COLORS[car.team]),
          Math.min(18, 5 + hit * 0.4),
          0.5,
        );
      }
    }

    const goal = this.ball.step(h);
    if (goal) this.onGoal(goal);

    // boost pads
    for (const pad of this.pads) {
      if (pad.timer > 0) {
        pad.timer -= h;
        if (pad.timer <= 0) pad.view.group.visible = true;
        continue;
      }
      for (const car of cars) {
        if (car.pos.y > 3.2) continue;
        const d = Math.hypot(car.pos.x - pad.x, car.pos.z - pad.z);
        if (d < (pad.big ? 3.1 : 2.4)) {
          car.boost = Math.min(100, car.boost + (pad.big ? 100 : 16));
          pad.timer = pad.big ? 9 : 4;
          pad.view.group.visible = false;
          if (car === this.player) this.audio.pickup(pad.big);
          break;
        }
      }
    }
  }

  // -- per-frame update -----------------------------------------------------
  update(dt) {
    this.time += dt;
    this.world.update(dt, this.time);
    this.world.sparks.update(dt);

    if (this.phase === 'countdown') {
      this.countdown -= dt;
      const n = Math.ceil(this.countdown);
      if (this.countdown <= 0) {
        this.phase = 'playing';
        this.center('GO!', 0.7);
        this.audio.beep(true);
      } else if (n !== this.lastCount) {
        this.lastCount = n;
        this.center(String(n), 1);
        this.audio.beep(false);
      }
    } else if (this.phase === 'playing') {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        if (this.score.blue === this.score.orange) {
          this.overtime = true;
          this.phase = 'overtime';
          this.center('OVERTIME', 2);
          this.audio.beep(true);
        } else {
          this.endMatch();
        }
      }
    } else if (this.phase === 'goal') {
      this.goalTimer -= dt;
      if (this.goalTimer <= 0) {
        if (this.overtime || this.timeLeft <= 0) this.endMatch();
        else this.kickoff();
      }
    }

    // fixed-step physics
    if (this.phase === 'playing' || this.phase === 'overtime') {
      this.accum += Math.min(dt, 0.1);
      const h = 1 / 120;
      let steps = 0;
      while (this.accum >= h && steps < 8) {
        this.physics(h);
        this.accum -= h;
        steps++;
        if (this.phase !== 'playing' && this.phase !== 'overtime') break;
      }
      if (steps === 8) this.accum = 0;
    } else {
      this.accum = 0;
    }

    // sync views
    for (const [car, view] of this.carViews) view.update(car);
    this.world.updateBall(this.ball, dt);
    if (this.player) this.world.setPlayerRing(this.player.pos, true);

    // trails
    this.trailAcc += dt;
    if (this.trailAcc > 0.02) {
      this.trailAcc = 0;
      for (const car of this.cars) {
        if (!car.boosting) continue;
        const fwd = car.forward(new THREE.Vector3());
        const p = car.pos.clone().addScaledVector(fwd, -1.9);
        p.y = Math.max(0.35, p.y);
        this.world.sparks.spawn(p, 2, new THREE.Color(TEAM_COLORS[car.team]), 3.2, 0.32);
      }
      if (this.ball.vel.length() > 22) {
        this.world.sparks.spawn(this.ball.pos, 1, new THREE.Color(0x8fe8ff), 2, 0.3);
      }
    }

    this.updateCamera(dt);
    this.updateHUD(dt);

    if (this.player) {
      this.audio.engine(
        this.player.speed,
        this.player.boosting,
        this.phase === 'playing' || this.phase === 'overtime' || this.phase === 'countdown',
      );
    }
  }

  updateCamera(dt) {
    const p = this.player;
    const desired = new THREE.Vector3();
    const look = new THREE.Vector3();

    if (this.phase === 'menu' || !p) {
      const t = this.time * 0.1;
      desired.set(Math.sin(t) * 26, 8.5 + Math.sin(t * 0.6) * 2, Math.cos(t) * 26);
      look.set(Math.sin(t * 0.5) * 4, 4, Math.cos(t * 0.5) * 4);
    } else if (this.phase === 'goal') {
      const gz = this.lastScorer === 'blue' ? FIELD.halfL : -FIELD.halfL;
      desired.set(clamp(this.ball.pos.x * 0.8, -16, 16), 11, gz - Math.sign(gz) * 28);
      look.set(this.ball.pos.x * 0.4, 4.5, gz * 0.92);
    } else {
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, p.yaw, 0, 'YXZ'));
      const pullBack = Math.min(1.8, Math.abs(p.speed) * 0.045);
      const offset = new THREE.Vector3(
        0,
        (this.ballCam ? 6.2 : 3.9) + pullBack * 0.35,
        (this.ballCam ? 9.8 : 9.2) + pullBack,
      ).applyQuaternion(q);
      desired.copy(p.pos).add(offset);
      desired.x = clamp(desired.x, -FIELD.halfW + 2, FIELD.halfW - 2);
      desired.z = clamp(desired.z, -FIELD.halfL + 2, FIELD.halfL - 2);
      desired.y = clamp(desired.y, 2, FIELD.height - 2);

      if (this.ballCam) {
        look.copy(this.ball.pos).lerp(p.pos, 0.32);
        look.y += 0.4;
      } else {
        const fwd = p.forward(new THREE.Vector3());
        look.copy(p.pos).addScaledVector(fwd, 6.5);
        look.y += 1.7;
        look.lerp(this.ball.pos, 0.14);
      }
    }

    const k = 1 - Math.exp(-7 * dt);
    this.camPos.lerp(desired, this.phase === 'goal' ? 1 - Math.exp(-3.5 * dt) : k);
    this.camLook.lerp(look, 1 - Math.exp(-9 * dt));

    camera.position.copy(this.camPos);
    if (this.camShake > 0.001) {
      camera.position.x += (Math.random() - 0.5) * this.camShake;
      camera.position.y += (Math.random() - 0.5) * this.camShake * 0.7;
      camera.position.z += (Math.random() - 0.5) * this.camShake;
      this.camShake *= Math.exp(-5 * dt);
    }
    camera.lookAt(this.camLook);

    const fov = 58 + (p && p.boosting ? 5 : 0) + (p ? Math.min(4, Math.abs(p.speed) * 0.08) : 0);
    camera.fov = damp(camera.fov, fov, 5, dt);
    camera.updateProjectionMatrix();
  }

  render() {
    if (renderer) renderer.render(scene, camera);
  }
}

// ---------------------------------------------------------------------------
// helpers / boot
// ---------------------------------------------------------------------------
function flash(team) {
  const el = $('#flash');
  el.className = team === 'blue' ? 'blue' : 'orange';
  el.classList.remove('go');
  void el.offsetWidth;
  el.classList.add('go');
}

const game = new Game();
setupTouchControls();

window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  if (renderer) {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
  }
});

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, Math.max(0.0001, (now - last) / 1000));
  last = now;
  game.update(dt);
  game.render();
}
if (renderer) {
  renderer.setAnimationLoop(frame);
} else {
  const loop = (now) => {
    frame(now);
    window.requestAnimationFrame(loop);
  };
  window.requestAnimationFrame(loop);
}

// expose for debugging in the console
window.__boostball = game;
