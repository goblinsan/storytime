-- An arc's acts, and the parts of an arc that are not beats.
--
-- An arc's `details` was one flat list, and the agent and the author both used
-- it for everything: the throughline, what is out of scope, "ACT 1 -- ..."
-- headings with a first beat glued on after the colon, the beats, and dated
-- progress notes. The page numbered all of it as beats, so an arc of three
-- acts read as sixteen beats, four of which were not beats at all.
--
-- The acts become records, each with its own beats, so an act can be read,
-- folded and written on its own. What was never a beat gets a column. The
-- existing lists are split by the server the first time an arc is read
-- (arcActs.js), not here: the split is a parse of prose-ish labels, and it is
-- tested there, where a mistake would be a failing test rather than a
-- migration that has already run on somebody's universe.
ALTER TABLE story_arcs ADD COLUMN IF NOT EXISTS throughline TEXT NOT NULL DEFAULT '';
ALTER TABLE story_arcs ADD COLUMN IF NOT EXISTS out_of_scope TEXT NOT NULL DEFAULT '[]';
ALTER TABLE story_arcs ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT '[]';

CREATE TABLE IF NOT EXISTS arc_acts (
  id TEXT PRIMARY KEY,
  arc_id TEXT NOT NULL REFERENCES story_arcs(id) ON DELETE CASCADE,
  act_number INTEGER NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  span TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  beats TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS arc_acts_by_arc ON arc_acts (arc_id, act_number);
