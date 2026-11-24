/**
 * renderer3d.js — the WebGL renderer. Presents the same public surface as
 * core/renderer.js (bctx, width/height, camera, drawX helpers, begin/end…)
 * so the entire UI layer, HUD, particles and floaters run unchanged on a
 * 2D overlay canvas stacked above the 3D world.
 *
 * Rendering pipeline per frame:
 *   1. GL: clear → lit pass (level mesh + actor parts) → glow pass
 *   2. Overlay 2D: world-projected sprites/particles/floaters → screen UI
 */
import { clamp } from '../core/mathx.js';
import {
  mat4, mat4Compose, mat4Multiply, mat4Translate, mat4RotateX, mat4Scale,
  hexToRgb, compileProgram, createFloatBuffer, Uniforms, acquireGL,
} from './gl.js';
import { PROGRAMS } from './shaders.js';
import { Camera3D } from './camera3d.js';
import { buildLevelMesh, buildSkirtMesh, MeshBuilder } from './level3d.js';
import { actorBank, poseFor } from './actors3d.js';

export class Renderer3D {
  /**
   * @param {HTMLCanvasElement} canvas — the GL canvas
   * @param {object} opts { uiCanvas, width, height }
   */
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.gl = acquireGL(canvas);
    if (!this.gl) throw new Error('[Renderer3D] WebGL unavailable');

    this.width = opts.width ?? 480;
    this.height = opts.height ?? 270;

    // ---- 2D overlay (all UI draws here)
    this.uiCanvas = opts.uiCanvas ?? (typeof document !== 'undefined' ? document.createElement('canvas') : null);
    if (!this.uiCanvas) throw new Error('[Renderer3D] overlay canvas required');
    this.uiCanvas.width = this.width;
    this.uiCanvas.height = this.height;
    if (this.uiCanvas !== opts.uiCanvas && this.canvas.parentNode) {
      this.uiCanvas.style.position = 'absolute';
      this.uiCanvas.style.left = this.canvas.style.left ?? '0';
      this.uiCanvas.style.top = this.canvas.style.top ?? '0';
      this.uiCanvas.style.width = this.canvas.style.width ?? `${this.width}px`;
      this.uiCanvas.style.height = this.canvas.style.height ?? `${this.height}px`;
      this.uiCanvas.style.imageRendering = 'pixelated';
      this.uiCanvas.style.pointerEvents = 'none';
      this.canvas.parentNode.insertBefore(this.uiCanvas, this.canvas.nextSibling);
    }
    this.bctx = this.uiCanvas.getContext('2d', { alpha: true });

    // ---- camera (2D-compatible surface + 3D matrices)
    this.camera = new Camera3D(this.width, this.height);

    // ---- GL programs
    const gl = this.gl;
    this.litProgram = compileProgram(gl, PROGRAMS.lit.vs, PROGRAMS.lit.fs, 'lit');
    this.glowProgram = compileProgram(gl, PROGRAMS.glow.vs, PROGRAMS.glow.fs, 'glow');
    this.litUniforms = new Uniforms(gl, this.litProgram);
    this.glowUniforms = new Uniforms(gl, this.glowProgram);

    // ---- static level mesh buffers (uploaded per level)
    this.levelBuffers = null;
    this.skirtBuffers = null;

    // ---- glow quads (portals, loot shimmer) rebuilt each frame into one buffer
    this.glowBuilder = new MeshBuilder();
    this.glowBuffer = gl.createBuffer();
    this.glowUv = [];
    this.glowUvBuffer = gl.createBuffer();
    this._glowCapacity = 0;

    // ---- scratch matrices
    this._mModel = mat4();
    this._mTmp = mat4();
    this._mTmp2 = mat4();
    this._mIdentity = mat4();

