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

// Delete a bestiary entry
router.delete('/:id', async (req, res) => {
  const result = await db.run('DELETE FROM bestiary WHERE id = ?', req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Bestiary entry not found' });
  }
  return res.json({ success: true });
});

export default router;
