/**
 * Asking what belongs somewhere on a map.
 *
 * The interesting half of a map is the empty part. Somebody looking at a coast
 * sees where a port would sit and where a battle would have been fought, and
 * the point of clicking that spot is to turn the noticing into a record before
 * it is lost.
 *
 * WHAT COMES BACK IS A PROPOSAL, NOT A PLACE
 * A generated coastline is a backdrop; a generated *town* would be canon, and
 * canon that nobody approved is the failure this whole surface is built to
 * avoid. So this proposes a name and a description and stops. The place is
 * created by the person accepting it, at the point they clicked.
 */
export const PLACE_REQUEST = 'location_proposal_request';

/**
 * What might be here.
 *
 * The prompt is given the surroundings rather than the whole universe: what
 * contains this spot, what already sits inside it, and where on the drawing the
 * click landed. That last one matters more than it looks -- a point near the
 * edge of a coastal region is a very different proposition from one at its
 * centre, and a model with no position will write the same generic settlement
 * either way.
 */
export function buildPlacePrompt({ parent, siblings, at, note, direction }) {
  const near = (v) => (v < 0.33 ? 'near the top' : v > 0.66 ? 'near the bottom' : 'mid');
  const side = (v) => (v < 0.33 ? 'western' : v > 0.66 ? 'eastern' : 'central');
  const where = `${near(at.y)} of the map, on the ${side(at.x)} side`;

  return {
    prompt: [
      'You are proposing one new place for an existing universe. It must fit',
      'what is already recorded and must not contradict it.',
      '',
      ...(direction?.persistentGoal?.trim() ? [
        `WHAT THIS UNIVERSE IS FOR: ${direction.persistentGoal.trim()}`, '',
      ] : []),
      ...(direction?.guardrails?.length ? [
        'YOU ARE HELD TO THESE. They are not preferences:',
        ...direction.guardrails.map((rule) => `  - ${rule}`),
        '',
      ] : []),
      `THIS SITS INSIDE: ${parent.name}`,
      `WHICH IS: ${String(parent.description ?? '(nothing recorded)').replace(/\s+/g, ' ')}`,
      ...(parent.biome ? [`ITS SETTING: ${parent.biome}`] : []),
      ...(parent.ecology ? [`WHAT LIVES THERE: ${parent.ecology}`] : []),
      ...(parent.history ? [`WHAT HAPPENED THERE: ${parent.history}`] : []),
      '',
      `ALREADY INSIDE IT: ${siblings.slice(0, 20).map((s) => s.name).join(', ') || '(nothing yet)'}`,
      'Do not propose any of those again, and do not propose a near-duplicate of one.',
      '',
      `WHERE ON THE MAP: ${where}.`,
      ...(note?.trim() ? [
        '',
        'THE AUTHOR ASKED FOR THIS SPECIFICALLY. Follow it rather than your own',
        `idea of what fits: ${note.trim()}`,
      ] : [
        '',
        'The author has not said what they want here, so propose what the',
        'surrounding canon implies belongs at this spot -- something the places',
        'already recorded would need, or would have caused.',
      ]),
      '',
      'Answer with JSON and nothing else:',
      '{',
      '  "name": "...",         // what it is called. No article, no epithet.',
      '  "description": "...",  // two or three sentences on what it is now',
      '  "history": "...",      // what happened here. May be one sentence.',
      '  "why": "..."           // why this belongs here, in one sentence, for',
      '                         // the author to judge. Not part of the record.',
      '}',
    ].join('\n'),
  };
}

/**
 * A proposal is only usable if it names something.
 *
 * Returns null rather than throwing, because the caller is a background answer
 * path and an unusable answer is an outcome to drop, not an error to raise.
 */
export function checkPlace(proposed) {
  if (!proposed || typeof proposed !== 'object') return null;
  const name = typeof proposed.name === 'string' ? proposed.name.trim() : '';
  if (!name) return null;
  const str = (v) => (typeof v === 'string' ? v.trim() : '');
  return {
    name,
    description: str(proposed.description),
    history: str(proposed.history),
    why: str(proposed.why),
  };
}
