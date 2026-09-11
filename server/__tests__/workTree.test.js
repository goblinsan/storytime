import { describe, expect, it } from 'vitest';
import { inOrder, readingOrder } from '../../src/editorial/workTree.ts';

const node = (id, parentId, partNumber, words, title = id) => ({
  id, title, type: 'story', status: '', description: '', parentId, partNumber, words,
});
// A story in four chapters (the third unwritten), and a work that stands alone.
const works = [
  node('veil', null, null, 0, 'The Harrowed Veil'),
  node('ch1', 'veil', 1, 1100),
  node('ch2', 'veil', 2, 1400),
  node('ch3', 'veil', 3, 0),
  node('ch4', 'veil', 4, 1500),
  node('alone', null, null, 900),
];

describe('reading a story in order', () => {
  it('turns from one chapter to the next, and back', () => {
    const order = readingOrder(works, 'ch1');
    expect(order.story.id).toBe('veil');
    expect(order.pages.map((p) => p.id)).toEqual(['ch1', 'ch2', 'ch3', 'ch4']);
    expect([order.previous, order.next?.id]).toEqual([null, 'ch2']);
    expect(readingOrder(works, 'ch2').previous.id).toBe('ch1');
  });

  // An unwritten chapter is in the contents but is not a page to turn to.
  it('steps over a chapter that is not written yet', () => {
    expect(readingOrder(works, 'ch2').next.id).toBe('ch4');
    expect(readingOrder(works, 'ch4').previous.id).toBe('ch2');
  });

  it('ends at the last chapter', () => {
    expect(readingOrder(works, 'ch4').next).toBeNull();
  });

  it('reads a work that stands alone as its own single page', () => {
    const order = readingOrder(works, 'alone');
    expect(order.pages.map((p) => p.id)).toEqual(['alone']);
    expect([order.previous, order.next]).toEqual([null, null]);
  });

  it('does not treat the story itself as a page when it is made of parts', () => {
    expect(readingOrder(works, 'veil').at).toBe(-1);
  });

  it('keeps parts under their work, in part order', () => {
    expect(inOrder(works).map((w) => `${w.depth}:${w.id}`))
      .toEqual(['0:veil', '1:ch1', '1:ch2', '1:ch3', '1:ch4', '0:alone']);
  });
});
