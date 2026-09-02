-- Migration 008: Promotion policy, canon protection, durable idempotency, and persistent circuit breaker

-- 1. Universe Promotion Policy with named CHECK Constraint
ALTER TABLE stories ADD COLUMN IF NOT EXISTS promotion_policy TEXT NOT NULL DEFAULT 'auto_promote';
ALTER TABLE stories DROP CONSTRAINT IF EXISTS chk_stories_promotion_policy;
ALTER TABLE stories ADD CONSTRAINT chk_stories_promotion_policy
  CHECK (promotion_policy IN ('auto_promote', 'auto_accept', 'manual'));

-- 2. Canon Protection Flags across core encyclopedia and narrative tables
ALTER TABLE stories ADD COLUMN IF NOT EXISTS is_protected BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS is_protected BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE factions ADD COLUMN IF NOT EXISTS is_protected BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS is_protected BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE story_arcs ADD COLUMN IF NOT EXISTS is_protected BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE timeline_events ADD COLUMN IF NOT EXISTS is_protected BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE canon_relationships ADD COLUMN IF NOT EXISTS is_protected BOOLEAN NOT NULL DEFAULT FALSE;

-- Protection indexes across all 7 protected tables
CREATE INDEX IF NOT EXISTS idx_stories_protected ON stories(is_protected);
CREATE INDEX IF NOT EXISTS idx_characters_protected ON characters(project_id, is_protected);
CREATE INDEX IF NOT EXISTS idx_factions_protected ON factions(project_id, is_protected);
CREATE INDEX IF NOT EXISTS idx_locations_protected ON locations(project_id, is_protected);
CREATE INDEX IF NOT EXISTS idx_story_arcs_protected ON story_arcs(project_id, is_protected);
CREATE INDEX IF NOT EXISTS idx_timeline_events_protected ON timeline_events(project_id, is_protected);
CREATE INDEX IF NOT EXISTS idx_canon_relationships_protected ON canon_relationships(project_id, is_protected);

-- 3. Durable Exploration Branches (Persistent Circuit Breaker)
CREATE TABLE IF NOT EXISTS exploration_branches (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  branch_key TEXT NOT NULL,
  domain TEXT NOT NULL,
  source_canon_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  is_quarantined BOOLEAN NOT NULL DEFAULT FALSE,
  quarantined_at TIMESTAMPTZ,
  last_failure_reason TEXT,
  reset_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_exploration_branches_key UNIQUE (project_id, branch_key)
);

-- 4. Durable Idempotency Registry for Exploration Threads
CREATE TABLE IF NOT EXISTS exploration_threads (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  thread_fingerprint TEXT NOT NULL,
  branch_key TEXT NOT NULL DEFAULT 'root',
  thread_type TEXT NOT NULL,
  source_entity_id TEXT,
  job_type TEXT NOT NULL,
  depth INTEGER NOT NULL DEFAULT 1,
  cycle_id TEXT,
  retry_ordinal INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'spawned',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_exploration_threads_fingerprint UNIQUE (project_id, thread_fingerprint)
);

ALTER TABLE exploration_threads DROP CONSTRAINT IF EXISTS chk_exploration_threads_status;
ALTER TABLE exploration_threads ADD CONSTRAINT chk_exploration_threads_status
  CHECK (status IN ('spawned', 'completed', 'failed', 'pruned', 'deferred'));

-- 5. Exploration Events Status CHECK Constraint & Single-Owner Draft Index
ALTER TABLE exploration_events DROP CONSTRAINT IF EXISTS chk_exploration_events_status;
ALTER TABLE exploration_events ADD CONSTRAINT chk_exploration_events_status
  CHECK (status IN ('pending', 'processed', 'deferred', 'dismissed'));

CREATE UNIQUE INDEX IF NOT EXISTS uq_exploration_events_draft
  ON exploration_events (draft_id);

-- 6. Unique Non-Null Draft Fingerprint Index (excluding rejected drafts)
CREATE UNIQUE INDEX IF NOT EXISTS uq_generated_drafts_project_fingerprint
  ON generated_drafts (project_id, prompt_fingerprint)
  WHERE prompt_fingerprint IS NOT NULL AND status != 'rejected';

-- 7. Persistent Overnight Run Metrics Table
CREATE TABLE IF NOT EXISTS overnight_runs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  generated_count INTEGER NOT NULL DEFAULT 0,
  promoted_count INTEGER NOT NULL DEFAULT 0,
  rejected_count INTEGER NOT NULL DEFAULT 0,
  deferred_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  blocked_count INTEGER NOT NULL DEFAULT 0,
  spawned_count INTEGER NOT NULL DEFAULT 0,
  active_backlog INTEGER NOT NULL DEFAULT 0,
  summary_metrics JSONB NOT NULL DEFAULT '{}'::jsonb
);
