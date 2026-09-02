-- Migration 014: Bestiary provenance and canon protection
ALTER TABLE bestiary ADD COLUMN IF NOT EXISTS source_draft_id TEXT REFERENCES generated_drafts(id) ON DELETE SET NULL;
ALTER TABLE bestiary ADD COLUMN IF NOT EXISTS source_task_id TEXT;
ALTER TABLE bestiary ADD COLUMN IF NOT EXISTS is_protected BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_bestiary_protected ON bestiary(project_id, is_protected);
CREATE INDEX IF NOT EXISTS idx_bestiary_source_draft ON bestiary(source_draft_id);
