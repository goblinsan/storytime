// ── Project (top-level entity, replaces "Story") ──────────────────────
export type ProjectType = 'story' | 'campaign';

export interface Project {
  id: string;
  title: string;
  author: string;
  description: string;
  content: string;           // story text or session notes
  type: ProjectType;
  createdAt: string;
  updatedAt: string;
  isPublished: boolean;
  characters?: Character[];
  worldBuilding?: WorldBuilding;
  culture?: Culture;
  arcs?: StoryArc[];
  bestiary?: BestiaryEntry[];
}

/** Backward-compat alias — some older code still references "Story" */
export type Story = Project;

// ── Characters ────────────────────────────────────────────────────────
export type CharacterType = 'story' | 'party' | 'npc';

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
