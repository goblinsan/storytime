#!/usr/bin/env node
/**
 * Move the physical facts out of Bearing and into Appearance, once, for a
 * whole cast, as drafts nobody has accepted yet.
 *
 * Appearance became a field of its own after every one of these records was
 * written, so every record has an empty one -- and the image prompt reads
 * Appearance and nothing else, which means every portrait currently gets drawn
 * from the History instead. The physical facts are not missing; they are one
 * field over. Malakor's Bearing opens "broad-shouldered figure in bulky
 * segmented dark armor, star-iron plating scarred and re-welded, its faceless
 * angular helm smooth and dark", which is a description of a man's outside
 * filed under the impression he leaves.
 *
 *   node scripts/split-appearance.mjs <universeId>
 *   node scripts/split-appearance.mjs <universeId> --limit=3     try a few first
 *   node scripts/split-appearance.mjs <universeId> --dry-run     print, file nothing
 *
 * WHAT IT IS ALLOWED TO DO
 * It writes drafts. It never writes a character. Every split lands in the queue
 * as "Drafted, not yet canon" against both fields at once, so a person sees the
 * old paragraph and the two new ones side by side and admits it or does not.
 *
 * And it may only MOVE text. Nothing invented, nothing embellished, nothing
 * dropped: every sentence of the original has to come out in one of the two
 * halves. A split that quietly improves the prose is a rewrite of canon wearing
 * a migration's clothes, and it would be a rewrite of sixty-six records at once
 * -- so the answer is checked for that before it is filed, and a character
 * whose answer fails the check is skipped and named rather than filed anyway.
 */
import { extractJson, runAgent } from '../server/canonAgent.js';

const args = process.argv.slice(2);
const PROJECT = args.find((a) => !a.startsWith('--'));
const BASE = (args.find((a) => a.startsWith('--base=')) ?? '--base=http://localhost:3001').slice(7);
const LIMIT = Number((args.find((a) => a.startsWith('--limit=')) ?? '--limit=0').slice(8));
const COMMAND = (args.find((a) => a.startsWith('--command=')) ?? '').slice(10) || undefined;
const DRY = args.includes('--dry-run');

if (!PROJECT) {
  console.error('usage: node scripts/split-appearance.mjs <universeId> [--limit=N] [--dry-run]');
  process.exit(2);
}

