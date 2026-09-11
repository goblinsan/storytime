-- A work, and the arc it tells.
--
-- Arcs held the bones of a story -- a throughline, what it keeps out, acts
-- and their beats -- and works held the story, with nothing between them: the
-- agent writing a work's parts was handed every arc in the universe as
-- background and left to guess which, if any, the work was telling.
--
-- A work can be built from an arc, and a part can tell an act of it. Both are
-- columns, not sentences in a description, so the agent can be handed exactly
-- the arc and the act. Deleting an arc or an act leaves the work and its parts
-- where they are, unlinked: the story does not go because its outline did.
ALTER TABLE derivative_works ADD COLUMN IF NOT EXISTS arc_id TEXT
  REFERENCES story_arcs(id) ON DELETE SET NULL;
ALTER TABLE derivative_works ADD COLUMN IF NOT EXISTS act_id TEXT
  REFERENCES arc_acts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS derivative_works_by_arc ON derivative_works (arc_id);
CREATE INDEX IF NOT EXISTS derivative_works_by_act ON derivative_works (act_id);
