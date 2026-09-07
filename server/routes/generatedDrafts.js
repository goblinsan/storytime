import { createHash, randomUUID } from 'node:crypto';
import { Router } from 'express';
import db from '../db.js';
import { env } from '../env.js';
import {
  CANON_REQUEST, agentEnabled, buildPrompt, checkAnswer, extractJson, runAgent,
} from '../canonAgent.js';
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
/**
 * Tell whoever is listening that something was asked for.
 *
 * The button in the record files a row and stops there, which is honest but
 * inert: somebody has to come and look. This is the seam where that changes.
 * Point CONTESORA_CANON_REQUEST_WEBHOOK at anything that can receive a POST --
 * a dashboard task filer, a notifier, an agent runner -- and it is handed the
 * draft as it was stored.
 *
 * A webhook rather than a client for one particular system, because the app
 * should not know which agent is answering, and the answer comes back through
 * the API like any other. Deliberately fire-and-forget: a request that failed
 * to save because a notifier was down would be the app losing the user's work
 * over somebody else's outage.
 */
/**
 * Answer the request here, so the button is the whole interaction.
 *
 * It used to file a row and wait for somebody to remember to start a second
 * process, which is a poor answer to "I clicked it and nothing happened". The
 * work is still bounded and still only produces a draft, so the thing that
 * changed is who has to be running, not what is allowed to happen.
 *
 * Detached from the response on purpose: the request is filed the moment it is
 * asked for, and a model taking a minute must not be a minute the button
 * spends spinning. Failures are logged and the request stays open, which is
 * what the app already shows as "asked for, nothing drafted yet".
 */
async function answerCanonRequest(draft) {
  if (draft.artifactType !== CANON_REQUEST || !agentEnabled()) return;
  const characterId = draft.payload?.characterId;
  const fields = draft.payload?.fields ?? [];
  if (!characterId || !fields.length) return;

  try {
    // Every canon field, not only the ones that describe them: a request to
    // revise `motivation` needs the motivation that is already there, or the
    // agent writes a replacement from scratch and calls it an edit.
    const character = await db.get(`
      SELECT id, name, role, background, description, location,
             motivation, tendencies, traits, core_skills as "coreSkills",
             special_abilities as "specialAbilities", notable_moments as "notableMoments",
             active_timeframe_start as "activeTimeframeStart",
             active_timeframe_end as "activeTimeframeEnd",
             active_timeframe_open as "activeTimeframeOpen"
      FROM characters WHERE id = ?
    `, characterId);
    if (!character) return;

    const related = await db.all(`
      SELECT source_entity_id as "sourceEntityId", target_entity_id as "targetEntityId",
             relationship_type as "relationshipType"
      FROM canon_relationships
      WHERE project_id = ? AND (source_entity_id = ? OR target_entity_id = ?)
    `, draft.projectId, characterId, characterId);
    const names = new Map((await db.all(
      'SELECT id, name FROM characters WHERE project_id = ?', draft.projectId,
    )).map((c) => [c.id, c.name]));
    const ties = related.map((r) => {
      const other = r.sourceEntityId === characterId ? r.targetEntityId : r.sourceEntityId;
      return `${r.relationshipType} ${names.get(other) ?? other}`;
    });

    // The latest year anything is recorded happening, so the agent can place
    // itself in time rather than guessing how long ago something was.
    const latest = await db.get(`
      SELECT MAX(active_timeframe_start) AS year FROM characters WHERE project_id = ?
    `, draft.projectId);
    const { asked, prompt } = buildPrompt({
      character,
      ties,
      fields,
      present: latest?.year ?? null,
      previous: draft.payload?.previous,
      note: draft.payload?.note,
    });
    if (!asked.length) return;
    console.log(`canon agent: drafting ${asked.join(', ')} for ${character.name}`);
    const proposed = checkAnswer(extractJson(await runAgent(prompt)), asked);

    await db.run(`
      UPDATE generated_drafts SET payload = ?, updated_at = now()
      WHERE id = ? AND status = 'generated'
    `, JSON.stringify({ ...draft.payload, proposed }), draft.id);
    console.log(`canon agent: drafted ${Object.keys(proposed).join(', ')} for ${character.name}`);
  } catch (error) {
    console.warn(`canon agent: ${error.message}`);
  }
}

function announce(draft) {
  void answerCanonRequest(draft);
  const url = env('CANON_REQUEST_WEBHOOK');
  if (!url) return;
  const body = JSON.stringify({ event: 'draft.created', draft });
  fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body })
    .then((res) => {
      if (!res.ok) console.warn(`canon request webhook ${url} answered ${res.status}`);
    })
    .catch((error) => console.warn(`canon request webhook ${url} failed: ${error.message}`));
}

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
  // Rejected rows are excluded, matching the unique index in migration 008.
  // Without that, turning something down would make it impossible to ask for
  // again -- and the refusal is a 409 the button has no way to show.
  const duplicate = await db.get(
    `SELECT id FROM generated_drafts
     WHERE project_id = ? AND prompt_fingerprint = ? AND status <> 'rejected'`,
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
  const created = toArtifact(row);
  announce(created);
  return res.status(201).json(created);
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
  const artifact = toArtifact(row);
  // A draft sent back for revision has its answer cleared and a note added, so
  // it is an open request again and wants answering the same way a new one
  // does. Without this, "ask for a revision" would file the direction and wait
  // for somebody to notice it.
  if (artifact.status === 'generated' && !artifact.payload?.proposed && artifact.payload?.note) {
    announce(artifact);
  }
  return res.json(artifact);
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
