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
});
