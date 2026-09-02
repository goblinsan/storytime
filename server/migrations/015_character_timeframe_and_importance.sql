-- Migration 015: Generic character importance and active timeframe modeling
ALTER TABLE characters ADD COLUMN IF NOT EXISTS importance TEXT NOT NULL DEFAULT 'supporting';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_characters_importance'
  ) THEN
    ALTER TABLE characters ADD CONSTRAINT chk_characters_importance CHECK (importance IN ('principal', 'supporting', 'background'));
  END IF;
END $$;

ALTER TABLE characters ADD COLUMN IF NOT EXISTS active_timeframe_start INTEGER;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS active_timeframe_end INTEGER;

CREATE INDEX IF NOT EXISTS idx_characters_importance ON characters(project_id, importance);
CREATE INDEX IF NOT EXISTS idx_characters_timeframe ON characters(project_id, active_timeframe_start, active_timeframe_end);

ALTER TABLE stories ADD COLUMN IF NOT EXISTS calendar_label TEXT;
