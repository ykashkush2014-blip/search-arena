// Procedural 4x4 pixel-art texture atlas (16px tiles) drawn on a canvas.
// Keeps the game a single self-contained folder with zero image assets.

const TILE = 16;
const ATLAS_COLS = 4;
const ATLAS_SIZE = TILE * ATLAS_COLS;

function rnd(seedRef) {
  // tiny deterministic PRNG for speckles
  seedRef.v = (seedRef.v * 1664525 + 1013904223) >>> 0;
  return seedRef.v / 4294967296;
}

function noiseFill(ctx, x0, y0, base, spots, seedRef, size = TILE) {
  ctx.fillStyle = base;
  ctx.fillRect(x0, y0, size, size);
  for (const [color, count, maxAlpha] of spots) {
    for (let i = 0; i < count; i++) {
      const px = x0 + Math.floor(rnd(seedRef) * size);
      const py = y0 + Math.floor(rnd(seedRef) * size);
      ctx.globalAlpha = 0.25 + rnd(seedRef) * (maxAlpha - 0.25);
      ctx.fillStyle = color;
      ctx.fillRect(px, py, 1 + Math.floor(rnd(seedRef) * 2), 1 + Math.floor(rnd(seedRef) * 2));
    }
  }
  ctx.globalAlpha = 1;
}

function drawTile(ctx, index, painter) {
  const x = (index % ATLAS_COLS) * TILE;
  const y = Math.floor(index / ATLAS_COLS) * TILE;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, TILE, TILE);
  ctx.clip();
  ctx.translate(x, y);
  painter(0, 0);
  ctx.restore();
}

