/**
 * integrationManager.js — orchestrates the five connected tools:
 *   1. GitHub      — release news + bug reporting (works keyless)
 *   2. Supabase    — leaderboard + cloud saves (anon key / publishable key)
 *   3. Notion      — game codex / lore wiki (snapshot + optional live)
 *   4. Google Docs — design doc & story (snapshot + optional live)
 *   5. Linear      — quest board / roadmap (snapshot + optional live)
 *
 * Every integration degrades gracefully: live → snapshot → offline. The game
 * is fully playable with zero network access.
 */
import { gameEvents, Events } from '../core/events.js';

export const IntegrationStatus = {
  OFFLINE: 'offline',
  SNAPSHOT: 'snapshot',
  LIVE: 'live',
  ERROR: 'error',
};

export class IntegrationManager {
  /**
   * @param {object} opts { config, clients, storage, queue }
   */
  constructor(opts = {}) {
    this.config = opts.config ?? {};
    this.clients = opts.clients ?? {};
    this.storage = opts.storage ?? null;
    this.queue = opts.queue ?? null;
    this.status = new Map(); // tool -> { status, detail, at }
    this.news = [];
    this.leaderboardCache = [];
    this.codexCache = [];
    this.storyCache = [];
    this.questBoardCache = [];
  }

  /** Kick off all non-blocking initializations. */
  init() {
    for (const tool of ['github', 'supabase', 'notion', 'googleDocs', 'linear']) {
      this.status.set(tool, { status: IntegrationStatus.OFFLINE, detail: 'pending', at: Date.now() });
    }
    // fire and forget — never blocks the title screen
    this._safeAsync('github', () => this.clients.github?.fetchNews?.());
    this._safeAsync('supabase', () => this.clients.supabase?.ping?.());
    this._safeAsync('notion', () => this.clients.notion?.fetchCodex?.());
    this._safeAsync('googleDocs', () => this.clients.googleDocs?.fetchStory?.());
    this._safeAsync('linear', () => this.clients.linear?.fetchQuestBoard?.());
    return this;
  }

  async _safeAsync(tool, fn) {
    try {
      const result = await fn();
      if (result && result.ok) {
        this.setStatus(tool, result.live ? IntegrationStatus.LIVE : IntegrationStatus.SNAPSHOT, result.detail ?? '');
        return result;
      }
      this.setStatus(tool, IntegrationStatus.SNAPSHOT, result?.detail ?? 'snapshot data');
      return result;
    } catch (err) {
      this.setStatus(tool, IntegrationStatus.ERROR, err?.message ?? 'error');
      return null;
    }
  }

  setStatus(tool, status, detail = '') {
    this.status.set(tool, { status, detail, at: Date.now() });
    gameEvents.emit(Events.INTEGRATION_STATUS, { tool, status, detail });
    if (this.storage) this.storage.markSync(tool, status, detail);
  }

  getStatus(tool) {
    return this.status.get(tool) ?? { status: IntegrationStatus.OFFLINE, detail: '' };
  }

  /** Compact list for the title strip and the codex screen. */
  statusList() {
    const meta = {
      github: { short: 'GitHub', icon: '🐙', link: this.config.github?.repoUrl },
      supabase: { short: 'Supabase', icon: '⚡', link: this.config.supabase?.projectUrl },
      notion: { short: 'Notion', icon: '📓', link: this.config.notion?.wikiUrl },
      googleDocs: { short: 'GDocs', icon: '📄', link: this.config.googleDocs?.docUrl },
      linear: { short: 'Linear', icon: '📐', link: this.config.linear?.boardUrl },
    };
    return Object.entries(meta).map(([tool, m]) => {
      const s = this.getStatus(tool);
      return {
        id: tool,
        short: m.short,
        icon: m.icon,
        link: m.link,
        status: s.status,
        detail: s.detail,
        name: { en: m.short, ar: m.short },
        desc: {
          en: `${m.short}: ${s.status}${s.detail ? ` — ${s.detail}` : ''}`,
          ar: `${m.short}: ${s.status}${s.detail ? ` — ${s.detail}` : ''}`,
        },
      };
    });
  }

  // ------------------------------------------------------------- news

