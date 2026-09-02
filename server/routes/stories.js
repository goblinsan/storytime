import { Router } from 'express';
import { randomUUID } from 'crypto';
import db from '../db.js';

const router = Router();

// Helper to safely parse JSON
function safeJson(val, fallback) {
  if (!val) return fallback;
  if (typeof val === 'object') return val;
  try {
    return JSON.parse(val);
  } catch {
    return fallback;
  }
}

// List all projects (optionally filtered by type)
router.get('/', async (req, res) => {
  const { type } = req.query;
  let sql = `
    SELECT id, title, author, description, content, type,
           promotion_policy as "promotionPolicy", is_protected as "isProtected",
           created_at as "createdAt", updated_at as "updatedAt", is_published as "isPublished"
    FROM stories
  `;
  const params = [];
  if (type) {
    sql += ' WHERE type = ?';
    params.push(type);
  }
  sql += ' ORDER BY updated_at DESC';

  const stories = await db.all(sql, ...params);

  const result = await Promise.all(stories.map(async (s) => {
    const [charRow, locRow, facRow, timeRow, beastRow, draftRow, derivRow] = await Promise.all([
      db.get('SELECT count(*)::int as count FROM characters WHERE project_id = ?', s.id),
      db.get('SELECT count(*)::int as count FROM locations WHERE project_id = ?', s.id),
      db.get('SELECT count(*)::int as count FROM factions WHERE project_id = ?', s.id),
      db.get('SELECT count(*)::int as count FROM timeline_events WHERE project_id = ?', s.id),
      db.get('SELECT count(*)::int as count FROM bestiary WHERE project_id = ?', s.id),
      db.get('SELECT count(*)::int as count FROM generated_drafts WHERE project_id = ?', s.id),
      db.get('SELECT count(*)::int as count FROM derivative_works WHERE project_id = ?', s.id).catch(() => ({ count: 0 })),
    ]);

    const characters = await db.all('SELECT id, name FROM characters WHERE project_id = ?', s.id);

    return {
      ...s,
      isPublished: !!s.isPublished,
      characters,
      counts: {
        characters: charRow?.count ?? 0,
        locations: locRow?.count ?? 0,
        factions: facRow?.count ?? 0,
        timelineEvents: timeRow?.count ?? 0,
        bestiary: beastRow?.count ?? 0,
        drafts: draftRow?.count ?? 0,
        derivatives: derivRow?.count ?? 0,
      },
    };
  }));

  res.json(result);
});

