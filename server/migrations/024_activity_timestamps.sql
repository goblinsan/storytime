-- Places, factions and events had no timestamps at all, which is why the
-- overview's "Recently updated" only ever listed characters: it was not a lazy
-- query, there was nothing to order those three by.
--
-- Nullable, and deliberately NOT backfilled. Defaulting existing rows to now()
-- would have every record in the universe claim it changed today, which is a
-- feed that lies on its first render. A row with no timestamp simply does not
-- appear in the feed until something touches it.
ALTER TABLE locations       ADD COLUMN IF NOT EXISTS created_at TEXT;
ALTER TABLE locations       ADD COLUMN IF NOT EXISTS updated_at TEXT;
ALTER TABLE factions        ADD COLUMN IF NOT EXISTS created_at TEXT;
ALTER TABLE factions        ADD COLUMN IF NOT EXISTS updated_at TEXT;
ALTER TABLE timeline_events ADD COLUMN IF NOT EXISTS created_at TEXT;
ALTER TABLE timeline_events ADD COLUMN IF NOT EXISTS updated_at TEXT;
