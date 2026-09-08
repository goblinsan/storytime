/**
 * How much an agent may do in this universe without being asked.
 *
 * The setting existed before this file did: it was stored, validated, returned
 * in three payloads, and read by nothing. Three radio buttons that changed
 * nothing at all, on the page whose entire job is to tell agents what they are
 * allowed to do.
 *
 * The three modes differ in two decisions, and only these two:
 *
 *   manual              A request is filed and waits. Nothing answers it here;
 *                       you run the agent yourself, or you do the writing.
 *   assisted            Requests are answered, and every answer is a draft that
 *                       waits for a person. This is the default and always was.
 *   autonomous_explore  Requests are answered and accepted straight into canon,
 *                       for records nobody has protected. A protected record
 *                       still waits, whatever the mode says.
 *
 * Protection is deliberately not a mode. It travels with the record, so the one
 * thing somebody marked as not-to-be-touched stays that way even when they have
 * handed the rest of the universe over.
 */
import db from './db.js';

export const AUTONOMY_MODES = new Set(['manual', 'assisted', 'autonomous_explore']);

/** The universe's mode, defaulting the way the rest of the code does. */
export async function autonomyOf(projectId) {
  const row = await db
    .get('SELECT autonomy_mode AS "mode" FROM stories WHERE id = ?', projectId)
    .catch(() => null);
  const mode = row?.mode ?? 'assisted';
  return AUTONOMY_MODES.has(mode) ? mode : 'assisted';
}

/** Whether this server should answer a filed request at all. */
export const mayAnswer = (mode) => mode !== 'manual';

/** Whether an answer may be written into canon without a person reading it. */
export const mayAcceptUnread = (mode) => mode === 'autonomous_explore';

/**
 * The canon fields an answer is allowed to carry, and the column each one is.
 *
 * Written out rather than derived: this is the list of things an agent may
 * change without a person looking, so it should be readable in one place and
 * hard to widen by accident.
 */
export const CANON_COLUMNS = {
  background: 'background',
  description: 'description',
  appearance: 'appearance',
  motivation: 'motivation',
  tendencies: 'tendencies',
  traits: 'traits',
  coreSkills: 'core_skills',
  specialAbilities: 'special_abilities',
  notableMoments: 'notable_moments',
};

const LIST_FIELDS = new Set(['traits', 'coreSkills', 'specialAbilities', 'notableMoments']);

/**
 * Write an answer into a character, if that character may be written to.
 *
 * Returns why it did not, rather than throwing: the caller is a background
 * answer path, and "this record is protected" is an outcome to record, not an
 * error to lose in a log.
 */
export async function acceptIntoCanon(characterId, proposed) {
  const character = await db
    .get('SELECT id, is_protected AS "isProtected" FROM characters WHERE id = ?', characterId)
    .catch(() => null);
  if (!character) return { accepted: false, why: 'the character is gone' };
  if (character.isProtected) return { accepted: false, why: 'the record is protected' };

  const sets = [];
  const values = [];
  for (const [field, value] of Object.entries(proposed)) {
    const column = CANON_COLUMNS[field];
    if (!column) continue;
    sets.push(`${column} = ?`);
    values.push(LIST_FIELDS.has(field) ? JSON.stringify(value) : String(value));
  }
  if (!sets.length) return { accepted: false, why: 'nothing in it was a canon field' };

  await db.run(
    `UPDATE characters SET ${sets.join(', ')}, updated_at = now() WHERE id = ?`,
    ...values, characterId,
  );
  return { accepted: true, fields: Object.keys(proposed) };
}
