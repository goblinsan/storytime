import { describe, expect, it } from 'vitest';
import { isLabeled, splitArcDetails } from '../arcActs.js';

// The Ghost Signal's list as it was, abbreviated: every kind of line in it.
const GHOST_SIGNAL = [
  'THROUGHLINE: not a revenge story. The engine is Lyra\'s resemblance to Solenne.',
  'OUT OF SCOPE FOR THIS STORY: the Vander-Thorne / Charnel Compact frame-up stays hidden.',
  'ACT 1 -- Reluctant Entanglement (Ch1-2, written): Malakor mid-hunt, harvesting a derelict.',
  'The distress call is an intrusion, not a call to heroism.',
  'DONE (2026-09-03): Ch1-2 revised toward reluctance before Ch3-5 were drafted.',
  'ACT 2 -- The Detour Deepens (Ch3-4, written): he tries to extract himself early.',
  'Found-family beats accumulate.',
  'ACT 3 -- Arrival and the Choice (Ch5, written): the convoy reaches Nexus Prime.',
  'Ending beat: a quiet, bittersweet departure.',
];

describe('splitting an arc written as one list', () => {
  const split = splitArcDetails(GHOST_SIGNAL);

  it('makes each act heading an act, with its title and where it falls', () => {
    expect(split.acts.map((a) => [a.title, a.span])).toEqual([
      ['Reluctant Entanglement', 'Ch1-2, written'],
      ['The Detour Deepens', 'Ch3-4, written'],
      ['Arrival and the Choice', 'Ch5, written'],
    ]);
  });

  it('keeps the text after a heading\'s colon as the act\'s first beat', () => {
    expect(split.acts[0].beats).toEqual([
      'Malakor mid-hunt, harvesting a derelict.',
      'The distress call is an intrusion, not a call to heroism.',
    ]);
    expect(split.acts[2].beats).toEqual([
      'the convoy reaches Nexus Prime.',
      'Ending beat: a quiet, bittersweet departure.',
    ]);
  });

  it('gives what was never a beat its own place, without its label', () => {
    expect(split.throughline).toBe('not a revenge story. The engine is Lyra\'s resemblance to Solenne.');
    expect(split.outOfScope).toEqual(['the Vander-Thorne / Charnel Compact frame-up stays hidden.']);
    expect(split.notes).toEqual(['DONE (2026-09-03): Ch1-2 revised toward reluctance before Ch3-5 were drafted.']);
  });

  it('drops no line', () => {
    const placed = split.acts.reduce((n, a) => n + a.beats.length, 0) + split.acts.length
      - split.acts.filter((a) => a.beats.length).length // a heading's first beat shares its line
      + (split.throughline ? 1 : 0) + split.outOfScope.length + split.notes.length + split.loose.length;
    expect(placed).toBe(GHOST_SIGNAL.length);
  });

  it('keeps beats before any act as beats no act has taken', () => {
    expect(splitArcDetails(['An opening beat.', 'ACT I: The Turn']).loose).toEqual(['An opening beat.']);
  });

  it('reads a heading with no span and no first beat', () => {
    expect(splitArcDetails(['ACT II: The Turn']).acts).toEqual([{ title: 'The Turn', span: '', beats: [] }]);
  });
});

describe('what counts as a label', () => {
  it('leaves a plain list of beats alone', () => {
    expect(isLabeled(['She leaves.', 'He follows.'])).toBe(false);
  });

  // Case-blind matching would have turned these into bookkeeping and acts.
  it('does not mistake a beat that begins like a label for one', () => {
    expect(isLabeled(['Note how she hesitates at the hatch.', 'Act two opens on the burn.'])).toBe(false);
  });
});
