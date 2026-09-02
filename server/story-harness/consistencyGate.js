import {
  SUPPORTED_JOB_TYPES,
  TASK_TYPE_SCHEMAS,
  normalizeJobType,
} from './taskTypes.js';
import { evaluateDraftQuality, deriveFactRules } from './critiqueGate.js';
const TOP_LEVEL_FIELDS = new Set([
  'jobType',
  'schemaVersion',
  'worldBrief',
  'characters',
  'factions',
  'locations',
  'timelineEvents',
]);

const WORLD_BRIEF_FIELDS = new Set([
  'name',
  'summary',
  'themes',
  'openQuestions',
]);

const CHARACTER_FIELDS = new Set([
  'id',
  'name',
  'role',
  'summary',
  'motivation',
  'locationId',
  'factionIds',
]);

const FACTION_FIELDS = new Set([
  'id',
  'name',
  'summary',
  'goal',
  'goals',
  'pressure',
  'alliedFactionIds',
  'rivalFactionIds',
]);

const LOCATION_FIELDS = new Set([
  'id',
  'name',
  'summary',
  'regionType',
  'factionIds',
]);

const TIMELINE_EVENT_FIELDS = new Set([
  'id',
  'date',
  'title',
  'summary',
  'after',
  'before',
  'characterIds',
  'locationIds',
  'factionIds',
]);

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function asId(value) {
  if (value == null) return '';
  return String(value).trim();
}

function addViolation(violations, code, path, message, detail = {}) {
  violations.push({ code, path, message, ...detail });
}

function checkAllowedFields(value, allowed, path, violations) {
  if (!isObject(value)) return;
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      addViolation(
        violations,
        'unknown_field',
        `${path}.${key}`,
        `Field is not allowed for ${path}.`,
        { field: key },
      );
    }
  }
}

function collectIds(items) {
  const ids = new Set();
  for (const item of asArray(items)) {
    const id = asId(item?.id);
    if (id) ids.add(id);
  }
  return ids;
}

function mergeSets(...sets) {
  const merged = new Set();
  for (const set of sets) {
    for (const value of set) merged.add(value);
  }
  return merged;
}

function referencedIds(value) {
  return asArray(value).map(asId).filter(Boolean);
}

function rejectUnknownReferences(violations, refs, known, path, kind) {
  for (const id of refs) {
    if (!known.has(id)) {
      addViolation(
        violations,
        'unknown_reference',
        path,
        `Unknown ${kind} reference.`,
        { kind, id },
      );
    }
  }
}

function collectFixedTimelineFacts(context) {
  const facts = [
    ...asArray(context?.fixedTimelineFacts),
    ...asArray(context?.timelineFacts),
  ];
  return facts
    .map((fact) => ({
      before: asId(fact?.before),
      after: asId(fact?.after),
    }))
    .filter((fact) => fact.before && fact.after);
}

function hasPath(graph, from, to, visited = new Set()) {
  if (from === to) return true;
  if (visited.has(from)) return false;
  visited.add(from);
  for (const next of graph.get(from) ?? []) {
    if (hasPath(graph, next, to, visited)) return true;
  }
  return false;
}

function addEdge(graph, before, after) {
  if (!graph.has(before)) graph.set(before, new Set());
  graph.get(before).add(after);
}

function checkTimelineOrder(bundle, context, knownEvents, violations) {
  const graph = new Map();

  for (const event of asArray(bundle.timelineEvents)) {
    const eventId = asId(event?.id);
    if (!eventId) continue;

    for (const beforeId of referencedIds(event.before)) {
      if (beforeId === eventId) {
        addViolation(
          violations,
          'timeline_self_order',
          `$.timelineEvents[${eventId}].before`,
          'Timeline event cannot be before itself.',
          { id: eventId },
        );
      } else if (knownEvents.has(beforeId)) {
        addEdge(graph, eventId, beforeId);
      }
    }

    for (const afterId of referencedIds(event.after)) {
      if (afterId === eventId) {
        addViolation(
          violations,
          'timeline_self_order',
          `$.timelineEvents[${eventId}].after`,
          'Timeline event cannot be after itself.',
          { id: eventId },
        );
      } else if (knownEvents.has(afterId)) {
        addEdge(graph, afterId, eventId);
      }
    }
  }

  for (const fact of collectFixedTimelineFacts(context)) {
    if (hasPath(graph, fact.after, fact.before)) {
      addViolation(
        violations,
        'timeline_contradiction',
        '$.timelineEvents',
        'Generated timeline ordering contradicts a fixed canon before/after fact.',
        fact,
      );
    }
  }
}

function isModernNumericDate(dateStr) {
  if (typeof dateStr !== 'string') return false;
  const trimmed = dateStr.trim();
  // 4-digit modern years: 1800-2099
  if (/^(?:18|19|20)\d{2}$/.test(trimmed)) return true;
  // Modern date patterns: 1999-05-12, 12/05/2004, etc.
  if (/^(?:18|19|20)\d{2}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(trimmed)) return true;
  if (/^\d{1,2}[-/.]\d{1,2}[-/.]\d{4}$/.test(trimmed)) return true;
  return false;
}

function checkDuplicateNames(items, kind, pathPrefix, knownCanonItems, violations) {
  const seenInBundle = new Map();
  for (const [index, item] of asArray(items).entries()) {
    const rawName = item?.name;
    if (typeof rawName !== 'string') continue;
    const norm = rawName.trim().toLowerCase();
    if (!norm) continue;

    const currentPath = `${pathPrefix}[${index}].name`;

    if (seenInBundle.has(norm)) {
      const prev = seenInBundle.get(norm);
      addViolation(
        violations,
        'duplicate_name',
        currentPath,
        `Duplicate ${kind} name "${rawName.trim()}": matches ${pathPrefix}[${prev.index}].name.`,
        { name: rawName.trim(), firstSeenIndex: prev.index },
      );
    } else {
      seenInBundle.set(norm, { index, name: rawName.trim() });
    }

    // Check against existing canon items of the same kind
    const canonMatch = asArray(knownCanonItems).find(
      (c) =>
        typeof c?.name === 'string' &&
        c.name.trim().toLowerCase() === norm &&
        c.id !== item?.id,
    );
    if (canonMatch) {
      addViolation(
        violations,
        'duplicate_name',
        currentPath,
        `${kind.charAt(0).toUpperCase() + kind.slice(1)} name "${rawName.trim()}" duplicates existing canon entity (id: "${canonMatch.id}").`,
        { name: rawName.trim(), existingCanonId: canonMatch.id },
      );
    }
  }
}

