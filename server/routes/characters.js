import { Router } from 'express';
import { randomUUID } from 'crypto';
import db from '../db.js';

const router = Router();

// List characters for a project (optionally filtered by character_type)
router.get('/', (req, res) => {
  const { storyId, characterType } = req.query;
  if (!storyId) {
    return res.status(400).json({ error: 'storyId query parameter is required' });
  }

  let sql = `
    SELECT id, story_id as projectId, name, description, background, traits, relationships,
           character_type as characterType, role, hearts, core_skills as coreSkills,
           special_abilities as specialAbilities, notable_moments as notableMoments,
           tendencies, location, motivation, current_location_id as currentLocationId
    FROM characters WHERE story_id = ?
  `;
  const params = [storyId];
  if (characterType) {
    sql += ' AND character_type = ?';
    params.push(characterType);
  }
  sql += ' ORDER BY created_at ASC';

  const characters = db.prepare(sql).all(...params);

  return res.json(characters.map(c => ({
    ...c,
    traits: JSON.parse(c.traits),
    relationships: JSON.parse(c.relationships),
    coreSkills: JSON.parse(c.coreSkills),
    specialAbilities: JSON.parse(c.specialAbilities),
    notableMoments: JSON.parse(c.notableMoments),
  })));
});

// Get a single character
router.get('/:id', (req, res) => {
  const character = db.prepare(`
    SELECT id, story_id as projectId, name, description, background, traits, relationships,
           character_type as characterType, role, hearts, core_skills as coreSkills,
           special_abilities as specialAbilities, notable_moments as notableMoments,
           tendencies, location, motivation, current_location_id as currentLocationId
    FROM characters WHERE id = ?
  `).get(req.params.id);

  if (!character) {
    return res.status(404).json({ error: 'Character not found' });
  }

  character.traits = JSON.parse(character.traits);
  character.relationships = JSON.parse(character.relationships);
  character.coreSkills = JSON.parse(character.coreSkills);
  character.specialAbilities = JSON.parse(character.specialAbilities);
  character.notableMoments = JSON.parse(character.notableMoments);

  return res.json(character);
});

// Create a character
router.post('/', (req, res) => {
  const {
    storyId, name = 'New Character', description = '', background = '',
    traits = [], relationships = [],
    characterType = 'story', role = '', hearts = null,
    coreSkills = [], specialAbilities = [], notableMoments = [],
    tendencies = '', location = '', motivation = '', currentLocationId = null
  } = req.body;

  if (!storyId) {
    return res.status(400).json({ error: 'storyId is required' });
  }

  const story = db.prepare('SELECT id FROM stories WHERE id = ?').get(storyId);
  if (!story) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const id = randomUUID();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO characters (id, story_id, name, description, background, traits, relationships,
      character_type, role, hearts, core_skills, special_abilities, notable_moments,
      tendencies, location, motivation, current_location_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, storyId, name, description, background,
    JSON.stringify(traits), JSON.stringify(relationships),
    characterType, role, hearts,
    JSON.stringify(coreSkills), JSON.stringify(specialAbilities), JSON.stringify(notableMoments),
    tendencies, location, motivation, currentLocationId, now, now
  );

  return res.status(201).json({
    id, projectId: storyId, name, description, background, traits, relationships,
    characterType, role, hearts, coreSkills, specialAbilities, notableMoments,
    tendencies, location, motivation,
  });
});

// Update a character
router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT id FROM characters WHERE id = ?').get(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Character not found' });
  }

  const {
    name, description, background, traits, relationships,
    characterType, role, hearts, coreSkills, specialAbilities, notableMoments,
    tendencies, location, motivation, currentLocationId
  } = req.body;
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE characters SET
      name = COALESCE(?, name),
      description = COALESCE(?, description),
      background = COALESCE(?, background),
      traits = COALESCE(?, traits),
      relationships = COALESCE(?, relationships),
      character_type = COALESCE(?, character_type),
      role = COALESCE(?, role),
      hearts = COALESCE(?, hearts),
      core_skills = COALESCE(?, core_skills),
      special_abilities = COALESCE(?, special_abilities),
      notable_moments = COALESCE(?, notable_moments),
      tendencies = COALESCE(?, tendencies),
      location = COALESCE(?, location),
      motivation = COALESCE(?, motivation),
      current_location_id = COALESCE(?, current_location_id),
      updated_at = ?
    WHERE id = ?
  `).run(
    name, description, background,
    traits != null ? JSON.stringify(traits) : null,
    relationships != null ? JSON.stringify(relationships) : null,
    characterType, role, hearts,
    coreSkills != null ? JSON.stringify(coreSkills) : null,
    specialAbilities != null ? JSON.stringify(specialAbilities) : null,
    notableMoments != null ? JSON.stringify(notableMoments) : null,
    tendencies, location, motivation, currentLocationId ?? null,
    now, req.params.id
  );

  const character = db.prepare(`
    SELECT id, story_id as projectId, name, description, background, traits, relationships,
           character_type as characterType, role, hearts, core_skills as coreSkills,
           special_abilities as specialAbilities, notable_moments as notableMoments,
           tendencies, location, motivation
    FROM characters WHERE id = ?
  `).get(req.params.id);

  character.traits = JSON.parse(character.traits);
  character.relationships = JSON.parse(character.relationships);
  character.coreSkills = JSON.parse(character.coreSkills);
  character.specialAbilities = JSON.parse(character.specialAbilities);
  character.notableMoments = JSON.parse(character.notableMoments);

  return res.json(character);
});

// Delete a character
router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM characters WHERE id = ?').run(req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Character not found' });
  }
  return res.json({ success: true });
});

export default router;
