import { describe, it, expect } from 'vitest';
import {
  evaluateDraftQuality,
  buildCritiquePrompt,
  deriveFactRules,
  DEFECT_CODES,
} from '../story-harness/critiqueGate.js';

describe('StoryTime Canon-Aware Critique Gate', () => {
  const mockScopedContext = {
    story: { id: 'story-1', title: 'The Vitriol Siphon', description: 'Dark coastal fantasy' },
    characters: [
      { id: 'char-vaelen', name: 'Master Vaelen' },
      { id: 'char-elyan', name: 'Apprentice Elyan' },
      { id: 'char-vance', name: 'Trade Master Vance' },
    ],
    locations: [
      { id: 'loc-harbor', name: 'Harbor Village' },
      { id: 'loc-ashen-sea', name: 'The Ashen Sea' },
    ],
    factions: [
      { id: 'fac-syndicate', name: 'Salvage Syndicate' },
      { id: 'fac-alchemists', name: 'Alchemists Guild' },
    ],
    bestiary: [
      { id: 'best-slime-queen', name: 'Slime Queen' },
    ],
    timelineEvents: [
      { id: 'event-cracked-vaults', title: 'Alchemical Vaults Crack' },
      { id: 'event-midnight-theft', title: 'The Midnight Theft' },
    ],
    relationships: [
      {
        source_entity_id: 'char-vaelen',
        target_entity_id: 'char-vance',
        relationship_type: 'hostile',
      },
      {
        source_entity_id: 'fac-syndicate',
        target_entity_id: 'fac-alchemists',
        relationship_type: 'enemy',
      },
      {
        source_entity_id: 'char-vaelen',
        target_entity_id: 'char-elyan',
        relationship_type: 'ally',
      },
    ],
  };

  describe('Earth Geography & Avoid Terms', () => {
    it('detects real-world Earth geography terms in fantasy setting', () => {
      const draft = {
        chapterTitle: 'The Deep Fissure',
        prose: 'The fog rolling off Harbor Village tasted of iron, but the tremor in his knees had nothing to do with age or the Atlantic damp against the Atlantic squalls.',
      };

      const result = evaluateDraftQuality(draft, {
        jobType: 'chapter_prose_composition',
        artifactType: 'story',
        scopedContext: mockScopedContext,
      });

      expect(result.ok).toBe(false);
      expect(result.defects.some((d) => d.code === DEFECT_CODES.EARTH_GEOGRAPHY)).toBe(true);
      expect(result.score).toBeLessThan(100);
    });

    it('passes when using canonical in-universe geography', () => {
      const draft = {
        chapterTitle: 'The Deep Fissure',
        prose: 'The fog rolling off Harbor Village tasted of iron, but the tremor in his knees had nothing to do with age or the Ashen damp against the squalls of the Ashen Sea.',
      };

      const result = evaluateDraftQuality(draft, {
        jobType: 'chapter_prose_composition',
        artifactType: 'story',
        scopedContext: mockScopedContext,
      });

      expect(result.defects.some((d) => d.code === DEFECT_CODES.EARTH_GEOGRAPHY)).toBe(false);
    });

    it('permits Earth terms when story or factRules explicitly allow Earth geography', () => {
      const draft = {
        prose: 'He walked through the streets of London under the Atlantic rain.',
      };

      const factRules = { allowEarthGeography: true };
      const result = evaluateDraftQuality(draft, {
        jobType: 'chapter_prose_composition',
        artifactType: 'story',
        scopedContext: mockScopedContext,
        factRules,
      });

      expect(result.defects.some((d) => d.code === DEFECT_CODES.EARTH_GEOGRAPHY)).toBe(false);
    });

    it('detects custom avoid terms passed in factRules', () => {
      const draft = {
        prose: 'The old wizard checked his chronometer and drank lukewarm grog.',
      };

      const factRules = { avoidTerms: ['chronometer', 'grog'] };
      const result = evaluateDraftQuality(draft, {
        jobType: 'chapter_prose_composition',
        artifactType: 'story',
        scopedContext: mockScopedContext,
        factRules,
      });

      expect(result.ok).toBe(false);
      expect(result.defects.some((d) => d.code === DEFECT_CODES.EARTH_GEOGRAPHY && d.message.includes('chronometer'))).toBe(true);
    });

    it('derives factRules correctly from modern vs fantasy universe context', () => {
      const fantasyRules = deriveFactRules({
        story: { title: 'High Fantasy Realm', description: 'Basalt spires and ancient magic' },
        taskMetadata: { avoid: ['slang', 'tech'] },
      });
      expect(fantasyRules.allowEarthGeography).toBe(false);
      expect(fantasyRules.avoidTerms).toEqual(['slang', 'tech']);

      const modernRules = deriveFactRules({
        story: { title: 'Cyberpunk 2099', description: 'Contemporary Earth urban underworld' },
        taskMetadata: {},
      });
      expect(modernRules.allowEarthGeography).toBe(true);
    });
  });

  describe('Mode-Specific Dialogue and Script Formatting', () => {
    it('rejects screenplay-style dialogue tags in chapter prose composition', () => {
      const draft = {
        chapterTitle: 'The Slipway Confrontation',
        prose: [
          'The rain slicked the cobblestones of the quay.',
          '**Master Vaelen:** (exhausted) You should not be down on the wet slip, Cressa.',
          '**Trade Master Vance:** (sneering) Hand over the gold before dawn.',
        ].join('\n\n'),
      };

      const result = evaluateDraftQuality(draft, {
        jobType: 'chapter_prose_composition',
        artifactType: 'story',
        scopedContext: mockScopedContext,
      });

      expect(result.ok).toBe(false);
      expect(result.defects.some((d) => d.code === DEFECT_CODES.SCRIPT_FORMATTING)).toBe(true);
    });

    it('allows screenplay-style dialogue tags when artifactType is screenplay', () => {
      const draft = {
        title: 'The Slipway Confrontation - Scene 1',
        script: [
          'EXT. HARBOR VILLAGE SLIPWAY - NIGHT',
          '**VAELEN**',
          '(exhausted)',
          'You should not be down on the wet slip, Cressa.',
        ].join('\n\n'),
      };

      const result = evaluateDraftQuality(draft, {
        jobType: 'screenplay_generation',
        artifactType: 'screenplay',
        scopedContext: mockScopedContext,
      });

      expect(result.defects.some((d) => d.code === DEFECT_CODES.SCRIPT_FORMATTING)).toBe(false);
    });
  });

  describe('Metadata Scaffolding Detection', () => {
    it('rejects developmental beat headers ("## Beat 1:") in novel prose', () => {
      const draft = {
        chapterTitle: 'The Investigation',
        prose: [
          '## Beat 1: The Sulfurous Stink',
          'The sulfurous stink rising through the drainage grates alerted Master Vaelen.',
          '## Beat 2: The Tuning Fork',
          'He pulled out his 142 Hz star-iron fork.',
        ].join('\n\n'),
      };

      const result = evaluateDraftQuality(draft, {
        jobType: 'chapter_prose_composition',
        artifactType: 'story',
        scopedContext: mockScopedContext,
      });

      expect(result.ok).toBe(false);
      expect(result.defects.some((d) => d.code === DEFECT_CODES.METADATA_SCAFFOLDING)).toBe(true);
    });
  });

  describe('Canon Graph & Relationship Awareness', () => {
    it('detects relationship contradiction when hostile entities are claimed to be sworn allies (src -> tgt)', () => {
      const draft = {
        chapterTitle: 'Strange Bedfellows',
        prose: 'In the great hall, Master Vaelen was a loyal servant of Trade Master Vance, bowing low before his master.',
      };

      const result = evaluateDraftQuality(draft, {
        jobType: 'chapter_prose_composition',
        artifactType: 'story',
        scopedContext: mockScopedContext,
      });

      expect(result.ok).toBe(false);
      expect(result.defects.some((d) => d.code === DEFECT_CODES.RELATIONSHIP_CONTRADICTION)).toBe(true);
    });

    it('detects relationship contradiction bidirectionally (tgt -> src)', () => {
      const draft = {
        chapterTitle: 'Inverted Alliance',
        prose: 'Trade Master Vance was allied with Master Vaelen across thirty leagues of coastline.',
      };

      const result = evaluateDraftQuality(draft, {
        jobType: 'chapter_prose_composition',
        artifactType: 'story',
        scopedContext: mockScopedContext,
      });

      expect(result.ok).toBe(false);
      expect(result.defects.some((d) => d.code === DEFECT_CODES.RELATIONSHIP_CONTRADICTION)).toBe(true);
    });

    it('detects relationship contradiction when allied entities are claimed to have a blood feud', () => {
      const draft = {
        chapterTitle: 'Broken Bond',
        prose: 'Master Vaelen entered into a bitter blood feud with Apprentice Elyan over the lost crown.',
      };

      const result = evaluateDraftQuality(draft, {
        jobType: 'chapter_prose_composition',
        artifactType: 'story',
        scopedContext: mockScopedContext,
      });

      expect(result.ok).toBe(false);
      expect(result.defects.some((d) => d.code === DEFECT_CODES.RELATIONSHIP_CONTRADICTION)).toBe(true);
    });

    it('recognizes timelineEvents in sourceCanonReferences as valid canon IDs', () => {
      const draft = {
        chapterTitle: 'Historical Echoes',
        prose: 'The disaster mirrored the seismic cataclysm.',
        sourceCanonReferences: [
          { entityType: 'timeline_event', entityId: 'event-cracked-vaults', name: 'Alchemical Vaults Crack' },
        ],
      };

      const result = evaluateDraftQuality(draft, {
        jobType: 'chapter_prose_composition',
        artifactType: 'story',
        scopedContext: mockScopedContext,
      });

      expect(result.defects.some((d) => d.code === DEFECT_CODES.UNKNOWN_CANON_REFERENCE)).toBe(false);
    });

    it('strictly requires valid entityId even if display name matches canon', () => {
      const draft = {
        chapterTitle: 'Invalid Reference ID',
        prose: 'Vaelen investigated the breach.',
        sourceCanonReferences: [
          { entityType: 'character', entityId: 'char-invalid-random-id', name: 'Master Vaelen' },
        ],
      };

      const result = evaluateDraftQuality(draft, {
        jobType: 'chapter_prose_composition',
        artifactType: 'story',
        scopedContext: mockScopedContext,
      });

      expect(result.ok).toBe(false);
      expect(result.defects.some((d) => d.code === DEFECT_CODES.UNKNOWN_CANON_REFERENCE)).toBe(true);
    });
  });

  describe('Critique Prompt Construction', () => {
    it('generates a prescriptive, targeted critique prompt with fix guidance', () => {
      const draft = {
        prose: '## Beat 1: Start\n**Vaelen:** Atlantic squalls hit the dock.',
      };

      const quality = evaluateDraftQuality(draft, {
        jobType: 'chapter_prose_composition',
        artifactType: 'story',
        scopedContext: mockScopedContext,
      });

      const critiquePrompt = buildCritiquePrompt(draft, quality.defects, {
        jobType: 'chapter_prose_composition',
        scopedContext: mockScopedContext,
      });

      expect(critiquePrompt).toContain('QUALITY REVIEW GATE CRITIQUE');
      expect(critiquePrompt).toContain(DEFECT_CODES.EARTH_GEOGRAPHY);
      expect(critiquePrompt).toContain(DEFECT_CODES.METADATA_SCAFFOLDING);
      expect(critiquePrompt).toContain('MANDATORY REVISION INSTRUCTIONS');
    });
  });
});