function checkRepeatedSummaries(payload, violations) {
  const seenSummaries = new Map();

  function inspectSummary(summary, path) {
    if (typeof summary !== 'string') return;
    const trimmed = summary.trim();
    if (trimmed.length < 10) return;
    const norm = trimmed.toLowerCase();

    if (seenSummaries.has(norm)) {
      const prevPath = seenSummaries.get(norm);
      addViolation(
        violations,
        'repeated_summary',
        path,
        `Summary text is identical to ${prevPath}. Write unique summary descriptions for each entity.`,
        { duplicateOf: prevPath, summary: trimmed.length > 80 ? `${trimmed.slice(0, 80)}...` : trimmed },
      );
    } else {
      seenSummaries.set(norm, path);
    }
  }

  function walk(obj, currentPath) {
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) {
        walk(obj[i], `${currentPath}[${i}]`);
      }
      return;
    }
    for (const [key, val] of Object.entries(obj)) {
      const p = `${currentPath}.${key}`;
      if (typeof val === 'string') {
        if (['summary', 'text', 'description', 'borderTensions', 'tactics', 'morphology'].includes(key)) {
          inspectSummary(val, p);
        }
      } else if (typeof val === 'object') {
        walk(val, p);
      }
    }
  }

  walk(payload, '$');
}

function checkModernDates(events, context, violations) {
  const allowModern =
    context?.modernDatesAllowed === true ||
    context?.allowModernDates === true ||
    /\bmodern\b/i.test(context?.brief || '') ||
    /\bmodern\b/i.test(context?.metadata?.brief || '') ||
    /\bmodern\b/i.test(context?.story?.title || '') ||
    /\bmodern\b/i.test(context?.story?.description || '');

  if (allowModern) return;

  for (const [index, event] of asArray(events).entries()) {
    const rawDate = event?.date;
    if (typeof rawDate !== 'string') continue;
    if (isModernNumericDate(rawDate)) {
      addViolation(
        violations,
        'modern_date_disallowed',
        `$.timelineEvents[${index}].date`,
        `Timeline date "${rawDate.trim()}" looks like a modern numeric calendar date. Use campaign-appropriate in-world calendar or era (e.g. "12 Rainwane", "Year 40 of the Beacon") unless modern setting requested.`,
        { date: rawDate.trim() },
      );
    }
  }
}

export function validateCampaignBundle(bundle, context = {}) {
  const violations = [];

  if (!isObject(bundle)) {
    addViolation(
      violations,
      'invalid_payload',
      '$',
      'Campaign bundle must be a JSON object.',
    );
    return { ok: false, violations };
  }

  checkAllowedFields(bundle, TOP_LEVEL_FIELDS, '$', violations);

  if (bundle.jobType !== 'draft_campaign_asset_bundle') {
    addViolation(
      violations,
      'invalid_job_type',
      '$.jobType',
      'Campaign bundle jobType must be draft_campaign_asset_bundle.',
      { actual: bundle.jobType },
    );
  }

  checkAllowedFields(bundle.worldBrief, WORLD_BRIEF_FIELDS, '$.worldBrief', violations);

  const proposedCharacters = collectIds(bundle.characters);
  const proposedFactions = collectIds(bundle.factions);
  const proposedLocations = collectIds(bundle.locations);
  const proposedEvents = collectIds(bundle.timelineEvents);

  const knownCharacters = mergeSets(collectIds(context.characters), proposedCharacters);
  const knownFactions = mergeSets(collectIds(context.factions), proposedFactions);
  const knownLocations = mergeSets(collectIds(context.locations), proposedLocations);
  const knownEvents = mergeSets(collectIds(context.timelineEvents), proposedEvents);

  for (const [index, character] of asArray(bundle.characters).entries()) {
    const path = `$.characters[${index}]`;
    checkAllowedFields(character, CHARACTER_FIELDS, path, violations);
    rejectUnknownReferences(
      violations,
      referencedIds(character?.locationId),
      knownLocations,
      `${path}.locationId`,
      'location',
    );
    rejectUnknownReferences(
      violations,
      referencedIds(character?.factionIds),
      knownFactions,
      `${path}.factionIds`,
      'faction',
    );
  }

  for (const [index, faction] of asArray(bundle.factions).entries()) {
    const path = `$.factions[${index}]`;
    checkAllowedFields(faction, FACTION_FIELDS, path, violations);
    rejectUnknownReferences(
      violations,
      referencedIds(faction?.alliedFactionIds),
      knownFactions,
      `${path}.alliedFactionIds`,
      'faction',
    );
    rejectUnknownReferences(
      violations,
      referencedIds(faction?.rivalFactionIds),
      knownFactions,
      `${path}.rivalFactionIds`,
      'faction',
    );
  }

  for (const [index, location] of asArray(bundle.locations).entries()) {
    const path = `$.locations[${index}]`;
    checkAllowedFields(location, LOCATION_FIELDS, path, violations);
    rejectUnknownReferences(
      violations,
      referencedIds(location?.factionIds),
      knownFactions,
      `${path}.factionIds`,
      'faction',
    );
  }

  for (const [index, event] of asArray(bundle.timelineEvents).entries()) {
    const path = `$.timelineEvents[${index}]`;
    checkAllowedFields(event, TIMELINE_EVENT_FIELDS, path, violations);
    rejectUnknownReferences(
      violations,
      referencedIds(event?.characterIds),
      knownCharacters,
      `${path}.characterIds`,
      'character',
    );
    rejectUnknownReferences(
      violations,
      referencedIds(event?.locationIds),
      knownLocations,
      `${path}.locationIds`,
      'location',
    );
    rejectUnknownReferences(
      violations,
      referencedIds(event?.factionIds),
      knownFactions,
      `${path}.factionIds`,
      'faction',
    );
    rejectUnknownReferences(
      violations,
      referencedIds(event?.after),
      knownEvents,
      `${path}.after`,
      'timeline_event',
    );
    rejectUnknownReferences(
      violations,
      referencedIds(event?.before),
      knownEvents,
      `${path}.before`,
      'timeline_event',
    );
  }

  checkTimelineOrder(bundle, context, knownEvents, violations);

  checkDuplicateNames(bundle.characters, 'character', '$.characters', context.characters, violations);
  checkDuplicateNames(bundle.factions, 'faction', '$.factions', context.factions, violations);
  checkDuplicateNames(bundle.locations, 'location', '$.locations', context.locations, violations);
  checkRepeatedSummaries(bundle, violations);
  checkModernDates(bundle.timelineEvents, context, violations);

  return { ok: violations.length === 0, violations };
}


