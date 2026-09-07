import { Router } from 'express';
import { randomUUID } from 'crypto';
import db from '../db.js';

const router = Router();

const VALID_TYPES = ['campaign', 'story', 'screenplay', 'game_concept', 'storyboard'];
const VALID_STATUSES = ['draft', 'in_progress', 'completed', 'accepted', 'in_review', 'archived'];

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
           metadata, image_style as "imageStyle", image_style_negative as "imageStyleNegative",
           created_at as "createdAt", updated_at as "updatedAt"
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
           metadata, image_style as "imageStyle", image_style_negative as "imageStyleNegative",
           created_at as "createdAt", updated_at as "updatedAt"
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
           metadata, image_style as "imageStyle", image_style_negative as "imageStyleNegative",
           created_at as "createdAt", updated_at as "updatedAt"
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
    imageStyle,
    imageStyleNegative,
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
      image_style = COALESCE(?, image_style),
      image_style_negative = COALESCE(?, image_style_negative),
      updated_at = ?
    WHERE id = ?
  `,
    title,
    description,
    status && VALID_STATUSES.includes(status) ? status : null,
    content,
    sourceCanonReferences ? JSON.stringify(sourceCanonReferences) : null,
    metadata ? JSON.stringify(metadata) : null,
    // Empty string is a real value here -- it is how somebody clears a style --
    // so only undefined leaves the column alone.
    imageStyle === undefined ? null : String(imageStyle),
    imageStyleNegative === undefined ? null : String(imageStyleNegative),
    now,
    req.params.id,
  );

  const updated = await db.get(`
    SELECT id, project_id as "projectId", type, title, description,
           status, content, source_canon_references as "sourceCanonReferences",
           metadata, image_style as "imageStyle", image_style_negative as "imageStyleNegative",
           created_at as "createdAt", updated_at as "updatedAt"
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

## Encounter Threats & In-Universe Ecology
${scopedBestiary.slice(0, 3).map((b) => `- **${b.name}** (${b.category || 'Threat'}): ${b.description || 'Regional entity.'}
  - *In-Universe Origin*: ${b.inUniverseBackstory || 'Indigenous creature shaped by the regional confluence.'}
  - *Motivation & Behavior*: ${b.motivation || 'Defends its territorial perimeter against encroaching travelers.'}`).join('\n') || '- Goblin scout ambush on the northern ridge.'}
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
           metadata, image_style as "imageStyle", image_style_negative as "imageStyleNegative",
           created_at as "createdAt", updated_at as "updatedAt"
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
      threats: await Promise.all(
        refs.filter((r) => r.entityType === 'bestiary').map(async (b) => {
          const dbRow = await db.get(
            `SELECT name, category, hearts, tactics, description, notes,
                    in_universe_backstory as "inUniverseBackstory",
                    motivation, ecological_niche as "ecologicalNiche",
                    demographic_adaptations as "demographicAdaptations"
             FROM bestiary WHERE id = ? OR name = ?`,
            b.entityId, b.name,
          );
          const adaptations = safeJson(dbRow?.demographicAdaptations, {});
          return {
            id: b.entityId,
            name: dbRow?.name || b.name,
            category: dbRow?.category || 'Combatant',
            hearts: dbRow?.hearts || 3,
            tactics: safeJson(dbRow?.tactics, ['Aggressive ambush', 'Swarm']),
            description: dbRow?.description || 'Regional creature.',
            inUniverseBackstory: dbRow?.inUniverseBackstory || 'Rooted in the regional ecology.',
            motivation: dbRow?.motivation || 'Territorial defense.',
            ecologicalNiche: dbRow?.ecologicalNiche || 'Ecosystem inhabitant.',
            tabletopAdaptation: adaptations.tabletop_rpg || {
              combatRole: 'Ambusher',
              encounterPressure: 'Threatens unescorted flanks.',
            },
          };
        }),
      ),
    };
  }

  res.json({
    id: derivative.id,
    artifactType: 'campaign_bundle',
    status: 'accepted',
    payload,
  });
});

