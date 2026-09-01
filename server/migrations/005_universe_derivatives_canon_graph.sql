-- 005_universe_derivatives_canon_graph.sql
-- Adds derivative works, shared bestiary, shared characters, and canon graph relationships.

-- 1. Derivative works (campaigns, stories, screenplays, game concepts, storyboards)
CREATE TABLE IF NOT EXISTS derivative_works (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  content TEXT NOT NULL DEFAULT '',
  source_canon_references JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  updated_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
);

CREATE INDEX IF NOT EXISTS idx_derivative_works_project ON derivative_works(project_id);
CREATE INDEX IF NOT EXISTS idx_derivative_works_type ON derivative_works(type);

-- 2. Shared / Global Bestiary
CREATE TABLE IF NOT EXISTS shared_bestiary (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  default_hearts INTEGER,
  default_tactics JSONB NOT NULL DEFAULT '[]'::jsonb,
  description TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  updated_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
);

ALTER TABLE bestiary ADD COLUMN IF NOT EXISTS shared_bestiary_id TEXT REFERENCES shared_bestiary(id) ON DELETE SET NULL;
ALTER TABLE bestiary ADD COLUMN IF NOT EXISTS is_shared_variant BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_bestiary_shared_id ON bestiary(shared_bestiary_id);

-- 3. Shared / Global Characters
CREATE TABLE IF NOT EXISTS shared_characters (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  archetype TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  background TEXT NOT NULL DEFAULT '',
  default_traits JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  updated_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
);

ALTER TABLE characters ADD COLUMN IF NOT EXISTS shared_character_id TEXT REFERENCES shared_characters(id) ON DELETE SET NULL;
ALTER TABLE characters ADD COLUMN IF NOT EXISTS is_shared_variant BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_characters_shared_id ON characters(shared_character_id);

-- 4. Canon graph / relationships
CREATE TABLE IF NOT EXISTS canon_relationships (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  source_entity_id TEXT NOT NULL,
  source_entity_type TEXT NOT NULL,
  target_entity_id TEXT NOT NULL,
  target_entity_type TEXT NOT NULL,
  relationship_type TEXT NOT NULL,
  confidence TEXT NOT NULL DEFAULT 'canon',
  source_draft_id TEXT,
  source_task_id TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  updated_at TEXT NOT NULL DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
);

CREATE INDEX IF NOT EXISTS idx_canon_rel_project ON canon_relationships(project_id);
CREATE INDEX IF NOT EXISTS idx_canon_rel_source ON canon_relationships(source_entity_id);
CREATE INDEX IF NOT EXISTS idx_canon_rel_target ON canon_relationships(target_entity_id);