function checkSchemaFields(value, allowedKeys, path, violations) {
  if (!isObject(value)) return;
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      addViolation(
        violations,
        'forbidden_object_type',
        `${path}.${key}`,
        `Field "${key}" is not permitted for this job type.`,
        { field: key },
      );
    }
  }
}

function resolveKnownEntityIds(context) {
  const characters = new Set([
    ...collectIds(context?.characters),
    ...asArray(context?.knownCharacterIds),
  ]);
  const factions = new Set([
    ...collectIds(context?.factions),
    ...asArray(context?.knownFactionIds),
  ]);
  const locations = new Set([
    ...collectIds(context?.locations),
    ...asArray(context?.knownLocationIds),
  ]);
  const timelineEvents = new Set([
    ...collectIds(context?.timelineEvents),
    ...asArray(context?.knownTimelineEventIds),
  ]);
  const bestiary = new Set([
    ...collectIds(context?.bestiary ?? context?.creatures),
    ...asArray(context?.knownBestiaryIds),
  ]);

  if (context?.anchorEntity?.entity?.id) {
    const id = context.anchorEntity.entity.id;
    const type = context.anchorEntity.type;
    if (type === 'character') characters.add(id);
    if (type === 'faction') factions.add(id);
    if (type === 'location') locations.add(id);
    if (type === 'timelineEvent') timelineEvents.add(id);
    if (type === 'creature' || type === 'bestiary') bestiary.add(id);
  }

  return { characters, factions, locations, timelineEvents, bestiary };
}

export function validateMacroHistoryTimeline(payload, context = {}) {
  const violations = [];
  if (!isObject(payload)) {
    addViolation(violations, 'invalid_payload', '$', 'Payload must be a JSON object.');
    return { ok: false, violations };
  }

  const schema = TASK_TYPE_SCHEMAS[SUPPORTED_JOB_TYPES.MACRO_HISTORY_TIMELINE];
  checkSchemaFields(payload, schema.allowedTopLevelKeys, '$', violations);

  const events = asArray(payload.timelineEvents);
  if (events.length === 0) {
    addViolation(violations, 'missing_required_field', '$.timelineEvents', 'Must provide at least one timeline event.');
  }

  const knownEvents = mergeSets(collectIds(context.timelineEvents), collectIds(events));

  for (const [index, event] of events.entries()) {
    const path = `$.timelineEvents[${index}]`;
    checkAllowedFields(event, TIMELINE_EVENT_FIELDS, path, violations);
    if (!asId(event?.id).startsWith('event-')) {
      addViolation(violations, 'invalid_id_format', `${path}.id`, 'Event ID must start with "event-".', { id: event?.id });
    }
  }

  checkModernDates(events, context, violations);
  checkTimelineOrder(payload, context, knownEvents, violations);
  checkDuplicateNames(events, 'timeline event', '$.timelineEvents', context.timelineEvents, violations);
  checkRepeatedSummaries(payload, violations);

  return { ok: violations.length === 0, violations };
}

export function validateEventHistoryExpansion(payload, context = {}) {
  const violations = [];
  if (!isObject(payload)) {
    addViolation(violations, 'invalid_payload', '$', 'Payload must be a JSON object.');
    return { ok: false, violations };
  }

  const schema = TASK_TYPE_SCHEMAS[SUPPORTED_JOB_TYPES.EVENT_HISTORY_EXPANSION];
  checkSchemaFields(payload, schema.allowedTopLevelKeys, '$', violations);

  const known = resolveKnownEntityIds(context);
  const parentEventId = asId(payload.parentEventId);

  if (!parentEventId) {
    addViolation(violations, 'missing_required_field', '$.parentEventId', 'parentEventId is required.');
  } else if (!known.timelineEvents.has(parentEventId)) {
    addViolation(violations, 'unknown_reference', '$.parentEventId', 'Unknown parentEventId reference.', { id: parentEventId });
  }

  const events = asArray(payload.timelineEvents);
  if (events.length === 0) {
    addViolation(violations, 'missing_required_field', '$.timelineEvents', 'Must provide expanded timeline events.');
  }

  const proposedEvents = collectIds(events);
  const knownEvents = mergeSets(known.timelineEvents, proposedEvents);

  for (const [index, event] of events.entries()) {
    const path = `$.timelineEvents[${index}]`;
    checkAllowedFields(event, TIMELINE_EVENT_FIELDS, path, violations);
    rejectUnknownReferences(violations, referencedIds(event?.characterIds), known.characters, `${path}.characterIds`, 'character');
    rejectUnknownReferences(violations, referencedIds(event?.locationIds), known.locations, `${path}.locationIds`, 'location');
    rejectUnknownReferences(violations, referencedIds(event?.factionIds), known.factions, `${path}.factionIds`, 'faction');
    rejectUnknownReferences(violations, referencedIds(event?.after), knownEvents, `${path}.after`, 'timeline_event');
    rejectUnknownReferences(violations, referencedIds(event?.before), knownEvents, `${path}.before`, 'timeline_event');
  }

  checkModernDates(events, context, violations);
  checkTimelineOrder(payload, context, knownEvents, violations);
  checkDuplicateNames(events, 'timeline event', '$.timelineEvents', context.timelineEvents, violations);
  checkRepeatedSummaries(payload, violations);

  return { ok: violations.length === 0, violations };
}

