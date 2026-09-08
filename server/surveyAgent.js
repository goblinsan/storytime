/**
 * Asking what this universe needs next.
 *
 * The other two agent requests are about one record: fill these fields, draw
 * this person. This one is about the whole thing, and it answers a question
 * nobody can answer by looking at a list -- where is this thin, what is half
 * finished, what could be completed with an afternoon's work.
 *
 * WHAT IT PRODUCES
 * Findings, not canon. Nothing here is ever written into a record, and there is
 * no accept: a survey is read, acted on, and dismissed. That is why it is worth
 * letting it be opinionated. The worst case is advice somebody disagrees with.
 *
 * WHAT IT IS GIVEN
 * A census, not the canon. Handing a model six hundred records and asking what
 * is missing gets you a summary of what is there; handing it the counts, the
 * shape of the gaps, and the standing direction gets you an answer about the
 * difference between them. The census below is the whole input, and it is
 * deliberately small enough to read.
 */
import { env } from './env.js';

export const SURVEY_REQUEST = 'universe_survey_request';

/** Where a finding can point. Matches the lenses in the left nav. */
export const PLACES = [
  'characters', 'geography', 'timeline', 'societies', 'bestiary', 'works', 'direction', 'media',
];

/**
 * The prompt. It carries what exists, what is empty, and what the universe says
 * it is for -- so a finding can be about the gap between the last two.
 */
export function buildSurveyPrompt({ universe, direction, census }) {
  const lines = [];
  lines.push(`You are surveying a worldbuilding universe called "${universe.title}" and`);
  lines.push('saying what it needs next. You are not writing canon. You are telling');
  lines.push('somebody where to spend their next hour.');
  lines.push('');

  if (universe.description?.trim()) {
    lines.push('WHAT THIS UNIVERSE IS');
    lines.push(universe.description.trim());
    lines.push('');
  }

  if (direction.persistentGoal?.trim() || direction.guardrails?.length) {
    lines.push('WHAT IT IS FOR');
    if (direction.persistentGoal?.trim()) lines.push(direction.persistentGoal.trim());
    if (direction.temporaryFocus?.trim()) lines.push(`Right now: ${direction.temporaryFocus.trim()}`);
    for (const rule of direction.guardrails ?? []) lines.push(`Must not: ${rule}`);
    lines.push('');
  } else {
    lines.push('WHAT IT IS FOR');
    lines.push('Nothing is recorded. There is no standing direction and there are no guardrails.');
    lines.push('');
  }

  lines.push('WHAT IS RECORDED');
  for (const [label, n] of census.counts) lines.push(`${label}: ${n}`);
  lines.push('');

  if (census.notes.length) {
    lines.push('WHAT IS THIN OR UNFINISHED');
    for (const note of census.notes) lines.push(`- ${note}`);
    lines.push('');
  }

  lines.push('Give between three and six findings. Each one names something specific and');
  lines.push('says what to do about it. Prefer the thing that unblocks the most, and the');
  lines.push('thing that is nearly finished, over the thing that is merely absent -- an');
  lines.push('empty dimension is only worth raising if this universe needs it.');
  lines.push('');
  lines.push('Do not invent canon. Do not name characters, places or events that are not');
  lines.push('listed above. Do not propose anything a guardrail forbids.');
  lines.push('');
  lines.push('Answer with a JSON object and nothing else:');
  lines.push('');
  lines.push('{"state": "one sentence on where this universe stands",');
  lines.push(' "findings": [{"title": "short", "detail": "what to do and why",');
  lines.push(`  "where": "one of: ${PLACES.join(', ')}"}]}`);

  return lines.join('\n');
}

/** Refuses a shape the panel cannot render, rather than rendering nothing. */
export function checkSurvey(answer) {
  const findings = Array.isArray(answer?.findings) ? answer.findings : null;
  if (!findings) throw new Error('answered without a findings list');
  if (!findings.length) throw new Error('answered with no findings');

  const cleaned = findings.slice(0, 8).map((f, i) => {
    const title = String(f?.title ?? '').trim();
    const detail = String(f?.detail ?? '').trim();
    if (!title) throw new Error(`finding ${i + 1} has no title`);
    if (!detail) throw new Error(`finding ${i + 1} has no detail`);
    const where = PLACES.includes(f?.where) ? f.where : null;
    return { title, detail, where };
  });

  return { state: String(answer?.state ?? '').trim(), findings: cleaned };
}

/** On unless it is turned off, like the other two. */
export const surveyEnabled = () => (env('SURVEY_AGENT') ?? env('CANON_AGENT') ?? 'on').toLowerCase() !== 'off';
