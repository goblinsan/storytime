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
export const MAP_REQUEST = 'location_map_request';
export const PLACE_REQUEST = 'location_proposal_request';
export const PLACE_IMAGE_REQUEST = 'location_image_request';
export const PLACE_CANON_REQUEST = 'location_canon_request';
export const EVENT_CANON_REQUEST = 'timeline_event_canon_request';
export const EVENT_IMAGE_REQUEST = 'timeline_event_image_request';
export const EVENT_PARTS_REQUEST = 'timeline_event_parts_request';
export const SOCIETY_CANON_REQUEST = 'faction_canon_request';
export const SOCIETY_IMAGE_REQUEST = 'faction_image_request';
export const CREATURE_CANON_REQUEST = 'bestiary_canon_request';
export const CREATURE_IMAGE_REQUEST = 'bestiary_image_request';
export const TECHNOLOGY_CANON_REQUEST = 'technology_canon_request';
export const TECHNOLOGY_IMAGE_REQUEST = 'technology_image_request';
export const ARC_CANON_REQUEST = 'arc_canon_request';
export const WORK_CANON_REQUEST = 'work_canon_request';
export const WORK_PARTS_REQUEST = 'work_parts_request';
export const DIRECTION_REQUEST = 'universe_direction_request';

export interface CanonRequest {
  id: string;
  artifactType: string;
  status: string;
  payload: {
    characterId?: string;
    fields?: string[];
    /** Filled in when the request is answered. */
    proposed?: Record<string, string | string[]>;
    /** Survey only: which findings have been struck off, so it survives a reload. */
    done?: string[];
    /** Which source to draw with, when it is not the universe's default. */
    sourceId?: string;
    /** What the last attempt said, when one has been sent back. */
    previous?: Record<string, string | string[]>;
    /** What the owner said was wrong with it. */
    note?: string;
    /** Why the agent could not answer. The request is refused when this is set. */
    failed?: { reason: string; at: string };
  };
  updatedAt?: string;
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
  /** `name` is what the subject is called, when it still exists to be named. */
  subject: { type: string; id: string; name?: string | null } | null;
  observableTraits: string[];
  inferredTraits: string[];
  uncertainties: string[];
  visualDescription: string;
  descriptionStatus: 'none' | 'requested' | 'ready' | 'accepted';
  dashboardTaskId: string | null;
  updatedAt?: string;
}

/**
 * A cataloged asset, plus what happened to its bytes.
 *
 * `stored` is about the request rather than the row: it says whether the
 * picture was copied onto storage or is still only where it was made. Worth
 * saying out loud, because the difference is invisible later.
 */
/** One thing worth doing next, and where it would be done. */
export interface ActivityRow {
  id: string;
  title: string;
  at: string;
  kind: string;
  /** The lens this row opens in, so the front door can be a way in. */
  lens: string | null;
}

export interface UniverseActivity {
  universeId: string;
  /** Records with no timestamp, which predate migration 024 and cannot be placed. */
  undated: number;
  /** How many dated records there are, which is usually more than `rows` holds. */
  dated: number;
  rows: ActivityRow[];
}

/** One entity in a universe's register. */
export interface IndexRow {
  id: string;
  kind: string;
  /** The lens that owns this kind, or null when nothing else shows it. */
  lens: string | null;
  title: string;
  detail: string;
  at: string | null;
  isProtected: boolean;
}

export interface UniverseIndex {
  universeId: string;
  dated: IndexRow[];
  /** Records that predate the timestamps and cannot be placed in time. */
  undated: IndexRow[];
}

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

/**
 * A pin: which place, on which drawing, and where.
 *
 * `name` and `description` are read from the location on every request rather
 * than stored here, so the map cannot disagree with the record. `proposed` is
 * an agent's guess and has to keep looking like one until somebody places it.
 */
export interface MapPin {
  id: string;
  mapId: string;
  locationId: string;
  x: number;
  y: number;
  status: 'proposed' | 'placed';
  name: string;
  description: string;
}

/** One drawing of a place. A place may have many, each with a different job. */
export interface PlaceMap {
  id: string;
  locationId: string;
  mediaAssetId: string;
  url: string;
  title: string;
  caption: string;
  purpose: string;
  isPrimary: boolean;
  createdAt: string;
  pins: MapPin[];
}

/** A place, its drawings, its pictures, and what sits inside it. */
export interface PlaceGeography {
  place: {
    /** True when this is the universe itself rather than a place inside it. */
    isUniverse?: boolean;
    id: string;
    name: string;
    description: string;
    parentId: string | null;
    regionType: string;
    politicalNotes: string;
    history: string;
    folklore: string;
    biome: string;
    ecology: string;
    isProtected: boolean;
  };
  maps: PlaceMap[];
  /** Reference art and illustrations. Not cartography, and not pinnable. */
  pictures: Array<{ id: string; url: string; kind: string; title: string; caption: string }>;
  /** What is inside but absent from each drawing, keyed by map id. */
  unplaced: Record<string, Array<{ id: string; name: string; description: string }>>;
  inside: Array<{ id: string; name: string; description: string }>;
}

export interface PlacesIndex {
  places: Array<{
    id: string; name: string; description: string; parentId: string | null;
    level: number; regionType: string; mapCount: number; pictureCount: number;
    insideCount: number;
  }>;
  opens: string | null;
}

/** One entry on the timeline, with its own record. */
export interface TimelineEvent {
  id: string;
  projectId: string;
  /** What the author wrote. The only form ever shown. */
  date: string;
  /** A number parsed out of the date, for ordering and ranges. Never shown. */
  year: number | null;
  title: string;
  description: string;
  account: string;
  consequences: string;
  remembrance: string;
  parentId: string | null;
  locationId: string | null;
  locationName: string | null;
  isProtected: boolean;
  insideCount?: number;
  pictureCount?: number;
}

