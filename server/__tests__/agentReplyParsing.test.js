/**
 * Reading an agent's reply, when the reply has shape.
 *
 * This took the LAST `{` and the last `}`, which quietly assumes every answer
 * is a flat object. Both answers that existed were flat -- fields to fill,
 * image URLs -- so it worked. The first answer with an object inside it (a list
 * of findings) sliced from the last CHILD's brace to the end of the document
 * and threw, on a reply that was perfectly good JSON.
 *
 * The lesson is the shape of the bug, not the case: a parser tuned to the data
 * that happened to exist. So the cases below are the ones a model actually
 * produces -- fences, a sentence first, braces inside strings, escaped quotes.
 */
import { describe, expect, it } from 'vitest';
import { extractJson } from '../canonAgent.js';

describe('finding the JSON in a reply', () => {
  it('reads a flat object', () => {
    expect(extractJson('{"appearance":"tall","description":"quiet"}'))
      .toEqual({ appearance: 'tall', description: 'quiet' });
  });

  it('reads an object with objects inside it', () => {
    // The case that broke: `lastIndexOf('{')` lands on the last finding.
    const reply = '{"state":"thin","findings":[{"title":"a","detail":"b"},{"title":"c","detail":"d"}]}';
    expect(extractJson(reply).findings).toHaveLength(2);
    expect(extractJson(reply).state).toBe('thin');
  });

  it('ignores a code fence', () => {
    expect(extractJson('```json\n{"findings":[{"title":"x"}]}\n```').findings[0].title).toBe('x');
  });

  it('ignores a sentence before the JSON', () => {
    expect(extractJson('Here is the answer.\n{"a":{"b":1}}')).toEqual({ a: { b: 1 } });
  });

  it('steps over braces that are only prose', () => {
    // One failed parse, then the real object -- rather than giving up.
    expect(extractJson('I considered {this} carefully.\n{"a":{"b":1}}')).toEqual({ a: { b: 1 } });
  });

  it('does not end the object on a brace inside a string', () => {
    expect(extractJson('{"detail":"use { and } freely","title":"t"}').detail)
      .toBe('use { and } freely');
  });

  it('does not end a string on an escaped quote', () => {
    expect(extractJson('{"detail":"they said \\"no\\" and left"}').detail)
      .toBe('they said "no" and left');
  });

  it('says so when there is no object at all', () => {
    expect(() => extractJson('no json here')).toThrow(/no JSON object/);
  });
});
