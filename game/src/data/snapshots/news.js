/**
 * snapshots/news.js — baked GitHub release/commit news shown on the title
 * screen when the live GitHub API is unreachable.
 */
export const SNAPSHOT_NEWS = [
  {
    id: 'release-v1.0.0',
    kind: 'release',
    title: 'v1.0.0 — Sands of Aether launch',
    body: 'First release: 40 levels, 5 biomes, bosses, crafting, quests, AR/EN, low-end performance mode, and five tool integrations (Google Docs, Notion, Supabase, GitHub, Linear).',
    url: 'https://github.com/ykashkush2014-blip/search-arena/releases',
    at: '2026-11-23',
  },
  {
    id: 'commit-engine',
    kind: 'commit',
    title: 'Add fixed-timestep engine with headless test pump',
    body: '',
    url: 'https://github.com/ykashkush2014-blip/search-arena',
    at: '2026-11-23',
  },
  {
    id: 'commit-integrations',
    kind: 'commit',
    title: 'Wire Supabase leaderboard and offline queue',
    body: '',
    url: 'https://github.com/ykashkush2014-blip/search-arena',
    at: '2026-11-23',
  },
];
