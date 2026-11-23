/**
 * notionClient.js — the game's living codex, sourced from a Notion wiki.
 * Notion's API needs a server-side token, so the client ships with a baked
 * snapshot (synced from the real wiki) and supports optional live refresh
 * through a user-provided proxy/token stored locally in settings.
 */
import { SNAPSHOT_CODEX } from '../data/snapshots/codex.js';

export class NotionClient {
  /**
   * @param {object} config { wikiUrl, proxyUrl, token, wikiPageId }
   */
  constructor(config = {}) {
    this.wikiUrl = config.wikiUrl ?? null;
    this.proxyUrl = config.proxyUrl ?? null;
    this.token = config.token ?? null; // optional, user-supplied
    this.wikiPageId = config.wikiPageId ?? null;
    this.cache = null;
    this.liveCapable = !!(this.proxyUrl && this.token);
  }

  /**
   * Fetch the codex. Always resolves — snapshot at minimum.
   * @returns {Promise<{ok, live, data, detail}>}
   */
  async fetchCodex() {
    if (this.cache) return { ok: true, live: this.cache.live, data: this.cache.data };
    if (this.liveCapable) {
      try {
        const data = await this._fetchLive();
        if (data && data.length > 0) {
          this.cache = { live: true, data };
          return { ok: true, live: true, data, detail: 'live from Notion' };
        }
      } catch (err) {
        // fall through to snapshot
      }
    }
    this.cache = { live: false, data: SNAPSHOT_CODEX };
    return {
      ok: true,
      live: false,
      data: SNAPSHOT_CODEX,
      detail: this.wikiUrl ? 'baked snapshot of the Notion wiki' : 'local codex',
    };
  }

  async _fetchLive() {
    const res = await fetch(`${this.proxyUrl}/notion/codex`, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Notion-Version': '2022-06-28',
      },
    });
    if (!res.ok) throw new Error(`notion proxy ${res.status}`);
    const json = await res.json();
    return (json.results ?? []).map((page) => ({
      id: page.id,
      name: {
        en: page.properties?.Name?.title?.[0]?.plain_text ?? 'Entry',
        ar: page.properties?.NameAr?.rich_text?.[0]?.plain_text ?? page.properties?.Name?.title?.[0]?.plain_text ?? 'مدخل',
      },
      desc: {
        en: page.properties?.Summary?.rich_text?.[0]?.plain_text ?? '',
        ar: page.properties?.SummaryAr?.rich_text?.[0]?.plain_text ?? '',
      },
      category: page.properties?.Category?.select?.name ?? 'lore',
    }));
  }

  /** External link for the "open wiki" button. */
  wikiLink() {
    return this.wikiUrl;
  }
}
