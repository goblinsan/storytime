import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'storytime.db');

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create tables — projects (formerly stories) is the top-level entity
db.exec(`
  CREATE TABLE IF NOT EXISTS stories (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT '',
    author TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL DEFAULT 'story',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    is_published INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS characters (
    id TEXT PRIMARY KEY,
    story_id TEXT NOT NULL,
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
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS story_arcs (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    arc_number INTEGER NOT NULL DEFAULT 0,
    title TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    details TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES stories(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS bestiary (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT '',
    hearts INTEGER,
    tactics TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'active',
    description TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES stories(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS locations (
    id TEXT PRIMARY KEY,
    story_id TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    coordinates_x REAL,
    coordinates_y REAL,
    region_type TEXT NOT NULL DEFAULT '',
    races TEXT NOT NULL DEFAULT '[]',
    political_notes TEXT NOT NULL DEFAULT '',
    FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS timeline_events (
    id TEXT PRIMARY KEY,
    story_id TEXT NOT NULL,
    date TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS world_building (
    story_id TEXT PRIMARY KEY,
    map_data TEXT DEFAULT '',
    FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS cultures (
    story_id TEXT PRIMARY KEY,
    myths TEXT NOT NULL DEFAULT '[]',
    politics_type TEXT NOT NULL DEFAULT '',
    politics_description TEXT NOT NULL DEFAULT '',
    FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS languages (
    id TEXT PRIMARY KEY,
    story_id TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    vocabulary TEXT NOT NULL DEFAULT '{}',
    grammar TEXT DEFAULT '',
    FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS religions (
    id TEXT PRIMARY KEY,
    story_id TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    beliefs TEXT NOT NULL DEFAULT '[]',
    deities TEXT NOT NULL DEFAULT '[]',
    FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS factions (
    id TEXT PRIMARY KEY,
    story_id TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    goals TEXT NOT NULL DEFAULT '[]',
    FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS assets (
    id TEXT PRIMARY KEY,
    story_id TEXT,
    filename TEXT NOT NULL,
    original_path TEXT NOT NULL,
    file_type TEXT NOT NULL,
    mime_type TEXT NOT NULL DEFAULT '',
    content TEXT,
    data BLOB,
    size INTEGER NOT NULL DEFAULT 0,
    imported_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS map_terrain (
    story_id  TEXT NOT NULL,
    context_id TEXT NOT NULL DEFAULT '',
    cols INTEGER NOT NULL DEFAULT 80,
    rows INTEGER NOT NULL DEFAULT 50,
    terrain_data TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (story_id, context_id),
    FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS map_paths (
    id TEXT PRIMARY KEY,
    story_id TEXT NOT NULL,
    context_id TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL DEFAULT '',
    path_type TEXT NOT NULL DEFAULT 'road',
    waypoints TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE
  );
`);

// ── Migrations for existing databases ─────────────────────────────────
// Add new columns if they don't already exist (safe to re-run)
const migrate = (table, column, type) => {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
  if (!cols.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
};

// stories → add type & description
migrate('stories', 'type', "TEXT NOT NULL DEFAULT 'story'");
migrate('stories', 'description', "TEXT NOT NULL DEFAULT ''");

// characters → campaign fields
migrate('characters', 'character_type', "TEXT NOT NULL DEFAULT 'story'");
migrate('characters', 'role', "TEXT NOT NULL DEFAULT ''");
migrate('characters', 'hearts', 'INTEGER');
migrate('characters', 'core_skills', "TEXT NOT NULL DEFAULT '[]'");
migrate('characters', 'special_abilities', "TEXT NOT NULL DEFAULT '[]'");
migrate('characters', 'notable_moments', "TEXT NOT NULL DEFAULT '[]'");
migrate('characters', 'tendencies', "TEXT NOT NULL DEFAULT ''");
migrate('characters', 'location', "TEXT NOT NULL DEFAULT ''");
migrate('characters', 'motivation', "TEXT NOT NULL DEFAULT ''");

// locations → campaign region fields
migrate('locations', 'region_type', "TEXT NOT NULL DEFAULT ''");
migrate('locations', 'races', "TEXT NOT NULL DEFAULT '[]'");
migrate('locations', 'political_notes', "TEXT NOT NULL DEFAULT ''");
migrate('locations', 'cells', "TEXT NOT NULL DEFAULT '[]'");

// locations → world map grid fields
migrate('locations', 'parent_id', 'TEXT');
migrate('locations', 'level', 'INTEGER NOT NULL DEFAULT 0');
migrate('locations', 'grid_x', 'INTEGER NOT NULL DEFAULT 0');
migrate('locations', 'grid_y', 'INTEGER NOT NULL DEFAULT 0');
migrate('locations', 'cols', 'INTEGER NOT NULL DEFAULT 6');
migrate('locations', 'rows', 'INTEGER NOT NULL DEFAULT 4');
migrate('locations', 'map_image', "TEXT NOT NULL DEFAULT ''");
migrate('locations', 'connections', "TEXT NOT NULL DEFAULT '{}'");

// characters → map placement
migrate('characters', 'current_location_id', 'TEXT');

// map_paths → width multiplier
migrate('map_paths', 'width_multiplier', 'REAL NOT NULL DEFAULT 1');

export default db;