  async fetchNews() {
    const res = await this._safeAsync('github', () => this.clients.github?.fetchNews?.());
    if (res?.data) {
      this.news = res.data;
      gameEvents.emit(Events.NEWS_UPDATE, { news: this.news });
    }
    return this.news;
  }

  // ------------------------------------------------------- leaderboard

  async fetchLeaderboard() {
    try {
      const res = await this.clients.supabase?.fetchLeaderboard?.();
      if (res?.ok && res.data) {
        this.leaderboardCache = res.data;
        this.setStatus('supabase', res.live ? IntegrationStatus.LIVE : IntegrationStatus.SNAPSHOT, 'leaderboard');
        gameEvents.emit(Events.LEADERBOARD_UPDATE, { entries: res.data });
        return res.data;
      }
    } catch (err) {
      this.setStatus('supabase', IntegrationStatus.SNAPSHOT, 'leaderboard offline');
    }
    return this.leaderboardCache.length > 0 ? this.leaderboardCache : null;
  }

  async submitScore(name, score, stats = {}) {
    const entry = { name, score, stats, at: Date.now() };
    try {
      const res = await this.clients.supabase?.submitScore?.(entry);
      if (res?.ok) {
        this.setStatus('supabase', res.live ? IntegrationStatus.LIVE : IntegrationStatus.SNAPSHOT, 'score submitted');
        return true;
      }
    } catch (err) {
      /* fall through to queue */
    }
    if (this.queue) {
      this.queue.push('leaderboard', entry);
      return true;
    }
    return false;
  }

  // -------------------------------------------------------- cloud save

  async pushSave(saveData) {
    try {
      const res = await this.clients.supabase?.pushSave?.(saveData);
      if (res?.ok) {
        gameEvents.emit(Events.CLOUD_SYNC, { direction: 'push', ok: true });
        return true;
      }
    } catch (err) {
      /* offline */
    }
    if (this.queue) this.queue.push('save', saveData);
    gameEvents.emit(Events.CLOUD_SYNC, { direction: 'push', ok: false });
    return false;
  }

  async pullSave() {
    try {
      const res = await this.clients.supabase?.pullSave?.();
      if (res?.ok && res.data) {
        gameEvents.emit(Events.CLOUD_SYNC, { direction: 'pull', ok: true });
        return res.data;
      }
    } catch (err) {
      /* offline */
    }
    return null;
  }

  // --------------------------------------------------------- content

  async fetchCodex() {
    const res = await this._safeAsync('notion', () => this.clients.notion?.fetchCodex?.());
    if (res?.data) this.codexCache = res.data;
    return this.codexCache;
  }

  async fetchStory() {
    const res = await this._safeAsync('googleDocs', () => this.clients.googleDocs?.fetchStory?.());
    if (res?.data) this.storyCache = res.data;
    return this.storyCache;
  }

  async fetchQuestBoard() {
    const res = await this._safeAsync('linear', () => this.clients.linear?.fetchQuestBoard?.());
    if (res?.data) this.questBoardCache = res.data;
    return this.questBoardCache;
  }

  /** Flush queued offline actions when connectivity returns. */
  async flushQueue() {
    if (!this.queue || this.queue.size === 0) return 0;
    const items = this.queue.drain();
    let done = 0;
    for (const item of items) {
      try {
        if (item.kind === 'leaderboard' && this.clients.supabase?.submitScore) {
          const res = await this.clients.supabase.submitScore(item.payload);
          if (res?.ok) done += 1;
        } else if (item.kind === 'save' && this.clients.supabase?.pushSave) {
          const res = await this.clients.supabase.pushSave(item.payload);
          if (res?.ok) done += 1;
        }
      } catch (err) {
        this.queue.push(item.kind, item.payload);
      }
    }
    if (done > 0) gameEvents.emit(Events.OFFLINE_QUEUE_FLUSH, { done });
    return done;
  }

  /** Called by the game every ~30s while running. */
  tick() {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    this.flushQueue().catch(() => {});
  }

  /** Report a bug — opens the GitHub issues page (new issue URL). */
  bugReportUrl() {
    return this.config.github?.issuesUrl ?? null;
  }
}
