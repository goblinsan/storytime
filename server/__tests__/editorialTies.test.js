/**
 * One fact, said once.
 *
 * Reported as "duplicates and inaccurate": Lord Malakor Vane's record listed
 * eleven relationships, four of which belonged to somebody else, and Solenne
 * Vane was shown as the child of Elyse Vane three times over.
 *
 * The database was not duplicated in the sense anybody checks for -- no two
 * rows shared a (source, type, target) triple. What it held was the same fact
 * written three ways:
 *
 *   character-elyse-vane  parent     character-solenne-vane
 *   character-elyse-vane  parent_of  character-solenne-vane
 *   character-solenne-vane child_of  character-elyse-vane
 *
 * All three read "child of Elyse Vane" on Solenne's record. Because the list
 * keys its rows by what they say and who they point at, three identical
 * readings were three identical React keys, and duplicate keys stop a list
 * reconciling: rows from the previously viewed person survived the change.
 * That is why the wrong names appeared, and why it took navigating -- a fresh
 * load looked perfect.
 */
import { describe, expect, it } from 'vitest';
import { buildTies, tieKey } from '../../src/editorial/ties.ts';

const NAMES = {
  'char-vane': 'Lord Malakor Vane',
  'character-elyse-vane': 'Elyse Vane',
  'character-solenne-vane': 'Solenne Vane',
  'char-lyra': 'Lyra of the Outer Rim',
  'character-orion-vane': 'Orion Vane',
};
const nameOf = (id) => NAMES[id] ?? id;

/** The rows this universe actually holds for these five people. */
const CANON = [
  { sourceEntityId: 'character-elyse-vane', targetEntityId: 'character-solenne-vane', relationshipType: 'parent' },
  { sourceEntityId: 'character-elyse-vane', targetEntityId: 'character-solenne-vane', relationshipType: 'parent_of' },
  { sourceEntityId: 'character-solenne-vane', targetEntityId: 'character-elyse-vane', relationshipType: 'child_of' },
  { sourceEntityId: 'char-vane', targetEntityId: 'character-solenne-vane', relationshipType: 'parent' },
  { sourceEntityId: 'char-vane', targetEntityId: 'character-elyse-vane', relationshipType: 'spouse' },
  { sourceEntityId: 'char-vane', targetEntityId: 'character-orion-vane', relationshipType: 'ancestor' },
  { sourceEntityId: 'character-solenne-vane', targetEntityId: 'char-lyra', relationshipType: 'protective_bond' },
];

describe('a relationship is listed once however many ways the canon spells it', () => {
  const ties = buildTies(CANON, nameOf);
  const reads = (id) => (ties.get(id) ?? []).map((t) => `${t.reads} ${t.otherName}`);

  it('collapses parent, parent_of and the reciprocal child_of into one line', () => {
    expect(reads('character-solenne-vane')).toEqual([
      'child of Elyse Vane',
      'child of Lord Malakor Vane',
      'protects Lyra of the Outer Rim',
    ]);
  });

  it('says it once from the other end too', () => {
    expect(reads('character-elyse-vane')).toEqual([
      'parent of Solenne Vane',
      'married to Lord Malakor Vane',
    ]);
  });

  it('leaves a record holding only its own relationships', () => {
    expect(reads('char-vane')).toEqual([
      'parent of Solenne Vane',
      'married to Elyse Vane',
      'ancestor of Orion Vane',
    ]);
  });

  it('gives every row in a list a key of its own', () => {
    // The property the rendering depends on. Without it React reuses rows
    // across people, which is the defect that was reported rather than the
    // duplication itself.
    for (const [owner, list] of ties) {
      const keys = list.map(tieKey);
      expect(new Set(keys).size, `${owner} has repeated keys: ${keys.join(', ')}`).toBe(keys.length);
    }
  });

  it('drops a row that points at its own subject', () => {
    const self = buildTies(
      [{ sourceEntityId: 'char-vane', targetEntityId: 'char-vane', relationshipType: 'sibling' }],
      nameOf,
    );
    expect(self.get('char-vane') ?? []).toEqual([]);
  });

  it('still reports a genuine second relationship between the same pair', () => {
    // Deduplication is by what the line says, not by who it involves: two
    // people can be both kin and at war, and collapsing that would lose canon.
    const both = buildTies([
      { sourceEntityId: 'a', targetEntityId: 'b', relationshipType: 'sibling' },
      { sourceEntityId: 'a', targetEntityId: 'b', relationshipType: 'feud' },
    ], nameOf);
    expect((both.get('a') ?? []).map((t) => t.reads)).toEqual(['sibling of', 'feuding with']);
  });
});
