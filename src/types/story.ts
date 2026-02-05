export interface Story {
  id: string;
  title: string;
  author: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  isPublished: boolean;
  characters?: Character[];
  worldBuilding?: WorldBuilding;
  culture?: Culture;
}

export interface Character {
  id: string;
  name: string;
  description: string;
  background: string;
  traits: string[];
  relationships: string[];
}

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
}

export interface TimelineEvent {
  id: string;
  date: string;
  title: string;
  description: string;
}

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

export interface ProjectPlan {
  id: string;
  storyId: string;
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