const api = async (method, path, body) => {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${await res.text()}`);
  return res.json();
};

const words = (text) => String(text).toLowerCase().match(/[a-z]{4,}/g) ?? [];

/**
 * Did the split move the words, or write new ones?
 *
 * Both halves together should be made of the original's vocabulary. A little
 * drift is inevitable and fine -- a sentence has to be re-hinged when it is cut
 * in two -- but a half made largely of words that were never in the paragraph
 * is a model writing rather than sorting, and that is the one failure mode that
 * would quietly damage sixty-six records in a single run.
 */
function movedRatherThanWritten(original, appearance, description) {
  const source = new Set(words(original));
  const produced = [...words(appearance), ...words(description)];
  if (!produced.length) return { ok: false, why: 'the split came back empty' };
  const strangers = produced.filter((w) => !source.has(w));
  const ratio = strangers.length / produced.length;
  if (ratio > 0.2) {
    return { ok: false, why: `${Math.round(ratio * 100)}% of the words are new ones (${strangers.slice(0, 8).join(', ')})` };
  }
  // Losing most of the paragraph is the other direction of the same failure.
  const kept = produced.length / (words(original).length || 1);
  if (kept < 0.6) return { ok: false, why: `only ${Math.round(kept * 100)}% of the original came through` };
  return { ok: true };
}

const prompt = (person) => `You are sorting one paragraph of an existing character record into two
fields. This is a move, not a rewrite.

The character is ${person.name}${person.role ? `, ${person.role}` : ''}.

Here is what is currently filed under "Bearing":

${String(person.description).trim()}

Split it into two fields:

  "appearance"  - the physical facts. Build, face, hair, dress, what they
                  carry, what they are wearing, what has been done to their
                  body. This is what gets drawn, so it must read as a
                  description of somebody standing in front of you.

  "description" - how they carry themselves. Manner, presence, the impression
                  they leave on a person who meets them. Not what they look
                  like.

Rules, and they matter more than the result reading well:

  - Move sentences; do not write new ones. Use the words that are already
    there. You may re-hinge a sentence that has to be cut in two, and you may
    drop a connective that no longer joins anything.
  - Do not invent, embellish, correct or improve anything. If the paragraph
    says the eye-slits glow blue, they glow blue; if it says nothing about
    height, say nothing about height.
  - Lose nothing. Every fact in the paragraph must come out in one half or the
    other.
  - If the paragraph is entirely one or the other, put it all there and answer
    the other with an empty string. That is a real answer, not a failure.

Answer with a JSON object and nothing else:

{"appearance": "...", "description": "..."}`;

const universeCharacters = await api('GET', `/characters?projectId=${encodeURIComponent(PROJECT)}`);
const cast = (Array.isArray(universeCharacters) ? universeCharacters : universeCharacters.items ?? []);

const candidates = cast.filter((c) => !String(c.appearance ?? '').trim()
  && String(c.description ?? '').trim().length > 40);

console.log(`${cast.length} in the cast, ${candidates.length} with a Bearing to split and no Appearance.`);
const todo = LIMIT > 0 ? candidates.slice(0, LIMIT) : candidates;

let filed = 0;
const skipped = [];
/** Records whose Bearing holds no physical facts at all. Not a failure. */
const nothingToMove = [];

for (const [i, person] of todo.entries()) {
  const at = `${i + 1}/${todo.length}`;
  process.stdout.write(`${at} ${person.name}… `);
  try {
    const answer = extractJson(await runAgent(prompt(person), COMMAND ? { command: COMMAND } : {}));
    const appearance = String(answer.appearance ?? '').trim();
    const description = String(answer.description ?? '').trim();
    if (!appearance) {
      // Plenty of these records describe a life rather than a face. There is
      // nothing to move, and the right answer is to leave the record alone --
      // filing an empty Appearance would be a draft proposing nothing, and
      // writing one would be inventing a face.
      nothingToMove.push(person.name);
      console.log('nothing to move');
      continue;
    }

    const check = movedRatherThanWritten(person.description, appearance, description);
    if (!check.ok) throw new Error(check.why);

    if (DRY) {
      console.log('\n  appearance:', appearance, '\n  bearing:', description, '\n');
      filed += 1;
      continue;
    }

    // Filed already answered: this is not a request somebody made and is
    // waiting on, it is a proposal to look at. It lands in the same queue and
    // the same panel as every other draft, which is the point -- sixty-six
    // records get reviewed the way one does.
    await api('POST', '/generated-drafts', {
      projectId: PROJECT,
      artifactType: 'character_canon_request',
      payload: {
        characterId: String(person.id),
        fields: ['appearance', 'description'],
        note: 'Appearance was added after this record was written, so the physical '
          + 'facts are in Bearing. This moves them across; nothing is invented.',
        proposed: { appearance, description },
      },
    });
    filed += 1;
    console.log('filed');
  } catch (error) {
    skipped.push(`${person.name}: ${error.message}`);
    console.log(`skipped (${error.message})`);
  }
}

console.log(`\n${filed} ${DRY ? 'would be filed' : 'filed'}, ${nothingToMove.length} with no appearance in them, ${skipped.length} skipped.`);
if (nothingToMove.length) {
  console.log(`\nNo physical facts to move (their Bearing is a life, not a face): ${nothingToMove.join(', ')}.`);
  console.log('These need an Appearance written rather than moved, or none at all.');
}
if (skipped.length) {
  console.log('Skipped, and why:');
  for (const line of skipped) console.log(`  ${line}`);
  console.log('\nNothing was written for these. Run again, or write them by hand.');
}