// Editorial Review Dossier endpoint for external AI agents
router.get('/:id/review-dossier', async (req, res) => {
  const derivative = await db.get(`
    SELECT id, project_id as "projectId", type, title, description,
           status, content, source_canon_references as "sourceCanonReferences",
           metadata, image_style as "imageStyle", image_style_negative as "imageStyleNegative",
           created_at as "createdAt", updated_at as "updatedAt"
    FROM derivative_works
    WHERE id = ?
  `, req.params.id);

  if (!derivative) {
    return res.status(404).json({ error: 'Derivative work not found' });
  }

  const projectId = derivative.projectId;
  const story = await db.get('SELECT * FROM stories WHERE id = ?', projectId);
  const metadata = safeJson(derivative.metadata, {});
  const beats = metadata?.structure?.sections || metadata?.acts || [];

  // Gather encyclopedia canon
  const characters = await db.all('SELECT * FROM characters WHERE project_id = ?', projectId);
  const locations = await db.all('SELECT * FROM locations WHERE project_id = ?', projectId);
  const factions = await db.all('SELECT * FROM factions WHERE project_id = ?', projectId);
  const timelineEvents = await db.all('SELECT * FROM timeline_events WHERE project_id = ?', projectId);

  // Filter scoped entities relevant to this chapter
  const contentLower = ((derivative.content || '') + ' ' + (derivative.description || '')).toLowerCase();

  const relevantCharacters = characters.filter((c) => {
    const nameLower = c.name.toLowerCase();
    const parts = nameLower.split(/\s+/);
    return contentLower.includes(nameLower) || parts.some((p) => p.length > 3 && contentLower.includes(p)) || c.importance === 'principal';
  });

  const relevantLocations = locations.filter((l) => {
    return contentLower.includes(l.name.toLowerCase());
  });

  const relevantFactions = factions.filter((f) => {
    return contentLower.includes(f.name.toLowerCase());
  });

  // Assemble dossier markdown
  const markdown = [
    `# Editorial Review Dossier: ${derivative.title}`,
    ``,
    `> **Universe**: ${story?.title || 'Universe'} | **Genre/Tone**: ${story?.description || 'Literary speculative fiction'}`,
    `> **Derivative ID**: \`${derivative.id}\` | **Status**: \`${derivative.status}\` | **Word Count**: ~${derivative.content ? derivative.content.split(/\s+/).length : 0}`,
    `> **Encyclopedia Endpoint**: \`/api/stories/${projectId}/encyclopedia\``,
    ``,
    `---`,
    ``,
    `## 1. Chapter Mission & Narrative Premise`,
    `**Title**: ${derivative.title}`,
    `**Premise/Logline**: ${derivative.description || 'N/A'}`,
    ``,
    `### Scene Beats / Plot Structure`,
    beats.length > 0
      ? beats.map((b, i) => `${i + 1}. **${b.title}**: ${b.summary || ''}`).join('\n')
      : `_No explicit beats partitioned; follow narrative premise._`,
    ``,
    `---`,
    ``,
    `## 2. Current Draft Prose Under Review`,
    ``,
    `\`\`\`markdown`,
    derivative.content || '_No prose drafted yet._',
    `\`\`\``,
    ``,
    `---`,
    ``,
    `## 3. Scoped Universe Encyclopedia (Canon Lore)`,
    ``,
    `### Key Characters & Personas`,
    relevantCharacters.length > 0
      ? relevantCharacters.map((c) => {
          const traits = Array.isArray(c.traits) ? c.traits : safeJson(c.traits, []);
          return `- **${c.name}** [${c.importance?.toUpperCase() || 'SUPPORTING'} / ${c.role || 'Operative'}]\n` +
                 `  - **Motivation**: ${c.motivation || 'N/A'}\n` +
                 `  - **Background**: ${c.background || 'N/A'}\n` +
                 `  - **Traits**: ${traits.join(', ') || 'N/A'}`;
        }).join('\n\n')
      : `_Refer to full encyclopedia for all ${characters.length} characters._`,
    ``,
    `### Locations & Settings`,
    relevantLocations.length > 0
      ? relevantLocations.map((l) => `- **${l.name}**: ${l.description || 'N/A'}`).join('\n')
      : `_Active setting: Deep space outer reach._`,
    ``,
    `### Factions & Political Groups`,
    relevantFactions.length > 0
      ? relevantFactions.map((f) => `- **${f.name}**: ${f.description || f.goals || 'N/A'}`).join('\n')
      : `_Standard universe factions._`,
    ``,
    `### Historical Anchor Points & Timeline Crises`,
    timelineEvents.slice(0, 5).map((e) => `- **Yr ${e.year ?? '?'} - ${e.title}**: ${e.summary || e.description || ''}`).join('\n'),
    ``,
    `---`,
    ``,
    `## 4. Editorial Review Rubric`,
    `When reviewing and refining this prose, verify:`,
    `1. **Canon Fidelity**: Strict adherence to character names, physical cybernetics/implants, faction names, and historical events.`,
    `2. **Sensory & Emotional Depth**: High literary craft, visceral space-fantasy atmosphere, and authentic psychological weight (e.g. war flashbacks).`,
    `3. **Show vs. Tell**: Dramatize scene conflict through dialogue and physical action. Eliminate metadata bullet points or summaries.`,
    `4. **Consistency**: Seamless chapter pacing with natural scene breaks (\`⁂\`).`,
    ``,
    `---`,
    ``,
    `## 5. How to Submit Updates`,
    `To update the chapter directly in StoryTime:`,
    `\`\`\`bash`,
    `curl -X PUT https://dev.jimmothy.site/storytime/api/derivatives/${derivative.id} \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -d '{"content": "<UPDATED_PROSE_TEXT>", "metadata": {"isComposedProse": true, "wordCount": <COUNT>}}'`,
    `\`\`\``,
    `Alternatively, return the updated text in a structured \`{"prose": "..."}\` response.`,
  ].join('\n');

  if (req.query.format === 'raw' || req.query.format === 'text' || req.headers.accept === 'text/plain') {
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    return res.send(markdown);
  }

  res.json({
    derivativeId: derivative.id,
    projectId,
    title: derivative.title,
    dossierMarkdown: markdown,
    encyclopediaUrl: `/api/stories/${projectId}/encyclopedia`,
    updateUrl: `/api/derivatives/${derivative.id}`,
  });
});

