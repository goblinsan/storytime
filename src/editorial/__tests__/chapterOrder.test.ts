import { describe, expect, it } from 'vitest';
import { chapterNumber, orderChapters } from '../chapterOrder';

const work = (title: string, createdAt?: string) => ({ title, createdAt });

describe('chapter numbering', () => {
  it('reads the number out of a chapter title', () => {
    expect(chapterNumber('Chapter 5: The Frequency and the Farewell')).toBe(5);
    expect(chapterNumber('Part 2')).toBe(2);
    expect(chapterNumber('Book 11 — After')).toBe(11);
  });

  it('is null for a title that carries no number', () => {
    expect(chapterNumber("The Outcast's Slipway")).toBeNull();
    expect(chapterNumber('')).toBeNull();
  });
});

describe('chapter ordering', () => {
  it('puts chapter 10 after chapter 2, which a string sort does not', () => {
    const ordered = orderChapters([
      work('Chapter 10: Last'), work('Chapter 2: Second'), work('Chapter 1: First'),
    ]);
    expect(ordered.map((w) => w.title)).toEqual([
      'Chapter 1: First', 'Chapter 2: Second', 'Chapter 10: Last',
    ]);
  });

  it('keeps numbered chapters ahead of unnumbered pieces', () => {
    const ordered = orderChapters([
      work('An Interlude'), work('Chapter 2: Second'), work('Chapter 1: First'),
    ]);
    expect(ordered.map((w) => w.title)).toEqual([
      'Chapter 1: First', 'Chapter 2: Second', 'An Interlude',
    ]);
  });

  it('falls back to creation order for unnumbered pieces', () => {
    const ordered = orderChapters([
      work('Later', '2026-02-01'), work('Earlier', '2026-01-01'),
    ]);
    expect(ordered.map((w) => w.title)).toEqual(['Earlier', 'Later']);
  });

  it('is stable for two chapters sharing a number', () => {
    const ordered = orderChapters([
      work('Chapter 1: B', '2026-02-01'), work('Chapter 1: A', '2026-01-01'),
    ]);
    expect(ordered.map((w) => w.title)).toEqual(['Chapter 1: A', 'Chapter 1: B']);
  });

  it('does not mutate its input', () => {
    const input = [work('Chapter 2'), work('Chapter 1')];
    orderChapters(input);
    expect(input.map((w) => w.title)).toEqual(['Chapter 2', 'Chapter 1']);
  });
});
