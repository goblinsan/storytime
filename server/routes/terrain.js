import { Router } from 'express';
import db from '../db.js';

const router = Router();

// GET /api/terrain?projectId=X&contextId=Y  (contextId='' means world level)
router.get('/', async (req, res) => {
  const { projectId, contextId = '' } = req.query;
  if (!projectId) return res.status(400).json({ error: 'projectId required' });

  const row = await db.get(
    'SELECT cols, rows, terrain_data as "terrainData" FROM map_terrain WHERE project_id = ? AND context_id = ?'
  , projectId, contextId);

  return res.json(row ?? null);
});

// PUT /api/terrain  { projectId, contextId, cols, rows, terrainData }
router.put('/', async (req, res) => {
  const { projectId, contextId = '', cols = 80, rows = 50, terrainData = '' } = req.body;
  if (!projectId) return res.status(400).json({ error: 'projectId required' });

  await db.run(`
    INSERT INTO map_terrain (project_id, context_id, cols, rows, terrain_data)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(project_id, context_id) DO UPDATE SET
      cols = excluded.cols,
      rows = excluded.rows,
      terrain_data = excluded.terrain_data
  `, projectId, contextId, cols, rows, terrainData);

  return res.json({ ok: true });
});

export default router;
