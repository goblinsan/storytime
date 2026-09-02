CREATE TABLE IF NOT EXISTS technologies (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  principles TEXT NOT NULL DEFAULT '',
  limitations TEXT NOT NULL DEFAULT '',
  proliferation TEXT NOT NULL DEFAULT '',
  classification TEXT NOT NULL DEFAULT '',
  patents_or_taboos TEXT NOT NULL DEFAULT '',
  is_protected BOOLEAN NOT NULL DEFAULT FALSE,
  source_draft_id TEXT,
  source_task_id TEXT,
  created_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  updated_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
);

CREATE INDEX IF NOT EXISTS idx_technologies_project ON technologies(project_id);
CREATE INDEX IF NOT EXISTS idx_technologies_protected ON technologies(project_id, is_protected);
