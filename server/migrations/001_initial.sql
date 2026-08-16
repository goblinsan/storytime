CREATE TABLE IF NOT EXISTS stories (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  author TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'story',
  created_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  updated_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  is_published INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS characters (
  id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'New Character',
  description TEXT NOT NULL DEFAULT '',
  background TEXT NOT NULL DEFAULT '',
  traits TEXT NOT NULL DEFAULT '[]',
  relationships TEXT NOT NULL DEFAULT '[]',
  character_type TEXT NOT NULL DEFAULT 'story',
  role TEXT NOT NULL DEFAULT '',
  hearts INTEGER,
  core_skills TEXT NOT NULL DEFAULT '[]',
  special_abilities TEXT NOT NULL DEFAULT '[]',
  notable_moments TEXT NOT NULL DEFAULT '[]',
  tendencies TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  motivation TEXT NOT NULL DEFAULT '',
  current_location_id TEXT,
  created_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  updated_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
);

CREATE TABLE IF NOT EXISTS story_arcs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  arc_number INTEGER NOT NULL DEFAULT 0,
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  details TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  updated_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
);

CREATE TABLE IF NOT EXISTS bestiary (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  hearts INTEGER,
  tactics TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'active',
  description TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  updated_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
);

CREATE TABLE IF NOT EXISTS locations (
  id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  coordinates_x DOUBLE PRECISION,
  coordinates_y DOUBLE PRECISION,
  region_type TEXT NOT NULL DEFAULT '',
  races TEXT NOT NULL DEFAULT '[]',
  political_notes TEXT NOT NULL DEFAULT '',
  cells TEXT NOT NULL DEFAULT '[]',
  parent_id TEXT,
  level INTEGER NOT NULL DEFAULT 0,
  grid_x INTEGER NOT NULL DEFAULT 0,
  grid_y INTEGER NOT NULL DEFAULT 0,
  cols INTEGER NOT NULL DEFAULT 6,
  rows INTEGER NOT NULL DEFAULT 4,
  map_image TEXT NOT NULL DEFAULT '',
  connections TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS timeline_events (
  id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  date TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS world_building (
  story_id TEXT PRIMARY KEY REFERENCES stories(id) ON DELETE CASCADE,
  map_data TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS cultures (
  story_id TEXT PRIMARY KEY REFERENCES stories(id) ON DELETE CASCADE,
  myths TEXT NOT NULL DEFAULT '[]',
  politics_type TEXT NOT NULL DEFAULT '',
  politics_description TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS languages (
  id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  vocabulary TEXT NOT NULL DEFAULT '{}',
  grammar TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS religions (
  id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  beliefs TEXT NOT NULL DEFAULT '[]',
  deities TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS factions (
  id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  goals TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  story_id TEXT REFERENCES stories(id) ON DELETE SET NULL,
  filename TEXT NOT NULL,
  original_path TEXT NOT NULL,
  file_type TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT '',
  content TEXT,
  data BYTEA,
  size INTEGER NOT NULL DEFAULT 0,
  imported_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
);

CREATE TABLE IF NOT EXISTS map_terrain (
  story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  context_id TEXT NOT NULL DEFAULT '',
  cols INTEGER NOT NULL DEFAULT 80,
  rows INTEGER NOT NULL DEFAULT 50,
  terrain_data TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (story_id, context_id)
);

CREATE TABLE IF NOT EXISTS map_paths (
  id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  context_id TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  path_type TEXT NOT NULL DEFAULT 'road',
  waypoints TEXT NOT NULL DEFAULT '[]',
  width_multiplier DOUBLE PRECISION NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  updated_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
);

CREATE INDEX IF NOT EXISTS idx_characters_story ON characters(story_id);
CREATE INDEX IF NOT EXISTS idx_story_arcs_project ON story_arcs(project_id);
CREATE INDEX IF NOT EXISTS idx_bestiary_project ON bestiary(project_id);
CREATE INDEX IF NOT EXISTS idx_locations_story ON locations(story_id);
CREATE INDEX IF NOT EXISTS idx_locations_parent ON locations(parent_id);
CREATE INDEX IF NOT EXISTS idx_timeline_story ON timeline_events(story_id);
CREATE INDEX IF NOT EXISTS idx_map_paths_story ON map_paths(story_id, context_id);
