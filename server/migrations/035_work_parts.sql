-- A work, and the parts it is made of.
--
-- The library could not say that "Chapter 3: The Ghost Hulk" is a chapter OF
-- "The Harrowed Veil". The fact existed -- metadata.parentStoryId and
-- metadata.chapterNumber on each chapter -- but inside a JSON blob nothing
-- indexed, nothing enforced, and no surface read. Five chapters and the story
-- they belong to sat side by side in a flat list as six unrelated works.
--
-- The same move this codebase has made for a creature's range and a
-- technology's holder: a relationship that other things depend on is a column,
-- not a sentence or a key inside a blob. The JSON stays where it is, because a
-- pipeline outside this surface wrote it and may still read it; new parts get
-- both.
--
-- A part is itself a work, so a part can have parts: a novel's chapters, a
-- chapter's scenes. Deleting a work does NOT delete its parts -- they become
-- works in their own right. Losing a finished chapter because its outline was
-- tidied away is not a trade anybody would choose.
ALTER TABLE derivative_works ADD COLUMN IF NOT EXISTS parent_id TEXT
  REFERENCES derivative_works(id) ON DELETE SET NULL;
ALTER TABLE derivative_works ADD COLUMN IF NOT EXISTS part_number INTEGER;

CREATE INDEX IF NOT EXISTS derivative_works_by_parent
  ON derivative_works (parent_id, part_number);

-- Read the parent out of the blob, but only where that parent still exists: a
-- dangling id in metadata becomes a top-level work, not a broken reference.
UPDATE derivative_works AS child
SET parent_id   = parent.id,
    part_number = NULLIF(child.metadata::jsonb ->> 'chapterNumber', '')::integer
FROM derivative_works AS parent
WHERE child.parent_id IS NULL
  AND child.metadata IS NOT NULL
  AND child.metadata::jsonb ->> 'parentStoryId' = parent.id
  AND child.id <> parent.id;
