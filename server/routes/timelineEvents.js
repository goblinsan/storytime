import { Router } from 'express';
import { randomUUID } from 'crypto';
import db from '../db.js';

const router = Router();

function safeJson(val, fallback) {
  if (typeof val === 'string') {
    try {
      return JSON.parse(val);
    } catch {
      return fallback;
    }
  }
  return val ?? fallback;
}

function formatEvent(t) {
  return {
    ...t,
    isProtected: Boolean(t.isProtected),
    characters: safeJson(t.characters, []),
    factions: safeJson(t.factions, []),
    beforeEventIds: safeJson(t.beforeEventIds, []),
    afterEventIds: safeJson(t.afterEventIds, []),
  };
}

// List timeline events for a project
/**
 * The four list columns migration 010 added -- who an event involves, which
 * factions, and what it comes before and after -- were readable and not
 * writable. Both write handlers destructured the four scalar fields and
 * dropped the rest, so a request naming an event's cast came back 201 or 200
 * with a body that had none, which is indistinguishable from having sent none.
 * There was no way to say who was at an event through the API at all.
 */
const asJsonList = (value) => JSON.stringify(Array.isArray(value) ? value : []);

const readEvent = async (id) => formatEvent(await db.get(`
  SELECT id, project_id as "projectId", date, title, description,
         characters, factions, before_event_ids as "beforeEventIds",
         after_event_ids as "afterEventIds", is_protected as "isProtected",
         source_draft_id as "sourceDraftId", source_task_id as "sourceTaskId"
  FROM timeline_events WHERE id = ?
`, id));

router.get('/', async (req, res) => {
  const { projectId } = req.query;
  if (!projectId) {
    return res.status(400).json({ error: 'projectId query parameter is required' });
  }

  const rows = await db.all(`
    SELECT id, project_id as "projectId", date, title, description,
           characters, factions, before_event_ids as "beforeEventIds", after_event_ids as "afterEventIds",
           is_protected as "isProtected", source_draft_id as "sourceDraftId",
           source_task_id as "sourceTaskId"
    FROM timeline_events
    WHERE project_id = ?
    ORDER BY date ASC, id ASC
  `, projectId);

  return res.json(rows.map(formatEvent));
});

// Get single timeline event
router.get('/:id', async (req, res) => {
  const event = await db.get(`
    SELECT id, project_id as "projectId", date, title, description,
           characters, factions, before_event_ids as "beforeEventIds", after_event_ids as "afterEventIds",
           is_protected as "isProtected", source_draft_id as "sourceDraftId",
           source_task_id as "sourceTaskId"
    FROM timeline_events
    WHERE id = ?
  `, req.params.id);

  if (!event) {
    return res.status(404).json({ error: 'Timeline event not found' });
  }

  return res.json(formatEvent(event));
});

// Create timeline event
router.post('/', async (req, res) => {
  const {
    projectId, title, date, description, isProtected,
    characters, factions, beforeEventIds, afterEventIds,
  } = req.body;
  if (!projectId || !title) {
    return res.status(400).json({ error: 'projectId and title are required' });
  }

  const id = req.body.id || `event-${randomUUID().slice(0, 8)}`;
  await db.run(`
    INSERT INTO timeline_events
      (id, project_id, title, date, description, is_protected,
       characters, factions, before_event_ids, after_event_ids, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
  `, id, projectId, title, date || '', description || '', Boolean(isProtected),
  asJsonList(characters), asJsonList(factions),
  asJsonList(beforeEventIds), asJsonList(afterEventIds));

  return res.status(201).json(await readEvent(id));
});

// Update timeline event
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const existing = await db.get('SELECT * FROM timeline_events WHERE id = ?', id);
  if (!existing) {
    return res.status(404).json({ error: 'Timeline event not found' });
  }

  const {
    title, date, description, isProtected,
    characters, factions, beforeEventIds, afterEventIds,
  } = req.body;
  await db.run(`
    UPDATE timeline_events
    SET updated_at = to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        title = COALESCE(?, title),
        date = COALESCE(?, date),
        description = COALESCE(?, description),
        is_protected = COALESCE(?, is_protected),
        characters = COALESCE(?, characters),
        factions = COALESCE(?, factions),
        before_event_ids = COALESCE(?, before_event_ids),
        after_event_ids = COALESCE(?, after_event_ids)
    WHERE id = ?
  `, title ?? null, date ?? null, description ?? null,
  isProtected != null ? Boolean(isProtected) : null,
  characters !== undefined ? asJsonList(characters) : null,
  factions !== undefined ? asJsonList(factions) : null,
  beforeEventIds !== undefined ? asJsonList(beforeEventIds) : null,
  afterEventIds !== undefined ? asJsonList(afterEventIds) : null,
  id);

  return res.json(await readEvent(id));
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
