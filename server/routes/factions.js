import { Router } from 'express';
import { randomUUID } from 'crypto';
import db from '../db.js';

const router = Router();

function safeJson(val, fallback = []) {
  if (!val) return fallback;
  if (typeof val === 'object') return val;
  try {
    return JSON.parse(val);
  } catch {
    return fallback;
  }
}

// List factions for a project
router.get('/', async (req, res) => {
  const { projectId } = req.query;
  if (!projectId) {
    return res.status(400).json({ error: 'projectId query parameter is required' });
  }

  const rows = await db.all(`
    SELECT id, project_id as "projectId", name, description, goals, is_protected as "isProtected"
    FROM factions
    WHERE project_id = ?
    ORDER BY name ASC
  `, projectId);

  return res.json(rows.map((f) => ({
    ...f,
    isProtected: Boolean(f.isProtected),
    goals: safeJson(f.goals, []),
  })));
});

// Get a single faction
router.get('/:id', async (req, res) => {
  const faction = await db.get(`
    SELECT id, project_id as "projectId", name, description, goals, is_protected as "isProtected"
    FROM factions
    WHERE id = ?
  `, req.params.id);

  if (!faction) {
    return res.status(404).json({ error: 'Faction not found' });
  }

  return res.json({
    ...faction,
    isProtected: Boolean(faction.isProtected),
    goals: safeJson(faction.goals, []),
  });
});

// Create a faction
router.post('/', async (req, res) => {
  const {
    projectId,
    name = '',
    description = '',
    goals = [],
    isProtected = false,
  } = req.body;

  if (!projectId) {
    return res.status(400).json({ error: 'projectId is required' });
  }

  const project = await db.get('SELECT id FROM stories WHERE id = ?', projectId);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const id = `fac-${randomUUID().slice(0, 8)}`;
  const goalsJson = JSON.stringify(Array.isArray(goals) ? goals : [goals].filter(Boolean));

  await db.run(`
    INSERT INTO factions (id, project_id, name, description, goals, is_protected)
    VALUES (?, ?, ?, ?, ?, ?)
  `, id, projectId, name.trim() || 'Unnamed Faction', description, goalsJson, Boolean(isProtected));

  const created = await db.get(`
    SELECT id, project_id as "projectId", name, description, goals, is_protected as "isProtected"
    FROM factions WHERE id = ?
  `, id);

  return res.status(201).json({
    ...created,
    isProtected: Boolean(created.isProtected),
    goals: safeJson(created.goals, []),
  });
});

// Update a faction (PUT)
router.put('/:id', async (req, res) => {
  const existing = await db.get('SELECT id, goals FROM factions WHERE id = ?', req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Faction not found' });
  }

  const { name, description, goals, isProtected } = req.body;
  const goalsJson = goals !== undefined ? JSON.stringify(Array.isArray(goals) ? goals : [goals].filter(Boolean)) : null;

  await db.run(`
    UPDATE factions SET
      name = COALESCE(?, name),
      description = COALESCE(?, description),
      goals = COALESCE(?, goals),
      is_protected = COALESCE(?, is_protected)
    WHERE id = ?
  `, name, description, goalsJson, isProtected != null ? Boolean(isProtected) : null, req.params.id);

  const updated = await db.get(`
    SELECT id, project_id as "projectId", name, description, goals, is_protected as "isProtected"
    FROM factions WHERE id = ?
  `, req.params.id);

  return res.json({
    ...updated,
    isProtected: Boolean(updated.isProtected),
    goals: safeJson(updated.goals, []),
  });
});

// Partial update a faction (PATCH)
router.patch('/:id', async (req, res) => {
  const existing = await db.get('SELECT id, goals FROM factions WHERE id = ?', req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Faction not found' });
  }

  const { name, description, goals, isProtected } = req.body;
  const goalsJson = goals !== undefined ? JSON.stringify(Array.isArray(goals) ? goals : [goals].filter(Boolean)) : null;

  await db.run(`
    UPDATE factions SET
      name = COALESCE(?, name),
      description = COALESCE(?, description),
      goals = COALESCE(?, goals),
      is_protected = COALESCE(?, is_protected)
    WHERE id = ?
  `, name, description, goalsJson, isProtected != null ? Boolean(isProtected) : null, req.params.id);

  const updated = await db.get(`
    SELECT id, project_id as "projectId", name, description, goals, is_protected as "isProtected"
    FROM factions WHERE id = ?
  `, req.params.id);

  return res.json({
    ...updated,
    isProtected: Boolean(updated.isProtected),
    goals: safeJson(updated.goals, []),
  });
});

// Delete a faction
router.delete('/:id', async (req, res) => {
  const result = await db.run('DELETE FROM factions WHERE id = ?', req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Faction not found' });
  }
  return res.json({ success: true });
});

export default router;
