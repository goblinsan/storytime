-- A universe can be drawn too.
--
-- Maps belonged to a place, and the thing an author most wants a map of --
-- the whole setting, with its outermost places on it -- was the one thing
-- that could not have one. There is no place called "Void Requiem"; the
-- universe is what contains the places.
--
-- So a map's subject is either a place or the universe itself. `location_id`
-- becomes nullable and null means "this is a map of the universe", scoped by
-- the project_id the column already carried.
--
-- Pins need no change at all. A pin names the drawing it sits on and the place
-- it marks, so pinning Oakhaven Prime onto a map of the universe is the same
-- record as pinning a deck onto a map of a station. That is the second time
-- that decision has paid for itself.
ALTER TABLE location_maps ALTER COLUMN location_id DROP NOT NULL;

-- The partial index below already guarantees one default per place, but NULLs
-- are distinct in an index, so every universe map would count as its own
-- place and a universe could have any number of defaults. This is the same
-- rule stated for the null case.
CREATE UNIQUE INDEX IF NOT EXISTS idx_location_maps_universe_primary
  ON location_maps(project_id) WHERE location_id IS NULL AND is_primary;

CREATE INDEX IF NOT EXISTS idx_location_maps_universe
  ON location_maps(project_id) WHERE location_id IS NULL;
