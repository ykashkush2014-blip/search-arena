// Sky dome, sun, moon and star-field with a day/night cycle.
import * as THREE from '../vendor/three.module.min.js';

const VERT = /* glsl */`
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAG = /* glsl */`
  varying vec3 vDir;
  uniform vec3 topColor;
  uniform vec3 horizonColor;
  uniform vec3 bottomColor;
  uniform vec3 sunDir;
  uniform vec3 sunColor;
  uniform float sunGlow;
  void main() {
    float h = clamp(vDir.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 col = mix(horizonColor, topColor, smoothstep(0.5, 0.92, h));
    col = mix(bottomColor, col, smoothstep(0.34, 0.52, h));
    float d = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
    col += sunColor * pow(d, 12.0) * sunGlow * 0.55;
    col += sunColor * pow(d, 2.0) * sunGlow * 0.10;
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

const DAY_COLORS = {
  top: new THREE.Color('#3f7fd6'),
  horizon: new THREE.Color('#b9dcf5'),
  bottom: new THREE.Color('#8fbfe0'),
  fog: new THREE.Color('#bcdcf2'),
};
const DUSK_COLORS = {
  top: new THREE.Color('#2a2f63'),
  horizon: new THREE.Color('#f0925a'),
  bottom: new THREE.Color('#d5704f'),
  fog: new THREE.Color('#e0a179'),
};
const NIGHT_COLORS = {
  top: new THREE.Color('#03040f'),
  horizon: new THREE.Color('#111b3d'),
  bottom: new THREE.Color('#0a1128'),
  fog: new THREE.Color('#111a33'),
};

function mixPalette(a, b, t) {
  return {
    top: a.top.clone().lerp(b.top, t),
    horizon: a.horizon.clone().lerp(b.horizon, t),
    bottom: a.bottom.clone().lerp(b.bottom, t),
    fog: a.fog.clone().lerp(b.fog, t),
  };
}

export class Sky {
  constructor(scene, renderer) {
    this.scene = scene;
    this.uniforms = {
      topColor: { value: DAY_COLORS.top.clone() },
      horizonColor: { value: DAY_COLORS.horizon.clone() },
      bottomColor: { value: DAY_COLORS.bottom.clone() },
      sunDir: { value: new THREE.Vector3(0, 1, 0) },
      sunColor: { value: new THREE.Color('#fff3c4') },
      sunGlow: { value: 1 },
    };
    const geo = new THREE.SphereGeometry(400, 24, 16);
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: this.uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.dome = new THREE.Mesh(geo, mat);
    this.dome.frustumCulled = false;
    scene.add(this.dome);

    // Stars
    const starGeo = new THREE.BufferGeometry();
    const starCount = 700;
    const positions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const u = Math.random() * 2 - 1;
      const theta = Math.random() * Math.PI * 2;
      const r = 360;
      const s = Math.sqrt(1 - u * u);
      positions[i * 3] = Math.cos(theta) * s * r;
      positions[i * 3 + 1] = Math.abs(u) * r;
      positions[i * 3 + 2] = Math.sin(theta) * s * r;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
      color: 0xffffff, size: 2.4, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false,
    }));
    this.stars.frustumCulled = false;
    scene.add(this.stars);

    // Sun & moon billboards
    this.sun = new THREE.Mesh(
      new THREE.SphereGeometry(14, 12, 8),
      new THREE.MeshBasicMaterial({ color: '#fff6cf', fog: false })
    );
    this.moon = new THREE.Mesh(
      new THREE.SphereGeometry(9, 12, 8),
      new THREE.MeshBasicMaterial({ color: '#e8edff', fog: false })
    );
    scene.add(this.sun, this.moon);

    // Clouds: flat drifting slabs high above the terrain.
    this.clouds = new THREE.Group();
    const cloudMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.72, fog: true, depthWrite: false,
    });
    const cloudGeo = new THREE.BoxGeometry(1, 1, 1);
    for (let i = 0; i < 26; i++) {
      const cluster = new THREE.Group();
      const parts = 2 + Math.floor(Math.random() * 4);
      for (let p = 0; p < parts; p++) {
        const m = new THREE.Mesh(cloudGeo, cloudMat);
        const w = 10 + Math.random() * 22;
        const d = 8 + Math.random() * 16;
        m.scale.set(w, 2.5 + Math.random() * 2, d);
        m.position.set((Math.random() - 0.5) * 26, Math.random() * 3, (Math.random() - 0.5) * 20);
        cluster.add(m);
      }
      cluster.position.set((Math.random() - 0.5) * 420, 66 + Math.random() * 22, (Math.random() - 0.5) * 420);
      this.clouds.add(cluster);
    }
    scene.add(this.clouds);

    // Lighting
    this.hemi = new THREE.HemisphereLight('#cfe6ff', '#5b6b4a', 1.15);
    this.sunLight = new THREE.DirectionalLight('#fff2c9', 1.55);
    this.sunLight.castShadow = false;
    scene.add(this.hemi, this.sunLight);

    this.scene.fog = new THREE.Fog(DAY_COLORS.fog.clone(), 42, 96);
    this.timeOfDay = 0.28; // 0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset
    this.dayLength = 240; // seconds
  }

  setTime(t) {
    this.timeOfDay = ((t % 1) + 1) % 1;
  }

  isNight() {
    return this.timeOfDay > 0.79 || this.timeOfDay < 0.21;
  }

  update(dt, camera) {
    this.timeOfDay = (this.timeOfDay + dt / this.dayLength) % 1;
    const angle = this.timeOfDay * Math.PI * 2 - Math.PI / 2;
    const sunDir = new THREE.Vector3(Math.cos(angle) * 0.35, Math.sin(angle), Math.cos(angle) * 0.55).normalize();
    this.uniforms.sunDir.value.copy(sunDir);
    this.sunLight.position.copy(sunDir).multiplyScalar(120);
    this.sun.position.copy(camera.position).addScaledVector(sunDir, 320);
    this.moon.position.copy(camera.position).addScaledVector(sunDir, -320);
    this.dome.position.copy(camera.position);
    this.stars.position.copy(camera.position);

    const elev = sunDir.y; // -1..1
    // Palette: night -> dusk/dawn -> day
    let palette;
    let sunGlow;
    if (elev > 0.12) {
      palette = mixPalette(DUSK_COLORS, DAY_COLORS, Math.min(1, (elev - 0.12) / 0.3));
      sunGlow = 1;
    } else if (elev > -0.18) {
      const t = (elev + 0.18) / 0.3; // 0 night side -> 1 dusk
      palette = mixPalette(NIGHT_COLORS, DUSK_COLORS, t);
      sunGlow = 1 - Math.abs(elev) * 2.2;
    } else {
      palette = mixPalette(NIGHT_COLORS, NIGHT_COLORS, 0);
      sunGlow = 0;
    }
    this.uniforms.topColor.value.copy(palette.top);
    this.uniforms.horizonColor.value.copy(palette.horizon);
    this.uniforms.bottomColor.value.copy(palette.bottom);
    this.uniforms.sunGlow.value = Math.max(0, sunGlow);
    this.uniforms.sunColor.value.set(elev > 0 ? '#fff1c0' : '#ff9d5c');
    this.scene.fog.color.copy(palette.fog);
    this.scene.background = null;

    const dayFactor = THREE.MathUtils.smoothstep(elev, -0.12, 0.22);
    this.hemi.intensity = 0.55 + dayFactor * 0.62;
    this.hemi.color.copy(new THREE.Color('#7f92c8')).lerp(new THREE.Color('#d6ebff'), dayFactor);
    this.hemi.groundColor.copy(new THREE.Color('#2a3550')).lerp(new THREE.Color('#5b6b4a'), dayFactor);
    // The key light follows the sun by day and the moon by night so the world
    // never goes fully black.
    const lightDir = elev >= 0 ? sunDir : sunDir.clone().negate();
    this.sunLight.position.copy(lightDir).multiplyScalar(120);
    this.sunLight.intensity = 0.45 + dayFactor * 1.2;
    this.sunLight.color.set(elev >= 0 ? '#fff2c9' : '#a9bcff');
    this.stars.material.opacity = 1 - dayFactor;
    this.sun.visible = elev > -0.25;
    this.moon.visible = elev < 0.25;
    this.clouds.children.forEach((c) => {
      c.position.x += dt * 1.4;
      if (c.position.x > 230) c.position.x = -230;
    });
    const cloudMat = this.clouds.children[0]?.children[0]?.material;
    if (cloudMat) {
      cloudMat.opacity = 0.25 + dayFactor * 0.55;
      cloudMat.color.copy(new THREE.Color('#3a4670')).lerp(new THREE.Color('#ffffff'), dayFactor);
    }
    return { isNight: this.isNight(), dayFactor };
  }

  /** Pretty clock label such as "07:24". */
  clockLabel() {
    const totalMinutes = Math.floor(this.timeOfDay * 24 * 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
}
