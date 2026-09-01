import { describe, expect, it } from 'vitest';
import {
  isEligibleStoryTask,
  parseTaskMetadata,
  buildPromptInput,
  runOnce,
} from '../story-harness/worker.js';
import {
  SUPPORTED_JOB_TYPES,
  isSupportedJobType,
  normalizeJobType,
} from '../story-harness/taskTypes.js';
import { buildScopedContextPack } from '../story-harness/contextPack.js';
import {
  validateLorePayload,
  validateMacroHistoryTimeline,
  validateEventHistoryExpansion,
  validateFactionBeliefEnrichment,
  validateCharacterFamilyLineage,
  validateEncounterPressure,
  validateSessionHooks,
} from '../story-harness/consistencyGate.js';

function mockCanonContext() {
  return {
    story: {
      id: 'proj-oakhaven-1',
      title: 'The Ashen Coast',
      description: 'A storm-scoured coastline of oathbound harbor shrines.',
    },
    characters: [
      {
        id: 'character-cressa-vale',
        name: 'Cressa Vale',
        role: 'Harbor Warden',
        summary: 'Oversees docking rites and relics.',
        current_location_id: 'loc-deep-quay',
        relationships: [{ target: 'faction-salt-council', type: 'faction_member' }],
      },
      {
        id: 'character-aldus-vale',
        name: 'Aldus Vale',
        role: 'Deep-Sea Salvager',
        summary: 'Ancestral grandfather indebted to the council.',
        current_location_id: 'loc-deep-quay',
      },
    ],
    locations: [
      {
        id: 'loc-deep-quay',
        name: 'Deep Quay',
        summary: 'Stone jetties extending into churning waters.',
        region_type: 'harbor',
        political_notes: 'Factions: faction-salt-council',
      },
      {
        id: 'loc-sunken-caverns',
        name: 'The Sunken Caverns',
        summary: 'Submerged sea caves below the harbor.',
        region_type: 'cavern',
      },
    ],
    factions: [
      {
        id: 'faction-salt-council',
        name: 'The Salt Council',
        summary: 'Governing body of harbor captains.',
        alliedFactionIds: ['faction-iron-faith'],
        rivalFactionIds: [],
      },
      {
        id: 'faction-iron-faith',
        name: 'The Iron Faith',
        summary: 'Monastic order of chain-forgers.',
        alliedFactionIds: ['faction-salt-council'],
        rivalFactionIds: [],
      },
    ],
    timelineEvents: [
      {
        id: 'event-age-of-tides',
        date: 'First Millennium',
        title: 'The Drowned Zenith',
        summary: 'Civilizations flourished using tidal hydrology.',
        after: [],
        before: ['event-iron-accord'],
      },
      {
        id: 'event-iron-accord',
        date: 'Third Millennium',
        title: 'The Iron Accord',
        summary: 'Monks forged mooring chains stabilizing the harbor.',
        after: ['event-age-of-tides'],
        before: [],
        characterIds: ['character-cressa-vale'],
        locationIds: ['loc-deep-quay'],
        factionIds: ['faction-iron-faith'],
      },
    ],
    fixedTimelineFacts: [
      { before: 'event-age-of-tides', after: 'event-iron-accord' },
    ],
  };
}

