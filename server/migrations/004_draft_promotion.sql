ALTER TABLE generated_drafts ADD COLUMN IF NOT EXISTS promoted_at TIMESTAMPTZ;

ALTER TABLE characters ADD COLUMN IF NOT EXISTS source_draft_id TEXT;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS source_task_id TEXT;

ALTER TABLE locations ADD COLUMN IF NOT EXISTS source_draft_id TEXT;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS source_task_id TEXT;

ALTER TABLE factions ADD COLUMN IF NOT EXISTS source_draft_id TEXT;
ALTER TABLE factions ADD COLUMN IF NOT EXISTS source_task_id TEXT;

ALTER TABLE timeline_events ADD COLUMN IF NOT EXISTS source_draft_id TEXT;
ALTER TABLE timeline_events ADD COLUMN IF NOT EXISTS source_task_id TEXT;

CREATE INDEX IF NOT EXISTS idx_characters_source_draft ON characters(source_draft_id);
CREATE INDEX IF NOT EXISTS idx_locations_source_draft ON locations(source_draft_id);
CREATE INDEX IF NOT EXISTS idx_factions_source_draft ON factions(source_draft_id);
CREATE INDEX IF NOT EXISTS idx_timeline_events_source_draft ON timeline_events(source_draft_id);
