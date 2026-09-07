/**
 * Answering a canon request, wherever the answering happens.
 *
 * The button files a request; something has to write a draft against it. That
 * something used to be a second process the owner had to remember to start,
 * which is a poor answer to "I clicked the button and nothing happened". The
 * server can do it itself, and the standalone script imports the same code so
 * there is one definition of what an answer is allowed to be.
 *
 * WHAT AN ANSWER MAY DO
 * Write a draft. Never a character. Everything produced here lands as "Drafted,
 * not yet canon" and is admitted by a person or not at all, so the worst case
 * of a bad answer is something to reject rather than something to find in the
 * canon later.
 *
 * And only the fields that were asked for. An answer carrying an extra key is
 * refused rather than trimmed, because trimming would make a draft that quietly
 * rewrites something already written look like a draft that behaved.
 */
import { spawn } from 'node:child_process';
import { env } from './env.js';

export const CANON_REQUEST = 'character_canon_request';

/** What each field is for, in the words the record uses. */
export const FIELD_NOTES = {
  background: 'where they came from and what happened to them',
  description: 'how they carry themselves: manner, presence, the impression they leave -- not what they look like, which is `appearance`',
  appearance: 'the physical facts, listed -- build, face, hair, dress, what they carry',
  motivation: 'what they are trying to get, in their own terms',
  tendencies: 'how they behave under pressure, not their virtues',
  traits: 'a few words each',
  coreSkills: 'what they are good at',
  specialAbilities: 'anything they can do that others cannot',
  notableMoments: 'one line per moment',
};

export const LIST_FIELDS = new Set(['traits', 'coreSkills', 'specialAbilities', 'notableMoments']);

const asText = (value) => {
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'string') return value.trim();
  if (value === null || value === undefined) return '';
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.join(', ') : String(value);
  } catch { return String(value); }
};

/**
 * Everything the answer must be true to, and nothing it has to guess.
 *
 * A field that is empty is written. A field that already says something is
 * revised, and the current text is put in front of the agent so it is editing
 * rather than replacing from memory -- and told to leave it alone if it is
 * already right, because a collaborator that must change something will change
 * something whether or not it is an improvement.
 */
export function buildPrompt({ character, ties, fields, present, previous, note }) {
  const asked = fields.filter((f) => FIELD_NOTES[f]);
  const shape = asked.map((f, i) => {
    const example = LIST_FIELDS.has(f) ? '["...", "..."]' : '"..."';
    return `  "${f}": ${example}${i < asked.length - 1 ? ',' : ''}   // ${FIELD_NOTES[f]}`;
  });
  const existing = asked
    .map((f) => [f, asText(character[f])])
    .filter(([, value]) => value);
  const active = character.activeTimeframeOpen
    ? `${character.activeTimeframeStart} onward (unending)`
    : `${character.activeTimeframeStart} to ${character.activeTimeframeEnd}`;

  return {
    asked,
    prompt: [
      'You are writing canon for an existing science-fiction universe. Match what is',
      'already recorded; do not contradict it, and do not invent events that would',
      'need other records to change.',
      '',
      `CHARACTER: ${character.name}`,
      `ROLE: ${character.role || '(none recorded)'}`,
      `ACTIVE: ${active}`,
      `BASED AT: ${character.location || '(none recorded)'}`,
      `RELATIONSHIPS: ${ties.join('; ') || '(none recorded)'}`,
      // Without this it invents intervals. Asked to revise Malakor's
      // motivation it wrote "eleven years dead and repeating" about a wife
      // murdered in 348, in a story set around 624.
      ...(present ? [`THE STORY'S PRESENT: year ${present}. Do not invent`
        + ' intervals between events; work them out from the years you are given,'
        + ' or leave them unstated.'] : []),
      '',
      'WHAT IS ALREADY WRITTEN:',
      String(character.background ?? '(nothing)').replace(/\s+/g, ' '),
      '',
      ...(existing.length ? [
        'SOME OF THESE ARE ALREADY WRITTEN. Improve them: sharpen the language,',
        'make them specific to this character rather than to anybody in this',
        'role, and keep anything that is already good. If a field is already',
        'right, return it unchanged -- do not change it to prove you read it.',
        '',
        ...existing.map(([f, value]) => `CURRENT ${f}: ${value}`),
        '',
      ] : []),
      // A revision, not another attempt from scratch. Without the last try and
      // what was wrong with it, "ask for a revision" is just asking again and
      // hoping, and the same objection comes back a second time.
      ...(previous && note ? [
        'YOU ALREADY PROPOSED THIS, AND IT WAS SENT BACK:',
        ...Object.entries(previous).map(([f, v]) => `  ${f}: ${asText(v)}`),
        '',
        `WHAT THEY SAID: ${note}`,
        '',
        'Answer that. Change what they objected to; keep what they did not.',
        '',
      ] : []),
      'Return every one of these fields, in the voice of the history above:',
      '{',
      shape.join('\n'),
      '}',
      '',
      'Reply with that JSON object and nothing else: no prose before or after, no',
      'code fence. Every key above must be present and no others. Keep each value',
      'short -- a sentence or two of prose, three or four entries in a list.',
    ].join('\n'),
  };
}

/** The last JSON object in the reply, so a stray sentence does not break it. */
export function extractJson(text) {
  const trimmed = String(text).replace(/```(?:json)?/g, '').trim();
  const start = trimmed.lastIndexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) throw new Error('no JSON object in the reply');
  return JSON.parse(trimmed.slice(start, end + 1));
}

/** Refuses anything that is not exactly what was asked for, in the right shape. */
export function checkAnswer(proposed, asked) {
  const wanted = new Set(asked);
  const stray = Object.keys(proposed).filter((k) => !wanted.has(k));
  if (stray.length) throw new Error(`answered with ${stray.join(', ')}, which was not asked for`);
  const missing = asked.filter((k) => proposed[k] === undefined);
  if (missing.length) throw new Error(`did not answer ${missing.join(', ')}`);
  for (const field of asked) {
    const wantList = LIST_FIELDS.has(field);
    if (wantList !== Array.isArray(proposed[field])) {
      throw new Error(`${field} should be ${wantList ? 'a list' : 'text'}`);
    }
  }
  return proposed;
}

/**
 * One agent run. The prompt goes in on stdin, so the command can be anything
 * that reads it and prints a JSON object -- another model, another harness, a
 * stub. "Reaches an agent" should not mean "reaches this one".
 */
export function runAgent(prompt, { command = env('CANON_AGENT_COMMAND') || 'claude -p', timeoutMs = 180_000 } = {}) {
  return new Promise((resolve, reject) => {
    const [bin, ...rest] = command.split(' ').filter(Boolean);
    const child = spawn(bin, rest, { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`\`${command}\` timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);
    child.stdin.on('error', () => { /* the child may exit before reading */ });
    child.stdin.end(prompt);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', (e) => { clearTimeout(timer); reject(new Error(`could not run \`${bin}\`: ${e.message}`)); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) { resolve(out); return; }
      const said = `${out}${err}`.trim();
      // The commonest failure, and it exits 1 saying nothing on stderr.
      if (/not logged in|\/login/i.test(said)) {
        reject(new Error('the agent is not signed in. Run `claude` once in a terminal and sign in.'));
        return;
      }
      reject(new Error(`\`${command}\` exited ${code}${said ? `: ${said.slice(0, 300)}` : ' with no output'}`));
    });
  });
}

/** On unless it is turned off, so the button works without a second process. */
export const agentEnabled = () => (env('CANON_AGENT') ?? 'on').toLowerCase() !== 'off';