export interface TimelineIndex {
  /** The whole universe's range, not the filtered one. */
  span: { first: number | null; last: number | null; total: number; undated: number };
  events: TimelineEvent[];
}

export interface EventInDepth {
  event: TimelineEvent;
  inside: TimelineEvent[];
  partOf: { id: string; title: string; date: string } | null;
  pictures: Array<{ id: string; url: string; kind: string; title: string; caption: string }>;
}

/** One group, and everything recorded about it. */
export interface Society {
  id: string;
  projectId: string;
  name: string;
  description: string;
  history: string;
  doctrine: string;
  technology: string;
  economy: string;
  structure: string;
  goals: string[];
  assets: unknown[];
  isProtected: boolean;
  tieCount?: number;
  pictureCount?: number;
}

/**
 * A recorded relationship, read from whichever end this group sits on.
 *
 * `otherType` is what the far end is -- a faction or a character -- because the
 * link goes to a different surface depending, and a tie to somebody who has
 * since been deleted still has to render.
 */
export interface SocietyTie {
  id: string;
  kind: string;
  /** True when this group is the edge's source, which decides how it reads. */
  forward: boolean;
  /** How the tie reads from this group's end. Decided by the server, with the
      direction that decides it, so no surface keeps its own table. */
  reads: string;
  /** Standing with somebody rather than against them. An alliance shown under
      a heading about enemies tells an author the opposite of the canon. */
  aligned: boolean;
  notes: string;
  otherId: string;
  otherName: string;
  otherType: string;
}

export interface SocietyInDepth {
  faction: Society;
  ties: SocietyTie[];
  pictures: Array<{ id: string; url: string; kind: string; title: string; caption: string }>;
}

/** One creature, and everything recorded about it. */
export interface Creature {
  id: string;
  projectId?: string;
  name: string;
  category: string;
  status: string;
  description: string;
  ecologicalNiche: string;
  inUniverseBackstory: string;
  motivation: string;
  notes: string;
  tactics: string[];
  hearts: number | null;
  isProtected: boolean;
  /** Where it is recorded, as place ids. The tree turns these into a filter. */
  locationIds?: string[];
  pictureCount?: number;
}

/** One place a creature is found, and what it does there. */
export interface CreatureRange {
  id: string;
  locationId: string;
  locationName: string;
  regionType: string;
  notes: string;
}

export interface CreatureInDepth {
  creature: Creature;
  range: CreatureRange[];
  pictures: Array<{ id: string; url: string; kind: string; title: string; caption: string }>;
}

/** One technology, and everything recorded about it. */
export interface Technology {
  id: string;
  projectId?: string;
  name: string;
  description: string;
  principles: string;
  history: string;
  limitations: string;
  patentsOrTaboos: string;
  proliferation: string;
  classification: string;
  /** What the author wrote, and the only form ever shown. */
  originDate: string;
  /** A number parsed out of the date, so a list can be ordered. Never shown. */
  originYear: number | null;
  originLocationId: string | null;
  originLocationName: string | null;
  holderFactionId: string | null;
  holderFactionName: string | null;
  isProtected: boolean;
  pictureCount?: number;
}

export interface TechnologyInDepth {
  technology: Technology;
  pictures: Array<{ id: string; url: string; kind: string; title: string; caption: string }>;
}

/** One act of an arc: its own part of the telling, with its own beats. */
export interface ArcAct {
  id: string;
  arcId: string;
  actNumber: number;
  title: string;
  /** Where it falls in the works: "Chapters 1 and 2". */
  span: string;
  /** What the act does: where it starts, what turns, where it leaves things. */
  summary: string;
  /** In order. Position is part of what each one says. */
  beats: string[];
}

/** One arc: the shape a telling takes through this universe. */
export interface Arc {
  id: string;
  projectId: string;
  arcNumber: number;
  title: string;
  description: string;
  /** What drives it underneath the events. */
  throughline: string;
  /** What it deliberately leaves out or keeps hidden; the writing holds to these. */
  outOfScope: string[];
  /** Bookkeeping: what has been done, what is still to do. Never written by an agent. */
  notes: string[];
  /** Beats that belong to no act yet, in order. */
  details: string[];
  acts: ArcAct[];
  isProtected: boolean;
}

/** A work or a part of one, as the library tree draws it. */
export interface WorkNode {
  id: string;
  title: string;
  type: string;
  status: string;
  description: string;
  /** The work this is a part of, or null for a work that stands alone. */
  parentId: string | null;
  partNumber: number | null;
  words: number;
  partCount?: number;
}

export interface WorkInDepth {
  work: WorkNode & {
    projectId: string;
    content: string;
    metadata: Record<string, unknown>;
    sourceCanonReferences: Array<{ name: string; entityId: string; entityType: string }>;
  };
  parts: WorkNode[];
  parent: { id: string; title: string } | null;
  cast: Array<{ id: string; name: string; billing: number | null }>;
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
    technologies?: number;
    arcs?: number;
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
      // Both have lenses of their own now, so both need a count beside them.
      technologies: c.technologies ?? 0,
      arcs: c.arcs ?? 0,
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

  /** What moved, newest first, with what could not be placed in time. */
  async getActivity(universeId: string, signal?: AbortSignal): Promise<UniverseActivity> {
    return request<UniverseActivity>(
      'GET', `/editorial/universes/${encodeURIComponent(universeId)}/activity`, { signal },
    );
  },

  /** Strike one finding off a survey, so the progress survives a reload. */
  async markSurveyProgress(
    row: CanonRequest, done: string[], signal?: AbortSignal,
  ): Promise<CanonRequest> {
    return request<CanonRequest>('PATCH', `/generated-drafts/${encodeURIComponent(row.id)}`, {
      signal, body: { payload: { ...row.payload, done } },
    });
  },