// Universe Encyclopedia aggregation endpoint
router.get('/:id/encyclopedia', async (req, res) => {
  const story = await db.get(`
    SELECT id, title, author, description, content, type,
           promotion_policy as "promotionPolicy", is_protected as "isProtected",
           created_at as "createdAt", updated_at as "updatedAt", is_published as "isPublished"
    FROM stories WHERE id = ?
  `, req.params.id);

  if (!story) {
    return res.status(404).json({ error: 'Universe project not found' });
  }

  const projectId = story.id;
  const [
    characters,
    locations,
    factions,
    timelineEvents,
    bestiary,
    religions,
    languages,
    cultures,
    drafts,
    derivatives,
    arcs,
    technologies,
  ] = await Promise.all([
    db.all(`
      SELECT id, project_id as "projectId", name, description, role, background,
             traits, relationships, motivation, current_location_id as "currentLocationId",
             shared_character_id as "sharedCharacterId", is_shared_variant as "isSharedVariant",
             is_protected as "isProtected",
             updated_at as "updatedAt"
      FROM characters WHERE project_id = ? ORDER BY updated_at DESC
    `, projectId),
    db.all(`
      SELECT id, name, description, region_type as "regionType", political_notes as "politicalNotes",
             coordinates_x as "coordinatesX", coordinates_y as "coordinatesY",
             is_protected as "isProtected"
      FROM locations WHERE project_id = ? ORDER BY name ASC
    `, projectId),
    db.all(`
      SELECT id, name, description, goals, is_protected as "isProtected"
      FROM factions WHERE project_id = ? ORDER BY name ASC
    `, projectId),
    db.all(`
      SELECT id, date, title, description, is_protected as "isProtected"
      FROM timeline_events WHERE project_id = ? ORDER BY date ASC, id ASC
    `, projectId),
    db.all(`
      SELECT id, project_id as "projectId", name, category, hearts, tactics, status, description, notes,
             in_universe_backstory as "inUniverseBackstory",
             motivation, ecological_niche as "ecologicalNiche",
             demographic_adaptations as "demographicAdaptations",
             shared_bestiary_id as "sharedBestiaryId", is_shared_variant as "isSharedVariant"
      FROM bestiary WHERE project_id = ? ORDER BY category, name
    `, projectId),
    db.all('SELECT id, name, beliefs, deities FROM religions WHERE project_id = ? ORDER BY name ASC', projectId),
    db.all('SELECT id, name, vocabulary, grammar FROM languages WHERE project_id = ? ORDER BY name ASC', projectId),
    db.all('SELECT myths, politics_type as "politicsType", politics_description as "politicsDescription" FROM cultures WHERE project_id = ?', projectId),
    db.all(`
      SELECT id, dashboard_task_id as "taskId", artifact_type as "artifactType", status, gate_result as "gateResult", created_at as "createdAt"
      FROM generated_drafts WHERE project_id = ? ORDER BY created_at DESC
    `, projectId).catch(() => []),
    db.all(`
      SELECT id, type, title, description, status, created_at as "createdAt", updated_at as "updatedAt"
      FROM derivative_works WHERE project_id = ? ORDER BY updated_at DESC
    `, projectId).catch(() => []),
    db.all('SELECT id, arc_number as "arcNumber", title, description FROM story_arcs WHERE project_id = ? ORDER BY arc_number ASC', projectId),
    db.all(`
      SELECT id, project_id as "projectId", name, principles, limitations, proliferation, classification,
             patents_or_taboos as "patentsOrTaboos", is_protected as "isProtected", created_at as "createdAt"
      FROM technologies WHERE project_id = ? ORDER BY name ASC
    `, projectId).catch(() => []),
  ]);

  const parsedCharacters = characters.map((c) => ({
    ...c,
    traits: safeJson(c.traits, []),
    relationships: safeJson(c.relationships, []),
  }));

  const parsedFactions = factions.map((f) => ({
    ...f,
    goals: safeJson(f.goals, []),
  }));

  const parsedBestiary = bestiary.map((b) => ({
    ...b,
    tactics: safeJson(b.tactics, []),
    demographicAdaptations: safeJson(b.demographicAdaptations, {}),
  }));

  const parsedReligions = religions.map((r) => ({
    ...r,
    beliefs: safeJson(r.beliefs, []),
    deities: safeJson(r.deities, []),
  }));

  const parsedLanguages = languages.map((l) => ({
    ...l,
    vocabulary: safeJson(l.vocabulary, {}),
  }));

  const parsedCultures = cultures.map((c) => ({
    ...c,
    myths: safeJson(c.myths, []),
  }));

  const parsedTechnologies = (technologies || []).map((t) => ({
    ...t,
    isProtected: Boolean(t.isProtected),
  }));

  res.json({
    project: {
      id: story.id,
      title: story.title,
      author: story.author,
      description: story.description,
      type: story.type,
      createdAt: story.createdAt,
      updatedAt: story.updatedAt,
      isPublished: !!story.isPublished,
    },
    counts: {
      characters: parsedCharacters.length,
      locations: locations.length,
      factions: parsedFactions.length,
      timelineEvents: timelineEvents.length,
      technologies: parsedTechnologies.length,
      bestiary: parsedBestiary.length,
      religions: parsedReligions.length,
      languages: parsedLanguages.length,
      cultures: parsedCultures.length,
      drafts: drafts.length,
      derivatives: derivatives.length,
      arcs: arcs.length,
    },
    catalog: {
      characters: parsedCharacters,
      locations,
      factions: parsedFactions,
      timelineEvents,
      technologies: parsedTechnologies,
      bestiary: parsedBestiary,
      religions: parsedReligions,
      languages: parsedLanguages,
      cultures: parsedCultures,
      drafts,
      derivatives,
      arcs,
    },
    recentUpdates: {
      characters: parsedCharacters.slice(0, 5),
      locations: locations.slice(0, 5),
      factions: parsedFactions.slice(0, 5),
      timelineEvents: timelineEvents.slice(0, 5),
      technologies: parsedTechnologies.slice(0, 5),
      bestiary: parsedBestiary.slice(0, 5),
      drafts: drafts.slice(0, 5),
      derivatives: derivatives.slice(0, 5),
    },
  });
});

