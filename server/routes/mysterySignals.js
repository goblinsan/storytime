import { Router } from 'express';
import { randomUUID } from 'crypto';
import db from '../db.js';

const router = Router();

function safeJson(val, fallback = []) {
  if (!val) return fallback;
  if (typeof val === 'object') return val;
  try {
    return JSON.parse(val);
  } catch {
    return fallback;
  }
}

function formatSignal(s) {
  return {
    ...s,
    isProtected: Boolean(s.isProtected),
    anomalousProperties: safeJson(s.anomalousProperties, []),
  };
}

// List mystery signals for a project
router.get('/', async (req, res) => {
  const { projectId } = req.query;
  if (!projectId) {
    return res.status(400).json({ error: 'projectId query parameter is required' });
  }

  const rows = await db.all(`
    SELECT id, project_id as "projectId", designation, frequency,
           origin_vector as "originVector", anomalous_properties as "anomalousProperties",
           transmission_transcript as "transmissionTranscript",
           is_protected as "isProtected", source_draft_id as "sourceDraftId",
           source_task_id as "sourceTaskId", created_at as "createdAt", updated_at as "updatedAt"
    FROM mystery_signals
    WHERE project_id = ?
    ORDER BY created_at DESC
  `, projectId);

  return res.json(rows.map(formatSignal));
});

// Get single signal
router.get('/:id', async (req, res) => {
  const s = await db.get(`
    SELECT id, project_id as "projectId", designation, frequency,
           origin_vector as "originVector", anomalous_properties as "anomalousProperties",
           transmission_transcript as "transmissionTranscript",
           is_protected as "isProtected", source_draft_id as "sourceDraftId",
           source_task_id as "sourceTaskId", created_at as "createdAt", updated_at as "updatedAt"
    FROM mystery_signals
    WHERE id = ?
  `, req.params.id);

  if (!s) {
    return res.status(404).json({ error: 'Mystery signal not found' });
  }

  return res.json(formatSignal(s));
});

// Create signal
router.post('/', async (req, res) => {
  const {
    projectId,
    designation,
    frequency,
    originVector,
    anomalousProperties = [],
    transmissionTranscript,
    isProtected = false,
  } = req.body;

  if (!projectId || !designation || !frequency) {
    return res.status(400).json({ error: 'projectId, designation, and frequency are required' });
  }

  const id = `signal-${randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();

  await db.run(
    `INSERT INTO mystery_signals (
       id, project_id, designation, frequency, origin_vector,
       anomalous_properties, transmission_transcript, is_protected,
       created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    projectId,
    designation,
    frequency,
    originVector || null,
    JSON.stringify(anomalousProperties),
    transmissionTranscript || null,
    Boolean(isProtected),
    now,
    now,
  );

  return res.status(201).json({
    id,
    projectId,
    designation,
    frequency,
    originVector: originVector || null,
    anomalousProperties,
    transmissionTranscript: transmissionTranscript || null,
    isProtected: Boolean(isProtected),
    createdAt: now,
    updatedAt: now,
  });
});

// Update protection
router.put('/:id/protection', async (req, res) => {
  const { id } = req.params;
  const { isProtected } = req.body;

  if (typeof isProtected !== 'boolean') {
    return res.status(400).json({ error: 'isProtected boolean is required' });
  }

  const existing = await db.get('SELECT id FROM mystery_signals WHERE id = ?', id);
  if (!existing) {
    return res.status(404).json({ error: 'Mystery signal not found' });
  }

  await db.run('UPDATE mystery_signals SET is_protected = ? WHERE id = ?', isProtected, id);
  return res.json({ id, isProtected });
});

// Delete signal
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const existing = await db.get('SELECT is_protected FROM mystery_signals WHERE id = ?', id);
  if (!existing) {
    return res.status(404).json({ error: 'Mystery signal not found' });
  }

  if (existing.is_protected) {
    return res.status(403).json({ error: 'Cannot delete canon protected mystery signal' });
  }

  await db.run('DELETE FROM mystery_signals WHERE id = ?', id);
  return res.json({ success: true });
});

export default router;
