/**
 * Writing an arc.
 *
 * An arc is not a record of something in the world. It is the shape a telling
 * takes through the world -- what is set in motion, who it happens to, what it
 * costs -- and its beats are an order, not a set. So the prompt is handed the
 * things a telling is made OF in this universe: the principal cast and what
 * they want, what the chronicle says happened and when, the arcs already
 * written (so this one is not a second copy of them), and the works already
 * composed (so its beats can line up with prose that exists).
 *
 * Without those it writes an arc for any universe with a warlord in it.
 */
export const ARC_CANON_REQUEST = 'arc_canon_request';

export const ARC_FIELD_NOTES = {
  description: 'the throughline, in two or three sentences: what is set in motion, '
    + 'who it happens to, and what it costs them. Not a summary of every beat',
  details: 'the beats, in order, as a list of short paragraphs. Each begins with '
    + 'its label -- "Act I: ...", "Beat 3: ..." -- and says what happens and why it '
    + 'matters to the throughline',
};

/** Written as a JSON array, in order. */
export const ARC_LIST_FIELDS = new Set(['details']);

const said = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

export function buildArcPrompt({
  arc, cast, events, siblings, works, fields, direction, brief, previous, note,
}) {
  const asked = fields.filter((f) => ARC_FIELD_NOTES[f]);
  const current = (f) => (ARC_LIST_FIELDS.has(f)
    ? (Array.isArray(arc[f]) ? arc[f].join(' | ') : said(arc[f]))
    : said(arc[f]));
  const written = asked.map((f) => [f, current(f)]).filter(([, v]) => v);

  return {
    asked,
    prompt: [
      'You are writing a story arc for an existing universe. Use the people,',
      'places and events that are recorded; do not invent a new protagonist or a',
      'war the chronicle does not have.',
      '',
      ...(direction?.persistentGoal?.trim() ? [
        `WHAT THIS UNIVERSE IS FOR: ${direction.persistentGoal.trim()}`, '',
      ] : []),
      ...(direction?.guardrails?.length ? [
        'YOU ARE HELD TO THESE. They are not preferences:',
        ...direction.guardrails.map((rule) => `  - ${rule}`),
        '',
      ] : []),
      ...(brief?.trim() ? [
        'WHAT THE AUTHOR ASKED FOR WHEN THEY CREATED THIS. Hold to it:',
        brief.trim(),
        '',
      ] : []),
      `ARC ${arc.arcNumber ?? ''}: ${arc.title}`.trim(),
      '',
      ...(cast.length ? [
        'THE PRINCIPAL CAST, and what each of them wants:',
        ...cast.map((c) => `  - ${c.name}${c.role ? ` (${said(c.role)})` : ''}`
          + `${said(c.motivation) ? `: ${said(c.motivation).slice(0, 200)}` : ''}`),
        '',
      ] : []),
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
      ...(works.length ? [
        'WORKS ALREADY COMPOSED in this universe:',
        ...works.map((w) => `  - ${said(w.title)}`),
        '',
      ] : []),
      ...(written.length ? [
        'SOME OF THESE ARE ALREADY WRITTEN. Improve them: make them specific to',
        'this arc rather than to any arc of its kind, and keep what is already',
        'good. If a field is already right, return it unchanged.',
        '',
        ...written.map(([f, v]) => `CURRENT ${f}: ${v}`),
        '',
      ] : []),
      // A revision, not another attempt from scratch: the last proposal and
      // what was wrong with it, so the same objection does not come back.
      ...(previous && note ? [
        'YOU ALREADY PROPOSED THIS, AND IT WAS SENT BACK:',
        ...Object.entries(previous).map(([f, v]) => `  ${f}: ${Array.isArray(v) ? v.join(' | ') : String(v)}`),
        '',
        `WHAT THEY SAID: ${note}`,
        '',
        'Answer that. Change what they objected to; keep what they did not.',
        '',
      ] : []),
      'Answer with JSON and nothing else:',
      '{',
      ...asked.map((f, i) => {
        const example = ARC_LIST_FIELDS.has(f) ? '["Act I: ...", "Act II: ..."]' : '"..."';
        return `  "${f}": ${example}${i < asked.length - 1 ? ',' : ''}   // ${ARC_FIELD_NOTES[f]}`;
      }),
      '}',
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
