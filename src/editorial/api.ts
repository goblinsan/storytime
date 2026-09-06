import type {
  CanonEntityCounts,
  CanonSearchResult,
  CrossUniverseBriefing,
  EditorialEntityType,
  GlobalDashboardResponse,
  UniverseSummary,
} from './types';

/**
 * The editorial frontend's only route to the server.
 *
 * Errors are thrown, not swallowed: a surface decides how to present a failure,
 * and a client that returns an empty list on a 500 makes "nothing here" and
 * "the request failed" indistinguishable. Every call takes an AbortSignal so a
 * surface can cancel on unmount.
 */

const API_BASE = `${import.meta.env.BASE_URL.replace(/\/+$/, '')}/api`;

export class EditorialApiError extends Error {
  readonly status: number;
  constructor(status: number, method: string, path: string) {
    super(`${method} ${path} failed: ${status}`);
    this.name = 'EditorialApiError';
    this.status = status;
  }
}

async function request<T>(
  method: string,
  path: string,
  { signal, body }: { signal?: AbortSignal; body?: unknown } = {},
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    signal,
    headers: body === undefined ? { Accept: 'application/json' } : {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) throw new EditorialApiError(response.status, method, path);

  const text = await response.text();
  if (!text) return null as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    // A 200 that is not JSON is a proxy or an index.html fallback, not data.
    throw new EditorialApiError(response.status, method, path);
  }
}

/** The shape server/routes/stories.js returns for a project. */
interface StoryRow {
  id: string;
  title: string;
  description: string | null;
  type?: string;
  updatedAt?: string;
  createdAt?: string;
  counts?: {
    characters?: number;
    locations?: number;
    factions?: number;
    timelineEvents?: number;
    bestiary?: number;
    drafts?: number;
    derivatives?: number;
  };
}

const emptyCounts = (): CanonEntityCounts => ({
  characters: 0, locations: 0, factions: 0, timelineEvents: 0,
  bestiaryEntries: 0, technologies: 0, mysterySignals: 0, arcs: 0, relationships: 0,
});

function toUniverseSummary(row: StoryRow): UniverseSummary {
  const c = row.counts ?? {};
  return {
    id: String(row.id),
    title: row.title ?? 'Untitled universe',
    description: row.description ?? '',
    canonCounts: {
      ...emptyCounts(),
      characters: c.characters ?? 0,
      locations: c.locations ?? 0,
      factions: c.factions ?? 0,
      timelineEvents: c.timelineEvents ?? 0,
      bestiaryEntries: c.bestiary ?? 0,
    },
    worksCount: c.derivatives ?? 0,
    // Until the concerns table exists, no universe claims to have concerns.
    // Reporting zero is honest; inventing a number would not be.
    concernsCount: 0,
    lastActiveAt: row.updatedAt,
  };
}

const sum = (universes: UniverseSummary[], pick: (u: UniverseSummary) => number) =>
  universes.reduce((total, u) => total + pick(u), 0);

function briefingFor(universes: UniverseSummary[]): CrossUniverseBriefing {
  const totalCanonEntities = sum(universes, (u) =>
    Object.values(u.canonCounts).reduce((a, b) => a + b, 0));
  const totalWorks = sum(universes, (u) => u.worksCount);

  return {
    headline: universes.length === 0
      ? 'No universes yet'
      : `${universes.length} ${universes.length === 1 ? 'universe' : 'universes'} in the codex`,
    summary: universes.length === 0
      ? 'Create the first universe to begin charting its canon.'
      : `${totalCanonEntities.toLocaleString()} canon entities across ${universes.length} ${universes.length === 1 ? 'universe' : 'universes'}, with ${totalWorks} derivative ${totalWorks === 1 ? 'work' : 'works'}.`,
    totalUniverses: universes.length,
    totalWorks,
    totalCanonEntities,
    openConcernsCount: 0,
    readyRepairsCount: 0,
  };
}

export const editorialApi = {
  async listUniverses(signal?: AbortSignal): Promise<UniverseSummary[]> {
    const rows = await request<StoryRow[]>('GET', '/stories', { signal });
    return (rows ?? []).map(toUniverseSummary);
  },

  async getUniverse(id: string, signal?: AbortSignal): Promise<UniverseSummary> {
    const row = await request<StoryRow>('GET', `/stories/${encodeURIComponent(id)}`, { signal });
    return toUniverseSummary(row);
  },

  /**
   * The cross-universe briefing. Concerns, activity and repairs are served
   * empty until the editorial workspace tables exist; the surfaces render
   * their empty states rather than being given invented rows.
   */
  async getGlobalDashboard(signal?: AbortSignal): Promise<GlobalDashboardResponse> {
    const universes = await editorialApi.listUniverses(signal);
    return {
      briefing: briefingFor(universes),
      universes,
      activeConcerns: [],
      recentActivity: [],
      pendingRepairs: [],
      systemStatus: { status: 'ok', activeGenerationsCount: 0, queuedTasksCount: 0 },
    };
  },

  async getEncyclopedia(universeId: string, signal?: AbortSignal): Promise<unknown> {
    return request('GET', `/stories/${encodeURIComponent(universeId)}/encyclopedia`, { signal });
  },

  /**
   * Canon search across every universe. Performed client-side over the
   * encyclopedia aggregates until a server-side search endpoint exists, so the
   * result shape is already the one the surfaces consume.
   */
  async searchCanon(
    query: string,
    options: { universeId?: string; signal?: AbortSignal } = {},
  ): Promise<CanonSearchResult[]> {
    const term = query.trim().toLowerCase();
    if (!term) return [];

    const universes = options.universeId
      ? [await editorialApi.getUniverse(options.universeId, options.signal)]
      : await editorialApi.listUniverses(options.signal);

    const results: CanonSearchResult[] = [];
    for (const universe of universes) {
      const catalog = await editorialApi
        .getEncyclopedia(universe.id, options.signal)
        .catch(() => null);
      if (!catalog || typeof catalog !== 'object') continue;

      for (const [group, entityType] of Object.entries(SEARCHABLE_GROUPS)) {
        const rows = (catalog as Record<string, unknown>)[group];
        if (!Array.isArray(rows)) continue;

        for (const raw of rows) {
          const row = raw as Record<string, unknown>;
          const name = String(row.name ?? row.title ?? '');
          const summary = String(row.description ?? row.summary ?? '');
          const haystack = `${name} ${summary}`.toLowerCase();
          if (!haystack.includes(term)) continue;

          results.push({
            id: String(row.id ?? name),
            universeId: universe.id,
            universeTitle: universe.title,
            entityType,
            name,
            summary,
            // A name hit outranks a hit that only appears in the summary.
            matchScore: name.toLowerCase().includes(term) ? 1 : 0.5,
            matchSnippet: summary ? summary.slice(0, 180) : undefined,
            isProtected: row.is_protected === true || row.isProtected === true,
            tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
            updatedAt: String(row.updated_at ?? row.updatedAt ?? ''),
          });
        }
      }
    }
    return results.sort((a, b) => b.matchScore - a.matchScore || a.name.localeCompare(b.name));
  },
};

const SEARCHABLE_GROUPS: Record<string, EditorialEntityType> = {
  characters: 'character',
  locations: 'location',
  factions: 'faction',
  timelineEvents: 'timeline_event',
  bestiary: 'bestiary',
  technologies: 'technology',
  mysterySignals: 'mystery_signal',
};

export default editorialApi;
