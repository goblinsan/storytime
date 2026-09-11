/**
 * Writing a society.
 *
 * A faction is understood by what it wants, what it believes, what it can
 * build, how it pays for itself, and who it is up against. That last one is
 * already recorded as edges in the relationship graph, so the prompt is GIVEN
 * the rivalries rather than asked to invent them: a model told to write the
 * history of a cartel that is in three active skirmishes writes a different
 * history from one told only its name.
 */
import { readEdge } from './tieWords.js';

export const SOCIETY_CANON_REQUEST = 'faction_canon_request';

export const SOCIETY_FIELD_NOTES = {
  description: 'what this group is, in two or three sentences',
  history: 'how it came to be what it is now. Where it started, what changed it, '
    + 'and what it lost on the way',
  goals: 'what it is trying to achieve, as a list of short phrases. Ends rather '
    + 'than methods',
  doctrine: 'what it believes and what it tells its own people. Its creed, '
    + 'whether that is a faith, an ideology or a business principle held with '
    + 'the fervour of one',
  technology: 'what it can build or use that others cannot, and what that lets '
    + 'it do. This is the difference between a rival and a threat',
  economy: 'how it pays for itself: what it sells, controls or extracts, and who '
    + 'depends on it',
  structure: 'who decides, and how somebody comes to be the one deciding',
};

export const SOCIETY_COLUMNS = {
  description: 'description',
  history: 'history',
  goals: 'goals',
  doctrine: 'doctrine',
  technology: 'technology',
  economy: 'economic_leverage',
  structure: 'corporate_structure',
};

/** Written as a JSON array rather than as a paragraph. */
export const SOCIETY_LIST_FIELDS = new Set(['goals']);

const said = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

export function buildSocietyPrompt({ faction, ties, fields, direction, brief }) {
  const asked = fields.filter((f) => SOCIETY_FIELD_NOTES[f]);
  const current = (f) => (SOCIETY_LIST_FIELDS.has(f)
    ? (Array.isArray(faction[f]) ? faction[f].join('; ') : said(faction[f]))
    : said(faction[f]));
  const written = asked.map((f) => [f, current(f)]).filter(([, v]) => v);

  return {
    asked,
    prompt: [
      'You are writing canon for a group in an existing universe. Match what is',
      'already recorded; do not contradict it, and do not invent other groups to',
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
      // What the author asked for when they created this. It is not a
      // revision note -- there is nothing to revise yet -- it is the reason
      // the record exists, and it outranks the model's own instincts about
      // what a thing of this kind is usually like.
      ...(brief?.trim() ? [
        'WHAT THE AUTHOR ASKED FOR WHEN THEY CREATED THIS. Hold to it:',
        brief.trim(),
        '',
      ] : []),
      `GROUP: ${faction.name}`,
      '',
      'WHAT IS ALREADY WRITTEN:',
      said(faction.description) || '(nothing)',
      '',
      // The rivalries are facts, not suggestions, and they are what makes this
      // group this group. A history written without them is a history of any
      // cartel.
      ...(ties.length ? [
        'WHO IT STANDS WITH AND AGAINST. These are recorded and you are held to them:',
        // Read from tieWords, the same table the surface renders from, so the
        // group's own history cannot describe a quarrel the page calls an
        // alliance. Written without a verb -- "name: in cold war with other"
        // -- because "protects" and "in open conflict with" do not both follow
        // an "is".
        ...ties.map((t) => `  - ${faction.name}: ${readEdge(t.kind, t.forward)} ${t.otherName}`),
        '',
      ] : ['NOTHING IS RECORDED ABOUT WHO IT STANDS WITH OR AGAINST.', '']),
      ...(written.length ? [
        'SOME OF THESE ARE ALREADY WRITTEN. Improve them: make them specific to',
        'this group rather than to any group of its kind, and keep what is',
        'already good. If a field is already right, return it unchanged.',
        '',
        ...written.map(([f, v]) => `CURRENT ${f}: ${v}`),
        '',
      ] : []),
      'Answer with JSON and nothing else:',
      '{',
      ...asked.map((f, i) => {
        const example = SOCIETY_LIST_FIELDS.has(f) ? '["...", "..."]' : '"..."';
        return `  "${f}": ${example}${i < asked.length - 1 ? ',' : ''}   // ${SOCIETY_FIELD_NOTES[f]}`;
      }),
      '}',
    ].join('\n'),
  };
}

/** Keep only what was asked for, and only if it says something. */
export function checkSocietyAnswer(proposed, asked) {
  if (!proposed || typeof proposed !== 'object') return null;
  const kept = {};
  for (const field of asked) {
    const value = proposed[field];
    if (SOCIETY_LIST_FIELDS.has(field)) {
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

export const SOCIETY_IMAGE_REQUEST = 'faction_image_request';

/**
 * Picturing a group.
 *
 * A faction is not a person and not a place, and asking for "a picture of the
 * Vander-Thorne Cartel" gets a crowd of strangers standing in a room. What can
 * actually be drawn is the mark a group puts on things -- the crest, banner or
 * sigil somebody stamps on a crate -- so that is what is asked for, and the
 * doctrine is handed over as the thing the mark has to mean.
 *
 * The style is applied to the emblem's rendering, not to its subject, and
 * lettering is refused outright: a generated banner with invented words on it
 * is a picture nobody can use in a universe that has its own languages.
 */
export function buildSocietyImagePrompt({ faction, style, note }) {
  const meaning = [
    said(faction.doctrine).slice(0, 240),
    Array.isArray(faction.goals) && faction.goals.length
      ? `It stands for: ${faction.goals.slice(0, 3).join(', ')}.` : '',
  ].filter(Boolean).join(' ');

  const positive = [
    `The emblem of ${faction.name}: a single heraldic crest, centered, filling the frame.`,
    meaning ? `What it has to mean: ${meaning}` : '',
    'One symbol on a plain ground, as it would be stamped on a hull or hung in a hall.',
    note?.trim() ? `Most importantly: ${note.trim()}` : '',
    style?.trim() ? `Rendered in this manner: ${style.trim()}` : '',
  ].filter(Boolean).join(' ');

  return {
    positive,
    negative: 'text, letters, lettering, words, numbers, captions, watermark, '
      + 'signature, people, faces, crowd, landscape, several emblems, sheet of '
      + 'variations, collage, blurry, low quality',
  };
}

/** Square, because a crest is. */
export const SOCIETY_IMAGE_SIZE = { width: 1024, height: 1024 };
