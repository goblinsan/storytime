-- An event you can focus on, look into, and break apart.
--
-- A YEAR TO FOCUS ON
-- `date` is free text -- "Year of the Iron Dirge 299" -- which is the right
-- thing to show and the wrong thing to filter by: you cannot ask for a range
-- of a string. The number is in there, so it is pulled out into a column and
-- the label is left exactly as written. Nothing displays `year`; it is what
-- ordering and a range are computed from.
--
-- Deliberately nullable. An event whose date names no year is not an error --
-- "before the Collapse" is a real thing to write -- and forcing a number would
-- mean inventing one.
ALTER TABLE timeline_events ADD COLUMN IF NOT EXISTS year INTEGER;

-- The last run of digits in the label, which is where a year sits in every
-- form these take: "Year of the Iron Dirge 299", "Third Age, 412", "1904".
UPDATE timeline_events
SET year = CAST((regexp_match(date, '(\d+)(?!.*\d)'))[1] AS INTEGER)
WHERE year IS NULL AND date ~ '\d';

CREATE INDEX IF NOT EXISTS idx_timeline_events_year ON timeline_events(project_id, year);

-- AN EVENT INSIDE AN EVENT
-- A siege is one entry on a timeline and a dozen scenes in the telling. The
-- same shape geography uses for a station inside a system: a parent, and the
-- children read as the sequence it breaks into.
ALTER TABLE timeline_events ADD COLUMN IF NOT EXISTS parent_id TEXT
  REFERENCES timeline_events(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_timeline_events_parent ON timeline_events(parent_id);

-- WHAT AN EVENT KNOWS
-- `description` was all it had. These are the questions a chronicle actually
-- answers, and they are separate for the same reason a place's history and
-- folklore are: an agent asked for one must not be handed the other, and the
-- gap between what happened and how it is told is usually the story.
--
--   account       the fuller telling, at the length it deserves
--   consequences  what it changed, which is why it is on the timeline at all
--   remembrance   how it is remembered, which need not be what happened
ALTER TABLE timeline_events ADD COLUMN IF NOT EXISTS account      TEXT NOT NULL DEFAULT '';
ALTER TABLE timeline_events ADD COLUMN IF NOT EXISTS consequences TEXT NOT NULL DEFAULT '';
ALTER TABLE timeline_events ADD COLUMN IF NOT EXISTS remembrance  TEXT NOT NULL DEFAULT '';

-- An event can be pictured, like a place or a person.
ALTER TABLE media_assets DROP CONSTRAINT IF EXISTS media_assets_subject_type_check;
ALTER TABLE media_assets ADD CONSTRAINT media_assets_subject_type_check
  CHECK (subject_type IS NULL OR subject_type = ANY (ARRAY[
    'character', 'location', 'item', 'faction_crest', 'creature', 'universe', 'event'
  ]));