describe('Typed StoryTime lore generation', () => {
  describe('Task identification and typed metadata parsing', () => {
    it('recognizes all supported job types and aliases', () => {
      expect(isSupportedJobType('macro_history_timeline')).toBe(true);
      expect(isSupportedJobType('event_history_expansion')).toBe(true);
      expect(isSupportedJobType('faction_belief_enrichment')).toBe(true);
      expect(isSupportedJobType('character_family_lineage')).toBe(true);
      expect(isSupportedJobType('encounter_pressure')).toBe(true);
      expect(isSupportedJobType('session_hooks')).toBe(true);
      expect(isSupportedJobType('draft_campaign_asset_bundle')).toBe(true);
      expect(normalizeJobType('lore_history_refinement')).toBe(SUPPORTED_JOB_TYPES.MACRO_HISTORY_TIMELINE);
      expect(normalizeJobType('lore_religion_refinement')).toBe(SUPPORTED_JOB_TYPES.FACTION_BELIEF_ENRICHMENT);
      expect(normalizeJobType('unknown_job')).toBe(null);
    });

    it('identifies typed story generation tasks as eligible', () => {
      const task = {
        id: 795,
        status: 'open',
        delegation_status: 'human_required',
        labels: ['storytime-generation', 'storytime-job:macro_history_timeline'],
        description: 'Story timeline task',
      };
      expect(isEligibleStoryTask(task)).toBe(true);

      const invalidCodeTask = {
        ...task,
        labels: ['storytime-generation', 'storytime-job:macro_history_timeline', 'local-code'],
      };
      expect(isEligibleStoryTask(invalidCodeTask)).toBe(false);
    });

    it('parses typed job metadata from description fence and labels', () => {
      const task = {
        id: 796,
        labels: ['storytime-generation', 'storytime-job:faction_belief_enrichment'],
        description: "```json\n{\n  \"jobType\": \"faction_belief_enrichment\",\n  \"storytimeProjectId\": \"proj-oakhaven-1\",\n  \"parentEntityId\": \"faction-iron-faith\",\n  \"scopeLevel\": \"tenet_and_liturgy\",\n  \"brief\": \"Detail the sacred rites of the Iron Faith.\"\n}\n```",
      };

      const meta = parseTaskMetadata(task);
      expect(meta.jobType).toBe('faction_belief_enrichment');
      expect(meta.parentEntityId).toBe('faction-iron-faith');
      expect(meta.scopeLevel).toBe('tenet_and_liturgy');
      expect(meta.storytimeProjectId).toBe('proj-oakhaven-1');
    });
  });

  describe('Scoped Context-Pack Builder', () => {
    const full = mockCanonContext();

    it('builds a bounded context pack for macro history timeline', () => {
      const pack = buildScopedContextPack(full, {
        jobType: 'macro_history_timeline',
        storytimeProjectId: 'proj-oakhaven-1',
      });

      expect(pack.jobType).toBe('macro_history_timeline');
      expect(pack.allowedDimensions).toEqual(['timelineEvents']);
      expect(pack.timelineEvents.length).toBeGreaterThan(0);
      expect(pack.characters.length).toBe(0); // excludes ground-level characters
    });

    it('builds a focused context pack for faction belief enrichment', () => {
      const pack = buildScopedContextPack(full, {
        jobType: 'faction_belief_enrichment',
        targetEntityId: 'faction-iron-faith',
        storytimeProjectId: 'proj-oakhaven-1',
      });

      expect(pack.jobType).toBe('faction_belief_enrichment');
      expect(pack.anchorEntity.entity.id).toBe('faction-iron-faith');
      expect(pack.allowedDimensions).toEqual(['faith', 'shrineLocations']);
      expect(pack.factions.some((f) => f.id === 'faction-iron-faith')).toBe(true);
    });

    it('builds a localized context pack for encounter pressure', () => {
      const pack = buildScopedContextPack(full, {
        jobType: 'encounter_pressure',
        targetEntityId: 'loc-sunken-caverns',
        storytimeProjectId: 'proj-oakhaven-1',
      });

      expect(pack.jobType).toBe('encounter_pressure');
      expect(pack.anchorEntity.entity.id).toBe('loc-sunken-caverns');
      expect(pack.allowedDimensions).toEqual(['creature', 'environmentalHazard']);
      expect(pack.locations.some((l) => l.id === 'loc-sunken-caverns')).toBe(true);
    });
  });

  describe('Per-type Consistency Gates', () => {
    const context = mockCanonContext();

    // 1. Timeline Refinement Tests
    describe('Timeline refinement gate (macro_history_timeline & event_history_expansion)', () => {
      it('validates a correct macro history timeline payload', () => {
        const payload = {
          jobType: 'macro_history_timeline',
          schemaVersion: 1,
          timelineEvents: [
            {
              id: 'event-age-of-fog',
              date: 'Fourth Millennium of the Beacon',
              title: 'The Great Sea Shrouding',
              summary: 'Dense brine vapors descended upon the harbors for forty summers.',
              after: ['event-iron-accord'],
              before: [],
            },
          ],
        };

        const result = validateLorePayload(payload, context, 'macro_history_timeline');
        expect(result.ok).toBe(true);
        expect(result.violations).toEqual([]);
      });

      it('rejects modern numeric Gregorian dates in macro timeline', () => {
        const payload = {
          jobType: 'macro_history_timeline',
          schemaVersion: 1,
          timelineEvents: [
            {
              id: 'event-modern-date',
              date: '2024', // modern date
              title: 'Modern Event',
              summary: 'Should be rejected by the gate.',
              after: [],
              before: [],
            },
          ],
        };

        const result = validateLorePayload(payload, context, 'macro_history_timeline');
        expect(result.ok).toBe(false);
        expect(result.violations).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ code: 'modern_date_disallowed' }),
          ]),
        );
      });

      it('rejects forbidden object types in macro timeline', () => {
        const payload = {
          jobType: 'macro_history_timeline',
          schemaVersion: 1,
          timelineEvents: [
            {
              id: 'event-valid-era',
              date: 'First Era of Salt',
              title: 'The Salt Dawn',
              summary: 'The ocean waters retreated from high cliffs.',
            },
          ],
          characters: [{ id: 'character-forbidden', name: 'Forbidden NPC' }], // forbidden!
        };

        const result = validateLorePayload(payload, context, 'macro_history_timeline');
        expect(result.ok).toBe(false);
        expect(result.violations).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ code: 'forbidden_object_type', path: '$.characters' }),
          ]),
        );
      });

      it('rejects event expansion referencing unknown parentEventId', () => {
        const payload = {
          jobType: 'event_history_expansion',
          schemaVersion: 1,
          parentEventId: 'event-nonexistent-id',
          timelineEvents: [
            {
              id: 'event-phase-1',
              date: 'Phase 1',
              title: 'The Breakers Crack',
              summary: 'Initial breach of the stone wall.',
            },
          ],
        };

        const result = validateLorePayload(payload, context, 'event_history_expansion');
        expect(result.ok).toBe(false);
        expect(result.violations).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ code: 'unknown_reference', path: '$.parentEventId' }),
          ]),
        );
      });
    });

    // 2. Faction & Character Enrichment Tests
    describe('Faction & Character enrichment gate', () => {
      it('validates a correct faction belief enrichment payload', () => {
        const payload = {
          jobType: 'faction_belief_enrichment',
          schemaVersion: 1,
          factionId: 'faction-iron-faith',
          faith: {
            name: 'The Unyielding Anchor',
            publicTenets: ['What is forged in salt endures all tempests.'],
            sacredTaboos: ['Never strike an iron anvil during a storm peak tide.'],
            ritualGreeting: 'May your anchors bite deep into living stone.',
          },
          shrineLocations: [
            {
              id: 'loc-shrine-high-anvil',
              name: 'The High Anvil Sanctuary',
              summary: 'A wave-lashed basalt crypt holding the primordial mooring chain.',
              parentLocationId: 'loc-deep-quay',
            },
          ],
        };

        const result = validateLorePayload(payload, context, 'faction_belief_enrichment');
        expect(result.ok).toBe(true);
        expect(result.violations).toEqual([]);
      });

      it('rejects faction belief enrichment when sacred taboos are missing', () => {
        const payload = {
          jobType: 'faction_belief_enrichment',
          schemaVersion: 1,
          factionId: 'faction-iron-faith',
          faith: {
            name: 'Incomplete Faith',
            publicTenets: ['Work hard.'],
            sacredTaboos: [], // empty!
          },
        };

        const result = validateLorePayload(payload, context, 'faction_belief_enrichment');
        expect(result.ok).toBe(false);
        expect(result.violations).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ code: 'missing_required_field', path: '$.faith.sacredTaboos' }),
          ]),
        );
      });

      it('validates character family lineage and detects duplicate names or missing target', () => {
        const validPayload = {
          jobType: 'character_family_lineage',
          schemaVersion: 1,
          targetCharacterId: 'character-cressa-vale',
          characters: [
            {
              id: 'character-maren-vale',
              name: 'Maren Vale',
              role: 'Tidekeeper Scribe',
              summary: 'Mother of Cressa who bound herself to council chancery.',
              relationships: [
                { target: 'character-cressa-vale', type: 'parent' },
              ],
            },
          ],
          familyLegacy: {
            heirloomName: 'The Sea-Mark Signet',
            summary: 'Tarnished bronze signet stamped with the warden crest.',
          },
        };

        const result = validateLorePayload(validPayload, context, 'character_family_lineage');
        expect(result.ok).toBe(true);

        const invalidDuplicate = {
          ...validPayload,
          characters: [
            {
              id: 'character-cressa-vale', // duplicate of target character!
              name: 'Cressa Vale',
              role: 'Harbor Warden',
              summary: 'Duplicate entry.',
              relationships: [],
            },
          ],
        };
        const dupResult = validateLorePayload(invalidDuplicate, context, 'character_family_lineage');
        expect(dupResult.ok).toBe(false);
        expect(dupResult.violations).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ code: 'duplicate_name' }),
          ]),
        );
      });
    });

    // 3. Local Encounter & Session Task Tests
    describe('Local encounter & session task gate', () => {
      it('validates encounter pressure payload and rejects missing weakness', () => {
        const validPayload = {
          jobType: 'encounter_pressure',
          schemaVersion: 1,
          locationId: 'loc-sunken-caverns',
          creature: {
            id: 'creature-barnacle-skulker',
            name: 'Barnacle Skulker',
            morphology: 'Chitinous four-legged crustacean humanoid with shell plating.',
            tactics: 'Lurks in crevices to sever diving air lines.',
            weakness: 'Direct lantern light blinds their unhooded stalk eyes.',
            harvestableYield: 'Water-resistant caulking pitch.',
          },
          environmentalHazard: {
            id: 'hazard-drowning-siphon',
            name: 'The Drowning Siphon',
            summary: 'Hydrostatic pressure surge traps swimmers against culvert grates.',
          },
        };

        const result = validateLorePayload(validPayload, context, 'encounter_pressure');
        expect(result.ok).toBe(true);

        const missingWeakness = {
          ...validPayload,
          creature: {
            ...validPayload.creature,
            weakness: '', // missing!
          },
        };
        const invalidResult = validateLorePayload(missingWeakness, context, 'encounter_pressure');
        expect(invalidResult.ok).toBe(false);
        expect(invalidResult.violations).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ code: 'missing_required_field', path: '$.creature.weakness' }),
          ]),
        );
      });

      it('validates session hooks and requires at least one untruthful rumor', () => {
        const validPayload = {
          jobType: 'session_hooks',
          schemaVersion: 1,
          locationId: 'loc-deep-quay',
          rumors: [
            {
              id: 'rumor-1',
              text: 'The harbor beacon was put out by council saboteurs.',
              speakerRole: 'Drunken dockhand',
              truthRating: 'half-truth', // untruthful rating present!
            },
            {
              id: 'rumor-2',
              text: 'Tidekeepers are storing extra oil barrels in vault 3.',
              speakerRole: 'Fisherman',
              truthRating: 'true',
            },
          ],
          hooks: [
            {
              id: 'hook-1',
              title: 'The Scuttled Ledger',
              summary: 'Retrieve the brass ledger before the midnight surge.',
              involvedCharacterIds: ['character-cressa-vale'],
              involvedFactionIds: ['faction-salt-council'],
            },
          ],
        };

        const result = validateLorePayload(validPayload, context, 'session_hooks');
        expect(result.ok).toBe(true);

        const allTrueRumors = {
          ...validPayload,
          rumors: [
            {
              id: 'rumor-1',
              text: 'Everything is fine and accurate.',
              speakerRole: 'Town crier',
              truthRating: 'true',
            },
          ],
        };
        const allTrueResult = validateLorePayload(allTrueRumors, context, 'session_hooks');
        expect(allTrueResult.ok).toBe(false);
        expect(allTrueResult.violations).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ code: 'invalid_rumor_distribution' }),
          ]),
        );
      });
    });
  });

  describe('Harness dry-run with typed tasks', () => {
    it('detects typed tasks correctly in dry-run mode', async () => {
      const mockDashboard = {
        async listTasks() {
          return [
            {
              id: 801,
              title: 'Timeline: Millennium eras',
              status: 'open',
              delegation_status: 'human_required',
              labels: ['storytime-generation', 'storytime-job:macro_history_timeline'],
              priority_score: 700,
            },
            {
              id: 802,
              title: 'Encounter: Cavern skulkers',
              status: 'open',
              delegation_status: 'human_required',
              labels: ['storytime-generation', 'storytime-job:encounter_pressure'],
              priority_score: 650,
            },
            {
              id: 803,
              title: 'Ignore coding task',
              status: 'open',
              delegation_status: 'local_ready',
              labels: ['storytime-generation', 'local-code'],
              priority_score: 900,
            },
          ];
        },
      };

      const result = await runOnce({
        dashboard: mockDashboard,
        config: { dryRun: true },
      });

      expect(result.mode).toBe('dry-run');
      expect(result.eligible).toEqual([
        { id: 801, title: 'Timeline: Millennium eras' },
        { id: 802, title: 'Encounter: Cavern skulkers' },
      ]);
    });
  });

  describe('Universe Encyclopedia & Derivative Outline Tasks (Task 812)', () => {
    it('parses universeProjectId and canonDimension from task metadata', () => {
      const task = {
        title: 'Refine religion and rites of the Tide Shrines',
        labels: ['storytime-generation', 'storytime-job:religion_belief_lore'],
        description: `universeProjectId: uni-tides-99\ncanonDimension: religion\nbrief: Detail the liturgical rites of the Sunken Beacon`,
      };

      const parsed = parseTaskMetadata(task);
      expect(parsed.jobType).toBe(SUPPORTED_JOB_TYPES.RELIGION_BELIEF_LORE);
      expect(parsed.storytimeProjectId).toBe('uni-tides-99');
      expect(parsed.canonDimension).toBe('religion');
      expect(parsed.brief).toBe('Detail the liturgical rites of the Sunken Beacon');
    });

    it('builds scoped context pack for encyclopedia-first religion task', () => {
      const context = mockCanonContext();
      const metadata = {
        jobType: 'religion_belief_lore',
        mustReference: ['loc-deep-quay', 'faction-salt-council'],
      };

      const pack = buildScopedContextPack(context, metadata);
      expect(pack.jobType).toBe(SUPPORTED_JOB_TYPES.RELIGION_BELIEF_LORE);
      expect(pack.allowedDimensions).toContain('religions');
      expect(pack.allowedDimensions).toContain('deities');
      expect(pack.factions.some((f) => f.id === 'faction-salt-council')).toBe(true);
      expect(pack.locations.some((l) => l.id === 'loc-deep-quay')).toBe(true);
      // Characters not allowed/fed for pure religion refinement
      expect(pack.allowedDimensions).not.toContain('characters');
    });

    it('validates an encyclopedia-first religion lore payload and rejects cross-dimension leakage', () => {
      const context = mockCanonContext();

      const validPayload = {
        jobType: 'religion_belief_lore',
        schemaVersion: 1,
        canonDimension: 'religion',
        religionName: 'Liturgies of the Salt Tide',
        deities: [{ name: 'The Pale Navigator', domain: 'Tides and Passage', symbol: 'Coiled rope' }],
        coreTenets: ['The sea claims all unsworn hulls.'],
        sacredRites: ['The Drowning of the First Bell'],
        taboos: ['Lighting a dry wick upon the wharf at midnight.'],
        associatedFactionIds: ['faction-salt-council'],
        holySites: [{ locationId: 'loc-deep-quay', name: 'High Salt Altar', description: 'Carved of coral.' }],
      };

      const validRes = validateLorePayload(validPayload, context, 'religion_belief_lore');
      expect(validRes.ok).toBe(true);

      // Rejects unsupported characters leakage
      const leakedPayload = {
        ...validPayload,
        characters: [{ id: 'char-leak', name: 'Unwanted character' }],
      };
      const leakedRes = validateLorePayload(leakedPayload, context, 'religion_belief_lore');
      expect(leakedRes.ok).toBe(false);
      expect(leakedRes.violations.some((v) => v.code === 'unknown_field')).toBe(true);
    });

    it('validates an encyclopedia-first bestiary entry task', () => {
      const context = mockCanonContext();

      const bestiaryPayload = {
        jobType: 'bestiary_entry_refinement',
        schemaVersion: 1,
        canonDimension: 'bestiary',
        name: 'Grave-Eel Swarm',
        category: 'Beast / Swarm',
        hearts: 4,
        tactics: ['Coil around submerged timber', 'Acid discharge upon rupture'],
        habitats: ['Sunken holds', 'Salt channels'],
        description: 'Bioluminescent eels that feed on necro-tech runoff in the deep quay.',
        associatedLocationIds: ['loc-deep-quay'],
      };

      const result = validateLorePayload(bestiaryPayload, context, 'bestiary_entry_refinement');
      expect(result.ok).toBe(true);

      // Rejects missing tactics or invalid hearts
      const invalid = { ...bestiaryPayload, hearts: -1, tactics: [] };
      const invalidRes = validateLorePayload(invalid, context, 'bestiary_entry_refinement');
      expect(invalidRes.ok).toBe(false);
    });

    it('validates a downstream derivative outline task citing hardened universe canon', () => {
      const context = mockCanonContext();

      const derivativePayload = {
        jobType: 'derivative_outline_generation',
        schemaVersion: 1,
        canonDimension: 'derivative',
        derivativeType: 'campaign',
        title: 'Curse of the Salt Tide',
        logline: 'When the harbor beacons quench, wardens must dive the deep quay.',
        premise: 'A 4-session tabletop campaign packet set around Deep Quay and the Salt Council.',
        structure: {
          sections: [
            { title: 'Session 1: The Darkened Beacon', summary: 'Party arrives during docking rites.' },
            { title: 'Session 2: The Sinking of the Ledger', summary: 'Subterranean salvage.' },
          ],
        },
        sourceCanonReferences: [
          { entityType: 'character', entityId: 'character-cressa-vale', name: 'Cressa Vale' },
          { entityType: 'location', entityId: 'loc-deep-quay', name: 'Deep Quay' },
          { entityType: 'faction', entityId: 'faction-salt-council', name: 'Salt Council' },
        ],
      };

      const res = validateLorePayload(derivativePayload, context, 'derivative_outline_generation');
      expect(res.ok).toBe(true);

      // Rejects unknown canon references
      const unkRefPayload = {
        ...derivativePayload,
        sourceCanonReferences: [
          { entityType: 'character', entityId: 'character-fake-ghost', name: 'Ghost' },
        ],
      };
      const unkRes = validateLorePayload(unkRefPayload, context, 'derivative_outline_generation');
      expect(unkRes.ok).toBe(false);
      expect(unkRes.violations.some((v) => v.code === 'unknown_reference')).toBe(true);
    });

    it('validates chapter_prose_composition requiring novel-length prose and rejecting outlining metadata', () => {
      const context = mockCanonContext();

      const validProsePayload = {
        jobType: 'chapter_prose_composition',
        schemaVersion: 1,
        canonDimension: 'derivative',
        chapterTitle: 'Chapter 1: The Deep Fissure',
        prose: 'The fog rolling off the Harbor Village sea-wall tasted of wet iron and curdled brine, but beneath the familiar rot of low tide lay something far sharper—a reek of vitriol so acidic it stripped the moisture from Master Alchemist Vaelen’s throat before he had even set foot on the lower quays. He drew a heavy wool muffler over his nose, though it did little to dull the sulfurous burn seeping upward through the basalt drainage grates. At seventy-four years, his knees cursed every flight of salt-slick steps leading down to the cistern gates, yet the tremor that rattled his spine had nothing to do with age or the Atlantic damp.',
        wordCount: 112,
        sourceCanonReferences: [
          { entityType: 'character', entityId: 'character-cressa-vale', name: 'Cressa Vale' },
          { entityType: 'location', entityId: 'loc-deep-quay', name: 'Deep Quay' },
        ],
      };

      const res = validateLorePayload(validProsePayload, context, 'chapter_prose_composition');
      expect(res.ok).toBe(true);

      // Rejects insufficient prose
      const shortRes = validateLorePayload({ ...validProsePayload, prose: 'Too short' }, context, 'chapter_prose_composition');
      expect(shortRes.ok).toBe(false);
      expect(shortRes.violations.some((v) => v.code === 'insufficient_prose')).toBe(true);

      // Rejects unfiltered metadata headers
      const metaRes = validateLorePayload({ ...validProsePayload, prose: '## Beat 1: The Stink\n' + validProsePayload.prose }, context, 'chapter_prose_composition');
      expect(metaRes.ok).toBe(false);
      expect(metaRes.violations.some((v) => v.code === 'unfiltered_metadata')).toBe(true);
    });
  });
});
