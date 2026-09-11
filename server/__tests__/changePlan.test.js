import { describe, expect, it } from 'vitest';
import { buildChangePlanPrompt, checkChangePlan } from '../conversationAgent.js';

const record = { word: 'work', name: 'The Harrowed Veil', fields: [{ label: 'In brief', value: 'A convoy crosses.' }] };
const parts = [
  { number: 1, title: 'The Carrion Tether', summary: 'He answers.', words: 1143 },
  { number: 2, title: 'Ambush', summary: 'The belt.', words: 0 },
];

describe('planning the changes a conversation settled on', () => {
  it('shows the parts by number, and what can be changed in each', () => {
    const prompt = buildChangePlanPrompt({ kind: 'work', record, parts, thread: [{ role: 'author', text: 'Chapter 1 is too kind to him.' }] });
    expect(prompt).toMatch(/1\. The Carrion Tether: He answers\. \(1143 words written\)/);
    expect(prompt).toMatch(/For a part \(its number\): "description" \(what happens in the part\), "content" \(the part's prose\)/);
    expect(prompt).toMatch(/Author: Chapter 1 is too kind to him\./);
    expect(prompt).toMatch(/"part": 0/);
  });

  it('keeps changes to real parts, in fields they have, with something to do', () => {
    const kept = checkChangePlan({ changes: [
      { part: 0, fields: ['description'], instruction: 'Say it is his story.' },
      { part: 1, fields: ['content', 'description', 'colour'], instruction: 'Make him colder.' },
      { part: 9, fields: ['content'], instruction: 'No such part.' },
      { part: 2, fields: ['content'], instruction: '  ' },
      { part: 0, fields: ['content'], instruction: 'A story made of parts has no prose of its own to change.' },
    ] }, { kind: 'work', numbers: [1, 2] });
    expect(kept).toEqual([
      { number: 0, fields: ['description'], instruction: 'Say it is his story.' },
      { number: 1, fields: ['content', 'description'], instruction: 'Make him colder.' },
    ]);
  });

  it('lets a part revise its own prose', () => {
    const kept = checkChangePlan({ changes: [{ part: 0, fields: ['content'], instruction: 'Tighten the opening.' }] },
      { kind: 'work', numbers: [], selfFields: { description: 'what happens in it', content: 'its prose' } });
    expect(kept).toEqual([{ number: 0, fields: ['content'], instruction: 'Tighten the opening.' }]);
  });

  it('plans across an arc and its acts', () => {
    const kept = checkChangePlan({ changes: [{ act: 2, fields: ['beats'], instruction: 'Add the midpoint.' }] },
      { kind: 'arc', numbers: [1, 2] });
    expect(kept).toEqual([{ number: 2, fields: ['beats'], instruction: 'Add the midpoint.' }]);
  });
});
