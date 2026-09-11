/**
 * Writing an arc, and writing one act of it.
 *
 * An arc is not a record of something in the world. It is the shape a telling
 * takes through the world -- what is set in motion, who it happens to, what it
 * costs -- and its beats are an order, not a set. So the prompt is handed the
 * things a telling is made OF in this universe: the principal cast and what
 * they want, what the chronicle says happened and when, the arcs already
 * written (so this one is not a second copy of them), and the works already
 * composed (so its beats can line up with prose that exists).
 *
 * An ACT is written inside its arc. It is handed the arc's throughline and
 * what the arc keeps out, every act in order with this one marked, the last
 * beats of the act before (so it begins where that one ends) and what the act
 * after is for (so it arrives there instead of somewhere else).
 *
 * Without those it writes an arc for any universe with a warlord in it.
 */
export const ARC_CANON_REQUEST = 'arc_canon_request';

export const ARC_FIELD_NOTES = {
  description: 'the throughline, in two or three sentences: what is set in motion, '
    + 'who it happens to, and what it costs them. Not a summary of every beat',
  throughline: 'what drives the arc underneath its events, in two or three sentences: '
    + 'what it is really about and the engine that keeps it moving -- not what happens',
  outOfScope: 'what this arc deliberately leaves out or keeps hidden, as a list of short '
    + 'rules the writing must hold to. Only what a writer would otherwise be tempted to include',
  // Not numbered and not labeled: the surface numbers the list, and a beat
  // that also says "Act I:" or "Beat 3:" is numbered twice. Nor is a note a
  // beat -- the throughline has its own field, and what is out of scope or
  // already done is bookkeeping, not something that happens.
  details: 'the beats, in order, as a list of short paragraphs, each saying what '
    + 'happens and why it matters to the throughline. Do not number them or begin '
    + 'them with a label like "Act I:" -- the list is numbered for you. Leave out act '
    + 'headings and notes about the throughline, scope or progress: they are not beats',
};

export const ACT_FIELD_NOTES = {
  summary: 'what this act does, in two or three sentences: where it starts, what turns '
    + 'in it, and where it leaves things for the act after it. Only this act: say what '
    + 'its own beats do, not what happened in the act before',
  beats: 'the beats of this act only, in order, as a list of short paragraphs, each '
    + 'saying what happens and why it matters to the throughline. Do not number or label '
    + 'them, and leave out notes about scope or progress: they are not beats',
};

/** Written as JSON arrays, in order. */
export const ARC_LIST_FIELDS = new Set(['details', 'outOfScope', 'beats']);

const said = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
const listed = (v) => (Array.isArray(v) ? v.map(said).join(' | ') : said(v));

function directionLines(direction) {
  return [
    ...(direction?.persistentGoal?.trim() ? [
      `WHAT THIS UNIVERSE IS FOR: ${direction.persistentGoal.trim()}`, '',
    ] : []),
    ...(direction?.guardrails?.length ? [
      'YOU ARE HELD TO THESE. They are not preferences:',
      ...direction.guardrails.map((rule) => `  - ${rule}`),
      '',
    ] : []),
  ];
}

const briefLines = (brief, heading) => (brief?.trim() ? [heading, brief.trim(), ''] : []);

const castLines = (cast) => (cast.length ? [
  'THE PRINCIPAL CAST, and what each of them wants:',
  ...cast.map((c) => `  - ${c.name}${c.role ? ` (${said(c.role)})` : ''}`
    + `${said(c.motivation) ? `: ${said(c.motivation).slice(0, 200)}` : ''}`),
  '',
] : []);

const worksLines = (works) => (works.length ? [
  'WORKS ALREADY COMPOSED in this universe:',
  ...works.map((w) => `  - ${said(w.title)}`),
  '',
] : []);

// A revision, not another attempt from scratch: the last proposal and what
// was wrong with it, so the same objection does not come back.
const revisionLines = (previous, note) => (previous && note ? [
  'YOU ALREADY PROPOSED THIS, AND IT WAS SENT BACK:',
  ...Object.entries(previous).map(([f, v]) => `  ${f}: ${Array.isArray(v) ? v.join(' | ') : String(v)}`),
  '',
  `WHAT THEY SAID: ${note}`,
  '',
  'Answer that. Change what they objected to; keep what they did not.',
  '',
] : []);

function answerLines(asked, notes) {
  return [
    'Answer with JSON and nothing else:',
    '{',
    ...asked.map((f, i) => {
      const example = ARC_LIST_FIELDS.has(f) ? '["...", "..."]' : '"..."';
      return `  "${f}": ${example}${i < asked.length - 1 ? ',' : ''}   // ${notes[f]}`;
    }),
    '}',
  ];
}

/** The arc as it stands: what it is for, what it keeps out, and its acts. */
function arcLines(arc, acts, markId) {
  return [
    `ARC ${arc.arcNumber ?? ''}: ${arc.title}`.trim(),
    ...(said(arc.description) ? [`IN BRIEF: ${said(arc.description)}`] : []),
    ...(said(arc.throughline) ? [`THROUGHLINE: ${said(arc.throughline)}`] : []),
    '',
    ...(arc.outOfScope?.length ? [
      'KEPT OUT OF IT. The writing is held to these:',
      ...arc.outOfScope.map((rule) => `  - ${said(rule)}`),
      '',
    ] : []),
    ...(acts?.length ? [
      'ITS ACTS, in order:',
      ...acts.map((a) => `  ${a.actNumber}. ${said(a.title) || 'Untitled'}`
        + `${said(a.span) ? ` (${said(a.span)})` : ''}`
        + `${a.id === markId ? '   <-- THIS ONE' : ''}`
        + `${said(a.summary) ? `: ${said(a.summary).slice(0, 300)}` : ''}`),
      '',
    ] : []),
  ];
}

