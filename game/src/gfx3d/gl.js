/**
 * gl.js — minimal WebGL bootstrap + tiny mat4 math for the 3D renderer.
 * No dependencies, no fat matrix library: just the operations the game needs.
 * Everything is allocation-light for weak GPUs and old drivers.
 */

// ------------------------------------------------------------- mat4 math
// Matrices are Float32Array(16), column-major (WebGL convention).

export function mat4() {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}

export function mat4Identity(out = mat4()) {
  out.fill(0);
  out[0] = 1; out[5] = 1; out[10] = 1; out[15] = 1;
  return out;
}

export function mat4Copy(out, a) {
  out.set(a);
  return out;
}

/** out = a * b */
export function mat4Multiply(out, a, b) {
  const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
  const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
  const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
  const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
  for (let c = 0; c < 4; c += 1) {
    const b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
    out[c * 4] = a00 * b0 + a10 * b1 + a20 * b2 + a30 * b3;
    out[c * 4 + 1] = a01 * b0 + a11 * b1 + a21 * b2 + a31 * b3;
    out[c * 4 + 2] = a02 * b0 + a12 * b1 + a22 * b2 + a32 * b3;
    out[c * 4 + 3] = a03 * b0 + a13 * b1 + a23 * b2 + a33 * b3;
  }
  return out;
}

export function mat4Translate(out, x, y, z) {
  mat4Identity(out);
  out[12] = x; out[13] = y; out[14] = z;
  return out;
}

export function mat4Scale(out, x, y, z) {
  mat4Identity(out);
  out[0] = x; out[5] = y; out[10] = z;
  return out;
}

/** Rotation around the Y axis (yaw) — the only axis gameplay needs. */
export function mat4RotateY(out, rad) {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  mat4Identity(out);
  out[0] = c; out[2] = -s; out[8] = s; out[10] = c;
  return out;
}

/** Rotation around the X axis (limb swing, projectile tilt). */
export function mat4RotateX(out, rad) {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  mat4Identity(out);
  out[5] = c; out[6] = s; out[9] = -s; out[10] = c;
  return out;
}

/** Rotation around the Z axis (lean). */
export function mat4RotateZ(out, rad) {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  mat4Identity(out);
  out[0] = c; out[1] = s; out[4] = -s; out[5] = c;
  return out;
}

/**
 * Build a model matrix: translate * rotateY * rotateX * rotateZ * scale,
 * which is all the posing any actor needs.
 */
export function mat4Compose(out, x, y, z, yaw = 0, pitch = 0, roll = 0, sx = 1, sy = 1, sz = 1) {
  const cy = Math.cos(yaw); const sya = Math.sin(yaw);
  const cp = Math.cos(pitch); const sp = Math.sin(pitch);
  const cr = Math.cos(roll); const sr = Math.sin(roll);
  // combined rotation R = Ry * Rx * Rz
  const r00 = cy * cr + sya * sp * sr;
  const r01 = cp * sr;
  const r02 = -sya * cr + cy * sp * sr;
  const r10 = -cy * sr + sya * sp * cr;
  const r11 = cp * cr;
  const r12 = sya * sr + cy * sp * cr;
  const r20 = sya * cp;
  const r21 = -sp;
  const r22 = cy * cp;
  out[0] = r00 * sx; out[1] = r01 * sx; out[2] = r02 * sx; out[3] = 0;
  out[4] = r10 * sy; out[5] = r11 * sy; out[6] = r12 * sy; out[7] = 0;
  out[8] = r20 * sz; out[9] = r21 * sz; out[10] = r22 * sz; out[11] = 0;
  out[12] = x; out[13] = y; out[14] = z; out[15] = 1;
  return out;
}

export function mat4Perspective(out, fovyRad, aspect, near, far) {
  const f = 1 / Math.tan(fovyRad / 2);
  out.fill(0);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) / (near - far);
  out[11] = -1;
  out[14] = (2 * far * near) / (near - far);
  return out;
}

export function mat4Ortho(out, left, right, bottom, top, near, far) {
  out.fill(0);
  out[0] = 2 / (right - left);
  out[5] = 2 / (top - bottom);
  out[10] = -2 / (far - near);
  out[12] = -(right + left) / (right - left);
  out[13] = -(top + bottom) / (top - bottom);
  out[14] = -(far + near) / (far - near);
  out[15] = 1;
  return out;
}

