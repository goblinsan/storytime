import { describe, expect, it } from 'vitest';
import { buildFamilyTrees, normalizeFamilyRelation, FAMILY_RELATIONSHIP_VOCABULARY } from '../story-harness/familyTree.js';

describe('familyTree vocabulary & normalization', () => {
  it('normalizes parent/child relationships', () => {
    expect(normalizeFamilyRelation('parent_of')).toBe('parent');
    expect(normalizeFamilyRelation('Father')).toBe('parent');
    expect(normalizeFamilyRelation('child_of')).toBe('child');
    expect(normalizeFamilyRelation('Daughter')).toBe('child');
  });

  it('normalizes spouse/partner and sibling relationships', () => {
    expect(normalizeFamilyRelation('married_to')).toBe('spouse');
    expect(normalizeFamilyRelation('Consort')).toBe('spouse');
    expect(normalizeFamilyRelation('half_sibling')).toBe('sibling');
    expect(normalizeFamilyRelation('sister')).toBe('sibling');
  });

  it('returns null for non-family relationships', () => {
    expect(normalizeFamilyRelation('feud')).toBeNull();
    expect(normalizeFamilyRelation('rival')).toBeNull();
    expect(normalizeFamilyRelation('business_partner')).toBeNull();
  });

  it('constructs hierarchical family trees from characters and relationships', () => {
    const characters = [
      { id: 'c1', name: 'Lord Malakor Vane', importance: 'principal' },
      { id: 'c2', name: 'Elyse Vane', importance: 'principal' },
      { id: 'c3', name: 'Solenne Vane', importance: 'supporting' },
      { id: 'c4', name: 'Random Scrapper', importance: 'background' },
    ];

    const relationships = [
      { source_entity_id: 'c1', target_entity_id: 'c2', relationship_type: 'married_to' },
      { source_entity_id: 'c1', target_entity_id: 'c3', relationship_type: 'parent_of' },
      { source_entity_id: 'c2', target_entity_id: 'c3', relationship_type: 'mother' },
    ];

    const result = buildFamilyTrees(characters, relationships);
    expect(result.lineages.length).toBe(1);
    expect(result.lineages[0].name).toContain('Vane');
    expect(result.lineages[0].memberCount).toBe(3);

    const malakor = result.lineages[0].members.find((m) => m.id === 'c1');
    expect(malakor.spouses).toContain('c2');
    expect(malakor.children).toContain('c3');

    const solenne = result.lineages[0].members.find((m) => m.id === 'c3');
    expect(solenne.parents).toContain('c1');
    expect(solenne.parents).toContain('c2');

    expect(result.standaloneCount).toBe(1);
  });
});