    // ---- mode & options
    this._mode = 'screen'; // 'world' | 'screen'
    this.renderScale = 1;  // quality governor shrinks the GL buffer on weak GPUs
    this.is3D = true;
    this.drawCalls = 0;
    this.time = 0;
    this.clearColor = hexToRgb('#17111f');
  }

  // ------------------------------------------------------------- sizing

  resize(cssWidth, cssHeight) {
    const scale = this.renderScale;
    const w = Math.max(64, Math.floor(this.width * scale));
    const h = Math.max(36, Math.floor(this.height * scale));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.gl.viewport(0, 0, w, h);
    if (this.uiCanvas) {
      this.uiCanvas.style.width = `${cssWidth}px`;
      this.uiCanvas.style.height = `${cssHeight}px`;
      this.uiCanvas.style.left = this.canvas.style.left ?? '0';
      this.uiCanvas.style.top = this.canvas.style.top ?? '0';
    }
  }

  setRenderScale(scale) {
    this.renderScale = clamp(scale, 0.5, 1);
    const w = Math.max(64, Math.floor(this.width * this.renderScale));
    const h = Math.max(36, Math.floor(this.height * this.renderScale));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.gl.viewport(0, 0, w, h);
  }

  // ------------------------------------------------------- level meshes

  setLevel(level) {
    const gl = this.gl;
    if (this.levelBuffers) {
      gl.deleteBuffer(this.levelBuffers.positions);
      gl.deleteBuffer(this.levelBuffers.normals);
      gl.deleteBuffer(this.levelBuffers.colors);
    }
    if (this.skirtBuffers) {
      gl.deleteBuffer(this.skirtBuffers.positions);
      gl.deleteBuffer(this.skirtBuffers.normals);
      gl.deleteBuffer(this.skirtBuffers.colors);
    }
    const mesh = buildLevelMesh(level);
    const skirt = buildSkirtMesh(level);
    this.levelBuffers = {
      positions: createFloatBuffer(gl, mesh.positions),
      normals: createFloatBuffer(gl, mesh.normals),
      colors: createFloatBuffer(gl, mesh.colors),
      vertexCount: mesh.vertexCount,
    };
    this.skirtBuffers = {
      positions: createFloatBuffer(gl, skirt.positions),
      normals: createFloatBuffer(gl, skirt.normals),
      colors: createFloatBuffer(gl, skirt.colors),
      vertexCount: skirt.vertexCount,
    };
  }

  // ------------------------------------------------------ frame control

  begin(clearColor = '#1a1220') {
    this.clearColor = hexToRgb(clearColor, [0.09, 0.07, 0.13]);
    const gl = this.gl;
    gl.viewport(0, 0, Math.floor(this.width * this.renderScale), Math.floor(this.height * this.renderScale));
    gl.clearColor(this.clearColor[0], this.clearColor[1], this.clearColor[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (this.bctx) {
      this.bctx.setTransform(1, 0, 0, 1, 0, 0);
      this.bctx.clearRect(0, 0, this.width, this.height);
    }
    this._mode = 'world';
    this.drawCalls = 0;
  }

  end() {
    this._mode = 'screen';
  }

  beginScreenSpace() {
    this._mode = 'screen';
    if (this.bctx) this.bctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  endWorldSpace() {
    // API compatibility with core/renderer.js — nothing to unwind.
  }

  // --------------------------------------------------------- 3D passes

  /**
   * Lit pass configuration: fog + light + tint feed the shader so day/night
   * and weather affect the whole 3D scene for free.
   */
  _applyLighting(tint = { color: '#000000', alpha: 0 }, exposure = 1) {
    const u = this.litUniforms;
    const gl = this.gl;
    gl.useProgram(this.litProgram);
    u.mat4('uProjection', this.camera.projection);
    u.mat4('uView', this.camera.view);
    u.mat4('uModel', this._mIdentity);
    u.vec3('uLightDir', -0.45, -0.8, -0.4);
    u.vec3('uLightColor', 0.95, 0.88, 0.72);
    u.vec3('uAmbient', 0.52, 0.5, 0.55);
    const fog = hexToRgb('#c9a86e', [0.79, 0.66, 0.43]);
    u.vec3('uFogColor', fog[0], fog[1], fog[2]);
    u.float('uFogNear', 180);
    u.float('uFogFar', 620);
    const t = hexToRgb(tint.color ?? '#000000', [0, 0, 0]);
    u.vec4('uTint', t[0], t[1], t[2], tint.alpha ?? 0);
    u.float('uExposure', exposure);
  }

  _drawLitMesh(buffers, model) {
    const gl = this.gl;
    const prog = this.litProgram;
    if (!buffers || buffers.vertexCount === 0) return;
    const u = this.litUniforms;
    if (model) u.mat4('uModel', model);
    bindAttr(gl, prog, 'aPosition', buffers.positions, 3);
    bindAttr(gl, prog, 'aNormal', buffers.normals, 3);
    bindAttr(gl, prog, 'aColor', buffers.colors, 3);
    gl.drawArrays(gl.TRIANGLES, 0, buffers.vertexCount);
    this.drawCalls += 1;
  }

  /** Draw the level geometry (skirt + tiles) with lighting applied. */
  drawLevel(tint, exposure = 1) {
    this._applyLighting(tint, exposure);
    this._drawLitMesh(this.skirtBuffers, this._mIdentity);
    this._drawLitMesh(this.levelBuffers, this._mIdentity);
  }

  /**
   * Draw one actor: iterates its parts, posing limbs from `anim`.
   * Geometry is authored around each part's joint origin; the part pivot
   * places the joint in actor-local space, then a swing rotation is applied.
   * @param {object} mesh — from ActorBank
   * @param {number} x — 2D world x
   * @param {number} z — 2D world y
   * @param {object} anim — { facing, walkPhase, walking, attackT, openT, flying, scale, y, flash }
   */
  drawActor(mesh, x, z, anim = {}) {
    const pose = poseFor(anim);
    const scale = anim.scale ?? 1;
    const facing = anim.facing ?? 1;
    const yaw = facing < 0 ? -Math.PI / 2 : Math.PI / 2;
    const baseY = anim.y ?? 0;

    // actor model matrix (world placement + facing + scale)
    mat4Compose(this._mModel, x, baseY, z, yaw, 0, 0, scale, scale, scale);

    for (const p of mesh.parts) {
      const buffers = this._partBuffers(p);
      if (!buffers) continue;
      const swing = pose[p.role] ?? 0;
      // local = Translate(pivot) · RotateX(swing)
      mat4Translate(this._mTmp, p.pivot[0], p.pivot[1], p.pivot[2]);
      if (swing !== 0) {
        mat4RotateX(this._mTmp2, swing);
        mat4Multiply(this._mTmp, this._mTmp, this._mTmp2);
      }
      mat4Multiply(this._mTmp, this._mModel, this._mTmp);
      this._drawLitMesh(buffers, this._mTmp);
    }
    void anim.flash;
  }

  /** Lazily upload a part's CPU arrays to GPU buffers (cached per part). */
  _partBuffers(p) {
    if (p._glBuffers) return p._glBuffers;
    if (!p.positions || p.vertexCount === 0) return null;
    const gl = this.gl;
    p._glBuffers = {
      positions: createFloatBuffer(gl, p.positions),
      normals: createFloatBuffer(gl, p.normals),
      colors: createFloatBuffer(gl, p.colors),
      vertexCount: p.vertexCount,
    };
    return p._glBuffers;
  }

  /** Glow pass for portals, pickups and magic. */
  beginGlow() {
    this.glowBuilder = new MeshBuilder();
    this.glowUv = [];
  }

  /** Add a camera-facing glow quad at world (x, y2d) with height offset. */
  glowQuad(x, z, size, color, yOffset = 8) {
    const [r, g, b] = hexToRgb(color, [1, 1, 1]);
    const s = size / 2;
    // vertical billboard quad (facing camera roughly along -Z)
    const p0 = [x - s, yOffset - s, z];
    const p1 = [x - s, yOffset + s, z];
    const p2 = [x + s, yOffset + s, z];
    const p3 = [x + s, yOffset - s, z];
    const c = [r, g, b];
    this.glowBuilder.tri(p0, p1, p2, c);
    this.glowBuilder.tri(p0, p2, p3, c);
    this.glowUv.push(0, 0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 0);
  }

  endGlow(tint = { color: '#000000', alpha: 0 }, pulse = 0.5) {
    const gl = this.gl;
    const arrays = this.glowBuilder.toArrays();
    if (arrays.vertexCount === 0) return;
    gl.useProgram(this.glowProgram);
    const u = this.glowUniforms;
    u.mat4('uProjection', this.camera.projection);
    u.mat4('uView', this.camera.view);
    u.mat4('uModel', this._mIdentity);
    const fog = hexToRgb('#c9a86e', [0.79, 0.66, 0.43]);
    u.vec3('uFogColor', fog[0], fog[1], fog[2]);
    u.float('uFogNear', 180);
    u.float('uFogFar', 620);
    const t = hexToRgb(tint.color ?? '#000000', [0, 0, 0]);
    u.vec4('uTint', t[0], t[1], t[2], tint.alpha ?? 0);
    u.float('uPulse', pulse);

    gl.depthMask(false);
    bindAttr(gl, this.glowProgram, 'aPosition', createFloatBuffer(gl, arrays.positions), 3);
    bindAttr(gl, this.glowProgram, 'aColor', createFloatBuffer(gl, arrays.colors), 3);
    bindAttr(gl, this.glowProgram, 'aUV', createFloatBuffer(gl, new Float32Array(this.glowUv)), 2);
    gl.drawArrays(gl.TRIANGLES, 0, arrays.vertexCount);
    gl.depthMask(true);
    this.drawCalls += 1;
  }

  // ------------------------------------------------- 2D overlay surface

  _worldToOverlay(wx, wy) {
    if (this._mode === 'screen') return { x: wx, y: wy };
    return this.camera.worldToScreen(wx, wy);
  }

  drawRect(x, y, w, h, color, alpha = 1) {
    const ctx = this.bctx;
    if (!ctx) return;
    const p = this._worldToOverlay(x, y);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fillRect(p.x, p.y, w, h);
    ctx.globalAlpha = 1;
  }

  drawRectOutline(x, y, w, h, color, lineWidth = 1) {
    const ctx = this.bctx;
    if (!ctx) return;
    const p = this._worldToOverlay(x, y);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.strokeRect(p.x + 0.5, p.y + 0.5, w - 1, h - 1);
  }

  drawCircle(x, y, radius, color, alpha = 1) {
    const ctx = this.bctx;
    if (!ctx) return;
    const p = this._worldToOverlay(x, y);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  drawLine(x1, y1, x2, y2, color, lineWidth = 1) {
    const ctx = this.bctx;
    if (!ctx) return;
    const a = this._worldToOverlay(x1, y1);
    const b = this._worldToOverlay(x2, y2);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  drawSprite(sprite, x, y, opts = {}) {
    const ctx = this.bctx;
    if (!ctx || !sprite) return;
    const p = this._worldToOverlay(x, y);
    const w = opts.w ?? sprite.width;
    const h = opts.h ?? sprite.height;
    ctx.globalAlpha = opts.alpha ?? 1;
    if (opts.flip) {
      ctx.save();
      ctx.translate(p.x + w / 2, p.y);
      ctx.scale(-1, 1);
      ctx.drawImage(sprite, -w / 2, 0, w, h);
      ctx.restore();
    } else {
      ctx.drawImage(sprite, p.x, p.y, w, h);
    }
    ctx.globalAlpha = 1;
  }

  drawSpriteRegion(sprite, sx, sy, sw, sh, dx, dy, dw = sw, dh = sh, opts = {}) {
    const ctx = this.bctx;
    if (!ctx || !sprite) return;
    const p = this._worldToOverlay(dx, dy);
    ctx.globalAlpha = opts.alpha ?? 1;
    ctx.drawImage(sprite, sx, sy, sw, sh, p.x, p.y, dw, dh);
    ctx.globalAlpha = 1;
  }

  drawText(text, x, y, opts = {}) {
    const ctx = this.bctx;
    if (!ctx) return;
    const p = this._worldToOverlay(x, y);
    const size = opts.size ?? 8;
    const bold = opts.bold ? 'bold ' : '';
    const family = opts.font ?? 'monospace';
    ctx.font = `${bold}${size}px ${family}`;
    ctx.textAlign = opts.align ?? 'left';
    ctx.textBaseline = opts.baseline ?? 'top';
    if (opts.shadow !== false) {
      ctx.fillStyle = opts.shadowColor ?? 'rgba(0,0,0,0.65)';
      ctx.fillText(String(text), p.x + 1, p.y + 1);
    }
    ctx.fillStyle = opts.color ?? '#f5e9d0';
    ctx.fillText(String(text), p.x, p.y);
  }

  measureText(text, size = 8, font, bold = false) {
    const ctx = this.bctx;
    if (!ctx) return { width: String(text).length * size * 0.6 };
    ctx.font = `${bold ? 'bold ' : ''}${size}px ${font ?? 'monospace'}`;
    return ctx.measureText(String(text));
  }

  drawTint(color, alpha = 1) {
    const ctx = this.bctx;
    if (!ctx || alpha <= 0) return;
    ctx.globalAlpha = clamp(alpha, 0, 1);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.globalAlpha = 1;
  }

  // ------- chunk-cache API (2D renderer compatibility; unused in 3D mode)
  getChunkCanvas() {
    return null;
  }

  drawChunk() {
    /* no-op in 3D mode */
  }

  invalidateChunk() {
    /* no-op in 3D mode */
  }

  get cachedChunkCount() {
    return 0;
  }
}

function bindAttr(gl, program, name, buffer, size) {
  const loc = gl.getAttribLocation(program, name);
  if (loc < 0) return;
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
}

export default Renderer3D;
