import { Router } from 'express';
import { randomUUID } from 'crypto';
import db from '../db.js';

const router = Router();

const VALID_TYPES = ['campaign', 'story', 'screenplay', 'game_concept', 'storyboard'];
const VALID_STATUSES = ['draft', 'in_progress', 'completed', 'archived'];

function safeJson(val, fallback) {
  if (!val) return fallback;
  if (typeof val === 'object') return val;
  try {
    return JSON.parse(val);
  } catch {
    return fallback;
  }
}

// List derivative works for a project
router.get('/', async (req, res) => {
  const { projectId, type } = req.query;

  if (!projectId) {
    return res.status(400).json({ error: 'projectId is required' });
  }

  let sql = `
    SELECT id, project_id as "projectId", type, title, description,
           status, content, source_canon_references as "sourceCanonReferences",
           metadata, created_at as "createdAt", updated_at as "updatedAt"
    FROM derivative_works
    WHERE project_id = ?
  `;
  const params = [projectId];

  if (type) {
    sql += ' AND type = ?';
    params.push(type);
  }
  sql += ' ORDER BY updated_at DESC';

  const rows = await db.all(sql, ...params);
  const result = rows.map((r) => ({
    ...r,
    sourceCanonReferences: safeJson(r.sourceCanonReferences, []),
    metadata: safeJson(r.metadata, {}),
  }));

  res.json(result);
});

// Get a single derivative work
router.get('/:id', async (req, res) => {
  const r = await db.get(`
    SELECT id, project_id as "projectId", type, title, description,
           status, content, source_canon_references as "sourceCanonReferences",
           metadata, created_at as "createdAt", updated_at as "updatedAt"
    FROM derivative_works
    WHERE id = ?
  `, req.params.id);

  if (!r) {
    return res.status(404).json({ error: 'Derivative work not found' });
  }

  res.json({
    ...r,
    sourceCanonReferences: safeJson(r.sourceCanonReferences, []),
    metadata: safeJson(r.metadata, {}),
  });
});

// Create a derivative work
router.post('/', async (req, res) => {
  const {
    projectId,
    type,
    title = '',
    description = '',
    status = 'draft',
    content = '',
    sourceCanonReferences = [],
    metadata = {},
  } = req.body;

  if (!projectId) {
    return res.status(400).json({ error: 'projectId is required' });
  }

  if (!VALID_TYPES.includes(type)) {
    return res.status(400).json({
      error: `Invalid derivative type '${type}'. Must be one of: ${VALID_TYPES.join(', ')}`,
    });
  }

  const id = randomUUID();
  const now = new Date().toISOString();

  await db.run(`
    INSERT INTO derivative_works (
      id, project_id, type, title, description, status, content,
      source_canon_references, metadata, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?::jsonb, ?, ?)
  `,
    id,
    projectId,
    type,
    title,
    description,
    VALID_STATUSES.includes(status) ? status : 'draft',
    content,
    JSON.stringify(sourceCanonReferences),
    JSON.stringify(metadata),
    now,
    now,
  );

  const created = await db.get(`
    SELECT id, project_id as "projectId", type, title, description,
           status, content, source_canon_references as "sourceCanonReferences",
           metadata, created_at as "createdAt", updated_at as "updatedAt"
    FROM derivative_works WHERE id = ?
  `, id);

  res.status(201).json({
    ...created,
    sourceCanonReferences: safeJson(created.sourceCanonReferences, []),
    metadata: safeJson(created.metadata, {}),
  });
});

// Update a derivative work
router.put('/:id', async (req, res) => {
  const {
    title,
    description,
    status,
    content,
    sourceCanonReferences,
    metadata,
  } = req.body;

  const existing = await db.get('SELECT id FROM derivative_works WHERE id = ?', req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Derivative work not found' });
  }

  const now = new Date().toISOString();

  await db.run(`
    UPDATE derivative_works SET
      title = COALESCE(?, title),
      description = COALESCE(?, description),
      status = COALESCE(?, status),
      content = COALESCE(?, content),
      source_canon_references = COALESCE(?::jsonb, source_canon_references),
      metadata = COALESCE(?::jsonb, metadata),
      updated_at = ?
    WHERE id = ?
  `,
    title,
    description,
    status && VALID_STATUSES.includes(status) ? status : null,
    content,
    sourceCanonReferences ? JSON.stringify(sourceCanonReferences) : null,
    metadata ? JSON.stringify(metadata) : null,
    now,
    req.params.id,
  );

  const updated = await db.get(`
    SELECT id, project_id as "projectId", type, title, description,
           status, content, source_canon_references as "sourceCanonReferences",
           metadata, created_at as "createdAt", updated_at as "updatedAt"
    FROM derivative_works WHERE id = ?
  `, req.params.id);

  res.json({
    ...updated,
    sourceCanonReferences: safeJson(updated.sourceCanonReferences, []),
    metadata: safeJson(updated.metadata, {}),
  });
});

