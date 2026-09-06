/**
 * Editorial Frontend Domain Contracts & Types
 *
 * Fully dependency-free model for the rebuilt StoryTime editorial platform.
 * Contains no references to legacy components, pages, or DOM types.
 *
 * Structural Architecture:
 * - A project is always a Universe (world, canon encyclopedia, factions, lore, history).
 * - Stories, novels, campaigns, screenplays, storyboards, graphic novels, and game
 *   concepts are derivative works (WorkType) within a Universe.
 */

// ============================================================================
// Base Primitives & Identifiers
// ============================================================================

export type EntityId = string;

/**
 * Universe setting and narrative classification.
 * Replaces the legacy conflation where projects were typed as derivative formats.
 */
export type UniverseGenre =
  | 'speculative_fiction'
  | 'science_fiction'
  | 'high_fantasy'
  | 'dark_fantasy'
  | 'historical_fiction'
  | 'mythology_folklore'
  | 'mystery_investigation'
  | 'cosmic_horror'
  | 'solarpunk'
  | 'cyberpunk'
  | 'post_apocalyptic'
  | 'general_fiction'
  | (string & {});

export type UniverseSettingCategory =
  | 'secondary_world'
  | 'alternate_history'
  | 'far_future'
  | 'interplanetary'
  | 'urban_supernatural'
  | 'mythic_realm'
  | 'isolated_frontier'
  | (string & {});

export type EditorialEntityType =
  | 'character'
  | 'location'
  | 'faction'
  | 'timeline_event'
  | 'bestiary'
  | 'technology'
  | 'mystery_signal'
  | 'arc'
  | 'relationship'
  | 'path'
  | 'derivative_work';

// ============================================================================
// Themes & Visual Atmosphere
// ============================================================================

export type EditorialThemeId =
  | 'neutral-codex'
  | 'editorial-fantasy'
  | 'science-fiction'
  | 'speculative-mystery'
  | 'historical-chronicle'
  | (string & {});

export interface ThemeTokens {
  canvas: string;
  surface: string;
  surfaceElevated: string;
  borderSubtle: string;
  borderStrong: string;
  textHeading: string;
  textBody: string;
  textMuted: string;
  accentPrimary: string;
  accentSecondary: string;
  fontHeading: string;
  fontBody: string;
  fontMono: string;
}

export interface UniverseThemeSelection {
  id: EditorialThemeId;
  overrides?: Partial<ThemeTokens>;
  coverImageUrl?: string;
}

// ============================================================================
// Direction, Protection, & Autonomy
// ============================================================================

export type AutonomyMode =
  | 'manual'
  | 'assisted'
  | 'autonomous_explore'
  | 'quarantined';

export interface UniverseDirection {
  directionStatement: string;
  focusPeriod?: string;
  coreThemes: string[];
  targetAudience?: string;
  toneGuidelines?: string;
  guardrails: string[];
  autonomyMode: AutonomyMode;
  updatedAt?: string;
}

export interface UniverseProtectionState {
  universeId: EntityId;
  isAutonomousDraftingLocked: boolean;
  protectedEntitiesCount: number;
  protectedByEntityType: Record<EditorialEntityType, number>;
  protectedEntityIds: EntityId[];
  auditLogSummary?: {
    totalAudits: number;
    lastAuditedAt: string;
  };
}

export interface EntityProtectionStatus {
  entityId: EntityId;
  entityType: EditorialEntityType;
  isProtected: boolean;
  protectedAt?: string;
  protectedReason?: string;
  lockedBy?: string;
}

// ============================================================================
// Activity, Concerns, & Suggestions
// ============================================================================

export type ActivityActor = 'author' | 'agent' | 'system' | 'harness';

export type ActivityCategory =
  | 'canon_created'
  | 'canon_updated'
  | 'work_drafted'
  | 'review_completed'
  | 'repair_proposed'
  | 'repair_applied'
  | 'quarantined';

export interface EditorialActivity {
  id: EntityId;
  universeId: EntityId;
  universeTitle?: string;
  entityId?: EntityId;
  entityType: EditorialEntityType;
  title: string;
  description: string;
  timestamp: string;
  actor: ActivityActor;
  category: ActivityCategory;
  linkUrl?: string;
}

