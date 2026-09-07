#!/usr/bin/env node
/**
 * Remove relationship rows that say something another row already says --
 * without losing what they wrote about it.
 *
 * Two rows are the same fact when they read the same from both ends. That is
 * the test the surface applies, so it is the test to clean up against:
 * `parent`, `parent_of` and the reciprocal `child_of` all read "Elyse is
 * Solenne's parent", and a symmetric type stored in both directions says one
 * thing twice.
 *
 * The facts are duplicated. The NOTES ARE NOT. The row that survives on merit
 * -- protected, canonical spelling -- has empty notes, and the rows it
 * displaces carry the only copy of their prose; the two directions of a
 * faction conflict describe it from each side and share no sentence. So the
 * notes are merged onto the survivor first, and a row is only deleted once its
 * words are somewhere else. Deleting first and merging after would be one
 * failed request away from losing canon.
 *
 * Dry run by default.
 *
 *   node scripts/dedupe-relationships.mjs <projectId> [--apply] [--base=URL]
 *
 * Writes rels-backup-before-dedupe.json into the working directory first.
 */
import { writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const PROJECT = args.find((a) => !a.startsWith('--'));
const APPLY = args.includes('--apply');
const BASE = (args.find((a) => a.startsWith('--base=')) ?? '--base=http://localhost:5173').slice(7);
const DIR = process.cwd();

if (!PROJECT) {
  console.error('usage: node scripts/dedupe-relationships.mjs <projectId> [--apply] [--base=URL]');
  process.exit(2);
}

/** Mirrors EDGE_LABEL in src/editorial/ties.ts. */
const LABEL = {
  parent: ['parent of', 'child of'],
  parent_of: ['parent of', 'child of'],
  child_of: ['child of', 'parent of'],
  ancestor: ['ancestor of', 'descended from'],
  guardian_of: ['guardian of', 'ward of'],
  spouse: ['married to', 'married to'],
  sibling: ['sibling of', 'sibling of'],
  family: ['kin of', 'kin of'],
  protective_bond: ['protects', 'protected by'],
  hostile: ['hostile to', 'hostile to'],
  feud: ['feuding with', 'feuding with'],
  active_skirmish: ['in open conflict with', 'in open conflict with'],
  cold_war: ['in cold war with', 'in cold war with'],
  trade_war: ['in trade war with', 'in trade war with'],
  uneasy_alliance: ['uneasily allied with', 'uneasily allied with'],
};
const reads = (type, forward) => (LABEL[type] ? LABEL[type][forward ? 0 : 1] : type.replace(/_/g, ' '));

const factOf = (r) => {
  const a = String(r.sourceEntityId);
  const b = String(r.targetEntityId);
  const t = r.relationshipType;
  return [`${a} ${reads(t, true)} ${b}`, `${b} ${reads(t, false)} ${a}`].sort().join('  |  ');
};

/**
 * One note that plainly belongs to a different relationship.
 *
 * Universe-specific, and deliberately narrow: it names the two rows it applies
 * to, so running this against another universe moves nothing.
 *
 * "Murdered wife; ghost transmission echoes through chassis" sits on the row
 * recording that Solenne is Elyse's child. It is not about that: it is about
 * Elyse being Malakor's murdered wife, and his background and motivation both
 * say so. Merging it onto the parentage would keep a sentence that is true of
 * the universe on a fact it is not true of, and dropping it would lose canon,
 * so it is moved to the marriage it describes -- which has no notes of its own.
 * Called out here rather than done quietly, because it is a judgment about
 * meaning rather than a mechanical merge.
 */
const REHOME = {
  'rel-fam-2e006b32': 'rel-genealogy-char-vane-character-elyse-vane',
};

const rows = await (await fetch(`${BASE}/api/relationships?projectId=${PROJECT}`)).json();
writeFileSync(`${DIR}/rels-backup-before-dedupe.json`, JSON.stringify(rows, null, 1));
const byId = new Map(rows.map((r) => [r.id, r]));

const groups = new Map();
for (const r of rows) {
  const key = factOf(r);
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(r);
}

/**
 * Which row survives: one somebody protected, then the canonical spelling over
 * its synonyms, then the direction whose source sorts first. For a symmetric
 * type direction carries no meaning, so the rule only has to be deterministic
 * and written down.
 */
const CANONICAL_TYPE = ['parent', 'ancestor', 'spouse', 'sibling', 'family', 'guardian_of',
  'protective_bond', 'active_skirmish', 'feud', 'cold_war', 'trade_war', 'uneasy_alliance', 'hostile'];
const rank = (r) => [
  r.isProtected ? 0 : 1,
  String(CANONICAL_TYPE.indexOf(r.relationshipType) === -1 ? 99 : CANONICAL_TYPE.indexOf(r.relationshipType)).padStart(2, '0'),
  String(r.sourceEntityId),
  String(r.id),
].join(' ');

const clean = (s) => String(s ?? '').trim();
/** Distinct notes, in a stable order, joined as sentences. */
const mergeNotes = (existing, incoming) => {
  const out = [];
  for (const note of [existing, ...incoming].map(clean).filter(Boolean)) {
    if (!out.some((n) => n.toLowerCase() === note.toLowerCase())) out.push(note);
  }
  return out.join(' ');
};

const noteWrites = new Map();
const deletes = [];
const plan = [];

for (const [fact, list] of groups) {
  if (list.length < 2) continue;
  const sorted = [...list].sort((a, b) => (rank(a) < rank(b) ? -1 : 1));
  const [keep, ...drop] = sorted;

  const rehomed = [];
  const carried = [];
  for (const d of drop) {
    const target = REHOME[d.id];
    if (target && clean(d.notes)) {
      const to = byId.get(target);
      noteWrites.set(target, mergeNotes(noteWrites.get(target) ?? to?.notes, [d.notes]));
      rehomed.push({ note: clean(d.notes), to: target });
    } else if (clean(d.notes)) {
      carried.push(clean(d.notes));
    }
  }
  if (carried.length) {
    noteWrites.set(keep.id, mergeNotes(noteWrites.get(keep.id) ?? keep.notes, carried));
  }
  deletes.push(...drop);
  plan.push({ fact, keep, drop, carried, rehomed });
}

console.log(`${rows.length} rows, ${groups.size} distinct facts.\n`);
for (const { fact, keep, drop, carried, rehomed } of plan) {
  console.log(`FACT  ${fact}`);
  console.log(`  keep  ${keep.id}  (${keep.sourceEntityId} -[${keep.relationshipType}]-> ${keep.targetEntityId})`);
  console.log(`        notes now: ${JSON.stringify(clean(keep.notes)) || '""'}`);
  for (const d of drop) console.log(`  DROP  ${d.id}  (${d.sourceEntityId} -[${d.relationshipType}]-> ${d.targetEntityId})`);
  for (const n of carried) console.log(`  carry note -> keeper: ${JSON.stringify(n)}`);
  for (const r of rehomed) console.log(`  MOVE note -> ${r.to}: ${JSON.stringify(r.note)}`);
  if (noteWrites.has(keep.id)) console.log(`  keeper notes after: ${JSON.stringify(noteWrites.get(keep.id))}`);
  console.log();
}

const byPair = new Map();
for (const r of rows) {
  const key = [String(r.sourceEntityId), String(r.targetEntityId)].sort().join('  ');
  if (!byPair.has(key)) byPair.set(key, []);
  byPair.get(key).push(r);
}
const conflicts = [...byPair.entries()].filter(([, list]) => new Set(list.map(factOf)).size > 1);
if (conflicts.length) {
  console.log('LEFT ALONE -- same pair, different statements. Editorial calls, not duplicates:');
  for (const [pair, list] of conflicts) {
    console.log(`  ${pair}`);
    for (const r of list) console.log(`     ${r.sourceEntityId} -[${r.relationshipType}]-> ${r.targetEntityId}`);
  }
  console.log();
}

// Nothing may be deleted whose words are not written somewhere else first.
const notesLost = deletes.filter((d) => clean(d.notes)).filter((d) => {
  const target = REHOME[d.id] ?? plan.find((p) => p.drop.includes(d))?.keep.id;
  return !String(noteWrites.get(target) ?? '').includes(clean(d.notes));
});
if (notesLost.length) {
  console.log(`REFUSING: ${notesLost.length} row(s) would take their notes with them:`);
  for (const d of notesLost) console.log(`  ${d.id}: ${JSON.stringify(clean(d.notes))}`);
  process.exit(1);
}

console.log(`note updates: ${noteWrites.size}   rows to delete: ${deletes.length}`);
if (!APPLY) { console.log('dry run; pass --apply to write'); process.exit(0); }

// Merge first. A delete that runs before its note is saved loses the note.
for (const [id, notes] of noteWrites) {
  const res = await fetch(`${BASE}/api/relationships/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ notes }),
  });
  if (!res.ok) { console.log(`FAILED note write ${id}: ${res.status} ${await res.text()}`); process.exit(1); }
  const back = await res.json();
  if (clean(back.notes) !== clean(notes)) {
    console.log(`FAILED note write ${id}: read back ${JSON.stringify(back.notes)}`);
    process.exit(1);
  }
  console.log(`notes saved on ${id}`);
}

for (const d of deletes) {
  const res = await fetch(`${BASE}/api/relationships/${encodeURIComponent(d.id)}`, { method: 'DELETE' });
  if (!res.ok) { console.log(`FAILED delete ${d.id}: ${res.status} ${await res.text()}`); process.exit(1); }
  console.log(`deleted ${d.id}`);
}

const after = await (await fetch(`${BASE}/api/relationships?projectId=${PROJECT}`)).json();
const afterFacts = new Set(after.map(factOf));
console.log(`\nafter: ${after.length} rows, ${afterFacts.size} distinct facts`);

const lost = [...groups.keys()].filter((f) => !afterFacts.has(f));
if (lost.length) { console.log(`LOST ${lost.length} fact(s): ${lost.join(' ; ')}`); process.exit(1); }

const allNotesAfter = after.map((r) => clean(r.notes)).join('\n');
const missing = rows.map((r) => clean(r.notes)).filter(Boolean)
  .filter((n) => !allNotesAfter.includes(n));
if (missing.length) { console.log(`LOST ${missing.length} note(s): ${missing.join(' | ')}`); process.exit(1); }

console.log(`every fact still recorded; every note still present (${after.length} rows, was ${rows.length}).`);
console.log('backup of the original rows: rels-backup-before-dedupe.json');