export function buildArcPrompt({
  arc, acts = [], cast, events, siblings, works, fields, direction, brief, previous, note,
}) {
  const asked = fields.filter((f) => ARC_FIELD_NOTES[f]);
  const current = (f) => (ARC_LIST_FIELDS.has(f) ? listed(arc[f]) : said(arc[f]));
  const written = asked.map((f) => [f, current(f)]).filter(([, v]) => v);

  return {
    asked,
    prompt: [
      'You are writing a story arc for an existing universe. Use the people,',
      'places and events that are recorded; do not invent a new protagonist or a',
      'war the chronicle does not have.',
      '',
      ...directionLines(direction),
      ...briefLines(brief, 'WHAT THE AUTHOR ASKED FOR WHEN THEY CREATED THIS. Hold to it:'),
      ...arcLines(arc, acts),
      ...castLines(cast),
      ...(events.length ? [
        'WHAT THE CHRONICLE RECORDS, in order:',
        ...events.map((e) => `  - ${e.date ? `${said(e.date)}: ` : ''}${said(e.title)}`),
        '',
      ] : []),
      ...(siblings.length ? [
        'OTHER ARCS ALREADY WRITTEN. This one must be about something else:',
        ...siblings.map((s) => `  - ${said(s.title)}: ${said(s.description).slice(0, 160)}`),
        '',
      ] : []),
      ...worksLines(works),
      ...(written.length ? [
        'SOME OF THESE ARE ALREADY WRITTEN. Improve them: make them specific to',
        'this arc rather than to any arc of its kind, and keep what is already',
        'good. If a field is already right, return it unchanged.',
        '',
        ...written.map(([f, v]) => `CURRENT ${f}: ${v}`),
        '',
      ] : []),
      ...revisionLines(previous, note),
      ...answerLines(asked, ARC_FIELD_NOTES),
    ].join('\n'),
  };
}

export function buildArcActPrompt({
  arc, acts, act, cast, works, fields, direction, brief, previous, note,
}) {
  const asked = fields.filter((f) => ACT_FIELD_NOTES[f]);
  const at = acts.findIndex((a) => a.id === act.id);
  const before = at > 0 ? acts[at - 1] : null;
  const after = at >= 0 && at < acts.length - 1 ? acts[at + 1] : null;
  const current = (f) => (ARC_LIST_FIELDS.has(f) ? listed(act[f]) : said(act[f]));
  const written = asked.map((f) => [f, current(f)]).filter(([, v]) => v);

  return {
    asked,
    prompt: [
      'You are writing one act of a story arc in an existing universe. Use the',
      'people, places and events that are recorded, and stay inside this act:',
      'what happens in the acts around it belongs to them.',
      '',
      ...directionLines(direction),
      ...briefLines(brief, 'WHAT THE AUTHOR ASKED FOR THIS ACT. Hold to it:'),
      ...arcLines(arc, acts, act.id),
      `THIS ACT: ${act.actNumber}. ${said(act.title) || 'Untitled'}`
        + `${said(act.span) ? ` (${said(act.span)})` : ''}`,
      // What the act already holds, whatever is being asked for. Asked for a
      // summary and shown only the act before, the agent summarized the act
      // before: it had nothing of this act's own to go on.
      ...(said(act.summary) && !asked.includes('summary') ? [`WHAT IT DOES: ${said(act.summary)}`] : []),
      ...(act.beats?.length && !asked.includes('beats') ? [
        'ITS BEATS, in order. This is what the act is:',
        ...act.beats.map((b, i) => `  ${i + 1}. ${said(b)}`),
      ] : []),
      '',
      ...(before?.beats?.length ? [
        'THE ACT BEFORE IT ENDS WITH THESE BEATS. This act picks up after them;',
        'do not retell them:',
        ...before.beats.slice(-3).map((b) => `  - ${said(b)}`),
        '',
      ] : []),
      ...(after ? [
        `THE ACT AFTER IT: ${said(after.title) || 'Untitled'}`
          + `${said(after.summary) ? `: ${said(after.summary).slice(0, 300)}` : ''}`,
        'End where that one begins.',
        '',
      ] : []),
      ...castLines(cast),
      ...worksLines(works),
      ...(written.length ? [
        'SOME OF THESE ARE ALREADY WRITTEN. Improve them and keep what is good;',
        'if a field is already right, return it unchanged.',
        '',
        ...written.map(([f, v]) => `CURRENT ${f}: ${v}`),
        '',
      ] : []),
      ...revisionLines(previous, note),
      ...answerLines(asked, ACT_FIELD_NOTES),
    ].join('\n'),
  };
}

/** Keep only what was asked for, and only if it says something. */
export function checkArcAnswer(proposed, asked) {
  if (!proposed || typeof proposed !== 'object') return null;
  const kept = {};
  for (const field of asked) {
    const value = proposed[field];
    if (ARC_LIST_FIELDS.has(field)) {
      const list = Array.isArray(value) ? value.map((v) => String(v).trim()).filter(Boolean) : [];
      if (list.length) kept[field] = list;
    } else if (typeof value === 'string' && value.trim()) {
      kept[field] = value.trim();
    }
  }
  return Object.keys(kept).length ? kept : null;
}
