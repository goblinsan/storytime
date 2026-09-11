import { describe, expect, it } from 'vitest';
import {
  buildWorkPartsPrompt, buildWorkPrompt, checkWorkPartsAnswer, readWorkAnswer,
} from '../workAgent.js';

const base = {
  work: { title: 'The Outcast', description: 'Mara leaves the yard.', content: '', partNumber: 1 },
  chain: [{ title: 'Void Sunder', description: 'A convoy crossing.' }],
  before: null, after: null, children: [], cast: [], refs: [], arcs: [], direction: {},
};
const chapter = Array.from({ length: 240 }, (_, i) => `word${i}`).join(' ');

describe('composing a part', () => {
  it('asks for prose as prose, not inside JSON', () => {
    const { prompt, asked } = buildWorkPrompt({ ...base, fields: ['content'] });
    expect(asked).toEqual(['content']);
    expect(prompt).toMatch(/Answer with the prose itself/);
    expect(prompt).not.toMatch(/Answer with JSON/);
  });

  it('still asks for JSON when the answer is a set of fields', () => {
    const { prompt } = buildWorkPrompt({ ...base, fields: ['description'] });
    expect(prompt).toMatch(/Answer with JSON/);
  });

  // The reply that was thrown away twice: a chapter, with no object in it.
  it('reads a chapter written as prose', () => {
    expect(readWorkAnswer(`# Chapter One\n\n${chapter}`, ['content'])).toEqual({ content: chapter });
  });

  it('reads a chapter that came back as JSON anyway', () => {
    expect(readWorkAnswer(JSON.stringify({ content: chapter }), ['content'])).toEqual({ content: chapter });
  });

  it('does not take an apology for a chapter', () => {
    expect(readWorkAnswer('I need more context before I can write this part.', ['content'])).toBeNull();
  });

  it('does not take prose for fields that were asked for as JSON', () => {
    expect(readWorkAnswer(chapter, ['description'])).toBeNull();
  });
});

describe('deciding what a work is made of', () => {
  it('hands a sent-back proposal to the agent with what was said about it', () => {
    const { prompt } = buildWorkPartsPrompt({
      ...base,
      previous: { parts: [{ title: 'The Yard', description: 'She leaves.' }] },
      note: 'Too few parts; the crossing needs its own chapter.',
    });
    expect(prompt).toMatch(/YOU ALREADY PROPOSED THESE/);
    expect(prompt).toMatch(/1\. The Yard: She leaves\./);
    expect(prompt).toMatch(/WHAT THEY SAID: Too few parts/);
  });

  it('treats a note with nothing before it as the ask', () => {
    const { prompt } = buildWorkPartsPrompt({ ...base, note: 'Five chapters.' });
    expect(prompt).toMatch(/WHAT THEY ASKED FOR: Five chapters\./);
    expect(prompt).not.toMatch(/YOU ALREADY PROPOSED/);
  });
});

describe('a work that tells an arc', () => {
  const arc = {
    title: 'The Ghost Signal', description: 'Malakor shepherds a convoy.', throughline: 'Not a revenge story.',
    outOfScope: ['The frame-up stays hidden.'],
    acts: [
      { id: 'a1', actNumber: 1, title: 'The Pull', summary: 'He answers.', beats: ['The distress call.', 'The ambush.'] },
      { id: 'a2', actNumber: 2, title: 'The Detour', summary: 'He tries to leave.', beats: ['The hand-off fails.'] },
    ],
  };

  it('is handed the arc in full, instead of every arc in the universe', () => {
    const { prompt } = buildWorkPrompt({ ...base, arcs: [{ title: 'Another arc', description: 'Elsewhere.' }], arc, fields: ['description'] });
    expect(prompt).toMatch(/THIS WORK TELLS THE ARC "The Ghost Signal"\. Hold to it:/);
    expect(prompt).toMatch(/KEPT OUT OF IT:\n  - The frame-up stays hidden\./);
    expect(prompt).toMatch(/1\. The Pull: He answers\.\n {7}- The distress call\./);
    expect(prompt).not.toMatch(/Another arc/);
  });

  it('tells a part which act it carries, beats and all', () => {
    const { prompt } = buildWorkPrompt({ ...base, arc, act: arc.acts[1], fields: ['content'] });
    expect(prompt).toMatch(/THIS PART TELLS ACT 2: The Detour\nWHAT THE ACT DOES: He tries to leave\.\nITS BEATS, which this part carries:\n  - The hand-off fails\./);
  });

  it('proposes parts that say which act each tells', () => {
    const { prompt } = buildWorkPartsPrompt({ ...base, arc });
    expect(prompt).toMatch(/say which act each part tells/);
    expect(prompt).toMatch(/"act": 1/);
    expect(checkWorkPartsAnswer({ parts: [{ title: 'Ch 1', description: 'x', act: 2 }, { title: 'Ch 2', act: 'soon' }] }))
      .toEqual({ parts: [{ title: 'Ch 1', description: 'x', act: 2 }, { title: 'Ch 2', description: '' }] });
  });
});
