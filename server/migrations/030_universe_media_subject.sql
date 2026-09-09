-- The database has to agree that a universe can be a subject.
--
-- `subject_type` was widened in the route's allowlist and not here, so the
-- application accepted 'universe', copied the picture onto storage, and then
-- the insert hit a CHECK constraint that had never heard of it. A 500, an
-- orphaned file on the volume, and the process gone.
--
-- Two lists of the same allowed values, in two languages, is the shape of
-- that bug. `mediaSubjectTypes.test.js` fails the build when they disagree.
ALTER TABLE media_assets DROP CONSTRAINT IF EXISTS media_assets_subject_type_check;
ALTER TABLE media_assets ADD CONSTRAINT media_assets_subject_type_check
  CHECK (subject_type IS NULL OR subject_type = ANY (ARRAY[
    'character', 'location', 'item', 'faction_crest', 'creature', 'universe'
  ]));
