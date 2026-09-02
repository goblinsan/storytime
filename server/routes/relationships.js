import { Router } from 'express';
import { randomUUID } from 'crypto';
import db from '../db.js';

const router = Router();

// List canon relationships for a project (optionally filtered by source or target entity)
router.get('/', async (req, res) => {
  const { projectId, entityId } = req.query;

  if (!projectId) {
    return res.status(400).json({ error: 'projectId is required' });
  }

  let sql = `
    SELECT id, project_id as "projectId",
           source_entity_id as "sourceEntityId", source_entity_type as "sourceEntityType",
           target_entity_id as "targetEntityId", target_entity_type as "targetEntityType",
           relationship_type as "relationshipType", confidence,
           source_draft_id as "sourceDraftId", source_task_id as "sourceTaskId",
           is_protected as "isProtected",
           notes, created_at as "createdAt", updated_at as "updatedAt"
    FROM canon_relationships
    WHERE project_id = ?
  `;
  const params = [projectId];

  if (entityId) {
    sql += ' AND (source_entity_id = ? OR target_entity_id = ?)';
    params.push(entityId, entityId);
  }

  sql += ' ORDER BY created_at DESC';

  const rows = await db.all(sql, ...params);
  res.json(rows.map(r => ({ ...r, isProtected: Boolean(r.isProtected) })));
});

// Create a new canon relationship
router.post('/', async (req, res) => {
  const {
    projectId,
    sourceEntityId,
    sourceEntityType,
    targetEntityId,
    targetEntityType,
    relationshipType,
    confidence = 1.0,
    sourceDraftId = '',
    sourceTaskId = '',
    notes = '',
    isProtected = false,
  } = req.body;

  if (!projectId || !sourceEntityId || !sourceEntityType || !targetEntityId || !targetEntityType || !relationshipType) {
    return res.status(400).json({
      error: 'projectId, sourceEntityId, sourceEntityType, targetEntityId, targetEntityType, and relationshipType are required',
    });
  }

  const project = await db.get('SELECT id FROM stories WHERE id = ?', projectId);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const id = `rel-${randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();

  await db.run(`
    INSERT INTO canon_relationships (
      id, project_id, source_entity_id, source_entity_type,
      target_entity_id, target_entity_type, relationship_type,
      confidence, source_draft_id, source_task_id, notes,
      is_protected, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
    id,
    projectId,
    sourceEntityId,
    sourceEntityType,
    targetEntityId,
    targetEntityType,
    relationshipType,
    confidence,
    sourceDraftId,
    sourceTaskId,
    notes,
    Boolean(isProtected),
    now,
    now,
  );

  const created = await db.get(`
    SELECT id, project_id as "projectId",
           source_entity_id as "sourceEntityId", source_entity_type as "sourceEntityType",
           target_entity_id as "targetEntityId", target_entity_type as "targetEntityType",
           relationship_type as "relationshipType", confidence,
           source_draft_id as "sourceDraftId", source_task_id as "sourceTaskId",
           is_protected as "isProtected",
           notes, created_at as "createdAt", updated_at as "updatedAt"
    FROM canon_relationships WHERE id = ?
  `, id);

  res.status(201).json({ ...created, isProtected: Boolean(created.isProtected) });
});

// Partial update a canon relationship (PATCH)
router.patch('/:id', async (req, res) => {
  const existing = await db.get('SELECT id FROM canon_relationships WHERE id = ?', req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Relationship not found' });
  }

  const { relationshipType, confidence, notes, isProtected } = req.body;
  const now = new Date().toISOString();

  await db.run(`
    UPDATE canon_relationships SET
      relationship_type = COALESCE(?, relationship_type),
      confidence = COALESCE(?, confidence),
      notes = COALESCE(?, notes),
      is_protected = COALESCE(?, is_protected),
      updated_at = ?
    WHERE id = ?
  `,
    relationshipType,
    confidence,
    notes,
    isProtected != null ? Boolean(isProtected) : null,
    now,
    req.params.id
  );

  const updated = await db.get(`
    SELECT id, project_id as "projectId",
           source_entity_id as "sourceEntityId", source_entity_type as "sourceEntityType",
           target_entity_id as "targetEntityId", target_entity_type as "targetEntityType",
           relationship_type as "relationshipType", confidence,
           source_draft_id as "sourceDraftId", source_task_id as "sourceTaskId",
           is_protected as "isProtected",
           notes, created_at as "createdAt", updated_at as "updatedAt"
    FROM canon_relationships WHERE id = ?
  `, req.params.id);

  res.json({ ...updated, isProtected: Boolean(updated.isProtected) });
});

// Delete a canon relationship
router.delete('/:id', async (req, res) => {
  const result = await db.run('DELETE FROM canon_relationships WHERE id = ?', req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Relationship not found' });
  }
  res.json({ success: true });
});

export default router;
