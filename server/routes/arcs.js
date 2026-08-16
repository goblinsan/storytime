import { Router } from 'express';
import { randomUUID } from 'crypto';
import db from '../db.js';

const router = Router();

// List arcs for a project
router.get('/', async (req, res) => {
  const { projectId } = req.query;
  if (!projectId) {
    return res.status(400).json({ error: 'projectId query parameter is required' });
  }

  const arcs = await db.all(`
    SELECT id, project_id as "projectId", arc_number as "arcNumber", title, description, details
    FROM story_arcs WHERE project_id = ? ORDER BY arc_number ASC
  `, projectId);

  return res.json(arcs.map(a => ({ ...a, details: JSON.parse(a.details) })));
});

// Get a single arc
router.get('/:id', async (req, res) => {
  const arc = await db.get(`
    SELECT id, project_id as "projectId", arc_number as "arcNumber", title, description, details
    FROM story_arcs WHERE id = ?
  `, req.params.id);

  if (!arc) {
    return res.status(404).json({ error: 'Arc not found' });
  }

  arc.details = JSON.parse(arc.details);
  return res.json(arc);
});

// Create an arc
router.post('/', async (req, res) => {
  const { projectId, arcNumber = 0, title = '', description = '', details = [] } = req.body;

  if (!projectId) {
    return res.status(400).json({ error: 'projectId is required' });
  }

  const project = await db.get('SELECT id FROM stories WHERE id = ?', projectId);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  // Auto-assign next arc number if 0
  let finalArcNumber = arcNumber;
  if (finalArcNumber === 0) {
    const max = await db.get('SELECT MAX(arc_number) as m FROM story_arcs WHERE project_id = ?', projectId);
    finalArcNumber = (max?.m || 0) + 1;
  }

  const id = randomUUID();
  const now = new Date().toISOString();

  await db.run(`
    INSERT INTO story_arcs (id, project_id, arc_number, title, description, details, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, id, projectId, finalArcNumber, title, description, JSON.stringify(details), now, now);

  return res.status(201).json({
    id, projectId, arcNumber: finalArcNumber, title, description, details,
  });
});

// Update an arc
router.put('/:id', async (req, res) => {
  const existing = await db.get('SELECT id FROM story_arcs WHERE id = ?', req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Arc not found' });
  }

  const { arcNumber, title, description, details } = req.body;
  const now = new Date().toISOString();

  await db.run(`
    UPDATE story_arcs SET
      arc_number = COALESCE(?, arc_number),
      title = COALESCE(?, title),
      description = COALESCE(?, description),
      details = COALESCE(?, details),
      updated_at = ?
    WHERE id = ?
  `, 
    arcNumber, title, description,
    details != null ? JSON.stringify(details) : null,
    now, req.params.id
  );

  const arc = await db.get(`
    SELECT id, project_id as "projectId", arc_number as "arcNumber", title, description, details
    FROM story_arcs WHERE id = ?
  `, req.params.id);

  arc.details = JSON.parse(arc.details);
  return res.json(arc);
});

// Delete an arc
router.delete('/:id', async (req, res) => {
  const result = await db.run('DELETE FROM story_arcs WHERE id = ?', req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Arc not found' });
  }
  return res.json({ success: true });
});

export default router;
