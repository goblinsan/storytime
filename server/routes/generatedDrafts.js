import { createHash, randomUUID } from 'node:crypto';
import { Router } from 'express';
import db from '../db.js';
import { promoteDraftToCanon } from '../story-harness/promotion.js';

const router = Router();
const STATUSES = new Set(['generated', 'accepted', 'rejected']);

function parseJsonSafe(val, fallback) {
  if (typeof val === 'string') {
    try {
      return JSON.parse(val);
    } catch {
      return fallback;
    }
  }
  return val ?? fallback;
}

function toArtifact(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    artifactType: row.artifact_type,
    payload: parseJsonSafe(row.payload, {}),
    status: row.status,
    dashboardProjectId: row.dashboard_project_id,
    dashboardTaskId: row.dashboard_task_id,
    dashboardRunId: row.dashboard_run_id,
    modelProvider: row.model_provider,
    modelName: row.model_name,
    promptFingerprint: row.prompt_fingerprint,
    gateResult: parseJsonSafe(row.gate_result, { ok: true, violations: [] }),
    promotedAt: row.promoted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Create a draft.
 *
 * The table has held drafts since migration 003 and the routes could read,
 * accept, reject and promote them -- but nothing could make one except the
 * harness, writing straight to the database. So the review queue existed and
 * could only be filled by the local model.
 *
 * This is what lets a person ask for something: a request is a draft with a
 * payload saying what is wanted and nothing yet proposed, and the answer fills
 * the same row in. One artifact, two halves, so a request and its answer
 * cannot drift apart or be reviewed separately.
 */
router.post('/', async (req, res) => {
  const {
    projectId, artifactType, payload, status = 'generated',
    modelProvider = '', modelName = '', dashboardTaskId = '',
  } = req.body;

  if (!projectId || !artifactType) {
    return res.status(400).json({ error: 'projectId and artifactType are required' });
  }
  if (!STATUSES.has(status)) {
    return res.status(400).json({ error: `status must be one of: ${[...STATUSES].join(', ')}` });
  }

  const project = await db.get('SELECT id FROM stories WHERE id = ?', projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const id = req.body.id || `draft-${randomUUID().slice(0, 8)}`;
  const existing = await db.get('SELECT id FROM generated_drafts WHERE id = ?', id);
  if (existing) return res.status(409).json({ error: `Draft ${id} already exists` });

  /**
   * A project may hold one draft per fingerprint (migration 008), which is
   * what stops the same generation being stored twice. Leaving it at its empty
   * default means the second draft in a project collides with the first, and
   * because an async throw in an express route answers nothing at all, that
   * collision presented as a request that hung until the test timed out rather
   * than as an error.
   *
   * So the fingerprint is derived from what was asked. Two identical requests
   * for the same character's same gaps are the same request, and the second one
   * is told so instead of being filed again.
   */
  const fingerprint = req.body.promptFingerprint
    || createHash('sha256').update(`${artifactType}:${JSON.stringify(payload ?? {})}`).digest('hex').slice(0, 32);
  const duplicate = await db.get(
    'SELECT id FROM generated_drafts WHERE project_id = ? AND prompt_fingerprint = ?',
    projectId, fingerprint,
  );
  if (duplicate) {
    return res.status(409).json({ error: 'That has already been asked for', existingId: duplicate.id });
  }

  await db.run(`
    INSERT INTO generated_drafts
      (id, project_id, artifact_type, payload, status, model_provider, model_name,
       dashboard_task_id, prompt_fingerprint)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, id, projectId, artifactType, JSON.stringify(payload ?? {}), status,
  modelProvider, modelName, dashboardTaskId, fingerprint);

  const row = await db.get('SELECT * FROM generated_drafts WHERE id = ?', id);
  return res.status(201).json(toArtifact(row));
});

router.get('/', async (req, res) => {
  const { projectId, status } = req.query;
  if (status && !STATUSES.has(String(status))) {
    return res.status(400).json({ error: 'Invalid draft status' });
  }

  const clauses = [];
  const params = [];
  if (projectId) {
    clauses.push('project_id = ?');
    params.push(String(projectId));
  }
  if (status) {
    clauses.push('status = ?');
    params.push(String(status));
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = await db.all(`
    SELECT *
    FROM generated_drafts
    ${where}
    ORDER BY created_at DESC
  `, ...params);

  return res.json(rows.map(toArtifact));
});

router.get('/:id', async (req, res) => {
  const row = await db.get('SELECT * FROM generated_drafts WHERE id = ?', req.params.id);
  if (!row) return res.status(404).json({ error: 'Generated draft not found' });
  return res.json(toArtifact(row));
});

router.patch('/:id', async (req, res) => {
  const { status, payload } = req.body ?? {};
  if (status !== undefined && !STATUSES.has(String(status))) {
    return res.status(400).json({ error: 'Invalid draft status' });
  }
  // A request and its answer are one row, so answering is a payload write and
  // must not need a status change to carry it: the draft stays 'generated'
  // until a person accepts or rejects what is in it.
  if (status === undefined && payload === undefined) {
    return res.status(400).json({ error: 'nothing to change: send status, payload, or both' });
  }

  const result = await db.run(`
    UPDATE generated_drafts
    SET status = COALESCE(?, status),
        payload = COALESCE(?, payload),
        updated_at = now()
    WHERE id = ?
  `, status === undefined ? null : String(status),
  payload === undefined ? null : JSON.stringify(payload),
  req.params.id);

  if (result.changes === 0) return res.status(404).json({ error: 'Generated draft not found' });

  const row = await db.get('SELECT * FROM generated_drafts WHERE id = ?', req.params.id);
  return res.json(toArtifact(row));
});

router.post('/:id/promote', async (req, res) => {
  try {
    const result = await promoteDraftToCanon(req.params.id, {
      db,
      force: req.body?.force === true,
    });
    return res.json(result);
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({
      error: error.message,
      promotedAt: error.promotedAt,
    });
  }
});

export default router;
