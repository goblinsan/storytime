import { Router } from 'express';
import { randomUUID } from 'crypto';
import db from '../db.js';

const router = Router();

// List timeline events for a project
router.get('/', async (req, res) => {
  const { projectId } = req.query;
  if (!projectId) {
    return res.status(400).json({ error: 'projectId query parameter is required' });
  }

  const rows = await db.all(`
    SELECT id, project_id as "projectId", date, title, description,
           is_protected as "isProtected", source_draft_id as "sourceDraftId",
           source_task_id as "sourceTaskId"
    FROM timeline_events
    WHERE project_id = ?
    ORDER BY date ASC, id ASC
  `, projectId);

  return res.json(rows.map((t) => ({
    ...t,
    isProtected: Boolean(t.isProtected),
  })));
});

// Get single timeline event
router.get('/:id', async (req, res) => {
  const event = await db.get(`
    SELECT id, project_id as "projectId", date, title, description,
           is_protected as "isProtected", source_draft_id as "sourceDraftId",
           source_task_id as "sourceTaskId"
    FROM timeline_events
    WHERE id = ?
  `, req.params.id);

  if (!event) {
    return res.status(404).json({ error: 'Timeline event not found' });
  }

  return res.json({
    ...event,
    isProtected: Boolean(event.isProtected),
  });
});

// Create timeline event
router.post('/', async (req, res) => {
  const { projectId, title, date, description, isProtected } = req.body;
  if (!projectId || !title) {
    return res.status(400).json({ error: 'projectId and title are required' });
  }

  const id = req.body.id || `event-${randomUUID().slice(0, 8)}`;
  await db.run(`
    INSERT INTO timeline_events (id, project_id, title, date, description, is_protected)
    VALUES (?, ?, ?, ?, ?, ?)
  `, id, projectId, title, date || '', description || '', Boolean(isProtected));

  const created = await db.get(`
    SELECT id, project_id as "projectId", date, title, description, is_protected as "isProtected"
    FROM timeline_events WHERE id = ?
  `, id);

  return res.status(201).json({
    ...created,
    isProtected: Boolean(created.isProtected),
  });
});

// Update timeline event
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const existing = await db.get('SELECT * FROM timeline_events WHERE id = ?', id);
  if (!existing) {
    return res.status(404).json({ error: 'Timeline event not found' });
  }

  const { title, date, description, isProtected } = req.body;
  await db.run(`
    UPDATE timeline_events
    SET title = COALESCE(?, title),
        date = COALESCE(?, date),
        description = COALESCE(?, description),
        is_protected = COALESCE(?, is_protected)
    WHERE id = ?
  `, title ?? null, date ?? null, description ?? null, isProtected != null ? Boolean(isProtected) : null, id);

  const updated = await db.get(`
    SELECT id, project_id as "projectId", date, title, description, is_protected as "isProtected"
    FROM timeline_events WHERE id = ?
  `, id);

  return res.json({
    ...updated,
    isProtected: Boolean(updated.isProtected),
  });
});

// Delete timeline event
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const existing = await db.get('SELECT * FROM timeline_events WHERE id = ?', id);
  if (!existing) {
    return res.status(404).json({ error: 'Timeline event not found' });
  }

  if (existing.is_protected) {
    return res.status(403).json({ error: 'Cannot delete a protected timeline event' });
  }

  await db.run('DELETE FROM timeline_events WHERE id = ?', id);
  return res.json({ success: true, id });
});

// Set protection
router.put('/:id/protection', async (req, res) => {
  const { id } = req.params;
  const { isProtected } = req.body;
  if (typeof isProtected !== 'boolean') {
    return res.status(400).json({ error: 'isProtected must be a boolean' });
  }

  const existing = await db.get('SELECT * FROM timeline_events WHERE id = ?', id);
  if (!existing) {
    return res.status(404).json({ error: 'Timeline event not found' });
  }

  await db.run('UPDATE timeline_events SET is_protected = ? WHERE id = ?', isProtected, id);
  const updated = await db.get(`
    SELECT id, project_id as "projectId", date, title, description, is_protected as "isProtected"
    FROM timeline_events WHERE id = ?
  `, id);

  return res.json({
    ...updated,
    isProtected: Boolean(updated.isProtected),
  });
});

export default router;
