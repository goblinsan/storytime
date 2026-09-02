import type {
  Story,
  Character,
  StoryArc,
  BestiaryEntry,
  ProjectType,
  MapNode,
  MapPath,
  UniverseEncyclopedia,
  DerivativeWork,
  SharedCharacter,
  SharedBestiaryEntry,
  CanonRelationship,
  Faction,
  TimelineEvent,
  Technology,
  MysterySignal,
} from './types/story';
export type {
  Story,
  Character,
  StoryArc,
  BestiaryEntry,
  ProjectType,
  MapNode,
  MapPath,
  UniverseEncyclopedia,
  DerivativeWork,
  TimelineEvent,
  Technology,
  SharedCharacter,
  SharedBestiaryEntry,
  CanonRelationship,
  Faction,
};

const API_BASE = `${import.meta.env.BASE_URL}api`;

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

// Projects (backward-compatible "stories" endpoints)
export const api = {
  stories: {
    list(type?: ProjectType): Promise<Story[]> {
      const q = type ? `?type=${type}` : '';
      return request(`/stories${q}`);
    },
    get(id: string): Promise<Story & { locations: unknown[]; timelineEvents: unknown[]; arcs: StoryArc[]; bestiary: BestiaryEntry[] }> {
      return request(`/stories/${id}`);
    },
    getEncyclopedia(id: string): Promise<UniverseEncyclopedia> {
      return request(`/stories/${id}/encyclopedia`);
    },
    create(data: Partial<Story> & { type?: ProjectType } = {}): Promise<Story> {
      return request('/stories', { method: 'POST', body: JSON.stringify(data) });
    },
    update(id: string, data: Partial<Story>): Promise<Story> {
      return request(`/stories/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    },
    delete(id: string): Promise<{ success: boolean }> {
      return request(`/stories/${id}`, { method: 'DELETE' });
    },
  },

  derivatives: {
    list(projectId: string, type?: string): Promise<DerivativeWork[]> {
      const q = type ? `&type=${type}` : '';
      return request(`/derivatives?projectId=${projectId}${q}`);
    },
    get(id: string): Promise<DerivativeWork> {
      return request(`/derivatives/${id}`);
    },
    create(data: { projectId: string; type: string } & Partial<DerivativeWork>): Promise<DerivativeWork> {
      return request('/derivatives', { method: 'POST', body: JSON.stringify(data) });
    },
    update(id: string, data: Partial<DerivativeWork>): Promise<DerivativeWork> {
      return request(`/derivatives/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    },
    delete(id: string): Promise<{ success: boolean }> {
      return request(`/derivatives/${id}`, { method: 'DELETE' });
    },
    generateBrief(data: {
      projectId: string;
      type: string;
      title?: string;
      focus?: string;
      selectedEntityIds?: string[];
    }): Promise<DerivativeWork> {
      return request('/derivatives/generate-brief', { method: 'POST', body: JSON.stringify(data) });
    },
    getDndExport(id: string): Promise<{
      id: string;
      artifactType: string;
      status: string;
      payload: unknown;
    }> {
      return request(`/derivatives/${id}/dnd-export`);
    },
  },

  composer: {
    composeChapter(data: { derivativeId?: string; projectId?: string; customPrompt?: string }): Promise<{
      success: boolean;
      derivative: DerivativeWork;
      wordCount: number;
      qualityPassed?: boolean;
      critiqueGate?: {
        score: number;
        passed: boolean;
        defects: Array<{ code: string; message: string; fixGuidance: string }>;
        revisions?: any[];
      };
    }> {
      return request('/composer/chapter', { method: 'POST', body: JSON.stringify(data) });
    },
    composeAll(projectId: string): Promise<{
      success: boolean;
      composedChapters: Array<{
        id: string;
        title: string;
        wordCount: number;
        qualityPassed?: boolean;
        critiqueGate?: {
          score: number;
          passed: boolean;
          defects: Array<{ code: string; message: string; fixGuidance: string }>;
        };
      }>;
      totalComposed: number;
      allQualityPassed?: boolean;
    }> {
      return request('/composer/all', { method: 'POST', body: JSON.stringify({ projectId }) });
    },
  },

  characters: {
    list(projectId: string, characterType?: string): Promise<Character[]> {
      let url = `/characters?projectId=${projectId}`;
      if (characterType) url += `&characterType=${characterType}`;
      return request(url);
    },
    get(id: string): Promise<Character> {
      return request(`/characters/${id}`);
    },
    create(data: { projectId: string } & Partial<Character>): Promise<Character> {
      return request('/characters', { method: 'POST', body: JSON.stringify(data) });
    },
    update(id: string, data: Partial<Character>): Promise<Character> {
      return request(`/characters/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    },
    delete(id: string): Promise<{ success: boolean }> {
      return request(`/characters/${id}`, { method: 'DELETE' });
    },
    listShared(): Promise<SharedCharacter[]> {
      return request('/characters/shared');
    },
    createShared(data: Partial<SharedCharacter>): Promise<SharedCharacter> {
      return request('/characters/shared', { method: 'POST', body: JSON.stringify(data) });
    },
    adoptShared(data: {
      projectId: string;
      sharedCharacterId: string;
      role?: string;
      motivation?: string;
      overrideName?: string;
      isVariant?: boolean;
    }): Promise<Character> {
      return request('/characters/adopt-shared', { method: 'POST', body: JSON.stringify(data) });
    },
  },

  arcs: {
    list(projectId: string): Promise<StoryArc[]> {
      return request(`/arcs?projectId=${projectId}`);
    },
    get(id: string): Promise<StoryArc> {
      return request(`/arcs/${id}`);
    },
    create(data: { projectId: string } & Partial<StoryArc>): Promise<StoryArc> {
      return request('/arcs', { method: 'POST', body: JSON.stringify(data) });
    },
    update(id: string, data: Partial<StoryArc>): Promise<StoryArc> {
      return request(`/arcs/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    },
    delete(id: string): Promise<{ success: boolean }> {
      return request(`/arcs/${id}`, { method: 'DELETE' });
    },
  },

  bestiary: {
    list(projectId: string): Promise<BestiaryEntry[]> {
      return request(`/bestiary?projectId=${projectId}`);
    },
    get(id: string): Promise<BestiaryEntry> {
      return request(`/bestiary/${id}`);
    },
    create(data: { projectId: string } & Partial<BestiaryEntry>): Promise<BestiaryEntry> {
      return request('/bestiary', { method: 'POST', body: JSON.stringify(data) });
    },
    update(id: string, data: Partial<BestiaryEntry>): Promise<BestiaryEntry> {
      return request(`/bestiary/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    },
    delete(id: string): Promise<{ success: boolean }> {
      return request(`/bestiary/${id}`, { method: 'DELETE' });
    },
    listShared(): Promise<SharedBestiaryEntry[]> {
      return request('/bestiary/shared');
    },
    createShared(data: Partial<SharedBestiaryEntry>): Promise<SharedBestiaryEntry> {
      return request('/bestiary/shared', { method: 'POST', body: JSON.stringify(data) });
    },
    adoptShared(data: {
      projectId: string;
      sharedBestiaryId: string;
      overrideName?: string;
      overrideCategory?: string;
      overrideHearts?: number;
      overrideTactics?: string[];
      overrideDescription?: string;
      overrideNotes?: string;
      isVariant?: boolean;
    }): Promise<BestiaryEntry> {
      return request('/bestiary/adopt-shared', { method: 'POST', body: JSON.stringify(data) });
    },
  },

  relationships: {
    list(projectId: string, entityId?: string): Promise<CanonRelationship[]> {
      const q = entityId ? `&entityId=${entityId}` : '';
      return request(`/relationships?projectId=${projectId}${q}`);
    },
    create(data: Partial<CanonRelationship>): Promise<CanonRelationship> {
      return request('/relationships', { method: 'POST', body: JSON.stringify(data) });
    },
    delete(id: string): Promise<{ success: boolean }> {
      return request(`/relationships/${id}`, { method: 'DELETE' });
    },
  },

  factions: {
    list(projectId: string): Promise<Faction[]> {
      return request(`/factions?projectId=${projectId}`);
    },
    get(id: string): Promise<Faction> {
      return request(`/factions/${id}`);
    },
    create(data: { projectId: string } & Partial<Faction>): Promise<Faction> {
      return request('/factions', { method: 'POST', body: JSON.stringify(data) });
    },
    update(id: string, data: Partial<Faction>): Promise<Faction> {
      return request(`/factions/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    },
    delete(id: string): Promise<{ success: boolean }> {
      return request(`/factions/${id}`, { method: 'DELETE' });
    },
  },

  timelineEvents: {
    list(projectId: string): Promise<TimelineEvent[]> {
      return request(`/timeline-events?projectId=${projectId}`);
    },
    get(id: string): Promise<TimelineEvent> {
      return request(`/timeline-events/${id}`);
    },
    create(data: { projectId: string; title: string; date?: string; description?: string; isProtected?: boolean }): Promise<TimelineEvent> {
      return request('/timeline-events', { method: 'POST', body: JSON.stringify(data) });
    },
    update(id: string, data: Partial<TimelineEvent>): Promise<TimelineEvent> {
      return request(`/timeline-events/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    },
    delete(id: string): Promise<{ success: boolean }> {
      return request(`/timeline-events/${id}`, { method: 'DELETE' });
    },
    setProtection(id: string, isProtected: boolean): Promise<TimelineEvent> {
      return request(`/timeline-events/${id}/protection`, {
        method: 'PUT',
        body: JSON.stringify({ isProtected }),
      });
    },
  },

  technologies: {
    list(projectId: string): Promise<Technology[]> {
      return request(`/technologies?projectId=${projectId}`);
    },
    get(id: string): Promise<Technology> {
      return request(`/technologies/${id}`);
    },
    create(data: {
      projectId: string;
      name: string;
      principles?: string;
      limitations?: string;
      proliferation?: string;
      classification?: string;
      patentsOrTaboos?: string;
      isProtected?: boolean;
    }): Promise<Technology> {
      return request('/technologies', { method: 'POST', body: JSON.stringify(data) });
    },
    update(id: string, data: Partial<Technology>): Promise<Technology> {
      return request(`/technologies/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    },
    delete(id: string): Promise<{ success: boolean }> {
      return request(`/technologies/${id}`, { method: 'DELETE' });
    },
    setProtection(id: string, isProtected: boolean): Promise<Technology> {
      return request(`/technologies/${id}/protection`, {
        method: 'PUT',
        body: JSON.stringify({ isProtected }),
      });
    },
  },

  mysterySignals: {
    list(projectId: string): Promise<MysterySignal[]> {
      return request(`/mystery-signals?projectId=${projectId}`);
    },
    get(id: string): Promise<MysterySignal> {
      return request(`/mystery-signals/${id}`);
    },
    create(data: {
      projectId: string;
      designation: string;
      frequency: string;
      originVector?: string;
      anomalousProperties?: string[];
      transmissionTranscript?: string;
      isProtected?: boolean;
    }): Promise<MysterySignal> {
      return request('/mystery-signals', { method: 'POST', body: JSON.stringify(data) });
    },
    setProtection(id: string, isProtected: boolean): Promise<{ id: string; isProtected: boolean }> {
      return request(`/mystery-signals/${id}/protection`, {
        method: 'PUT',
        body: JSON.stringify({ isProtected }),
      });
    },
    delete(id: string): Promise<{ success: boolean }> {
      return request(`/mystery-signals/${id}`, { method: 'DELETE' });
    },
  },

  locations: {
    listAll(projectId: string): Promise<MapNode[]> {
      return request(`/locations?projectId=${projectId}&all=true`);
    },
    listRoot(projectId: string): Promise<MapNode[]> {
      return request(`/locations?projectId=${projectId}&parentId=null`);
    },
    listChildren(projectId: string, parentId: string): Promise<MapNode[]> {
      return request(`/locations?projectId=${projectId}&parentId=${parentId}`);
    },
    get(id: string): Promise<MapNode> {
      return request(`/locations/${id}`);
    },
    create(data: { projectId: string } & Partial<MapNode>): Promise<MapNode> {
      return request('/locations', { method: 'POST', body: JSON.stringify(data) });
    },
    update(id: string, data: Partial<MapNode>): Promise<MapNode> {
      return request(`/locations/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    },
    delete(id: string): Promise<{ success: boolean }> {
      return request(`/locations/${id}`, { method: 'DELETE' });
    },
    setProtection(id: string, isProtected: boolean): Promise<MapNode> {
      return request(`/locations/${id}/protection`, {
        method: 'PUT',
        body: JSON.stringify({ isProtected }),
      });
    },
  },

  terrain: {
    get(projectId: string, contextId: string | null): Promise<{ cols: number; rows: number; terrainData: string } | null> {
      const ctx = encodeURIComponent(contextId ?? '');
      return request(`/terrain?projectId=${projectId}&contextId=${ctx}`);
    },
    save(data: { projectId: string; contextId: string | null; cols: number; rows: number; terrainData: string }): Promise<{ ok: boolean }> {
      return request('/terrain', { method: 'PUT', body: JSON.stringify({ ...data, contextId: data.contextId ?? '' }) });
    },
  },

  paths: {
    list(projectId: string, contextId: string | null): Promise<MapPath[]> {
      const ctx = encodeURIComponent(contextId ?? '');
      return request(`/paths?projectId=${projectId}&contextId=${ctx}`);
    },
    create(data: { projectId: string; contextId: string | null } & Partial<MapPath>): Promise<MapPath> {
      return request('/paths', { method: 'POST', body: JSON.stringify({ ...data, contextId: data.contextId ?? '' }) });
    },
    update(id: string, data: Partial<MapPath>): Promise<MapPath> {
      return request(`/paths/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    },
    delete(id: string): Promise<{ success: boolean }> {
      return request(`/paths/${id}`, { method: 'DELETE' });
    },
  },

  import: {
    scan(): Promise<ImportFile[]> {
      return request('/import/scan');
    },
    ingest(files: string[], projectId?: string): Promise<{ results: ImportResult[] }> {
      return request('/import/ingest', { method: 'POST', body: JSON.stringify({ files, projectId }) });
    },
    listAssets(projectId?: string): Promise<Asset[]> {
      return request(`/import${projectId ? `?projectId=${projectId}` : ''}`);
    },
    getAssetUrl(id: string): string {
      return `${API_BASE}/import/${id}`;
    },
    getAssetText(id: string): Promise<Asset & { content: string }> {
      return request(`/import/${id}`);
    },
    assignAsset(id: string, projectId: string | null): Promise<{ success: boolean }> {
      return request(`/import/${id}`, { method: 'PUT', body: JSON.stringify({ projectId }) });
    },
    deleteAsset(id: string): Promise<{ success: boolean }> {
      return request(`/import/${id}`, { method: 'DELETE' });
    },
  },

  generatedDrafts: {
    list(params?: { projectId?: string; status?: GeneratedDraftStatus }): Promise<GeneratedDraft[]> {
      const q = new URLSearchParams();
      if (params?.projectId) q.set('projectId', params.projectId);
      if (params?.status) q.set('status', params.status);
      const qs = q.toString();
      return request(`/generated-drafts${qs ? `?${qs}` : ''}`);
    },
    get(id: string): Promise<GeneratedDraft> {
      return request(`/generated-drafts/${id}`);
    },
    updateStatus(id: string, status: GeneratedDraftStatus): Promise<GeneratedDraft> {
      return request(`/generated-drafts/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
    },
    promote(id: string, force = false): Promise<PromotionResult> {
      return request(`/generated-drafts/${id}/promote`, {
        method: 'POST',
        body: JSON.stringify({ force }),
      });
    },
  },
};

export type GeneratedDraftStatus = 'generated' | 'accepted' | 'rejected';

export interface GeneratedWorldBrief {
  name?: string;
  summary?: string;
  themes?: string[];
  openQuestions?: string[];
}

export interface GeneratedCharacter {
  id?: string;
  name?: string;
  role?: string;
  summary?: string;
  motivation?: string;
  locationId?: string;
  factionIds?: string[];
  [key: string]: unknown;
}

export interface GeneratedFaction {
  id?: string;
  name?: string;
  summary?: string;
  goal?: string;
  pressure?: string;
  alliedFactionIds?: string[];
  rivalFactionIds?: string[];
  [key: string]: unknown;
}

export interface GeneratedLocation {
  id?: string;
  name?: string;
  summary?: string;
  regionType?: string;
  factionIds?: string[];
  [key: string]: unknown;
}

export interface GeneratedTimelineEvent {
  id?: string;
  date?: string;
  title?: string;
  summary?: string;
  after?: string[];
  before?: string[];
  characterIds?: string[];
  locationIds?: string[];
  factionIds?: string[];
  [key: string]: unknown;
}

export interface GeneratedDraftPayload {
  jobType?: string;
  schemaVersion?: number;
  worldBrief?: GeneratedWorldBrief;
  characters?: GeneratedCharacter[];
  factions?: GeneratedFaction[];
  locations?: GeneratedLocation[];
  timelineEvents?: GeneratedTimelineEvent[];
  [key: string]: unknown;
}

export interface GateViolation {
  code: string;
  path: string;
  message: string;
  field?: string;
  details?: unknown;
  actual?: unknown;
  [key: string]: unknown;
}

export interface GateResult {
  ok: boolean;
  violations?: GateViolation[];
  [key: string]: unknown;
}

export interface GeneratedDraft {
  id: string;
  projectId: string;
  artifactType: string;
  payload: GeneratedDraftPayload;
  status: GeneratedDraftStatus;
  dashboardProjectId?: string | null;
  dashboardTaskId?: string | null;
  dashboardRunId?: string | null;
  modelProvider?: string | null;
  modelName?: string | null;
  promptFingerprint?: string | null;
  gateResult?: GateResult | null;
  promotedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PromotionResult {
  success: boolean;
  draftId: string;
  projectId: string;
  dashboardTaskId: string;
  promotedAt: string;
  counts: {
    worldBriefUpdated: boolean;
    characters: number;
    factions: number;
    locations: number;
    timelineEvents: number;
  };
}

export interface DndArtifactExport {
  id: string;
  artifactType: string;
  status: GeneratedDraftStatus;
  payload: GeneratedDraftPayload;
}

export function toDndArtifact(draft: GeneratedDraft): DndArtifactExport {
  return {
    id: draft.id,
    artifactType: draft.artifactType,
    status: draft.status,
    payload: draft.payload,
  };
}

export interface ImportFile {
  filename: string;
  relativePath: string;
  fullPath: string;
  extension: string;
  fileType: 'text' | 'image';
  mimeType: string;
  size: number;
  modifiedAt: string;
  alreadyImported: boolean;
}

export interface ImportResult {
  path: string;
  status: 'imported' | 'skipped' | 'error';
  id?: string;
  error?: string;
  reason?: string;
  fileType?: string;
  size?: number;
}

export interface Asset {
  id: string;
  projectId: string | null;
  filename: string;
  originalPath: string;
  fileType: 'text' | 'image';
  mimeType: string;
  size: number;
  importedAt: string;
  content?: string;
}
