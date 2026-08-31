import { Router } from 'express';
import db from '../db.js';

const router = Router();
const STATUSES = new Set(['generated', 'accepted', 'rejected']);

function toArtifact(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    artifactType: row.artifact_type,
    payload: row.payload,
    status: row.status,
    dashboardProjectId: row.dashboard_project_id,
    dashboardTaskId: row.dashboard_task_id,
    dashboardRunId: row.dashboard_run_id,
    modelProvider: row.model_provider,
    modelName: row.model_name,
    promptFingerprint: row.prompt_fingerprint,
    gateResult: row.gate_result,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

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
  const { status } = req.body ?? {};
  if (!STATUSES.has(String(status))) {
    return res.status(400).json({ error: 'Invalid draft status' });
  }

  const result = await db.run(`
    UPDATE generated_drafts
    SET status = ?, updated_at = now()
    WHERE id = ?
  `, String(status), req.params.id);

  if (result.changes === 0) return res.status(404).json({ error: 'Generated draft not found' });

  const row = await db.get('SELECT * FROM generated_drafts WHERE id = ?', req.params.id);
  return res.json(toArtifact(row));
});

export default router;
