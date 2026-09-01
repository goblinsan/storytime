import { Router } from 'express';
import { randomUUID } from 'crypto';
import db from '../db.js';

const router = Router();

// List shared/global bestiary entries
router.get('/shared', async (_req, res) => {
  const rows = await db.all(`
    SELECT id, name, category, default_hearts as "defaultHearts",
           default_tactics as "defaultTactics", description, notes,
           created_at as "createdAt", updated_at as "updatedAt"
    FROM shared_bestiary
    ORDER BY category, name
  `);
  return res.json(rows.map((b) => ({
    ...b,
    defaultTactics: typeof b.defaultTactics === 'string' ? JSON.parse(b.defaultTactics) : (b.defaultTactics || []),
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
  } = req.body;

  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: 'Name is required for shared bestiary entry' });
  }

  const id = `shared-beast-${randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();

  await db.run(`
    INSERT INTO shared_bestiary (id, name, category, default_hearts, default_tactics, description, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?::jsonb, ?, ?, ?, ?)
  `, id, name.trim(), category, defaultHearts, JSON.stringify(defaultTactics), description, notes, now, now);

  const created = await db.get(`
    SELECT id, name, category, default_hearts as "defaultHearts",
           default_tactics as "defaultTactics", description, notes,
           created_at as "createdAt", updated_at as "updatedAt"
    FROM shared_bestiary WHERE id = ?
  `, id);

  return res.status(201).json({
    ...created,
    defaultTactics: typeof created.defaultTactics === 'string' ? JSON.parse(created.defaultTactics) : (created.defaultTactics || []),
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
    isVariant = false,
  } = req.body;

  if (!projectId || !sharedBestiaryId) {
    return res.status(400).json({ error: 'projectId and sharedBestiaryId are required' });
  }

  const shared = await db.get(`
    SELECT id, name, category, default_hearts, default_tactics, description, notes
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
  const tactics = overrideTactics ?? (typeof shared.default_tactics === 'string' ? JSON.parse(shared.default_tactics) : (shared.default_tactics || []));
  const description = overrideDescription || shared.description;
  const notes = overrideNotes || shared.notes;

  await db.run(`
    INSERT INTO bestiary (
      id, project_id, name, category, hearts, tactics, status,
      description, notes, shared_bestiary_id, is_shared_variant, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?)
  `, id, projectId, name, category, hearts, JSON.stringify(tactics), description, notes, sharedBestiaryId, Boolean(isVariant), now, now);

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
           b.status, b.description, b.notes, b.shared_bestiary_id as "sharedBestiaryId",
           b.is_shared_variant as "isSharedVariant",
           s.name as "sharedName", s.category as "sharedCategory"
    FROM bestiary b
    LEFT JOIN shared_bestiary s ON b.shared_bestiary_id = s.id
    WHERE b.project_id = ? ORDER BY b.category, b.name
  `, projectId);

  return res.json(entries.map(b => ({
    id: b.id,
    projectId: b.projectId,
    name: b.name,
    category: b.category,
    hearts: b.hearts,
    tactics: typeof b.tactics === 'string' ? JSON.parse(b.tactics) : (b.tactics || []),
    status: b.status,
    description: b.description,
    notes: b.notes,
    sharedBestiaryId: b.sharedBestiaryId,
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
           b.status, b.description, b.notes, b.shared_bestiary_id as "sharedBestiaryId",
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
    id: entry.id,
    projectId: entry.projectId,
    name: entry.name,
    category: entry.category,
    hearts: entry.hearts,
    tactics: typeof entry.tactics === 'string' ? JSON.parse(entry.tactics) : (entry.tactics || []),
    status: entry.status,
    description: entry.description,
    notes: entry.notes,
    sharedBestiaryId: entry.sharedBestiaryId,
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
    tactics = [], status = 'active', description = '', notes = ''
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
    INSERT INTO bestiary (id, project_id, name, category, hearts, tactics, status, description, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, id, projectId, name, category, hearts, JSON.stringify(tactics), status, description, notes, now, now);

  return res.status(201).json({
    id, projectId, name, category, hearts, tactics, status, description, notes,
  });
});

// Update a bestiary entry
router.put('/:id', async (req, res) => {
  const existing = await db.get('SELECT id FROM bestiary WHERE id = ?', req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Bestiary entry not found' });
  }

  const { name, category, hearts, tactics, status, description, notes } = req.body;
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
      updated_at = ?
    WHERE id = ?
  `, 
    name, category, hearts,
    tactics != null ? JSON.stringify(tactics) : null,
    status, description, notes,
    now, req.params.id
  );

  const entry = await db.get(`
    SELECT id, project_id as "projectId", name, category, hearts, tactics, status, description, notes
    FROM bestiary WHERE id = ?
  `, req.params.id);

  entry.tactics = JSON.parse(entry.tactics);
  return res.json(entry);
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
