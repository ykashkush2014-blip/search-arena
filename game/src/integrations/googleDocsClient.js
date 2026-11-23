/**
 * googleDocsClient.js — story & design doc sourced from Google Docs.
 * Public docs can be read keylessly via the export endpoint; private docs use
 * the baked snapshot (synced when the doc is updated). The in-game Story
 * screen renders these entries.
 */
import { SNAPSHOT_STORY } from '../data/snapshots/story.js';

export class GoogleDocsClient {
  /**
   * @param {object} config { docUrl, docId, publishUrl }
   */
  constructor(config = {}) {
    this.docUrl = config.docUrl ?? null;
    this.docId = config.docId ?? null;
    this.publishUrl = config.publishUrl ?? null; // e.g. https://docs.google.com/document/d/<id>/export?format=txt
    this.cache = null;
    this.liveCapable = !!this.publishUrl;
  }

  /**
   * @returns {Promise<{ok, live, data, detail}>}
   */
  async fetchStory() {
    if (this.cache) return { ok: true, live: this.cache.live, data: this.cache.data };
    if (this.liveCapable) {
      try {
        const res = await fetch(this.publishUrl);
        if (res.ok) {
          const text = await res.text();
          const chapters = parseChapters(text);
          if (chapters.length > 0) {
            this.cache = { live: true, data: chapters };
            return { ok: true, live: true, data: chapters, detail: 'live from Google Docs' };
          }
        }
      } catch (err) {
        // snapshot fallback
      }
    }
    this.cache = { live: false, data: SNAPSHOT_STORY };
    return {
      ok: true,
      live: false,
      data: SNAPSHOT_STORY,
      detail: this.docUrl ? 'baked snapshot of the design doc' : 'local story',
    };
  }

  docLink() {
    return this.docUrl;
  }
}

/**
 * Parse exported doc text into chapters. Lines starting with '#' or
 * "Chapter/فصل" start a new chapter.
 */
export function parseChapters(text) {
  const lines = String(text ?? '').split(/\r?\n/);
  const chapters = [];
  let current = null;
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^#{1,3}\s+/.test(trimmed) || /^(chapter|فصل)\b/i.test(trimmed)) {
      if (current) chapters.push(current);
      current = {
        id: `chapter-${chapters.length + 1}`,
        name: { en: trimmed.replace(/^#{1,3}\s+/, ''), ar: trimmed.replace(/^#{1,3}\s+/, '') },
        desc: { en: '', ar: '' },
        paragraphs: [],
      };
    } else if (trimmed && current) {
      current.paragraphs.push(trimmed);
    }
  }
  if (current) chapters.push(current);
  for (const ch of chapters) {
    const body = ch.paragraphs.join('\n');
    ch.desc = { en: body, ar: body };
  }
  return chapters;
}