/**
 * The cast of one work, in billing order.
 *
 * Importance is a property of a character in a work, not of a character: the
 * figure who carries one story stands at the edge of another. The cast surface
 * read a single characters.importance column as though a universe had one
 * running order, so a story about Malakor could not put Malakor first.
 *
 * `importance` on the row overrides the character's own for this work only.
 * Null means "however this character is normally recorded".
 */
router.get('/:id/cast', async (req, res) => {
  const work = await db.get('SELECT id FROM derivative_works WHERE id = ?', req.params.id);
  if (!work) return res.status(404).json({ error: 'Work not found' });

  const rows = await db.all(`
    SELECT
      wc.character_id AS "characterId",
      wc.billing,
      wc.importance AS "workImportance",
      wc.source,
      wc.notes,
      c.name,
      c.role,
      c.importance AS "characterImportance"
    FROM work_characters wc
    JOIN characters c ON c.id = wc.character_id
    WHERE wc.work_id = ?
    ORDER BY wc.billing ASC, c.name ASC
  `, req.params.id);

  res.json(rows);
});

/**
 * Replace the cast of a work in one write.
 *
 * Replace rather than merge: a running order is a whole, and merging leaves a
 * character who was removed from the work still billed in it. Authored links
 * are protected from a derived write, so re-running a scan cannot overwrite a
 * decision somebody made by hand.
 */
router.put('/:id/cast', async (req, res) => {
  const work = await db.get('SELECT id FROM derivative_works WHERE id = ?', req.params.id);
  if (!work) return res.status(404).json({ error: 'Work not found' });

  const { cast, source = 'authored' } = req.body ?? {};
  if (!Array.isArray(cast)) {
    return res.status(400).json({ error: 'cast must be an array of { characterId, billing }.' });
  }
  if (!['authored', 'derived'].includes(source)) {
    return res.status(400).json({ error: `Invalid source '${source}'.` });
  }

  const seen = new Set();
  for (const entry of cast) {
    const id = entry?.characterId;
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Every cast entry needs a characterId.' });
    }
    if (seen.has(id)) {
      return res.status(400).json({ error: `Character ${id} is billed twice.` });
    }
    seen.add(id);
    if (entry.importance != null
      && !['principal', 'supporting', 'background'].includes(entry.importance)) {
      return res.status(400).json({ error: `Invalid importance '${entry.importance}'.` });
    }
    if (entry.billing != null && !Number.isInteger(entry.billing)) {
      return res.status(400).json({ error: 'billing must be a whole number.' });
    }
  }

  const existing = await db.all(
    'SELECT character_id AS "characterId" FROM work_characters WHERE work_id = ? AND source = ?',
    req.params.id, 'authored',
  );
  const authored = new Set(existing.map((r) => r.characterId));

  // A derived pass proposes; it does not overrule somebody's decision.
  const writable = source === 'derived'
    ? cast.filter((entry) => !authored.has(entry.characterId))
    : cast;

  await db.run(
    source === 'derived'
      ? 'DELETE FROM work_characters WHERE work_id = ? AND source = ?'
      : 'DELETE FROM work_characters WHERE work_id = ?',
    ...(source === 'derived' ? [req.params.id, 'derived'] : [req.params.id]),
  );

  let billing = 0;
  for (const entry of writable) {
    billing += 1;
    await db.run(`
      INSERT INTO work_characters (work_id, character_id, billing, importance, source, notes)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (work_id, character_id) DO UPDATE SET
        billing = EXCLUDED.billing,
        importance = EXCLUDED.importance,
        source = EXCLUDED.source,
        notes = EXCLUDED.notes,
        updated_at = now()
    `, req.params.id, entry.characterId,
      Number.isInteger(entry.billing) ? entry.billing : billing,
      entry.importance ?? null, source, String(entry.notes ?? ''));
  }

  const rows = await db.all(
    'SELECT character_id AS "characterId", billing, importance, source FROM work_characters WHERE work_id = ? ORDER BY billing ASC',
    req.params.id,
  );
  res.json(rows);
});

export default router;