export function validateFactionBeliefEnrichment(payload, context = {}) {
  const violations = [];
  if (!isObject(payload)) {
    addViolation(violations, 'invalid_payload', '$', 'Payload must be a JSON object.');
    return { ok: false, violations };
  }

  const schema = TASK_TYPE_SCHEMAS[SUPPORTED_JOB_TYPES.FACTION_BELIEF_ENRICHMENT];
  checkSchemaFields(payload, schema.allowedTopLevelKeys, '$', violations);

  const known = resolveKnownEntityIds(context);
  const factionId = asId(payload.factionId);

  if (!factionId) {
    addViolation(violations, 'missing_required_field', '$.factionId', 'factionId is required.');
  } else if (!known.factions.has(factionId)) {
    addViolation(violations, 'unknown_reference', '$.factionId', 'Unknown factionId reference.', { id: factionId });
  }

  if (!isObject(payload.faith)) {
    addViolation(violations, 'missing_required_field', '$.faith', 'faith object is required.');
  } else {
    if (!payload.faith.name || !String(payload.faith.name).trim()) {
      addViolation(violations, 'missing_required_field', '$.faith.name', 'faith name is required.');
    }
    const taboos = asArray(payload.faith.sacredTaboos);
    if (taboos.length === 0) {
      addViolation(violations, 'missing_required_field', '$.faith.sacredTaboos', 'Must provide at least one sacred taboo.');
    }
  }

  const shrines = asArray(payload.shrineLocations);
  for (const [index, shrine] of shrines.entries()) {
    const path = `$.shrineLocations[${index}]`;
    if (shrine?.parentLocationId && !known.locations.has(asId(shrine.parentLocationId))) {
      addViolation(violations, 'unknown_reference', `${path}.parentLocationId`, 'Unknown parent location reference.', { id: shrine.parentLocationId });
    }
  }

  checkDuplicateNames(shrines, 'location', '$.shrineLocations', context.locations, violations);
  checkRepeatedSummaries(payload, violations);

  return { ok: violations.length === 0, violations };
}

export function validateRegionGeopolitics(payload, context = {}) {
  const violations = [];
  if (!isObject(payload)) {
    addViolation(violations, 'invalid_payload', '$', 'Payload must be a JSON object.');
    return { ok: false, violations };
  }

  const schema = TASK_TYPE_SCHEMAS[SUPPORTED_JOB_TYPES.REGION_GEOPOLITICS];
  checkSchemaFields(payload, schema.allowedTopLevelKeys, '$', violations);

  const known = resolveKnownEntityIds(context);
  const regionId = asId(payload.regionId);

  if (!regionId) {
    addViolation(violations, 'missing_required_field', '$.regionId', 'regionId is required.');
  } else if (!known.locations.has(regionId)) {
    addViolation(violations, 'unknown_reference', '$.regionId', 'Unknown regionId reference.', { id: regionId });
  }

  const claims = asArray(payload.territorialClaims);
  for (const [index, claim] of claims.entries()) {
    const path = `$.territorialClaims[${index}]`;
    if (!claim?.factionId || !known.factions.has(asId(claim.factionId))) {
      addViolation(violations, 'unknown_reference', `${path}.factionId`, 'Unknown factionId reference in territorial claim.', { id: claim?.factionId });
    }
  }

  const chokePoints = asArray(payload.chokePoints);
  for (const [index, cp] of chokePoints.entries()) {
    const path = `$.chokePoints[${index}]`;
    if (cp?.controllingFactionId && !known.factions.has(asId(cp.controllingFactionId))) {
      addViolation(violations, 'unknown_reference', `${path}.controllingFactionId`, 'Unknown factionId reference in choke point.', { id: cp?.controllingFactionId });
    }
  }

  checkDuplicateNames(chokePoints, 'location', '$.chokePoints', context.locations, violations);
  checkRepeatedSummaries(payload, violations);

  return { ok: violations.length === 0, violations };
}

export function validateCharacterFamilyLineage(payload, context = {}) {
  const violations = [];
  if (!isObject(payload)) {
    addViolation(violations, 'invalid_payload', '$', 'Payload must be a JSON object.');
    return { ok: false, violations };
  }

  const schema = TASK_TYPE_SCHEMAS[SUPPORTED_JOB_TYPES.CHARACTER_FAMILY_LINEAGE];
  checkSchemaFields(payload, schema.allowedTopLevelKeys, '$', violations);

  const known = resolveKnownEntityIds(context);
  const targetId = asId(payload.targetCharacterId);

  if (!targetId) {
    addViolation(violations, 'missing_required_field', '$.targetCharacterId', 'targetCharacterId is required.');
  } else if (!known.characters.has(targetId)) {
    addViolation(violations, 'unknown_reference', '$.targetCharacterId', 'Unknown targetCharacterId reference.', { id: targetId });
  }

  const characters = asArray(payload.characters);
  if (characters.length === 0) {
    addViolation(violations, 'missing_required_field', '$.characters', 'Must provide relative characters.');
  }

  const relativeIds = mergeSets(known.characters, collectIds(characters));
  if (targetId) relativeIds.add(targetId);

  for (const [index, char] of characters.entries()) {
    const path = `$.characters[${index}]`;
    if (asId(char?.id) === targetId) {
      addViolation(
        violations,
        'duplicate_name',
        `${path}.id`,
        `Relative character id cannot be identical to target character id "${targetId}".`,
        { id: targetId },
      );
    }
    const rels = asArray(char?.relationships);
    for (const [relIdx, rel] of rels.entries()) {
      const relPath = `${path}.relationships[${relIdx}]`;
      if (!rel?.target || !relativeIds.has(asId(rel.target))) {
        addViolation(violations, 'unknown_reference', `${relPath}.target`, 'Unknown relationship target reference.', { target: rel?.target });
      }
    }
  }

  checkDuplicateNames(characters, 'character', '$.characters', context.characters, violations);
  checkRepeatedSummaries(payload, violations);

  return { ok: violations.length === 0, violations };
}

