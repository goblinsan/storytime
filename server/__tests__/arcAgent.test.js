import { describe, expect, it } from 'vitest';
import { buildArcActPrompt, buildArcPrompt, checkArcAnswer } from '../arcAgent.js';

const arc = {
  arcNumber: 1,
  title: 'The Ghost Signal',
  description: 'Malakor shepherds a convoy.',
  throughline: 'Not a revenge story.',
  outOfScope: ['The frame-up stays hidden.'],
};
const acts = [
  { id: 'a1', actNumber: 1, title: 'The Pull', span: 'Ch1-2', summary: 'He answers.', beats: ['One.', 'Two.', 'He commits to a short detour.'] },
  { id: 'a2', actNumber: 2, title: 'The Detour', span: 'Ch3-4', summary: '', beats: ['He tries to hand off the route.', 'Found family accumulates.'] },
  { id: 'a3', actNumber: 3, title: 'The Choice', span: 'Ch5', summary: 'He leaves anyway.', beats: [] },
];
const base = { arc, acts, cast: [], works: [], direction: {} };

describe('writing one act', () => {
  const { prompt, asked } = buildArcActPrompt({ ...base, act: acts[1], fields: ['summary', 'beats'] });

  it('asks only for an act\'s fields', () => {
    expect(asked).toEqual(['summary', 'beats']);
    expect(buildArcActPrompt({ ...base, act: acts[1], fields: ['description'] }).asked).toEqual([]);
  });

  it('marks the act among the arc\'s acts', () => {
    expect(prompt).toMatch(/2\. The Detour \(Ch3-4\) {3}<-- THIS ONE/);
  });

  // Asked for a summary without them, the agent summarized the act before.
  it('shows the act its own beats when they are not what is asked for', () => {
    const summary = buildArcActPrompt({ ...base, act: acts[1], fields: ['summary'] }).prompt;
    expect(summary).toMatch(/ITS BEATS, in order[\s\S]*1\. He tries to hand off the route\.[\s\S]*2\. Found family accumulates\./);
    expect(prompt).not.toMatch(/ITS BEATS, in order/);
  });

  it('picks up after the act before without retelling it, and aims at the act after', () => {
    expect(prompt).toMatch(/THE ACT BEFORE IT ENDS WITH THESE BEATS\. This act picks up after them;\ndo not retell them:[\s\S]*He commits to a short detour\./);
    expect(prompt).toMatch(/THE ACT AFTER IT: The Choice: He leaves anyway\./);
  });

  it('holds it to what the arc keeps out', () => {
    expect(prompt).toMatch(/KEPT OUT OF IT[\s\S]*The frame-up stays hidden\./);
  });
});

describe('writing the arc itself', () => {
  it('hands it its acts, and can ask for the throughline and what is kept out', () => {
    const { prompt, asked } = buildArcPrompt({
      ...base, events: [], siblings: [], fields: ['throughline', 'outOfScope'],
    });
    expect(asked).toEqual(['throughline', 'outOfScope']);
    expect(prompt).toMatch(/ITS ACTS, in order:[\s\S]*3\. The Choice/);
    expect(prompt).toMatch(/"outOfScope": \["\.\.\.", "\.\.\."\]/);
  });

  it('keeps an act\'s beats as a list', () => {
    expect(checkArcAnswer({ beats: ['a', ' ', 'b'] }, ['beats'])).toEqual({ beats: ['a', 'b'] });
  });
});