// Get a single project with all related data
router.get('/:id', async (req, res) => {
  const story = await db.get(`
    SELECT id, title, author, description, content, type,
           promotion_policy as "promotionPolicy", is_protected as "isProtected",
           created_at as "createdAt", updated_at as "updatedAt", is_published as "isPublished"
    FROM stories WHERE id = ?
  `, req.params.id);

  if (!story) {
    return res.status(404).json({ error: 'Project not found' });
  }

  story.isPublished = !!story.isPublished;
  story.isProtected = !!story.isProtected;

  // Load characters with campaign and shared fields
  const characters = await db.all(`
    SELECT id, project_id as "projectId", name, description, background, traits, relationships,
           character_type as "characterType", role, hearts, core_skills as "coreSkills",
           special_abilities as "specialAbilities", notable_moments as "notableMoments",
           tendencies, location, motivation,
           shared_character_id as "sharedCharacterId", is_shared_variant as "isSharedVariant",
           is_protected as "isProtected"
    FROM characters WHERE project_id = ?
  `, story.id);

  story.characters = characters.map(c => ({
    ...c,
    traits: safeJson(c.traits, []),
    relationships: safeJson(c.relationships, []),
    coreSkills: safeJson(c.coreSkills, []),
    specialAbilities: safeJson(c.specialAbilities, []),
    notableMoments: safeJson(c.notableMoments, []),
    isProtected: !!c.isProtected,
  }));

  // Load locations with region data
  const locations = await db.all(`
    SELECT id, name, description, coordinates_x, coordinates_y,
           region_type as "regionType", races, political_notes as "politicalNotes",
           is_protected as "isProtected"
    FROM locations WHERE project_id = ?
  `, story.id);

  story.locations = locations.map(l => ({
    id: l.id,
    name: l.name,
    description: l.description,
    coordinates: l.coordinates_x != null ? { x: l.coordinates_x, y: l.coordinates_y } : undefined,
    regionType: l.regionType,
    races: safeJson(l.races, []),
    politicalNotes: l.politicalNotes,
    isProtected: !!l.isProtected,
  }));

  // Load timeline events
  story.timelineEvents = (await db.all(`
    SELECT id, date, title, description, is_protected as "isProtected"
    FROM timeline_events WHERE project_id = ? ORDER BY date ASC, id ASC
  `, story.id)).map(t => ({ ...t, isProtected: !!t.isProtected }));

  // Load story arcs
  story.arcs = (await db.all(`
    SELECT id, project_id as "projectId", arc_number as "arcNumber", title, description, details,
           is_protected as "isProtected"
    FROM story_arcs WHERE project_id = ? ORDER BY arc_number ASC
  `, story.id)).map(a => ({ ...a, details: safeJson(a.details, []), isProtected: !!a.isProtected }));

  // Load bestiary
  story.bestiary = (await db.all(`
    SELECT id, project_id as "projectId", name, category, hearts, tactics, status, description, notes,
           in_universe_backstory as "inUniverseBackstory",
           motivation, ecological_niche as "ecologicalNiche",
           demographic_adaptations as "demographicAdaptations",
           shared_bestiary_id as "sharedBestiaryId", is_shared_variant as "isSharedVariant"
    FROM bestiary WHERE project_id = ? ORDER BY category, name
  `, story.id)).map(b => ({
    ...b,
    tactics: safeJson(b.tactics, []),
    demographicAdaptations: safeJson(b.demographicAdaptations, {}),
  }));

  // Load factions
  story.factions = (await db.all(`
    SELECT id, name, description, goals, is_protected as "isProtected"
    FROM factions WHERE project_id = ? ORDER BY name ASC
  `, story.id)).map(f => ({ ...f, goals: safeJson(f.goals, []), isProtected: !!f.isProtected }));

  // Load derivatives
  story.derivatives = await db.all(`
    SELECT id, type, title, description, status, created_at as "createdAt", updated_at as "updatedAt"
    FROM derivative_works WHERE project_id = ? ORDER BY updated_at DESC
  `, story.id).catch(() => []);

  // Counts summary
  story.counts = {
    characters: story.characters.length,
    locations: story.locations.length,
    factions: story.factions.length,
    timelineEvents: story.timelineEvents.length,
    bestiary: story.bestiary.length,
    arcs: story.arcs.length,
    derivatives: story.derivatives.length,
  };

  return res.json(story);
});

const ALLOWED_PROMOTION_POLICIES = new Set(['auto_promote', 'auto_accept', 'manual']);