export function validateEncounterPressure(payload, context = {}) {
  const violations = [];
  if (!isObject(payload)) {
    addViolation(violations, 'invalid_payload', '$', 'Payload must be a JSON object.');
    return { ok: false, violations };
  }

  const schema = TASK_TYPE_SCHEMAS[SUPPORTED_JOB_TYPES.ENCOUNTER_PRESSURE];
  checkSchemaFields(payload, schema.allowedTopLevelKeys, '$', violations);

  const known = resolveKnownEntityIds(context);
  const locationId = asId(payload.locationId);

  if (!locationId) {
    addViolation(violations, 'missing_required_field', '$.locationId', 'locationId is required.');
  } else if (!known.locations.has(locationId)) {
    addViolation(violations, 'unknown_reference', '$.locationId', 'Unknown locationId reference.', { id: locationId });
  }

  if (!isObject(payload.creature)) {
    addViolation(violations, 'missing_required_field', '$.creature', 'creature object is required.');
  } else {
    if (!payload.creature.name || !String(payload.creature.name).trim()) {
      addViolation(violations, 'missing_required_field', '$.creature.name', 'creature name is required.');
    }
    if (!payload.creature.weakness || !String(payload.creature.weakness).trim()) {
      addViolation(violations, 'missing_required_field', '$.creature.weakness', 'creature weakness is required.');
    }
  }

  checkRepeatedSummaries(payload, violations);

  return { ok: violations.length === 0, violations };
}

export function validateSessionHooks(payload, context = {}) {
  const violations = [];
  if (!isObject(payload)) {
    addViolation(violations, 'invalid_payload', '$', 'Payload must be a JSON object.');
    return { ok: false, violations };
  }

  const schema = TASK_TYPE_SCHEMAS[SUPPORTED_JOB_TYPES.SESSION_HOOKS];
  checkSchemaFields(payload, schema.allowedTopLevelKeys, '$', violations);

  const known = resolveKnownEntityIds(context);
  const locationId = asId(payload.locationId);

  if (!locationId) {
    addViolation(violations, 'missing_required_field', '$.locationId', 'locationId is required.');
  } else if (!known.locations.has(locationId)) {
    addViolation(violations, 'unknown_reference', '$.locationId', 'Unknown locationId reference.', { id: locationId });
  }

  const rumors = asArray(payload.rumors);
  if (rumors.length === 0) {
    addViolation(violations, 'missing_required_field', '$.rumors', 'Must provide rumors.');
  } else {
    const hasUntruth = rumors.some(
      (r) => r?.truthRating === 'half-truth' || r?.truthRating === 'deliberate_falsehood',
    );
    if (!hasUntruth) {
      addViolation(
        violations,
        'invalid_rumor_distribution',
        '$.rumors',
        'At least one rumor must have truthRating "half-truth" or "deliberate_falsehood".',
      );
    }
  }

  const hooks = asArray(payload.hooks);
  for (const [index, hook] of hooks.entries()) {
    const path = `$.hooks[${index}]`;
    rejectUnknownReferences(violations, referencedIds(hook?.involvedCharacterIds), known.characters, `${path}.involvedCharacterIds`, 'character');
    rejectUnknownReferences(violations, referencedIds(hook?.involvedFactionIds), known.factions, `${path}.involvedFactionIds`, 'faction');
  }

  checkRepeatedSummaries(payload, violations);

  return { ok: violations.length === 0, violations };
}

export function validateReligionBeliefLore(payload, context = {}) {
  const violations = [];
  if (!isObject(payload)) {
    addViolation(violations, 'invalid_payload', '$', 'Payload must be a JSON object.');
    return { ok: false, violations };
  }

  const schema = TASK_TYPE_SCHEMAS[SUPPORTED_JOB_TYPES.RELIGION_BELIEF_LORE];
  checkAllowedFields(payload, schema.allowedTopLevelKeys, '$', violations);

  if (!payload.religionName || !String(payload.religionName).trim()) {
    addViolation(violations, 'missing_required_field', '$.religionName', 'religionName is required.');
  }

  if (payload.canonDimension && payload.canonDimension !== 'religion') {
    addViolation(violations, 'invalid_dimension', '$.canonDimension', 'canonDimension must be "religion".');
  }

  const known = resolveKnownEntityIds(context);
  if (payload.associatedFactionIds) {
    rejectUnknownReferences(violations, referencedIds(payload.associatedFactionIds), known.factions, '$.associatedFactionIds', 'faction');
  }

  if (Array.isArray(payload.holySites)) {
    for (const [index, site] of payload.holySites.entries()) {
      if (site?.locationId && !known.locations.has(site.locationId)) {
        addViolation(violations, 'unknown_reference', `$.holySites[${index}].locationId`, 'Unknown location reference for holy site.', { id: site.locationId });
      }
    }
  }

  checkRepeatedSummaries(payload, violations);
  return { ok: violations.length === 0, violations };
}

export function validateLanguageCultureConventions(payload, context = {}) {
  const violations = [];
  if (!isObject(payload)) {
    addViolation(violations, 'invalid_payload', '$', 'Payload must be a JSON object.');
    return { ok: false, violations };
  }

  const schema = TASK_TYPE_SCHEMAS[SUPPORTED_JOB_TYPES.LANGUAGE_CULTURE_CONVENTIONS];
  checkAllowedFields(payload, schema.allowedTopLevelKeys, '$', violations);

  if (!payload.languageName || !String(payload.languageName).trim()) {
    addViolation(violations, 'missing_required_field', '$.languageName', 'languageName is required.');
  }

  if (payload.canonDimension && payload.canonDimension !== 'culture') {
    addViolation(violations, 'invalid_dimension', '$.canonDimension', 'canonDimension must be "culture".');
  }

  const known = resolveKnownEntityIds(context);
  if (payload.associatedLocationIds) {
    rejectUnknownReferences(violations, referencedIds(payload.associatedLocationIds), known.locations, '$.associatedLocationIds', 'location');
  }

  checkRepeatedSummaries(payload, violations);
  return { ok: violations.length === 0, violations };
}

export function validateBestiaryEntryRefinement(payload, context = {}) {
  const violations = [];
  if (!isObject(payload)) {
    addViolation(violations, 'invalid_payload', '$', 'Payload must be a JSON object.');
    return { ok: false, violations };
  }

  const schema = TASK_TYPE_SCHEMAS[SUPPORTED_JOB_TYPES.BESTIARY_ENTRY_REFINEMENT];
  checkAllowedFields(payload, schema.allowedTopLevelKeys, '$', violations);

  if (!payload.name || !String(payload.name).trim()) {
    addViolation(violations, 'missing_required_field', '$.name', 'Creature name is required.');
  }

  if (payload.canonDimension && payload.canonDimension !== 'bestiary') {
    addViolation(violations, 'invalid_dimension', '$.canonDimension', 'canonDimension must be "bestiary".');
  }

  if (typeof payload.hearts !== 'number' || payload.hearts < 1 || payload.hearts > 100) {
    addViolation(violations, 'invalid_hearts', '$.hearts', 'hearts must be a number between 1 and 100.');
  }

  if (!Array.isArray(payload.tactics) || payload.tactics.length === 0) {
    addViolation(violations, 'missing_required_field', '$.tactics', 'tactics array is required.');
  }

  const known = resolveKnownEntityIds(context);
  if (payload.associatedLocationIds) {
    rejectUnknownReferences(violations, referencedIds(payload.associatedLocationIds), known.locations, '$.associatedLocationIds', 'location');
  }

  checkRepeatedSummaries(payload, violations);
  return { ok: violations.length === 0, violations };
}

