/**
 * Writing an event, and picturing one.
 *
 * An event's prompt is not a place's with the nouns swapped. A place is
 * understood by what contains it and what it contains; an event is understood
 * by what came before it and what followed, and by who was standing in it.
 * Handed the place prompt, a model writes a paragraph about a battle that
 * could be any battle.
 */
export const EVENT_CANON_REQUEST = 'timeline_event_canon_request';
export const EVENT_IMAGE_REQUEST = 'timeline_event_image_request';
export const EVENT_PARTS_REQUEST = 'timeline_event_parts_request';

export const EVENT_FIELD_NOTES = {
  description: 'what happened, in two or three sentences. The entry as a '
    + 'chronicle would carry it',
  account: 'the fuller telling, at the length it deserves: how it began, how it '
    + 'turned, how it ended',
  consequences: 'what it changed. This is why the event is on a timeline at all '
    + '-- if nothing is different afterwards, say that plainly rather than '
    + 'inventing a consequence',
  remembrance: 'how it is REMEMBERED, which need not be what happened. Who tells '
    + 'it, what they leave out, and what they are protecting by leaving it out. '
    + 'If this merely repeats the account it is not remembrance',
};

export const EVENT_COLUMNS = {
  description: 'description',
  account: 'account',
  consequences: 'consequences',
  remembrance: 'remembrance',
};

const said = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

export function buildEventCanonPrompt({ event, before, after, inside, partOf, fields, direction }) {
  const asked = fields.filter((f) => EVENT_FIELD_NOTES[f]);
  const written = asked.map((f) => [f, said(event[f])]).filter(([, v]) => v);

  return {
    asked,
    prompt: [
      'You are writing canon for an event in an existing universe. Match what is',
      'already recorded; do not contradict it, and do not invent other events to',
      'make this one work.',
      '',
      ...(direction?.persistentGoal?.trim() ? [
        `WHAT THIS UNIVERSE IS FOR: ${direction.persistentGoal.trim()}`, '',
      ] : []),
      ...(direction?.guardrails?.length ? [
        'YOU ARE HELD TO THESE. They are not preferences:',
        ...direction.guardrails.map((rule) => `  - ${rule}`),
        '',
      ] : []),
      `EVENT: ${event.title}`,
      `WHEN: ${event.date || '(no date recorded)'}`,
      ...(event.locationName ? [`WHERE: ${event.locationName}`] : []),
      ...(partOf ? [`PART OF: ${partOf.title} (${partOf.date})`] : []),
      '',
      // The two neighbours are what make this event this event rather than a
      // generic one of its kind. A siege that follows a broken treaty is a
      // different siege from one that follows a famine.
      `WHAT CAME BEFORE: ${before.map((e) => `${e.date}: ${e.title}`).join('; ') || '(nothing recorded)'}`,
      `WHAT FOLLOWED: ${after.map((e) => `${e.date}: ${e.title}`).join('; ') || '(nothing recorded)'}`,
      ...(inside.length ? [
        `IT BREAKS INTO: ${inside.map((e) => e.title).join('; ')}`,
        'Those are its own parts. Do not contradict them and do not retell them '
          + 'one by one; this is the event they belong to.',
      ] : []),
      '',
      'WHAT IS ALREADY WRITTEN:',
      said(event.description) || '(nothing)',
      '',
      ...(written.length ? [
        'SOME OF THESE ARE ALREADY WRITTEN. Improve them: make them specific to',
        'this event rather than to any event of its kind, and keep what is',
        'already good. If a field is already right, return it unchanged.',
        '',
        ...written.map(([f, v]) => `CURRENT ${f}: ${v}`),
        '',
      ] : []),
      'Answer with JSON and nothing else:',
      '{',
      ...asked.map((f, i) => `  "${f}": "..."${i < asked.length - 1 ? ',' : ''}   // ${EVENT_FIELD_NOTES[f]}`),
      '}',
    ].join('\n'),
  };
}

/** Keep only what was asked for, and only if it says something. */
export function checkEventAnswer(proposed, asked) {
  if (!proposed || typeof proposed !== 'object') return null;
  const kept = {};
  for (const field of asked) {
    const value = proposed[field];
    if (typeof value === 'string' && value.trim()) kept[field] = value.trim();
  }
  return Object.keys(kept).length ? kept : null;
}

