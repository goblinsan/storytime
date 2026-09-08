-- Where things are.
--
-- Geography had columns for this and nothing in them: across three universes,
-- forty-five places, zero coordinates, zero connections. `coordinates_x/y` on a
-- location is a single absolute position per universe, which cannot express the
-- thing that is actually wanted -- a city appears on its region's map AND on the
-- continent's, at different points -- so those columns are left alone and a pin
-- is its own record.
--
-- A pin carries no facts. It says which place, on whose map, and where. The
-- location record stays the only truth about what the place IS, so the map and
-- the records cannot disagree about anything except position.
CREATE TABLE IF NOT EXISTS location_pins (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  -- The place whose map this pin sits on.
  map_location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  -- The place the pin marks.
  location_id TEXT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  -- Fractions of the image, not pixels: a new map keeps every pin roughly where
  -- it was instead of scattering them when the dimensions change.
  x DOUBLE PRECISION NOT NULL,
  y DOUBLE PRECISION NOT NULL,
  -- 'proposed' is an agent's guess and must look like one until somebody says
  -- otherwise. A map that presents a guess as placed is the failure this whole
  -- surface has to avoid.
  status TEXT NOT NULL DEFAULT 'placed' CHECK (status IN ('proposed', 'placed')),
  created_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  updated_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
);

-- One pin per place per map. Pinning the same place twice on one map is a
-- mistake, not a feature.
CREATE UNIQUE INDEX IF NOT EXISTS idx_location_pins_unique
  ON location_pins(map_location_id, location_id);
CREATE INDEX IF NOT EXISTS idx_location_pins_map ON location_pins(map_location_id);

-- Where an event happened. Nothing recorded this, which is why "how areas
-- connect, or disconnect, through the timeline" had no way to be answered: the
-- events knew when and the places knew what, and nothing joined them.
ALTER TABLE timeline_events ADD COLUMN IF NOT EXISTS location_id TEXT;
CREATE INDEX IF NOT EXISTS idx_timeline_events_location ON timeline_events(location_id);
