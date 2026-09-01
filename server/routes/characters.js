import { Router } from 'express';
import { randomUUID } from 'crypto';
import db from '../db.js';

const router = Router();

// List shared/global characters
router.get('/shared', async (_req, res) => {
  const rows = await db.all(`
    SELECT id, name, archetype, summary, background,
           default_traits as "defaultTraits",
           created_at as "createdAt", updated_at as "updatedAt"
    FROM shared_characters
    ORDER BY name ASC
  `);
  return res.json(rows.map((c) => ({
    ...c,
    defaultTraits: typeof c.defaultTraits === 'string' ? JSON.parse(c.defaultTraits) : (c.defaultTraits || []),
  })));
});

// Create a new shared character
router.post('/shared', async (req, res) => {
  const {
    name,
    archetype = '',
    summary = '',
    background = '',
    defaultTraits = [],
  } = req.body;

  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: 'Name is required for shared character' });
  }

  const id = `shared-char-${randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();

  await db.run(`
    INSERT INTO shared_characters (id, name, archetype, summary, background, default_traits, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?::jsonb, ?, ?)
  `, id, name.trim(), archetype, summary, background, JSON.stringify(defaultTraits), now, now);

  const created = await db.get(`
    SELECT id, name, archetype, summary, background,
           default_traits as "defaultTraits",
           created_at as "createdAt", updated_at as "updatedAt"
    FROM shared_characters WHERE id = ?
  `, id);

  return res.status(201).json({
    ...created,
    defaultTraits: typeof created.defaultTraits === 'string' ? JSON.parse(created.defaultTraits) : (created.defaultTraits || []),
  });
});

// Adopt or fork a shared character into a universe project
router.post('/adopt-shared', async (req, res) => {
  const {
    projectId,
    sharedCharacterId,
    role = '',
    motivation = '',
    currentLocationId = null,
    overrideName,
    isVariant = false,
  } = req.body;

  if (!projectId || !sharedCharacterId) {
    return res.status(400).json({ error: 'projectId and sharedCharacterId are required' });
  }

  const shared = await db.get(`
    SELECT id, name, archetype, summary, background, default_traits
    FROM shared_characters WHERE id = ?
  `, sharedCharacterId);

  if (!shared) {
    return res.status(404).json({ error: 'Shared character not found' });
  }

  const project = await db.get('SELECT id FROM stories WHERE id = ?', projectId);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const id = randomUUID();
  const now = new Date().toISOString();
  const name = overrideName || (isVariant ? `${shared.name} (Variant)` : shared.name);
  const traits = typeof shared.default_traits === 'string' ? JSON.parse(shared.default_traits) : (shared.default_traits || []);

  await db.run(`
    INSERT INTO characters (
      id, project_id, name, description, background, traits, relationships,
      character_type, role, hearts, core_skills, special_abilities, notable_moments,
      tendencies, location, motivation, current_location_id,
      shared_character_id, is_shared_variant, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?::jsonb, '[]'::jsonb,
      'npc', ?, 5, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
      '', '', ?, ?,
      ?, ?, ?, ?
    )
  `,
    id,
    projectId,
    name,
    shared.summary || '',
    shared.background || '',
    JSON.stringify(traits),
    role || shared.archetype || 'Key Figure',
    motivation || '',
    currentLocationId,
    sharedCharacterId,
    Boolean(isVariant),
    now,
    now,
  );

  return res.status(201).json({
    id,
    projectId,
    name,
    description: shared.summary || '',
    background: shared.background || '',
    traits,
    role: role || shared.archetype || 'Key Figure',
    motivation: motivation || '',
    currentLocationId,
    sharedCharacterId,
    isSharedVariant: Boolean(isVariant),
    sharedCharacter: {
      id: shared.id,
      name: shared.name,
      archetype: shared.archetype,
    },
  });
});

// List characters for a project (optionally filtered by character_type)
router.get('/', async (req, res) => {
  const { projectId, characterType } = req.query;
  if (!projectId) {
    return res.status(400).json({ error: 'projectId query parameter is required' });
  }

  let sql = `
    SELECT c.id, c.project_id as "projectId", c.name, c.description, c.background, c.traits, c.relationships,
           c.character_type as "characterType", c.role, c.hearts, c.core_skills as "coreSkills",
           c.special_abilities as "specialAbilities", c.notable_moments as "notableMoments",
           c.tendencies, c.location, c.motivation, c.current_location_id as "currentLocationId",
           c.shared_character_id as "sharedCharacterId", c.is_shared_variant as "isSharedVariant",
           s.name as "sharedName", s.archetype as "sharedArchetype"
    FROM characters c
    LEFT JOIN shared_characters s ON c.shared_character_id = s.id
    WHERE c.project_id = ?
  `;
  const params = [projectId];
  if (characterType) {
    sql += ' AND c.character_type = ?';
    params.push(characterType);
  }
  sql += ' ORDER BY c.created_at ASC';

  const characters = await db.all(sql, ...params);

  return res.json(characters.map(c => ({
    ...c,
    traits: typeof c.traits === 'string' ? JSON.parse(c.traits) : (c.traits || []),
    relationships: typeof c.relationships === 'string' ? JSON.parse(c.relationships) : (c.relationships || []),
    coreSkills: typeof c.coreSkills === 'string' ? JSON.parse(c.coreSkills) : (c.coreSkills || []),
    specialAbilities: typeof c.specialAbilities === 'string' ? JSON.parse(c.specialAbilities) : (c.specialAbilities || []),
    notableMoments: typeof c.notableMoments === 'string' ? JSON.parse(c.notableMoments) : (c.notableMoments || []),
    isSharedVariant: Boolean(c.isSharedVariant),
    sharedCharacter: c.sharedCharacterId ? {
      id: c.sharedCharacterId,
      name: c.sharedName,
      archetype: c.sharedArchetype,
    } : null,
  })));
});

// Get a single character
router.get('/:id', async (req, res) => {
  const character = await db.get(`
    SELECT c.id, c.project_id as "projectId", c.name, c.description, c.background, c.traits, c.relationships,
           c.character_type as "characterType", c.role, c.hearts, c.core_skills as "coreSkills",
           c.special_abilities as "specialAbilities", c.notable_moments as "notableMoments",
           c.tendencies, c.location, c.motivation, c.current_location_id as "currentLocationId",
           c.shared_character_id as "sharedCharacterId", c.is_shared_variant as "isSharedVariant",
           s.name as "sharedName", s.archetype as "sharedArchetype"
    FROM characters c
    LEFT JOIN shared_characters s ON c.shared_character_id = s.id
    WHERE c.id = ?
  `, req.params.id);

  if (!character) {
    return res.status(404).json({ error: 'Character not found' });
  }

  return res.json({
    ...character,
    traits: typeof character.traits === 'string' ? JSON.parse(character.traits) : (character.traits || []),
    relationships: typeof character.relationships === 'string' ? JSON.parse(character.relationships) : (character.relationships || []),
    coreSkills: typeof character.coreSkills === 'string' ? JSON.parse(character.coreSkills) : (character.coreSkills || []),
    specialAbilities: typeof character.specialAbilities === 'string' ? JSON.parse(character.specialAbilities) : (character.specialAbilities || []),
    notableMoments: typeof character.notableMoments === 'string' ? JSON.parse(character.notableMoments) : (character.notableMoments || []),
    isSharedVariant: Boolean(character.isSharedVariant),
    sharedCharacter: character.sharedCharacterId ? {
      id: character.sharedCharacterId,
      name: character.sharedName,
      archetype: character.sharedArchetype,
    } : null,
  });
});

// Create a character
router.post('/', async (req, res) => {
  const {
    projectId, name = 'New Character', description = '', background = '',
    traits = [], relationships = [],
    characterType = 'story', role = '', hearts = null,
    coreSkills = [], specialAbilities = [], notableMoments = [],
    tendencies = '', location = '', motivation = '', currentLocationId = null
  } = req.body;

  if (!projectId) {
    return res.status(400).json({ error: 'projectId is required' });
  }

  const story = await db.get('SELECT id FROM stories WHERE id = ?', projectId);
  if (!story) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const id = randomUUID();
  const now = new Date().toISOString();

  await db.run(`
    INSERT INTO characters (id, project_id, name, description, background, traits, relationships,
      character_type, role, hearts, core_skills, special_abilities, notable_moments,
      tendencies, location, motivation, current_location_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    id, projectId, name, description, background,
    JSON.stringify(traits), JSON.stringify(relationships),
    characterType, role, hearts,
    JSON.stringify(coreSkills), JSON.stringify(specialAbilities), JSON.stringify(notableMoments),
    tendencies, location, motivation, currentLocationId, now, now
  );

  return res.status(201).json({
    id, projectId, name, description, background, traits, relationships,
    characterType, role, hearts, coreSkills, specialAbilities, notableMoments,
    tendencies, location, motivation,
  });
});

