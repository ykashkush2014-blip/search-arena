/**
 * linearClient.js — the seasonal Quest Board, sourced from a Linear project.
 * Linear's GraphQL API needs an API key, so the game ships with a snapshot of
 * the real board (created via the Linear connector) and supports live reads
 * when the player pastes a key in settings.
 */
import { SNAPSHOT_QUEST_BOARD } from '../data/snapshots/questBoard.js';

const LINEAR_GRAPHQL = 'https://api.linear.app/graphql';

export class LinearClient {
  /**
   * @param {object} config { boardUrl, projectId, apiKey, teamKey }
   */
  constructor(config = {}) {
    this.boardUrl = config.boardUrl ?? null;
    this.projectId = config.projectId ?? null;
    this.teamKey = config.teamKey ?? null;
    this.apiKey = config.apiKey ?? null; // optional, user-supplied (stored locally only)
    this.cache = null;
    this.liveCapable = !!this.apiKey && !!this.projectId;
  }

  /**
   * @returns {Promise<{ok, live, data, detail}>}
   */
  async fetchQuestBoard() {
    if (this.cache) return { ok: true, live: this.cache.live, data: this.cache.data };
    if (this.liveCapable) {
      try {
        const data = await this._fetchLive();
        if (data && data.length > 0) {
          this.cache = { live: true, data };
          return { ok: true, live: true, data, detail: 'live from Linear' };
        }
      } catch (err) {
        // snapshot fallback
      }
    }
    this.cache = { live: false, data: SNAPSHOT_QUEST_BOARD };
    return {
      ok: true,
      live: false,
      data: SNAPSHOT_QUEST_BOARD,
      detail: this.boardUrl ? 'baked snapshot of the Linear quest board' : 'local quest board',
    };
  }

  async _fetchLive() {
    const query = `
      query QuestBoard($projectId: String!) {
        project(id: $projectId) {
          issues(first: 25) {
            nodes {
              identifier
              title
              description
              priority
              state { name type }
              labels { nodes { name } }
            }
          }
        }
      }
    `;
    const res = await fetch(LINEAR_GRAPHQL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: this.apiKey,
      },
      body: JSON.stringify({ query, variables: { projectId: this.projectId } }),
    });
    if (!res.ok) throw new Error(`linear ${res.status}`);
    const json = await res.json();
    const nodes = json?.data?.project?.issues?.nodes ?? [];
    return nodes.map((issue) => ({
      id: issue.identifier,
      name: { en: issue.title, ar: issue.title },
      desc: {
        en: issue.description ?? '',
        ar: issue.description ?? '',
      },
      priority: issue.priority,
      state: issue.state?.name ?? 'Backlog',
      labels: (issue.labels?.nodes ?? []).map((l) => l.name),
      kind: 'seasonal',
    }));
  }

  boardLink() {
    return this.boardUrl;
  }
}
