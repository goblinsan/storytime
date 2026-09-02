import { Router } from 'express';
import { randomUUID } from 'crypto';
import db from '../db.js';

const router = Router();

function formatRow(t) {
  return {
    id: t.id,
    projectId: t.project_id || t.projectId,
    name: t.name || '',
    principles: t.principles || '',
    limitations: t.limitations || '',
    proliferation: t.proliferation || '',
    classification: t.classification || '',
    patentsOrTaboos: t.patents_or_taboos || t.patentsOrTaboos || '',
    isProtected: Boolean(t.is_protected ?? t.isProtected),
    sourceDraftId: t.source_draft_id || t.sourceDraftId || null,
    sourceTaskId: t.source_task_id || t.sourceTaskId || null,
    createdAt: t.created_at || t.createdAt,
    updatedAt: t.updated_at || t.updatedAt,
  };
}

// List technologies for a project
router.get('/', async (req, res) => {
  const { projectId } = req.query;
  if (!projectId) {
    return res.status(400).json({ error: 'projectId query parameter is required' });
  }

  const rows = await db.all(`
    SELECT *
    FROM technologies
    WHERE project_id = ?
    ORDER BY name ASC, id ASC
  `, projectId);

  return res.json(rows.map(formatRow));
});

// Get single technology
router.get('/:id', async (req, res) => {
  const tech = await db.get(`SELECT * FROM technologies WHERE id = ?`, req.params.id);
  if (!tech) {
    return res.status(404).json({ error: 'Technology not found' });
  }

  return res.json(formatRow(tech));
});

// Create technology
router.post('/', async (req, res) => {
  const {
    projectId,
    name,
    principles = '',
    limitations = '',
    proliferation = '',
    classification = '',
    patentsOrTaboos = '',
    isProtected = false,
  } = req.body;

  if (!projectId || !name) {
    return res.status(400).json({ error: 'projectId and name are required' });
  }

  const id = req.body.id || `tech-${randomUUID().slice(0, 8)}`;
  await db.run(`
    INSERT INTO technologies (
      id, project_id, name, principles, limitations,
      proliferation, classification, patents_or_taboos, is_protected
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, id, projectId, name, principles, limitations, proliferation, classification, patentsOrTaboos, Boolean(isProtected));

  const created = await db.get(`SELECT * FROM technologies WHERE id = ?`, id);
  return res.status(201).json(formatRow(created));
});

// Update technology
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const existing = await db.get('SELECT * FROM technologies WHERE id = ?', id);
  if (!existing) {
    return res.status(404).json({ error: 'Technology not found' });
  }

  const {
    name,
    principles,
    limitations,
    proliferation,
    classification,
    patentsOrTaboos,
    isProtected,
  } = req.body;

  await db.run(`
    UPDATE technologies
    SET name = COALESCE(?, name),
        principles = COALESCE(?, principles),
        limitations = COALESCE(?, limitations),
        proliferation = COALESCE(?, proliferation),
        classification = COALESCE(?, classification),
        patents_or_taboos = COALESCE(?, patents_or_taboos),
        is_protected = COALESCE(?, is_protected),
        updated_at = to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    WHERE id = ?
  `,
    name ?? null,
    principles ?? null,
    limitations ?? null,
    proliferation ?? null,
    classification ?? null,
    patentsOrTaboos ?? null,
    isProtected != null ? Boolean(isProtected) : null,
    id
  );

  const updated = await db.get(`SELECT * FROM technologies WHERE id = ?`, id);
  return res.json(formatRow(updated));
});

// Delete technology
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const existing = await db.get('SELECT * FROM technologies WHERE id = ?', id);
  if (!existing) {
    return res.status(404).json({ error: 'Technology not found' });
  }

  if (existing.is_protected) {
    return res.status(403).json({ error: 'Cannot delete a protected technology' });
  }

  await db.run('DELETE FROM technologies WHERE id = ?', id);
  return res.json({ success: true, id });
});

// Set protection
router.put('/:id/protection', async (req, res) => {
  const { id } = req.params;
  const { isProtected } = req.body;
  if (typeof isProtected !== 'boolean') {
    return res.status(400).json({ error: 'isProtected must be a boolean' });
  }

  const existing = await db.get('SELECT * FROM technologies WHERE id = ?', id);
  if (!existing) {
    return res.status(404).json({ error: 'Technology not found' });
  }

  await db.run('UPDATE technologies SET is_protected = ? WHERE id = ?', isProtected, id);
  const updated = await db.get(`SELECT * FROM technologies WHERE id = ?`, id);

  return res.json(formatRow(updated));
});

export default router;
