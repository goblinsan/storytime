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

function checkRepeatedSummaries(bundle, violations) {
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

  if (bundle?.worldBrief?.summary) {
    inspectSummary(bundle.worldBrief.summary, '$.worldBrief.summary');
  }
  for (const [i, char] of asArray(bundle?.characters).entries()) {
    inspectSummary(char?.summary, `$.characters[${i}].summary`);
  }
  for (const [i, fac] of asArray(bundle?.factions).entries()) {
    inspectSummary(fac?.summary, `$.factions[${i}].summary`);
  }
  for (const [i, loc] of asArray(bundle?.locations).entries()) {
    inspectSummary(loc?.summary, `$.locations[${i}].summary`);
  }
  for (const [i, evt] of asArray(bundle?.timelineEvents).entries()) {
    inspectSummary(evt?.summary, `$.timelineEvents[${i}].summary`);
  }
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

export default { validateCampaignBundle };
