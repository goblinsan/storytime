import { describe, expect, it } from 'vitest';
import { diffProse, diffWords } from '../../src/editorial/textDiff.ts';

describe('what a revision changed', () => {
  const before = ['He answered the call.', 'The ambush was clean.', 'He left.'].join('\n\n');

  it('counts the untouched paragraphs and marks the words that changed', () => {
    const after = ['He answered the call.', 'The ambush cost him an arm.', 'He left.'].join('\n\n');
    const d = diffProse(before, after);
    expect([d.changed, d.added, d.removed, d.total]).toEqual([1, 0, 0, 3]);
    expect(d.blocks.map((b) => b.kind)).toEqual(['same', 'changed', 'same']);
    expect(d.blocks[1].words).toEqual([
      { kind: 'same', text: 'The ambush ' },
      { kind: 'removed', text: 'was clean.' },
      { kind: 'added', text: 'cost him an arm.' },
    ]);
  });

  it('shows whole paragraphs added and removed as such', () => {
    const d = diffProse(before, ['He answered the call.', 'He left.', 'Lyra watched him go.'].join('\n\n'));
    expect([d.changed, d.added, d.removed]).toEqual([0, 1, 1]);
    expect(d.blocks).toEqual([
      { kind: 'same', count: 1 },
      { kind: 'removed', text: 'The ambush was clean.' },
      { kind: 'same', count: 1 },
      { kind: 'added', text: 'Lyra watched him go.' },
    ]);
  });

  it('says nothing changed when nothing did', () => {
    const d = diffProse(before, before);
    expect([d.changed, d.added, d.removed]).toEqual([0, 0, 0]);
    expect(d.blocks).toEqual([{ kind: 'same', count: 3 }]);
  });

  it('keeps the spaces between words, so a changed paragraph reads as one', () => {
    expect(diffWords('a b c', 'a x c')).toEqual([
      { kind: 'same', text: 'a ' }, { kind: 'removed', text: 'b ' }, { kind: 'added', text: 'x ' }, { kind: 'same', text: 'c' },
    ]);
  });
});
