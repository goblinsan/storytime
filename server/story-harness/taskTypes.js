export const SUPPORTED_JOB_TYPES = {
  MACRO_HISTORY_TIMELINE: 'macro_history_timeline',
  EVENT_HISTORY_EXPANSION: 'event_history_expansion',
  FACTION_BELIEF_ENRICHMENT: 'faction_belief_enrichment',
  REGION_GEOPOLITICS: 'region_geopolitics',
  CHARACTER_FAMILY_LINEAGE: 'character_family_lineage',
  ENCOUNTER_PRESSURE: 'encounter_pressure',
  SESSION_HOOKS: 'session_hooks',
  RELIGION_BELIEF_LORE: 'religion_belief_lore',
  LANGUAGE_CULTURE_CONVENTIONS: 'language_culture_conventions',
  BESTIARY_ENTRY_REFINEMENT: 'bestiary_entry_refinement',
  LOCATION_HIERARCHY_REFINEMENT: 'location_hierarchy_refinement',
  DERIVATIVE_OUTLINE_GENERATION: 'derivative_outline_generation',
  CHAPTER_PROSE_COMPOSITION: 'chapter_prose_composition',
  CAMPAIGN_BUNDLE: 'draft_campaign_asset_bundle',
  FACTION_POLITICS_REFINEMENT: 'faction_politics_refinement',
  TECHNOLOGY_LORE_REFINEMENT: 'technology_lore_refinement',
  STAR_SYSTEM_REFINEMENT: 'star_system_refinement',
  MYSTERY_SIGNAL_REFINEMENT: 'mystery_signal_refinement',
};

