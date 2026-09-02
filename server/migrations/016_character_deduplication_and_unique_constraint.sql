-- Migration 016: Character deduplication and partial unique index on character name per project
-- 1. Deduplicate characters by keeping the highest priority row per (project_id, lower(trim(name)))
DO $$
DECLARE
  rec RECORD;
  survivor_id TEXT;
  dupe_id TEXT;
BEGIN
  FOR rec IN (
    SELECT project_id, LOWER(TRIM(name)) as norm_name
    FROM characters
    WHERE LOWER(TRIM(name)) NOT IN ('new character', 'unnamed character', '')
    GROUP BY project_id, LOWER(TRIM(name))
    HAVING count(*) > 1
  ) LOOP
    -- Find survivor ID
    SELECT id INTO survivor_id
    FROM characters
    WHERE project_id = rec.project_id AND LOWER(TRIM(name)) = rec.norm_name
    ORDER BY
      is_protected DESC,
      CASE WHEN importance = 'principal' THEN 1 WHEN importance = 'supporting' THEN 2 ELSE 3 END,
      LENGTH(COALESCE(background, '') || COALESCE(description, '')) DESC,
      created_at ASC
    LIMIT 1;

    -- For each duplicate row
    FOR dupe_id IN (
      SELECT id FROM characters
      WHERE project_id = rec.project_id AND LOWER(TRIM(name)) = rec.norm_name AND id != survivor_id
    ) LOOP
      -- Update canon_relationships
      UPDATE canon_relationships
      SET source_entity_id = survivor_id
      WHERE project_id = rec.project_id AND source_entity_type = 'character' AND source_entity_id = dupe_id;

      UPDATE canon_relationships
      SET target_entity_id = survivor_id
      WHERE project_id = rec.project_id AND target_entity_type = 'character' AND target_entity_id = dupe_id;

      -- Remove duplicate canon_relationships
      DELETE FROM canon_relationships
      WHERE source_entity_id = target_entity_id;

      -- Delete the duplicate character
      DELETE FROM characters WHERE id = dupe_id;
    END LOOP;
  END LOOP;
END $$;

-- 2. Partial unique index on character name per project
-- Excludes placeholder names like 'New Character', 'Unnamed Character', and empty strings
CREATE UNIQUE INDEX IF NOT EXISTS idx_characters_project_lower_name
ON characters(project_id, LOWER(TRIM(name)))
WHERE LOWER(TRIM(name)) NOT IN ('new character', 'unnamed character', '');
