import { Router } from 'express';
import { randomUUID } from 'crypto';
import db from '../db.js';

const router = Router();

// List bestiary entries for a project
router.get('/', async (req, res) => {
  const { projectId } = req.query;
  if (!projectId) {
    return res.status(400).json({ error: 'projectId query parameter is required' });
  }

  const entries = await db.all(`
    SELECT id, project_id as "projectId", name, category, hearts, tactics, status, description, notes
    FROM bestiary WHERE project_id = ? ORDER BY category, name
  `, projectId);

  return res.json(entries.map(b => ({ ...b, tactics: JSON.parse(b.tactics) })));
});

// Get a single bestiary entry
router.get('/:id', async (req, res) => {
  const entry = await db.get(`
    SELECT id, project_id as "projectId", name, category, hearts, tactics, status, description, notes
    FROM bestiary WHERE id = ?
  `, req.params.id);

  if (!entry) {
    return res.status(404).json({ error: 'Bestiary entry not found' });
  }

  entry.tactics = JSON.parse(entry.tactics);
  return res.json(entry);
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
