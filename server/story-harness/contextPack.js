import { SUPPORTED_JOB_TYPES, normalizeJobType } from './taskTypes.js';

function asArray(val) {
  if (val == null) return [];
  return Array.isArray(val) ? val : [val];
}

function truncateList(items, max = 5) {
  return items.slice(0, max);
}

export function buildScopedContextPack(fullContext = {}, metadata = {}) {
  const jobType = normalizeJobType(metadata.jobType) || SUPPORTED_JOB_TYPES.CAMPAIGN_BUNDLE;
  const mustRef = new Set(asArray(metadata.mustReference).map(String));

  const allCharacters = asArray(fullContext.characters);
  const allLocations = asArray(fullContext.locations);
  const allFactions = asArray(fullContext.factions);
  const allEvents = asArray(fullContext.timelineEvents);
  const allFixedFacts = asArray(fullContext.fixedTimelineFacts);

  // Helper selectors
  const inMustRef = (item) => mustRef.has(String(item?.id));

  // Determine target entities based on metadata fields
  const targetId = String(
    metadata.targetEntityId ||
    metadata.parentEntityId ||
    metadata.parentId ||
    metadata.targetCharacterId ||
    metadata.parentEventId ||
    metadata.factionId ||
    metadata.regionId ||
    metadata.locationId ||
    ''
  );

  let scopedCharacters = [];
  let scopedLocations = [];
  let scopedFactions = [];
  let scopedEvents = [];
  let allowedDimensions = [];
  let anchorEntity = null;

  switch (jobType) {
    case SUPPORTED_JOB_TYPES.MACRO_HISTORY_TIMELINE: {
      allowedDimensions = ['timelineEvents'];
      // Sparse macro events: prioritize required references first, up to 5 anchor events
      const refEvents = allEvents.filter(inMustRef);
      const remaining = allEvents.filter((e) => !mustRef.has(e.id));
      scopedEvents = [...refEvents, ...remaining].slice(0, 5);
      scopedLocations = allLocations.filter(inMustRef);
      scopedFactions = allFactions.filter(inMustRef);
      break;
    }

    case SUPPORTED_JOB_TYPES.EVENT_HISTORY_EXPANSION: {
      allowedDimensions = ['timelineEvents', 'historicalConsequences'];
      const parentEvent = allEvents.find((e) => e.id === targetId) || allEvents[0];
      anchorEntity = parentEvent ? { type: 'timelineEvent', entity: parentEvent } : null;

      const eventRefs = new Set([
        targetId,
        ...asArray(parentEvent?.after),
        ...asArray(parentEvent?.before),
        ...mustRef,
      ]);

      scopedEvents = allEvents.filter((e) => eventRefs.has(e.id));
      if (!scopedEvents.some((e) => e.id === parentEvent?.id) && parentEvent) {
        scopedEvents.unshift(parentEvent);
      }

      // Relevant participating factions, characters, locations
      const charIds = new Set(asArray(parentEvent?.characterIds));
      const locIds = new Set(asArray(parentEvent?.locationIds));
      const facIds = new Set(asArray(parentEvent?.factionIds));

      scopedCharacters = allCharacters.filter((c) => charIds.has(c.id) || inMustRef(c));
      scopedLocations = allLocations.filter((l) => locIds.has(l.id) || inMustRef(l));
      scopedFactions = allFactions.filter((f) => facIds.has(f.id) || inMustRef(f));
      break;
    }

    case SUPPORTED_JOB_TYPES.FACTION_BELIEF_ENRICHMENT: {
      allowedDimensions = ['faith', 'shrineLocations'];
      const targetFaction = allFactions.find((f) => f.id === targetId) || allFactions[0];
      anchorEntity = targetFaction ? { type: 'faction', entity: targetFaction } : null;

      const alliedIds = new Set(asArray(targetFaction?.alliedFactionIds));
      const rivalIds = new Set(asArray(targetFaction?.rivalFactionIds));

      scopedFactions = allFactions.filter(
        (f) => f.id === targetFaction?.id || alliedIds.has(f.id) || rivalIds.has(f.id) || inMustRef(f),
      );

      // Locations tied to this faction
      scopedLocations = allLocations.filter(
        (l) => (l.political_notes && l.political_notes.includes(targetFaction?.id)) || inMustRef(l),
      );

      // Characters associated with this faction
      scopedCharacters = allCharacters.filter(
        (c) =>
          (c.relationships && JSON.stringify(c.relationships).includes(targetFaction?.id)) ||
          inMustRef(c),
      );
      break;
    }

    case SUPPORTED_JOB_TYPES.REGION_GEOPOLITICS: {
      allowedDimensions = ['territorialClaims', 'chokePoints', 'borderTensions'];
      const targetLocation = allLocations.find((l) => l.id === targetId) || allLocations[0];
      anchorEntity = targetLocation ? { type: 'location', entity: targetLocation } : null;

      scopedLocations = allLocations.filter(
        (l) => l.id === targetLocation?.id || inMustRef(l),
      );

      // Factions active in or claiming this region
      scopedFactions = allFactions.filter(
        (f) =>
          (targetLocation?.political_notes && targetLocation.political_notes.includes(f.id)) ||
          inMustRef(f),
      );
      if (scopedFactions.length === 0) {
        scopedFactions = allFactions.slice(0, 3);
      }
      break;
    }

    case SUPPORTED_JOB_TYPES.CHARACTER_FAMILY_LINEAGE: {
      allowedDimensions = ['characters', 'familyLegacy'];
      const targetChar = allCharacters.find((c) => c.id === targetId) || allCharacters[0];
      anchorEntity = targetChar ? { type: 'character', entity: targetChar } : null;

      // Characters linked to this character
      const relatedIds = new Set([targetChar?.id, ...mustRef]);
      if (Array.isArray(targetChar?.relationships)) {
        for (const rel of targetChar.relationships) {
          if (rel?.target) relatedIds.add(rel.target);
        }
      }

      scopedCharacters = allCharacters.filter((c) => relatedIds.has(c.id));
      if (!scopedCharacters.some((c) => c.id === targetChar?.id) && targetChar) {
        scopedCharacters.unshift(targetChar);
      }

      if (targetChar?.current_location_id) {
        scopedLocations = allLocations.filter(
          (l) => l.id === targetChar.current_location_id || inMustRef(l),
        );
      } else {
        scopedLocations = allLocations.filter(inMustRef);
      }

      scopedFactions = allFactions.filter(
        (f) =>
          (targetChar?.relationships && JSON.stringify(targetChar.relationships).includes(f.id)) ||
          inMustRef(f),
      );
      break;
    }

    case SUPPORTED_JOB_TYPES.ENCOUNTER_PRESSURE: {
      allowedDimensions = ['creature', 'environmentalHazard'];
      const targetLoc = allLocations.find((l) => l.id === targetId) || allLocations[0];
      anchorEntity = targetLoc ? { type: 'location', entity: targetLoc } : null;

      scopedLocations = allLocations.filter(
        (l) => l.id === targetLoc?.id || inMustRef(l),
      );

      // Nearby characters / factions
      scopedCharacters = allCharacters.filter(
        (c) => c.current_location_id === targetLoc?.id || inMustRef(c),
      );
      scopedFactions = allFactions.filter(
        (f) =>
          (targetLoc?.political_notes && targetLoc.political_notes.includes(f.id)) || inMustRef(f),
      );
      break;
    }

    case SUPPORTED_JOB_TYPES.SESSION_HOOKS: {
      allowedDimensions = ['rumors', 'hooks'];
      const targetLoc = allLocations.find((l) => l.id === targetId) || allLocations[0];
      anchorEntity = targetLoc ? { type: 'location', entity: targetLoc } : null;

      scopedLocations = allLocations.filter(
        (l) => l.id === targetLoc?.id || inMustRef(l),
      );
      scopedCharacters = allCharacters.filter(
        (c) => c.current_location_id === targetLoc?.id || inMustRef(c),
      );
      if (scopedCharacters.length === 0) {
        scopedCharacters = allCharacters.slice(0, 4);
      }
      scopedFactions = allFactions.slice(0, 3);
      scopedEvents = allEvents.slice(-3); // recent timeline events
      break;
    }

    case SUPPORTED_JOB_TYPES.CAMPAIGN_BUNDLE:
    default: {
      allowedDimensions = [
        'worldBrief',
        'characters',
        'factions',
        'locations',
        'timelineEvents',
      ];
      scopedCharacters = allCharacters.slice(0, 6);
      scopedLocations = allLocations.slice(0, 5);
      scopedFactions = allFactions.slice(0, 4);
      scopedEvents = allEvents.slice(0, 8);
      break;
    }
  }

  return {
    jobType,
    scopeLevel: metadata.scopeLevel || 'discrete_refinement',
    targetEntityId: targetId || null,
    anchorEntity,
    allowedDimensions,
    story: fullContext.story
      ? {
          id: fullContext.story.id,
          title: fullContext.story.title,
          description: fullContext.story.description,
        }
      : null,
    characters: truncateList(scopedCharacters, 6),
    locations: truncateList(scopedLocations, 5),
    factions: truncateList(scopedFactions, 4),
    timelineEvents: truncateList(scopedEvents, 6),
    fixedTimelineFacts: allFixedFacts,
    mustReference: asArray(metadata.mustReference),
    avoid: asArray(metadata.avoid),
  };
}
