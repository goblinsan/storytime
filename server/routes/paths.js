import { Router } from 'express';
import { randomUUID } from 'crypto';
import db from '../db.js';

const router = Router();

const row2path = (r) => ({
  id: r.id,
  projectId: r.project_id,
  contextId: r.context_id ?? '',
  name: r.name,
  pathType: r.path_type,
  waypoints: JSON.parse(r.waypoints || '[]'),
  widthMultiplier: r.width_multiplier ?? 1,
});

// GET /api/paths?projectId=X&contextId=Y
router.get('/', async (req, res) => {
  const { projectId, contextId = '' } = req.query;
  if (!projectId) return res.status(400).json({ error: 'projectId required' });

  const rows = await db.all(
    'SELECT * FROM map_paths WHERE project_id = ? AND context_id = ? ORDER BY created_at'
  , projectId, contextId);

  return res.json(rows.map(row2path));
});

// POST /api/paths
router.post('/', async (req, res) => {
  const { projectId, contextId = '', name = '', pathType = 'road', waypoints = [], widthMultiplier = 1 } = req.body;
  if (!projectId) return res.status(400).json({ error: 'projectId required' });

  const id = randomUUID();
  const now = new Date().toISOString();
  await db.run(`
    INSERT INTO map_paths (id, project_id, context_id, name, path_type, waypoints, width_multiplier, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, id, projectId, contextId, name, pathType, JSON.stringify(waypoints), widthMultiplier, now, now);

  return res.status(201).json(row2path(await db.get('SELECT * FROM map_paths WHERE id = ?', id)));
});

// PUT /api/paths/:id
router.put('/:id', async (req, res) => {
  const { name, pathType, waypoints, widthMultiplier } = req.body;
  const now = new Date().toISOString();

  const existing = await db.get('SELECT id FROM map_paths WHERE id = ?', req.params.id);
  if (!existing) return res.status(404).json({ error: 'Path not found' });

  await db.run(`
    UPDATE map_paths SET
      name             = COALESCE(?, name),
      path_type        = COALESCE(?, path_type),
      waypoints        = COALESCE(?, waypoints),
      width_multiplier = COALESCE(?, width_multiplier),
      updated_at       = ?
    WHERE id = ?
  `, 
    name, pathType,
    waypoints != null ? JSON.stringify(waypoints) : null,
    widthMultiplier ?? null,
    now, req.params.id,
  );

  return res.json(row2path(await db.get('SELECT * FROM map_paths WHERE id = ?', req.params.id)));
});

// DELETE /api/paths/:id
router.delete('/:id', async (req, res) => {
  const result = await db.run('DELETE FROM map_paths WHERE id = ?', req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Path not found' });
  return res.json({ success: true });
});

export default router;
