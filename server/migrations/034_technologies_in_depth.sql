-- What a technology is, when it appeared, where from, and who holds it.
--
-- The table recorded principles, limitations, proliferation, classification
-- and patents_or_taboos. Three of those are prose and two are enum-ish labels,
-- and between them they could not answer the three questions somebody sorting
-- a list of technologies actually asks: how old is it, where did it come from,
-- and whose is it.
--
-- WHO HOLDS IT IS AN EDGE, NOT A SENTENCE
-- `patents_or_taboos` already says "The Vander-Thorne Orbital Cartel holds
-- exclusive patents on Quantum-Soul Binding" -- a real group, named in prose,
-- unlinked to the row that group actually is. That is the same two-copies
-- problem the societies surface exists to avoid: rename the cartel and the
-- sentence is wrong with nothing to notice it. The prose stays (what the
-- patents mean is worth writing); the FACT of who holds it becomes an edge.
--
-- AGE IS A WORD AND A NUMBER
-- `origin_date` is what the author wrote and the only form ever shown -- "Year
-- of the Iron Dirge 288" is a date. `origin_year` is a number parsed out of it
-- so a list can be sorted, and it is nullable because "before the Collapse" is
-- a real date that no number fits. This is the rule the timeline already uses;
-- copying the rule rather than the column keeps the two surfaces honest about
-- dates in the same way.
ALTER TABLE technologies ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
ALTER TABLE technologies ADD COLUMN IF NOT EXISTS history     TEXT NOT NULL DEFAULT '';
ALTER TABLE technologies ADD COLUMN IF NOT EXISTS origin_date TEXT NOT NULL DEFAULT '';
ALTER TABLE technologies ADD COLUMN IF NOT EXISTS origin_year INTEGER;

ALTER TABLE technologies ADD COLUMN IF NOT EXISTS origin_location_id TEXT
  REFERENCES locations(id) ON DELETE SET NULL;
ALTER TABLE technologies ADD COLUMN IF NOT EXISTS holder_faction_id TEXT
  REFERENCES factions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS technologies_by_origin ON technologies (origin_location_id);
CREATE INDEX IF NOT EXISTS technologies_by_holder ON technologies (holder_faction_id);

-- A technology can be pictured like anything else in the catalogue. The JS
-- allowlist in server/routes/media.js and this constraint are two lists of one
-- fact; mediaSubjectTypes.test.js fails the build when they disagree, which is
-- how the last one of these was caught -- after it had already 500'd.
ALTER TABLE media_assets DROP CONSTRAINT IF EXISTS media_assets_subject_type_check;
ALTER TABLE media_assets ADD CONSTRAINT media_assets_subject_type_check
  CHECK (subject_type IS NULL OR subject_type = ANY (ARRAY[
    'character', 'location', 'item', 'faction_crest', 'creature', 'universe',
    'event', 'technology'
  ]));