// Delete a derivative work
router.delete('/:id', async (req, res) => {
  const result = await db.run('DELETE FROM derivative_works WHERE id = ?', req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Derivative work not found' });
  }
  res.json({ success: true });
});

// Generate a structured derivative brief from universe canon (Task 817)
router.post('/generate-brief', async (req, res) => {
  const {
    projectId,
    type,
    title,
    focus = '',
    selectedEntityIds = [],
  } = req.body;

  if (!projectId || !type) {
    return res.status(400).json({ error: 'projectId and type are required' });
  }

  if (!VALID_TYPES.includes(type)) {
    return res.status(400).json({
      error: `Invalid derivative type '${type}'. Must be one of: ${VALID_TYPES.join(', ')}`,
    });
  }

  // 1. Gather universe project and canon facts
  const universe = await db.get('SELECT id, title, description FROM stories WHERE id = ?', projectId);
  if (!universe) {
    return res.status(404).json({ error: 'Universe project not found' });
  }

  const [allChars, allLocs, allFacs, allTimeline, allBestiary] = await Promise.all([
    db.all('SELECT id, name, role, motivation, current_location_id as "currentLocationId" FROM characters WHERE project_id = ?', projectId),
    db.all('SELECT id, name, region_type as "regionType", description FROM locations WHERE project_id = ?', projectId),
    db.all('SELECT id, name, description, goals FROM factions WHERE project_id = ?', projectId),
    db.all('SELECT id, date, title, description FROM timeline_events WHERE project_id = ? ORDER BY date ASC, id ASC', projectId),
    db.all('SELECT id, name, category, tactics, hearts, description FROM bestiary WHERE project_id = ?', projectId),
  ]);

  // Filter or prioritize selected entities
  const filterOrAll = (list) => {
    if (!selectedEntityIds.length) return list;
    const filtered = list.filter((item) => selectedEntityIds.includes(item.id));
    return filtered.length > 0 ? filtered : list;
  };

  const scopedChars = filterOrAll(allChars);
  const scopedLocs = filterOrAll(allLocs);
  const scopedFacs = filterOrAll(allFacs);
  const scopedEvents = filterOrAll(allTimeline);
  const scopedBestiary = filterOrAll(allBestiary);

  // Compile source canon references
  const sourceCanonReferences = [
    ...scopedChars.slice(0, 4).map((c) => ({ entityType: 'character', entityId: c.id, name: c.name })),
    ...scopedLocs.slice(0, 3).map((l) => ({ entityType: 'location', entityId: l.id, name: l.name })),
    ...scopedFacs.slice(0, 3).map((f) => ({ entityType: 'faction', entityId: f.id, name: f.name })),
    ...scopedEvents.slice(0, 3).map((e) => ({ entityType: 'timeline_event', entityId: e.id, name: e.title })),
    ...scopedBestiary.slice(0, 2).map((b) => ({ entityType: 'bestiary', entityId: b.id, name: b.name })),
  ];

  const primaryChar = scopedChars[0] || { name: 'A Local Protagonist', role: 'Wanderer' };
  const primaryLoc = scopedLocs[0] || { name: 'The Frontier Basin', regionType: 'region' };
  const primaryFac = scopedFacs[0] || { name: 'The Regional Council', description: 'Local authority' };
  const incitingEvent = scopedEvents[0] || { title: 'The Unsettled Peace', date: 'Recent Era' };

  let generatedTitle = title?.trim() || `${universe.title}: ${type.toUpperCase()}`;
  let briefDescription = '';
  let content = '';
  let metadata = {};

  if (type === 'campaign') {
    briefDescription = `A tabletop campaign brief set in ${primaryLoc.name}, dealing with tensions between ${primaryFac.name} and surrounding threats.`;
    content = `# Campaign Brief: ${generatedTitle}

## Setting & Starting Hub
- **Primary Location**: ${primaryLoc.name} (${primaryLoc.regionType || 'settlement'})
- **Atmospheric Context**: ${universe.description || 'A world of emerging lore and shifting power.'}

## Inciting Incident
- **Event**: ${incitingEvent.title} (${incitingEvent.date || 'Recent Era'})
- **Table Stakes**: Following ${incitingEvent.title}, localized unrest has erupted around ${primaryLoc.name}.

## Dramatis Personae
${scopedChars.slice(0, 3).map((c) => `- **${c.name}** (${c.role || 'NPC'}): ${c.motivation || 'Guards local interests.'}`).join('\n') || '- Local tavern keeper and harbor scout.'}

## Faction Pressures
${scopedFacs.slice(0, 2).map((f) => `- **${f.name}**: ${f.description || 'Vying for control.'}`).join('\n') || '- Local loyalists versus border raiders.'}

## Encounter Threats & Hazards
${scopedBestiary.slice(0, 2).map((b) => `- **${b.name}** (${b.category || 'Threat'}): ${b.description || 'Aggressive patrol.'}`).join('\n') || '- Goblin scout ambush on the northern ridge.'}
`;

    // Create D&D export payload
    metadata.dndExportPayload = {
      jobType: 'draft_campaign_asset_bundle',
      schemaVersion: 1,
      worldBrief: {
        name: generatedTitle,
        summary: briefDescription,
        themes: ['frontier survival', 'faction intrigue'],
        openQuestions: [`Who stands to gain if ${primaryLoc.name} falls?`],
      },
      characters: scopedChars.slice(0, 3).map((c) => ({
        id: c.id,
        name: c.name,
        role: c.role || 'Key NPC',
        summary: c.motivation || 'Active in the district.',
        motivation: c.motivation || 'Maintain local order.',
        locationId: primaryLoc.id,
        factionIds: scopedFacs[0] ? [scopedFacs[0].id] : [],
      })),
      factions: scopedFacs.slice(0, 2).map((f) => ({
        id: f.id,
        name: f.name,
        summary: f.description || 'Faction operating in the area.',
        goal: 'Secure strategic dominance.',
        pressure: 'Resources and trade are restricted.',
      })),
      locations: scopedLocs.slice(0, 2).map((l) => ({
        id: l.id,
        name: l.name,
        summary: l.description || 'Key campaign location.',
        regionType: l.regionType || 'district',
      })),
      timelineEvents: scopedEvents.slice(0, 2).map((e) => ({
        id: e.id,
        date: e.date || 'Era 1',
        title: e.title,
        summary: e.description || 'A turning point.',
      })),
    };
  } else if (type === 'story') {
    briefDescription = `A narrative prose story following ${primaryChar.name} as they navigate the aftermath of ${incitingEvent.title}.`;
    content = `# Story Outline: ${generatedTitle}

## Logline
When ${incitingEvent.title} shatters the uneasy peace in ${primaryLoc.name}, ${primaryChar.name} must confront ${primaryFac.name} before an escalating crisis destroys everything they hold dear.

## Characters
- **Protagonist**: ${primaryChar.name} (${primaryChar.role || 'Protagonist'}) — Driven by: ${primaryChar.motivation || 'Survival and truth'}.
- **Opposition / Rival**: ${scopedChars[1]?.name || 'An unknown operative from ' + primaryFac.name}.

## Act Structure
- **Act I: The Disturbance**: Life in ${primaryLoc.name} is upended when ripples from ${incitingEvent.title} arrive.
- **Act II: Escalation**: ${primaryChar.name} journeys across the frontier, unearthing deeper friction within ${primaryFac.name}.
- **Act III: Climax & Resolution**: A direct confrontation at ${primaryLoc.name} forces a permanent shift in the regional balance.
`;
  } else if (type === 'screenplay') {
    briefDescription = `A visual screenplay brief emphasizing cinematic sequences in ${primaryLoc.name}.`;
    content = `# Screenplay Treatment: ${generatedTitle}

## Setting the Scene
EXT. ${primaryLoc.name.toUpperCase()} - DUSK
The landscape lies shadowed beneath the ridge. Mist clings to the ground as signs of ${incitingEvent.title} become visible.

## Dramatic Core
${primaryChar.name.toUpperCase()} stands on the precipice, watching ${primaryFac.name} enforcers advance.

## Key Scene Beats
1. **Teaser**: Discovery of evidence connected to ${incitingEvent.title}.
2. **First Turning Point**: ${primaryChar.name} is given an impossible ultimatum.
3. **Midpoint**: An ambush in the treacherous terrain of ${primaryLoc.name}.
4. **Climax**: High-stakes face-off resolving the regional power struggle.
`;
  } else if (type === 'game_concept') {
    briefDescription = `An interactive game design brief set in ${universe.title}, emphasizing exploration, survival, and faction influence.`;
    content = `# Game Concept Document: ${generatedTitle}

## High Concept
An immersive exploration RPG set in ${universe.title}. Players establish an outpost in ${primaryLoc.name}, negotiate with ${primaryFac.name}, and survive encounters with regional beasts.

## Core Gameplay Loops
1. **Explore & Scout**: Traverse ${primaryLoc.name} and unearth ancient timeline relics.
2. **Faction Diplomacy**: Gain reputation or provoke conflict with ${scopedFacs.map((f) => f.name).join(' and ') || primaryFac.name}.
3. **Tactical Combat**: Face threats like ${scopedBestiary[0]?.name || 'wild predators'} utilizing environmental advantages.
`;
  } else if (type === 'storyboard') {
    briefDescription = `A sequential storyboard beat sheet capturing key visual frames across ${primaryLoc.name}.`;
    content = `# Storyboard Sequence: ${generatedTitle}

## Frame 1: Establishing Vista
- **Shot**: Wide angle crane shot over ${primaryLoc.name}.
- **Audio / Mood**: Distant wind; ominous quiet following ${incitingEvent.title}.

## Frame 2: Character Introduction
- **Shot**: Medium close-up on ${primaryChar.name}.
- **Action**: Eyes fixed on the horizon, noticing smoke from the north.

## Frame 3: Conflict Eruption
- **Shot**: Dynamic Dutch angle as ${primaryFac.name} banner comes into view.
- **Action**: Confrontation initiates at the border gate.

## Frame 4: Cliffhanger Beat
- **Shot**: Low angle tracking shot of an encroaching threat.
`;
  }

  // 2. Save derivative work
  const derivativeId = randomUUID();
  const now = new Date().toISOString();

  await db.run(`
    INSERT INTO derivative_works (
      id, project_id, type, title, description, status, content,
      source_canon_references, metadata, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'draft', ?, ?::jsonb, ?::jsonb, ?, ?)
  `,
    derivativeId,
    projectId,
    type,
    generatedTitle,
    briefDescription,
    content,
    JSON.stringify(sourceCanonReferences),
    JSON.stringify(metadata),
    now,
    now,
  );

  const created = await db.get(`
    SELECT id, project_id as "projectId", type, title, description,
           status, content, source_canon_references as "sourceCanonReferences",
           metadata, created_at as "createdAt", updated_at as "updatedAt"
    FROM derivative_works WHERE id = ?
  `, derivativeId);

  res.status(201).json({
    ...created,
    sourceCanonReferences: safeJson(created.sourceCanonReferences, []),
    metadata: safeJson(created.metadata, {}),
  });
});

