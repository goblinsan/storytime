import { describe, expect, it } from 'vitest';
import { buildWorkPartsPrompt, buildWorkPrompt, readWorkAnswer } from '../workAgent.js';

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