export function createAtlasCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_SIZE;
  canvas.height = ATLAS_SIZE;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const seedRef = { v: 20240711 };

  // 0 grass top
  drawTile(ctx, 0, (x, y) => {
    noiseFill(ctx, x, y, '#6fa83f', [['#7fbd4c', 70, 0.8], ['#587f31', 40, 0.6], ['#93cf62', 25, 0.7]], seedRef);
  });
  // 1 grass side
  drawTile(ctx, 1, (x, y) => {
    noiseFill(ctx, x, y, '#8a6141', [['#75523a', 60, 0.7], ['#9b7050', 40, 0.6]], seedRef);
    ctx.fillStyle = '#6fa83f';
    ctx.fillRect(x, y, TILE, 4);
    for (let i = 0; i < TILE; i++) {
      const h = 1 + ((i * 7 + 3) % 3);
      ctx.fillRect(x + i, y + 4, 1, h);
    }
    ctx.fillStyle = '#84bd4f';
    ctx.fillRect(x, y, TILE, 1);
  });
  // 2 dirt
  drawTile(ctx, 2, (x, y) => {
    noiseFill(ctx, x, y, '#8a6141', [['#75523a', 80, 0.8], ['#a07755', 40, 0.6], ['#5d4230', 25, 0.6]], seedRef);
  });
  // 3 stone
  drawTile(ctx, 3, (x, y) => {
    noiseFill(ctx, x, y, '#8d8d8d', [['#a3a3a3', 60, 0.6], ['#767676', 60, 0.7], ['#b5b5b5', 20, 0.5]], seedRef);
  });
  // 4 sand
  drawTile(ctx, 4, (x, y) => {
    noiseFill(ctx, x, y, '#e3d59f', [['#efe4b6', 60, 0.7], ['#cdbd88', 50, 0.7]], seedRef);
  });
  // 5 log side
  drawTile(ctx, 5, (x, y) => {
    noiseFill(ctx, x, y, '#6b4a2b', [['#583c22', 40, 0.8], ['#7d5833', 40, 0.7]], seedRef);
    ctx.fillStyle = '#4d341d';
    for (const bx of [2, 7, 12]) ctx.fillRect(x + bx, y, 1, TILE);
    ctx.fillStyle = '#8a6238';
    for (const bx of [4, 10, 14]) ctx.fillRect(x + bx, y, 1, TILE);
  });
  // 6 log top
  drawTile(ctx, 6, (x, y) => {
    noiseFill(ctx, x, y, '#a3803f', [['#b8934c', 40, 0.7], ['#8a6a32', 30, 0.6]], seedRef);
    ctx.strokeStyle = '#6b4a2b';
    ctx.lineWidth = 1;
    for (let r = 2; r < 8; r += 2) {
      ctx.beginPath();
      ctx.arc(x + 8, y + 8, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  });
  // 7 leaves (semi-random holes)
  drawTile(ctx, 7, (x, y) => {
    noiseFill(ctx, x, y, '#3f7f2c', [['#4e9436', 90, 0.9], ['#2f6321', 70, 0.9], ['#63ab45', 30, 0.8]], seedRef);
    for (let i = 0; i < 22; i++) {
      ctx.clearRect(x + Math.floor(rnd(seedRef) * TILE), y + Math.floor(rnd(seedRef) * TILE), 1, 1);
    }
  });
  // 8 planks
  drawTile(ctx, 8, (x, y) => {
    noiseFill(ctx, x, y, '#b08a4e', [['#c19a5c', 40, 0.6], ['#9a7641', 40, 0.6]], seedRef);
    ctx.fillStyle = '#8a6a3a';
    for (const by of [0, 5, 10, 15]) ctx.fillRect(x, y + by, TILE, 1);
    ctx.fillRect(x + 4, y, 1, 5);
    ctx.fillRect(x + 11, y + 5, 1, 5);
    ctx.fillRect(x + 6, y + 10, 1, 5);
  });
  // 9 bricks
  drawTile(ctx, 9, (x, y) => {
    noiseFill(ctx, x, y, '#a8443a', [['#b95448', 40, 0.6], ['#8f382f', 40, 0.6]], seedRef);
    ctx.fillStyle = '#d9cec2';
    for (const by of [0, 5, 10, 15]) ctx.fillRect(x, y + by, TILE, 1);
    ctx.fillRect(x + 4, y + 1, 1, 4);
    ctx.fillRect(x + 11, y + 6, 1, 4);
    ctx.fillRect(x + 4, y + 11, 1, 4);
  });
  // 10 glass
  drawTile(ctx, 10, (x, y) => {
    ctx.clearRect(x, y, TILE, TILE);
    ctx.fillStyle = 'rgba(205,238,250,0.28)';
    ctx.fillRect(x, y, TILE, TILE);
    ctx.fillStyle = 'rgba(235,250,255,0.85)';
    ctx.fillRect(x, y, TILE, 1);
    ctx.fillRect(x, y + TILE - 1, TILE, 1);
    ctx.fillRect(x, y, 1, TILE);
    ctx.fillRect(x + TILE - 1, y, 1, TILE);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillRect(x + 3, y + 3, 4, 1);
    ctx.fillRect(x + 3, y + 3, 1, 4);
  });
  // 11 water
  drawTile(ctx, 11, (x, y) => {
    noiseFill(ctx, x, y, '#3a7fc9', [['#4a93de', 60, 0.7], ['#2f6cb0', 50, 0.7]], seedRef, TILE);
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    for (let i = 0; i < 4; i++) ctx.fillRect(x, y + i * 4 + 1, TILE, 1);
  });
  // 12 cobblestone
  drawTile(ctx, 12, (x, y) => {
    noiseFill(ctx, x, y, '#7d7d7d', [['#909090', 50, 0.7], ['#666666', 50, 0.7]], seedRef);
    ctx.strokeStyle = '#5a5a5a';
    for (let i = 0; i < 5; i++) {
      const cx = x + 2 + Math.floor(rnd(seedRef) * 10);
      const cy = y + 2 + Math.floor(rnd(seedRef) * 10);
      const w = 3 + Math.floor(rnd(seedRef) * 4);
      ctx.strokeRect(cx, cy, w, w);
    }
  });
  // 13 snow
  drawTile(ctx, 13, (x, y) => {
    noiseFill(ctx, x, y, '#f2f7ff', [['#ffffff', 50, 0.9], ['#dbe6f5', 40, 0.7]], seedRef);
  });
  // 14 lamp
  drawTile(ctx, 14, (x, y) => {
    noiseFill(ctx, x, y, '#8a6a2a', [['#a9853a', 40, 0.7], ['#6f5320', 40, 0.7]], seedRef);
    ctx.fillStyle = '#ffd86b';
    ctx.fillRect(x + 3, y + 3, 10, 10);
    ctx.fillStyle = '#fff2b8';
    ctx.fillRect(x + 5, y + 5, 6, 6);
  });
  // 15 unused / spare (cracked stone)
  drawTile(ctx, 15, (x, y) => {
    noiseFill(ctx, x, y, '#6f6f6f', [['#5c5c5c', 40, 0.7], ['#828282', 40, 0.7]], seedRef);
  });

  return canvas;
}

/**
 * Builds an isometric cube icon for a hotbar/inventory slot by clipping the
 * atlas tile onto three parallelograms (top / left / right faces).
 */
export function createBlockIcon(id, tiles, size = 48) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const atlas = getAtlasCanvas();
  const tileXY = (index) => [(index % ATLAS_COLS) * TILE, Math.floor(index / ATLAS_COLS) * TILE];

  const k = size / 48;              // design grid is 48 x 48
  const hw = 13;                    // half width of the cube
  const hh = hw * 0.5;              // half height of the top rhombus
  const body = 19;                  // vertical length of the side faces
  const cx = 24;
  const top = 6;
  const [tx, ty] = tileXY(tiles[0]);
  const [sx, sy] = tileXY(tiles[1]);

  const drawFace = (ax, ay, ux, uy, vx, vy, tile, darken) => {
    ctx.save();
    ctx.setTransform(k, 0, 0, k, 0, 0);
    // Clip to the parallelogram.
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(ax + ux, ay + uy);
    ctx.lineTo(ax + ux + vx, ay + uy + vy);
    ctx.lineTo(ax + vx, ay + vy);
    ctx.closePath();
    ctx.save();
    ctx.clip();
    // Map the unit square onto the parallelogram and draw the tile.
    ctx.setTransform(k * ux, k * uy, k * vx, k * vy, k * ax, k * ay);
    ctx.drawImage(atlas, tile[0], tile[1], TILE, TILE, 0, 0, 1, 1);
    ctx.restore();
    if (darken > 0) {
      ctx.fillStyle = `rgba(6,10,20,${darken})`;
      ctx.fill();
    }
    ctx.restore();
  };

  // Top face: top vertex, u -> right corner, v -> left corner.
  drawFace(cx, top, hw, hh, -hw, hh, [tx, ty], 0);
  // Left face.
  drawFace(cx - hw, top + hh, hw, hh, 0, body, [sx, sy], 0.16);
  // Right face.
  drawFace(cx, top + hh * 2, hw, -hh, 0, body, [sx, sy], 0.38);

  return canvas;
}

let atlasCanvas = null;
export function getAtlasCanvas() {
  if (!atlasCanvas) atlasCanvas = createAtlasCanvas();
  return atlasCanvas;
}
