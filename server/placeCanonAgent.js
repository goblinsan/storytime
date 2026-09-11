/**
 * Writing canon for a place that already exists.
 *
 * Distinct from the two requests that already existed and easy to confuse with
 * both. `location_proposal_request` invents a place that is not there yet;
 * `location_image_request` draws one. This fills in what a place that IS there
 * has not had written about it.
 *
 * WHY A PLACE NEEDS ITS OWN PROMPT
 * The character agent is given a person, their ties and the story's present.
 * A place is understood by what contains it and what it contains: a station's
 * history is the history of the system it hangs in, and its ecology is a
 * consequence of a biome recorded one level up. Handing this the character
 * prompt with the nouns swapped would produce five paragraphs that could be
 * about anywhere.
 */
export const PLACE_CANON_REQUEST = 'location_canon_request';

/** What each field is for, said to the agent in the same words the page uses. */
export const PLACE_FIELD_NOTES = {
  description: 'what somebody arriving would find, in two or three sentences',
  history: 'what happened here, and what it left behind',
  folklore: 'what is SAID to have happened here. This is not the history. If it '
    + 'merely repeats the history it is not folklore -- it is the version the '
    + 'people here tell, and the gap between the two is the point',
  biome: 'the physical setting: terrain, climate, what the place is made of',
  ecology: 'what grows here and what lives here, following from the biome',
};

export const PLACE_COLUMNS = {
  description: 'description',
  history: 'history',
  folklore: 'folklore',
  biome: 'biome',
  ecology: 'ecology',
};

export function buildPlaceCanonPrompt({
  place, parent, inside, siblings, fields, direction, brief, previous, note,
}) {
  const asked = fields.filter((f) => PLACE_FIELD_NOTES[f]);
  const said = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
  const written = asked.map((f) => [f, said(place[f])]).filter(([, v]) => v);

  return {
    asked,
    prompt: [
      'You are writing canon for a place in an existing universe. Match what is',
      'already recorded; do not contradict it, and do not invent events that',
      'would need other records to change.',
      '',
      ...(direction?.persistentGoal?.trim() ? [
        `WHAT THIS UNIVERSE IS FOR: ${direction.persistentGoal.trim()}`, '',
      ] : []),
      ...(direction?.guardrails?.length ? [
        'YOU ARE HELD TO THESE. They are not preferences:',
        ...direction.guardrails.map((rule) => `  - ${rule}`),
        '',
        'If a field you were asked for cannot be written without breaking one of',
        'these, return that field unchanged rather than breaking it.',
        '',
      ] : []),
      // What the author asked for when they created this: the reason the
      // record exists, and it outranks the model's instincts about what a
      // place of this kind is usually like.
      ...(brief?.trim() ? [
        'WHAT THE AUTHOR ASKED FOR WHEN THEY CREATED THIS. Hold to it:',
        brief.trim(),
        '',
      ] : []),
      `PLACE: ${place.name}`,
      `KIND: ${place.regionType ? place.regionType.replace(/_/g, ' ') : '(none recorded)'}`,
      // What contains it and what it contains, because that is what makes a
      // place this place rather than any place of its kind.
      `INSIDE: ${parent ? parent.name : '(nothing -- this is one of the outermost places)'}`,
      ...(parent?.description ? [`WHICH IS: ${said(parent.description)}`] : []),
      ...(parent?.biome ? [`ITS SETTING: ${said(parent.biome)}`] : []),
      `CONTAINS: ${inside.map((c) => c.name).slice(0, 20).join(', ') || '(nothing recorded)'}`,
      `ALONGSIDE: ${siblings.map((c) => c.name).slice(0, 12).join(', ') || '(nothing recorded)'}`,
      '',
      'WHAT IS ALREADY WRITTEN:',
      said(place.description) || '(nothing)',
      ...(place.politicalNotes ? [`CONTROL: ${said(place.politicalNotes)}`] : []),
      '',
      ...(written.length ? [
        'SOME OF THESE ARE ALREADY WRITTEN. Improve them: make them specific to',
        'this place rather than to anywhere of its kind, and keep what is already',
        'good. If a field is already right, return it unchanged -- do not change',
        'it to prove you read it.',
        '',
        ...written.map(([f, v]) => `CURRENT ${f}: ${v}`),
        '',
      ] : []),
      // A revision, not another attempt from scratch. Without the last try
      // and what was wrong with it, "ask for a revision" is asking again and
      // hoping -- and the same objection comes back, because nothing carried
      // the objection. The cast's agent has always had this; these did not,
      // so their revise button re-asked with the reason thrown away.
      ...(previous && note ? [
        'YOU ALREADY PROPOSED THIS, AND IT WAS SENT BACK:',
        ...Object.entries(previous).map(([f, v]) => `  ${f}: ${Array.isArray(v) ? v.join('; ') : String(v)}`),
        '',
        `WHAT THEY SAID: ${note}`,
        '',
        'Answer that. Change what they objected to; keep what they did not.',
        '',
      ] : []),
      'Answer with JSON and nothing else:',
      '{',
      ...asked.map((f, i) => `  "${f}": "..."${i < asked.length - 1 ? ',' : ''}   // ${PLACE_FIELD_NOTES[f]}`),
      '}',
    ].join('\n'),
  };
}

/**
 * Keep only what was asked for, and only if it says something.
 *
 * An agent that answers a field it was not asked about is proposing a change
 * nobody requested, which is the quiet way a draft queue starts rewriting
 * records behind you.
 */
export function checkPlaceAnswer(proposed, asked) {
  if (!proposed || typeof proposed !== 'object') return null;
  const kept = {};
  for (const field of asked) {
    const value = proposed[field];
    if (typeof value === 'string' && value.trim()) kept[field] = value.trim();
  }
  return Object.keys(kept).length ? kept : null;
}
