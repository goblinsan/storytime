import { Router } from 'express';
import db from '../db.js';

const router = Router();

// GET /api/terrain?storyId=X&contextId=Y  (contextId='' means world level)
router.get('/', async (req, res) => {
  const { storyId, contextId = '' } = req.query;
  if (!storyId) return res.status(400).json({ error: 'storyId required' });

  const row = await db.get(
    'SELECT cols, rows, terrain_data as "terrainData" FROM map_terrain WHERE story_id = ? AND context_id = ?'
  , storyId, contextId);

  return res.json(row ?? null);
});

// PUT /api/terrain  { storyId, contextId, cols, rows, terrainData }
router.put('/', async (req, res) => {
  const { storyId, contextId = '', cols = 80, rows = 50, terrainData = '' } = req.body;
  if (!storyId) return res.status(400).json({ error: 'storyId required' });

  await db.run(`
    INSERT INTO map_terrain (story_id, context_id, cols, rows, terrain_data)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(story_id, context_id) DO UPDATE SET
      cols = excluded.cols,
      rows = excluded.rows,
      terrain_data = excluded.terrain_data
  `, storyId, contextId, cols, rows, terrainData);

  return res.json({ ok: true });
});

export default router;
