-- A universe can be somewhere.
--
-- The universe was given maps and pictures but no record, on the reasoning
-- that a universe is a container rather than a place and its writing belongs
-- on Direction. That is true of a galaxy-spanning setting and false of a
-- story that happens entirely in one bedroom, where the root of the tree IS
-- the place and has a biome, a history and folklore like anything else.
--
-- Deciding which kind of universe this is was never the application's call.
-- The fields exist; an author who does not want them leaves them empty, which
-- is what an empty field is for.
--
-- `description` is deliberately NOT duplicated here: a universe already has
-- one, it is the premise, and it is the same sentence whether it is read on
-- Overview or on Geography. One field edited from two surfaces is not a
-- duplicate; two fields holding the same thing would be.
ALTER TABLE stories ADD COLUMN IF NOT EXISTS history  TEXT NOT NULL DEFAULT '';
ALTER TABLE stories ADD COLUMN IF NOT EXISTS folklore TEXT NOT NULL DEFAULT '';
ALTER TABLE stories ADD COLUMN IF NOT EXISTS biome    TEXT NOT NULL DEFAULT '';
ALTER TABLE stories ADD COLUMN IF NOT EXISTS ecology  TEXT NOT NULL DEFAULT '';