// Create a new project
router.post('/', async (req, res) => {
  const id = randomUUID();
  const {
    title = '',
    author = '',
    content = '',
    description = '',
    type = 'universe',
    promotionPolicy = 'auto_promote',
    isProtected = false,
  } = req.body;

  if (promotionPolicy && !ALLOWED_PROMOTION_POLICIES.has(promotionPolicy)) {
    return res.status(400).json({
      error: `Invalid promotionPolicy '${promotionPolicy}'. Allowed: auto_promote, auto_accept, manual (quarantine is a runtime outcome).`,
    });
  }

  const now = new Date().toISOString();

  await db.run(`
    INSERT INTO stories (id, title, author, description, content, type, promotion_policy, is_protected, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, id, title, author, description, content, type, promotionPolicy, Boolean(isProtected), now, now);

  const story = await db.get(`
    SELECT id, title, author, description, content, type,
           promotion_policy as "promotionPolicy", is_protected as "isProtected",
           created_at as "createdAt", updated_at as "updatedAt", is_published as "isPublished"
    FROM stories WHERE id = ?
  `, id);

  story.isPublished = !!story.isPublished;
  story.isProtected = !!story.isProtected;
  story.characters = [];
  story.arcs = [];
  story.bestiary = [];
  story.factions = [];
  story.locations = [];
  story.timelineEvents = [];
  story.derivatives = [];
  story.counts = {
    characters: 0,
    locations: 0,
    factions: 0,
    timelineEvents: 0,
    bestiary: 0,
    arcs: 0,
    derivatives: 0,
  };

  res.status(201).json(story);
});

// Update a project (PUT)
router.put('/:id', async (req, res) => {
  const { title, author, description, content, type, isPublished, promotionPolicy, isProtected } = req.body;
  const now = new Date().toISOString();

  const existing = await db.get('SELECT id FROM stories WHERE id = ?', req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Project not found' });
  }

  if (promotionPolicy && !ALLOWED_PROMOTION_POLICIES.has(promotionPolicy)) {
    return res.status(400).json({
      error: `Invalid promotionPolicy '${promotionPolicy}'. Allowed: auto_promote, auto_accept, manual (quarantine is a runtime outcome).`,
    });
  }

  await db.run(`
    UPDATE stories SET
      title = COALESCE(?, title),
      author = COALESCE(?, author),
      description = COALESCE(?, description),
      content = COALESCE(?, content),
      type = COALESCE(?, type),
      is_published = COALESCE(?, is_published),
      promotion_policy = COALESCE(?, promotion_policy),
      is_protected = COALESCE(?, is_protected),
      updated_at = ?
    WHERE id = ?
  `,
    title, author, description, content, type,
    isPublished != null ? (isPublished ? 1 : 0) : null,
    promotionPolicy,
    isProtected != null ? Boolean(isProtected) : null,
    now, req.params.id
  );

  const story = await db.get(`
    SELECT id, title, author, description, content, type,
           promotion_policy as "promotionPolicy", is_protected as "isProtected",
           created_at as "createdAt", updated_at as "updatedAt", is_published as "isPublished"
    FROM stories WHERE id = ?
  `, req.params.id);

  story.isPublished = !!story.isPublished;
  story.isProtected = !!story.isProtected;

  return res.json(story);
});

// Partial update a project (PATCH)
router.patch('/:id', async (req, res) => {
  const { title, author, description, content, type, isPublished, promotionPolicy, isProtected } = req.body;
  const now = new Date().toISOString();

  const existing = await db.get('SELECT id FROM stories WHERE id = ?', req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Project not found' });
  }

  if (promotionPolicy && !ALLOWED_PROMOTION_POLICIES.has(promotionPolicy)) {
    return res.status(400).json({
      error: `Invalid promotionPolicy '${promotionPolicy}'. Allowed: auto_promote, auto_accept, manual (quarantine is a runtime outcome).`,
    });
  }

  await db.run(`
    UPDATE stories SET
      title = COALESCE(?, title),
      author = COALESCE(?, author),
      description = COALESCE(?, description),
      content = COALESCE(?, content),
      type = COALESCE(?, type),
      is_published = COALESCE(?, is_published),
      promotion_policy = COALESCE(?, promotion_policy),
      is_protected = COALESCE(?, is_protected),
      updated_at = ?
    WHERE id = ?
  `,
    title, author, description, content, type,
    isPublished != null ? (isPublished ? 1 : 0) : null,
    promotionPolicy,
    isProtected != null ? Boolean(isProtected) : null,
    now, req.params.id
  );

  const story = await db.get(`
    SELECT id, title, author, description, content, type,
           promotion_policy as "promotionPolicy", is_protected as "isProtected",
           created_at as "createdAt", updated_at as "updatedAt", is_published as "isPublished"
    FROM stories WHERE id = ?
  `, req.params.id);

  story.isPublished = !!story.isPublished;
  story.isProtected = !!story.isProtected;

  return res.json(story);
});

// Update timeline event protection
router.patch('/:projectId/timeline-events/:eventId', async (req, res) => {
  const { isProtected } = req.body;
  if (isProtected === undefined) {
    return res.status(400).json({ error: 'isProtected boolean required' });
  }
  const result = await db.run(
    'UPDATE timeline_events SET is_protected = ? WHERE id = ? AND project_id = ?',
    Boolean(isProtected),
    req.params.eventId,
    req.params.projectId,
  );
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Timeline event not found' });
  }
  return res.json({ success: true, id: req.params.eventId, isProtected: Boolean(isProtected) });
});

// Delete a story
router.delete('/:id', async (req, res) => {
  const result = await db.run('DELETE FROM stories WHERE id = ?', req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Story not found' });
  }
  return res.json({ success: true });
});

export default router;
