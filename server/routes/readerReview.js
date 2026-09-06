import { Router } from 'express';
import { createHash, randomUUID } from 'crypto';
import db from '../db.js';

const router = Router();

const ANNOTATION_KINDS = new Set(['note', 'concern', 'agent_review', 'inline_flag']);
const sha256 = (text) => createHash('sha256').update(text).digest('hex');

function asJson(value, fallback) {
  if (value && typeof value === 'object') return value;
  if (typeof value !== 'string' || !value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

/**
 * A proposal is stale when the prose it was written against has changed since.
 * Applying a stale proposal would overwrite text nobody reviewed, so the check
 * is a hash comparison, not a timestamp: an edit-and-revert leaves the passage
 * appliable, and a whitespace-only edit does not.
 */
function currentPassage(content, startOffset, endOffset) {
  return String(content ?? '').slice(startOffset, endOffset);
}

/** GET /reader-review/:workId/annotations */
router.get('/:workId/annotations', async (req, res) => {
  const rows = await db.all(`
    SELECT id, project_id AS "universeId", derivative_id AS "workId",
           section_id AS "sectionId", start_offset AS "startOffset", end_offset AS "endOffset",
           selected_text AS "selectedText", text_sha256 AS "textSha256",
           kind, note, author, status, created_at AS "createdAt", updated_at AS "updatedAt"
    FROM reader_annotations
    WHERE derivative_id = ? AND status <> 'discarded'
    ORDER BY start_offset ASC
  `, req.params.workId);
  res.json(rows);
});

/** POST /reader-review/:workId/annotations */
router.post('/:workId/annotations', async (req, res) => {
  const {
    sectionId, startOffset, endOffset, selectedText,
    kind = 'note', note = null, author = null,
  } = req.body ?? {};

  if (!sectionId || typeof selectedText !== 'string' || !selectedText) {
    return res.status(400).json({ error: 'sectionId and selectedText are required.' });
  }
  if (!Number.isInteger(startOffset) || !Number.isInteger(endOffset) || endOffset <= startOffset || startOffset < 0) {
    return res.status(400).json({ error: 'startOffset and endOffset must be a valid forward range.' });
  }
  if (!ANNOTATION_KINDS.has(kind)) {
    return res.status(400).json({ error: `Invalid kind '${kind}'. Allowed: ${[...ANNOTATION_KINDS].join(', ')}.` });
  }

  const work = await db.get(
    'SELECT id, project_id AS "projectId" FROM derivative_works WHERE id = ?', req.params.workId,
  );
  if (!work) return res.status(404).json({ error: 'Work not found' });

  const id = randomUUID();
  await db.run(`
    INSERT INTO reader_annotations
      (id, project_id, derivative_id, section_id, start_offset, end_offset,
       selected_text, text_sha256, kind, note, author)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, id, work.projectId, work.id, sectionId, startOffset, endOffset,
  selectedText, sha256(selectedText), kind, note, author);

  const row = await db.get('SELECT * FROM reader_annotations WHERE id = ?', id);
  res.status(201).json(row);
});

/** PATCH /reader-review/annotations/:id - resolve or discard. */
router.patch('/annotations/:id', async (req, res) => {
  const { status, note } = req.body ?? {};
  if (status !== undefined && !['active', 'resolved', 'discarded'].includes(status)) {
    return res.status(400).json({ error: `Invalid status '${status}'.` });
  }

  const existing = await db.get('SELECT id FROM reader_annotations WHERE id = ?', req.params.id);
  if (!existing) return res.status(404).json({ error: 'Annotation not found' });

  await db.run(`
    UPDATE reader_annotations
    SET status = COALESCE(?, status), note = COALESCE(?, note), updated_at = now()
    WHERE id = ?
  `, status ?? null, note ?? null, req.params.id);

  res.json(await db.get('SELECT * FROM reader_annotations WHERE id = ?', req.params.id));
});

/**
 * GET /reader-review/:workId/sections/:sectionId/context
 *
 * The machine-readable manifest an external editorial agent needs: the prose,
 * plus the canon scoped to the universe it belongs to and the guardrails that
 * constrain what may be proposed.
 */
router.get('/:workId/sections/:sectionId/context', async (req, res) => {
  const work = await db.get(`
    SELECT id, project_id AS "projectId", title, type, status, content
    FROM derivative_works WHERE id = ?
  `, req.params.workId);
  if (!work) return res.status(404).json({ error: 'Work not found' });

  const universe = await db.get(`
    SELECT id, title, description, persistent_goal AS "persistentGoal",
           temporary_focus AS "temporaryFocus", guardrails, autonomy_mode AS "autonomyMode"
    FROM stories WHERE id = ?
  `, work.projectId);

  const [characters, locations, factions, timelineEvents] = await Promise.all([
    db.all('SELECT id, name, description, role FROM characters WHERE project_id = ? ORDER BY name', work.projectId),
    db.all('SELECT id, name, description FROM locations WHERE project_id = ? ORDER BY name', work.projectId),
    db.all('SELECT id, name, description FROM factions WHERE project_id = ? ORDER BY name', work.projectId),
    db.all('SELECT id, title, date, description FROM timeline_events WHERE project_id = ? ORDER BY date', work.projectId),
  ]);

  res.json({
    work: { id: work.id, title: work.title, type: work.type, status: work.status },
    section: { id: req.params.sectionId, prose: work.content ?? '' },
    universe: {
      id: universe?.id,
      title: universe?.title,
      description: universe?.description ?? '',
      persistentGoal: universe?.persistentGoal ?? '',
      temporaryFocus: universe?.temporaryFocus ?? '',
      autonomyMode: universe?.autonomyMode ?? 'assisted',
    },
    guardrails: asJson(universe?.guardrails, []),
    canon: { characters, locations, factions, timelineEvents },
  });
});

/** GET /reader-review/:workId/repairs */
router.get('/:workId/repairs', async (req, res) => {
  const work = await db.get('SELECT id, content FROM derivative_works WHERE id = ?', req.params.workId);
  if (!work) return res.status(404).json({ error: 'Work not found' });

  const rows = await db.all(`
    SELECT id, project_id AS "universeId", derivative_id AS "workId", section_id AS "sectionId",
           start_offset AS "startOffset", end_offset AS "endOffset",
           original_text AS "originalText", original_text_sha256 AS "originalTextSha256",
           replacement_text AS "replacementText", rationale, cited_canon_ids AS "citedCanonIds",
           validation, status, requires_explicit_approval AS "requiresExplicitApproval",
           dashboard_task_id AS "dashboardTaskId", proposed_by AS "proposedBy",
           approved_at AS "approvedAt", applied_at AS "appliedAt",
           created_at AS "createdAt", updated_at AS "updatedAt"
    FROM repair_proposals
    WHERE derivative_id = ?
    ORDER BY created_at DESC
  `, req.params.workId);

  res.json(rows.map((row) => ({
    ...row,
    citedCanonIds: asJson(row.citedCanonIds, []),
    validation: asJson(row.validation, []),
    // Computed, never stored: the prose can change without anything touching
    // the proposal row, so staleness has to be evaluated on read.
    isStale: sha256(currentPassage(work.content, row.startOffset, row.endOffset)) !== row.originalTextSha256,
  })));
});

/** POST /reader-review/:workId/repairs - record a proposal for review. */
router.post('/:workId/repairs', async (req, res) => {
  const {
    sectionId, startOffset, endOffset, replacementText,
    rationale = null, citedCanonIds = [], validation = [],
    dashboardTaskId = null, proposedBy = null, sourceAnnotationId = null,
  } = req.body ?? {};

  if (!sectionId || typeof replacementText !== 'string' || !replacementText) {
    return res.status(400).json({ error: 'sectionId and replacementText are required.' });
  }
  if (!Number.isInteger(startOffset) || !Number.isInteger(endOffset) || endOffset <= startOffset || startOffset < 0) {
    return res.status(400).json({ error: 'startOffset and endOffset must be a valid forward range.' });
  }

  const work = await db.get(
    'SELECT id, project_id AS "projectId", content FROM derivative_works WHERE id = ?', req.params.workId,
  );
  if (!work) return res.status(404).json({ error: 'Work not found' });

  const originalText = currentPassage(work.content, startOffset, endOffset);
  if (!originalText) {
    return res.status(400).json({ error: 'The locator does not address any text in this work.' });
  }
  if (originalText === replacementText) {
    return res.status(400).json({ error: 'The replacement is identical to the passage it replaces.' });
  }

  const id = randomUUID();
  await db.run(`
    INSERT INTO repair_proposals
      (id, project_id, derivative_id, section_id, start_offset, end_offset,
       original_text, original_text_sha256, replacement_text, replacement_text_sha256,
       rationale, cited_canon_ids, validation, status,
       dashboard_task_id, proposed_by, source_annotation_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ready', ?, ?, ?)
  `, id, work.projectId, work.id, sectionId, startOffset, endOffset,
  originalText, sha256(originalText), replacementText, sha256(replacementText),
  rationale, JSON.stringify(citedCanonIds), JSON.stringify(validation),
  dashboardTaskId, proposedBy, sourceAnnotationId);

  res.status(201).json(await db.get('SELECT * FROM repair_proposals WHERE id = ?', id));
});

/**
 * POST /reader-review/repairs/:id/approve
 *
 * The only path that writes prose. It re-reads the passage and refuses if the
 * hash no longer matches, so approving a proposal that was made against text
 * somebody has since edited cannot silently discard their edit.
 */
router.post('/repairs/:id/approve', async (req, res) => {
  const proposal = await db.get('SELECT * FROM repair_proposals WHERE id = ?', req.params.id);
  if (!proposal) return res.status(404).json({ error: 'Proposal not found' });
  if (proposal.status === 'applied') {
    return res.status(409).json({ error: 'This proposal has already been applied.' });
  }
  if (proposal.status === 'rejected') {
    return res.status(409).json({ error: 'This proposal was rejected.' });
  }

  const work = await db.get('SELECT id, content FROM derivative_works WHERE id = ?', proposal.derivative_id);
  if (!work) return res.status(404).json({ error: 'Work not found' });

  const content = String(work.content ?? '');
  const current = content.slice(proposal.start_offset, proposal.end_offset);

  if (sha256(current) !== proposal.original_text_sha256) {
    await db.run(`UPDATE repair_proposals SET status = 'stale', updated_at = now() WHERE id = ?`, proposal.id);
    return res.status(409).json({
      error: 'The passage changed after this proposal was made, so applying it would discard an edit nobody reviewed.',
      status: 'stale',
    });
  }

  const updated = content.slice(0, proposal.start_offset)
    + proposal.replacement_text
    + content.slice(proposal.end_offset);

  await db.run(
    'UPDATE derivative_works SET content = ?, updated_at = now() WHERE id = ?',
    updated, work.id,
  );
  await db.run(`
    UPDATE repair_proposals
    SET status = 'applied', approved_by = ?, approved_at = now(), applied_at = now(), updated_at = now()
    WHERE id = ?
  `, req.body?.approvedBy ?? null, proposal.id);

  res.json({
    status: 'applied',
    proposal: await db.get('SELECT * FROM repair_proposals WHERE id = ?', proposal.id),
  });
});

/** POST /reader-review/repairs/:id/reject */
router.post('/repairs/:id/reject', async (req, res) => {
  const proposal = await db.get('SELECT id, status FROM repair_proposals WHERE id = ?', req.params.id);
  if (!proposal) return res.status(404).json({ error: 'Proposal not found' });
  if (proposal.status === 'applied') {
    return res.status(409).json({ error: 'This proposal has already been applied.' });
  }

  await db.run(`
    UPDATE repair_proposals
    SET status = 'rejected', rejected_reason = ?, updated_at = now()
    WHERE id = ?
  `, req.body?.reason ?? null, req.params.id);

  res.json(await db.get('SELECT * FROM repair_proposals WHERE id = ?', req.params.id));
});

export default router;
