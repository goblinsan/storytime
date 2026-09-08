import { Router } from 'express';
import { randomUUID } from 'crypto';
import db from '../db.js';
import { keepImage } from '../mediaStore.js';

const router = Router();

const KINDS = new Set(['reference', 'generated', 'panel', 'cover', 'map']);
const SUBJECT_TYPES = new Set(['character', 'location', 'item', 'faction_crest', 'creature']);

function asJson(value, fallback) {
  if (value && typeof value === 'object') return value;
  if (typeof value !== 'string' || !value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

const shape = (row) => ({
  id: row.id,
  universeId: row.projectId,
  url: row.url,
  kind: row.kind,
  title: row.title ?? '',
  caption: row.caption ?? '',
  subject: row.subjectType ? { type: row.subjectType, id: row.subjectId } : null,
  observableTraits: asJson(row.observableTraits, []),
  inferredTraits: asJson(row.inferredTraits, []),
  uncertainties: asJson(row.uncertainties, []),
  visualDescription: row.visualDescription ?? '',
  descriptionStatus: row.descriptionStatus,
  dashboardTaskId: row.dashboardTaskId ?? null,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const SELECT = `
  SELECT id, project_id AS "projectId", url, kind, title, caption,
         subject_type AS "subjectType", subject_id AS "subjectId",
         observable_traits AS "observableTraits", inferred_traits AS "inferredTraits",
         uncertainties, visual_description AS "visualDescription",
         description_status AS "descriptionStatus", dashboard_task_id AS "dashboardTaskId",
         created_at AS "createdAt", updated_at AS "updatedAt"
  FROM media_assets
`;

/** GET /media?projectId=... */
router.get('/', async (req, res) => {
  const { projectId, kind } = req.query;
  if (!projectId) return res.status(400).json({ error: 'projectId is required' });

  const params = [projectId];
  let sql = `${SELECT} WHERE project_id = ?`;
  if (kind) {
    sql += ' AND kind = ?';
    params.push(kind);
  }
  sql += ' ORDER BY updated_at DESC';

  const rows = await db.all(sql, ...params);
  res.json(rows.map(shape));
});

/**
 * POST /media - catalog an asset.
 *
 * `adopt: true` says the URL is somewhere temporary and the picture should be
 * copied onto storage before it is written down. That is what accepting a
 * generated preview does: the URL it arrives with points into a render
 * machine's output folder, which is cleared, and whose filenames start again
 * from one when it is. Cataloguing that URL records a promise nobody kept.
 *
 * Adoption is asked for rather than assumed, because most assets cataloged
 * here already live somewhere permanent and re-hosting them would be wrong.
 */
router.post('/', async (req, res) => {
  const {
    projectId, url, kind = 'reference', title = null, caption = null, subject = null,
    adopt = false,
  } = req.body ?? {};

  if (!projectId || typeof url !== 'string' || !url.trim()) {
    return res.status(400).json({ error: 'projectId and url are required.' });
  }
  if (!KINDS.has(kind)) {
    return res.status(400).json({ error: `Invalid kind '${kind}'. Allowed: ${[...KINDS].join(', ')}.` });
  }
  if (subject && !SUBJECT_TYPES.has(subject.type)) {
    return res.status(400).json({ error: `Invalid subject type '${subject?.type}'.` });
  }

  const universe = await db.get('SELECT id FROM stories WHERE id = ?', projectId);
  if (!universe) return res.status(404).json({ error: 'Universe not found' });

  // Copy first, then write the row, so a cataloged asset always points at
  // something that is really there. The other order leaves a row pointing at a
  // file that was never written when the copy fails.
  let kept = { stored: false, url: url.trim(), detail: '' };
  if (adopt) {
    try {
      kept = await keepImage(url.trim());
    } catch (error) {
      return res.status(502).json({ error: `Could not copy that image to storage: ${error.message}` });
    }
  }

  const id = randomUUID();
  await db.run(`
    INSERT INTO media_assets (id, project_id, url, kind, title, caption, subject_type, subject_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, id, projectId, kept.url, kind, title, caption,
  subject?.type ?? null, subject?.id ?? null);

  const row = await db.get(`${SELECT} WHERE id = ?`, id);
  // `stored` and `storage` are about this request, not about the row, so they
  // sit beside the asset rather than inside it: a reader should be able to tell
  // that a copy happened -- or that it could not -- without inferring it from
  // the shape of a URL.
  res.status(201).json({ ...shape(row), stored: kept.stored, storage: kept.detail });
});

/**
 * POST /media/:id/describe - request a visual description.
 *
 * Records the request and the dashboard task that will fulfil it. It does not
 * write a description: that arrives from a visual_description_from_image job
 * whose output the consistency gate has already validated.
 */
router.post('/:id/describe', async (req, res) => {
  const asset = await db.get('SELECT id, description_status FROM media_assets WHERE id = ?', req.params.id);
  if (!asset) return res.status(404).json({ error: 'Asset not found' });

  await db.run(`
    UPDATE media_assets
    SET description_status = 'requested', dashboard_task_id = ?, updated_at = now()
    WHERE id = ?
  `, req.body?.dashboardTaskId ?? null, req.params.id);

  res.status(202).json(shape(await db.get(`${SELECT} WHERE id = ?`, req.params.id)));
});

/** PATCH /media/:id - record a completed description, or accept one. */
router.patch('/:id', async (req, res) => {
  const {
    observableTraits, inferredTraits, uncertainties, visualDescription, descriptionStatus, caption,
  } = req.body ?? {};

  if (descriptionStatus !== undefined
    && !['none', 'requested', 'ready', 'accepted'].includes(descriptionStatus)) {
    return res.status(400).json({ error: `Invalid descriptionStatus '${descriptionStatus}'.` });
  }
  for (const [name, value] of [
    ['observableTraits', observableTraits],
    ['inferredTraits', inferredTraits],
    ['uncertainties', uncertainties],
  ]) {
    if (value !== undefined && !Array.isArray(value)) {
      return res.status(400).json({ error: `${name} must be an array of strings.` });
    }
  }

  // The one invariant this table exists to hold: a trait cannot be both seen
  // and guessed, because the whole point is that a reader can tell them apart.
  const seen = (observableTraits ?? []).map((t) => String(t).trim().toLowerCase());
  const guessed = (inferredTraits ?? []).map((t) => String(t).trim().toLowerCase());
  const overlap = seen.filter((t) => guessed.includes(t));
  if (overlap.length > 0) {
    return res.status(400).json({
      error: `A trait cannot be both observable and inferred: ${[...new Set(overlap)].join(', ')}.`,
    });
  }

  const asset = await db.get('SELECT id FROM media_assets WHERE id = ?', req.params.id);
  if (!asset) return res.status(404).json({ error: 'Asset not found' });

  await db.run(`
    UPDATE media_assets SET
      observable_traits = COALESCE(?, observable_traits),
      inferred_traits = COALESCE(?, inferred_traits),
      uncertainties = COALESCE(?, uncertainties),
      visual_description = COALESCE(?, visual_description),
      description_status = COALESCE(?, description_status),
      caption = COALESCE(?, caption),
      updated_at = now()
    WHERE id = ?
  `,
  observableTraits === undefined ? null : JSON.stringify(observableTraits),
  inferredTraits === undefined ? null : JSON.stringify(inferredTraits),
  uncertainties === undefined ? null : JSON.stringify(uncertainties),
  visualDescription ?? null,
  descriptionStatus ?? null,
  caption ?? null,
  req.params.id);

  res.json(shape(await db.get(`${SELECT} WHERE id = ?`, req.params.id)));
});

/** DELETE /media/:id */
router.delete('/:id', async (req, res) => {
  const { changes } = await db.run('DELETE FROM media_assets WHERE id = ?', req.params.id);
  if (!changes) return res.status(404).json({ error: 'Asset not found' });
  res.status(204).end();
});

export default router;
