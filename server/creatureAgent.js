/**
 * Writing a creature, and drawing one.
 *
 * A creature is not a character with claws. A person is understood by what
 * they want and what they have done; a creature is understood by what it eats,
 * what eats it, and what happens to the place when it is gone. Handed the
 * character prompt, a model writes a villain with fur.
 *
 * WHERE IT IS FOUND IS GIVEN, NOT INVENTED
 * The range is recorded as real edges to real places, so the prompt is handed
 * them. A model told to write the niche of a thing living in the Bio-Coolant
 * Necro-Lab and the Cryo-Sepulcher writes a different niche from one told only
 * the word "Rift-Haunting Entity" -- and, more importantly, it does not invent
 * a marsh this universe does not have.
 */
import { readEdge } from './tieWords.js';

export const CREATURE_CANON_REQUEST = 'bestiary_canon_request';
export const CREATURE_IMAGE_REQUEST = 'bestiary_image_request';

export const CREATURE_FIELD_NOTES = {
  description: 'what it is and what meeting one is like, in two or three sentences',
  ecologicalNiche: 'what it eats, what eats it, and what it does to the place it '
    + 'lives in. If it were gone tomorrow, what changes',
  inUniverseBackstory: 'where it came from. Whether it was always here, arrived, '
    + 'or was made -- and if it was made, by whom and for what',
  motivation: 'what it is doing when nobody is hunting it. Its own business, in '
    + 'its own terms, which is rarely hostility',
  tactics: 'how it behaves when it meets somebody, as a list of short phrases. '
    + 'What it does first, what it does when hurt, and what makes it leave',
  notes: 'what somebody who has survived one would tell the next person. '
    + 'Practical, specific, and not a repeat of the description',
};

export const CREATURE_COLUMNS = {
  description: 'description',
  ecologicalNiche: 'ecological_niche',
  inUniverseBackstory: 'in_universe_backstory',
  motivation: 'motivation',
  tactics: 'tactics',
  notes: 'notes',
};

/** Written as a JSON array rather than as a paragraph. */
export const CREATURE_LIST_FIELDS = new Set(['tactics']);

const said = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

export function buildCreaturePrompt({ creature, range, ties, fields, direction, brief }) {
  const asked = fields.filter((f) => CREATURE_FIELD_NOTES[f]);
  const current = (f) => (CREATURE_LIST_FIELDS.has(f)
    ? (Array.isArray(creature[f]) ? creature[f].join('; ') : said(creature[f]))
    : said(creature[f]));
  const written = asked.map((f) => [f, current(f)]).filter(([, v]) => v);

  return {
    asked,
    prompt: [
      'You are writing canon for a creature in an existing universe. Match what',
      'is already recorded; do not contradict it, and do not invent places,',
      'species or people to make this one work.',
      '',
      ...(direction?.persistentGoal?.trim() ? [
        `WHAT THIS UNIVERSE IS FOR: ${direction.persistentGoal.trim()}`, '',
      ] : []),
      ...(direction?.guardrails?.length ? [
        'YOU ARE HELD TO THESE. They are not preferences:',
        ...direction.guardrails.map((rule) => `  - ${rule}`),
        '',
      ] : []),
      // What the author asked for when they created this. It is not a
      // revision note -- there is nothing to revise yet -- it is the reason
      // the record exists, and it outranks the model's own instincts about
      // what a thing of this kind is usually like.
      ...(brief?.trim() ? [
        'WHAT THE AUTHOR ASKED FOR WHEN THEY CREATED THIS. Hold to it:',
        brief.trim(),
        '',
      ] : []),
      `CREATURE: ${creature.name}`,
      ...(said(creature.category) ? [`KIND: ${creature.category}`] : []),
      ...(said(creature.status) ? [`STATUS: ${creature.status}`] : []),
      '',
      'WHAT IS ALREADY WRITTEN:',
      said(creature.description) || '(nothing)',
      '',
      // The range is the difference between a niche and a paragraph about
      // niches. It is also the guardrail: these are the only places it lives.
      ...(range.length ? [
        'WHERE IT IS FOUND. These are recorded and are the ONLY places it lives:',
        ...range.map((r) => `  - ${r.locationName}${r.regionType ? ` (${r.regionType.replace(/_/g, ' ')})` : ''}`
          + `${said(r.notes) ? ` -- ${said(r.notes)}` : ''}`),
        'Write about those places. Do not give it a habitat this universe has',
        'not recorded.',
        '',
      ] : [
        'WHERE IT IS FOUND: nothing recorded. Write what would be true anywhere',
        'in this universe rather than inventing a region for it.',
        '',
      ]),
      ...(ties?.length ? [
        'WHAT IT IS RECORDED AS HAVING TO DO WITH:',
        ...ties.map((t) => `  - ${creature.name}: ${readEdge(t.kind, t.forward)} ${t.otherName}`),
        '',
      ] : []),
      ...(written.length ? [
        'SOME OF THESE ARE ALREADY WRITTEN. Improve them: make them specific to',
        'this creature rather than to any creature of its kind, and keep what is',
        'already good. If a field is already right, return it unchanged.',
        '',
        ...written.map(([f, v]) => `CURRENT ${f}: ${v}`),
        '',
      ] : []),
      'Answer with JSON and nothing else:',
      '{',
      ...asked.map((f, i) => {
        const example = CREATURE_LIST_FIELDS.has(f) ? '["...", "..."]' : '"..."';
        return `  "${f}": ${example}${i < asked.length - 1 ? ',' : ''}   // ${CREATURE_FIELD_NOTES[f]}`;
      }),
      '}',
    ].join('\n'),
  };
}

/** Keep only what was asked for, and only if it says something. */
export function checkCreatureAnswer(proposed, asked) {
  if (!proposed || typeof proposed !== 'object') return null;
  const kept = {};
  for (const field of asked) {
    const value = proposed[field];
    if (CREATURE_LIST_FIELDS.has(field)) {
      const list = Array.isArray(value)
        ? value.map((v) => String(v).trim()).filter(Boolean)
        : [];
      if (list.length) kept[field] = list;
    } else if (typeof value === 'string' && value.trim()) {
      kept[field] = value.trim();
    }
  }
  return Object.keys(kept).length ? kept : null;
}

/**
 * Drawing a creature.
 *
 * One animal, whole, in the place it lives -- not a bestiary plate with three
 * views and a scale bar, and not an action scene with somebody fighting it.
 * The range leads the setting because a phantom on a grey background is a
 * phantom from any universe.
 */
export function buildCreatureImagePrompt({ creature, range, style, note }) {
  const subject = [
    `${creature.name}.`,
    said(creature.description).slice(0, 300),
  ].filter(Boolean).join(' ');
  const where = range.length ? range[0].locationName : '';

  const positive = [
    `A single ${subject}`,
    'One creature, whole and clearly visible, filling the frame.',
    where ? `Seen where it lives: ${where}.` : '',
    note?.trim() ? `Most importantly: ${note.trim()}` : '',
    style?.trim() ? `Painted in this manner: ${style.trim()}` : '',
  ].filter(Boolean).join(' ');

  return {
    positive,
    // No plates, no sheets, no people. A creature drawn beside a human for
    // scale is a picture of a human, and the reference sheet is the failure
    // mode every model reaches for when told "creature".
    negative: 'text, labels, lettering, words, captions, watermark, signature, '
      + 'scale bar, diagram, anatomy plate, reference sheet, multiple views, '
      + 'turnaround, several creatures, people, human figure, collage, '
      + 'blurry, low quality',
  };
}

export const CREATURE_IMAGE_SIZE = { width: 1216, height: 832 };
