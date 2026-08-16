import { Router } from 'express';
import { randomUUID } from 'crypto';
import db from '../db.js';

const router = Router();

// List all projects (optionally filtered by type)
router.get('/', async (req, res) => {
  const { type } = req.query;
  let sql = `
    SELECT id, title, author, description, content, type,
           created_at as "createdAt", updated_at as "updatedAt", is_published as "isPublished"
    FROM stories
  `;
  const params = [];
  if (type) {
    sql += ' WHERE type = ?';
    params.push(type);
  }
  sql += ' ORDER BY updated_at DESC';

  const stories = await db.all(sql, ...params);

  const result = await Promise.all(stories.map(async s => ({
    ...s,
    isPublished: !!s.isPublished,
    characters: await db.all('SELECT id, name FROM characters WHERE story_id = ?', s.id),
  })));

  res.json(result);
});

// Get a single project with all related data
router.get('/:id', async (req, res) => {
  const story = await db.get(`
    SELECT id, title, author, description, content, type,
           created_at as "createdAt", updated_at as "updatedAt", is_published as "isPublished"
    FROM stories WHERE id = ?
  `, req.params.id);

  if (!story) {
    return res.status(404).json({ error: 'Project not found' });
  }

  story.isPublished = !!story.isPublished;

  // Load characters with campaign fields
  const characters = await db.all(`
    SELECT id, story_id as "projectId", name, description, background, traits, relationships,
           character_type as "characterType", role, hearts, core_skills as "coreSkills",
           special_abilities as "specialAbilities", notable_moments as "notableMoments",
           tendencies, location, motivation
    FROM characters WHERE story_id = ?
  `, story.id);

  story.characters = characters.map(c => ({
    ...c,
    traits: JSON.parse(c.traits),
    relationships: JSON.parse(c.relationships),
    coreSkills: JSON.parse(c.coreSkills),
    specialAbilities: JSON.parse(c.specialAbilities),
    notableMoments: JSON.parse(c.notableMoments),
  }));

  // Load locations with region data
  const locations = await db.all(`
    SELECT id, name, description, coordinates_x, coordinates_y,
           region_type as "regionType", races, political_notes as "politicalNotes"
    FROM locations WHERE story_id = ?
  `, story.id);

  story.locations = locations.map(l => ({
    id: l.id,
    name: l.name,
    description: l.description,
    coordinates: l.coordinates_x != null ? { x: l.coordinates_x, y: l.coordinates_y } : undefined,
    regionType: l.regionType,
    races: JSON.parse(l.races),
    politicalNotes: l.politicalNotes,
  }));

  // Load timeline events
  story.timelineEvents = await db.all(`
    SELECT id, date, title, description FROM timeline_events WHERE story_id = ?
  `, story.id);

  // Load story arcs
  story.arcs = (await db.all(`
    SELECT id, project_id as "projectId", arc_number as "arcNumber", title, description, details
    FROM story_arcs WHERE project_id = ? ORDER BY arc_number ASC
  `, story.id)).map(a => ({ ...a, details: JSON.parse(a.details) }));

  // Load bestiary
  story.bestiary = (await db.all(`
    SELECT id, project_id as "projectId", name, category, hearts, tactics, status, description, notes
    FROM bestiary WHERE project_id = ? ORDER BY category, name
  `, story.id)).map(b => ({ ...b, tactics: JSON.parse(b.tactics) }));

  return res.json(story);
});

// Create a new project
router.post('/', async (req, res) => {
  const id = randomUUID();
  const { title = '', author = '', content = '', description = '', type = 'story' } = req.body;
  const now = new Date().toISOString();

  await db.run(`
    INSERT INTO stories (id, title, author, description, content, type, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, id, title, author, description, content, type, now, now);

  const story = await db.get(`
    SELECT id, title, author, description, content, type,
           created_at as "createdAt", updated_at as "updatedAt", is_published as "isPublished"
    FROM stories WHERE id = ?
  `, id);

  story.isPublished = !!story.isPublished;
  story.characters = [];
  story.arcs = [];
  story.bestiary = [];

  res.status(201).json(story);
});

// Update a project
router.put('/:id', async (req, res) => {
  const { title, author, description, content, type, isPublished } = req.body;
  const now = new Date().toISOString();

  const existing = await db.get('SELECT id FROM stories WHERE id = ?', req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Project not found' });
  }

  await db.run(`
    UPDATE stories SET
      title = COALESCE(?, title),
      author = COALESCE(?, author),
      description = COALESCE(?, description),
      content = COALESCE(?, content),
      type = COALESCE(?, type),
      is_published = COALESCE(?, is_published),
      updated_at = ?
    WHERE id = ?
  `, title, author, description, content, type, isPublished != null ? (isPublished ? 1 : 0) : null, now, req.params.id);

  const story = await db.get(`
    SELECT id, title, author, description, content, type,
           created_at as "createdAt", updated_at as "updatedAt", is_published as "isPublished"
    FROM stories WHERE id = ?
  `, req.params.id);

  story.isPublished = !!story.isPublished;

  return res.json(story);
});

// Delete a story
router.delete('/:id', async (req, res) => {
  const result = await db.run('DELETE FROM stories WHERE id = ?', req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Story not found' });
  }
  return res.json({ success: true });
});

export default router;
