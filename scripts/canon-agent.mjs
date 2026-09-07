#!/usr/bin/env node
/**
 * Answer canon requests automatically, by running Claude Code on each one.
 *
 * This is the piece that was missing. The button filed a request, the watcher
 * told you it existed, and handing it to an agent was still somebody copying a
 * brief into a conversation. This closes that: a request appears, a Claude
 * session is started with the canon attached, and what comes back is written
 * to the draft.
 *
 *   node scripts/canon-agent.mjs <universeId>            poll, and answer what appears
 *   node scripts/canon-agent.mjs <universeId> --serve    receive webhooks instead
 *   node scripts/canon-agent.mjs <universeId> --once     answer what is open, then stop
 *
 * --command=... runs something else instead of Claude Code. It is given the
 * prompt on stdin and must print a JSON object.
 *
 * WHAT IT IS ALLOWED TO DO
 * It writes a draft. It never writes a character. Everything it produces lands
 * as "Drafted, not yet canon" in the record and in Proposed changes, and is
 * admitted by a person or not at all -- so the worst case of a bad answer is
 * something to reject, not something to find later in the canon.
 *
 * It may only fill fields that were asked for. A model returning an extra key
 * is refused rather than trimmed, because a request answering more than it was
 * asked is the shape of a draft quietly rewriting something already written.
 *
 * Each request costs a Claude Code session, so it runs one at a time, refuses
 * to answer a request that already has an answer, and says what it is doing
 * before it does it.
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';

const args = process.argv.slice(2);
const PROJECT = args.find((a) => !a.startsWith('--'));
const BASE = (args.find((a) => a.startsWith('--base=')) ?? '--base=http://localhost:5173').slice(7);
const PORT = Number((args.find((a) => a.startsWith('--port=')) ?? '--port=8787').slice(7));
const EVERY = Number((args.find((a) => a.startsWith('--every=')) ?? '--every=5').slice(8)) * 1000;
const SERVE = args.includes('--serve');
const ONCE = args.includes('--once');
const DRY = args.includes('--dry-run');
/**
 * What to run for each request. Defaults to Claude Code, non-interactive.
 *
 * Configurable because "reaches an agent" should not mean "reaches this one":
 * anything that takes a prompt on stdin and prints a JSON object works, which
 * is how another model, another harness, or a stub for testing plugs in
 * without this script knowing anything about it.
 */
const COMMAND = (args.find((a) => a.startsWith('--command=')) ?? '--command=claude -p').slice(10);

if (!PROJECT) {
  console.error('usage: node scripts/canon-agent.mjs <universeId> [--serve] [--once] [--dry-run]');
  process.exit(2);
}

const REQUEST_TYPE = 'character_canon_request';
const FIELD_NOTES = {
  background: 'where they came from and what happened to them',
  description: 'what somebody notices meeting them',
  motivation: 'what they are trying to get, in their own terms',
  tendencies: 'how they behave under pressure, not their virtues',
  traits: 'a few words each',
  coreSkills: 'what they are good at',
  specialAbilities: 'anything they can do that others cannot',
  notableMoments: 'one line per moment',
};
const LIST_FIELDS = new Set(['traits', 'coreSkills', 'specialAbilities', 'notableMoments']);

const get = async (path) => {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json();
};

/** Everything the answer should be true to, and nothing it has to guess. */
async function brief(row) {
  const characters = await get(`/api/characters?projectId=${encodeURIComponent(PROJECT)}&limit=500`);
  const rels = await get(`/api/relationships?projectId=${encodeURIComponent(PROJECT)}`);
  const byId = new Map(characters.map((c) => [String(c.id), c]));
  const who = byId.get(String(row.payload.characterId));
  if (!who) return null;

  const ties = rels
    .filter((r) => r.sourceEntityId === who.id || r.targetEntityId === who.id)
    .map((r) => {
      const other = r.sourceEntityId === who.id ? r.targetEntityId : r.sourceEntityId;
      return `${r.relationshipType} ${byId.get(String(other))?.name ?? other}`;
    });

  const asked = (row.payload.fields ?? []).filter((f) => FIELD_NOTES[f]);
  // The comma goes before the note, not after it: joining on ',\n' put it at
  // the end of a comment, which is where a shape stops looking like JSON.
  const wanted = asked.map((f, i) => {
    const shape = LIST_FIELDS.has(f) ? '["...", "..."]' : '"..."';
    return `  "${f}": ${shape}${i < asked.length - 1 ? ',' : ''}   // ${FIELD_NOTES[f]}`;
  });

  return {
    who,
    asked,
    prompt: [
      'You are writing canon for an existing science-fiction universe. Match what is',
      'already recorded; do not contradict it, and do not invent events that would',
      'need other records to change.',
      '',
      `CHARACTER: ${who.name}`,
      `ROLE: ${who.role ?? '(none recorded)'}`,
      `ACTIVE: ${who.activeTimeframeStart} to ${who.activeTimeframeOpen ? 'onward (unending)' : who.activeTimeframeEnd}`,
      `BASED AT: ${who.location ?? '(none recorded)'}`,
      `RELATIONSHIPS: ${ties.join('; ') || '(none recorded)'}`,
      '',
      'WHAT IS ALREADY WRITTEN:',
      String(who.background ?? '(nothing)').replace(/\s+/g, ' '),
      '',
      'Write only these fields, in the voice of the history above:',
      '{',
      wanted.join('\n'),
      '}',
      '',
      'Reply with that JSON object and nothing else: no prose before or after, no',
      'code fence. Every key above must be present and no others. Keep each value',
      'short -- a sentence or two of prose, three or four entries in a list.',
    ].join('\n'),
  };
}

