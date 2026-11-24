/**
 * shaders.js — GLSL for the low-poly renderer. Two programs only:
 *
 *  - LIT:    vertex-colored geometry with one directional light, distance
 *            fog and a screen tint (day/night + weather tint live here).
 *  - GLOW:   unlit colored geometry with a soft radial alpha for portals,
 *            pickups and magic — drawn as billboards in a second pass.
 *
 * No textures, no shadow maps: flat vertex lighting is exactly the right
 * look for the pixel-art-adjacent style and runs on anything WebGL.
 */

export const LIT_VS = `
attribute vec3 aPosition;
attribute vec3 aNormal;
attribute vec3 aColor;

uniform mat4 uProjection;
uniform mat4 uView;
uniform mat4 uModel;
uniform float uTime;

varying vec3 vColor;
varying float vDepth;
varying vec3 vNormal;

void main() {
  vec4 world = uModel * vec4(aPosition, 1.0);
  vec4 view = uView * world;
  gl_Position = uProjection * view;
  vColor = aColor;
  vNormal = mat3(uModel[0].xyz, uModel[1].xyz, uModel[2].xyz) * aNormal;
  vDepth = -view.z;
}
`;

export const LIT_FS = `
precision mediump float;

varying vec3 vColor;
varying float vDepth;
varying vec3 vNormal;

uniform vec3 uLightDir;     // normalized, world space
uniform vec3 uLightColor;
uniform vec3 uAmbient;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform vec4 uTint;         // rgba screen tint (day/night, weather)
uniform float uExposure;

void main() {
  vec3 n = normalize(vNormal);
  float ndl = max(dot(n, -uLightDir), 0.0);
  vec3 lit = vColor * (uAmbient + uLightColor * ndl) * uExposure;
  float fog = clamp((vDepth - uFogNear) / max(uFogFar - uFogNear, 1.0), 0.0, 1.0);
  vec3 col = mix(lit, uFogColor, fog);
  col = mix(col, uTint.rgb, uTint.a);
  gl_FragColor = vec4(col, 1.0);
}
`;

export const GLOW_VS = `
attribute vec3 aPosition;
attribute vec3 aColor;
attribute vec2 aUV;

uniform mat4 uProjection;
uniform mat4 uView;
uniform mat4 uModel;

varying vec3 vColor;
varying vec2 vUV;
varying float vDepth;

void main() {
  vec4 world = uModel * vec4(aPosition, 1.0);
  vec4 view = uView * world;
  gl_Position = uProjection * view;
  vColor = aColor;
  vUV = aUV;
  vDepth = -view.z;
}
`;

export const GLOW_FS = `
precision mediump float;

varying vec3 vColor;
varying vec2 vUV;
varying float vDepth;

uniform vec4 uTint;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform float uPulse;   // 0..1 breathing for portals

void main() {
  // radial falloff in UV space (quads are centered at 0.5, 0.5)
  float d = length(vUV - vec2(0.5)) * 2.0;
  float alpha = (1.0 - smoothstep(0.35, 1.0, d)) * (0.65 + 0.35 * uPulse);
  float fog = clamp((vDepth - uFogNear) / max(uFogFar - uFogNear, 1.0), 0.0, 1.0);
  vec3 col = mix(vColor, uFogColor, fog);
  col = mix(col, uTint.rgb, uTint.a);
  gl_FragColor = vec4(col * alpha, alpha);
}
`;

/**
 * Tile floor shader variant: same as LIT but with a subtle vertex-level
 * dither in fragment for cheap banding-free gradients on old GPUs.
 */
export const PROGRAMS = {
  lit: { vs: LIT_VS, fs: LIT_FS, name: 'lit' },
  glow: { vs: GLOW_VS, fs: GLOW_FS, name: 'glow' },
};

export default PROGRAMS;
