/**
 * An arc's acts, read out of the flat list they used to be written into.
 *
 * Before acts were records, an arc's `details` held everything as lines:
 *
 *   THROUGHLINE: not a revenge story. ...
 *   OUT OF SCOPE FOR THIS STORY: the frame-up stays hidden. ...
 *   ACT 1 -- Reluctant Entanglement (Ch1-2, written): Malakor mid-hunt, ...
 *   The distress call is an intrusion, ...
 *   DONE (2026-09-03): Ch1-2 revised toward reluctance ...
 *
 * An act heading opens an act and carries its title, where it falls, and --
 * after the colon -- its first beat. Plain lines after it are its beats. The
 * labeled lines are not beats at all and go to the columns made for them.
 * Every line lands somewhere: nothing is dropped by the split, only placed.
 *
 * Labels are matched in capitals only. A beat that begins "Note how she..."
 * or "Act two opens..." is a beat, and a case-blind match would have turned it
 * into bookkeeping.
 */
import { randomUUID } from 'node:crypto';

const ACT = /^ACT\s+([0-9]+|[IVXLC]+)\b\s*(?:[-–—:]+\s*)?([\s\S]*)$/;
const THROUGHLINE = /^THROUGHLINE\s*:\s*/;
const SCOPE = /^OUT\s+OF\s+SCOPE[^:]*:\s*/;
const NOTE = /^(DONE|TODO|NOTE)\s*[(:]/;

/** A JSON list column, as a list whatever state it is in. */
export function parseList(value) {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value ?? '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Whether a list still holds labeled lines that belong somewhere else. */
export const isLabeled = (details) => details.some((d) => {
  const line = String(d ?? '').trim();
  return ACT.test(line) || THROUGHLINE.test(line) || SCOPE.test(line) || NOTE.test(line);
});

export function splitArcDetails(details) {
  const throughline = [];
  const outOfScope = [];
  const notes = [];
  const acts = [];
  const loose = [];

  for (const raw of details) {
    const line = String(raw ?? '').trim();
    if (!line) continue;
    if (THROUGHLINE.test(line)) { throughline.push(line.replace(THROUGHLINE, '')); continue; }
    if (SCOPE.test(line)) { outOfScope.push(line.replace(SCOPE, '')); continue; }
    if (NOTE.test(line)) { notes.push(line); continue; }

    const heading = line.match(ACT);
    if (heading) {
      // "Reluctant Entanglement (Ch1-2, written): Malakor mid-hunt, ..."
      const [, title = '', span = '', first = ''] = heading[2]
        .match(/^(.*?)\s*(?:\(([^)]*)\))?\s*(?::\s*([\s\S]*))?$/) ?? [];
      acts.push({
        title: title.trim(),
        span: span.trim(),
        beats: first.trim() ? [first.trim()] : [],
      });
      continue;
    }

    if (acts.length) acts[acts.length - 1].beats.push(line);
    else loose.push(line);
  }

  return { throughline: throughline.join('\n\n'), outOfScope, notes, acts, loose };
}

/**
 * Split an arc's labeled list into its acts and columns, once.
 *
 * `arc` is the row as read, with `details`, `throughline`, `outOfScope` and
 * `notes` still as stored. The update is conditional on `details` being what
 * was read, so two readers arriving together split it once: the second finds
 * the list already changed and writes nothing.
 */
export async function adoptActs(db, arc) {
  const details = parseList(arc.details);
  if (!isLabeled(details)) return false;
  const split = splitArcDetails(details);
  const now = new Date().toISOString();

  return db.transaction(async (tx) => {
    const claimed = await tx.run(`
      UPDATE story_arcs SET
        throughline = ?, out_of_scope = ?, notes = ?, details = ?, updated_at = ?
      WHERE id = ? AND details = ?
    `,
    [arc.throughline, split.throughline].filter((t) => String(t ?? '').trim()).join('\n\n'),
    JSON.stringify([...parseList(arc.outOfScope), ...split.outOfScope]),
    JSON.stringify([...parseList(arc.notes), ...split.notes]),
    JSON.stringify(split.loose),
    now, arc.id, arc.details);
    if (!claimed?.changes) return false;

    const last = await tx.get('SELECT MAX(act_number) AS m FROM arc_acts WHERE arc_id = ?', arc.id);
    let number = last?.m ?? 0;
    for (const act of split.acts) {
      number += 1;
      await tx.run(`
        INSERT INTO arc_acts (id, arc_id, act_number, title, span, summary, beats, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, '', ?, ?, ?)
      `, randomUUID(), arc.id, number, act.title, act.span, JSON.stringify(act.beats), now, now);
    }
    return true;
  });
}
