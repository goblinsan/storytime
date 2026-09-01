export const SUPPORTED_JOB_TYPES = {
  MACRO_HISTORY_TIMELINE: 'macro_history_timeline',
  EVENT_HISTORY_EXPANSION: 'event_history_expansion',
  FACTION_BELIEF_ENRICHMENT: 'faction_belief_enrichment',
  REGION_GEOPOLITICS: 'region_geopolitics',
  CHARACTER_FAMILY_LINEAGE: 'character_family_lineage',
  ENCOUNTER_PRESSURE: 'encounter_pressure',
  SESSION_HOOKS: 'session_hooks',
  CAMPAIGN_BUNDLE: 'draft_campaign_asset_bundle',
};

export const JOB_TYPE_ALIASES = {
  campaign_bundle: SUPPORTED_JOB_TYPES.CAMPAIGN_BUNDLE,
  lore_history_refinement: SUPPORTED_JOB_TYPES.MACRO_HISTORY_TIMELINE,
  lore_religion_refinement: SUPPORTED_JOB_TYPES.FACTION_BELIEF_ENRICHMENT,
  lore_faction_refinement: SUPPORTED_JOB_TYPES.FACTION_BELIEF_ENRICHMENT,
  lore_geography_refinement: SUPPORTED_JOB_TYPES.REGION_GEOPOLITICS,
  lore_character_refinement: SUPPORTED_JOB_TYPES.CHARACTER_FAMILY_LINEAGE,
  lore_creature_refinement: SUPPORTED_JOB_TYPES.ENCOUNTER_PRESSURE,
  lore_interaction_hook_refinement: SUPPORTED_JOB_TYPES.SESSION_HOOKS,
  lore_session_prep_refinement: SUPPORTED_JOB_TYPES.SESSION_HOOKS,
};

export function normalizeJobType(jobType) {
  if (!jobType) return null;
  const raw = String(jobType).trim().toLowerCase();
  if (Object.values(SUPPORTED_JOB_TYPES).includes(raw)) {
    return raw;
  }
  if (JOB_TYPE_ALIASES[raw]) {
    return JOB_TYPE_ALIASES[raw];
  }
  return null;
}

export function isSupportedJobType(jobType) {
  return Boolean(normalizeJobType(jobType));
}

