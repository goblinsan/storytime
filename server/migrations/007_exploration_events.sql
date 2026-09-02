-- Migration 007: Exploration events outbox for cyclical story engine

CREATE TABLE IF NOT EXISTS exploration_events (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  draft_id TEXT NOT NULL REFERENCES generated_drafts(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, processed, dismissed
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_exploration_events_project_status
  ON exploration_events(project_id, status);
