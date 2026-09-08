import { createHash, randomUUID } from 'node:crypto';
import { Router } from 'express';
import db from '../db.js';
import { env } from '../env.js';
import {
  CANON_REQUEST, agentEnabled, buildPrompt, checkAnswer, extractJson, runAgent,
} from '../canonAgent.js';
import { IMAGE_REQUEST, buildImagePrompt, generateWithComfy } from '../imageAgent.js';
import {
  SURVEY_REQUEST, buildSurveyPrompt, checkSurvey, surveyEnabled,
} from '../surveyAgent.js';
import { promoteDraftToCanon } from '../story-harness/promotion.js';
import { acceptIntoCanon, autonomyOf, mayAcceptUnread, mayAnswer } from '../autonomy.js';
import {
  DIRECTION_REQUEST, buildDirectionPrompt, checkDirection, directionEnabled,
} from '../directionAgent.js';

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

  const autonomy = await autonomyOf(draft.projectId);
  if (!mayAnswer(autonomy)) {
    // Manual: the request is filed and waits. Said out loud, because a draft
    // that never gets answered otherwise looks like something broke.
    console.log(`canon agent: ${draft.id} filed and waiting (autonomy is manual)`);
    return;
  }

  try {
    // Every canon field, not only the ones that describe them: a request to
    // revise `motivation` needs the motivation that is already there, or the
    // agent writes a replacement from scratch and calls it an edit.
    const character = await db.get(`
      SELECT id, name, role, background, description, appearance, location,
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
    // The universe's standing direction and guardrails, which the page that
    // collects them promises are read before anything is written.
    const universe = await db.get(`
      SELECT persistent_goal AS "persistentGoal", guardrails FROM stories WHERE id = ?
    `, draft.projectId);
    const direction = {
      persistentGoal: universe?.persistentGoal ?? '',
      guardrails: (() => {
        try {
          const parsed = typeof universe?.guardrails === 'string'
            ? JSON.parse(universe.guardrails) : universe?.guardrails;
          return Array.isArray(parsed) ? parsed : [];
        } catch { return []; }
      })(),
    };

    const { asked, prompt } = buildPrompt({
      character,
      ties,
      fields,
      present: latest?.year ?? null,
      previous: draft.payload?.previous,
      note: draft.payload?.note,
      direction,
    });
    if (!asked.length) return;
    console.log(`canon agent: drafting ${asked.join(', ')} for ${character.name}`);
    const proposed = checkAnswer(extractJson(await runAgent(prompt)), asked);

    await db.run(`
      UPDATE generated_drafts SET payload = ?, updated_at = now()
      WHERE id = ? AND status = 'generated'
    `, JSON.stringify({ ...draft.payload, proposed }), draft.id);
    console.log(`canon agent: drafted ${Object.keys(proposed).join(', ')} for ${character.name}`);

    if (mayAcceptUnread(autonomy)) {
      const written = await acceptIntoCanon(characterId, proposed);
      if (written.accepted) {
        await db.run(
          "UPDATE generated_drafts SET status = 'accepted', updated_at = now() WHERE id = ?",
          draft.id,
        );
        console.log(`canon agent: accepted into canon for ${character.name} (autonomy is autonomous)`);
      } else {
        // Left as a draft, which is the safe outcome and the one a protected
        // record is supposed to get.
        console.log(`canon agent: left as a draft for ${character.name} -- ${written.why}`);
      }
    }
  } catch (error) {
    console.warn(`canon agent: ${error.message}`);
  }
}

/**
 * Draw somebody, using the look the active work asked for.
 *
 * The same shape as answering a canon request: it fills the draft's `proposed`
 * and changes nothing about the character, so what arrives is previews to
 * choose between rather than a picture that has already been filed.
 *
 * The URLs point at the ComfyUI that made them. Temporary and known to be:
 * the files are in that server's output folder, and moving them to network
 * storage is the next piece. Nothing is written to the machine running this.
 */
async function answerImageRequest(draft) {
  if (draft.artifactType !== IMAGE_REQUEST) return;
  const characterId = draft.payload?.characterId;
  if (!characterId) return;

  try {
    const character = await db.get(`
      SELECT id, name, role, description, appearance, background FROM characters WHERE id = ?
    `, characterId);
    if (!character) return;

    const source = draft.payload.sourceId
      ? await db.get('SELECT * FROM image_sources WHERE id = ?', draft.payload.sourceId)
      : await db.get(
        'SELECT * FROM image_sources WHERE project_id = ? AND is_default ORDER BY updated_at DESC LIMIT 1',
        draft.projectId,
      );
    if (!source) throw new Error('no image source is configured for this universe');
    if (source.kind !== 'comfyui') throw new Error(`${source.kind} sources are not wired up yet`);

    // The look belongs to whatever the universe is currently being read
    // through, so a picture matches the book it is for.
    const work = await db.get(`
      SELECT d.image_style AS style, d.image_style_negative AS negative
      FROM stories s LEFT JOIN derivative_works d ON d.id = s.active_work_id
      WHERE s.id = ?
    `, draft.projectId);

    const { positive } = buildImagePrompt({
      character,
      style: work?.style ?? '',
      note: draft.payload.note,
    });
    const options = typeof source.options === 'string' ? JSON.parse(source.options) : (source.options ?? {});

    console.log(`image agent: drawing ${character.name}`);
    const images = await generateWithComfy({
      endpoint: source.endpoint,
      model: source.model,
      positive,
      negative: work?.negative ?? '',
      options,
      // A new seed each time, so asking again is a different picture rather
      // than the same one returned twice.
      seed: Math.floor(Math.random() * 1e15),
    });

    await db.run(`
      UPDATE generated_drafts SET payload = ?, updated_at = now()
      WHERE id = ? AND status = 'generated'
    `, JSON.stringify({ ...draft.payload, proposed: { images, prompt: positive } }), draft.id);
    console.log(`image agent: ${images.length} previews for ${character.name}`);
  } catch (error) {
    console.warn(`image agent: ${error.message}`);
  }
}

/**
 * What this universe has, and where it thins out.
 *
 * Counts alone say a dimension is empty; they do not say a dimension is
 * half-written, which is the more useful thing and the harder one to see from
 * a list. So each note below is a shape of incompleteness -- records that exist
 * but say almost nothing, works that were started, people nobody is connected
 * to -- gathered as a handful of numbers rather than as the canon itself.
 */
async function takeCensus(projectId, exceptDraftId = null) {
  const one = async (sql, ...args) => (await db.get(sql, ...args).catch(() => null))?.n ?? 0;

  const counts = [
    ['Characters', await one('SELECT count(*)::int AS n FROM characters WHERE project_id = ?', projectId)],
    ['Places', await one('SELECT count(*)::int AS n FROM locations WHERE project_id = ?', projectId)],
    ['Factions', await one('SELECT count(*)::int AS n FROM factions WHERE project_id = ?', projectId)],
    ['Events', await one('SELECT count(*)::int AS n FROM timeline_events WHERE project_id = ?', projectId)],
    ['Creatures', await one('SELECT count(*)::int AS n FROM bestiary WHERE project_id = ?', projectId)],
    ['Technologies', await one('SELECT count(*)::int AS n FROM technologies WHERE project_id = ?', projectId)],
    ['Works', await one('SELECT count(*)::int AS n FROM derivative_works WHERE project_id = ?', projectId)],
    ['Relationships', await one('SELECT count(*)::int AS n FROM canon_relationships WHERE project_id = ?', projectId)],
    ['Reference images', await one('SELECT count(*)::int AS n FROM media_assets WHERE project_id = ?', projectId)],
  ];

  const notes = [];

  // A character with a name and nothing else is a placeholder, and there is a
  // real difference between "no characters" and "eleven names".
  const bare = await one(`
    SELECT count(*)::int AS n FROM characters
    WHERE project_id = ? AND length(trim(coalesce(background, ''))) < 40
      AND length(trim(coalesce(description, ''))) < 40
  `, projectId);
  if (bare) notes.push(`${bare} characters have almost no history or bearing written.`);

  const faceless = await one(`
    SELECT count(*)::int AS n FROM characters
    WHERE project_id = ? AND length(trim(coalesce(appearance, ''))) = 0
  `, projectId);
  if (faceless) notes.push(`${faceless} characters have no appearance recorded, so they cannot be drawn from it.`);

  const thinPlaces = await one(`
    SELECT count(*)::int AS n FROM locations
    WHERE project_id = ? AND length(trim(coalesce(description, ''))) < 40
  `, projectId);
  if (thinPlaces) notes.push(`${thinPlaces} places are named but barely described.`);

  const unplaced = await one(`
    SELECT count(*)::int AS n FROM locations
    WHERE project_id = ? AND coordinates_x IS NULL
  `, projectId);
  if (unplaced) notes.push(`${unplaced} places are not positioned on the map.`);

  const lonely = await one(`
    SELECT count(*)::int AS n FROM characters c WHERE c.project_id = ?
      AND NOT EXISTS (
        SELECT 1 FROM canon_relationships r
        WHERE r.project_id = c.project_id
          AND (r.source_entity_id = c.id OR r.target_entity_id = c.id))
  `, projectId);
  if (lonely) notes.push(`${lonely} characters are connected to nobody.`);

  const works = await db.all(`
    SELECT title, status, length(trim(coalesce(content, ''))) AS len
    FROM derivative_works WHERE project_id = ? ORDER BY updated_at DESC LIMIT 8
  `, projectId).catch(() => []);
  for (const w of works) {
    notes.push(`Work "${w.title}" is ${w.status} and holds ${w.len} characters of text.`);
  }

  // Not this survey, and not other surveys. The first run reported "one draft
  // is waiting" and pointed the reader at nothing: the only open draft was the
  // request being answered. A survey is advice, never something to review, so
  // counting one as work to do is wrong twice over.
  const openDrafts = await one(`
    SELECT count(*)::int AS n FROM generated_drafts
    WHERE project_id = ? AND status = 'generated'
      AND artifact_type <> ? AND id <> COALESCE(?, '')
  `, projectId, SURVEY_REQUEST, exceptDraftId);
  if (openDrafts) notes.push(`${openDrafts} drafts are waiting to be reviewed.`);

  return { counts, notes };
}

/**
 * Survey the universe and say what it needs next.
 *
 * Fills the draft's `proposed` like the other two, so it arrives through the
 * same queue -- but nothing it says is ever written anywhere. It is read and
 * dismissed.
 */
async function answerSurveyRequest(draft) {
  if (draft.artifactType !== SURVEY_REQUEST || !surveyEnabled()) return;

  if (!mayAnswer(await autonomyOf(draft.projectId))) {
    console.log(`survey agent: ${draft.id} filed and waiting (autonomy is manual)`);
    return;
  }

  try {
    const universe = await db.get(
      'SELECT id, title, description FROM stories WHERE id = ?', draft.projectId,
    );
    if (!universe) return;

    const row = await db.get(`
      SELECT persistent_goal AS "persistentGoal", temporary_focus AS "temporaryFocus", guardrails
      FROM stories WHERE id = ?
    `, draft.projectId);
    const direction = {
      persistentGoal: row?.persistentGoal ?? '',
      temporaryFocus: row?.temporaryFocus ?? '',
      guardrails: (() => {
        try {
          const parsed = typeof row?.guardrails === 'string' ? JSON.parse(row.guardrails) : row?.guardrails;
          return Array.isArray(parsed) ? parsed : [];
        } catch { return []; }
      })(),
    };

    const census = await takeCensus(draft.projectId, draft.id);
    console.log(`survey agent: surveying ${universe.title}`);
    const prompt = buildSurveyPrompt({ universe, direction, census, note: draft.payload?.note });
    const proposed = checkSurvey(extractJson(await runAgent(prompt)));

    await db.run(`
      UPDATE generated_drafts SET payload = ?, updated_at = now()
      WHERE id = ? AND status = 'generated'
    `, JSON.stringify({ ...draft.payload, proposed }), draft.id);
    console.log(`survey agent: ${proposed.findings.length} findings for ${universe.title}`);
  } catch (error) {
    console.warn(`survey agent: ${error.message}`);
  }
}

/**
 * Propose what this universe is for.
 *
 * Never applies anything: an agent proposing the instructions given to agents
 * is a loop worth keeping open at exactly one point, and that point is a person
 * reading it. Autonomous mode does not accept these, whatever it does for canon.
 */
async function answerDirectionRequest(draft) {
  if (draft.artifactType !== DIRECTION_REQUEST || !directionEnabled()) return;

  if (!mayAnswer(await autonomyOf(draft.projectId))) {
    console.log(`direction agent: ${draft.id} filed and waiting (autonomy is manual)`);
    return;
  }

  try {
    const universe = await db.get(
      'SELECT id, title, description FROM stories WHERE id = ?', draft.projectId,
    );
    if (!universe) return;

    const row = await db.get(`
      SELECT persistent_goal AS "persistentGoal", guardrails FROM stories WHERE id = ?
    `, draft.projectId);
    const current = {
      persistentGoal: row?.persistentGoal ?? '',
      guardrails: (() => {
        try {
          const parsed = typeof row?.guardrails === 'string' ? JSON.parse(row.guardrails) : row?.guardrails;
          return Array.isArray(parsed) ? parsed : [];
        } catch { return []; }
      })(),
    };

    const census = await takeCensus(draft.projectId, draft.id);
    // A few real names, so the proposal is about this universe rather than
    // about universes. Counts alone produce advice that would fit anything.
    const samples = [];
    for (const [label, table, column] of [
      ['Character', 'characters', 'name'],
      ['Place', 'locations', 'name'],
      ['Event', 'timeline_events', 'title'],
    ]) {
      const rows = await db.all(
        `SELECT ${column} AS n FROM ${table} WHERE project_id = ? LIMIT 6`, draft.projectId,
      ).catch(() => []);
      if (rows.length) samples.push(`${label}s: ${rows.map((r) => r.n).join(', ')}`);
    }

    console.log(`direction agent: proposing for ${universe.title}`);
    const prompt = buildDirectionPrompt({
      universe, current, census: { ...census, samples }, note: draft.payload?.note,
    });
    const proposed = checkDirection(extractJson(await runAgent(prompt)));

    await db.run(`
      UPDATE generated_drafts SET payload = ?, updated_at = now()
      WHERE id = ? AND status = 'generated'
    `, JSON.stringify({ ...draft.payload, proposed }), draft.id);
    console.log(`direction agent: proposed ${proposed.guardrails.length} guardrails for ${universe.title}`);
  } catch (error) {
    console.warn(`direction agent: ${error.message}`);
  }
}

function announce(draft) {
  void answerCanonRequest(draft);
  void answerImageRequest(draft);
  void answerSurveyRequest(draft);
  void answerDirectionRequest(draft);
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