export function validateLocationHierarchyRefinement(payload, context = {}) {
  const violations = [];
  if (!isObject(payload)) {
    addViolation(violations, 'invalid_payload', '$', 'Payload must be a JSON object.');
    return { ok: false, violations };
  }

  const schema = TASK_TYPE_SCHEMAS[SUPPORTED_JOB_TYPES.LOCATION_HIERARCHY_REFINEMENT];
  checkAllowedFields(payload, schema.allowedTopLevelKeys, '$', violations);

  const known = resolveKnownEntityIds(context);
  const parentId = asId(payload.parentLocationId);
  if (!parentId) {
    addViolation(violations, 'missing_required_field', '$.parentLocationId', 'parentLocationId is required.');
  } else if (!known.locations.has(parentId)) {
    addViolation(violations, 'unknown_reference', '$.parentLocationId', 'Unknown parentLocationId reference.', { id: parentId });
  }

  if (payload.canonDimension && payload.canonDimension !== 'geography') {
    addViolation(violations, 'invalid_dimension', '$.canonDimension', 'canonDimension must be "geography".');
  }

  if (!Array.isArray(payload.subLocations) || payload.subLocations.length === 0) {
    addViolation(violations, 'missing_required_field', '$.subLocations', 'subLocations array is required.');
  } else {
    checkDuplicateNames(payload.subLocations, 'location', '$.subLocations', context.locations, violations);

    const genericPattern = /\b(alpha|beta|gamma|delta|epsilon)\b/i;
    const genericBasePattern = /^(anomalous rift chamber|tactical (landing )?slipway|derelict hull|point of interest|hidden cache|sector|outpost|chamber)/i;
    for (const [idx, sub] of payload.subLocations.entries()) {
      if (typeof sub?.name === 'string' && genericPattern.test(sub.name) && genericBasePattern.test(sub.name)) {
        addViolation(
          violations,
          'generic_placeholder_name',
          `$.subLocations[${idx}].name`,
          `Sub-location name "${sub.name}" uses generic Greek placeholder nomenclature. Author an evocative, universe-specific lore name instead.`,
        );
      }
    }
  }

  checkRepeatedSummaries(payload, violations);
  return { ok: violations.length === 0, violations };
}

export function validateDerivativeOutlineGeneration(payload, context = {}) {
  const violations = [];
  if (!isObject(payload)) {
    addViolation(violations, 'invalid_payload', '$', 'Payload must be a JSON object.');
    return { ok: false, violations };
  }

  const schema = TASK_TYPE_SCHEMAS[SUPPORTED_JOB_TYPES.DERIVATIVE_OUTLINE_GENERATION];
  checkAllowedFields(payload, schema.allowedTopLevelKeys, '$', violations);

  const validDerivativeTypes = ['campaign', 'story', 'screenplay', 'game_concept', 'storyboard'];
  if (!payload.derivativeType || !validDerivativeTypes.includes(payload.derivativeType)) {
    addViolation(violations, 'invalid_derivative_type', '$.derivativeType', `derivativeType must be one of: ${validDerivativeTypes.join(', ')}`);
  }

  if (!payload.title || !String(payload.title).trim()) {
    addViolation(violations, 'missing_required_field', '$.title', 'Derivative title is required.');
  }

  if (!payload.premise || !String(payload.premise).trim()) {
    addViolation(violations, 'missing_required_field', '$.premise', 'Derivative premise is required.');
  }

  if (payload.canonDimension && payload.canonDimension !== 'derivative') {
    addViolation(violations, 'invalid_dimension', '$.canonDimension', 'canonDimension must be "derivative".');
  }

  const known = resolveKnownEntityIds(context);
  if (Array.isArray(payload.sourceCanonReferences)) {
    for (const [idx, ref] of payload.sourceCanonReferences.entries()) {
      const path = `$.sourceCanonReferences[${idx}]`;
      if ((ref?.entityType === 'character' || ref?.entityType === 'creature' || ref?.entityType === 'bestiary') && ref?.entityId) {
        if (!known.characters.has(ref.entityId) && !known.bestiary?.has(ref.entityId)) {
          addViolation(violations, 'unknown_reference', `${path}.entityId`, `Unknown character or creature reference "${ref.entityId}".`, { id: ref.entityId });
        }
      }
      if (ref?.entityType === 'location' && ref?.entityId && !known.locations.has(ref.entityId)) {
        addViolation(violations, 'unknown_reference', `${path}.entityId`, `Unknown location reference "${ref.entityId}".`, { id: ref.entityId });
      }
      if (ref?.entityType === 'faction' && ref?.entityId && !known.factions.has(ref.entityId)) {
        addViolation(violations, 'unknown_reference', `${path}.entityId`, `Unknown faction reference "${ref.entityId}".`, { id: ref.entityId });
      }
    }
  }

  checkRepeatedSummaries(payload, violations);
  return { ok: violations.length === 0, violations };
}

