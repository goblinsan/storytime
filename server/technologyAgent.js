/**
 * Writing a technology, and picturing one.
 *
 * A technology is understood by what it does that nothing else does, what it
 * costs to do it, and who is allowed to. The last of those is the one models
 * skip: asked about a device they write capability and stop, and a universe
 * where everyone can build everything has no politics in it.
 *
 * WHO HOLDS IT IS GIVEN, NOT INVENTED
 * The holding group and the place of origin are recorded as edges to real
 * records, so the prompt is handed them. Told that the Vander-Thorne Orbital
 * Cartel holds the patents, a model writes patents that sound like that cartel
 * -- and does not invent a guild this universe has never heard of to hold them.
 */
export const TECHNOLOGY_CANON_REQUEST = 'technology_canon_request';
export const TECHNOLOGY_IMAGE_REQUEST = 'technology_image_request';

export const TECHNOLOGY_FIELD_NOTES = {
  description: 'what it is and what it does, in two or three sentences, as '
    + 'somebody would explain it to a person who had not heard of it',
  principles: 'how it works. The mechanism, at the level of detail the rest of '
    + 'this universe is written at -- not a manual, not a hand-wave',
  history: 'how it came about. Who worked it out, what they were trying to do, '
    + 'and what it replaced',
  limitations: 'what it cannot do, what it costs, and how it fails. A technology '
    + 'with no limit is a plot device rather than a thing',
  patentsOrTaboos: 'who is allowed to have it and what happens to people who '
    + 'have it anyway. Law, custom, or force',
};

export const TECHNOLOGY_COLUMNS = {
  description: 'description',
  principles: 'principles',
  history: 'history',
  limitations: 'limitations',
  patentsOrTaboos: 'patents_or_taboos',
};

const said = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
const inWords = (v) => said(v).replace(/_/g, ' ');

export function buildTechnologyPrompt({ technology, fields, direction }) {
  const asked = fields.filter((f) => TECHNOLOGY_FIELD_NOTES[f]);
  const written = asked.map((f) => [f, said(technology[f])]).filter(([, v]) => v);

  return {
    asked,
    prompt: [
      'You are writing canon for a technology in an existing universe. Match',
      'what is already recorded; do not contradict it, and do not invent groups,',
      'places or people to make this one work.',
      '',
      ...(direction?.persistentGoal?.trim() ? [
        `WHAT THIS UNIVERSE IS FOR: ${direction.persistentGoal.trim()}`, '',
      ] : []),
      ...(direction?.guardrails?.length ? [
        'YOU ARE HELD TO THESE. They are not preferences:',
        ...direction.guardrails.map((rule) => `  - ${rule}`),
        '',
      ] : []),
      `TECHNOLOGY: ${technology.name}`,
      ...(said(technology.classification)
        ? [`KIND: ${inWords(technology.classification)}`] : []),
      ...(said(technology.proliferation)
        ? [`HOW WIDESPREAD: ${inWords(technology.proliferation)}`] : []),
      '',
      // The edges. These are the facts that make it this technology rather
      // than a generic one of its kind, and the guardrail against inventing a
      // rival guild to hold the patents.
      ...(technology.originDate || technology.originLocationName ? [
        'WHERE AND WHEN IT COMES FROM. Recorded, and you are held to it:',
        ...(technology.originDate ? [`  - appeared: ${said(technology.originDate)}`] : []),
        ...(technology.originLocationName
          ? [`  - came out of: ${technology.originLocationName}`] : []),
        '',
      ] : []),
      ...(technology.holderFactionName ? [
        `WHO HOLDS IT: ${technology.holderFactionName}. Recorded, and you are`,
        'held to it. Do not give it to anybody else and do not invent a group to',
        'share it with.',
        '',
      ] : ['WHO HOLDS IT: nothing recorded.', '']),
      'WHAT IS ALREADY WRITTEN:',
      said(technology.description) || said(technology.principles) || '(nothing)',
      '',
      ...(written.length ? [
        'SOME OF THESE ARE ALREADY WRITTEN. Improve them: make them specific to',
        'this technology rather than to any technology of its kind, and keep what',
        'is already good. If a field is already right, return it unchanged.',
        '',
        ...written.map(([f, v]) => `CURRENT ${f}: ${v}`),
        '',
      ] : []),
      'Answer with JSON and nothing else:',
      '{',
      ...asked.map((f, i) => `  "${f}": "..."${i < asked.length - 1 ? ',' : ''}`
        + `   // ${TECHNOLOGY_FIELD_NOTES[f]}`),
      '}',
    ].join('\n'),
  };
}

/** Keep only what was asked for, and only if it says something. */
export function checkTechnologyAnswer(proposed, asked) {
  if (!proposed || typeof proposed !== 'object') return null;
  const kept = {};
  for (const field of asked) {
    const value = proposed[field];
    if (typeof value === 'string' && value.trim()) kept[field] = value.trim();
  }
  return Object.keys(kept).length ? kept : null;
}

/**
 * Drawing a technology.
 *
 * The object itself, as an object -- not somebody using it, and not a cutaway
 * with callouts. A model told "technology" reaches for a schematic covered in
 * invented lettering, which is unusable in a universe with its own languages,
 * so diagrams and text are refused outright.
 */
export function buildTechnologyImagePrompt({ technology, style, note }) {
  const subject = [
    `${technology.name}.`,
    said(technology.description).slice(0, 240) || said(technology.principles).slice(0, 240),
  ].filter(Boolean).join(' ');

  const positive = [
    `The ${subject}`,
    'The device itself is the subject and fills the frame, as a single physical '
      + 'object somebody could pick up or stand beside.',
    note?.trim() ? `Most importantly: ${note.trim()}` : '',
    style?.trim() ? `Rendered in this manner: ${style.trim()}` : '',
  ].filter(Boolean).join(' ');

  return {
    positive,
    negative: 'text, labels, lettering, words, numbers, captions, callouts, '
      + 'watermark, signature, schematic, blueprint, diagram, cutaway, exploded '
      + 'view, infographic, user manual, multiple views, collage, blurry, '
      + 'low quality',
  };
}

export const TECHNOLOGY_IMAGE_SIZE = { width: 1216, height: 832 };
