/**
 * integrationConfig.js — public configuration for the five connected tools.
 * Provisioned 2026-11-23 via Arena connectors.
 *
 * SECURITY NOTE: only *publishable* values live here (URLs, publishable/anon
 * keys, public page ids). Secret keys are NEVER stored in the repository —
 * users may paste personal tokens in the in-game settings screen, which are
 * kept in localStorage only. The Supabase key below is the sb_publishable_*
 * key, safe for client-side use.
 */
export const INTEGRATION_CONFIG = {
  github: {
    repo: 'ykashkush2014-blip/search-arena',
    repoUrl: 'https://github.com/ykashkush2014-blip/search-arena',
    issuesUrl: 'https://github.com/ykashkush2014-blip/search-arena/issues/new',
    releasesUrl: 'https://github.com/ykashkush2014-blip/search-arena/releases',
    enabled: true,
  },
  supabase: {
    // Project "ykashkush2014@gmail.com" (ref mbltidbcvxtliyxfyzry, ACTIVE_HEALTHY)
    projectUrl: 'https://mbltidbcvxtliyxfyzry.supabase.co',
    // Publishable key (sb_publishable_*) — safe for browsers. Never commit
    // the service_role or sb_secret_* keys.
    anonKey: 'sb_publishable_FQ5x-DrTmKXVYRyGTpt2Zw_Zw7ZOpmn',
    tables: {
      leaderboard: 'sands_leaderboard',
      saves: 'sands_saves',
    },
    leaderboardTable: 'sands_leaderboard',
    savesTable: 'sands_saves',
    enabled: true,
  },
  notion: {
    // "Sands of Aether — Codex Wiki / موسوعة اللعبة" under the "البداية" page
    wikiUrl: 'https://app.notion.com/p/Sands-of-Aether-Codex-Wiki-4212d5775fd181b78098ce12910344d0',
    wikiPageId: '4212d577-5fd1-81b7-8098-ce12910344d0',
    proxyUrl: null,
    enabled: true,
  },
  googleDocs: {
    // "Sands of Aether — Game Design Document & Story Bible"
    docUrl: 'https://docs.google.com/document/d/1xJ8YijiIv7JOOXisJIAyIsJPsi_cTdVwX_hhW46WrMU/edit',
    docId: '1xJ8YijiIv7JOOXisJIAyIsJPsi_cTdVwX_hhW46WrMU',
    publishUrl: null,
    enabled: true,
  },
  linear: {
    // Project "Sands of Aether — Seasonal Quest Board" on team YUS (Yusef.kash)
    boardUrl: 'https://linear.app/yusefkash/project/2be62650-c19c-45a3-bb74-98e72110dec8',
    projectId: '2be62650-c19c-45a3-bb74-98e72110dec8',
    teamId: '716d9181-f4b9-4d32-b038-ed592edb49bb',
    teamKey: 'YUS',
    // Season 1 quest issues (YUS-5 … YUS-9)
    issueIds: ['YUS-5', 'YUS-6', 'YUS-7', 'YUS-8', 'YUS-9'],
    enabled: true,
  },
  performance: {
    // never hosted on Vercel — static hosting only (GitHub Pages / any CDN)
    host: 'static',
    vercel: false,
  },
};

export default INTEGRATION_CONFIG;
