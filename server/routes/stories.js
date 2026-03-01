import { Router } from 'express';
import { randomUUID } from 'crypto';
import db from '../db.js';

const router = Router();

// List all projects (optionally filtered by type)
router.get('/', (req, res) => {
  const { type } = req.query;
  let sql = `
    SELECT id, title, author, description, content, type,
           created_at as createdAt, updated_at as updatedAt, is_published as isPublished
    FROM stories
  `;
  const params = [];
  if (type) {
    sql += ' WHERE type = ?';
    params.push(type);
  }
  sql += ' ORDER BY updated_at DESC';

  const stories = db.prepare(sql).all(...params);

  const result = stories.map(s => ({
    ...s,
    isPublished: !!s.isPublished,
    characters: db.prepare('SELECT id, name FROM characters WHERE story_id = ?').all(s.id),
  }));

  res.json(result);
});

// Get a single project with all related data
router.get('/:id', (req, res) => {
  const story = db.prepare(`
    SELECT id, title, author, description, content, type,
           created_at as createdAt, updated_at as updatedAt, is_published as isPublished
    FROM stories WHERE id = ?
  `).get(req.params.id);

  if (!story) {
    return res.status(404).json({ error: 'Project not found' });
  }

  story.isPublished = !!story.isPublished;

  // Load characters with campaign fields
  const characters = db.prepare(`
    SELECT id, story_id as projectId, name, description, background, traits, relationships,
           character_type as characterType, role, hearts, core_skills as coreSkills,
           special_abilities as specialAbilities, notable_moments as notableMoments,
           tendencies, location, motivation
    FROM characters WHERE story_id = ?
  `).all(story.id);

  story.characters = characters.map(c => ({
    ...c,
    traits: JSON.parse(c.traits),
    relationships: JSON.parse(c.relationships),
    coreSkills: JSON.parse(c.coreSkills),
    specialAbilities: JSON.parse(c.specialAbilities),
    notableMoments: JSON.parse(c.notableMoments),
  }));

  // Load locations with region data
  const locations = db.prepare(`
    SELECT id, name, description, coordinates_x, coordinates_y,
           region_type as regionType, races, political_notes as politicalNotes
    FROM locations WHERE story_id = ?
  `).all(story.id);

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
  story.timelineEvents = db.prepare(`
    SELECT id, date, title, description FROM timeline_events WHERE story_id = ?
  `).all(story.id);

  // Load story arcs
  story.arcs = db.prepare(`
    SELECT id, project_id as projectId, arc_number as arcNumber, title, description, details
    FROM story_arcs WHERE project_id = ? ORDER BY arc_number ASC
  `).all(story.id).map(a => ({ ...a, details: JSON.parse(a.details) }));

  // Load bestiary
  story.bestiary = db.prepare(`
    SELECT id, project_id as projectId, name, category, hearts, tactics, status, description, notes
    FROM bestiary WHERE project_id = ? ORDER BY category, name
  `).all(story.id).map(b => ({ ...b, tactics: JSON.parse(b.tactics) }));

  return res.json(story);
});

// Create a new project
router.post('/', (req, res) => {
  const id = randomUUID();
  const { title = '', author = '', content = '', description = '', type = 'story' } = req.body;
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO stories (id, title, author, description, content, type, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, title, author, description, content, type, now, now);

  const story = db.prepare(`
    SELECT id, title, author, description, content, type,
           created_at as createdAt, updated_at as updatedAt, is_published as isPublished
    FROM stories WHERE id = ?
  `).get(id);

  story.isPublished = !!story.isPublished;
  story.characters = [];
  story.arcs = [];
  story.bestiary = [];

  res.status(201).json(story);
});

// Update a project
router.put('/:id', (req, res) => {
  const { title, author, description, content, type, isPublished } = req.body;
  const now = new Date().toISOString();

  const existing = db.prepare('SELECT id FROM stories WHERE id = ?').get(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Project not found' });
  }

  db.prepare(`
    UPDATE stories SET
      title = COALESCE(?, title),
      author = COALESCE(?, author),
      description = COALESCE(?, description),
      content = COALESCE(?, content),
      type = COALESCE(?, type),
      is_published = COALESCE(?, is_published),
      updated_at = ?
    WHERE id = ?
  `).run(title, author, description, content, type, isPublished != null ? (isPublished ? 1 : 0) : null, now, req.params.id);

  const story = db.prepare(`
    SELECT id, title, author, description, content, type,
           created_at as createdAt, updated_at as updatedAt, is_published as isPublished
    FROM stories WHERE id = ?
  `).get(req.params.id);

  story.isPublished = !!story.isPublished;

  return res.json(story);
});

// Delete a story
router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM stories WHERE id = ?').run(req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Story not found' });
  }
  return res.json({ success: true });
});

export default router;
