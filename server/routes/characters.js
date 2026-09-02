import { Router } from 'express';
import { randomUUID } from 'crypto';
import db from '../db.js';
import { buildFamilyTrees } from '../story-harness/familyTree.js';

const router = Router();
const VALID_IMPORTANCE = new Set(['principal', 'supporting', 'background']);

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

// List characters for a project (optionally filtered by character_type, importance, timeframeYear, eventId)
router.get('/', async (req, res) => {
  const { projectId, characterType, importance, timeframeYear, eventId } = req.query;
  if (!projectId) {
    return res.status(400).json({ error: 'projectId query parameter is required' });
  }

  if (importance && !VALID_IMPORTANCE.has(importance)) {
    return res.status(400).json({ error: 'importance must be one of: principal, supporting, background' });
  }

  let sql = `
    SELECT c.id, c.project_id as "projectId", c.name, c.description, c.background, c.traits, c.relationships,
           c.character_type as "characterType", c.role, c.hearts, c.core_skills as "coreSkills",
           c.special_abilities as "specialAbilities", c.notable_moments as "notableMoments",
           c.tendencies, c.location, c.motivation, c.current_location_id as "currentLocationId",
           c.shared_character_id as "sharedCharacterId", c.is_shared_variant as "isSharedVariant",
           c.is_protected as "isProtected",
           c.importance,
           c.active_timeframe_start as "activeTimeframeStart",
           c.active_timeframe_end as "activeTimeframeEnd",
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

  if (importance) {
    sql += ' AND c.importance = ?';
    params.push(importance);
  }

  if (timeframeYear !== undefined && timeframeYear !== '') {
    const yr = parseInt(timeframeYear, 10);
    if (!Number.isNaN(yr)) {
      sql += ' AND (c.active_timeframe_start IS NULL OR c.active_timeframe_start <= ?) AND (c.active_timeframe_end IS NULL OR c.active_timeframe_end >= ?)';
      params.push(yr, yr);
    }
  }

  if (eventId) {
    const eventRow = await db.get('SELECT characters FROM timeline_events WHERE id = ?', eventId);
    let eventCharIds = [];
    if (eventRow?.characters) {
      eventCharIds = typeof eventRow.characters === 'string' ? JSON.parse(eventRow.characters) : eventRow.characters;
    }
    if (eventCharIds.length === 0) {
      return res.json([]);
    }
    sql += ` AND c.id IN (${eventCharIds.map(() => '?').join(', ')})`;
    params.push(...eventCharIds);
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
    isProtected: Boolean(c.isProtected),
    importance: c.importance || 'supporting',
    activeTimeframeStart: c.activeTimeframeStart ?? null,
    activeTimeframeEnd: c.activeTimeframeEnd ?? null,
    sharedCharacter: c.sharedCharacterId ? {
      id: c.sharedCharacterId,
      name: c.sharedName,
      archetype: c.sharedArchetype,
    } : null,
  })));
});

// Get family trees and lineage graph for a project (REGISTERED BEFORE /:id)
router.get('/family-tree', async (req, res) => {
  const { projectId } = req.query;
  if (!projectId) {
    return res.status(400).json({ error: 'projectId query parameter is required' });
  }

  const [characters, relationships] = await Promise.all([
    db.all(`
      SELECT id, name, role, importance, character_type as "characterType",
             active_timeframe_start as "activeTimeframeStart",
             active_timeframe_end as "activeTimeframeEnd",
             is_protected as "isProtected"
      FROM characters
      WHERE project_id = ?
      ORDER BY name ASC
    `, projectId),
    db.all(`
      SELECT id, source_entity_id as "sourceEntityId", target_entity_id as "targetEntityId",
             relationship_type as "relationshipType", notes
      FROM canon_relationships
      WHERE project_id = ? AND source_entity_type = 'character' AND target_entity_type = 'character'
    `, projectId),
  ]);

  const tree = buildFamilyTrees(characters, relationships);
  return res.json(tree);
});

// Get a single character
router.get('/:id', async (req, res) => {
  const character = await db.get(`
    SELECT c.id, c.project_id as "projectId", c.name, c.description, c.background, c.traits, c.relationships,
           c.character_type as "characterType", c.role, c.hearts, c.core_skills as "coreSkills",
           c.special_abilities as "specialAbilities", c.notable_moments as "notableMoments",
           c.tendencies, c.location, c.motivation, c.current_location_id as "currentLocationId",
           c.shared_character_id as "sharedCharacterId", c.is_shared_variant as "isSharedVariant",
           c.is_protected as "isProtected",
           c.importance,
           c.active_timeframe_start as "activeTimeframeStart",
           c.active_timeframe_end as "activeTimeframeEnd",
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
    isProtected: Boolean(character.isProtected),
    importance: character.importance || 'supporting',
    activeTimeframeStart: character.activeTimeframeStart ?? null,
    activeTimeframeEnd: character.activeTimeframeEnd ?? null,
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
    tendencies = '', location = '', motivation = '', currentLocationId = null,
    isProtected = false,
    importance = 'supporting', activeTimeframeStart = null, activeTimeframeEnd = null,
  } = req.body;

  if (!projectId) {
    return res.status(400).json({ error: 'projectId is required' });
  }

  if (importance && !VALID_IMPORTANCE.has(importance)) {
    return res.status(400).json({ error: 'importance must be one of: principal, supporting, background' });
  }

  const story = await db.get('SELECT id FROM stories WHERE id = ?', projectId);
  if (!story) {
    return res.status(404).json({ error: 'Project not found' });
  }

  let charName = (name || 'New Character').trim();
  if (charName.toLowerCase() === 'new character') {
    const existingCount = await db.get(
      "SELECT count(*)::int as count FROM characters WHERE project_id = ? AND name ILIKE 'New Character%'",
      projectId
    );
    if (existingCount && existingCount.count > 0) {
      charName = `New Character ${existingCount.count + 1}`;
    }
  } else {
    const existing = await db.get(
      'SELECT id FROM characters WHERE project_id = ? AND LOWER(TRIM(name)) = LOWER(TRIM(?))',
      projectId, charName
    );
    if (existing) {
      return res.status(409).json({ error: `Character with name '${charName}' already exists in this universe.` });
    }
  }

  const id = randomUUID();
  const now = new Date().toISOString();

  await db.run(`
    INSERT INTO characters (id, project_id, name, description, background, traits, relationships,
      character_type, role, hearts, core_skills, special_abilities, notable_moments,
      tendencies, location, motivation, current_location_id, is_protected,
      importance, active_timeframe_start, active_timeframe_end,
      created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    id, projectId, charName, description, background,
    JSON.stringify(traits), JSON.stringify(relationships),
    characterType, role, hearts,
    JSON.stringify(coreSkills), JSON.stringify(specialAbilities), JSON.stringify(notableMoments),
    tendencies, location, motivation, currentLocationId, Boolean(isProtected),
    importance, activeTimeframeStart ?? null, activeTimeframeEnd ?? null,
    now, now
  );

  return res.status(201).json({
    id, projectId, name: charName, description, background, traits, relationships,
    characterType, role, hearts, coreSkills, specialAbilities, notableMoments,
    tendencies, location, motivation, isProtected: Boolean(isProtected),
    importance, activeTimeframeStart: activeTimeframeStart ?? null, activeTimeframeEnd: activeTimeframeEnd ?? null,
  });
});

// Update a character (PUT)
router.put('/:id', async (req, res) => {
  const existing = await db.get('SELECT id FROM characters WHERE id = ?', req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Character not found' });
  }

  const {
    name, description, background, traits, relationships,
    characterType, role, hearts, coreSkills, specialAbilities, notableMoments,
    tendencies, location, motivation, currentLocationId, isProtected,
    importance, activeTimeframeStart, activeTimeframeEnd
  } = req.body;
  const now = new Date().toISOString();

  if (importance !== undefined && !VALID_IMPORTANCE.has(importance)) {
    return res.status(400).json({ error: 'importance must be one of: principal, supporting, background' });
  }

  if (name && name.trim().toLowerCase() !== 'new character' && name.trim().toLowerCase() !== 'unnamed character') {
    const existingNamed = await db.get(
      'SELECT id FROM characters WHERE project_id = ? AND LOWER(TRIM(name)) = LOWER(TRIM(?)) AND id != ?',
      existing.projectId, name.trim(), req.params.id
    );
    if (existingNamed) {
      return res.status(409).json({ error: `Character with name '${name.trim()}' already exists in this universe.` });
    }
  }

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
      is_protected = COALESCE(?, is_protected),
      importance = COALESCE(?, importance),
      active_timeframe_start = COALESCE(?, active_timeframe_start),
      active_timeframe_end = COALESCE(?, active_timeframe_end),
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
    isProtected != null ? Boolean(isProtected) : null,
    importance ?? null,
    activeTimeframeStart !== undefined ? activeTimeframeStart : null,
    activeTimeframeEnd !== undefined ? activeTimeframeEnd : null,
    now, req.params.id
  );

  const character = await db.get(`
    SELECT id, project_id as "projectId", name, description, background, traits, relationships,
           character_type as "characterType", role, hearts, core_skills as "coreSkills",
           special_abilities as "specialAbilities", notable_moments as "notableMoments",
           tendencies, location, motivation, is_protected as "isProtected",
           importance,
           active_timeframe_start as "activeTimeframeStart",
           active_timeframe_end as "activeTimeframeEnd"
    FROM characters WHERE id = ?
  `, req.params.id);

  character.traits = JSON.parse(character.traits);
  character.relationships = JSON.parse(character.relationships);
  character.coreSkills = JSON.parse(character.coreSkills);
  character.specialAbilities = JSON.parse(character.specialAbilities);
  character.notableMoments = JSON.parse(character.notableMoments);
  character.isProtected = Boolean(character.isProtected);
  character.importance = character.importance || 'supporting';

  return res.json(character);
});

// Partial update a character (PATCH)
router.patch('/:id', async (req, res) => {
  const existing = await db.get('SELECT id FROM characters WHERE id = ?', req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Character not found' });
  }

  const {
    name, description, background, traits, relationships,
    characterType, role, hearts, coreSkills, specialAbilities, notableMoments,
    tendencies, location, motivation, currentLocationId, isProtected
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
      is_protected = COALESCE(?, is_protected),
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
    isProtected != null ? Boolean(isProtected) : null,
    now, req.params.id
  );

  const character = await db.get(`
    SELECT id, project_id as "projectId", name, description, background, traits, relationships,
           character_type as "characterType", role, hearts, core_skills as "coreSkills",
           special_abilities as "specialAbilities", notable_moments as "notableMoments",
           tendencies, location, motivation, is_protected as "isProtected"
    FROM characters WHERE id = ?
  `, req.params.id);

  character.traits = JSON.parse(character.traits);
  character.relationships = JSON.parse(character.relationships);
  character.coreSkills = JSON.parse(character.coreSkills);
  character.specialAbilities = JSON.parse(character.specialAbilities);
  character.notableMoments = JSON.parse(character.notableMoments);
  character.isProtected = Boolean(character.isProtected);

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
