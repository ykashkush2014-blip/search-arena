# Sands of Aether — رمال الأثير

An original top-down pixel-art action RPG that runs beautifully on low-end
devices. Vanilla JavaScript + Canvas2D, zero dependencies, no build step,
**no Vercel**.

## Run it

```bash
cd game
npm run serve     # static server on http://localhost:8080 (binds 0.0.0.0)
```

Or open `index.html` through any static file host.

## Develop

```bash
npm run gen       # regenerate the 40-level campaign (deterministic)
npm test          # headless test harness (69 tests, DOM-stubbed)
npm run lines     # enforce the 30K effective-line budget
npm run verify    # gen + test + lines
```

## What's inside

| Area | Contents |
| --- | --- |
| `src/core` | engine (fixed timestep), 2D renderer (480×270 buffer), input, audio, particles, pooling, tweens, checksummed storage |
| `src/gfx` | procedural tile/sprite atlas, bitmap font with RTL, palettes |
| `src/gfx3d` | WebGL low-poly renderer: mat4 math, vertex-lit shaders, 3/4 camera, level meshes, posed actor meshes |
| `src/world` | tilemap + collision, A* pathfinding, dungeon generator |
| `src/entities` | player, enemies + AI, bosses (6 patterns), projectiles, loot, NPCs |
| `src/systems` | combat, inventory, skills (8), crafting (18 recipes), quests (39), dialogue, weather (6 types), day/night, achievements, shop, minimap |
| `src/ui` | canvas UI toolkit, HUD, menus, screens, touch controls |
| `src/integrations` | GitHub, Supabase, Notion, Google Docs, Linear clients + offline queue |
| `src/data` | items, enemies, skills, recipes, quests, dialogues, lore, balance, integration config, snapshots |
| `src/data/generated` | the 40-level campaign emitted by `tools/gen-content.js` |
| `tools` | content generator, line-budget checker, static server |
| `tests` | headless harness that boots and plays the real game |

## 3D world (with 2D fallback)

The game renders its world twice over:

- **3D (default)** — a WebGL pipeline (`src/gfx3d`): the tilemap becomes a
  vertex-colored low-poly mesh (walls, trees, crystals, water), and every
  character is a procedural box-model with posed limbs (walk cycles, attacks,
  opening chests). Two tiny shader programs: vertex-lit + fog, and additive
  glow billboards for portals/projectiles. HUD, menus and dialogue draw on a
  2D overlay canvas stacked above the GL canvas.
- **2D (fallback & option)** — the original pixel-art Canvas2D path. It is the
  automatic fallback when WebGL is missing, and can be forced from
  Settings → Graphics (`auto` / `3d` / `2d`, stored in localStorage).

Weak-device support carries over: the 3D pass renders at 0.55–1× the 480×270
buffer (the quality governor shrinks the render target instead of dropping
frames), geometry is a few thousand untextured triangles, and there are zero
downloaded assets.

## Performance on weak devices

- 480×270 internal render buffer, nearest-neighbour upscale
- Procedural sprites/tiles — no downloaded assets, nothing to preload
- Adaptive quality governor: LOW (30fps render, tiny particle budget) → HIGH
- Object pooling for projectiles/particles, spatial hashing, capped catch-up
- Offline-first integrations: live when online, embedded snapshots when not

## The five connected tools

1. **GitHub** — releases & news, bug-report links (`ykashkush2014-blip/search-arena`)
2. **Supabase** — `sands_leaderboard` & `sands_saves` (publishable key only)
3. **Notion** — living codex wiki
4. **Google Docs** — game design document & story bible
5. **Linear** — seasonal quest board (team YUS, project "Seasonal Quest Board")

All IDs live in `src/data/integrationConfig.js`. Secret keys are never
committed; the game degrades gracefully to snapshots when offline.

## Languages

Full Arabic (RTL) and English, switchable at runtime.
