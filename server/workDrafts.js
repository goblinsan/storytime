/**
 * Keeping what a work's prose was, before something replaces it.
 *
 * Every path that overwrites a work's prose calls this first: an edit on the
 * works surface, a composed chapter put in force, the old composer, an applied
 * repair, the story harness. Each passes its reason, which is what the list of
 * earlier drafts says about each one.
 *
 * Edits settle. Saving a field five times in ten minutes is one spell of
 * editing, and five drafts of it would bury the one that mattered, so a plain
 * edit keeps a draft only when the last draft was not also an edit made
 * minutes ago. Anything else -- a replacement, a repair -- always keeps one.
 */
import { randomUUID } from 'node:crypto';

export const EDIT = 'Before an edit';
const SETTLE_MS = 10 * 60 * 1000;

export const wordsIn = (text) => {
  const trimmed = String(text ?? '').trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
};

/**
 * `db` is the database or a transaction: anything with `get` and `run`.
 * Returns the new draft's id, or null when there was nothing worth keeping --
 * no prose yet, or the "replacement" is the same text.
 */
export async function keepDraft(db, workId, next, reason = EDIT) {
  if (next == null) return null;
  const row = await db.get('SELECT content FROM derivative_works WHERE id = ?', workId);
  const was = row?.content ?? '';
  if (!was.trim() || was === next) return null;

  if (reason === EDIT) {
    const last = await db.get(`
      SELECT reason, created_at AS "createdAt" FROM work_drafts
      WHERE work_id = ? ORDER BY created_at DESC LIMIT 1
    `, workId);
    if (last?.reason === EDIT && Date.now() - Date.parse(last.createdAt) < SETTLE_MS) return null;
  }

  const id = `wdraft-${randomUUID()}`;
  await db.run(`
    INSERT INTO work_drafts (id, work_id, content, words, reason, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `, id, workId, was, wordsIn(was), reason, new Date().toISOString());
  return id;
}