export function validateChapterProseDraft(payload, context = {}) {
  const violations = [];
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    addViolation(violations, 'invalid_payload', '$', 'Payload must be a JSON object.');
    return { ok: false, violations };
  }

  const schema = TASK_TYPE_SCHEMAS[SUPPORTED_JOB_TYPES.CHAPTER_PROSE_COMPOSITION];
  checkAllowedFields(payload, schema.allowedTopLevelKeys, '$', violations);

  if (!payload.chapterTitle && !payload.title) {
    addViolation(violations, 'missing_required_field', '$.chapterTitle', 'Chapter title is required.');
  }

  if (!payload.prose || typeof payload.prose !== 'string' || payload.prose.trim().length < 200) {
    addViolation(violations, 'insufficient_prose', '$.prose', 'Chapter prose must be a non-empty string of novelistic length (minimum 200 characters).');
  }

  // Check that prose is not merely an outline with bullet points or beat labels
  if (payload.prose && /^##?\s*Beat\s*\d/im.test(payload.prose)) {
    addViolation(violations, 'unfiltered_metadata', '$.prose', 'Prose should be continuous novel text, not outlining metadata headers ("Beat X:").');
  }

  if (payload.canonDimension && payload.canonDimension !== 'derivative' && payload.canonDimension !== 'prose') {
    addViolation(violations, 'invalid_dimension', '$.canonDimension', 'canonDimension must be "derivative" or "prose".');
  }

  const known = resolveKnownEntityIds(context);
  if (Array.isArray(payload.sourceCanonReferences)) {
    for (const [idx, ref] of payload.sourceCanonReferences.entries()) {
      const path = `$.sourceCanonReferences[${idx}]`;
      if ((ref?.entityType === 'character' || ref?.entityType === 'creature' || ref?.entityType === 'bestiary') && ref?.entityId) {
        if (!known.characters.has(ref.entityId) && !known.bestiary?.has(ref.entityId)) {
          addViolation(violations, 'unknown_reference', `${path}.entityId`, `Unknown character or creature reference "${ref.entityId}".`, { id: ref.entityId });
        }
      }
      if (ref?.entityType === 'location' && ref?.entityId && !known.locations.has(ref.entityId)) {
        addViolation(violations, 'unknown_reference', `${path}.entityId`, `Unknown location reference "${ref.entityId}".`, { id: ref.entityId });
      }
      if (ref?.entityType === 'faction' && ref?.entityId && !known.factions.has(ref.entityId)) {
        addViolation(violations, 'unknown_reference', `${path}.entityId`, `Unknown faction reference "${ref.entityId}".`, { id: ref.entityId });
      }
    }
  }

  return { ok: violations.length === 0, violations };
}

export function validateFactionPoliticsRefinement(payload, context = {}) {
  const violations = [];
  if (!isObject(payload)) {
    addViolation(violations, 'invalid_payload', '$', 'Payload must be a JSON object.');
    return { ok: false, violations };
  }

  const schema = TASK_TYPE_SCHEMAS[SUPPORTED_JOB_TYPES.FACTION_POLITICS_REFINEMENT];
  checkSchemaFields(payload, schema.allowedTopLevelKeys, '$', violations);

  const known = resolveKnownEntityIds(context);
  const factionId = asId(payload.factionId);

  if (!factionId) {
    addViolation(violations, 'missing_required_field', '$.factionId', 'factionId is required.');
  } else if (!known.factions.has(factionId)) {
    addViolation(violations, 'unknown_reference', '$.factionId', 'Unknown factionId reference.', { id: factionId });
  }

  if (!isObject(payload.politics)) {
    addViolation(violations, 'missing_required_field', '$.politics', 'politics object is required.');
  } else {
    if (!payload.politics.doctrine || !String(payload.politics.doctrine).trim()) {
      addViolation(violations, 'missing_required_field', '$.politics.doctrine', 'doctrine is required.');
    }
  }

  if (Array.isArray(payload.rivalries)) {
    for (const [idx, riv] of payload.rivalries.entries()) {
      const path = `$.rivalries[${idx}]`;
      if (riv?.factionId && !known.factions.has(asId(riv.factionId))) {
        addViolation(violations, 'unknown_reference', `${path}.factionId`, 'Unknown rival faction reference.', { id: riv.factionId });
      }
    }
  }

  checkRepeatedSummaries(payload, violations);
  return { ok: violations.length === 0, violations };
}

export function validateTechnologyLoreRefinement(payload, context = {}) {
  const violations = [];
  if (!isObject(payload)) {
    addViolation(violations, 'invalid_payload', '$', 'Payload must be a JSON object.');
    return { ok: false, violations };
  }

  const schema = TASK_TYPE_SCHEMAS[SUPPORTED_JOB_TYPES.TECHNOLOGY_LORE_REFINEMENT];
  checkSchemaFields(payload, schema.allowedTopLevelKeys, '$', violations);

  if (!isObject(payload.tech)) {
    addViolation(violations, 'missing_required_field', '$.tech', 'tech object is required.');
  } else {
    if (!payload.tech.id || !String(payload.tech.id).trim()) {
      addViolation(violations, 'missing_required_field', '$.tech.id', 'tech id is required.');
    }
    if (!payload.tech.name || !String(payload.tech.name).trim()) {
      addViolation(violations, 'missing_required_field', '$.tech.name', 'tech name is required.');
    }
    if (!payload.tech.classification || !String(payload.tech.classification).trim()) {
      addViolation(violations, 'missing_required_field', '$.tech.classification', 'tech classification is required.');
    }
  }

  checkRepeatedSummaries(payload, violations);
  return { ok: violations.length === 0, violations };
}

export function validateStarSystemRefinement(payload, context = {}) {
  const violations = [];
  if (!isObject(payload)) {
    addViolation(violations, 'invalid_payload', '$', 'Payload must be a JSON object.');
    return { ok: false, violations };
  }

  const schema = TASK_TYPE_SCHEMAS[SUPPORTED_JOB_TYPES.STAR_SYSTEM_REFINEMENT];
  checkSchemaFields(payload, schema.allowedTopLevelKeys, '$', violations);

  const known = resolveKnownEntityIds(context);
  if (!isObject(payload.starSystem)) {
    addViolation(violations, 'missing_required_field', '$.starSystem', 'starSystem object is required.');
  } else {
    if (!payload.starSystem.id || !String(payload.starSystem.id).trim()) {
      addViolation(violations, 'missing_required_field', '$.starSystem.id', 'starSystem id is required.');
    }
    if (!payload.starSystem.name || !String(payload.starSystem.name).trim()) {
      addViolation(violations, 'missing_required_field', '$.starSystem.name', 'starSystem name is required.');
    }
    if (payload.starSystem.controllingFactionId && !known.factions.has(asId(payload.starSystem.controllingFactionId))) {
      addViolation(violations, 'unknown_reference', '$.starSystem.controllingFactionId', 'Unknown controlling faction reference.', { id: payload.starSystem.controllingFactionId });
    }
  }

  checkRepeatedSummaries(payload, violations);
  return { ok: violations.length === 0, violations };
}

