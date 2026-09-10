import { Router } from 'express';
import { randomUUID } from 'crypto';
import db from '../db.js';

const router = Router();

function safeJson(val, fallback) {
  if (typeof val === 'object' && val !== null) return val;
  if (!val || typeof val !== 'string') return fallback;
  try {
    return JSON.parse(val);
  } catch {
    return fallback;
  }
}

// List shared/global bestiary entries
router.get('/shared', async (_req, res) => {
  const rows = await db.all(`
    SELECT id, name, category, default_hearts as "defaultHearts",
           default_tactics as "defaultTactics", description, notes,
           in_universe_backstory as "inUniverseBackstory",
           motivation, ecological_niche as "ecologicalNiche",
           demographic_adaptations as "demographicAdaptations",
           created_at as "createdAt", updated_at as "updatedAt"
    FROM shared_bestiary
    ORDER BY category, name
  `);
  return res.json(rows.map((b) => ({
    ...b,
    defaultTactics: safeJson(b.defaultTactics, []),
    demographicAdaptations: safeJson(b.demographicAdaptations, {}),
  })));
});

// Create a new shared bestiary entry
router.post('/shared', async (req, res) => {
  const {
    name,
    category = '',
    defaultHearts = 3,
    defaultTactics = [],
    description = '',
    notes = '',
    inUniverseBackstory = '',
    motivation = '',
    ecologicalNiche = '',
    demographicAdaptations = {},
  } = req.body;

  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: 'Name is required for shared bestiary entry' });
  }

  const id = `shared-beast-${randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();

  await db.run(`
    INSERT INTO shared_bestiary (
      id, name, category, default_hearts, default_tactics, description, notes,
      in_universe_backstory, motivation, ecological_niche, demographic_adaptations,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, id, name.trim(), category, defaultHearts, JSON.stringify(defaultTactics), description, notes,
     inUniverseBackstory, motivation, ecologicalNiche, JSON.stringify(demographicAdaptations), now, now);

  const created = await db.get(`
    SELECT id, name, category, default_hearts as "defaultHearts",
           default_tactics as "defaultTactics", description, notes,
           in_universe_backstory as "inUniverseBackstory",
           motivation, ecological_niche as "ecologicalNiche",
           demographic_adaptations as "demographicAdaptations",
           created_at as "createdAt", updated_at as "updatedAt"
    FROM shared_bestiary WHERE id = ?
  `, id);

  return res.status(201).json({
    ...created,
    defaultTactics: safeJson(created.defaultTactics, []),
    demographicAdaptations: safeJson(created.demographicAdaptations, {}),
  });
});

