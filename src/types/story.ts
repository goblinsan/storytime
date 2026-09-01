// ── Map / World Grid ─────────────────────────────────────────────────
export type MapLevel = 0 | 1 | 2 | 3;

export const MAP_LEVEL_NAMES: Record<number, string> = {
  0: 'World',
  1: 'Region',
  2: 'Area',
  3: 'Scene',
};

export interface MapConnections {
  n?: string;
  s?: string;
  e?: string;
  w?: string;
  up?: string;
  down?: string;
}

export interface MapNode {
  id: string;
  projectId: string;
  parentId: string | null;
  name: string;
  description: string;
  level: MapLevel;
  gridX: number;
  gridY: number;
  /** Columns in the sub-grid shown when zoomed into this node */
  cols: number;
  /** Rows in the sub-grid shown when zoomed into this node */
  rows: number;
  /** Background image path for this node's sub-grid view */
  mapImage: string;
  regionType: string;
  races: string[];
  politicalNotes: string;
  connections: MapConnections;  /** Multi-cell occupancy on the grid */
  cells: { x: number; y: number }[];
}

export type MapPathType = 'river' | 'stream' | 'canal' | 'paved' | 'rail' | 'footpath' | 'cart' | 'tunnel' | 'climb' | 'trade_route';

export interface MapPath {
  id: string;
  projectId: string;
  contextId: string;
  name: string;
  pathType: MapPathType;
  waypoints: { x: number; y: number }[];
  widthMultiplier: number;
}

// ── Project (top-level entity, represents Universe Encyclopedia) ────────
export type ProjectType = 'universe' | 'story' | 'campaign';

export interface CanonDimensionCounts {
  characters: number;
  locations: number;
  factions: number;
  timelineEvents: number;
  bestiary: number;
  religions?: number;
  languages?: number;
  cultures?: number;
  drafts: number;
  derivatives?: number;
  arcs?: number;
}

export type DerivativeWorkType = 'campaign' | 'story' | 'screenplay' | 'game_concept' | 'storyboard';
export type DerivativeWorkStatus = 'draft' | 'in_progress' | 'completed' | 'archived';

export interface DerivativeWork {
  id: string;
  projectId: string;
  type: DerivativeWorkType;
  title: string;
  description: string;
  status: DerivativeWorkStatus;
  content?: string;
  sourceCanonReferences?: Array<{
    entityType: string;
    entityId: string;
    name?: string;
  }>;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  title: string;
  author: string;
  description: string;
  content: string;           // story text or notes
  type: ProjectType;
  createdAt: string;
  updatedAt: string;
  isPublished: boolean;
  counts?: CanonDimensionCounts;
  characters?: Character[];
  worldBuilding?: WorldBuilding;
  culture?: Culture;
  arcs?: StoryArc[];
  bestiary?: BestiaryEntry[];
  factions?: Faction[];
  timelineEvents?: TimelineEvent[];
  derivatives?: DerivativeWork[];
}

export interface UniverseEncyclopedia {
  project: Project;
  counts: CanonDimensionCounts;
  catalog: {
    characters: Character[];
    locations: Location[];
    factions: Faction[];
    timelineEvents: TimelineEvent[];
    bestiary: BestiaryEntry[];
    religions: Religion[];
    languages: Language[];
    cultures: Culture[];
    drafts: unknown[];
    derivatives: DerivativeWork[];
    arcs: StoryArc[];
  };
  recentUpdates?: {
    characters?: Character[];
    locations?: Location[];
    factions?: Faction[];
    timelineEvents?: TimelineEvent[];
    bestiary?: BestiaryEntry[];
    drafts?: unknown[];
    derivatives?: DerivativeWork[];
  };
}

/** Backward-compat alias — some older code still references "Story" */
export type Story = Project;

// ── Characters ────────────────────────────────────────────────────────
export type CharacterType = 'story' | 'party' | 'npc';

export interface SharedCharacter {
  id: string;
  name: string;
  archetype: string;
  summary: string;
  background: string;
  defaultTraits: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Character {
  id: string;
  projectId?: string;
  name: string;
  description: string;
  background: string;
  traits: string[];
  relationships: string[];
  // Campaign-specific fields
  characterType: CharacterType;
  role: string;
  hearts: number | null;
  coreSkills: string[];
  specialAbilities: string[];
  notableMoments: string[];
  tendencies: string;
  location: string;
  motivation: string;
  currentLocationId?: string;
  sharedCharacterId?: string;
  isSharedVariant?: boolean;
  sharedCharacter?: {
    id: string;
    name: string;
    archetype?: string;
  };
}

// ── Story Arcs ────────────────────────────────────────────────────────
export interface StoryArc {
  id: string;
  projectId: string;
  arcNumber: number;
  title: string;
  description: string;
  details: string[];
}

// ── Bestiary ──────────────────────────────────────────────────────────
export type BestiaryStatus = 'active' | 'defeated' | 'unknown';

export interface SharedBestiaryEntry {
  id: string;
  name: string;
  category: string;
  defaultHearts: number;
  defaultTactics: string[];
  description: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BestiaryEntry {
  id: string;
  projectId: string;
  name: string;
  category: string;
  hearts: number | null;
  tactics: string[];
  status: BestiaryStatus;
  description: string;
  notes: string;
  sharedBestiaryId?: string;
  isSharedVariant?: boolean;
  sharedBestiary?: {
    id: string;
    name: string;
    category?: string;
  };
}

// ── Canon Relationships ────────────────────────────────────────────────
export interface CanonRelationship {
  id: string;
  projectId: string;
  sourceEntityId: string;
  sourceEntityType: string;
  targetEntityId: string;
  targetEntityType: string;
  relationshipType: string;
  confidence: number;
  sourceDraftId?: string;
  sourceTaskId?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// ── World Building ────────────────────────────────────────────────────
export interface WorldBuilding {
  mapData?: string;
  locations: Location[];
  timeline: TimelineEvent[];
}

export interface Location {
  id: string;
  name: string;
  description: string;
  coordinates?: { x: number; y: number };
  // Campaign-specific
  regionType: string;
  races: string[];
  politicalNotes: string;
}

export interface TimelineEvent {
  id: string;
  date: string;
  title: string;
  description: string;
}

// ── Culture ───────────────────────────────────────────────────────────
export interface Culture {
  myths: string[];
  languages: Language[];
  religions: Religion[];
  politics: PoliticalSystem;
}

export interface Language {
  id: string;
  name: string;
  vocabulary: { [key: string]: string };
  grammar?: string;
}

export interface Religion {
  id: string;
  name: string;
  beliefs: string[];
  deities: string[];
}

export interface PoliticalSystem {
  type: string;
  description: string;
  factions: Faction[];
}

export interface Faction {
  id: string;
  name: string;
  description: string;
  goals: string[];
}

// ── Planning ──────────────────────────────────────────────────────────
export interface ProjectPlan {
  id: string;
  projectId: string;
  tasks: Task[];
  timeline: GanttTask[];
  budget?: number;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: 'todo' | 'in-progress' | 'done';
  priority: 'low' | 'medium' | 'high';
  dueDate?: string;
}

export interface GanttTask {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  progress: number;
  dependencies?: string[];
}