export const TASK_TYPE_SCHEMAS = {
  [SUPPORTED_JOB_TYPES.MACRO_HISTORY_TIMELINE]: {
    allowedTopLevelKeys: new Set(['jobType', 'schemaVersion', 'timelineEvents']),
    forbiddenTopLevelKeys: new Set(['characters', 'factions', 'locations', 'creature', 'rumors']),
    instructions: [
      'Generate a sparse high-level timeline of major historical eras or millennia for the story setting.',
      'Return JSON only with no markdown formatting.',
      'Do not use modern numeric Gregorian years (e.g. 1998, 2024). Use era markers or in-world epoch names (e.g. "First Millennium Before Shrines", "Year 150 of the Maritime Compact").',
      'Ensure timeline events form a consistent before/after sequence.',
      'Do not declare ground-level NPCs, tavern rumors, or localized encounter monsters in this macro timeline task.',
    ],
    outputContract: {
      jobType: SUPPORTED_JOB_TYPES.MACRO_HISTORY_TIMELINE,
      schemaVersion: 1,
      timelineEvents: [
        {
          id: 'event-<era-slug>',
          date: 'Epoch or era name (e.g. "Age of Tides", "Second Century of the Iron Accord")',
          title: 'string',
          summary: 'string',
          after: ['event-... id, optional'],
          before: ['event-... id, optional'],
        },
      ],
    },
  },

  [SUPPORTED_JOB_TYPES.EVENT_HISTORY_EXPANSION]: {
    allowedTopLevelKeys: new Set([
      'jobType',
      'schemaVersion',
      'parentEventId',
      'timelineEvents',
      'historicalConsequences',
    ]),
    forbiddenTopLevelKeys: new Set(['creature', 'rumors', 'worldBrief']),
    instructions: [
      'Expand the specified parent historical event into a smaller causal chain of turning points or crisis years.',
      'Return JSON only with no markdown formatting.',
      'Reference the parentEventId exactly.',
      'Sequence events using in-world phases or relative crisis years (e.g. "Year 10 of the Iron Siege").',
      'Reference existing canon characters, factions, and locations where relevant.',
    ],
    outputContract: {
      jobType: SUPPORTED_JOB_TYPES.EVENT_HISTORY_EXPANSION,
      schemaVersion: 1,
      parentEventId: 'event-... (must reference the target parent event)',
      timelineEvents: [
        {
          id: 'event-<slug>',
          date: 'Phase or relative year (e.g. "Phase 1: Sinking of the Fleet", "Year 22 of the Siege")',
          title: 'string',
          summary: 'string',
          after: ['preceding event id'],
          before: ['subsequent event id'],
          characterIds: ['existing or declared character id'],
          locationIds: ['existing or declared location id'],
          factionIds: ['existing or declared faction id'],
        },
      ],
      historicalConsequences: ['string, optional lasting impact'],
    },
  },

  [SUPPORTED_JOB_TYPES.FACTION_BELIEF_ENRICHMENT]: {
    allowedTopLevelKeys: new Set([
      'jobType',
      'schemaVersion',
      'factionId',
      'faith',
      'shrineLocations',
    ]),
    forbiddenTopLevelKeys: new Set(['characters', 'timelineEvents', 'creature']),
    instructions: [
      'Enrich the specified faction with theological doctrine, public tenets, sacred taboos, and holy shrines.',
      'Return JSON only with no markdown formatting.',
      'Reference the target factionId exactly.',
      'Do not duplicate existing faction records; enrich the faith and ritual practices of the existing faction.',
      'Include at least one actionable sacred taboo that believers must not violate.',
    ],
    outputContract: {
      jobType: SUPPORTED_JOB_TYPES.FACTION_BELIEF_ENRICHMENT,
      schemaVersion: 1,
      factionId: 'faction-... (must reference target faction)',
      faith: {
        name: 'Name of the covenant, faith, or monastic order',
        publicTenets: ['string tenet'],
        sacredTaboos: ['actionable taboo observed by followers'],
        ritualGreeting: 'Formal liturgical greeting or oath',
      },
      shrineLocations: [
        {
          id: 'loc-shrine-<slug>',
          name: 'Shrine or temple sanctuary name',
          summary: 'Description of the holy ground, altar, or relic kept here',
          parentLocationId: 'existing loc-... where this shrine is located',
        },
      ],
    },
  },

  [SUPPORTED_JOB_TYPES.REGION_GEOPOLITICS]: {
    allowedTopLevelKeys: new Set([
      'jobType',
      'schemaVersion',
      'regionId',
      'territorialClaims',
      'chokePoints',
      'borderTensions',
    ]),
    forbiddenTopLevelKeys: new Set(['characters', 'creature', 'worldBrief']),
    instructions: [
      'Define geopolitical boundaries, contested territory, fortifications, and choke points for the target region.',
      'Return JSON only with no markdown formatting.',
      'Reference the target regionId and existing faction IDs.',
      'Highlight trade bottlenecks, contested borders, and treaty friction points.',
    ],
    outputContract: {
      jobType: SUPPORTED_JOB_TYPES.REGION_GEOPOLITICS,
      schemaVersion: 1,
      regionId: 'loc-... (must reference target region or territory)',
      territorialClaims: [
        {
          factionId: 'existing faction-...',
          claimType: 'historic | fortified | contested | treaty_border',
          summary: 'Nature of the claim or fortification',
        },
      ],
      chokePoints: [
        {
          id: 'loc-<slug>',
          name: 'Watchpost, gatehouse, or narrows name',
          summary: 'Description of the geographical or military choke point',
          controllingFactionId: 'existing faction-...',
        },
      ],
      borderTensions: 'Summary of the immediate political friction along the border',
    },
  },

  [SUPPORTED_JOB_TYPES.CHARACTER_FAMILY_LINEAGE]: {
    allowedTopLevelKeys: new Set([
      'jobType',
      'schemaVersion',
      'targetCharacterId',
      'characters',
      'familyLegacy',
    ]),
    forbiddenTopLevelKeys: new Set(['worldBrief', 'creature', 'factions', 'timelineEvents']),
    instructions: [
      'Establish a 2-to-3 generation family lineage and heirloom legacy around the target character.',
      'Return JSON only with no markdown formatting.',
      'Reference targetCharacterId exactly.',
      'Declare parents, ancestors, or siblings with distinct names and explicit relationship links.',
      'Do not rewrite the target character; anchor relatives around their established background.',
    ],
    outputContract: {
      jobType: SUPPORTED_JOB_TYPES.CHARACTER_FAMILY_LINEAGE,
      schemaVersion: 1,
      targetCharacterId: 'character-... (must reference target character)',
      characters: [
        {
          id: 'character-<slug>',
          name: 'Full relative name (no duplicates)',
          role: 'Relative role or trade (e.g. "Retired Shipwright", "Smuggler Sibling")',
          summary: 'Brief background and connection to the family fortune or debt',
          relationships: [
            {
              target: 'character-... (targetCharacterId or relative id)',
              type: 'parent | child | sibling | spouse',
            },
          ],
        },
      ],
      familyLegacy: {
        heirloomName: 'Name of the ancestral item, signet, or debt slip',
        summary: 'Origin and consequence of the heirloom in current times',
      },
    },
  },

  [SUPPORTED_JOB_TYPES.ENCOUNTER_PRESSURE]: {
    allowedTopLevelKeys: new Set([
      'jobType',
      'schemaVersion',
      'locationId',
      'creature',
      'environmentalHazard',
    ]),
    forbiddenTopLevelKeys: new Set(['worldBrief', 'factions', 'timelineEvents']),
    instructions: [
      'Define a localized creature or predator pressure and an environmental hazard for the target location.',
      'Return JSON only with no markdown formatting.',
      'Reference the target locationId exactly.',
      'Include sensory details, hunting tactics, weaknesses, and a harvestable yield or tell.',
      'Ground the encounter in the local terrain without declaring planetary-scale monsters.',
    ],
    outputContract: {
      jobType: SUPPORTED_JOB_TYPES.ENCOUNTER_PRESSURE,
      schemaVersion: 1,
      locationId: 'loc-... (must reference target location)',
      creature: {
        id: 'creature-<slug>',
        name: 'Creature or mob species name',
        morphology: 'Physical description and adaptations to the terrain',
        tactics: 'How the creature stalks, attacks, or protects its lair',
        weakness: 'Vulnerability or method to deter the creature',
        harvestableYield: 'Useful alchemical component, pelt, or sensory tell',
      },
      environmentalHazard: {
        id: 'hazard-<slug>',
        name: 'Hazard name (e.g. cave-in, flash tide, toxic spore vent)',
        summary: 'How the environment endangers explorers in this location',
      },
    },
  },

  [SUPPORTED_JOB_TYPES.SESSION_HOOKS]: {
    allowedTopLevelKeys: new Set([
      'jobType',
      'schemaVersion',
      'locationId',
      'rumors',
      'hooks',
    ]),
    forbiddenTopLevelKeys: new Set(['worldBrief', 'creature', 'timelineEvents']),
    instructions: [
      'Generate immediate table-ready rumors and actionable adventure hooks set in the target location.',
      'Return JSON only with no markdown formatting.',
      'Reference the target locationId and active canon characters or factions.',
      'Include at least one rumor with truthRating "half-truth" or "deliberate_falsehood".',
      'Hooks must be immediately actionable for visitors arriving at the settlement or venue.',
    ],
    outputContract: {
      jobType: SUPPORTED_JOB_TYPES.SESSION_HOOKS,
      schemaVersion: 1,
      locationId: 'loc-... (must reference target location/settlement)',
      rumors: [
        {
          id: 'rumor-<slug>',
          text: 'The rumor whispered by locals',
          speakerRole: 'Role of the speaker (e.g. dockworker, nervous acolyte)',
          truthRating: 'true | half-truth | deliberate_falsehood',
        },
      ],
      hooks: [
        {
          id: 'hook-<slug>',
          title: 'Title of the opportunity or job',
          summary: 'Actionable lead and immediate risk/reward',
          involvedCharacterIds: ['existing or declared character id, optional'],
          involvedFactionIds: ['existing or declared faction id, optional'],
        },
      ],
    },
  },

  [SUPPORTED_JOB_TYPES.CAMPAIGN_BUNDLE]: {
    allowedTopLevelKeys: new Set([
      'jobType',
      'schemaVersion',
      'worldBrief',
      'characters',
      'factions',
      'locations',
      'timelineEvents',
    ]),
    forbiddenTopLevelKeys: new Set([]),
    instructions: [
      'Generate draft material only; do not declare anything canon.',
      'Return a single JSON object with no markdown.',
      'Use stable, descriptive, slugified IDs with the listed prefixes for new entities (e.g. "character-cressa-vale", "loc-deep-quay", "faction-candle-league", "event-beacon-darkens"). Do not use generic numeric placeholders like "character-char-001" or "loc-loc-001".',
      'Ensure all character, faction, and location names are distinct and unique. Do not repeat names within the bundle or duplicate existing canon names.',
      'Write distinct, evocative summary text for each entity. Do not repeat identical summaries across multiple characters, locations, or factions.',
      'Use campaign-appropriate in-world calendar dates or narrative era markers for timeline events (e.g. "14 Frostfall", "Year 3 of the Beacon", "Era of Oaths"). Do not use modern numeric Gregorian years (e.g. 1998, 2024) unless the task brief explicitly requests a modern setting.',
      'Reference existing ids exactly when using existing StoryTime context.',
      'Keep scope bounded to the dashboard task brief and focus.',
    ],
    outputContract: {
      jobType: SUPPORTED_JOB_TYPES.CAMPAIGN_BUNDLE,
      schemaVersion: 1,
      requiredTopLevelKeys: [
        'jobType',
        'schemaVersion',
        'worldBrief',
        'characters',
        'factions',
        'locations',
        'timelineEvents',
      ],
      worldBrief: {
        name: 'string',
        summary: 'string',
        themes: ['string'],
        openQuestions: ['string'],
      },
      character: {
        id: 'character-...',
        name: 'string',
        role: 'string',
        summary: 'string',
        motivation: 'string',
        locationId: 'existing loc-* id or generated location id, optional',
        factionIds: ['existing faction-* id or generated faction id'],
      },
      faction: {
        id: 'faction-...',
        name: 'string',
        summary: 'string',
        goal: 'string',
        pressure: 'string',
      },
      location: {
        id: 'loc-...',
        name: 'string',
        summary: 'string',
        regionType: 'string',
      },
      timelineEvent: {
        id: 'event-...',
        date: 'string',
        title: 'string',
        summary: 'string',
        after: ['existing or generated event id'],
        before: ['existing or generated event id'],
        characterIds: ['existing or generated character id'],
        locationIds: ['existing or generated location id'],
        factionIds: ['existing or generated faction id'],
      },
    },
  },
};
