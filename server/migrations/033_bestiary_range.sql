-- Where a creature is found.
--
-- Nothing recorded it. The bestiary had a niche and a category -- what KIND of
-- thing it is -- and no answer at all to where you would meet one, which is
-- the question somebody writing a scene actually has. There were no
-- creature-to-place edges in canon_relationships either; the relationship
-- simply did not exist in any form.
--
-- A RANGE, NOT A LOCATION
-- One column would say a species lives in exactly one room. A rift-haunting
-- entity is found in three chambers of the Ghost Hulk and on Voidshroud, and
-- forcing that into a single field means picking one and losing the rest. So
-- it is a join, the same shape the maps take for the same reason.
--
-- Containment is NOT stored here. Places already form a tree through
-- locations.parent_id, so recording a creature in the Ghost Hulk and again in
-- every chamber inside it would be the same fact written seven times, and the
-- seven copies would start disagreeing the first time a chamber moved. What is
-- recorded is where it was actually observed; "and everything inside there" is
-- computed from the tree at the moment somebody asks.
CREATE TABLE IF NOT EXISTS bestiary_ranges (
  id           TEXT PRIMARY KEY,
  bestiary_id  TEXT NOT NULL REFERENCES bestiary(id) ON DELETE CASCADE,
  location_id  TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  -- What it does there, when that differs from what it does anywhere else. A
  -- thing that hunts in one chamber and nests in another is one creature with
  -- two habits, not two creatures.
  notes        TEXT NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per creature per place. Saying it twice is not saying it louder.
CREATE UNIQUE INDEX IF NOT EXISTS bestiary_ranges_once
  ON bestiary_ranges (bestiary_id, location_id);

CREATE INDEX IF NOT EXISTS bestiary_ranges_by_location
  ON bestiary_ranges (location_id);