export type ConcernSeverity = 'critical' | 'warning' | 'advisory';
export type ConcernStatus = 'open' | 'triaged' | 'resolved' | 'dismissed';
export type ConcernCategory =
  | 'continuity'
  | 'character_inconsistency'
  | 'lore_contradiction'
  | 'timeline_paradox'
  | 'tone_drift'
  | 'unresolved_flag'
  | 'style_guide';

export interface EditorialConcern {
  id: EntityId;
  universeId: EntityId;
  universeTitle?: string;
  severity: ConcernSeverity;
  status: ConcernStatus;
  category: ConcernCategory;
  title: string;
  summary: string;
  entityId?: EntityId;
  entityType?: EditorialEntityType;
  locator?: PassageLocator;
  createdAt: string;
  resolvedAt?: string;
  suggestedFix?: string;
  source: 'rule_engine' | 'consistency_gate' | 'critique_gate' | 'agent_review' | 'manual';
}

export type SuggestionActionType =
  | 'expand_lore'
  | 'resolve_contradiction'
  | 'draft_chapter'
  | 'assign_media'
  | 'link_entities'
  | 'review_passage'
  | 'enrich_cast';

export interface EditorialSuggestion {
  id: EntityId;
  universeId: EntityId;
  title: string;
  rationale: string;
  actionType: SuggestionActionType;
  targetId?: EntityId;
  targetType?: EditorialEntityType;
  priority: 'high' | 'normal' | 'low';
  estimatedEffort?: string;
  status: 'suggested' | 'accepted' | 'declined' | 'in_progress';
}

// ============================================================================
// Backlog & Development Profile
// ============================================================================

export type BacklogStage =
  | 'backlog'
  | 'in_discovery'
  | 'drafting'
  | 'critique'
  | 'ready_for_review'
  | 'completed';

