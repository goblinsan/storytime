CREATE TABLE IF NOT EXISTS mystery_signals (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  designation TEXT NOT NULL,
  frequency TEXT NOT NULL,
  origin_vector TEXT,
  anomalous_properties TEXT NOT NULL DEFAULT '[]',
  transmission_transcript TEXT,
  is_protected BOOLEAN NOT NULL DEFAULT FALSE,
  source_draft_id TEXT,
  source_task_id TEXT,
  created_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  updated_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);

CREATE INDEX IF NOT EXISTS idx_mystery_signals_project ON mystery_signals(project_id);
