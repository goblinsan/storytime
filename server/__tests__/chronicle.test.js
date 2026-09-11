import { describe, expect, it } from 'vitest';
import { inSequence, nestChronicle } from '../../src/editorial/chronicle.ts';

const ev = (id, year, before = [], parentId = null) => ({ id, year, beforeEventIds: before, parentId, title: id });

describe('the chronicle in the order things happened', () => {
  it('orders a year by what each event comes before, not by title', () => {
    const glassing = ev('Glassing', 304);
    const resurrection = ev('Resurrection', 304, ['Glassing']);
    const breach = ev('Breach', 304, ['Shuttle']);
    const shuttle = ev('Shuttle', 304, ['Resurrection']);
    const treaty = ev('Treaty', 303);
    expect(inSequence([treaty, glassing, breach, resurrection, shuttle]).map((e) => e.id))
      .toEqual(['Treaty', 'Breach', 'Shuttle', 'Resurrection', 'Glassing']);
  });

  it('keeps the order it was given where the links settle nothing, or loop', () => {
    const a = ev('A', 1, ['B']);
    const b = ev('B', 1, ['A']);
    const c = ev('C', 1);
    expect(inSequence([a, b, c]).map((e) => e.id)).toEqual(['C', 'A', 'B']);
    expect(inSequence([ev('X', 2), ev('Y', 2)]).map((e) => e.id)).toEqual(['X', 'Y']);
  });

  it('nests parts under their event, in sequence, and a part without its event at the top', () => {
    const under = nestChronicle([
      ev('Fall', 299), ev('Late', 304, [], 'Fall'), ev('Early', 304, ['Late'], 'Fall'), ev('Orphan', 5, [], 'gone'),
    ]);
    expect(under.get('Fall').map((e) => e.id)).toEqual(['Early', 'Late']);
    expect(under.get(null).map((e) => e.id)).toEqual(['Fall', 'Orphan']);
  });
});
