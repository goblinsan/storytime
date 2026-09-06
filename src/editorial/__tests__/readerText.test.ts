import { describe, expect, it } from 'vitest';
import { passageAnchor, readingMinutes, toParagraphs } from '../readerText';

const PROSE = `Inside the Harrowed Veil, distance became unreliable.

The Iron Cinnabar might have been a kilometer ahead or a hundred.


Malakor said nothing.
`;

describe('paragraph segmentation', () => {
  it('splits on blank lines and drops the empties', () => {
    const paragraphs = toParagraphs(PROSE);
    expect(paragraphs).toHaveLength(3);
    expect(paragraphs[0].text).toBe('Inside the Harrowed Veil, distance became unreliable.');
    expect(paragraphs[2].text).toBe('Malakor said nothing.');
  });

  it('numbers paragraphs consecutively, so an anchor is stable', () => {
    expect(toParagraphs(PROSE).map((p) => p.index)).toEqual([0, 1, 2]);
  });

  it('gives offsets that address the original text', () => {
    // The locator in the passage-revision contract is a character range, so an
    // offset that does not point at its own text makes a proposal unappliable.
    for (const paragraph of toParagraphs(PROSE)) {
      expect(PROSE.slice(paragraph.startOffset, paragraph.endOffset).trim())
        .toBe(paragraph.text);
    }
  });

  it('handles runs of more than one blank line without emitting empty paragraphs', () => {
    expect(toParagraphs('one\n\n\n\ntwo').map((p) => p.text)).toEqual(['one', 'two']);
  });

  it('returns nothing for empty or whitespace-only prose', () => {
    expect(toParagraphs('')).toEqual([]);
    expect(toParagraphs('   \n\n  ')).toEqual([]);
  });

  it('keeps offsets correct when a paragraph repeats verbatim', () => {
    const repeated = 'same\n\nsame\n\ndifferent';
    const paragraphs = toParagraphs(repeated);
    expect(paragraphs.map((p) => p.startOffset)).toEqual([0, 6, 12]);
  });
});

describe('reading time', () => {
  it('never claims zero minutes', () => {
    expect(readingMinutes('a few words')).toBe(1);
    expect(readingMinutes('')).toBe(1);
  });

  it('scales with length', () => {
    const long = Array.from({ length: 2200 }, () => 'word').join(' ');
    expect(readingMinutes(long)).toBe(10);
  });
});

describe('passage anchors', () => {
  it('is stable and url-safe', () => {
    expect(passageAnchor(0)).toBe('p0');
    expect(passageAnchor(41)).toBe('p41');
  });
});
