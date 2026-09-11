import { Router } from 'express';
import { randomUUID } from 'crypto';
import db from '../db.js';
import { adoptActs, isLabeled, parseList } from '../arcActs.js';

const router = Router();

const ARC_COLUMNS = `
  id, project_id as "projectId", arc_number as "arcNumber", title, description,
  throughline, out_of_scope as "outOfScope", notes, details, is_protected as "isProtected"`;
const ACT_COLUMNS = `
  id, arc_id as "arcId", act_number as "actNumber", title, span, summary, beats`;

const shapeAct = (act) => ({ ...act, beats: parseList(act.beats) });

/** Arcs as the API returns them: lists parsed, and each with its acts in order. */
async function withActs(rows) {
  if (!rows.length) return [];
  const acts = await db.all(
    `SELECT ${ACT_COLUMNS} FROM arc_acts WHERE arc_id = ANY(?::text[]) ORDER BY act_number, created_at`,
    rows.map((r) => r.id),
  );
  const byArc = new Map();
  for (const act of acts) {
    if (!byArc.has(act.arcId)) byArc.set(act.arcId, []);
    byArc.get(act.arcId).push(shapeAct(act));
  }
  return rows.map((r) => ({
    ...r,
    throughline: r.throughline ?? '',
    outOfScope: parseList(r.outOfScope),
    notes: parseList(r.notes),
    details: parseList(r.details),
    isProtected: Boolean(r.isProtected),
    acts: byArc.get(r.id) ?? [],
  }));
}

/**
 * Read arcs, splitting any that still hold acts as labeled lines first. The
 * split happens once per arc; after it, `details` holds no labels and this is
 * one parse and no write.
 *
 * Read again after ANY split, including one another request won. The page asks
 * for the list and the open arc together, so two reads race to split the same
 * arc; the loser writes nothing, and returning the rows it had already read
 * handed back the old labeled list alongside the new acts -- 29 beats where
 * there were 13.
 */
async function readArcs(where, ...params) {
  const sql = `SELECT ${ARC_COLUMNS} FROM story_arcs WHERE ${where} ORDER BY arc_number ASC`;
  let rows = await db.all(sql, ...params);
  let split = false;
  for (const row of rows) {
    if (!isLabeled(parseList(row.details))) continue;
    await adoptActs(db, row);
    split = true;
  }
  if (split) rows = await db.all(sql, ...params);
  return withActs(rows);
}

// List arcs for a project
router.get('/', async (req, res) => {
  const { projectId } = req.query;
  if (!projectId) {
    return res.status(400).json({ error: 'projectId query parameter is required' });
  }
  return res.json(await readArcs('project_id = ?', projectId));
});

// Get a single arc
router.get('/:id', async (req, res) => {
  const [arc] = await readArcs('id = ?', req.params.id);
  if (!arc) {
    return res.status(404).json({ error: 'Arc not found' });
  }
  return res.json(arc);
});

// Create an arc
router.post('/', async (req, res) => {
  const { projectId, arcNumber = 0, title = '', description = '', details = [], isProtected = false } = req.body;

  if (!projectId) {
    return res.status(400).json({ error: 'projectId is required' });
  }

  const project = await db.get('SELECT id FROM stories WHERE id = ?', projectId);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  // Auto-assign next arc number if 0
  let finalArcNumber = arcNumber;
  if (finalArcNumber === 0) {
    const max = await db.get('SELECT MAX(arc_number) as m FROM story_arcs WHERE project_id = ?', projectId);
    finalArcNumber = (max?.m || 0) + 1;
  }

  const id = randomUUID();
  const now = new Date().toISOString();

  await db.run(`
    INSERT INTO story_arcs (id, project_id, arc_number, title, description, details, is_protected, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, id, projectId, finalArcNumber, title, description, JSON.stringify(details), Boolean(isProtected), now, now);

  return res.status(201).json({
    id, projectId, arcNumber: finalArcNumber, title, description, details,
    throughline: '', outOfScope: [], notes: [], acts: [], isProtected: Boolean(isProtected),
  });
});

async function updateArc(req, res) {
  const existing = await db.get('SELECT id FROM story_arcs WHERE id = ?', req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Arc not found' });
  }

  const {
    arcNumber, title, description, details, isProtected, throughline, outOfScope, notes,
  } = req.body;
  const list = (v) => (v != null ? JSON.stringify(v) : null);
  const now = new Date().toISOString();

  await db.run(`
    UPDATE story_arcs SET
      arc_number = COALESCE(?, arc_number),
      title = COALESCE(?, title),
      description = COALESCE(?, description),
      details = COALESCE(?, details),
      is_protected = COALESCE(?, is_protected),
      throughline = COALESCE(?, throughline),
      out_of_scope = COALESCE(?, out_of_scope),
      notes = COALESCE(?, notes),
      updated_at = ?
    WHERE id = ?
  `,
    arcNumber, title, description, list(details),
    isProtected != null ? Boolean(isProtected) : null,
    throughline ?? null, list(outOfScope), list(notes),
    now, req.params.id,
  );

  const [arc] = await readArcs('id = ?', req.params.id);
  return res.json(arc);
}

// Update an arc: PUT and PATCH both leave out what was not sent.
router.put('/:id', updateArc);
router.patch('/:id', updateArc);

// Add an act, numbered after the arc's last one.
router.post('/:id/acts', async (req, res) => {
  const arc = await db.get('SELECT id FROM story_arcs WHERE id = ?', req.params.id);
  if (!arc) {
    return res.status(404).json({ error: 'Arc not found' });
  }
  const { title = '', span = '', summary = '', beats = [] } = req.body ?? {};
  const last = await db.get('SELECT MAX(act_number) AS m FROM arc_acts WHERE arc_id = ?', arc.id);
  const id = randomUUID();
  const now = new Date().toISOString();
  await db.run(`
    INSERT INTO arc_acts (id, arc_id, act_number, title, span, summary, beats, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, id, arc.id, (last?.m ?? 0) + 1, String(title).trim(), span, summary, JSON.stringify(beats), now, now);
  const act = await db.get(`SELECT ${ACT_COLUMNS} FROM arc_acts WHERE id = ?`, id);
  return res.status(201).json(shapeAct(act));
});

// Change an act. What was not sent is left alone.
router.patch('/acts/:actId', async (req, res) => {
  const existing = await db.get('SELECT id FROM arc_acts WHERE id = ?', req.params.actId);
  if (!existing) {
    return res.status(404).json({ error: 'Act not found' });
  }
  const {
    actNumber, title, span, summary, beats,
  } = req.body ?? {};
  await db.run(`
    UPDATE arc_acts SET
      act_number = COALESCE(?, act_number),
      title = COALESCE(?, title),
      span = COALESCE(?, span),
      summary = COALESCE(?, summary),
      beats = COALESCE(?, beats),
      updated_at = ?
    WHERE id = ?
  `,
    actNumber ?? null, title ?? null, span ?? null, summary ?? null,
    beats != null ? JSON.stringify(beats) : null,
    new Date().toISOString(), req.params.actId,
  );
  const act = await db.get(`SELECT ${ACT_COLUMNS} FROM arc_acts WHERE id = ?`, req.params.actId);
  return res.json(shapeAct(act));
});

// Delete an arc
router.delete('/:id', async (req, res) => {
  const result = await db.run('DELETE FROM story_arcs WHERE id = ?', req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Arc not found' });
  }
  return res.json({ success: true });
});

export default router;