export interface EditorialBacklogItem {
  id: EntityId;
  universeId: EntityId;
  title: string;
  summary: string;
  stage: BacklogStage;
  priorityScore: number;
  entityType?: EditorialEntityType;
  tags: string[];
  isProtected?: boolean;
  assignedAgent?: string;
  externalTaskId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DevelopmentProfile {
  id: EntityId;
  universeId: EntityId;
  premise: string;
  setting: string;
  tone: string;
  aestheticPreferences?: string[];
  targetLength?: string;
  narrativeStyle?: string;
  prohibitedElements: string[];
  activeDevelopmentArcs: string[];
  lastAssessedAt: string;
}

// ============================================================================
// Dashboard Responses (Global & Universe)
// ============================================================================

export interface CanonEntityCounts {
  characters: number;
  locations: number;
  factions: number;
  timelineEvents: number;
  bestiaryEntries: number;
  technologies: number;
  mysterySignals: number;
  arcs: number;
  relationships: number;
}

export interface CrossUniverseBriefing {
  headline: string;
  summary: string;
  totalUniverses: number;
  totalWorks: number;
  totalCanonEntities: number;
  openConcernsCount: number;
  readyRepairsCount: number;
}

export interface UniverseSummary {
  id: EntityId;
  title: string;
  description: string;
  genre?: UniverseGenre;
  settingCategory?: UniverseSettingCategory;
  themeId?: EditorialThemeId;
  canonCounts: CanonEntityCounts;
  worksCount: number;
  concernsCount: number;
  lastActiveAt?: string;
}

export interface EditorialSystemStatus {
  status: 'ok' | 'degraded' | 'maintenance';
  activeGenerationsCount: number;
  queuedTasksCount: number;
  gpuStatus?: string;
}

export interface GlobalDashboardResponse {
  briefing: CrossUniverseBriefing;
  universes: UniverseSummary[];
  activeConcerns: EditorialConcern[];
  recentActivity: EditorialActivity[];
  pendingRepairs: RepairProposalSummary[];
  systemStatus: EditorialSystemStatus;
}

export interface UniverseProfile {
  id: EntityId;
  title: string;
  description: string;
  genre?: UniverseGenre;
  settingCategory?: UniverseSettingCategory;
  createdAt: string;
  updatedAt: string;
  theme?: UniverseThemeSelection;
  coverImageUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface UniverseBriefing {
  headline: string;
  summary: string;
  primaryFocus?: string;
  healthStatus: 'healthy' | 'needs_review' | 'blocked';
  lastReviewAt?: string;
}

export interface UniverseDashboardResponse {
  universe: UniverseProfile;
  direction: UniverseDirection;
  briefing: UniverseBriefing;
  concerns: EditorialConcern[];
  recentActivity: EditorialActivity[];
  suggestions: EditorialSuggestion[];
  backlog: EditorialBacklogItem[];
  protectionState: UniverseProtectionState;
  works: ReaderWorkSummary[];
  backlogUnavailable?: boolean;
}

// ============================================================================
// Search & Canon Encyclopedia
// ============================================================================

export interface CanonSearchResult {
  id: EntityId;
  universeId: EntityId;
  universeTitle?: string;
  entityType: EditorialEntityType;
  name: string;
  summary: string;
  matchScore: number;
  matchSnippet?: string;
  isProtected: boolean;
  tags: string[];
  updatedAt: string;
}

export interface CanonRelationship {
  id: EntityId;
  universeId: EntityId;
  sourceEntityId: EntityId;
  sourceEntityType: EditorialEntityType;
  targetEntityId: EntityId;
  targetEntityType: EditorialEntityType;
  relationKind: string;
  description?: string;
  isBiDirectional: boolean;
  confidenceScore?: number;
}

// ============================================================================
// Shared Identity Compendium & Variants
// ============================================================================

export interface SharedIdentityVariant {
  id: EntityId;
  sharedEntityId: EntityId;
  sharedType: 'character' | 'bestiary';
  universeId: EntityId;
  universeTitle?: string;
  localEntityId: EntityId;
  localName: string;
  divergenceSummary?: string;
  isAdopted: boolean;
  isVariant: boolean;
  adoptedAt: string;
  differences?: Record<string, { sharedValue: unknown; localValue: unknown }>;
}

export interface SharedIdentitySummary {
  id: EntityId;
  name: string;
  sharedType: 'character' | 'bestiary';
  archetype: string;
  description: string;
  canonicalTraits: string[];
  adoptedUniversesCount: number;
  variants: SharedIdentityVariant[];
}

// ============================================================================
// Passage Review, Annotations, & Repair Proposals
// ============================================================================

export interface PassageLocator {
  workId: EntityId;
  sectionId: EntityId;
  sectionIndex?: number;
  startOffset: number;
  endOffset: number;
  selectedText: string;
  textSha256: string;
  contextBefore?: string;
  contextAfter?: string;
}

export type AnnotationType = 'note' | 'concern' | 'agent_review' | 'inline_flag';
export type AnnotationStatus = 'active' | 'resolved' | 'discarded';

export interface EditorialAnnotation {
  id: EntityId;
  workId: EntityId;
  locator: PassageLocator;
  type: AnnotationType;
  status: AnnotationStatus;
  author: string;
  authorType: 'human' | 'agent' | 'gate';
  content: string;
  flagCategory?: ConcernCategory;
  createdAt: string;
  updatedAt: string;
  repairProposalId?: EntityId;
}

export type RepairStatus =
  | 'pending_review'
  | 'ready'
  | 'applied'
  | 'rejected'
  | 'stale';

export interface RepairDiffDetails {
  additionsCount: number;
  deletionsCount: number;
  changesSummary: string;
  hasPreservedKeywords: boolean;
}

export interface RepairProposal {
  id: EntityId;
  workId: EntityId;
  annotationId?: EntityId;
  locator: PassageLocator;
  status: RepairStatus;
  originalText: string;
  proposedReplacement: string;
  rationale: string;
  agentId?: string;
  modelName?: string;
  isProtectedConflict?: boolean;
  requiresExplicitApproval: boolean;
  gateCheckPassed?: boolean;
  diffDetails?: RepairDiffDetails;
  createdAt: string;
  evaluatedAt?: string;
  appliedAt?: string;
  reviewedBy?: string;
  rejectionReason?: string;
}

export interface RepairProposalSummary {
  id: EntityId;
  workId: EntityId;
  workTitle: string;
  universeId: EntityId;
  universeTitle: string;
  originalSnippet: string;
  replacementSnippet: string;
  status: RepairStatus;
  createdAt: string;
}

export interface SectionContextManifest {
  derivativeId: EntityId;
  sectionLocator: PassageLocator;
  universeId: EntityId;
  universeGenreTone: string;
  charactersInScope: Array<{
    id: EntityId;
    name: string;
    role: string;
    traits: string[];
    motivation: string;
  }>;
  locationsInScope: Array<{
    id: EntityId;
    name: string;
    regionType: string;
  }>;
  factionsInScope: Array<{
    id: EntityId;
    name: string;
    goal: string;
  }>;
  timelineEventsInScope: Array<{
    id: EntityId;
    title: string;
    date: string;
  }>;
  rulesAndGuardrails: string[];
}

// ============================================================================
// Works & Mobile Reader (Derivative Formats)
// ============================================================================

/**
 * Valid formats for creative derivative works generated from or set within a Universe.
 * All format-specific shapes belong strictly under WorkType, not Project/Universe.
 */
export type WorkType =
  | 'story'
  | 'chapter'
  | 'novel'
  | 'campaign'
  | 'screenplay'
  | 'storyboard'
  | 'video_game_concept'
  | 'game_concept'
  | 'graphic_novel'
  | 'lore_anthology'
  | 'handbook';

export type WorkStatus =
  | 'draft'
  | 'in_review'
  | 'revised'
  | 'approved'
  | 'published';

export interface ReaderSection {
  id: EntityId;
  chapterId: EntityId;
  index: number;
  title?: string;
  content: string;
  sha256: string;
  wordCount: number;
  annotations: EditorialAnnotation[];
}

export interface ReaderChapter {
  id: EntityId;
  workId: EntityId;
  chapterNumber: number;
  title: string;
  subtitle?: string;
  content: string;
  wordCount: number;
  sections: ReaderSection[];
  status: WorkStatus;
  nextChapterId?: EntityId;
  prevChapterId?: EntityId;
}

export interface ReaderWork {
  id: EntityId;
  universeId: EntityId;
  title: string;
  subtitle?: string;
  type: WorkType;
  status: WorkStatus;
  summary?: string;
  fullText?: string;
  chapters: ReaderChapter[];
  activeChapterId?: EntityId;
  wordCount: number;
  readingTimeMinutes: number;
  authorNotes?: string;
  metadata?: Record<string, unknown>;
  sourceCanonReferences?: string[];
  isProtected: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ReaderWorkSummary {
  id: EntityId;
  universeId: EntityId;
  title: string;
  type: WorkType;
  status: WorkStatus;
  chaptersCount: number;
  wordCount: number;
  lastModifiedAt: string;
}

// ============================================================================
// Media References & Visual-Description Tasks
// ============================================================================

export interface MediaReference {
  id: EntityId;
  universeId: EntityId;
  title: string;
  originalFilename: string;
  fileType: 'image' | 'text' | 'audio';
  mimeType: string;
  url: string;
  sizeBytes: number;
  width?: number;
  height?: number;
  altText?: string;
  visualDescription?: string;
  subjectType?: EditorialEntityType;
  subjectId?: EntityId;
  tags: string[];
  isGenerated: boolean;
  generatedTaskId?: string;
  createdAt: string;
}

export type VisualTaskStatus = 'queued' | 'in_progress' | 'completed' | 'failed';

export interface VisualDescriptionTask {
  id: EntityId;
  taskId: string;
  workId?: EntityId;
  universeId: EntityId;
  sourceAssetId: EntityId;
  subjectType: EditorialEntityType;
  subjectId: EntityId;
  subjectName?: string;
  mustReference: string[];
  status: VisualTaskStatus;
  generatedDescription?: string;
  resultDetails?: Record<string, unknown>;
  createdAt: string;
  completedAt?: string;
}

// ============================================================================
// Specialized Lenses
// ============================================================================

// 1. Family & Lineage Lens
export interface FamilyNode {
  id: EntityId;
  characterId: EntityId;
  name: string;
  importance: 'principal' | 'supporting' | 'minor' | 'mentioned';
  generation: number;
  clanOrHouse?: string;
  lifespan?: {
    birthYear?: number;
    deathYear?: number;
  };
  parents: EntityId[];
  children: EntityId[];
  spouses: EntityId[];
  attributes: Record<string, unknown>;
}

export interface FamilyTreeLens {
  universeId: EntityId;
  rootCharacterIds: EntityId[];
  nodes: FamilyNode[];
  totalGenerations: number;
  erasCovered?: {
    beginYear: number;
    endYear: number;
  };
}

// 2. Geography & Territory Lens
export interface GeographyLocationNode {
  id: EntityId;
  name: string;
  parentId?: EntityId | null;
  regionType: string;
  summary?: string;
  coordinates?: { x: number; y: number };
  factionControlId?: EntityId;
  children: GeographyLocationNode[];
  isProtected: boolean;
}

export interface GeographyPath {
  id: EntityId;
  name: string;
  fromLocationId: EntityId;
  toLocationId: EntityId;
  pathType: 'road' | 'river' | 'pass' | 'sea_route' | 'tunnel';
  travelDays?: number;
  dangerLevel?: 'safe' | 'moderate' | 'perilous';
}

export interface GeographyLens {
  universeId: EntityId;
  rootLocations: GeographyLocationNode[];
  paths: GeographyPath[];
  totalRegions: number;
  terrainGrid?: {
    cols: number;
    rows: number;
    cells: string[][];
  };
}

// 3. Timeline & Continuity Lens
export interface ContinuityEvent {
  id: EntityId;
  title: string;
  yearOrDate: string;
  numericYear?: number;
  summary: string;
  eraId?: EntityId;
  characterIds: EntityId[];
  locationIds: EntityId[];
  factionIds: EntityId[];
  causalDependencies: {
    prerequisiteEventIds: EntityId[];
    consequentEventIds: EntityId[];
  };
  isProtected: boolean;
  hasContinuityFlag: boolean;
}

export interface TimelineEra {
  id: EntityId;
  name: string;
  startYear: number;
  endYear: number;
  summary: string;
  culturalTone?: string;
}

export interface TimelineLens {
  universeId: EntityId;
  events: ContinuityEvent[];
  eras: TimelineEra[];
  unresolvedParadoxesCount: number;
  isContinuityVerified: boolean;
}

// 4. Societies, Factions, & Religion Lens
export interface SocietyFaction {
  id: EntityId;
  name: string;
  category:
    | 'guild'
    | 'cartel'
    | 'empire'
    | 'order'
    | 'rebel_cell'
    | 'clan'
    | 'faith';
  summary: string;
  primaryGoal: string;
  pressure: string;
  headquartersLocationId?: EntityId;
  leaderCharacterId?: EntityId;
  alliedFactionIds: EntityId[];
  rivalFactionIds: EntityId[];
  isProtected: boolean;
}

export interface SocietyReligion {
  id: EntityId;
  name: string;
  pantheonOrDeity: string;
  doctrines: string[];
  holySites: string[];
  sacredTaboos: string[];
  clergyHierarchy: string;
}

export interface DiplomaticRelation {
  sourceFactionId: EntityId;
  targetFactionId: EntityId;
  stance: 'allied' | 'friendly' | 'neutral' | 'hostile' | 'at_war';
  treatyNotes?: string;
}

export interface SocietiesLens {
  universeId: EntityId;
  factions: SocietyFaction[];
  religions: SocietyReligion[];
  diplomaticWeb: DiplomaticRelation[];
}

// 5. Bestiary & Ecological Niches Lens
export interface BestiaryLensEntry {
  id: EntityId;
  name: string;
  sharedBestiaryId?: EntityId;
  isAdopted: boolean;
  isVariant: boolean;
  category: string;
  threatLevel: 'docile' | 'cautious' | 'dangerous' | 'apex' | 'legendary';
  habitatLocationIds: EntityId[];
  ecologicalNiche: string;
  behaviorNotes: string;
  combatRole?: string;
  isProtected: boolean;
}

export interface EcologicalNiche {
  id: EntityId;
  name: string;
  habitat: string;
  apexPredators: string[];
  preyOrFlora: string[];
  environmentalHazards: string[];
}

export interface BestiaryLens {
  universeId: EntityId;
  entries: BestiaryLensEntry[];
  ecologicalNiches: EcologicalNiche[];
  totalCreatures: number;
}
