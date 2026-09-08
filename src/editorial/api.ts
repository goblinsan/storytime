import type {
  CanonEntityCounts,
  CanonSearchResult,
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

export type CanonRow = Record<string, unknown> & { id?: string; name?: string; title?: string };

/** The artifact type a request for canon is stored under. */
export const CANON_REQUEST = 'character_canon_request';
/** And one for a picture of somebody. Same queue, same review, same revisions. */
export const IMAGE_REQUEST = 'character_image_request';
export const SURVEY_REQUEST = 'universe_survey_request';

export interface CanonRequest {
  id: string;
  artifactType: string;
  status: string;
  payload: {
    characterId?: string;
    fields?: string[];
    /** Filled in when the request is answered. */
    proposed?: Record<string, string | string[]>;
    /** Which source to draw with, when it is not the universe's default. */
    sourceId?: string;
    /** What the last attempt said, when one has been sent back. */
    previous?: Record<string, string | string[]>;
    /** What the owner said was wrong with it. */
    note?: string;
  };
}

export interface EncyclopediaCatalog {
  characters: CanonRow[];
  locations: CanonRow[];
  factions: CanonRow[];
  timelineEvents: CanonRow[];
  technologies: CanonRow[];
  signals: CanonRow[];
  bestiary: CanonRow[];
  religions: CanonRow[];
  languages: CanonRow[];
  cultures: CanonRow[];
  derivatives: CanonRow[];
  arcs: CanonRow[];
}

export interface MediaAsset {
  id: string;
  universeId: string;
  url: string;
  kind: 'reference' | 'generated' | 'panel' | 'cover' | 'map';
  title: string;
  caption: string;
  subject: { type: string; id: string } | null;
  observableTraits: string[];
  inferredTraits: string[];
  uncertainties: string[];
  visualDescription: string;
  descriptionStatus: 'none' | 'requested' | 'ready' | 'accepted';
  dashboardTaskId: string | null;
  updatedAt?: string;
}

/**
 * A catalogued asset, plus what happened to its bytes.
 *
 * `stored` is about the request rather than the row: it says whether the
 * picture was copied onto storage or is still only where it was made. Worth
 * saying out loud, because the difference is invisible later.
 */
/** One thing worth doing next, and where it would be done. */
export interface SurveyFinding {
  title: string;
  detail: string;
  where: string | null;
}

export interface KeptImage extends MediaAsset {
  stored: boolean;
  storage: string;
}

export interface UniverseDirectionResponse {
  universeId: string;
  persistentGoal: string;
  temporaryFocus: string;
  guardrails: string[];
  autonomyMode: 'manual' | 'assisted' | 'autonomous_explore';
  theme?: { id: string; overrides: Record<string, string>; coverImageUrl?: string };
}

export interface LineageMember {
  id: string;
  name?: string;
  role?: string;
  importance?: string;
  activeTimeframeStart?: number;
  activeTimeframeEnd?: number;
  parents?: string[];
  children?: string[];
  spouses?: string[];
  siblings?: string[];
}

export interface Lineage {
  id: string;
  name: string;
  memberCount: number;
  principalCharacterId?: string;
  members?: LineageMember[];
}

/**
 * An edge in the canon relationship graph. `family-tree` reads the genealogy
 * subset of this; the rest -- protective bonds, feuds, skirmishes, uneasy
 * alliances -- is how the cast relates outside its bloodlines, and nothing on
 * the characters surface has ever read it.
 */
export interface CanonRelationship {
  id: string;
  projectId: string;
  sourceEntityId: string;
  sourceEntityType: string;
  targetEntityId: string;
  targetEntityType: string;
  relationshipType: string;
  confidence?: string;
  isProtected?: boolean;
  notes?: string;
}

/**
 * A character's billing in one work. Importance belongs here rather than on the
 * character: the figure who carries one story stands at the edge of another.
 * `workImportance` null means "however this character is normally recorded".
 */
export interface WorkCastMember {
  characterId: string;
  billing: number;
  workImportance: 'principal' | 'supporting' | 'background' | null;
  characterImportance: string | null;
  source: 'authored' | 'derived';
  notes: string;
  name: string;
  role: string;
}

export interface FamilyTree {
  lineages: Lineage[];
  standaloneCount: number;
}

export interface DerivativeWork {
  id: string;
  projectId: string;
  type: string;
  title: string;
  description?: string;
  status?: string;
  content?: string;
  createdAt?: string;
  updatedAt?: string;
  metadata?: Record<string, unknown>;
}

export interface Encyclopedia {
  project: { id: string; title: string; description?: string; updatedAt?: string };
  counts: Record<string, number>;
  catalog: EncyclopediaCatalog;
}

interface RawEncyclopedia {
  project: Encyclopedia['project'];
  counts?: Record<string, number>;
  catalog?: Partial<EncyclopediaCatalog>;
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
    activeWorkId: (row as StoryRow & { activeWorkId?: string | null }).activeWorkId ?? null,
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

  /** The cross-universe briefing, assembled by the server. */
  async getGlobalDashboard(signal?: AbortSignal): Promise<GlobalDashboardResponse> {
    return request<GlobalDashboardResponse>('GET', '/editorial/dashboard', { signal });
  },

  async getDirection(universeId: string, signal?: AbortSignal): Promise<UniverseDirectionResponse> {
    return request<UniverseDirectionResponse>(
      'GET', `/editorial/universes/${encodeURIComponent(universeId)}/direction`, { signal },
    );
  },

  async saveDirection(
    universeId: string,
    body: Partial<Omit<UniverseDirectionResponse, 'universeId' | 'theme'>>,
    signal?: AbortSignal,
  ): Promise<UniverseDirectionResponse> {
    return request<UniverseDirectionResponse>(
      'PATCH', `/editorial/universes/${encodeURIComponent(universeId)}/direction`, { signal, body },
    );
  },

  async saveTheme(
    universeId: string,
    body: { themeId?: string; overrides?: Record<string, string>; coverImageUrl?: string },
    signal?: AbortSignal,
  ): Promise<{ id: string; overrides: Record<string, string>; coverImageUrl?: string }> {
    return request('PATCH', `/editorial/universes/${encodeURIComponent(universeId)}/theme`, { signal, body });
  },

  async getEncyclopedia(universeId: string, signal?: AbortSignal): Promise<Encyclopedia> {
    const raw = await request<RawEncyclopedia>(
      'GET', `/stories/${encodeURIComponent(universeId)}/encyclopedia`, { signal },
    );
    return {
      project: raw.project,
      counts: raw.counts ?? {},
      catalog: {
        characters: raw.catalog?.characters ?? [],
        locations: raw.catalog?.locations ?? [],
        factions: raw.catalog?.factions ?? [],
        timelineEvents: raw.catalog?.timelineEvents ?? [],
        technologies: raw.catalog?.technologies ?? [],
        signals: raw.catalog?.signals ?? [],
        bestiary: raw.catalog?.bestiary ?? [],
        religions: raw.catalog?.religions ?? [],
        languages: raw.catalog?.languages ?? [],
        cultures: raw.catalog?.cultures ?? [],
        derivatives: raw.catalog?.derivatives ?? [],
        arcs: raw.catalog?.arcs ?? [],
      },
    };
  },

  /**
   * Canon search across every universe. Performed client-side over the
   * encyclopedia aggregates until a server-side search endpoint exists, so the
   * result shape is already the one the surfaces consume.
   */
  async createUniverse(
    input: { title: string; description: string; premise?: string },
    signal?: AbortSignal,
  ): Promise<UniverseSummary> {
    const row = await request<StoryRow>('POST', '/stories', {
      signal,
      body: {
        title: input.title,
        description: input.description,
        content: input.premise ?? '',
        type: 'universe',
      },
    });
    return toUniverseSummary(row);
  },

  async listCharacters(universeId: string, signal?: AbortSignal): Promise<CanonRow[]> {
    return (await request<CanonRow[]>(
      'GET', `/characters?projectId=${encodeURIComponent(universeId)}`, { signal },
    )) ?? [];
  },

  /** Houses and clans, as the relationship graph already records them. */
  async getFamilyTree(universeId: string, signal?: AbortSignal): Promise<FamilyTree> {
    return (await request<FamilyTree>(
      'GET', `/characters/family-tree?projectId=${encodeURIComponent(universeId)}`, { signal },
    )) ?? { lineages: [], standaloneCount: 0 };
  },

  async listRelationships(universeId: string, signal?: AbortSignal): Promise<CanonRelationship[]> {
    const rows = await request<CanonRelationship[] | { relationships: CanonRelationship[] }>(
      'GET', `/relationships?projectId=${encodeURIComponent(universeId)}`, { signal },
    );
    if (!rows) return [];
    return Array.isArray(rows) ? rows : rows.relationships ?? [];
  },

  /**
   * Canon somebody has asked for but nobody has written.
   *
   * A request and its answer are one draft row: the payload says which
   * character and which fields are wanted, and `proposed` arrives later. They
   * cannot drift apart because there is nothing to keep in step.
   */
  async listCanonRequests(projectId: string, signal?: AbortSignal): Promise<CanonRequest[]> {
    const rows = await request<CanonRequest[]>(
      'GET', `/generated-drafts?projectId=${encodeURIComponent(projectId)}&status=generated`, { signal },
    );
    return (rows ?? []).filter((row) => row.artifactType === CANON_REQUEST
      || row.artifactType === IMAGE_REQUEST);
  },

  /** Surveys of the whole universe, newest first. Never mixed with canon. */
  async listSurveys(projectId: string, signal?: AbortSignal): Promise<CanonRequest[]> {
    const rows = await request<CanonRequest[]>(
      'GET', `/generated-drafts?projectId=${encodeURIComponent(projectId)}&status=generated`, { signal },
    );
    return (rows ?? []).filter((row) => row.artifactType === SURVEY_REQUEST);
  },

  /** Ask for pictures of somebody, in the active work's style. */
  async askForImages(
    projectId: string, characterId: string, note?: string, signal?: AbortSignal,
  ): Promise<CanonRequest> {
    return request<CanonRequest>('POST', '/generated-drafts', {
      signal,
      body: {
        projectId,
        artifactType: IMAGE_REQUEST,
        // A seed of its own, so asking twice is two different pictures rather
        // than the fingerprint refusing the second as already asked.
        payload: { characterId, note, at: Date.now() },
      },
    }) as Promise<CanonRequest>;
  },

  /**
   * Keep one preview: it becomes a reference image of that character.
   *
   * `adopt` asks the server to copy the bytes onto storage first. The URL a
   * preview arrives with points into the render machine's output folder, which
   * is cleared, so keeping the URL alone keeps nothing. What comes back says
   * whether the copy happened, because when no storage is configured it
   * honestly did not.
   */
  async keepImage(
    projectId: string, characterId: string, url: string, caption: string, signal?: AbortSignal,
  ): Promise<KeptImage> {
    return request<KeptImage>('POST', '/media', {
      signal,
      body: {
        projectId,
        url,
        kind: 'reference',
        title: caption,
        adopt: true,
        subject: { type: 'character', id: characterId },
      },
    });
  },

  /**
   * Ask what this universe needs next.
   *
   * Unlike the other two this proposes nothing to write down: what comes back
   * is findings to read and act on. A timestamp is in the payload on purpose,
   * so asking again a week later is a new survey rather than the fingerprint
   * refusing it as already asked.
   */
  async askForSurvey(projectId: string, note?: string, signal?: AbortSignal): Promise<CanonRequest> {
    return request<CanonRequest>('POST', '/generated-drafts', {
      signal,
      body: {
        projectId,
        artifactType: SURVEY_REQUEST,
        payload: { note: note ?? '', at: Date.now() },
      },
    }) as Promise<CanonRequest>;
  },

  async askForCanon(
    projectId: string, characterId: string, fields: string[], signal?: AbortSignal,
  ): Promise<CanonRequest> {
    return request<CanonRequest>('POST', '/generated-drafts', {
      signal,
      body: {
        projectId,
        artifactType: CANON_REQUEST,
        // No timestamp in here. The server fingerprints the payload to catch
        // the same thing being asked for twice, and a clock in it makes every
        // ask unique, which turns that check off without anybody noticing.
        payload: { characterId, fields },
      },
    }) as Promise<CanonRequest>;
  },

  /**
   * Send a draft back with direction, rather than only being able to refuse it.
   *
   * The attempt becomes `previous` and the note travels with it, so the next
   * pass sees what it wrote and what was wrong with it. Clearing `proposed` is
   * what puts the request back in the queue -- the same field the agent fills,
   * so there is no second state to keep in step.
   */
  async reviseCanonRequest(
    row: CanonRequest, note: string, signal?: AbortSignal,
  ): Promise<CanonRequest> {
    const { proposed, ...rest } = row.payload;
    return request('PATCH', `/generated-drafts/${encodeURIComponent(row.id)}`, {
      signal,
      body: { payload: { ...rest, previous: proposed, note } },
    }) as Promise<CanonRequest>;
  },

  async resolveCanonRequest(draftId: string, status: 'accepted' | 'rejected', signal?: AbortSignal) {
    return request('PATCH', `/generated-drafts/${encodeURIComponent(draftId)}`, {
      signal, body: { status },
    });
  },

  /** Partial update. The server COALESCEs, so an omitted field is left alone. */
  async updateCharacter(
    characterId: string, patch: Record<string, unknown>, signal?: AbortSignal,
  ): Promise<CanonRow> {
    return request<CanonRow>(
      'PATCH', `/characters/${encodeURIComponent(characterId)}`, { signal, body: patch },
    ) as Promise<CanonRow>;
  },

  /** The cast of one work, in billing order. */
  async listWorkCast(workId: string, signal?: AbortSignal): Promise<WorkCastMember[]> {
    return (await request<WorkCastMember[]>(
      'GET', `/derivatives/${encodeURIComponent(workId)}/cast`, { signal },
    )) ?? [];
  },

  /** Set (or clear, with null) the work this universe is read through. */
  async setActiveWork(
    universeId: string, workId: string | null, signal?: AbortSignal,
  ): Promise<void> {
    await request('PATCH', `/stories/${encodeURIComponent(universeId)}`, {
      signal, body: { activeWorkId: workId },
    });
  },

  async listFactions(universeId: string, signal?: AbortSignal): Promise<CanonRow[]> {
    const rows = await request<CanonRow[] | { factions: CanonRow[] }>(
      'GET', `/factions?projectId=${encodeURIComponent(universeId)}`, { signal },
    );
    if (!rows) return [];
    return Array.isArray(rows) ? rows : rows.factions ?? [];
  },

  async listWorks(universeId: string, signal?: AbortSignal): Promise<DerivativeWork[]> {
    const rows = await request<DerivativeWork[]>(
      'GET', `/derivatives?projectId=${encodeURIComponent(universeId)}`, { signal },
    );
    return rows ?? [];
  },

  /** Every derivative work across every universe, for the cross-universe library. */
  async listAllWorks(signal?: AbortSignal): Promise<Array<DerivativeWork & { universeTitle: string }>> {
    const universes = await editorialApi.listUniverses(signal);
    const perUniverse = await Promise.all(universes.map(async (universe) => {
      const works = await editorialApi.listWorks(universe.id, signal).catch(() => []);
      return works.map((work) => ({ ...work, universeTitle: universe.title }));
    }));
    return perUniverse.flat()
      .sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')));
  },

  async getWork(workId: string, signal?: AbortSignal): Promise<DerivativeWork> {
    return request<DerivativeWork>('GET', `/derivatives/${encodeURIComponent(workId)}`, { signal });
  },

  async listMedia(universeId: string, signal?: AbortSignal): Promise<MediaAsset[]> {
    return (await request<MediaAsset[]>(
      'GET', `/media?projectId=${encodeURIComponent(universeId)}`, { signal },
    )) ?? [];
  },

  async addMedia(
    body: { projectId: string; url: string; kind?: string; title?: string; caption?: string },
    signal?: AbortSignal,
  ): Promise<MediaAsset> {
    return request<MediaAsset>('POST', '/media', { signal, body });
  },

  async requestVisualDescription(assetId: string, signal?: AbortSignal): Promise<MediaAsset> {
    return request<MediaAsset>('POST', `/media/${encodeURIComponent(assetId)}/describe`, { signal, body: {} });
  },

  async listSharedCharacters(signal?: AbortSignal): Promise<CanonRow[]> {
    return (await request<CanonRow[]>('GET', '/characters/shared', { signal })) ?? [];
  },

  async listSharedBestiary(signal?: AbortSignal): Promise<CanonRow[]> {
    return (await request<CanonRow[]>('GET', '/bestiary/shared', { signal })) ?? [];
  },

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
      const encyclopedia = await editorialApi
        .getEncyclopedia(universe.id, options.signal)
        .catch(() => null);
      if (!encyclopedia) continue;

      for (const [group, entityType] of Object.entries(SEARCHABLE_GROUPS)) {
        // The catalog is nested: reading the top level found nothing and
        // returned no results for every query.
        const rows = encyclopedia.catalog[group as keyof EncyclopediaCatalog];
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

const SEARCHABLE_GROUPS: Partial<Record<keyof EncyclopediaCatalog, EditorialEntityType>> = {
  characters: 'character',
  locations: 'location',
  factions: 'faction',
  timelineEvents: 'timeline_event',
  bestiary: 'bestiary',
  technologies: 'technology',
  signals: 'mystery_signal',
};

export default editorialApi;
