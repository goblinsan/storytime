-- Migration 019: which characters a derivative work is about, and in what order
--
-- Importance is not a property of a character. It is a property of a character
-- IN A WORK: a figure who carries one story stands at the edge of another, and
-- the cast surface has been reading a single `characters.importance` column as
-- though a universe had one running order. This records billing per work.
--
-- "Work" is any derivative -- story, novel, campaign, screenplay, storyboard,
-- graphic novel, game concept -- because a universe's cast is arranged
-- differently by each of them.
--
-- Additive and idempotent.

CREATE TABLE IF NOT EXISTS work_characters (
  work_id TEXT NOT NULL REFERENCES derivative_works(id) ON DELETE CASCADE,
  character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,

  -- Running order within this work. 1 is top billing. Sparse on purpose, so a
  -- character can be inserted between two others without renumbering the cast.
  billing INTEGER NOT NULL DEFAULT 1000,

  -- Overrides characters.importance for this work only. Null means "however
  -- this character is normally recorded".
  importance TEXT,

  -- Why the linkage exists, so a derived link can be told from an authored one
  -- and corrected rather than silently trusted.
  source TEXT NOT NULL DEFAULT 'authored',

  notes TEXT NOT NULL DEFAULT '',

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (work_id, character_id),

  CONSTRAINT work_characters_importance_check
    CHECK (importance IS NULL OR importance IN ('principal', 'supporting', 'background')),
  CONSTRAINT work_characters_source_check
    CHECK (source IN ('authored', 'derived'))
);

CREATE INDEX IF NOT EXISTS idx_work_characters_work ON work_characters(work_id, billing);
CREATE INDEX IF NOT EXISTS idx_work_characters_character ON work_characters(character_id);