// Update a character
router.put('/:id', async (req, res) => {
  const existing = await db.get('SELECT id FROM characters WHERE id = ?', req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Character not found' });
  }

  const {
    name, description, background, traits, relationships,
    characterType, role, hearts, coreSkills, specialAbilities, notableMoments,
    tendencies, location, motivation, currentLocationId
  } = req.body;
  const now = new Date().toISOString();

  await db.run(`
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
  `, 
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

  const character = await db.get(`
    SELECT id, project_id as "projectId", name, description, background, traits, relationships,
           character_type as "characterType", role, hearts, core_skills as "coreSkills",
           special_abilities as "specialAbilities", notable_moments as "notableMoments",
           tendencies, location, motivation
    FROM characters WHERE id = ?
  `, req.params.id);

  character.traits = JSON.parse(character.traits);
  character.relationships = JSON.parse(character.relationships);
  character.coreSkills = JSON.parse(character.coreSkills);
  character.specialAbilities = JSON.parse(character.specialAbilities);
  character.notableMoments = JSON.parse(character.notableMoments);

  return res.json(character);
});

// Delete a character
router.delete('/:id', async (req, res) => {
  const result = await db.run('DELETE FROM characters WHERE id = ?', req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Character not found' });
  }
  return res.json({ success: true });
});

export default router;
