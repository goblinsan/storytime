import { describe, expect, it } from 'vitest';
import { validateCampaignBundle } from '../story-harness/consistencyGate.js';

function validBundle(overrides = {}) {
  return {
    jobType: 'draft_campaign_asset_bundle',
    schemaVersion: 1,
    worldBrief: {
      name: 'Ember Coast',
      summary: 'A coastal frontier caught between old gods and trade houses.',
      themes: ['debt', 'oaths'],
      openQuestions: ['Who benefits if the lighthouse goes dark?'],
    },
    characters: [
      {
        id: 'new-character-mira',
        name: 'Mira Voss',
        role: 'harbor oracle',
        summary: 'Reads storm omens from wreckage.',
        motivation: 'Keep the city from repeating her family tragedy.',
        locationId: 'loc-harbor',
        factionIds: ['faction-candle-league'],
      },
    ],
    factions: [
      {
        id: 'faction-candle-league',
        name: 'Candle League',
        summary: 'Dockside mutual aid network with old ritual obligations.',
        goals: ['Protect sailors', 'Expose corrupt tariffs'],
        alliedFactionIds: ['faction-old-canon'],
        rivalFactionIds: [],
      },
    ],
    locations: [
      {
        id: 'loc-harbor',
        name: 'Glasswake Harbor',
        summary: 'A working harbor lined with storm-glass shrines.',
        regionType: 'harbor',
        factionIds: ['faction-candle-league'],
      },
    ],
    timelineEvents: [
      {
        id: 'event-lighthouse-oath',
        date: '12 Rainwane',
        title: 'The Lighthouse Oath',
        summary: 'Mira swears to keep the dead light burning.',
        after: ['event-old-war'],
        before: [],
        characterIds: ['new-character-mira'],
        locationIds: ['loc-harbor'],
        factionIds: ['faction-candle-league'],
      },
    ],
    ...overrides,
  };
}

function canonContext() {
  return {
    characters: [{ id: 'character-old-canon' }],
    factions: [{ id: 'faction-old-canon' }],
    locations: [{ id: 'location-old-canon' }],
    timelineEvents: [{ id: 'event-old-war' }, { id: 'event-king-falls' }],
    fixedTimelineFacts: [{ before: 'event-old-war', after: 'event-king-falls' }],
  };
}