  /**
   * Ask an agent what this universe appears to be for.
   *
   * It proposes the instructions the other agents are given, and never applies
   * them: the loop stays open at exactly one point, and that point is a person
   * reading it.
   */
  async askForDirection(
    projectId: string, fields: string[], note?: string, signal?: AbortSignal,
  ): Promise<CanonRequest> {
    return request<CanonRequest>('POST', '/generated-drafts', {
      signal,
      body: {
        projectId,
        artifactType: DIRECTION_REQUEST,
        payload: { fields, note: note ?? '', at: Date.now() },
      },
    }) as Promise<CanonRequest>;
  },

  /** Direction proposals waiting to be read. */
  async listDirectionRequests(projectId: string, signal?: AbortSignal): Promise<CanonRequest[]> {
    const rows = await request<CanonRequest[]>(
      'GET', `/generated-drafts?projectId=${encodeURIComponent(projectId)}&status=generated`, { signal },
    );
    return (rows ?? []).filter((row) => row.artifactType === DIRECTION_REQUEST);
  },

  /** Everything in one universe, newest first, with the undated kept apart. */
  async getIndex(universeId: string, signal?: AbortSignal): Promise<UniverseIndex> {
    return request<UniverseIndex>(
      'GET', `/editorial/universes/${encodeURIComponent(universeId)}/index`, { signal },
    );
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
    projectId: string, characterId: string, fields: string[], brief?: string,
    signal?: AbortSignal,
  ): Promise<CanonRequest> {
    return request<CanonRequest>('POST', '/generated-drafts', {
      signal,
      body: {
        projectId,
        artifactType: CANON_REQUEST,
        // No timestamp in here. The server fingerprints the payload to catch
        // the same thing being asked for twice, and a clock in it makes every
        // ask unique, which turns that check off without anybody noticing.
        payload: { characterId, fields, brief },
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

  /**
   * Ask for a picture of a place, which is not the same as asking for a map.
   *
   * A map is a diagram and is prompted as one; a picture is the work's
   * illustration style applied to a place, seen from inside it. Wanting one
   * is not wanting the other.
   */
  /**
   * The prompt that would be sent, assembled by the same builders the agent
   * uses, so what is shown is what would run.
   */
  async getDrawingPrompt(
    projectId: string, kind: 'picture' | 'map', locationId: string | null, signal?: AbortSignal,
  ): Promise<{ positive: string; negative: string; subject: string }> {
    const where = locationId ? `&locationId=${encodeURIComponent(locationId)}` : '';
    return request(
      'GET',
      `/maps/prompt?projectId=${encodeURIComponent(projectId)}&kind=${kind}${where}`,
      { signal },
    );
  },

  /**
   * Ask with a prompt written by hand.
   *
   * Sent verbatim: an author who has edited the prompt has said exactly what
   * they want, and rebuilding it around their words would be the application
   * arguing with the instruction it was given.
   */
  async askWithPrompt(
    projectId: string,
    what: 'picture' | 'map',
    locationId: string | null,
    prompt: { positive: string; negative: string },
    signal?: AbortSignal,
  ): Promise<CanonRequest> {
    return request<CanonRequest>('POST', '/generated-drafts', {
      signal,
      body: {
        projectId,
        artifactType: what === 'map' ? MAP_REQUEST : PLACE_IMAGE_REQUEST,
        payload: {
          ...(locationId ? { locationId } : { universe: true }),
          positive: prompt.positive,
          negative: prompt.negative,
          at: Date.now(),
        },
      },
    }) as Promise<CanonRequest>;
  },

  /**
   * A picture the author already has.
   *
   * The bytes go up as the request body rather than as multipart, so there is
   * no parser and no dependency, and the content type is the one the file
   * already declares.
   */
  async uploadPicture(
    projectId: string,
    file: File,
    subject: { type: string; id: string } | null,
    kind: 'reference' | 'map' = 'reference',
    signal?: AbortSignal,
  ): Promise<MediaAsset & { stored: boolean; storage: string }> {
    // No title. A filename is not one -- least of all the ones this produces,
    // which are a uuid and an extension -- and a picture that has none reads
    // as a picture of the place it belongs to, which is what it is.
    const params = new URLSearchParams({ projectId, kind });
    if (subject) {
      params.set('subjectType', subject.type);
      params.set('subjectId', subject.id);
    }
    const response = await fetch(`${API_BASE}/media/upload?${params}`, {
      method: 'POST',
      headers: { 'content-type': file.type || 'image/png' },
      body: file,
      signal,
    });
    if (!response.ok) {
      const said = await response.json().catch(() => ({}));
      throw new Error(said.error ?? `Upload failed: ${response.status}`);
    }
    return response.json();
  },

  async askForPlacePicture(
    projectId: string, locationId: string, note?: string, signal?: AbortSignal,
  ): Promise<CanonRequest> {
    return request<CanonRequest>('POST', '/generated-drafts', {
      signal,
      body: {
        projectId,
        artifactType: PLACE_IMAGE_REQUEST,
        payload: { locationId, note, at: Date.now() },
      },
    }) as Promise<CanonRequest>;
  },

  /**
   * Ask an agent to write canon for a place that already exists.
   *
   * Not the same as proposing a new place, and not the same as asking for a
   * picture. No timestamp in the payload: the server fingerprints it to catch
   * the same thing being asked for twice, and a clock in there turns that
   * check off without anybody noticing.
   */
  async askForPlaceCanon(
    projectId: string, locationId: string, fields: string[], brief?: string,
    signal?: AbortSignal,
  ): Promise<CanonRequest> {
    return request<CanonRequest>('POST', '/generated-drafts', {
      signal,
      body: {
        projectId,
        artifactType: PLACE_CANON_REQUEST,
        payload: { locationId, fields, brief },
      },
    }) as Promise<CanonRequest>;
  },

  /** Ask an agent to write the universe's own record, field by field. */
  async askForUniverseCanon(
    projectId: string, fields: string[], signal?: AbortSignal,
  ): Promise<CanonRequest> {
    return request<CanonRequest>('POST', '/generated-drafts', {
      signal,
      body: {
        projectId,
        artifactType: PLACE_CANON_REQUEST,
        payload: { universe: true, fields },
      },
    }) as Promise<CanonRequest>;
  },

  /** The universe's record, written through the universe rather than a place. */
  async updateUniverseRecord(
    projectId: string, patch: Record<string, unknown>, signal?: AbortSignal,
  ): Promise<CanonRow> {
    return request<CanonRow>(
      'PATCH', `/stories/${encodeURIComponent(projectId)}`, { signal, body: patch },
    );
  },

  async listPlaceCanonRequests(projectId: string, signal?: AbortSignal): Promise<CanonRequest[]> {
    const rows = await request<CanonRequest[]>(
      'GET', `/generated-drafts?projectId=${encodeURIComponent(projectId)}&status=generated`, { signal },
    );
    return (rows ?? []).filter((row) => row.artifactType === PLACE_CANON_REQUEST);
  },

  /**
   * Send a drawing request back with direction, rather than only being able to
   * refuse it.
   *
   * Clearing `proposed` is what puts the request back in the queue -- the same
   * field the agent fills, so there is no second state to keep in step -- and
   * the note travels with it, so the next pass is told what was wrong rather
   * than drawing the same thing again from the same words.
   */
  async reviseDrawing(row: CanonRequest, note: string, signal?: AbortSignal): Promise<CanonRequest> {
    const { proposed, ...rest } = row.payload as Record<string, unknown>;
    return request('PATCH', `/generated-drafts/${encodeURIComponent(row.id)}`, {
      signal,
      // A seed, because the fingerprint would otherwise refuse a second run of
      // a request it has already seen the shape of.
      body: { payload: { ...rest, previous: proposed, note, at: Date.now() } },
    }) as Promise<CanonRequest>;
  },

  async listPlacePictureRequests(projectId: string, signal?: AbortSignal): Promise<CanonRequest[]> {
    const rows = await request<CanonRequest[]>(
      'GET', `/generated-drafts?projectId=${encodeURIComponent(projectId)}&status=generated`, { signal },
    );
    return (rows ?? []).filter((row) => row.artifactType === PLACE_IMAGE_REQUEST);
  },

  /** Keep one picture of a place. The bytes are copied onto storage first. */
  async keepPlacePicture(
    projectId: string, locationId: string, url: string, title: string, signal?: AbortSignal,
  ): Promise<KeptImage> {
    return request<KeptImage>('POST', '/media', {
      signal,
      body: {
        projectId,
        url,
        kind: 'reference',
        title,
        adopt: true,
        subject: { type: 'location', id: locationId },
      },
    });
  },

  async removePicture(assetId: string, signal?: AbortSignal) {
    return request('DELETE', `/media/${encodeURIComponent(assetId)}`, { signal });
  },

  /** The timeline, optionally narrowed to a range of years. */
  async listEvents(
    projectId: string, range?: { from?: number; to?: number }, signal?: AbortSignal,
  ): Promise<TimelineIndex> {
    const params = new URLSearchParams({ projectId });
    if (range?.from !== undefined) params.set('from', String(range.from));
    if (range?.to !== undefined) params.set('to', String(range.to));
    return request<TimelineIndex>('GET', `/events?${params}`, { signal });
  },

  async getEvent(eventId: string, signal?: AbortSignal): Promise<EventInDepth> {
    return request<EventInDepth>('GET', `/events/${encodeURIComponent(eventId)}`, { signal });
  },

  /** Break an event into a part of itself. */
  async addEventInside(
    eventId: string, title: string, date?: string, signal?: AbortSignal,
  ): Promise<TimelineEvent> {
    return request<TimelineEvent>('POST', `/events/${encodeURIComponent(eventId)}/inside`, {
      signal, body: { title, date },
    });
  },

  async updateEvent(
    eventId: string, patch: Record<string, unknown>, signal?: AbortSignal,
  ): Promise<TimelineEvent> {
    return request<TimelineEvent>('PATCH', `/events/${encodeURIComponent(eventId)}`, {
      signal, body: patch,
    });
  },

  async askForEventCanon(
    projectId: string, eventId: string, fields: string[], brief?: string, signal?: AbortSignal,
  ): Promise<CanonRequest> {
    return request<CanonRequest>('POST', '/generated-drafts', {
      signal,
      body: {
        projectId,
        artifactType: EVENT_CANON_REQUEST,
        payload: { eventId, fields, brief },
      },
    }) as Promise<CanonRequest>;
  },

  async askForEventPicture(
    projectId: string, eventId: string, note?: string, signal?: AbortSignal,
  ): Promise<CanonRequest> {
    return request<CanonRequest>('POST', '/generated-drafts', {
      signal,
      body: {
        projectId,
        artifactType: EVENT_IMAGE_REQUEST,
        payload: { eventId, note, at: Date.now() },
      },
    }) as Promise<CanonRequest>;
  },

  /** Ask what sequence an event breaks into. Nothing is created by asking. */
  async askForEventParts(
    projectId: string, eventId: string, note?: string, signal?: AbortSignal,
  ): Promise<CanonRequest> {
    return request<CanonRequest>('POST', '/generated-drafts', {
      signal,
      body: {
        projectId,
        artifactType: EVENT_PARTS_REQUEST,
        payload: { eventId, note, at: Date.now() },
      },
    }) as Promise<CanonRequest>;
  },

  async listEventRequests(projectId: string, signal?: AbortSignal): Promise<CanonRequest[]> {
    const rows = await request<CanonRequest[]>(
      'GET', `/generated-drafts?projectId=${encodeURIComponent(projectId)}&status=generated`, { signal },
    );
    return (rows ?? []).filter(
      (row) => row.artifactType === EVENT_CANON_REQUEST
        || row.artifactType === EVENT_IMAGE_REQUEST
        || row.artifactType === EVENT_PARTS_REQUEST,
    );
  },

  async keepEventPicture(
    projectId: string, eventId: string, url: string, signal?: AbortSignal,
  ): Promise<KeptImage> {
    return request<KeptImage>('POST', '/media', {
      signal,
      body: {
        projectId, url, kind: 'reference', title: '', adopt: true,
        subject: { type: 'event', id: eventId },
      },
    });
  },

  /** Every group in the universe, with how entangled and how pictured each is. */
  async listSocieties(
    projectId: string, signal?: AbortSignal,
  ): Promise<{ factions: Society[] }> {
    return request<{ factions: Society[] }>(
      'GET', `/societies?projectId=${encodeURIComponent(projectId)}`, { signal },
    );
  },

  async getSociety(factionId: string, signal?: AbortSignal): Promise<SocietyInDepth> {
    return request<SocietyInDepth>('GET', `/societies/${encodeURIComponent(factionId)}`, { signal });
  },

  async updateSociety(
    factionId: string, patch: Record<string, unknown>, signal?: AbortSignal,
  ): Promise<Society> {
    return request<Society>('PATCH', `/societies/${encodeURIComponent(factionId)}`, {
      signal, body: patch,
    });
  },

  async askForSocietyCanon(
    projectId: string, factionId: string, fields: string[], brief?: string, signal?: AbortSignal,
  ): Promise<CanonRequest> {
    return request<CanonRequest>('POST', '/generated-drafts', {
      signal,
      body: {
        projectId,
        artifactType: SOCIETY_CANON_REQUEST,
        payload: { factionId, fields, brief },
      },
    }) as Promise<CanonRequest>;
  },

  async askForSocietyPicture(
    projectId: string, factionId: string, note?: string, signal?: AbortSignal,
  ): Promise<CanonRequest> {
    return request<CanonRequest>('POST', '/generated-drafts', {
      signal,
      body: {
        projectId,
        artifactType: SOCIETY_IMAGE_REQUEST,
        payload: { factionId, note, at: Date.now() },
      },
    }) as Promise<CanonRequest>;
  },

  async listSocietyRequests(projectId: string, signal?: AbortSignal): Promise<CanonRequest[]> {
    const rows = await request<CanonRequest[]>(
      'GET', `/generated-drafts?projectId=${encodeURIComponent(projectId)}&status=generated`, { signal },
    );
    return (rows ?? []).filter(
      (row) => row.artifactType === SOCIETY_CANON_REQUEST
        || row.artifactType === SOCIETY_IMAGE_REQUEST,
    );
  },

  async keepSocietyPicture(
    projectId: string, factionId: string, url: string, signal?: AbortSignal,
  ): Promise<KeptImage> {
    return request<KeptImage>('POST', '/media', {
      signal,
      body: {
        projectId, url, kind: 'reference', title: '', adopt: true,
        subject: { type: 'faction_crest', id: factionId },
      },
    });
  },

  /** Every creature, with where it is found and what has been drawn of it. */
  async listCreatures(
    projectId: string, signal?: AbortSignal,
  ): Promise<{ creatures: Creature[] }> {
    return request<{ creatures: Creature[] }>(
      'GET', `/bestiary/surface/index?projectId=${encodeURIComponent(projectId)}`, { signal },
    );
  },

  async getCreature(creatureId: string, signal?: AbortSignal): Promise<CreatureInDepth> {
    return request<CreatureInDepth>(
      'GET', `/bestiary/surface/${encodeURIComponent(creatureId)}`, { signal },
    );
  },

  async updateCreature(
    creatureId: string, patch: Record<string, unknown>, signal?: AbortSignal,
  ): Promise<Creature> {
    return request<Creature>('PATCH', `/bestiary/surface/${encodeURIComponent(creatureId)}`, {
      signal, body: patch,
    });
  },

  /** Record that a creature is found somewhere. Saying it twice is once. */
  async addCreatureRange(
    creatureId: string, locationId: string, notes?: string, signal?: AbortSignal,
  ): Promise<CreatureRange> {
    return request<CreatureRange>(
      'POST', `/bestiary/surface/${encodeURIComponent(creatureId)}/range`,
      { signal, body: { locationId, notes } },
    );
  },

  async removeCreatureRange(rangeId: string, signal?: AbortSignal) {
    return request('DELETE', `/bestiary/surface/range/${encodeURIComponent(rangeId)}`, { signal });
  },

  async askForCreatureCanon(
    projectId: string, creatureId: string, fields: string[], brief?: string, signal?: AbortSignal,
  ): Promise<CanonRequest> {
    return request<CanonRequest>('POST', '/generated-drafts', {
      signal,
      body: {
        projectId,
        artifactType: CREATURE_CANON_REQUEST,
        payload: { creatureId, fields, brief },
      },
    }) as Promise<CanonRequest>;
  },

  async askForCreaturePicture(
    projectId: string, creatureId: string, note?: string, signal?: AbortSignal,
  ): Promise<CanonRequest> {
    return request<CanonRequest>('POST', '/generated-drafts', {
      signal,
      body: {
        projectId,
        artifactType: CREATURE_IMAGE_REQUEST,
        payload: { creatureId, note, at: Date.now() },
      },
    }) as Promise<CanonRequest>;
  },

  async listCreatureRequests(projectId: string, signal?: AbortSignal): Promise<CanonRequest[]> {
    const rows = await request<CanonRequest[]>(
      'GET', `/generated-drafts?projectId=${encodeURIComponent(projectId)}&status=generated`, { signal },
    );
    return (rows ?? []).filter(
      (row) => row.artifactType === CREATURE_CANON_REQUEST
        || row.artifactType === CREATURE_IMAGE_REQUEST,
    );
  },

  async keepCreaturePicture(
    projectId: string, creatureId: string, url: string, signal?: AbortSignal,
  ): Promise<KeptImage> {
    return request<KeptImage>('POST', '/media', {
      signal,
      body: {
        projectId, url, kind: 'reference', title: '', adopt: true,
        subject: { type: 'creature', id: creatureId },
      },
    });
  },

  /**
   * Starting a record, on each of the surfaces that holds one.
   *
   * A name is all any of them asks for. Everything else is written afterwards
   * or handed to an agent, which is what the record panel is for.
   */
  async createCreature(
    projectId: string, name: string, signal?: AbortSignal,
  ): Promise<{ id: string }> {
    return request<{ id: string }>('POST', '/bestiary', { signal, body: { projectId, name } });
  },

  async createSociety(
    projectId: string, name: string, signal?: AbortSignal,
  ): Promise<{ id: string }> {
    return request<{ id: string }>('POST', '/factions', { signal, body: { projectId, name } });
  },

  async createEvent(
    projectId: string, title: string, date?: string, signal?: AbortSignal,
  ): Promise<TimelineEvent> {
    return request<TimelineEvent>('POST', '/events', { signal, body: { projectId, title, date } });
  },

  async createCharacter(
    projectId: string, name: string, signal?: AbortSignal,
  ): Promise<{ id: string }> {
    return request<{ id: string }>('POST', '/characters', { signal, body: { projectId, name } });
  },

  /** Every technology, with the edges that let the list be ordered. */
  async listTechnologies(
    projectId: string, signal?: AbortSignal,
  ): Promise<{ technologies: Technology[] }> {
    return request<{ technologies: Technology[] }>(
      'GET', `/technologies/surface/index?projectId=${encodeURIComponent(projectId)}`, { signal },
    );
  },

  async getTechnology(id: string, signal?: AbortSignal): Promise<TechnologyInDepth> {
    return request<TechnologyInDepth>(
      'GET', `/technologies/surface/${encodeURIComponent(id)}`, { signal },
    );
  },

  async updateTechnology(
    id: string, patch: Record<string, unknown>, signal?: AbortSignal,
  ): Promise<Technology> {
    return request<Technology>('PATCH', `/technologies/surface/${encodeURIComponent(id)}`, {
      signal, body: patch,
    });
  },

  async createTechnology(
    projectId: string, name: string, signal?: AbortSignal,
  ): Promise<{ id: string }> {
    return request<{ id: string }>('POST', '/technologies', { signal, body: { projectId, name } });
  },

  async askForTechnologyCanon(
    projectId: string, technologyId: string, fields: string[], brief?: string,
    signal?: AbortSignal,
  ): Promise<CanonRequest> {
    return request<CanonRequest>('POST', '/generated-drafts', {
      signal,
      body: {
        projectId,
        artifactType: TECHNOLOGY_CANON_REQUEST,
        payload: { technologyId, fields, brief },
      },
    }) as Promise<CanonRequest>;
  },

  async askForTechnologyPicture(
    projectId: string, technologyId: string, note?: string, signal?: AbortSignal,
  ): Promise<CanonRequest> {
    return request<CanonRequest>('POST', '/generated-drafts', {
      signal,
      body: {
        projectId,
        artifactType: TECHNOLOGY_IMAGE_REQUEST,
        payload: { technologyId, note, at: Date.now() },
      },
    }) as Promise<CanonRequest>;
  },

  async listTechnologyRequests(projectId: string, signal?: AbortSignal): Promise<CanonRequest[]> {
    const rows = await request<CanonRequest[]>(
      'GET', `/generated-drafts?projectId=${encodeURIComponent(projectId)}&status=generated`, { signal },
    );
    return (rows ?? []).filter(
      (row) => row.artifactType === TECHNOLOGY_CANON_REQUEST
        || row.artifactType === TECHNOLOGY_IMAGE_REQUEST,
    );
  },

  async keepTechnologyPicture(
    projectId: string, technologyId: string, url: string, signal?: AbortSignal,
  ): Promise<KeptImage> {
    return request<KeptImage>('POST', '/media', {
      signal,
      body: {
        projectId, url, kind: 'reference', title: '', adopt: true,
        subject: { type: 'technology', id: technologyId },
      },
    });
  },

  /** Every arc in the universe, in the order they are numbered. */
  async listArcs(projectId: string, signal?: AbortSignal): Promise<Arc[]> {
    return request<Arc[]>('GET', `/arcs?projectId=${encodeURIComponent(projectId)}`, { signal });
  },

  async getArc(arcId: string, signal?: AbortSignal): Promise<Arc> {
    return request<Arc>('GET', `/arcs/${encodeURIComponent(arcId)}`, { signal });
  },

  async updateArc(arcId: string, patch: Record<string, unknown>, signal?: AbortSignal): Promise<Arc> {
    return request<Arc>('PATCH', `/arcs/${encodeURIComponent(arcId)}`, { signal, body: patch });
  },

  /** Numbered after the last one by the server. */
  async createArc(projectId: string, title: string, signal?: AbortSignal): Promise<Arc> {
    return request<Arc>('POST', '/arcs', { signal, body: { projectId, title } });
  },

  async askForArcCanon(
    projectId: string, arcId: string, fields: string[], brief?: string, signal?: AbortSignal,
  ): Promise<CanonRequest> {
    return request<CanonRequest>('POST', '/generated-drafts', {
      signal,
      body: { projectId, artifactType: ARC_CANON_REQUEST, payload: { arcId, fields, brief } },
    }) as Promise<CanonRequest>;
  },

  /** Numbered after the arc's last act by the server. */
  async createArcAct(arcId: string, title: string, signal?: AbortSignal): Promise<ArcAct> {
    return request<ArcAct>('POST', `/arcs/${encodeURIComponent(arcId)}/acts`, { signal, body: { title } });
  },

  async updateArcAct(actId: string, patch: Record<string, unknown>, signal?: AbortSignal): Promise<ArcAct> {
    return request<ArcAct>('PATCH', `/arcs/acts/${encodeURIComponent(actId)}`, { signal, body: patch });
  },

  /** The same request as an arc's own, naming the act it is for. */
  async askForArcActCanon(
    projectId: string, arcId: string, actId: string, fields: string[], brief?: string,
    signal?: AbortSignal,
  ): Promise<CanonRequest> {
    return request<CanonRequest>('POST', '/generated-drafts', {
      signal,
      body: { projectId, artifactType: ARC_CANON_REQUEST, payload: { arcId, actId, fields, brief } },
    }) as Promise<CanonRequest>;
  },

  async listArcRequests(projectId: string, signal?: AbortSignal): Promise<CanonRequest[]> {
    const rows = await request<CanonRequest[]>(
      'GET', `/generated-drafts?projectId=${encodeURIComponent(projectId)}&status=generated`, { signal },
    );
    return (rows ?? []).filter((row) => row.artifactType === ARC_CANON_REQUEST);
  },

  /** The library as a tree: every work, and which work each is a part of. */
  async listWorkTree(projectId: string, signal?: AbortSignal): Promise<{ works: WorkNode[] }> {
    return request<{ works: WorkNode[] }>(
      'GET', `/derivatives/surface/index?projectId=${encodeURIComponent(projectId)}`, { signal },
    );
  },

  async getWorkInDepth(workId: string, signal?: AbortSignal): Promise<WorkInDepth> {
    return request<WorkInDepth>('GET', `/derivatives/surface/${encodeURIComponent(workId)}`, { signal });
  },

  async updateWorkRecord(workId: string, patch: Record<string, unknown>, signal?: AbortSignal) {
    return request('PATCH', `/derivatives/surface/${encodeURIComponent(workId)}`, { signal, body: patch });
  },

  /** A work that stands alone. Its parts are made from inside it. */
  async createWork(projectId: string, title: string, signal?: AbortSignal): Promise<{ id: string }> {
    return request<{ id: string }>('POST', '/derivatives', {
      signal, body: { projectId, type: 'story', title },
    });
  },

  /** A part of a work, numbered after the last. */
  async createWorkPart(
    workId: string, title: string, description?: string, signal?: AbortSignal,
  ): Promise<{ id: string; partNumber: number }> {
    return request<{ id: string; partNumber: number }>(
      'POST', `/derivatives/surface/${encodeURIComponent(workId)}/parts`,
      { signal, body: { title, description } },
    );
  },

  async askForWorkCanon(
    projectId: string, workId: string, fields: string[], brief?: string, signal?: AbortSignal,
  ): Promise<CanonRequest> {
    return request<CanonRequest>('POST', '/generated-drafts', {
      signal,
      body: { projectId, artifactType: WORK_CANON_REQUEST, payload: { workId, fields, brief } },
    }) as Promise<CanonRequest>;
  },

  /** Ask what a work is made of. Nothing is created by asking. */
  async askForWorkParts(
    projectId: string, workId: string, brief?: string, signal?: AbortSignal,
  ): Promise<CanonRequest> {
    return request<CanonRequest>('POST', '/generated-drafts', {
      signal,
      body: {
        projectId, artifactType: WORK_PARTS_REQUEST, payload: { workId, brief, at: Date.now() },
      },
    }) as Promise<CanonRequest>;
  },

  /**
   * Everything asked of the works, answered or not.
   *
   * The open requests alone cannot say that one failed: a failure is refused
   * with its reason, and a refused request is not open. Reading them together
   * lets a part say "the last ask came to nothing, and why" instead of the ask
   * simply vanishing.
   */
  async listWorkDrafts(projectId: string, signal?: AbortSignal): Promise<CanonRequest[]> {
    const rows = await request<CanonRequest[]>(
      'GET', `/generated-drafts?projectId=${encodeURIComponent(projectId)}`, { signal },
    );
    return (rows ?? []).filter(
      (row) => row.artifactType === WORK_CANON_REQUEST || row.artifactType === WORK_PARTS_REQUEST,
    );
  },

  async listWorkRequests(projectId: string, signal?: AbortSignal): Promise<CanonRequest[]> {
    const rows = await request<CanonRequest[]>(
      'GET', `/generated-drafts?projectId=${encodeURIComponent(projectId)}&status=generated`, { signal },
    );
    return (rows ?? []).filter(
      (row) => row.artifactType === WORK_CANON_REQUEST || row.artifactType === WORK_PARTS_REQUEST,
    );
  },

  /** Every place, with what to open first and why. */
  async listPlaces(projectId: string, signal?: AbortSignal): Promise<PlacesIndex> {
    return request<PlacesIndex>(
      'GET', `/maps/places?projectId=${encodeURIComponent(projectId)}`, { signal },
    );
  },

  /**
   * The universe as a subject you can draw and pin on.
   *
   * Answers the same shape a place does, so the surface reading it does not
   * need to know whether it is looking at a station or at everything.
   */
  async getUniversePlace(projectId: string, signal?: AbortSignal): Promise<PlaceGeography> {
    return request<PlaceGeography>(
      'GET', `/maps/universe/${encodeURIComponent(projectId)}`, { signal },
    );
  },

  async keepUniverseMap(
    projectId: string,
    body: { url: string; purpose?: string; title?: string; primary?: boolean },
    signal?: AbortSignal,
  ): Promise<{ map: PlaceMap; stored: boolean; storage: string }> {
    return request('POST', `/maps/universe/${encodeURIComponent(projectId)}/keep`, { signal, body });
  },

  async keepUniversePicture(
    projectId: string, url: string, title: string, signal?: AbortSignal,
  ): Promise<KeptImage> {
    return request<KeptImage>('POST', '/media', {
      signal,
      body: {
        projectId, url, kind: 'reference', title, adopt: true,
        subject: { type: 'universe', id: projectId },
      },
    });
  },

  /** Ask for a picture or a map of the universe rather than of a place. */
  async askForUniverseDrawing(
    projectId: string, what: 'picture' | 'map', note?: string, signal?: AbortSignal,
  ): Promise<CanonRequest> {
    return request<CanonRequest>('POST', '/generated-drafts', {
      signal,
      body: {
        projectId,
        artifactType: what === 'map' ? MAP_REQUEST : PLACE_IMAGE_REQUEST,
        payload: { universe: true, note, at: Date.now() },
      },
    }) as Promise<CanonRequest>;
  },

  /** One place: its record, its drawings and their pins, its pictures. */
  async getPlace(locationId: string, signal?: AbortSignal): Promise<PlaceGeography> {
    return request<PlaceGeography>(
      'GET', `/maps/place/${encodeURIComponent(locationId)}`, { signal },
    );
  },

  /** Ask for a map of somewhere. What comes back is candidates, never canon. */
  async askForMap(
    projectId: string, locationId: string, note?: string, signal?: AbortSignal,
  ): Promise<CanonRequest> {
    return request<CanonRequest>('POST', '/generated-drafts', {
      signal,
      body: {
        projectId,
        artifactType: MAP_REQUEST,
        // A seed, so asking twice draws twice rather than the fingerprint
        // refusing the second as already asked.
        payload: { locationId, note, at: Date.now() },
      },
    }) as Promise<CanonRequest>;
  },

  async listMapRequests(projectId: string, signal?: AbortSignal): Promise<CanonRequest[]> {
    const rows = await request<CanonRequest[]>(
      'GET', `/generated-drafts?projectId=${encodeURIComponent(projectId)}&status=generated`, { signal },
    );
    return (rows ?? []).filter((row) => row.artifactType === MAP_REQUEST);
  },

  /**
   * Keep one candidate as another map of this place.
   *
   * The bytes are copied onto storage first, the way an accepted portrait is:
   * the URL a candidate arrives with points into the render machine's output
   * folder, which gets cleared, so keeping the URL alone keeps nothing.
   */
  async keepMap(
    locationId: string,
    body: { url: string; purpose?: string; title?: string; primary?: boolean },
    signal?: AbortSignal,
  ): Promise<{ map: PlaceMap; stored: boolean; storage: string }> {
    return request('POST', `/maps/place/${encodeURIComponent(locationId)}/keep`, { signal, body });
  },

  async updateMap(
    mapId: string, patch: { purpose?: string; title?: string; primary?: boolean }, signal?: AbortSignal,
  ): Promise<PlaceMap> {
    return request<PlaceMap>('PATCH', `/maps/${encodeURIComponent(mapId)}`, { signal, body: patch });
  },

  /**
   * This drawing is a picture of the place, not a plan of it.
   *
   * The picture survives as reference art; only its job changes. Its pins go,
   * because a pin is a position on a plan.
   */
  async notAMap(
    mapId: string, signal?: AbortSignal,
  ): Promise<{ pinsRemoved: number; detail: string }> {
    return request('POST', `/maps/${encodeURIComponent(mapId)}/not-a-map`, { signal });
  },

  async removeMap(mapId: string, signal?: AbortSignal) {
    return request('DELETE', `/maps/${encodeURIComponent(mapId)}`, { signal });
  },

  /** Put a pin down or move one. Position is a fraction of the image. */
  async placePin(
    mapId: string, locationId: string,
    at: { x: number; y: number; status?: 'proposed' | 'placed' },
    signal?: AbortSignal,
  ): Promise<MapPin> {
    return request<MapPin>(
      'PUT', `/maps/${encodeURIComponent(mapId)}/pins/${encodeURIComponent(locationId)}`,
      { signal, body: at },
    );
  },

  async removePin(mapId: string, locationId: string, signal?: AbortSignal) {
    return request(
      'DELETE', `/maps/${encodeURIComponent(mapId)}/pins/${encodeURIComponent(locationId)}`, { signal },
    );
  },

  /** A new place, born into the universe with its own record. */
  async createPlace(
    projectId: string, body: { name: string; description?: string; parentId?: string | null },
    signal?: AbortSignal,
  ): Promise<CanonRow> {
    return request<CanonRow>('POST', '/locations', { signal, body: { projectId, ...body } });
  },

  /**
   * Ask what belongs at a point on a map.
   *
   * Nothing is created by asking. What comes back is a name and a description
   * to accept or refuse, and accepting is what makes the place.
   */
  async askForPlace(
    projectId: string, parentId: string, mapId: string, at: { x: number; y: number },
    note?: string, signal?: AbortSignal,
  ): Promise<CanonRequest> {
    return request<CanonRequest>('POST', '/generated-drafts', {
      signal,
      body: {
        projectId,
        artifactType: PLACE_REQUEST,
        // The map travels with the request so an accepted proposal can be
        // pinned where it was asked for, rather than at the top-left of
        // whichever drawing happens to be open when the answer lands.
        payload: { parentId, mapId, at, note: note ?? '', seed: Date.now() },
      },
    }) as Promise<CanonRequest>;
  },

  async listPlaceRequests(projectId: string, signal?: AbortSignal): Promise<CanonRequest[]> {
    const rows = await request<CanonRequest[]>(
      'GET', `/generated-drafts?projectId=${encodeURIComponent(projectId)}&status=generated`, { signal },
    );
    return (rows ?? []).filter((row) => row.artifactType === PLACE_REQUEST);
  },

  async updatePlace(
    locationId: string, patch: Record<string, unknown>, signal?: AbortSignal,
  ): Promise<CanonRow> {
    return request<CanonRow>(
      'PATCH', `/locations/${encodeURIComponent(locationId)}`, { signal, body: patch },
    );
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