// D&D export format endpoint
router.get('/:id/dnd-export', async (req, res) => {
  const derivative = await db.get(`
    SELECT id, project_id as "projectId", type, title, description, metadata
    FROM derivative_works WHERE id = ?
  `, req.params.id);

  if (!derivative) {
    return res.status(404).json({ error: 'Derivative work not found' });
  }

  if (derivative.type !== 'campaign') {
    return res.status(400).json({ error: 'D&D export is only available for campaign derivatives' });
  }

  const metadata = safeJson(derivative.metadata, {});
  let payload = metadata.dndExportPayload;

  if (!payload) {
    const rawRefs = await db.get(
      'SELECT source_canon_references FROM derivative_works WHERE id = ?',
      derivative.id,
    );
    const refs = safeJson(rawRefs?.source_canon_references, []);
    payload = {
      jobType: 'draft_campaign_asset_bundle',
      schemaVersion: 1,
      worldBrief: {
        name: derivative.title,
        summary: derivative.description,
        themes: ['frontier rescue', 'tactical encounter', 'faction friction'],
        openQuestions: ['What ancient power stirs beneath the forest canopy?'],
      },
      characters: refs.filter((r) => r.entityType === 'character').map((c) => ({
        id: c.entityId,
        name: c.name,
        role: 'Key NPC / Operative',
        summary: 'Active in the campaign district.',
        motivation: 'Pursue mission objectives.',
      })),
      locations: refs.filter((r) => r.entityType === 'location').map((l) => ({
        id: l.entityId,
        name: l.name,
        summary: 'Primary operating area.',
        regionType: 'district',
      })),
      factions: refs.filter((r) => r.entityType === 'faction').map((f) => ({
        id: f.entityId,
        name: f.name,
        summary: 'Faction operating in the area.',
        goal: 'Secure strategic control.',
      })),
      threats: refs.filter((r) => r.entityType === 'bestiary').map((b) => ({
        id: b.entityId,
        name: b.name,
        category: 'Combatant',
        tactics: ['Aggressive ambush', 'Swarm'],
      })),
    };
  }

  res.json({
    id: derivative.id,
    artifactType: 'campaign_bundle',
    status: 'accepted',
    payload,
  });
});

export default router;
