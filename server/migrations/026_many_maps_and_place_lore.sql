-- A place has many maps, and more to say than a description.
--
-- MANY MAPS
-- 025 put the map on the place: one `map_image` column, and a pin that named
-- the place whose map it sat on. That is wrong in the ordinary case. A city
-- has a street plan and a trade-route map and a map of the siege; a station
-- has a deck plan per deck. They are different drawings of one place, and a
-- pin belongs to a drawing, not to the place -- the same market sits at a
-- different point on the street plan than on the regional map.
--
-- So a map is its own record, and a pin names the map it is on.
--
-- WHAT A PLACE KNOWS
-- The columns were description, region_type, political_notes and races. Those
-- cannot hold what a place actually accumulates, so four are added:
--
--   history   what happened here
--   folklore  what is *said* to have happened here
--
-- Those are two fields on purpose. Folklore that merely repeats the history is
-- not folklore, and the gap between them -- the version the locals tell -- is
-- usually where the story is.
--
--   biome     the physical setting: terrain, climate, what the place is made of
--   ecology   flora and fauna: what grows here and what lives here
--
-- Also two on purpose: the setting constrains what can live there, and keeping
-- them apart is what lets one be written from the other.

-- The image itself stays in media_assets, which is already the catalogue every
-- picture in a universe is listed in. This table holds only what makes a map a
-- map -- which place it draws, what it is for, whether it opens by default --
-- so a map appears in the media catalogue exactly once and there is no second
-- copy of the URL to drift from the first.
CREATE TABLE IF NOT EXISTS location_maps (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  -- The place this is a map OF.
  location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  -- The picture. Not a URL: the asset row is where a picture's title, caption
  -- and description already live, and a map is a picture with a job.
  media_asset_id TEXT NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  -- What this drawing shows that the others do not: "trade routes", "the siege
  -- of 4102", "deck three". With many maps of one place, the answer to "which
  -- one do I open" is this field and nothing else.
  purpose TEXT NOT NULL DEFAULT '',
  -- The one that opens by default. Partial-unique below, so a place cannot
  -- have two.
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  updated_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
);

CREATE INDEX IF NOT EXISTS idx_location_maps_place ON location_maps(location_id);
-- One default per place, enforced rather than hoped for.
CREATE UNIQUE INDEX IF NOT EXISTS idx_location_maps_primary
  ON location_maps(location_id) WHERE is_primary;

-- The maps that already existed become the first map of their place, and get
-- the catalogue entry they never had. Their URLs point at a render machine and
-- may well not load; that is a separate problem from where the record lives,
-- and losing them would not fix it.
WITH adopted AS (
  INSERT INTO media_assets (id, project_id, url, kind, title, subject_type, subject_id)
  SELECT md5(random()::text || l.id || 'asset'), l.project_id, l.map_image, 'map',
         'Map of ' || l.name, 'location', l.id
  FROM locations l
  WHERE l.map_image <> ''
    AND NOT EXISTS (SELECT 1 FROM location_maps m WHERE m.location_id = l.id)
  RETURNING id, project_id, subject_id
)
INSERT INTO location_maps (id, project_id, location_id, media_asset_id, is_primary)
SELECT md5(random()::text || a.id), a.project_id, a.subject_id, a.id, TRUE FROM adopted a;

-- A pin is on a map, not on a place.
ALTER TABLE location_pins ADD COLUMN IF NOT EXISTS map_id TEXT REFERENCES location_maps(id) ON DELETE CASCADE;

UPDATE location_pins p
SET map_id = m.id
FROM location_maps m
WHERE p.map_id IS NULL AND m.location_id = p.map_location_id AND m.is_primary;

-- Any pin that could not find a map was pointing at a place with no map at
-- all, which was never a coherent record.
DELETE FROM location_pins WHERE map_id IS NULL;

DROP INDEX IF EXISTS idx_location_pins_unique;
DROP INDEX IF EXISTS idx_location_pins_map;
ALTER TABLE location_pins DROP COLUMN IF EXISTS map_location_id;
ALTER TABLE location_pins ALTER COLUMN map_id SET NOT NULL;

-- One pin per place per map. The same place on two maps is two pins, which is
-- the whole point.
CREATE UNIQUE INDEX IF NOT EXISTS idx_location_pins_unique ON location_pins(map_id, location_id);
CREATE INDEX IF NOT EXISTS idx_location_pins_map ON location_pins(map_id);

ALTER TABLE locations ADD COLUMN IF NOT EXISTS history  TEXT NOT NULL DEFAULT '';
ALTER TABLE locations ADD COLUMN IF NOT EXISTS folklore TEXT NOT NULL DEFAULT '';
ALTER TABLE locations ADD COLUMN IF NOT EXISTS biome    TEXT NOT NULL DEFAULT '';
ALTER TABLE locations ADD COLUMN IF NOT EXISTS ecology  TEXT NOT NULL DEFAULT '';