/** One agent run, with a bounded life. The prompt goes in on stdin. */
function askAgent(prompt) {
  return new Promise((resolve, reject) => {
    const [bin, ...rest] = COMMAND.split(' ').filter(Boolean);
    const child = spawn(bin, rest, { stdio: ['pipe', 'pipe', 'pipe'] });
    child.stdin.end(prompt);
    let out = '';
    let err = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('timed out after 180s')); }, 180_000);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) { resolve(out); return; }
      // The commonest failure by far, and it exits 1 saying nothing useful on
      // stderr, so it is named rather than left as a number.
      const said = `${out}${err}`.trim();
      if (/not logged in|\/login/i.test(said)) {
        reject(new Error('the agent is not signed in. Run `claude` once in a terminal '
          + 'and sign in, then start this again.'));
        return;
      }
      reject(new Error(`\`${COMMAND}\` exited ${code}${said ? `: ${said.slice(0, 300)}` : ' with no output'}`));
    });
  });
}

/** The last JSON object in the output, so a stray sentence does not break it. */
function extractJson(text) {
  const trimmed = text.replace(/```(?:json)?/g, '').trim();
  const start = trimmed.lastIndexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) throw new Error('no JSON object in the reply');
  return JSON.parse(trimmed.slice(start, end + 1));
}

async function answer(row) {
  const context = await brief(row);
  if (!context) { console.log(`  skipped: no character ${row.payload.characterId}`); return; }
  console.log(`  asking about ${context.who.name}: ${context.asked.join(', ')}`);
  if (DRY) { console.log(`  --- prompt ---\n${context.prompt}\n  --- end ---`); return; }

  const reply = await askAgent(context.prompt);
  const proposed = extractJson(reply);

  const asked = new Set(context.asked);
  const stray = Object.keys(proposed).filter((k) => !asked.has(k));
  if (stray.length) throw new Error(`answered with ${stray.join(', ')}, which was not asked for`);
  const missing = context.asked.filter((k) => proposed[k] === undefined);
  if (missing.length) throw new Error(`did not answer ${missing.join(', ')}`);
  for (const field of context.asked) {
    const wantList = LIST_FIELDS.has(field);
    if (wantList !== Array.isArray(proposed[field])) {
      throw new Error(`${field} should be ${wantList ? 'a list' : 'text'}`);
    }
  }

  const res = await fetch(`${BASE}/api/generated-drafts/${encodeURIComponent(row.id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ payload: { ...row.payload, proposed } }),
  });
  if (!res.ok) throw new Error(`could not save the draft: ${res.status}`);
  console.log(`  drafted ${Object.keys(proposed).join(', ')} -- waiting for review in the app`);
}

const open = async () => (await get(`/api/generated-drafts?projectId=${encodeURIComponent(PROJECT)}&status=generated`))
  .filter((d) => d.artifactType === REQUEST_TYPE && !d.payload?.proposed);

const handled = new Set();
async function drain() {
  for (const row of await open()) {
    if (handled.has(row.id)) continue;
    handled.add(row.id);
    console.log(`${new Date().toLocaleTimeString()}  ${row.id}`);
    try {
      await answer(row);
    } catch (error) {
      // Left open on purpose: a request nobody could answer should still be
      // visible as unanswered rather than disappearing into a log.
      handled.delete(row.id);
      console.log(`  failed: ${error.message}`);
    }
  }
}

if (SERVE) {
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', async () => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"ok":true}');
      try {
        const { draft } = JSON.parse(body || '{}');
        if (draft?.artifactType === REQUEST_TYPE) {
          console.log(`${new Date().toLocaleTimeString()}  webhook: ${draft.id}`);
          handled.add(draft.id);
          await answer(draft);
        }
      } catch (error) { console.log(`  failed: ${error.message}`); }
    });
  });
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`listening on http://127.0.0.1:${PORT} for canon requests.`);
    console.log(`set CONTESORA_CANON_REQUEST_WEBHOOK=http://127.0.0.1:${PORT} and restart the server.`);
  });
} else {
  await drain();
  if (!ONCE) {
    console.log(`watching ${BASE} every ${EVERY / 1000}s. Ask for something in the app; ctrl-c to stop.`);
    for (;;) {
      await new Promise((r) => { setTimeout(r, EVERY); });
      try { await drain(); } catch (error) { console.log(`  (${error.message})`); }
    }
  }
}
