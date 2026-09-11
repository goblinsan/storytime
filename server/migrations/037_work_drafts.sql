-- A work's earlier drafts: what its prose was before something replaced it.
--
-- A work could hold one version of its prose, and every way of changing it --
-- an edit, a composed chapter put in force, the old composer, a repair, the
-- story harness -- wrote over the last one. The only "earlier draft" the
-- works surface could show was the prose a story kept after it was split into
-- parts, and that was its current prose under a different label.
--
-- Now whatever replaces the prose keeps the old version here first
-- (workDrafts.js). Deleting the work deletes its drafts; deleting a draft
-- deletes nothing else.
CREATE TABLE IF NOT EXISTS work_drafts (
  id TEXT PRIMARY KEY,
  work_id TEXT NOT NULL REFERENCES derivative_works(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  words INTEGER NOT NULL DEFAULT 0,
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS work_drafts_by_work ON work_drafts (work_id, created_at DESC);

-- The prose a story kept after it was split into parts is an earlier draft,
-- so it moves to where earlier drafts are kept, and the story's own prose is
-- empty: what is read is its parts.
INSERT INTO work_drafts (id, work_id, content, words, reason, created_at)
SELECT 'wdraft-' || md5(w.id || ':split'), w.id, w.content,
       coalesce(array_length(regexp_split_to_array(trim(w.content), '\s+'), 1), 0),
       'Written before it was split into parts',
       to_char(coalesce(w.updated_at::timestamptz, now()) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
FROM derivative_works w
WHERE coalesce(trim(w.content), '') <> ''
  AND EXISTS (SELECT 1 FROM derivative_works p WHERE p.parent_id = w.id)
ON CONFLICT (id) DO NOTHING;

UPDATE derivative_works w SET content = ''
WHERE coalesce(trim(w.content), '') <> ''
  AND EXISTS (SELECT 1 FROM derivative_works p WHERE p.parent_id = w.id);
