/**
 * githubClient.js — patch notes / release news from the project's GitHub
 * repository, plus a "report a bug" deep link. This integration works with
 * zero configuration thanks to GitHub's public REST API.
 */
import { SNAPSHOT_NEWS } from '../data/snapshots/news.js';

const GITHUB_API = 'https://api.github.com';

export class GithubClient {
  /**
   * @param {object} config { repo, repoUrl, issuesUrl, releasesUrl }
   *        repo: "owner/name"
   */
  constructor(config = {}) {
    this.repo = config.repo ?? 'ykashkush2014-blip/search-arena';
    this.repoUrl = config.repoUrl ?? `https://github.com/${this.repo}`;
    this.issuesUrl = config.issuesUrl ?? `${this.repoUrl}/issues/new`;
    this.releasesUrl = config.releasesUrl ?? `${this.repoUrl}/releases`;
    this.cache = null;
  }

  /**
   * Fetch the latest release + recent commits as news items.
   * @returns {Promise<{ok, live, data, detail}>}
   */
  async fetchNews() {
    if (this.cache) return { ok: true, live: this.cache.live, data: this.cache.data };
    try {
      const [releaseRes, commitsRes] = await Promise.all([
        fetch(`${GITHUB_API}/repos/${this.repo}/releases?per_page=3`),
        fetch(`${GITHUB_API}/repos/${this.repo}/commits?per_page=5`),
      ]);
      const news = [];
      if (releaseRes.ok) {
        const releases = await releaseRes.json();
        for (const r of releases) {
          news.push({
            id: `release-${r.tag_name}`,
            kind: 'release',
            title: r.name ?? r.tag_name,
            body: (r.body ?? '').slice(0, 400),
            url: r.html_url,
            at: r.published_at,
          });
        }
      }
      if (commitsRes.ok) {
        const commits = await commitsRes.json();
        for (const c of commits) {
          news.push({
            id: `commit-${c.sha?.slice(0, 7)}`,
            kind: 'commit',
            title: c.commit?.message?.split('\n')[0] ?? 'Update',
            body: '',
            url: c.html_url,
            at: c.commit?.author?.date,
          });
        }
      }
      if (news.length > 0) {
        this.cache = { live: true, data: news };
        return { ok: true, live: true, data: news, detail: 'live from GitHub' };
      }
      throw new Error('empty news');
    } catch (err) {
      this.cache = { live: false, data: SNAPSHOT_NEWS };
      return {
        ok: true,
        live: false,
        data: SNAPSHOT_NEWS,
        detail: 'baked snapshot of repo news',
      };
    }
  }

  bugReportUrl() {
    return this.issuesUrl;
  }

  repoLink() {
    return this.repoUrl;
  }
}