describe('validateCampaignBundle', () => {
  it('accepts references to existing context and proposed new entities', () => {
    const result = validateCampaignBundle(validBundle(), canonContext());

    expect(result).toEqual({ ok: true, violations: [] });
  });

  it('accepts singular faction goal and pressure draft fields', () => {
    const result = validateCampaignBundle(validBundle({
      factions: [
        {
          id: 'faction-candle-league',
          name: 'Candle League',
          summary: 'Dockside mutual aid network with old ritual obligations.',
          goal: 'Expose corrupt tariffs.',
          pressure: 'A missing ledger could implicate its founders.',
          alliedFactionIds: ['faction-old-canon'],
          rivalFactionIds: [],
        },
      ],
    }), canonContext());

    expect(result).toEqual({ ok: true, violations: [] });
  });

  it('rejects unknown character, location, faction, and timeline references', () => {
    const bundle = validBundle({
      characters: [
        {
          id: 'new-character-mira',
          name: 'Mira Voss',
          role: 'harbor oracle',
          summary: 'Reads storm omens.',
          motivation: 'Protect the harbor.',
          locationId: 'missing-location',
          factionIds: ['missing-faction'],
        },
      ],
      timelineEvents: [
        {
          id: 'event-lighthouse-oath',
          date: '12 Rainwane',
          title: 'The Lighthouse Oath',
          summary: 'Mira swears to keep the dead light burning.',
          after: ['missing-event'],
          before: [],
          characterIds: ['missing-character'],
          locationIds: ['loc-harbor'],
          factionIds: ['faction-candle-league'],
        },
      ],
    });

    const result = validateCampaignBundle(bundle, canonContext());

    expect(result.ok).toBe(false);
    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'unknown_reference', kind: 'location', id: 'missing-location' }),
        expect.objectContaining({ code: 'unknown_reference', kind: 'faction', id: 'missing-faction' }),
        expect.objectContaining({ code: 'unknown_reference', kind: 'timeline_event', id: 'missing-event' }),
        expect.objectContaining({ code: 'unknown_reference', kind: 'character', id: 'missing-character' }),
      ]),
    );
  });

  it('rejects timeline order that contradicts a fixed canon before-after fact', () => {
    const bundle = validBundle({
      timelineEvents: [
        {
          id: 'event-king-falls',
          date: '9 Rainwane',
          title: 'The Crown Falls',
          summary: 'A proposed rewrite tries to put the king fall too early.',
          before: ['event-old-war'],
          after: [],
          characterIds: [],
          locationIds: [],
          factionIds: [],
        },
      ],
    });

    const result = validateCampaignBundle(bundle, canonContext());

    expect(result.ok).toBe(false);
    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'timeline_contradiction',
          before: 'event-old-war',
          after: 'event-king-falls',
        }),
      ]),
    );
  });

  it('rejects fields outside the campaign bundle schema', () => {
    const bundle = validBundle({
      debugPrompt: 'should not be stored',
      worldBrief: {
        name: 'Ember Coast',
        summary: 'A coastal frontier.',
        themes: [],
        openQuestions: [],
        secretCanonOverride: true,
      },
    });

    const result = validateCampaignBundle(bundle, canonContext());

    expect(result.ok).toBe(false);
    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'unknown_field', path: '$.debugPrompt' }),
        expect.objectContaining({ code: 'unknown_field', path: '$.worldBrief.secretCanonOverride' }),
      ]),
    );
  });

  it('rejects non-campaign-bundle job types', () => {
    const result = validateCampaignBundle(validBundle({ jobType: 'draft_scene' }), canonContext());

    expect(result.ok).toBe(false);
    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'invalid_job_type', path: '$.jobType' }),
      ]),
    );
  });

  describe('Quality and anti-repetition rules', () => {
    it('rejects duplicate character, faction, and location names in bundle', () => {
      const bundle = validBundle({
        characters: [
          {
            id: 'char-1',
            name: 'Mira Voss',
            role: 'oracle',
            summary: 'Reads storm omens.',
            motivation: 'Protect harbor.',
            locationId: 'loc-harbor',
            factionIds: ['faction-candle-league'],
          },
          {
            id: 'char-2',
            name: 'mira voss', // duplicate case-insensitive
            role: 'deckhand',
            summary: 'Ties knots on the slip.',
            motivation: 'Earn coin.',
            locationId: 'loc-harbor',
            factionIds: ['faction-candle-league'],
          },
        ],
        factions: [
          {
            id: 'faction-1',
            name: 'Candle League',
            summary: 'Dockside mutual aid.',
            goals: ['Protect sailors'],
          },
          {
            id: 'faction-2',
            name: 'Candle League', // duplicate
            summary: 'Secret offshoot.',
            goals: ['Hoard oil'],
          },
        ],
        locations: [
          {
            id: 'loc-1',
            name: 'Glasswake Harbor',
            summary: 'Working docklands.',
            regionType: 'harbor',
          },
          {
            id: 'loc-2',
            name: 'Glasswake Harbor', // duplicate
            summary: 'Outer docklands.',
            regionType: 'harbor',
          },
        ],
      });

      const result = validateCampaignBundle(bundle, canonContext());
      expect(result.ok).toBe(false);
      expect(result.violations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'duplicate_name', path: '$.characters[1].name' }),
          expect.objectContaining({ code: 'duplicate_name', path: '$.factions[1].name' }),
          expect.objectContaining({ code: 'duplicate_name', path: '$.locations[1].name' }),
        ]),
      );
    });

    it('rejects character name duplicating an existing canon character', () => {
      const context = {
        ...canonContext(),
        characters: [{ id: 'character-canon-cressa', name: 'Cressa Vale' }],
      };

      const bundle = validBundle({
        characters: [
          {
            id: 'char-new-cressa',
            name: 'Cressa Vale', // duplicates canon character with different id
            role: 'imposter',
            summary: 'Claims to be the warden.',
            motivation: 'Steal relics.',
            locationId: 'loc-harbor',
            factionIds: ['faction-candle-league'],
          },
        ],
      });

      const result = validateCampaignBundle(bundle, context);
      expect(result.ok).toBe(false);
      expect(result.violations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'duplicate_name',
            path: '$.characters[0].name',
            existingCanonId: 'character-canon-cressa',
          }),
        ]),
      );
    });

    it('rejects repeated summary descriptions across multiple entities', () => {
      const repeatedText = 'A coastal frontier caught between old gods and trade houses.';
      const bundle = validBundle({
        worldBrief: {
          name: 'Ember Coast',
          summary: repeatedText,
          themes: ['debt'],
          openQuestions: [],
        },
        characters: [
          {
            id: 'new-character-mira',
            name: 'Mira Voss',
            role: 'oracle',
            summary: repeatedText, // duplicate of worldBrief.summary
            motivation: 'Protect harbor.',
            locationId: 'loc-harbor',
            factionIds: ['faction-candle-league'],
          },
        ],
        locations: [
          {
            id: 'loc-harbor',
            name: 'Glasswake Harbor',
            summary: repeatedText, // duplicate of worldBrief.summary
            regionType: 'harbor',
          },
        ],
      });

      const result = validateCampaignBundle(bundle, canonContext());
      expect(result.ok).toBe(false);
      expect(result.violations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'repeated_summary',
            path: '$.characters[0].summary',
            duplicateOf: '$.worldBrief.summary',
          }),
          expect.objectContaining({
            code: 'repeated_summary',
            path: '$.locations[0].summary',
            duplicateOf: '$.worldBrief.summary',
          }),
        ]),
      );
    });

    it('rejects modern numeric-only timeline dates unless modern context requested', () => {
      const bundle = validBundle({
        timelineEvents: [
          {
            id: 'event-modern-year',
            date: '1998', // modern 4-digit year
            title: 'Modern Year Event',
            summary: 'Happened in late nineties.',
            after: ['event-old-war'],
            before: [],
            characterIds: ['new-character-mira'],
            locationIds: ['loc-harbor'],
            factionIds: ['faction-candle-league'],
          },
          {
            id: 'event-iso-date',
            date: '2024-05-12', // modern ISO date
            title: 'ISO Date Event',
            summary: 'Happened on modern calendar date.',
            after: ['event-modern-year'],
            before: [],
            characterIds: ['new-character-mira'],
            locationIds: ['loc-harbor'],
            factionIds: ['faction-candle-league'],
          },
        ],
      });

      const result = validateCampaignBundle(bundle, canonContext());
      expect(result.ok).toBe(false);
      expect(result.violations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'modern_date_disallowed',
            path: '$.timelineEvents[0].date',
            date: '1998',
          }),
          expect.objectContaining({
            code: 'modern_date_disallowed',
            path: '$.timelineEvents[1].date',
            date: '2024-05-12',
          }),
        ]),
      );
    });

    it('permits modern dates when modern context is requested', () => {
      const bundle = validBundle({
        timelineEvents: [
          {
            id: 'event-modern-year',
            date: '1998',
            title: 'Modern Year Event',
            summary: 'Happened in late nineties.',
            after: ['event-old-war'],
            before: [],
            characterIds: ['new-character-mira'],
            locationIds: ['loc-harbor'],
            factionIds: ['faction-candle-league'],
          },
        ],
      });

      const result = validateCampaignBundle(bundle, {
        ...canonContext(),
        brief: 'Draft modern urban fantasy campaign elements',
      });
      expect(result.ok).toBe(true);
      expect(result.violations).toEqual([]);
    });
  });
});
