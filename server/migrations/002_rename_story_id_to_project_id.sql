-- Finishes the stories -> projects rename at the schema level. story_arcs and
-- bestiary already used project_id; every other table referencing the
-- top-level stories(id) row used story_id. One name throughout now.

ALTER TABLE characters RENAME COLUMN story_id TO project_id;
ALTER TABLE locations RENAME COLUMN story_id TO project_id;
ALTER TABLE timeline_events RENAME COLUMN story_id TO project_id;
ALTER TABLE world_building RENAME COLUMN story_id TO project_id;
ALTER TABLE cultures RENAME COLUMN story_id TO project_id;
ALTER TABLE languages RENAME COLUMN story_id TO project_id;
ALTER TABLE religions RENAME COLUMN story_id TO project_id;
ALTER TABLE factions RENAME COLUMN story_id TO project_id;
ALTER TABLE assets RENAME COLUMN story_id TO project_id;
ALTER TABLE map_terrain RENAME COLUMN story_id TO project_id;
ALTER TABLE map_paths RENAME COLUMN story_id TO project_id;

ALTER INDEX idx_characters_story RENAME TO idx_characters_project;
ALTER INDEX idx_locations_story RENAME TO idx_locations_project;
ALTER INDEX idx_timeline_story RENAME TO idx_timeline_project;
ALTER INDEX idx_map_paths_story RENAME TO idx_map_paths_project;