export const JOB_TYPE_ALIASES = {
  campaign_bundle: SUPPORTED_JOB_TYPES.CAMPAIGN_BUNDLE,
  lore_history_refinement: SUPPORTED_JOB_TYPES.MACRO_HISTORY_TIMELINE,
  lore_religion_refinement: SUPPORTED_JOB_TYPES.FACTION_BELIEF_ENRICHMENT,
  religion_lore: SUPPORTED_JOB_TYPES.RELIGION_BELIEF_LORE,
  lore_culture_refinement: SUPPORTED_JOB_TYPES.LANGUAGE_CULTURE_CONVENTIONS,
  lore_language_refinement: SUPPORTED_JOB_TYPES.LANGUAGE_CULTURE_CONVENTIONS,
  culture_language_conventions: SUPPORTED_JOB_TYPES.LANGUAGE_CULTURE_CONVENTIONS,
  lore_faction_refinement: SUPPORTED_JOB_TYPES.FACTION_BELIEF_ENRICHMENT,
  lore_geography_refinement: SUPPORTED_JOB_TYPES.REGION_GEOPOLITICS,
  location_hierarchy: SUPPORTED_JOB_TYPES.LOCATION_HIERARCHY_REFINEMENT,
  lore_character_refinement: SUPPORTED_JOB_TYPES.CHARACTER_FAMILY_LINEAGE,
  lore_creature_refinement: SUPPORTED_JOB_TYPES.BESTIARY_ENTRY_REFINEMENT,
  bestiary_refinement: SUPPORTED_JOB_TYPES.BESTIARY_ENTRY_REFINEMENT,
  lore_interaction_hook_refinement: SUPPORTED_JOB_TYPES.SESSION_HOOKS,
  lore_session_prep_refinement: SUPPORTED_JOB_TYPES.SESSION_HOOKS,
  derivative_outline: SUPPORTED_JOB_TYPES.DERIVATIVE_OUTLINE_GENERATION,
  draft_derivative_outline: SUPPORTED_JOB_TYPES.DERIVATIVE_OUTLINE_GENERATION,
  chapter_prose_composition: SUPPORTED_JOB_TYPES.CHAPTER_PROSE_COMPOSITION,
  chapter_prose: SUPPORTED_JOB_TYPES.CHAPTER_PROSE_COMPOSITION,
  story_composer: SUPPORTED_JOB_TYPES.CHAPTER_PROSE_COMPOSITION,
  prose_composition: SUPPORTED_JOB_TYPES.CHAPTER_PROSE_COMPOSITION,
  compose_chapter: SUPPORTED_JOB_TYPES.CHAPTER_PROSE_COMPOSITION,
  faction_politics: SUPPORTED_JOB_TYPES.FACTION_POLITICS_REFINEMENT,
  corporate_politics: SUPPORTED_JOB_TYPES.FACTION_POLITICS_REFINEMENT,
  technology_lore: SUPPORTED_JOB_TYPES.TECHNOLOGY_LORE_REFINEMENT,
  tech_lore: SUPPORTED_JOB_TYPES.TECHNOLOGY_LORE_REFINEMENT,
  star_system: SUPPORTED_JOB_TYPES.STAR_SYSTEM_REFINEMENT,
  system_geography: SUPPORTED_JOB_TYPES.STAR_SYSTEM_REFINEMENT,
  mystery_signal: SUPPORTED_JOB_TYPES.MYSTERY_SIGNAL_REFINEMENT,
  signal_transmission: SUPPORTED_JOB_TYPES.MYSTERY_SIGNAL_REFINEMENT,
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
      'Do not use modern numeric Gregorian years (such as 1998 or 2024). Use setting-appropriate in-world epoch names or era phrases.',
      'Ensure timeline events form a consistent before/after sequence.',
      'Do not declare ground-level NPCs, tavern rumors, or localized encounter monsters in this macro timeline task.',
    ],
    outputContract: {
      jobType: SUPPORTED_JOB_TYPES.MACRO_HISTORY_TIMELINE,
      schemaVersion: 1,
      timelineEvents: [
        {
          id: 'event-<era-slug>',
          date: '<string: in-world epoch or era name>',
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
      'Sequence events using in-world phases or relative crisis turning points.',
      'Reference existing canon characters, factions, and locations where relevant.',
    ],
    outputContract: {
      jobType: SUPPORTED_JOB_TYPES.EVENT_HISTORY_EXPANSION,
      schemaVersion: 1,
      parentEventId: 'event-... (must reference the target parent event)',
      timelineEvents: [
        {
          id: 'event-<slug>',
          date: '<string: in-world phase, season, or relative milestone>',
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
          role: '<string: relative role, profession, or family trade>',
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
        name: '<string: localized hazard name appropriate to the terrain>',
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
          speakerRole: '<string: social station or trade of the speaker>',
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
      'Use stable, descriptive, slugified IDs with the listed prefixes for new entities (format: "character-<slug>", "loc-<slug>", "faction-<slug>", "event-<slug>"). Do not use generic numeric placeholders like "character-char-001" or "loc-loc-001".',
      'Ensure all character, faction, and location names are distinct and unique. Do not repeat names within the bundle or duplicate existing canon names.',
      'Write distinct, evocative summary text for each entity. Do not repeat identical summaries across multiple characters, locations, or factions.',
      'Use setting-appropriate in-world calendar dates or narrative era markers for timeline events. Do not use modern numeric Gregorian years unless the task brief explicitly requests a modern setting.',
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

  [SUPPORTED_JOB_TYPES.RELIGION_BELIEF_LORE]: {
    allowedTopLevelKeys: new Set([
      'jobType',
      'schemaVersion',
      'canonDimension',
      'religionName',
      'deities',
      'coreTenets',
      'sacredRites',
      'taboos',
      'associatedFactionIds',
      'holySites',
    ]),
    forbiddenTopLevelKeys: new Set(['characters', 'creatures', 'rumors', 'worldBrief']),
    instructions: [
      'Refine religion, faith, deities, and sacred traditions for the universe encyclopedia.',
      'Return JSON only with no markdown formatting.',
      'Explicitly set canonDimension to "religion".',
      'Define sacred rites, divine mandates, and religious taboos.',
      'Reference existing faction ids and holy site location ids where relevant.',
    ],
    outputContract: {
      jobType: SUPPORTED_JOB_TYPES.RELIGION_BELIEF_LORE,
      schemaVersion: 1,
      canonDimension: 'religion',
      religionName: 'string',
      deities: [{ name: 'string', domain: 'string', symbol: 'string' }],
      coreTenets: ['string'],
      sacredRites: ['string'],
      taboos: ['string'],
      associatedFactionIds: ['faction-* id, optional'],
      holySites: [{ locationId: 'loc-* id, optional', name: 'string', description: 'string' }],
    },
  },

  [SUPPORTED_JOB_TYPES.LANGUAGE_CULTURE_CONVENTIONS]: {
    allowedTopLevelKeys: new Set([
      'jobType',
      'schemaVersion',
      'canonDimension',
      'languageName',
      'culturalGroup',
      'namingConventions',
      'commonPhrases',
      'valuesAndTaboos',
      'associatedLocationIds',
    ]),
    forbiddenTopLevelKeys: new Set(['characters', 'creatures', 'rumors', 'worldBrief']),
    instructions: [
      'Refine language naming conventions, vocabulary, and cultural values for the universe encyclopedia.',
      'Return JSON only with no markdown formatting.',
      'Explicitly set canonDimension to "culture".',
      'Provide concrete naming rules for characters, places, and relics.',
      'Reference associated location ids where this culture/language is spoken.',
    ],
    outputContract: {
      jobType: SUPPORTED_JOB_TYPES.LANGUAGE_CULTURE_CONVENTIONS,
      schemaVersion: 1,
      canonDimension: 'culture',
      languageName: 'string',
      culturalGroup: 'string',
      namingConventions: {
        personalNamesMale: ['string'],
        personalNamesFemale: ['string'],
        surnamesOrClans: ['string'],
        placeNameSuffixes: ['string'],
      },
      commonPhrases: [{ phrase: 'string', meaning: 'string' }],
      valuesAndTaboos: ['string'],
      associatedLocationIds: ['loc-* id, optional'],
    },
  },

  [SUPPORTED_JOB_TYPES.BESTIARY_ENTRY_REFINEMENT]: {
    allowedTopLevelKeys: new Set([
      'jobType',
      'schemaVersion',
      'canonDimension',
      'name',
      'category',
      'hearts',
      'tactics',
      'habitats',
      'description',
      'notes',
      'associatedLocationIds',
    ]),
    forbiddenTopLevelKeys: new Set(['characters', 'factions', 'timelineEvents', 'worldBrief']),
    instructions: [
      'Catalog a creature or ecological threat entry for the universe bestiary.',
      'Return JSON only with no markdown formatting.',
      'Explicitly set canonDimension to "bestiary".',
      'Provide creature name, category, hearts (1-20), tactics list, and ecological description.',
      'Reference associated habitat location ids.',
    ],
    outputContract: {
      jobType: SUPPORTED_JOB_TYPES.BESTIARY_ENTRY_REFINEMENT,
      schemaVersion: 1,
      canonDimension: 'bestiary',
      name: 'string',
      category: 'string',
      hearts: 'number',
      tactics: ['string'],
      habitats: ['string'],
      description: 'string',
      notes: 'string, optional',
      associatedLocationIds: ['loc-* id, optional'],
    },
  },

  [SUPPORTED_JOB_TYPES.LOCATION_HIERARCHY_REFINEMENT]: {
    allowedTopLevelKeys: new Set([
      'jobType',
      'schemaVersion',
      'canonDimension',
      'parentLocationId',
      'subLocations',
      'regionalFeatures',
      'travelHazards',
    ]),
    forbiddenTopLevelKeys: new Set(['characters', 'creatures', 'rumors', 'worldBrief']),
    instructions: [
      'Refine the geographic hierarchy of a region into sub-locations and landmarks.',
      'Return JSON only with no markdown formatting.',
      'Explicitly set canonDimension to "geography".',
      'Must reference the target parentLocationId exactly.',
      'Define distinct child locations with slugified IDs and region types.',
    ],
    outputContract: {
      jobType: SUPPORTED_JOB_TYPES.LOCATION_HIERARCHY_REFINEMENT,
      schemaVersion: 1,
      canonDimension: 'geography',
      parentLocationId: 'loc-* id',
      subLocations: [
        {
          id: 'loc-<slug>',
          name: 'string',
          regionType: 'string',
          summary: 'string',
        },
      ],
      regionalFeatures: ['string'],
      travelHazards: ['string'],
    },
  },

  [SUPPORTED_JOB_TYPES.DERIVATIVE_OUTLINE_GENERATION]: {
    allowedTopLevelKeys: new Set([
      'jobType',
      'schemaVersion',
      'canonDimension',
      'derivativeType',
      'title',
      'logline',
      'premise',
      'structure',
      'sourceCanonReferences',
    ]),
    forbiddenTopLevelKeys: new Set(['creatures', 'rumors', 'worldBrief']),
    instructions: [
      'Generate a structured downstream derivative outline derived from universe encyclopedia facts.',
      'Return JSON only with no markdown formatting.',
      'Explicitly set canonDimension to "derivative".',
      'derivativeType must be one of: campaign, story, screenplay, game_concept, storyboard.',
      'Cite existing universe canon references (characters, locations, factions, events) under sourceCanonReferences.',
    ],
    outputContract: {
      jobType: SUPPORTED_JOB_TYPES.DERIVATIVE_OUTLINE_GENERATION,
      schemaVersion: 1,
      canonDimension: 'derivative',
      derivativeType: 'campaign | story | screenplay | game_concept | storyboard',
      title: 'string',
      logline: 'string',
      premise: 'string',
      structure: {
        sections: [{ title: 'string', summary: 'string' }],
      },
      sourceCanonReferences: [
        { entityType: 'character | location | faction | timeline_event | bestiary', entityId: 'string', name: 'string' },
      ],
    },
  },

  [SUPPORTED_JOB_TYPES.CHAPTER_PROSE_COMPOSITION]: {
    allowedTopLevelKeys: new Set([
      'jobType',
      'schemaVersion',
      'canonDimension',
      'targetChapterId',
      'chapterTitle',
      'chapterNumber',
      'prose',
      'wordCount',
      'sourceCanonReferences',
    ]),
    forbiddenTopLevelKeys: new Set(['creatures', 'rumors', 'worldBrief']),
    instructions: [
      'Compose rich, publication-grade novelistic prose from the provided chapter scene beats, character profiles, sensory details, and canonical timeline facts.',
      'Write with immersive literary depth: sensory realization (scents of sulfur and sea-brine, tactile chill of damp basalt), psychological interiority, atmospheric mood, and dialogue with distinct character voices.',
      'Do NOT write outlines, summaries, or metadata (never include "Beat 1:", "Act I:", "In this beat...", or bullet points). Write continuous novel chapters.',
      'Thread the scene beats together with seamless narrative transitions.',
      'Return JSON only with the fully realized prose string under the "prose" key.',
    ],
    outputContract: {
      jobType: SUPPORTED_JOB_TYPES.CHAPTER_PROSE_COMPOSITION,
      schemaVersion: 1,
      canonDimension: 'derivative',
      targetChapterId: 'string',
      chapterTitle: 'string',
      chapterNumber: 1,
      prose: 'string (full continuous novel prose paragraphs)',
      wordCount: 800,
      sourceCanonReferences: [
        { entityType: 'character | location | faction | timeline_event | bestiary', entityId: 'string', name: 'string' },
      ],
    },
  },

  [SUPPORTED_JOB_TYPES.FACTION_POLITICS_REFINEMENT]: {
    allowedTopLevelKeys: new Set([
      'jobType',
      'schemaVersion',
      'canonDimension',
      'factionId',
      'politics',
      'assets',
      'rivalries',
      'sourceCanonReferences',
    ]),
    forbiddenTopLevelKeys: new Set(['creatures', 'rumors', 'worldBrief']),
    instructions: [
      'Refine the specified faction with political doctrine, corporate/charter structure, fleet or security assets, economic leverage, and strategic rivalries.',
      'Return JSON only with no markdown formatting.',
      'Reference the target factionId exactly.',
      'Detail setting-appropriate economic leverage, treaties, trade monopolies, or strategic resource concessions.',
    ],
    outputContract: {
      jobType: SUPPORTED_JOB_TYPES.FACTION_POLITICS_REFINEMENT,
      schemaVersion: 1,
      canonDimension: 'factions',
      factionId: 'faction-... (must reference target faction)',
      politics: {
        doctrine: 'Core governing charter or operating philosophy',
        corporateStructure: 'Executive board, directorate, or syndicate hierarchy',
        economicLeverage: 'Key monopolies, resources, or debt instruments',
      },
      assets: [
        {
          name: '<string: descriptive asset or unit designation>',
          type: 'fleet | station | mercenary_unit | patent_monopoly',
          summary: 'Capabilities and strategic role',
        },
      ],
      rivalries: [
        {
          factionId: 'faction-... (rival faction ID)',
          reason: 'Source of conflict or trade friction',
          status: 'cold_war | active_skirmish | trade_war',
        },
      ],
      sourceCanonReferences: [
        { entityType: 'faction | character | location | timeline_event', entityId: 'string', name: 'string' },
      ],
    },
  },

  [SUPPORTED_JOB_TYPES.TECHNOLOGY_LORE_REFINEMENT]: {
    allowedTopLevelKeys: new Set([
      'jobType',
      'schemaVersion',
      'canonDimension',
      'tech',
      'sourceCanonReferences',
    ]),
    forbiddenTopLevelKeys: new Set(['creatures', 'rumors', 'worldBrief']),
    instructions: [
      'Define an advanced sci-fi technological system, cybernetic augmentation, or forbidden quantum-necromantic discipline.',
      'Return JSON only with no markdown formatting.',
      'Detail technical classification, core physics/bio-resonant principles, strict operational limitations, and patents or taboos.',
    ],
    outputContract: {
      jobType: SUPPORTED_JOB_TYPES.TECHNOLOGY_LORE_REFINEMENT,
      schemaVersion: 1,
      canonDimension: 'technology',
      tech: {
        id: 'tech-<slug>',
        name: 'Technology system name',
        classification: 'cybernetics | quantum_necromancy | slipstream_drive | weapon_system | bio_synthesis',
        principles: 'How the technology operates mechanically and metaphysically',
        limitations: 'Vulnerabilities, fuel/power costs, neural decay risks',
        proliferation: 'experimental | proprietary_cartel | black_market | extinct',
        patentsOrTaboos: 'Corporate licensing restrictions or inter-stellar prohibitions',
      },
      sourceCanonReferences: [
        { entityType: 'character | faction | location | timeline_event', entityId: 'string', name: 'string' },
      ],
    },
  },

  [SUPPORTED_JOB_TYPES.STAR_SYSTEM_REFINEMENT]: {
    allowedTopLevelKeys: new Set([
      'jobType',
      'schemaVersion',
      'canonDimension',
      'starSystem',
      'sourceCanonReferences',
    ]),
    forbiddenTopLevelKeys: new Set(['creatures', 'rumors', 'worldBrief']),
    instructions: [
      'Define a celestial star system, planetary bodies, orbital installations, and navigational hazards.',
      'Return JSON only with no markdown formatting.',
      'Set hazardTier to one of: low, contested, lethal, uncharted.',
    ],
    outputContract: {
      jobType: SUPPORTED_JOB_TYPES.STAR_SYSTEM_REFINEMENT,
      schemaVersion: 1,
      canonDimension: 'geography',
      starSystem: {
        id: 'loc-system-<slug>',
        name: 'System name',
        starClass: '<string: stellar classification or astrophysical type>',
        hazardTier: 'low | contested | lethal | uncharted',
        controllingFactionId: 'faction-... (optional)',
        planetaryBodies: [
          {
            id: 'loc-planet-<slug>',
            name: 'Planet or asteroid name',
            type: 'terrestrial | gas_giant | asteroid_cluster | shattered_world',
            summary: 'Environment and atmosphere details',
          },
        ],
        orbitalStations: [
          {
            id: 'loc-station-<slug>',
            name: 'Orbital station or dock name',
            type: 'scavenger_hub | corporate_citadel | military_slipway | ghost_hulk',
            summary: 'Population, docking capacity, and control',
          },
        ],
      },
      sourceCanonReferences: [
        { entityType: 'faction | character | location | timeline_event', entityId: 'string', name: 'string' },
      ],
    },
  },

  [SUPPORTED_JOB_TYPES.MYSTERY_SIGNAL_REFINEMENT]: {
    allowedTopLevelKeys: new Set([
      'jobType',
      'schemaVersion',
      'canonDimension',
      'signal',
      'sourceCanonReferences',
    ]),
    forbiddenTopLevelKeys: new Set(['creatures', 'rumors', 'worldBrief']),
    instructions: [
      'Define an anomalous cosmic transmission, acoustic ghost beacon, or subspace anomaly.',
      'Return JSON only with no markdown formatting.',
      'Include frequency, origin vector, anomalous physical/psychic properties, and decoded transmission transcript.',
    ],
    outputContract: {
      jobType: SUPPORTED_JOB_TYPES.MYSTERY_SIGNAL_REFINEMENT,
      schemaVersion: 1,
      canonDimension: 'lore_mystery',
      signal: {
        id: 'signal-<slug>',
        designation: '<string: unique, setting-appropriate designation or signal callsign>',
        frequency: '<string: transmission medium, frequency band, or harmonic resonance>',
        originVector: '<string: setting-appropriate spatial vector, coordinates, or origin region>',
        anomalousProperties: ['Unusual physical, temporal, or psychic properties'],
        transmissionTranscript: 'Decoded audio log, whisper fragment, or telepathic pulse text',
      },
      sourceCanonReferences: [
        { entityType: 'character | faction | location | timeline_event', entityId: 'string', name: 'string' },
      ],
    },
  },
};