export function validateMysterySignalRefinement(payload, context = {}) {
  const violations = [];
  if (!isObject(payload)) {
    addViolation(violations, 'invalid_payload', '$', 'Payload must be a JSON object.');
    return { ok: false, violations };
  }

  const schema = TASK_TYPE_SCHEMAS[SUPPORTED_JOB_TYPES.MYSTERY_SIGNAL_REFINEMENT];
  checkSchemaFields(payload, schema.allowedTopLevelKeys, '$', violations);

  if (!isObject(payload.signal)) {
    addViolation(violations, 'missing_required_field', '$.signal', 'signal object is required.');
  } else {
    if (!payload.signal.id || !String(payload.signal.id).trim()) {
      addViolation(violations, 'missing_required_field', '$.signal.id', 'signal id is required.');
    }
    if (!payload.signal.designation || !String(payload.signal.designation).trim()) {
      addViolation(violations, 'missing_required_field', '$.signal.designation', 'signal designation is required.');
    }
    if (!payload.signal.frequency || !String(payload.signal.frequency).trim()) {
      addViolation(violations, 'missing_required_field', '$.signal.frequency', 'signal frequency is required.');
    }
  }

  checkRepeatedSummaries(payload, violations);
  return { ok: violations.length === 0, violations };
}

export function validateLorePayload(payload, context = {}, expectedType = null) {
  const normType = normalizeJobType(expectedType || payload?.jobType) || SUPPORTED_JOB_TYPES.CAMPAIGN_BUNDLE;

  if (payload?.jobType && normalizeJobType(payload.jobType) !== normType) {
    return {
      ok: false,
      violations: [
        {
          code: 'invalid_job_type',
          path: '$.jobType',
          message: `Payload jobType "${payload.jobType}" does not match expected "${normType}".`,
          actual: payload.jobType,
          expected: normType,
        },
      ],
    };
  }

  let result;
  switch (normType) {
    case SUPPORTED_JOB_TYPES.MACRO_HISTORY_TIMELINE:
      result = validateMacroHistoryTimeline(payload, context);
      break;
    case SUPPORTED_JOB_TYPES.EVENT_HISTORY_EXPANSION:
      result = validateEventHistoryExpansion(payload, context);
      break;
    case SUPPORTED_JOB_TYPES.FACTION_BELIEF_ENRICHMENT:
      result = validateFactionBeliefEnrichment(payload, context);
      break;
    case SUPPORTED_JOB_TYPES.FACTION_POLITICS_REFINEMENT:
      result = validateFactionPoliticsRefinement(payload, context);
      break;
    case SUPPORTED_JOB_TYPES.TECHNOLOGY_LORE_REFINEMENT:
      result = validateTechnologyLoreRefinement(payload, context);
      break;
    case SUPPORTED_JOB_TYPES.STAR_SYSTEM_REFINEMENT:
      result = validateStarSystemRefinement(payload, context);
      break;
    case SUPPORTED_JOB_TYPES.MYSTERY_SIGNAL_REFINEMENT:
      result = validateMysterySignalRefinement(payload, context);
      break;
    case SUPPORTED_JOB_TYPES.REGION_GEOPOLITICS:
      result = validateRegionGeopolitics(payload, context);
      break;
    case SUPPORTED_JOB_TYPES.CHARACTER_FAMILY_LINEAGE:
      result = validateCharacterFamilyLineage(payload, context);
      break;
    case SUPPORTED_JOB_TYPES.ENCOUNTER_PRESSURE:
      result = validateEncounterPressure(payload, context);
      break;
    case SUPPORTED_JOB_TYPES.SESSION_HOOKS:
      result = validateSessionHooks(payload, context);
      break;
    case SUPPORTED_JOB_TYPES.RELIGION_BELIEF_LORE:
      result = validateReligionBeliefLore(payload, context);
      break;
    case SUPPORTED_JOB_TYPES.LANGUAGE_CULTURE_CONVENTIONS:
      result = validateLanguageCultureConventions(payload, context);
      break;
    case SUPPORTED_JOB_TYPES.BESTIARY_ENTRY_REFINEMENT:
      result = validateBestiaryEntryRefinement(payload, context);
      break;
    case SUPPORTED_JOB_TYPES.LOCATION_HIERARCHY_REFINEMENT:
      result = validateLocationHierarchyRefinement(payload, context);
      break;
    case SUPPORTED_JOB_TYPES.DERIVATIVE_OUTLINE_GENERATION:
      result = validateDerivativeOutlineGeneration(payload, context);
      break;
    case SUPPORTED_JOB_TYPES.CHAPTER_PROSE_COMPOSITION:
      result = validateChapterProseDraft(payload, context);
      break;
    case SUPPORTED_JOB_TYPES.CAMPAIGN_BUNDLE:
    default:
      result = validateCampaignBundle(payload, context);
      break;
  }

  // Canon-aware critique gate evaluation
  const factRules = deriveFactRules({
    story: context?.story,
    taskMetadata: context?.taskMetadata || context?.task,
    scopedContext: context,
  });
  const quality = evaluateDraftQuality(payload, { jobType: normType, scopedContext: context, factRules });
  result.critiqueGate = {
    score: quality.score,
    defects: quality.defects,
  };

  if (!quality.ok && quality.defects.length > 0) {
    if (!result.violations) result.violations = [];
    for (const defect of quality.defects) {
      // Avoid duplicate violations
      const exists = result.violations.some((v) => v.code === defect.code.toLowerCase());
      if (!exists) {
        result.violations.push({
          code: defect.code.toLowerCase(),
          path: '$.content',
          message: defect.message,
          fixGuidance: defect.fixGuidance,
        });
      }
    }
    result.ok = false;
  }

  return result;
}

export default {
  validateCampaignBundle,
  validateLorePayload,
  validateMacroHistoryTimeline,
  validateEventHistoryExpansion,
  validateFactionBeliefEnrichment,
  validateRegionGeopolitics,
  validateCharacterFamilyLineage,
  validateEncounterPressure,
  validateSessionHooks,
  validateReligionBeliefLore,
  validateLanguageCultureConventions,
  validateBestiaryEntryRefinement,
  validateLocationHierarchyRefinement,
  validateDerivativeOutlineGeneration,
  validateChapterProseDraft,
};
