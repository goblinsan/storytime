CREATE TABLE IF NOT EXISTS generated_drafts (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  artifact_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'generated',
  dashboard_project_id TEXT NOT NULL DEFAULT '',
  dashboard_task_id TEXT NOT NULL DEFAULT '',
  dashboard_run_id TEXT NOT NULL DEFAULT '',
  model_provider TEXT NOT NULL DEFAULT '',
  model_name TEXT NOT NULL DEFAULT '',
  prompt_fingerprint TEXT NOT NULL DEFAULT '',
  gate_result JSONB NOT NULL DEFAULT '{"ok":true,"violations":[]}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT generated_drafts_status_check
    CHECK (status IN ('generated', 'accepted', 'rejected')),
  CONSTRAINT generated_drafts_artifact_type_check
    CHECK (artifact_type <> '')
);

CREATE INDEX IF NOT EXISTS idx_generated_drafts_project
  ON generated_drafts(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_generated_drafts_dashboard_task
  ON generated_drafts(dashboard_project_id, dashboard_task_id);

CREATE INDEX IF NOT EXISTS idx_generated_drafts_status
  ON generated_drafts(status);
