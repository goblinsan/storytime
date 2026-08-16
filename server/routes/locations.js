import { Router } from 'express';
import { randomUUID } from 'crypto';
import db from '../db.js';

const router = Router();

const row2node = (r) => ({
  id: r.id,
  storyId: r.story_id,
  parentId: r.parent_id ?? null,
  name: r.name,
  description: r.description,
  level: r.level ?? 0,
  gridX: r.grid_x ?? 0,
  gridY: r.grid_y ?? 0,
  cols: r.cols ?? 6,
  rows: r.rows ?? 4,
  mapImage: r.map_image ?? '',
  regionType: r.region_type ?? '',
  races: JSON.parse(r.races || '[]'),
  politicalNotes: r.political_notes ?? '',
  connections: JSON.parse(r.connections || '{}'),
  cells: JSON.parse(r.cells || '[]'),
});

// GET /api/locations?storyId=X[&parentId=Y|null]
router.get('/', async (req, res) => {
  const { storyId, parentId } = req.query;
  if (!storyId) return res.status(400).json({ error: 'storyId required' });

  let rows;
  if (!parentId || parentId === 'null') {
    rows = await db.all(
      'SELECT * FROM locations WHERE story_id = ? AND parent_id IS NULL ORDER BY grid_y, grid_x'
    , storyId);
  } else {
    rows = await db.all(
      'SELECT * FROM locations WHERE story_id = ? AND parent_id = ? ORDER BY grid_y, grid_x'
    , storyId, parentId);
  }
  return res.json(rows.map(row2node));
});

// GET /api/locations/:id
router.get('/:id', async (req, res) => {
  const r = await db.get('SELECT * FROM locations WHERE id = ?', req.params.id);
  if (!r) return res.status(404).json({ error: 'Location not found' });
  return res.json(row2node(r));
});

// POST /api/locations
router.post('/', async (req, res) => {
  const {
    storyId, parentId = null, name = 'New Location', description = '',
    level = 0, gridX = 0, gridY = 0, cols = 6, rows = 4,
    mapImage = '', regionType = '', races = [], politicalNotes = '',
    connections = {}, cells = [],
  } = req.body;

  if (!storyId) return res.status(400).json({ error: 'storyId required' });
  if (!await db.get('SELECT id FROM stories WHERE id = ?', storyId)) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const id = randomUUID();
  await db.run(`
    INSERT INTO locations
      (id, story_id, parent_id, name, description, level,
       grid_x, grid_y, cols, rows, map_image, region_type, races, political_notes, connections, cells)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, 
    id, storyId, parentId, name, description, level,
    gridX, gridY, cols, rows, mapImage, regionType,
    JSON.stringify(races), politicalNotes, JSON.stringify(connections), JSON.stringify(cells),
  );

  return res.status(201).json(row2node(await db.get('SELECT * FROM locations WHERE id = ?', id)));
});

// PUT /api/locations/:id
router.put('/:id', async (req, res) => {
  if (!await db.get('SELECT id FROM locations WHERE id = ?', req.params.id)) {
    return res.status(404).json({ error: 'Location not found' });
  }

  const {
    name, description, level, gridX, gridY, cols, rows,
    mapImage, regionType, races, politicalNotes, connections, parentId, cells,
  } = req.body;

  await db.run(`
    UPDATE locations SET
      name            = COALESCE(?, name),
      description     = COALESCE(?, description),
      level           = COALESCE(?, level),
      grid_x          = COALESCE(?, grid_x),
      grid_y          = COALESCE(?, grid_y),
      cols            = COALESCE(?, cols),
      rows            = COALESCE(?, rows),
      map_image       = COALESCE(?, map_image),
      region_type     = COALESCE(?, region_type),
      races           = COALESCE(?, races),
      political_notes = COALESCE(?, political_notes),
      connections     = COALESCE(?, connections),
      cells           = COALESCE(?, cells),
      parent_id       = COALESCE(?, parent_id)
    WHERE id = ?
  `, 
    name, description, level, gridX, gridY, cols, rows,
    mapImage, regionType,
    races != null ? JSON.stringify(races) : null,
    politicalNotes,
    connections != null ? JSON.stringify(connections) : null,
    cells != null ? JSON.stringify(cells) : null,
    parentId !== undefined ? parentId : undefined,
    req.params.id,
  );

  return res.json(row2node(await db.get('SELECT * FROM locations WHERE id = ?', req.params.id)));
});

// DELETE /api/locations/:id  (cascades to children via FK if foreign_keys = ON)
router.delete('/:id', async (req, res) => {
  const result = await db.run('DELETE FROM locations WHERE id = ?', req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Location not found' });
  return res.json({ success: true });
});

export default router;
