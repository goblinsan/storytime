/**
 * Proposing what a universe is for.
 *
 * The odd one of the three agent requests, and worth being careful about: the
 * others propose canon, and this proposes the instructions the canon agents
 * are given. An agent writing its own brief is a loop, so it is bounded to
 * proposing and never applying, and what it is given is the universe's records
 * rather than its existing direction -- the point is to read what somebody has
 * actually built and say what it appears to be for, not to rephrase what the
 * direction already claims.
 */
import { env } from './env.js';

export const DIRECTION_REQUEST = 'universe_direction_request';

/**
 * The prompt. It sees the shape of the universe and, when there is one, the
 * direction already written, because a revision has to know what it is revising.
 */
/** Which fields a request may ask for, and what each one is. */
export const DIRECTION_FIELDS = {
  persistentGoal: 'the standing direction: the through-line this universe is always working toward',
  temporaryFocus: 'the current focus: what matters right now, which changes often',
  guardrails: 'the guardrails: prohibitions anything writing into this universe is held to',
};

export function buildDirectionPrompt({ universe, current, census, note, fields }) {
  const asked = (fields ?? Object.keys(DIRECTION_FIELDS)).filter((f) => DIRECTION_FIELDS[f]);
  const lines = [];
  lines.push(`You are reading a worldbuilding universe called "${universe.title}" and proposing`);
  lines.push('the standing instructions its author gives to everything that writes into it.');
  lines.push('');

  if (universe.description?.trim()) {
    lines.push('WHAT THE AUTHOR SAYS IT IS');
    lines.push(universe.description.trim());
    lines.push('');
  }

  lines.push('WHAT IS RECORDED');
  for (const [label, n] of census.counts) lines.push(`${label}: ${n}`);
  if (census.samples.length) {
    lines.push('');
    lines.push('SOME OF IT');
    for (const line of census.samples) lines.push(`- ${line}`);
  }
  lines.push('');

  if (current.persistentGoal?.trim() || current.guardrails?.length) {
    lines.push('WHAT IS ALREADY WRITTEN');
    if (current.persistentGoal?.trim()) lines.push(`Standing direction: ${current.persistentGoal.trim()}`);
    for (const rule of current.guardrails ?? []) lines.push(`Guardrail: ${rule}`);
    lines.push('');
    lines.push('Propose a revision. Keep what is right, and say what is missing.');
  } else {
    lines.push('Nothing is written yet. Propose a first version.');
  }
  lines.push('');

  if (note?.trim()) {
    lines.push(`WHAT TO CHANGE: ${note.trim()}`);
    lines.push('');
  }

  lines.push(`Propose only ${asked.length === 1 ? 'this' : 'these'}:`);
  for (const field of asked) lines.push(`  ${field} -- ${DIRECTION_FIELDS[field]}`);
  lines.push('');

  if (asked.includes('persistentGoal')) {
    lines.push('The standing direction is one short paragraph, in the author\'s terms rather');
    lines.push('than in craft language.');
    lines.push('');
  }
  if (asked.includes('temporaryFocus')) {
    lines.push('The current focus is a sentence or two about what deserves attention now,');
    lines.push('given what is thin above. It is expected to be replaced often.');
    lines.push('');
  }
  if (asked.includes('guardrails')) {
    lines.push('A guardrail is a prohibition, written as one. "Do not resolve the central');
    lines.push('mystery." "Do not turn rumor into canon." Three to six of them. Each must be');
    lines.push('something an agent could actually check itself against, not a preference.');
    lines.push('');
  }

  lines.push('Propose nothing that contradicts what is recorded above, and invent no');
  lines.push('characters, places or events.');
  lines.push('');
  lines.push('Answer with a JSON object and nothing else, carrying exactly these keys:');
  lines.push('');
  lines.push(`{${asked.map((f) => `"${f}": ${f === 'guardrails' ? '["...", "..."]' : '"..."'}`).join(', ')}}`);

  return { asked, prompt: lines.join('\n') };
}

/** Refuses an answer the page could not render, or that quietly says nothing. */
export function checkDirection(answer, asked) {
  const proposed = {};

  for (const field of asked) {
    if (field === 'guardrails') {
      if (!Array.isArray(answer?.guardrails)) throw new Error('answered without a guardrails list');
      const rules = answer.guardrails.map((g) => String(g ?? '').trim()).filter(Boolean);
      if (!rules.length) throw new Error('answered with no guardrails');
      proposed.guardrails = rules.slice(0, 8);
    } else {
      const text = String(answer?.[field] ?? '').trim();
      if (!text) throw new Error(`answered with nothing for ${field}`);
      proposed[field] = text;
    }
  }

  // An answer carrying a field nobody asked for is refused rather than trimmed:
  // this proposes the instructions agents are given, and one quietly rewriting
  // a field it was not asked about is the shape worth refusing outright.
  const stray = Object.keys(answer ?? {}).filter((k) => DIRECTION_FIELDS[k] && !asked.includes(k));
  if (stray.length) throw new Error(`answered with ${stray.join(', ')}, which was not asked for`);

  return proposed;
}

/** On unless it is turned off, like the others. */
export const directionEnabled = () =>
  (env('DIRECTION_AGENT') ?? env('CANON_AGENT') ?? 'on').toLowerCase() !== 'off';
