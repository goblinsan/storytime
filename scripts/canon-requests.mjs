#!/usr/bin/env node
/**
 * The other end of "Ask Claude to draft these".
 *
 * A request is a draft row with a payload naming a character and the fields
 * that are empty. It is a note in a queue, not a job: nothing runs it, and it
 * waits for somebody to sit down with it. This is how that somebody sees what
 * was asked, with enough of the universe attached to answer it without
 * guessing, and how the answer gets written back for review.
 *
 *   node scripts/canon-requests.mjs <projectId>                 what has been asked
 *   node scripts/canon-requests.mjs <projectId> --brief         the same, with canon context
 *   node scripts/canon-requests.mjs <projectId> --answer <file> write drafts back
 *
 * The answer file is JSON: [{ "requestId": "...", "proposed": { "motivation": "..." } }].
 * Writing an answer does not change the character. It fills the draft, and the
 * record shows it as "Drafted, not yet canon" with accept and reject beside it,
 * because canon is the owner's to admit.
 */
const args = process.argv.slice(2);
const PROJECT = args.find((a) => !a.startsWith('--'));
const BASE = (args.find((a) => a.startsWith('--base=')) ?? '--base=http://localhost:5173').slice(7);
const BRIEF = args.includes('--brief');
// indexOf returns -1 when the flag is absent, and args[0] is the project id, so
// the naive `args[indexOf + 1]` read the universe as a filename.
const answerAt = args.indexOf('--answer');
const ANSWER = answerAt === -1 ? null : args[answerAt + 1];

if (!PROJECT) {
  console.error('usage: node scripts/canon-requests.mjs <projectId> [--brief] [--answer <file>] [--base=URL]');
  process.exit(2);
}

const REQUEST_TYPE = 'character_canon_request';
const get = async (path) => {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json();
};

const drafts = await get(`/api/generated-drafts?projectId=${encodeURIComponent(PROJECT)}&status=generated`);
const requests = drafts.filter((d) => d.artifactType === REQUEST_TYPE);

if (ANSWER) {
  const { readFileSync } = await import('node:fs');
  const answers = JSON.parse(readFileSync(ANSWER, 'utf8'));
  const byId = new Map(requests.map((r) => [r.id, r]));
  for (const answer of answers) {
    const row = byId.get(answer.requestId);
    if (!row) { console.log(`no open request ${answer.requestId}`); process.exit(1); }
    const asked = new Set(row.payload.fields ?? []);
    const stray = Object.keys(answer.proposed ?? {}).filter((k) => !asked.has(k));
    if (stray.length) {
      // Answering a question nobody asked is how a draft quietly rewrites a
      // field somebody had already written.
      console.log(`${answer.requestId} proposes ${stray.join(', ')}, which was not asked for`);
      process.exit(1);
    }
    const res = await fetch(`${BASE}/api/generated-drafts/${encodeURIComponent(row.id)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ payload: { ...row.payload, proposed: answer.proposed } }),
    });
    if (!res.ok) { console.log(`FAILED ${row.id}: ${res.status} ${await res.text()}`); process.exit(1); }
    console.log(`answered ${row.id} (${Object.keys(answer.proposed).join(', ')})`);
  }
  process.exit(0);
}

if (!requests.length) { console.log('nothing has been asked for.'); process.exit(0); }

const characters = await get(`/api/characters?projectId=${encodeURIComponent(PROJECT)}&limit=500`);
const byId = new Map(characters.map((c) => [String(c.id), c]));

console.log(`${requests.length} request(s)\n`);
for (const row of requests) {
  const who = byId.get(String(row.payload.characterId));
  const answered = row.payload.proposed ? '  [answered, awaiting review]' : '';
  console.log(`${row.id}${answered}`);
  console.log(`  ${who?.name ?? row.payload.characterId}: ${(row.payload.fields ?? []).join(', ')}`);
  if (!BRIEF || !who) { console.log(); continue; }

  // Enough of the universe to answer without inventing around it.
  const rels = await get(`/api/relationships?projectId=${encodeURIComponent(PROJECT)}`);
  const ties = rels
    .filter((r) => r.sourceEntityId === who.id || r.targetEntityId === who.id)
    .map((r) => {
      const other = r.sourceEntityId === who.id ? r.targetEntityId : r.sourceEntityId;
      return `${r.relationshipType} ${byId.get(String(other))?.name ?? other}`;
    });
  console.log(`  role:      ${who.role ?? ''}`);
  console.log(`  active:    ${who.activeTimeframeStart}-${who.activeTimeframeOpen ? 'onward' : who.activeTimeframeEnd}`);
  console.log(`  location:  ${who.location ?? ''}`);
  console.log(`  ties:      ${ties.join('; ') || 'none recorded'}`);
  console.log(`  history:   ${String(who.background ?? '').replace(/\s+/g, ' ').slice(0, 600)}`);
  console.log();
}
