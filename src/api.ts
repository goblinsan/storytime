import type { Story, Character, StoryArc, BestiaryEntry, ProjectType } from './types/story';

const API_BASE = '/api';

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
    list(storyId: string, characterType?: string): Promise<Character[]> {
      let url = `/characters?storyId=${storyId}`;
      if (characterType) url += `&characterType=${characterType}`;
      return request(url);
    },
    get(id: string): Promise<Character> {
      return request(`/characters/${id}`);
    },
    create(data: { storyId: string } & Partial<Character>): Promise<Character> {
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

  import: {
    scan(): Promise<ImportFile[]> {
      return request('/import/scan');
    },
    ingest(files: string[], storyId?: string): Promise<{ results: ImportResult[] }> {
      return request('/import/ingest', { method: 'POST', body: JSON.stringify({ files, storyId }) });
    },
    listAssets(storyId?: string): Promise<Asset[]> {
      return request(`/import${storyId ? `?storyId=${storyId}` : ''}`);
    },
    getAssetUrl(id: string): string {
      return `${API_BASE}/import/${id}`;
    },
    getAssetText(id: string): Promise<Asset & { content: string }> {
      return request(`/import/${id}`);
    },
    assignAsset(id: string, storyId: string | null): Promise<{ success: boolean }> {
      return request(`/import/${id}`, { method: 'PUT', body: JSON.stringify({ storyId }) });
    },
    deleteAsset(id: string): Promise<{ success: boolean }> {
      return request(`/import/${id}`, { method: 'DELETE' });
    },
  },
};

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
  storyId: string | null;
  filename: string;
  originalPath: string;
  fileType: 'text' | 'image';
  mimeType: string;
  size: number;
  importedAt: string;
  content?: string;
}
