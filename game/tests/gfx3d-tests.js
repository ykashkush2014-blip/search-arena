/**
 * tests/gfx3d-tests.js — 3D renderer suite: matrix math, procedural meshes,
 * camera projection roundtrips, actor posing and a fake-WebGL smoke run of
 * Renderer3D + the 3D game path (with 2D fallback verification).
 *
 * Wired into run-tests.js via registerGfx3dTests().
 */

export async function registerGfx3dTests({ suite, test, assert }) {
  const glMod = await import('../src/gfx3d/gl.js');
  const level3d = await import('../src/gfx3d/level3d.js');
  const camera3d = await import('../src/gfx3d/camera3d.js');
  const actors3d = await import('../src/gfx3d/actors3d.js');
  const renderer3d = await import('../src/gfx3d/renderer3d.js');
  const { Game } = await import('../src/game/game.js');
  const { Storage } = await import('../src/core/storage.js');

  // ------------------------------------------------------- fake WebGL

  function fakeGL() {
    let attrCounter = 0;
    const calls = { draw: 0, bufferData: 0 };
    const noop = () => undefined;
    return {
      calls,
      VERTEX_SHADER: 0x8b31, FRAGMENT_SHADER: 0x8b30,
      COMPILE_STATUS: 0x8b81, LINK_STATUS: 0x8b82,
      ARRAY_BUFFER: 0x8892, STATIC_DRAW: 0x88e4, DYNAMIC_DRAW: 0x88e8,
      FLOAT: 0x1406, TRIANGLES: 0x0004,
      COLOR_BUFFER_BIT: 0x4000, DEPTH_BUFFER_BIT: 0x0100,
      CULL_FACE: 0x0b44, DEPTH_TEST: 0x0b71, BLEND: 0x0be2,
      LEQUAL: 0x0203, SRC_ALPHA: 0x0302, ONE_MINUS_SRC_ALPHA: 0x0303,
      UNPACK_PREMULTIPLY_ALPHA_WEBGL: 0x9241,
      createShader: () => ({ id: attrCounter += 1 }),
      shaderSource: noop, compileShader: noop,
      getShaderParameter: () => true, getShaderInfoLog: () => '',
      deleteShader: noop,
      createProgram: () => ({ id: attrCounter += 1 }),
      attachShader: noop, linkProgram: noop, useProgram: noop,
      getProgramParameter: () => true, getProgramInfoLog: () => '',
      deleteProgram: noop,
      getAttribLocation: () => (attrCounter += 1),
      getUniformLocation: () => ({ id: attrCounter += 1 }),
      createBuffer: () => ({ id: attrCounter += 1 }),
      bindBuffer: noop, bufferData: () => { calls.bufferData += 1; },
      deleteBuffer: noop,
      enableVertexAttribArray: noop, vertexAttribPointer: noop,
      uniformMatrix4fv: noop, uniform3f: noop, uniform4f: noop,
      uniform1f: noop, uniform1i: noop,
      viewport: noop, clearColor: noop,
      clear: () => { calls.draw += 1; },
      depthMask: noop, disable: noop, enable: noop,
      depthFunc: noop, blendFunc: noop, pixelStorei: noop,
      drawArrays: () => { calls.draw += 1; },
      getExtension: () => null,
      getContextAttributes: () => ({}),
    };
  }

  function fakeCanvas(gl, ctx2d) {
    return {
      width: 480, height: 270, style: {}, parentNode: null,
      getContext(type) {
        if (type === '2d') return ctx2d;
        return gl ?? null;
      },
      addEventListener() {}, removeEventListener() {},
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 480, height: 270 }),
    };
  }

  function fake2d() {
    const calls = { fill: 0, draw: 0, text: 0 };
    return {
      calls,
      fillStyle: '', strokeStyle: '', globalAlpha: 1, lineWidth: 1,
      font: '', textAlign: 'left', textBaseline: 'top',
      imageSmoothingEnabled: false,
      setTransform() {}, clearRect() {},
      fillRect() { calls.fill += 1; },
      strokeRect() {}, beginPath() {}, arc() {}, fill() {},
      moveTo() {}, lineTo() {}, stroke() {},
      save() {}, restore() {}, translate() {}, scale() {}, rotate() {},
      ellipse() {},
      drawImage() { calls.draw += 1; },
      fillText() { calls.text += 1; },
      measureText(text) { return { width: String(text).length * 6 }; },
      createLinearGradient() { return { addColorStop() {} }; },
      createRadialGradient() { return { addColorStop() {} }; },
      getImageData(x, y, w, h) {
        return { data: new Uint8ClampedArray(Math.max(4, w * h * 4)), width: w, height: h };
      },
    };
  }

  // ---------------------------------------------------------- mat4 math

  suite('gfx3d/gl math', () => {
    test('identity matrices are neutral', () => {
      const a = glMod.mat4Identity(glMod.mat4());
      const b = glMod.mat4Identity(glMod.mat4());
      const out = glMod.mat4Multiply(glMod.mat4(), a, b);
      assert.ok(Math.abs(out[0] - 1) < 1e-6 && Math.abs(out[5] - 1) < 1e-6);
      const [px, py, pz] = glMod.transformPoint(a, 3, 4, 5);
      assert.equal(px, 3);
      assert.equal(py, 4);
      assert.equal(pz, 5);
    });

    test('translate moves points', () => {
      const tr = glMod.mat4Translate(glMod.mat4(), 10, -2, 4);
      const [px, py, pz] = glMod.transformPoint(tr, 1, 1, 1);
      assert.equal(px, 11);
      assert.equal(py, -1);
      assert.equal(pz, 5);
    });

    test('perspective projects center points to NDC center', () => {
      const proj = glMod.mat4Perspective(glMod.mat4(), Math.PI / 3, 16 / 9, 0.1, 100);
      const [qx, qy, qz, qw] = glMod.transformPoint(proj, 0, 0, -10);
      assert.ok(Math.abs(qx / qw) < 1e-4, `x=${qx / qw}`);
      assert.ok(Math.abs(qy / qw) < 1e-4, `y=${qy / qw}`);
      const ndcZ = qz / qw;
      assert.ok(ndcZ > -1 && ndcZ < 1, `z=${ndcZ}`);
    });

    test('lookAt places the eye correctly', () => {
      const view = glMod.mat4LookAt(glMod.mat4(), 0, 0, 10, 0, 0, 0, 0, 1, 0);
      const [px, py, pz] = glMod.transformPoint(view, 0, 0, 0);
      assert.ok(Math.abs(pz - -10) < 1e-4, `origin should be 10 in front (z=${pz})`);
      assert.ok(Math.abs(px) < 1e-4 && Math.abs(py) < 1e-4);
    });

    test('compose = translate·rotate·scale', () => {
      const m = glMod.mat4Compose(glMod.mat4(), 5, 0, 0, Math.PI / 2, 0, 0, 2, 2, 2);
      const [px, py, pz] = glMod.transformPoint(m, 1, 0, 0); // scale 2 → (2,0,0), yaw 90° → (0,0,-2), +T → (5,0,-2)
      assert.ok(Math.abs(px - 5) < 1e-4, `x=${px}`);
      assert.ok(Math.abs(pz - -2) < 1e-4, `z=${pz}`);
      assert.ok(Math.abs(py) < 1e-4);
    });

    test('color utilities', () => {
      const white = glMod.hexToRgb('#ffffff');
      assert.deepEqual([...white], [1, 1, 1]);
      const dark = glMod.shadeHex('#808080', 0.5);
      assert.ok(Math.abs(dark[0] - 0.25) < 0.03);
      const mid = glMod.mixHex('#000000', '#ffffff', 0.5);
      assert.ok(Math.abs(mid[0] - 0.5) < 1e-6);
    });
  });

  // ------------------------------------------------------------- meshes

  suite('gfx3d/level3d meshes', () => {
    test('MeshBuilder box produces 36 vertices', () => {
      const mb = new level3d.MeshBuilder();
      mb.box(0, 0, 0, 2, 2, 2, [1, 0, 0]);
      const arrays = mb.toArrays();
      assert.equal(arrays.vertexCount, 36);
      assert.equal(arrays.normals.length, arrays.positions.length);
      assert.equal(arrays.colors.length, arrays.positions.length);
    });

    test('buildLevelMesh emits geometry for a tiny map', () => {
      const level = {
        width: 4,
        height: 4,
        tiles: new Uint8Array([
          4, 4, 4, 4,
          4, 1, 1, 4,
          4, 1, 1, 4,
          4, 4, 4, 4,
        ]),
      };
      const mesh = level3d.buildLevelMesh(level);
      assert.ok(mesh.vertexCount > 0, 'level mesh has vertices');
      assert.equal(mesh.positions.length, mesh.vertexCount * 3);
      const skirt = level3d.buildSkirtMesh(level);
      assert.ok(skirt.vertexCount > 0, 'skirt has vertices');
    });

    test('buildLevelMesh covers every non-void tile ground', () => {
      const level = { width: 2, height: 2, tiles: new Uint8Array([1, 1, 1, 1]) };
      const mesh = level3d.buildLevelMesh(level);
      // 4 ground tiles × 2 triangles × 3 vertices = 24 minimum
      assert.ok(mesh.vertexCount >= 24, `got ${mesh.vertexCount}`);
    });
  });

  // ------------------------------------------------------------- camera

  suite('gfx3d/camera3d', () => {
    test('worldToScreen and screenToWorld roundtrip', () => {
      const cam = new camera3d.Camera3D(480, 270);
      cam.bounds = { x: 0, y: 0, w: 2000, h: 2000 };
      cam.follow(640, 480, 1 / 60, 1); // snap
      const p = cam.worldToScreen(640, 480);
      assert.ok(p.x > 200 && p.x < 280, `screen x=${p.x}`);
      assert.ok(p.y > 90 && p.y < 190, `screen y=${p.y}`);
      const back = cam.screenToWorld(p.x, p.y);
      assert.ok(Math.abs(back.x - 640) < 4, `back.x=${back.x}`);
      assert.ok(Math.abs(back.y - 480) < 4, `back.y=${back.y}`);
    });

    test('isVisible respects margins', () => {
      const cam = new camera3d.Camera3D(480, 270);
      cam.follow(500, 500, 1 / 60, 1);
      assert.ok(cam.isVisible(500, 500, 16));
      assert.ok(!cam.isVisible(5000, 5000, 16));
    });

    test('project matches worldToScreen at ground level', () => {
      const cam = new camera3d.Camera3D(480, 270);
      cam.follow(100, 100, 1 / 60, 1);
      const a = cam.worldToScreen(120, 90);
      const b = cam.project(120, 0, 90);
      assert.ok(Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01);
    });
  });

  // ------------------------------------------------------------- actors

  suite('gfx3d/actors3d', () => {
    test('every archetype builds valid parts', () => {
      for (const arch of ['humanoid', 'beast', 'insect', 'golem', 'wraith', 'serpent', 'flyer', 'boss', 'chest', 'loot']) {
        const mesh = actors3d.actorBank.get(arch);
        assert.ok(mesh.parts.length >= 2, `${arch} has parts`);
        for (const p of mesh.parts) {
          assert.equal(p.positions.length, p.vertexCount * 3, `${arch}/${p.name} vertex data`);
          assert.equal(p.pivot.length, 3, `${arch}/${p.name} pivot`);
        }
      }
    });

    test('family → archetype mapping with fallback', () => {
      assert.equal(actors3d.actorBank.forEnemy({ family: 'beast' }).archetype, 'beast');
      assert.equal(actors3d.actorBank.forEnemy({ family: 'bossGolem', isBoss: true }).archetype, 'boss');
      assert.equal(actors3d.actorBank.forEnemy({ family: 'eldritch' }).archetype, 'humanoid');
    });

    test('poseFor produces walk swing and attack motion', () => {
      const walking = actors3d.poseFor({ walkPhase: Math.PI / 2, walking: true });
      assert.ok(Math.abs(walking.legL - 0.7) < 1e-6, `legL=${walking.legL}`);
      assert.ok(Math.abs(walking.legR + 0.7) < 1e-6);
      const idle = actors3d.poseFor({ walkPhase: 9, walking: false });
      assert.equal(idle.legL, 0);
      const attack = actors3d.poseFor({ attackT: 0.5 });
      assert.ok(attack.armR < -1, `attack arm swings (armR=${attack.armR})`);
    });
  });

  // ------------------------------------------------- renderer3d + game

  suite('gfx3d/renderer3d', () => {
    test('full frame renders with fake WebGL', () => {
      const gl = fakeGL();
      const ui = fakeCanvas(null, fake2d());
      const r = new renderer3d.Renderer3D(fakeCanvas(gl, fake2d()), { uiCanvas: ui, width: 480, height: 270 });
      assert.equal(r.is3D, true);
      assert.equal(typeof r.bctx.fillRect, 'function');

      r.setLevel({ width: 3, height: 3, tiles: new Uint8Array(9).fill(1) });
      r.begin('#1a1220');
      r.drawLevel({ color: '#000000', alpha: 0.1 }, 1);
      r.drawActor(actors3d.actorBank.get('humanoid'), 48, 48, { facing: 1, walkPhase: 1, walking: true });
      r.drawActor(actors3d.actorBank.get('beast'), 80, 60, { facing: -1, attackT: 0.5 });
      r.drawActor(actors3d.actorBank.get('chest'), 30, 30, { openT: 1 });
      r.beginGlow();
      r.glowQuad(48, 48, 10, '#b267e0', 8);
      r.endGlow({ color: '#2244aa', alpha: 0.1 }, 0.5);
      r.beginScreenSpace();
      r.drawRect(10, 10, 40, 20, '#ff0000', 0.5);
      r.drawRectOutline(4, 4, 100, 40, '#ffffff');
      r.drawCircle(50, 50, 8, '#00ff00', 0.8);
      r.drawLine(0, 0, 100, 100, '#ffffff', 2);
      r.drawText('hello', 20, 20, { size: 8 });
      assert.ok(r.measureText('hello', 8).width > 0);
      r.drawTint('#000000', 0.2);
      r.endWorldSpace();
      r.end();
      assert.ok(gl.calls.draw > 0, `draw calls=${gl.calls.draw}`);
      assert.ok(r.drawCalls > 0);
    });

    test('3D game boots and renders end-to-end', () => {
      const gl = fakeGL();
      const ui = fakeCanvas(null, fake2d());
      const game = new Game({ canvas: fakeCanvas(gl, fake2d()), uiCanvas: ui, lang: 'en' });
      game.storage = new Storage();
      game.saveManager.storage = game.storage;
      assert.equal(game.renderer.is3D, true, '3D renderer active');
      game.boot();
      game.startNewGame();
      assert.ok(game.player && game.world);
      assert.ok(game.renderer.drawCalls >= 0);
      for (let i = 0; i < 30; i += 1) {
        game.update(1 / 60);
        game.render(0, i);
      }
      assert.ok(gl.calls.draw > 0, '3D render produced GL work');
      // level mesh was pushed to the 3D renderer
      assert.ok(game.renderer.levelBuffers?.vertexCount > 0, 'level mesh uploaded');
      // settings control the renderer mode
      game.setSetting('renderer', '2d');
      assert.equal(game.settings.renderer, '2d');
    });

    test('falls back to the 2D renderer without WebGL', () => {
      const game = new Game({ canvas: fakeCanvas(null, fake2d()), lang: 'en' });
      game.storage = new Storage();
      game.saveManager.storage = game.storage;
      assert.ok(game.renderer.is3D !== true, '2D fallback active');
      game.boot();
      game.startNewGame();
      assert.ok(game.player && game.world, 'game boots on the 2D path');
      for (let i = 0; i < 10; i += 1) {
        game.update(1 / 60);
        game.render(0, i);
      }
    });
  });
}

export default registerGfx3dTests;
