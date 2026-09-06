-- Migration 018: Visual reference assets and their generated descriptions
--
-- The media studio catalogues reference art and generated imagery, and the
-- visual_description_from_image job type turns an asset into a canon-grounded
-- description. Both need somewhere to live. Additive and idempotent.

CREATE TABLE IF NOT EXISTS media_assets (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,

  url TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'reference',
  title TEXT,
  caption TEXT,

  -- What the asset depicts, when it depicts something in canon. Nullable
  -- because a mood reference legitimately depicts nothing in particular.
  subject_type TEXT,
  subject_id TEXT,

  -- Filled by a visual_description_from_image job. observable and inferred stay
  -- separate all the way down: collapsing them is what the job type exists to
  -- prevent.
  observable_traits JSONB NOT NULL DEFAULT '[]'::jsonb,
  inferred_traits JSONB NOT NULL DEFAULT '[]'::jsonb,
  uncertainties JSONB NOT NULL DEFAULT '[]'::jsonb,
  visual_description TEXT,
  description_status TEXT NOT NULL DEFAULT 'none',
  dashboard_task_id TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT media_assets_kind_check
    CHECK (kind IN ('reference', 'generated', 'panel', 'cover', 'map')),
  CONSTRAINT media_assets_subject_type_check
    CHECK (subject_type IS NULL OR subject_type IN ('character', 'location', 'item', 'faction_crest', 'creature')),
  CONSTRAINT media_assets_description_status_check
    CHECK (description_status IN ('none', 'requested', 'ready', 'accepted'))
);

CREATE INDEX IF NOT EXISTS idx_media_assets_project ON media_assets(project_id);
CREATE INDEX IF NOT EXISTS idx_media_assets_kind ON media_assets(project_id, kind);
CREATE INDEX IF NOT EXISTS idx_media_assets_subject ON media_assets(subject_type, subject_id);
CREATE INDEX IF NOT EXISTS idx_media_assets_recent ON media_assets(updated_at DESC);
