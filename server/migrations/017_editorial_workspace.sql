-- Migration 017: Editorial workspace
--
-- Direction and theme belong to a universe; annotations and repair proposals
-- belong to a passage inside a derivative work. Everything here is additive and
-- idempotent: no existing column changes and no existing row is touched.

-- ---------------------------------------------------------------------------
-- Universe direction, theme and autonomy
-- ---------------------------------------------------------------------------

ALTER TABLE stories ADD COLUMN IF NOT EXISTS theme_id TEXT;
ALTER TABLE stories ADD COLUMN IF NOT EXISTS theme_overrides JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE stories ADD COLUMN IF NOT EXISTS cover_image_url TEXT;
ALTER TABLE stories ADD COLUMN IF NOT EXISTS persistent_goal TEXT;
ALTER TABLE stories ADD COLUMN IF NOT EXISTS temporary_focus TEXT;
ALTER TABLE stories ADD COLUMN IF NOT EXISTS guardrails JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE stories ADD COLUMN IF NOT EXISTS autonomy_mode TEXT NOT NULL DEFAULT 'assisted';

-- Constrained rather than free text: an unrecognised posture would silently read
-- as "no restriction" to a worker deciding whether it may write canon.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'stories_autonomy_mode_check'
  ) THEN
    ALTER TABLE stories ADD CONSTRAINT stories_autonomy_mode_check
      CHECK (autonomy_mode IN ('manual', 'assisted', 'autonomous_explore'));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Reader annotations
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS reader_annotations (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  derivative_id TEXT NOT NULL REFERENCES derivative_works(id) ON DELETE CASCADE,

  -- Stable locator. section_id plus offsets addresses the passage; the hash of
  -- the selected text is what tells a later reader the prose has moved.
  section_id TEXT NOT NULL,
  start_offset INTEGER NOT NULL,
  end_offset INTEGER NOT NULL,
  selected_text TEXT NOT NULL,
  text_sha256 TEXT NOT NULL,
  context_before TEXT,
  context_after TEXT,

  kind TEXT NOT NULL DEFAULT 'note',
  note TEXT,
  author TEXT,
  status TEXT NOT NULL DEFAULT 'active',

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT reader_annotations_kind_check
    CHECK (kind IN ('note', 'concern', 'agent_review', 'inline_flag')),
  CONSTRAINT reader_annotations_status_check
    CHECK (status IN ('active', 'resolved', 'discarded')),
  CONSTRAINT reader_annotations_range_check
    CHECK (end_offset > start_offset AND start_offset >= 0)
);

CREATE INDEX IF NOT EXISTS idx_reader_annotations_project ON reader_annotations(project_id);
CREATE INDEX IF NOT EXISTS idx_reader_annotations_derivative ON reader_annotations(derivative_id, section_id);
CREATE INDEX IF NOT EXISTS idx_reader_annotations_status ON reader_annotations(project_id, status);
CREATE INDEX IF NOT EXISTS idx_reader_annotations_recent ON reader_annotations(updated_at DESC);

-- ---------------------------------------------------------------------------
-- Repair proposals
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS repair_proposals (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  derivative_id TEXT NOT NULL REFERENCES derivative_works(id) ON DELETE CASCADE,

  section_id TEXT NOT NULL,
  start_offset INTEGER NOT NULL,
  end_offset INTEGER NOT NULL,

  -- Both texts and both hashes are kept. original_text_sha256 is what makes the
  -- proposal stale-safe: if the passage changed after the proposal was made,
  -- applying it would overwrite prose nobody reviewed.
  original_text TEXT NOT NULL,
  original_text_sha256 TEXT NOT NULL,
  replacement_text TEXT NOT NULL,
  replacement_text_sha256 TEXT,

  rationale TEXT,
  cited_canon_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  validation JSONB NOT NULL DEFAULT '[]'::jsonb,

  status TEXT NOT NULL DEFAULT 'pending',
  requires_explicit_approval BOOLEAN NOT NULL DEFAULT TRUE,

  -- Provenance: which dashboard task and which agent produced this.
  dashboard_task_id TEXT,
  proposed_by TEXT,
  source_annotation_id TEXT REFERENCES reader_annotations(id) ON DELETE SET NULL,

  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  applied_at TIMESTAMPTZ,
  rejected_reason TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT repair_proposals_status_check
    CHECK (status IN ('pending', 'ready', 'approved', 'applied', 'rejected', 'stale')),
  CONSTRAINT repair_proposals_range_check
    CHECK (end_offset > start_offset AND start_offset >= 0)
);

CREATE INDEX IF NOT EXISTS idx_repair_proposals_project ON repair_proposals(project_id);
CREATE INDEX IF NOT EXISTS idx_repair_proposals_derivative ON repair_proposals(derivative_id, section_id);
CREATE INDEX IF NOT EXISTS idx_repair_proposals_status ON repair_proposals(project_id, status);
CREATE INDEX IF NOT EXISTS idx_repair_proposals_recent ON repair_proposals(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_repair_proposals_task ON repair_proposals(dashboard_task_id);
