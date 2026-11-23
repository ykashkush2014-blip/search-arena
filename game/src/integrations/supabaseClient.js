/**
 * supabaseClient.js — leaderboard + cloud saves over Supabase's PostgREST.
 * Uses only the publishable/anon key (designed for browsers) — never a secret
 * key. Every call has a timeout and falls back to bundled snapshot data so
 * the game works fully offline.
 */
import { SNAPSHOT_LEADERBOARD } from '../data/snapshots/leaderboard.js';

const DEFAULT_TIMEOUT = 6000;

export class SupabaseClient {
  /**
   * @param {object} config { projectUrl, anonKey, enabled }
   */
  constructor(config = {}) {
    this.projectUrl = (config.projectUrl ?? '').replace(/\/+$/, '');
    this.anonKey = config.anonKey ?? '';
    this.enabled = config.enabled !== false && this.projectUrl.length > 0;
    this.tables = {
      leaderboard: config.leaderboardTable ?? 'sands_leaderboard',
      saves: config.savesTable ?? 'sands_saves',
    };
    this.playerId = config.playerId ?? null;
  }

  _headers() {
    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (this.anonKey) {
      headers.apikey = this.anonKey;
      headers.Authorization = `Bearer ${this.anonKey}`;
    }
    return headers;
  }

  async _fetch(path, opts = {}) {
    if (!this.enabled) throw new Error('supabase disabled');
    const url = `${this.projectUrl}/rest/v1/${path}`;
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), DEFAULT_TIMEOUT) : null;
    try {
      const res = await fetch(url, {
        ...opts,
        headers: { ...this._headers(), ...(opts.headers ?? {}) },
        signal: controller?.signal,
      });
      if (!res.ok) throw new Error(`supabase ${res.status}`);
      return await res.json();
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async ping() {
    try {
      await this._fetch(`${this.tables.leaderboard}?select=id&limit=1`);
      return { ok: true, live: true, detail: 'connected' };
    } catch (err) {
      return { ok: true, live: false, detail: 'snapshot mode' };
    }
  }

  async fetchLeaderboard(limit = 10) {
    try {
      const rows = await this._fetch(
        `${this.tables.leaderboard}?select=name,score,stats,created_at&order=score.desc&limit=${limit}`,
      );
      return { ok: true, live: true, data: rows.map(mapRow) };
    } catch (err) {
      return { ok: true, live: false, data: SNAPSHOT_LEADERBOARD.slice(0, limit) };
    }
  }

  async submitScore(entry) {
    const body = {
      name: String(entry.name ?? 'Wanderer').slice(0, 24),
      score: Math.round(entry.score ?? 0),
      stats: entry.stats ?? {},
      player_id: this.playerId ?? undefined,
    };
    try {
      await this._fetch(this.tables.leaderboard, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { Prefer: 'return=minimal' },
      });
      return { ok: true, live: true };
    } catch (err) {
      return { ok: false, live: false, detail: err?.message ?? 'submit failed' };
    }
  }

  async pushSave(saveData) {
    if (!this.playerId) {
      return { ok: false, live: false, detail: 'no player id' };
    }
    const body = {
      player_id: this.playerId,
      slot: 'main',
      payload: saveData,
      updated_at: new Date().toISOString(),
    };
    try {
      await this._fetch(this.tables.saves, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      });
      return { ok: true, live: true };
    } catch (err) {
      return { ok: false, live: false, detail: err?.message ?? 'push failed' };
    }
  }

  async pullSave() {
    if (!this.playerId) return { ok: false, live: false, detail: 'no player id' };
    try {
      const rows = await this._fetch(
        `${this.tables.saves}?select=payload,updated_at&player_id=eq.${encodeURIComponent(this.playerId)}&limit=1`,
      );
      if (rows.length > 0) return { ok: true, live: true, data: rows[0].payload };
      return { ok: true, live: true, data: null };
    } catch (err) {
      return { ok: false, live: false, detail: err?.message ?? 'pull failed' };
    }
  }
}

function mapRow(row) {
  return {
    name: row.name ?? '???',
    score: Number(row.score ?? 0),
    stats: row.stats ?? {},
    at: row.created_at ?? null,
  };
}