// Adopt or fork a shared bestiary entry into a universe project
router.post('/adopt-shared', async (req, res) => {
  const {
    projectId,
    sharedBestiaryId,
    overrideName,
    overrideCategory,
    overrideHearts,
    overrideTactics,
    overrideDescription,
    overrideNotes,
    overrideBackstory,
    overrideMotivation,
    overrideNiche,
    overrideAdaptations,
    isVariant = false,
  } = req.body;

  if (!projectId || !sharedBestiaryId) {
    return res.status(400).json({ error: 'projectId and sharedBestiaryId are required' });
  }

  const shared = await db.get(`
    SELECT id, name, category, default_hearts, default_tactics, description, notes,
           in_universe_backstory, motivation, ecological_niche, demographic_adaptations
    FROM shared_bestiary WHERE id = ?
  `, sharedBestiaryId);

  if (!shared) {
    return res.status(404).json({ error: 'Shared bestiary entry not found' });
  }

  const project = await db.get('SELECT id FROM stories WHERE id = ?', projectId);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const id = randomUUID();
  const now = new Date().toISOString();
  const name = overrideName || (isVariant ? `${shared.name} (Variant)` : shared.name);
  const category = overrideCategory || shared.category;
  const hearts = overrideHearts ?? shared.default_hearts;
  const tactics = overrideTactics ?? safeJson(shared.default_tactics, []);
  const description = overrideDescription || shared.description;
  const notes = overrideNotes || shared.notes;
  const inUniverseBackstory = overrideBackstory || shared.in_universe_backstory || '';
  const motivation = overrideMotivation || shared.motivation || '';
  const ecologicalNiche = overrideNiche || shared.ecological_niche || '';
  const demographicAdaptations = overrideAdaptations || safeJson(shared.demographic_adaptations, {});

  await db.run(`
    INSERT INTO bestiary (
      id, project_id, name, category, hearts, tactics, status,
      description, notes, in_universe_backstory, motivation, ecological_niche, demographic_adaptations,
      shared_bestiary_id, is_shared_variant, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, id, projectId, name, category, hearts, JSON.stringify(tactics), description, notes,
     inUniverseBackstory, motivation, ecologicalNiche, JSON.stringify(demographicAdaptations),
     sharedBestiaryId, Boolean(isVariant), now, now);

  return res.status(201).json({
    id,
    projectId,
    name,
    category,
    hearts,
    tactics,
    status: 'active',
    description,
    notes,
    inUniverseBackstory,
    motivation,
    ecologicalNiche,
    demographicAdaptations,
    sharedBestiaryId,
    isSharedVariant: Boolean(isVariant),
    sharedBestiary: {
      id: shared.id,
      name: shared.name,
      category: shared.category,
    },
  });
});

// List bestiary entries for a project
router.get('/', async (req, res) => {
  const { projectId } = req.query;
  if (!projectId) {
    return res.status(400).json({ error: 'projectId query parameter is required' });
  }

  const entries = await db.all(`
    SELECT b.id, b.project_id as "projectId", b.name, b.category, b.hearts, b.tactics,
           b.status, b.description, b.notes,
           b.in_universe_backstory as "inUniverseBackstory",
           b.motivation, b.ecological_niche as "ecologicalNiche",
           b.demographic_adaptations as "demographicAdaptations",
           b.shared_bestiary_id as "sharedBestiaryId",
           b.is_shared_variant as "isSharedVariant",
           b.is_protected as "isProtected",
           b.source_draft_id as "sourceDraftId",
           b.source_task_id as "sourceTaskId",
           s.name as "sharedName", s.category as "sharedCategory"
    FROM bestiary b
    LEFT JOIN shared_bestiary s ON b.shared_bestiary_id = s.id
    WHERE b.project_id = ? ORDER BY b.category, b.name
  `, projectId);

  return res.json(entries.map((b) => ({
    ...b,
    tactics: safeJson(b.tactics, []),
    demographicAdaptations: safeJson(b.demographicAdaptations, {}),
    isSharedVariant: Boolean(b.isSharedVariant),
    sharedBestiary: b.sharedBestiaryId ? {
      id: b.sharedBestiaryId,
      name: b.sharedName,
      category: b.sharedCategory,
    } : null,
  })));
});

/**
 * The bestiary as a surface reads it: every creature, with what is known about
 * where it is found and what has been drawn of it.
 *
 * Separate from the list above rather than widening it, because that one is
 * the general-purpose read and half a dozen things depend on its shape. This
 * one exists to answer the two questions the list view asks -- can I filter
 * this by place, and which of these have pictures -- and it answers them in
 * one round trip instead of one per row.
 */
router.get('/surface/index', async (req, res) => {
  const { projectId } = req.query;
  if (!projectId) return res.status(400).json({ error: 'projectId required' });

  const rows = await db.all(`
    SELECT id, name, category, status, description, hearts, tactics,
           ecological_niche AS "ecologicalNiche", motivation, notes,
           in_universe_backstory AS "inUniverseBackstory",
           is_protected AS "isProtected"
    FROM bestiary WHERE project_id = ? ORDER BY name
  `, projectId);

  // Where each one is recorded, as ids only. The surface already holds the
  // places tree -- it draws the gazetteer from it -- so sending names here
  // would be a second copy of something the client can already resolve, and
  // the filter needs the tree anyway to mean "and everything inside".
  const ranges = await db.all(`
    SELECT r.bestiary_id AS "bestiaryId", r.location_id AS "locationId"
    FROM bestiary_ranges r JOIN bestiary b ON b.id = r.bestiary_id
    WHERE b.project_id = ?
  `, projectId).catch(() => []);
  const where = new Map();
  for (const row of ranges) {
    if (!where.has(row.bestiaryId)) where.set(row.bestiaryId, []);
    where.get(row.bestiaryId).push(row.locationId);
  }

  const drawn = await db.all(`
    SELECT subject_id AS "id", count(*)::int AS n FROM media_assets
    WHERE project_id = ? AND subject_type = 'creature' GROUP BY subject_id
  `, projectId).catch(() => []);
  const pictures = new Map(drawn.map((r) => [r.id, r.n]));

  return res.json({
    creatures: rows.map((r) => ({
      ...r,
      tactics: safeJson(r.tactics, []),
      locationIds: where.get(r.id) ?? [],
      pictureCount: pictures.get(r.id) ?? 0,
    })),
  });
});

/** One creature: its record, where it is found, and what has been drawn. */
router.get('/surface/:id', async (req, res) => {
  const creature = await db.get(`
    SELECT id, project_id AS "projectId", name, category, status, description,
           hearts, tactics, ecological_niche AS "ecologicalNiche", motivation,
           notes, in_universe_backstory AS "inUniverseBackstory",
           is_protected AS "isProtected"
    FROM bestiary WHERE id = ?
  `, req.params.id);
  if (!creature) return res.status(404).json({ error: 'Creature not found' });

  const range = await db.all(`
    SELECT r.id, r.location_id AS "locationId", r.notes, l.name AS "locationName",
           l.region_type AS "regionType"
    FROM bestiary_ranges r
    LEFT JOIN locations l ON l.id = r.location_id
    WHERE r.bestiary_id = ?
    ORDER BY l.name
  `, req.params.id).catch(() => []);

  const pictures = await db.all(`
    SELECT id, url, kind, title, caption FROM media_assets
    WHERE subject_type = 'creature' AND subject_id = ? ORDER BY created_at DESC
  `, req.params.id).catch(() => []);

  return res.json({
    creature: { ...creature, tactics: safeJson(creature.tactics, []) },
    range,
    pictures,
  });
});

/**
 * Record that a creature is found somewhere.
 *
 * Idempotent by (creature, place): pressing it twice is somebody making sure,
 * not somebody claiming two populations.
 */
router.post('/surface/:id/range', async (req, res) => {
  const { locationId, notes = '' } = req.body ?? {};
  if (!locationId) return res.status(400).json({ error: 'locationId required' });

  const creature = await db.get('SELECT id FROM bestiary WHERE id = ?', req.params.id);
  if (!creature) return res.status(404).json({ error: 'Creature not found' });
  const place = await db.get('SELECT id, name FROM locations WHERE id = ?', locationId);
  if (!place) return res.status(404).json({ error: 'Place not found' });

  const existing = await db.get(
    'SELECT id FROM bestiary_ranges WHERE bestiary_id = ? AND location_id = ?',
    req.params.id, locationId,
  );
  if (existing) {
    if (notes) {
      await db.run('UPDATE bestiary_ranges SET notes = ? WHERE id = ?', notes, existing.id);
    }
    return res.json({ id: existing.id, locationId, locationName: place.name, notes });
  }

  const id = randomUUID();
  await db.run(
    'INSERT INTO bestiary_ranges (id, bestiary_id, location_id, notes) VALUES (?, ?, ?, ?)',
    id, req.params.id, locationId, notes,
  );
  return res.status(201).json({ id, locationId, locationName: place.name, notes });
});

/**
 * Stop recording that a creature is found somewhere.
 *
 * Refuses on protected canon, which the delete beside it already does for the
 * creature itself: a record nothing may change automatically should not lose
 * half its range to one press either. A range that was already gone answers
 * 404 rather than 204, because "done" and "there was nothing to do" are
 * different answers and the caller says one of them out loud.
 */
router.delete('/surface/range/:rangeId', async (req, res) => {
  const row = await db.get(`
    SELECT r.id, b.is_protected AS "isProtected", b.name
    FROM bestiary_ranges r JOIN bestiary b ON b.id = r.bestiary_id
    WHERE r.id = ?
  `, req.params.rangeId);
  if (!row) return res.status(404).json({ error: 'That place is not recorded for this creature' });
  if (row.isProtected) {
    return res.status(409).json({ error: `${row.name} is protected from automated changes` });
  }

  await db.run('DELETE FROM bestiary_ranges WHERE id = ?', req.params.rangeId);
  return res.status(204).end();
});

/**
 * Partial update, field by field.
 *
 * The PUT above takes the whole record and is what the older client uses; a
 * surface that saves one field at a time cannot use it without sending back
 * every other field it happens to be holding, which is how one stale copy
 * overwrites somebody else's edit.
 */
router.patch('/surface/:id', async (req, res) => {
  const existing = await db.get('SELECT id FROM bestiary WHERE id = ?', req.params.id);
  if (!existing) return res.status(404).json({ error: 'Creature not found' });

  const {
    name, category, status, description, notes, motivation,
    inUniverseBackstory, ecologicalNiche, tactics,
  } = req.body ?? {};

  await db.run(`
    UPDATE bestiary SET
      name                  = COALESCE(?, name),
      category              = COALESCE(?, category),
      status                = COALESCE(?, status),
      description           = COALESCE(?, description),
      notes                 = COALESCE(?, notes),
      motivation            = COALESCE(?, motivation),
      in_universe_backstory = COALESCE(?, in_universe_backstory),
      ecological_niche      = COALESCE(?, ecological_niche),
      tactics               = COALESCE(?, tactics),
      updated_at            = now()
    WHERE id = ?
  `,
  name ?? null, category ?? null, status ?? null, description ?? null,
  notes ?? null, motivation ?? null, inUniverseBackstory ?? null,
  ecologicalNiche ?? null, tactics === undefined ? null : JSON.stringify(tactics),
  req.params.id);

  const row = await db.get(`
    SELECT id, name, category, status, description, hearts, tactics,
           ecological_niche AS "ecologicalNiche", motivation, notes,
           in_universe_backstory AS "inUniverseBackstory",
           is_protected AS "isProtected"
    FROM bestiary WHERE id = ?
  `, req.params.id);
  return res.json({ ...row, tactics: safeJson(row.tactics, []) });
});

// Get a single bestiary entry
router.get('/:id', async (req, res) => {
  const entry = await db.get(`
    SELECT b.id, b.project_id as "projectId", b.name, b.category, b.hearts, b.tactics,
           b.status, b.description, b.notes,
           b.in_universe_backstory as "inUniverseBackstory",
           b.motivation, b.ecological_niche as "ecologicalNiche",
           b.demographic_adaptations as "demographicAdaptations",
           b.shared_bestiary_id as "sharedBestiaryId",
           b.is_shared_variant as "isSharedVariant",
           b.is_protected as "isProtected",
           b.source_draft_id as "sourceDraftId",
           b.source_task_id as "sourceTaskId",
           s.name as "sharedName", s.category as "sharedCategory"
    FROM bestiary b
    LEFT JOIN shared_bestiary s ON b.shared_bestiary_id = s.id
    WHERE b.id = ?
  `, req.params.id);

  if (!entry) {
    return res.status(404).json({ error: 'Bestiary entry not found' });
  }

  return res.json({
    ...entry,
    tactics: safeJson(entry.tactics, []),
    demographicAdaptations: safeJson(entry.demographicAdaptations, {}),
    isSharedVariant: Boolean(entry.isSharedVariant),
    sharedBestiary: entry.sharedBestiaryId ? {
      id: entry.sharedBestiaryId,
      name: entry.sharedName,
      category: entry.sharedCategory,
    } : null,
  });
});

// Create a bestiary entry
router.post('/', async (req, res) => {
  const {
    projectId, name = '', category = '', hearts = null,
    tactics = [], status = 'active', description = '', notes = '',
    inUniverseBackstory = '', motivation = '', ecologicalNiche = '',
    demographicAdaptations = {},
  } = req.body;

  if (!projectId) {
    return res.status(400).json({ error: 'projectId is required' });
  }

  const project = await db.get('SELECT id FROM stories WHERE id = ?', projectId);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const id = randomUUID();
  const now = new Date().toISOString();

  await db.run(`
    INSERT INTO bestiary (
      id, project_id, name, category, hearts, tactics, status, description, notes,
      in_universe_backstory, motivation, ecological_niche, demographic_adaptations,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, id, projectId, name, category, hearts, JSON.stringify(tactics), status, description, notes,
     inUniverseBackstory, motivation, ecologicalNiche, JSON.stringify(demographicAdaptations), now, now);

  return res.status(201).json({
    id, projectId, name, category, hearts, tactics, status, description, notes,
    inUniverseBackstory, motivation, ecologicalNiche, demographicAdaptations,
  });
});

// Update a bestiary entry
router.put('/:id', async (req, res) => {
  const existing = await db.get('SELECT id FROM bestiary WHERE id = ?', req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Bestiary entry not found' });
  }

  const {
    name, category, hearts, tactics, status, description, notes,
    inUniverseBackstory, motivation, ecologicalNiche, demographicAdaptations,
  } = req.body;
  const now = new Date().toISOString();

  await db.run(`
    UPDATE bestiary SET
      name = COALESCE(?, name),
      category = COALESCE(?, category),
      hearts = COALESCE(?, hearts),
      tactics = COALESCE(?, tactics),
      status = COALESCE(?, status),
      description = COALESCE(?, description),
      notes = COALESCE(?, notes),
      in_universe_backstory = COALESCE(?, in_universe_backstory),
      motivation = COALESCE(?, motivation),
      ecological_niche = COALESCE(?, ecological_niche),
      demographic_adaptations = COALESCE(?, demographic_adaptations),
      updated_at = ?
    WHERE id = ?
  `, 
    name, category, hearts,
    tactics != null ? JSON.stringify(tactics) : null,
    status, description, notes,
    inUniverseBackstory, motivation, ecologicalNiche,
    demographicAdaptations != null ? JSON.stringify(demographicAdaptations) : null,
    now, req.params.id
  );

  const entry = await db.get(`
    SELECT b.id, b.project_id as "projectId", b.name, b.category, b.hearts, b.tactics,
           b.status, b.description, b.notes,
           b.in_universe_backstory as "inUniverseBackstory",
           b.motivation, b.ecological_niche as "ecologicalNiche",
           b.demographic_adaptations as "demographicAdaptations"
    FROM bestiary b WHERE b.id = ?
  `, req.params.id);

  return res.json({
    ...entry,
    tactics: safeJson(entry.tactics, []),
    demographicAdaptations: safeJson(entry.demographicAdaptations, {}),
  });
});

// Toggle canon protection on a bestiary entry
router.put('/:id/protection', async (req, res) => {
  const { isProtected } = req.body;
  if (typeof isProtected !== 'boolean') {
    return res.status(400).json({ error: 'isProtected must be a boolean' });
  }

  const result = await db.run(
    'UPDATE bestiary SET is_protected = ?, updated_at = to_char(now() AT TIME ZONE \'utc\', \'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"\') WHERE id = ?',
    isProtected,
    req.params.id,
  );

  if (result.changes === 0) {
    return res.status(404).json({ error: 'Bestiary entry not found' });
  }

  return res.json({ id: req.params.id, isProtected });
});

// Delete a bestiary entry
router.delete('/:id', async (req, res) => {
  const entry = await db.get('SELECT is_protected FROM bestiary WHERE id = ?', req.params.id);
  if (!entry) {
    return res.status(404).json({ error: 'Bestiary entry not found' });
  }

  if (entry.is_protected) {
    return res.status(403).json({ error: 'Cannot delete protected canon bestiary entry' });
  }

  const result = await db.run('DELETE FROM bestiary WHERE id = ?', req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Bestiary entry not found' });
  }
  return res.json({ success: true });
});

export default router;
