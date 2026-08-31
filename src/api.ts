import type { Story, Character, StoryArc, BestiaryEntry, ProjectType, MapNode, MapPath } from './types/story';
export type { Story, Character, StoryArc, BestiaryEntry, ProjectType, MapNode, MapPath };

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
  },

  locations: {
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
  createdAt: string;
  updatedAt: string;
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