/**
 * A picture of a moment rather than of a place.
 *
 * Same order as the place picture -- subject first, style trailing -- because
 * the same style string carries composition instructions and will decide the
 * frame if it leads. What differs is that an event has people in it: a battle
 * with nobody in it is a landscape, so the place prompt's "no people" is
 * exactly wrong here.
 */
export function buildEventImagePrompt({ event, where, style, note }) {
  const subject = [
    `${event.title}.`,
    said(event.description),
    said(event.account).slice(0, 320),
    where ? `It happens at ${where}.` : '',
  ].filter(Boolean).join(' ');

  const positive = [
    `A single moment from ${subject}`,
    'One moment, not a sequence: the instant this would be remembered by.',
    note?.trim() ? `Most importantly: ${note.trim()}` : '',
    style?.trim() ? `Painted in this manner: ${style.trim()}` : '',
  ].filter(Boolean).join(' ');

  return {
    positive,
    // No lettering, and nothing that turns a moment into a diagram. People are
    // wanted here, so they are absent from this list.
    negative: 'text, labels, lettering, words, captions, watermark, signature, '
      + 'map, floor plan, blueprint, diagram, comic panels, multiple panels, '
      + 'collage, blurry, low quality',
  };
}

export const EVENT_IMAGE_SIZE = { width: 1216, height: 832 };

/**
 * What an event breaks into.
 *
 * A different question from filling in a field, and it has to be asked
 * differently: this proposes RECORDS, not prose, and each one becomes a real
 * event on the timeline once somebody accepts it.
 *
 * So the prompt is told to stay inside the event it was given. The failure to
 * avoid is a model that invents the war around the siege -- parts that happen
 * before it starts or after it ends are not parts of it, they are a different
 * entry somebody did not ask for.
 */
export function buildEventPartsPrompt({ event, inside, note, direction }) {
  return {
    prompt: [
      'You are breaking one recorded event into the sequence it consists of.',
      'Every part you propose must happen INSIDE this event: not before it',
      'begins, not after it ends. A part that does neither is a separate event',
      'and is not what was asked for.',
      '',
      ...(direction?.guardrails?.length ? [
        'YOU ARE HELD TO THESE. They are not preferences:',
        ...direction.guardrails.map((rule) => `  - ${rule}`),
        '',
      ] : []),
      `EVENT: ${event.title}`,
      `WHEN: ${event.date || '(no date recorded)'}`,
      ...(event.locationName ? [`WHERE: ${event.locationName}`] : []),
      '',
      'WHAT IS RECORDED ABOUT IT:',
      said(event.description) || '(nothing)',
      ...(said(event.account) ? ['', 'THE ACCOUNT:', said(event.account)] : []),
      ...(said(event.consequences) ? ['', 'WHAT IT CHANGED:', said(event.consequences)] : []),
      '',
      ...(inside.length ? [
        `ALREADY BROKEN OUT: ${inside.map((e) => e.title).join('; ')}`,
        'Do not propose those again or anything that is one of them under',
        'another name. Propose what is missing between and around them.',
        '',
      ] : []),
      ...(note?.trim() ? [`THE AUTHOR ASKED FOR THIS SPECIFICALLY: ${note.trim()}`, ''] : []),
      'Three to six parts, in the order they happen. Answer with JSON and',
      'nothing else:',
      '{',
      '  "parts": [',
      '    {',
      '      "title": "...",       // what this moment is called',
      '      "date": "...",        // in the same form as the event\'s own date,',
      '                            // or repeat the event\'s date if it is one day',
      '      "description": "..."  // two sentences on what happens in it',
      '    }',
      '  ]',
      '}',
    ].join('\n'),
  };
}

/** A proposal is usable if it names parts that have names. */
export function checkEventParts(proposed) {
  const parts = Array.isArray(proposed?.parts) ? proposed.parts : null;
  if (!parts) return null;
  const kept = parts
    .map((p) => ({
      title: typeof p?.title === 'string' ? p.title.trim() : '',
      date: typeof p?.date === 'string' ? p.date.trim() : '',
      description: typeof p?.description === 'string' ? p.description.trim() : '',
    }))
    .filter((p) => p.title)
    // A model asked for three to six occasionally answers with twenty. The cap
    // is here rather than in the prompt because a prompt is a request and this
    // is a limit.
    .slice(0, 8);
  return kept.length ? kept : null;
}
