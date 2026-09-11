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

/**
 * A technology as the surface reads it: the record, plus the two edges that
 * make the list sortable by something other than its own name.
 *
 * Where it came from and who holds it are joined here rather than sent as bare
 * ids, because sorting by "location" means sorting by the PLACE'S NAME and the
 * client would otherwise need the whole gazetteer to order five rows.
 */
const SURFACE_SELECT = `
  SELECT t.id, t.project_id AS "projectId", t.name, t.description, t.principles,
         t.history, t.limitations, t.patents_or_taboos AS "patentsOrTaboos",
         t.proliferation, t.classification,
         t.origin_date AS "originDate", t.origin_year AS "originYear",
         t.origin_location_id AS "originLocationId", l.name AS "originLocationName",
         t.holder_faction_id AS "holderFactionId", f.name AS "holderFactionName",
         t.is_protected AS "isProtected"
  FROM technologies t
  LEFT JOIN locations l ON l.id = t.origin_location_id
  LEFT JOIN factions  f ON f.id = t.holder_faction_id
`;

router.get('/surface/index', async (req, res) => {
  const { projectId } = req.query;
  if (!projectId) return res.status(400).json({ error: 'projectId required' });

  const rows = await db.all(`${SURFACE_SELECT} WHERE t.project_id = ? ORDER BY t.name`, projectId);

  const drawn = await db.all(`
    SELECT subject_id AS "id", count(*)::int AS n FROM media_assets
    WHERE project_id = ? AND subject_type = 'technology' GROUP BY subject_id
  `, projectId).catch(() => []);
  const pictures = new Map(drawn.map((r) => [r.id, r.n]));

  return res.json({
    technologies: rows.map((r) => ({ ...r, pictureCount: pictures.get(r.id) ?? 0 })),
  });
});

router.get('/surface/:id', async (req, res) => {
  const technology = await db.get(`${SURFACE_SELECT} WHERE t.id = ?`, req.params.id);
  if (!technology) return res.status(404).json({ error: 'Technology not found' });

  const pictures = await db.all(`
    SELECT id, url, kind, title, caption FROM media_assets
    WHERE subject_type = 'technology' AND subject_id = ? ORDER BY created_at DESC
  `, req.params.id).catch(() => []);

  return res.json({ technology, pictures });
});

/**
 * Partial update, field by field.
 *
 * The PUT below takes a whole technology and is what the older client sends; a
 * surface saving one field at a time cannot use it without echoing back every
 * other field it happens to be holding, which is how one stale copy overwrites
 * somebody else's edit.
 *
 * Changing the date re-parses the year, because the two must not disagree: a
 * row saying "Year of the Iron Dirge 288" and sorting as 304 is worse than one
 * that does not sort at all.
 */
router.patch('/surface/:id', async (req, res) => {
  const existing = await db.get('SELECT id FROM technologies WHERE id = ?', req.params.id);
  if (!existing) return res.status(404).json({ error: 'Technology not found' });

  const {
    name, description, principles, history, limitations, patentsOrTaboos,
    proliferation, classification, originDate, originLocationId, holderFactionId,
  } = req.body ?? {};

  const year = originDate === undefined
    ? undefined
    : ((String(originDate).match(/(\d+)(?!.*\d)/) || [])[1] ?? null);

  await db.run(`
    UPDATE technologies SET
      name               = COALESCE(?, name),
      description        = COALESCE(?, description),
      principles         = COALESCE(?, principles),
      history            = COALESCE(?, history),
      limitations        = COALESCE(?, limitations),
      patents_or_taboos  = COALESCE(?, patents_or_taboos),
      proliferation      = COALESCE(?, proliferation),
      classification     = COALESCE(?, classification),
      origin_date        = COALESCE(?, origin_date),
      origin_year        = CASE WHEN ? THEN ? ELSE origin_year END,
      -- Null is a real value for these two: "nowhere recorded" and "nobody
      -- holds it" are answers, so COALESCE would make them unsettable.
      origin_location_id = CASE WHEN ? THEN ? ELSE origin_location_id END,
      holder_faction_id  = CASE WHEN ? THEN ? ELSE holder_faction_id END,
      updated_at         = ?
    WHERE id = ?
  `,
  name ?? null, description ?? null, principles ?? null, history ?? null,
  limitations ?? null, patentsOrTaboos ?? null, proliferation ?? null,
  classification ?? null, originDate ?? null,
  originDate !== undefined, year === null || year === undefined ? null : Number(year),
  originLocationId !== undefined, originLocationId || null,
  holderFactionId !== undefined, holderFactionId || null,
  new Date().toISOString(), req.params.id);

  return res.json(await db.get(`${SURFACE_SELECT} WHERE t.id = ?`, req.params.id));
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
