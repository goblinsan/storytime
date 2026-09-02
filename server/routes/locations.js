import { Router } from 'express';
import { randomUUID } from 'crypto';
import db from '../db.js';

const router = Router();

const row2node = (r) => ({
  id: r.id,
  projectId: r.project_id,
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
  starClass: r.star_class ?? '',
  hazardTier: r.hazard_tier ?? '',
  celestialType: r.celestial_type ?? '',
  races: JSON.parse(r.races || '[]'),
  politicalNotes: r.political_notes ?? '',
  connections: JSON.parse(r.connections || '{}'),
  cells: JSON.parse(r.cells || '[]'),
  isProtected: Boolean(r.is_protected),
});

// GET /api/locations?projectId=X[&parentId=Y|null][&all=true]
router.get('/', async (req, res) => {
  const { projectId, parentId, all } = req.query;
  if (!projectId) return res.status(400).json({ error: 'projectId required' });

  let rows;
  if (all === 'true' || parentId === 'all') {
    rows = await db.all(
      'SELECT * FROM locations WHERE project_id = ? ORDER BY name ASC',
      projectId,
    );
  } else if (!parentId || parentId === 'null') {
    rows = await db.all(
      'SELECT * FROM locations WHERE project_id = ? AND parent_id IS NULL ORDER BY grid_y, grid_x, name ASC'
    , projectId);
  } else {
    rows = await db.all(
      'SELECT * FROM locations WHERE project_id = ? AND parent_id = ? ORDER BY grid_y, grid_x, name ASC'
    , projectId, parentId);
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
    projectId, parentId = null, name = 'New Location', description = '',
    level = 0, gridX = 0, gridY = 0, cols = 6, rows = 4,
    mapImage = '', regionType = '', races = [], politicalNotes = '',
    connections = {}, cells = [], isProtected = false,
  } = req.body;

  if (!projectId) return res.status(400).json({ error: 'projectId required' });
  if (!await db.get('SELECT id FROM stories WHERE id = ?', projectId)) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const id = randomUUID();
  await db.run(`
    INSERT INTO locations
      (id, project_id, parent_id, name, description, level,
       grid_x, grid_y, cols, rows, map_image, region_type, races, political_notes, connections, cells, is_protected)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    id, projectId, parentId, name, description, level,
    gridX, gridY, cols, rows, mapImage, regionType,
    JSON.stringify(races), politicalNotes, JSON.stringify(connections), JSON.stringify(cells),
    Boolean(isProtected),
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
    mapImage, regionType, races, politicalNotes, connections, parentId, cells, isProtected,
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
      parent_id       = COALESCE(?, parent_id),
      is_protected    = COALESCE(?, is_protected)
    WHERE id = ?
  `, 
    name, description, level, gridX, gridY, cols, rows,
    mapImage, regionType,
    races != null ? JSON.stringify(races) : null,
    politicalNotes,
    connections != null ? JSON.stringify(connections) : null,
    cells != null ? JSON.stringify(cells) : null,
    parentId !== undefined ? parentId : undefined,
    isProtected != null ? Boolean(isProtected) : null,
    req.params.id,
  );

  return res.json(row2node(await db.get('SELECT * FROM locations WHERE id = ?', req.params.id)));
});

// PATCH /api/locations/:id
router.patch('/:id', async (req, res) => {
  if (!await db.get('SELECT id FROM locations WHERE id = ?', req.params.id)) {
    return res.status(404).json({ error: 'Location not found' });
  }

  const {
    name, description, level, gridX, gridY, cols, rows,
    mapImage, regionType, races, politicalNotes, connections, parentId, cells, isProtected,
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
      parent_id       = COALESCE(?, parent_id),
      is_protected    = COALESCE(?, is_protected)
    WHERE id = ?
  `, 
    name, description, level, gridX, gridY, cols, rows,
    mapImage, regionType,
    races != null ? JSON.stringify(races) : null,
    politicalNotes,
    connections != null ? JSON.stringify(connections) : null,
    cells != null ? JSON.stringify(cells) : null,
    parentId !== undefined ? parentId : undefined,
    isProtected != null ? Boolean(isProtected) : null,
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
