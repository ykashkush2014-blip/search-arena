/**
 * camera3d.js — fixed-angle 3/4 camera with the same public surface as the
 * 2D Camera (follow / worldToScreen / isVisible / shake fields), so particles,
 * floaters and UI code work unchanged on top of the 3D world.
 *
 * World mapping: 2D world (x, y) maps to 3D (X = x, Z = y), Y is up.
 */
import { clamp } from '../core/mathx.js';
import {
  mat4, mat4Perspective, mat4LookAt, transformPoint,
} from './gl.js';

export class Camera3D {
  constructor(viewW, viewH) {
    // 2D-compatible state (top-left convention like core/renderer Camera)
    this.x = 0;
    this.y = 0;
    this.viewW = viewW;
    this.viewH = viewH;
    this.targetX = 0;
    this.targetY = 0;
    this.smoothing = 1;
    this.shakeX = 0;
    this.shakeY = 0;
    this.bounds = null;
    this.zoom = 1;

    // 3D framing
    this.pitch = 0.92; // radians (~53°) — classic strategy-RPG angle
    this.yaw = 0.0;
    this.distance = 220;
    this.fov = (42 * Math.PI) / 180;
    this.near = 10;
    this.far = 900;

    // matrices, rebuilt once per frame
    this.projection = mat4();
    this.view = mat4();
    this.viewProj = mat4();
    this._dirty = true;
  }

  // ------------------------------------------------- 2D-compatible API

  follow(x, y, dt, smoothing = 0.12) {
    this.targetX = x - this.viewW / 2;
    this.targetY = y - this.viewH / 2;
    if (smoothing >= 1 || dt <= 0) {
      this.x = this.targetX;
      this.y = this.targetY;
    } else {
      const k = 1 - Math.pow(smoothing, dt * 60);
      this.x += (this.targetX - this.x) * k;
      this.y += (this.targetY - this.y) * k;
    }
    if (this.bounds) {
      const b = this.bounds;
      this.x = clamp(this.x, b.x, Math.max(b.x, b.x + b.w - this.viewW));
      this.y = clamp(this.y, b.y, Math.max(b.y, b.y + b.h - this.viewH));
    }
    this._dirty = true;
  }

  centerOn(x, y) {
    this.x = x - this.viewW / 2;
    this.y = y - this.viewH / 2;
    this.targetX = this.x;
    this.targetY = this.y;
    this._dirty = true;
  }

  /** World (x, y) at ground level → overlay screen pixels. */
  worldToScreen(wx, wy) {
    return this.project(wx, 0, wy);
  }

  /**
   * Inverse: overlay screen pixels → ground-plane world (x, y).
   * Solves the camera ray against the y = 0 plane.
   */
  screenToWorld(sx, sy) {
    this._rebuild();
    const ndcX = (sx / this.viewW) * 2 - 1;
    const ndcY = 1 - (sy / this.viewH) * 2;
    // reconstruct two points on the ray in world space
    const p0 = this._unproject(ndcX, ndcY, -1);
    const p1 = this._unproject(ndcX, ndcY, 1);
    const dx = p1[0] - p0[0];
    const dy = p1[1] - p0[1];
    const dz = p1[2] - p0[2];
    const t = dy !== 0 ? -p0[1] / dy : 0; // intersect y = 0
    return {
      x: p0[0] + dx * t - this.shakeX,
      y: p0[2] + dz * t - this.shakeY,
    };
  }

  isVisible(x, y, margin = 32) {
    return (
      x >= this.x - margin &&
      x <= this.x + this.viewW + margin &&
      y >= this.y - margin &&
      y <= this.y + this.viewH + margin
    );
  }

  // ------------------------------------------------------- 3D API

  /**
   * Project a world point (x = 2D x, y = height, z = 2D y) to screen pixels.
   */
  project(wx, wy, wz = 0) {
    this._rebuild();
    const [cx, cy, cw] = transformPoint(this.viewProj, wx + this.shakeX, wy, wz + this.shakeY);
    if (cw <= 0.0001) return { x: -9999, y: -9999 };
    return {
      x: ((cx / cw) * 0.5 + 0.5) * this.viewW,
      y: (1 - ((cy / cw) * 0.5 + 0.5)) * this.viewH,
    };
  }

  /** Center of the view in 2D world coordinates. */
  get focusX() {
    return this.x + this.viewW / 2 + this.shakeX;
  }

  get focusY() {
    return this.y + this.viewH / 2 + this.shakeY;
  }

  _rebuild() {
    if (!this._dirty) return;
    const aspect = this.viewW / this.viewH;
    mat4Perspective(this.projection, this.fov, aspect, this.near, this.far);

    const fx = this.focusX;
    const fz = this.focusY;
    const pitch = this.pitch;
    const dist = this.distance / this.zoom;
    const eyeY = Math.sin(pitch) * dist;
    const eyeBack = Math.cos(pitch) * dist;
    const eyeX = fx + Math.sin(this.yaw) * eyeBack;
    const eyeZ = fz + Math.cos(this.yaw) * eyeBack;
    mat4LookAt(this.view, eyeX, eyeY, eyeZ, fx, 8, fz, 0, 1, 0);

    // viewProj = projection * view
    const p = this.projection;
    const v = this.view;
    const out = this.viewProj;
    for (let c = 0; c < 4; c += 1) {
      const b0 = v[c * 4]; const b1 = v[c * 4 + 1]; const b2 = v[c * 4 + 2]; const b3 = v[c * 4 + 3];
      out[c * 4] = p[0] * b0 + p[4] * b1 + p[8] * b2 + p[12] * b3;
      out[c * 4 + 1] = p[1] * b0 + p[5] * b1 + p[9] * b2 + p[13] * b3;
      out[c * 4 + 2] = p[2] * b0 + p[6] * b1 + p[10] * b2 + p[14] * b3;
      out[c * 4 + 3] = p[3] * b0 + p[7] * b1 + p[11] * b2 + p[15] * b3;
    }
    this._dirty = false;
  }

  _unproject(ndcX, ndcY, ndcZ) {
    // invert viewProj via adjugate-lite: solve (viewProj) * p = ndc with w = 1
    const m = this.viewProj;
    // 4x4 inverse (general) applied to the ndc vector
    const inv = invertMat4(m);
    const x = inv[0] * ndcX + inv[4] * ndcY + inv[8] * ndcZ + inv[12];
    const y = inv[1] * ndcX + inv[5] * ndcY + inv[9] * ndcZ + inv[13];
    const z = inv[2] * ndcX + inv[6] * ndcY + inv[10] * ndcZ + inv[14];
    const w = inv[3] * ndcX + inv[7] * ndcY + inv[11] * ndcZ + inv[15];
    return [x / w, y / w, z / w];
  }
}

/** General 4x4 inverse (column-major). Returns a new Float32Array. */
function invertMat4(m) {
  const out = new Float32Array(16);
  const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3];
  const a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7];
  const a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11];
  const a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];

  const b00 = a00 * a11 - a01 * a10;
  const b01 = a00 * a12 - a02 * a10;
  const b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11;
  const b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30;
  const b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31;
  const b10 = a21 * a33 - a23 * a31;
  const b11 = a22 * a33 - a23 * a32;

  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det) return out;
  det = 1.0 / det;

  out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
  out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
  out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
  out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
  out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
  out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
  out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
  out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
  out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
  out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
  out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
  out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
  out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
  out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
  out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
  out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
  return out;
}

export default Camera3D;