export function mat4LookAt(out, eyeX, eyeY, eyeZ, atX, atY, atZ, upX = 0, upY = 1, upZ = 0) {
  let zx = eyeX - atX; let zy = eyeY - atY; let zz = eyeZ - atZ;
  let len = Math.hypot(zx, zy, zz) || 1;
  zx /= len; zy /= len; zz /= len;
  let xx = upY * zz - upZ * zy;
  let xy = upZ * zx - upX * zz;
  let xz = upX * zy - upY * zx;
  len = Math.hypot(xx, xy, xz) || 1;
  xx /= len; xy /= len; xz /= len;
  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;
  out[0] = xx; out[1] = yx; out[2] = zx; out[3] = 0;
  out[4] = xy; out[5] = yy; out[6] = zy; out[7] = 0;
  out[8] = xz; out[9] = yz; out[10] = zz; out[11] = 0;
  out[12] = -(xx * eyeX + xy * eyeY + xz * eyeZ);
  out[13] = -(yx * eyeX + yy * eyeY + yz * eyeZ);
  out[14] = -(zx * eyeX + zy * eyeY + zz * eyeZ);
  out[15] = 1;
  return out;
}

/** Transform a point (x,y,z,1) by mat4. Returns [x,y,z,w]. */
export function transformPoint(m, x, y, z) {
  const w = m[3] * x + m[7] * y + m[11] * z + m[15];
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
    w,
  ];
}

// ------------------------------------------------------------- color util

/** Parse '#rrggbb' (or '#rgb') into normalized [r,g,b]. */
export function hexToRgb(hex, fallback = [1, 1, 1]) {
  if (typeof hex !== 'string') return fallback;
  let h = hex.replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  if (Number.isNaN(n)) return fallback;
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Multiply a hex color by a scalar and clamp. Returns [r,g,b]. */
export function shadeHex(hex, mul, fallback = [1, 1, 1]) {
  const [r, g, b] = hexToRgb(hex, fallback);
  return [Math.min(1, r * mul), Math.min(1, g * mul), Math.min(1, b * mul)];
}

/** Mix two hex colors. */
export function mixHex(hexA, hexB, t) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

// ------------------------------------------------------------- GL helpers

/**
 * Compile a program from vertex/fragment source. Throws with the info log on
 * failure so the game can fall back to the 2D renderer loudly.
 */
export function compileProgram(gl, vsSource, fsSource, name = 'program') {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSource, `${name}.vs`);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSource, `${name}.fs`);
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog);
    throw new Error(`[gl] ${name} link failed: ${log}`);
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return prog;
}

function compileShader(gl, type, source, label) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    throw new Error(`[gl] ${label} compile failed: ${log}`);
  }
  return shader;
}

/** Upload a Float32Array to a new ARRAY_BUFFER. */
export function createFloatBuffer(gl, data, usage = gl.STATIC_DRAW) {
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, data, usage);
  return buf;
}

/** Bind an attribute pointer for a float buffer of `size` components. */
export function bindAttribute(gl, program, name, buffer, size) {
  const loc = gl.getAttribLocation(program, name);
  if (loc < 0) return -1;
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
  return loc;
}

/** Uniform location cache wrapper. */
export class Uniforms {
  constructor(gl, program) {
    this.gl = gl;
    this.program = program;
    this.cache = new Map();
  }

  loc(name) {
    if (!this.cache.has(name)) {
      this.cache.set(name, this.gl.getUniformLocation(this.program, name));
    }
    return this.cache.get(name);
  }

  mat4(name, m) {
    this.gl.uniformMatrix4fv(this.loc(name), false, m);
  }

  vec3(name, x, y, z) {
    this.gl.uniform3f(this.loc(name), x, y, z);
  }

  vec4(name, x, y, z, w) {
    this.gl.uniform4f(this.loc(name), x, y, z, w);
  }

  float(name, v) {
    this.gl.uniform1f(this.loc(name), v);
  }

  int(name, v) {
    this.gl.uniform1i(this.loc(name), v);
  }
}

/**
 * Acquire a WebGL context with the settings weak devices want:
 * no depth-of-field niceties, antialias off (we upscale pixels anyway),
 * and the low-power GPU preference on dual-GPU laptops.
 */
export function acquireGL(canvas) {
  const attrs = {
    alpha: false,
    antialias: false,
    depth: true,
    stencil: false,
    premultipliedAlpha: true,
    preserveDrawingBuffer: false,
    powerPreference: 'low-power',
    failIfMajorPerformanceCaveat: false,
  };
  const gl = canvas.getContext('webgl', attrs)
    ?? canvas.getContext('experimental-webgl', attrs)
    ?? null;
  if (!gl) return null;
  gl.disable(gl.CULL_FACE); // tile art must be double-sided
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  return gl;
}

export default {
  mat4, mat4Identity, mat4Copy, mat4Multiply, mat4Translate, mat4Scale,
  mat4RotateX, mat4RotateY, mat4RotateZ, mat4Compose, mat4Perspective,
  mat4Ortho, mat4LookAt, transformPoint, hexToRgb, shadeHex, mixHex,
  compileProgram, createFloatBuffer, bindAttribute, Uniforms, acquireGL,
};
