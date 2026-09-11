import { createHash, randomUUID } from 'node:crypto';
import { Router } from 'express';
import db from '../db.js';
import { env } from '../env.js';
import {
  CANON_REQUEST, agentEnabled, agentModel, buildPrompt, checkAnswer, extractJson, runAgent,
} from '../canonAgent.js';
import { IMAGE_REQUEST, buildImagePrompt, generateWithComfy } from '../imageAgent.js';
import { MAP_REQUEST, MAP_SIZE, buildMapPrompt } from '../mapAgent.js';
import { PLACE_REQUEST, buildPlacePrompt, checkPlace } from '../placeAgent.js';
import { PLACE_IMAGE_REQUEST, PLACE_IMAGE_SIZE, buildPlaceImagePrompt } from '../placeImageAgent.js';
import {
  PLACE_CANON_REQUEST, buildPlaceCanonPrompt, checkPlaceAnswer,
} from '../placeCanonAgent.js';
import {
  EVENT_CANON_REQUEST, EVENT_IMAGE_REQUEST, EVENT_IMAGE_SIZE, EVENT_PARTS_REQUEST,
  buildEventCanonPrompt, buildEventImagePrompt, buildEventPartsPrompt,
  checkEventAnswer, checkEventParts,
} from '../eventAgent.js';
import {
  SOCIETY_CANON_REQUEST, SOCIETY_IMAGE_REQUEST, SOCIETY_IMAGE_SIZE,
  buildSocietyPrompt, buildSocietyImagePrompt, checkSocietyAnswer,
} from '../societyAgent.js';
import {
  CREATURE_CANON_REQUEST, CREATURE_IMAGE_REQUEST, CREATURE_IMAGE_SIZE,
  buildCreaturePrompt, buildCreatureImagePrompt, checkCreatureAnswer,
} from '../creatureAgent.js';
import {
  ARC_CANON_REQUEST, buildArcActPrompt, buildArcPrompt, checkArcAnswer,
} from '../arcAgent.js';
import { parseList } from '../arcActs.js';
import {
  WORK_CANON_REQUEST, WORK_PARTS_REQUEST,
  buildWorkPrompt, readWorkAnswer, buildWorkPartsPrompt, checkWorkPartsAnswer,
} from '../workAgent.js';
import {
  TECHNOLOGY_CANON_REQUEST, TECHNOLOGY_IMAGE_REQUEST, TECHNOLOGY_IMAGE_SIZE,
  buildTechnologyPrompt, buildTechnologyImagePrompt, checkTechnologyAnswer,
} from '../technologyAgent.js';
import {
  SURVEY_REQUEST, buildSurveyPrompt, checkSurvey, surveyEnabled,
} from '../surveyAgent.js';
import { promoteDraftToCanon } from '../story-harness/promotion.js';
import { acceptIntoCanon, autonomyOf, mayAcceptUnread, mayAnswer } from '../autonomy.js';
import {
  DIRECTION_FIELDS, DIRECTION_REQUEST, buildDirectionPrompt, checkDirection, directionEnabled,
} from '../directionAgent.js';

const router = Router();
const STATUSES = new Set(['generated', 'accepted', 'rejected']);

/**
 * An agent that could not answer says so, on the request itself.
 *
 * Every handler used to log the failure and return, which left the request
 * `generated` with no proposal: exactly what one still being written looks
 * like. The surface said "composing" for good and polled for an answer that
 * was never coming, and the reason sat in a console nobody reads. Refusing it
 * with the reason ends the wait on every surface at once and keeps the why
 * with the ask, where a surface can show it.
 */
async function giveUp(draft, who, error) {
  const reason = error instanceof Error ? error.message : String(error);
  console.warn(`${who}: ${reason}`);
  try {
    await db.run(`
      UPDATE generated_drafts SET status = 'rejected', payload = ?, updated_at = now()
      WHERE id = ? AND status = 'generated'
    `, JSON.stringify({ ...(draft.payload ?? {}), failed: { reason, at: new Date().toISOString() } }), draft.id);
  } catch (e) {
    console.warn(`${who}: could not record the failure: ${e.message}`);
  }
}

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
      brief: draft.payload?.brief,
      present: latest?.year ?? null,
      previous: draft.payload?.previous,
      note: draft.payload?.note,
      direction,
    });
    if (!asked.length) return;
    console.log(`canon agent: drafting ${asked.join(', ')} for ${character.name}`);
    const proposed = checkAnswer(extractJson(await runAgent(prompt)), asked);

    await db.run(`
      UPDATE generated_drafts
      SET payload = ?, model_name = ?, updated_at = now()
      WHERE id = ? AND status = 'generated'
    `, JSON.stringify({ ...draft.payload, proposed }), agentModel(), draft.id);
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
    await giveUp(draft, 'canon agent', error);
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
      UPDATE generated_drafts
      SET payload = ?, model_name = ?, updated_at = now()
      WHERE id = ? AND status = 'generated'
    `, JSON.stringify({ ...draft.payload, proposed: { images, prompt: positive } }), agentModel(), draft.id);
    console.log(`image agent: ${images.length} previews for ${character.name}`);
  } catch (error) {
    await giveUp(draft, 'image agent', error);
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
      UPDATE generated_drafts
      SET payload = ?, model_name = ?, updated_at = now()
      WHERE id = ? AND status = 'generated'
    `, JSON.stringify({ ...draft.payload, proposed }), agentModel(), draft.id);
    console.log(`survey agent: ${proposed.findings.length} findings for ${universe.title}`);
  } catch (error) {
    await giveUp(draft, 'survey agent', error);
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

    const wanted = Array.isArray(draft.payload?.fields) && draft.payload.fields.length
      ? draft.payload.fields
      : Object.keys(DIRECTION_FIELDS);

    console.log(`direction agent: proposing ${wanted.join(', ')} for ${universe.title}`);
    const { asked, prompt } = buildDirectionPrompt({
      universe, current, census: { ...census, samples }, note: draft.payload?.note, fields: wanted,
    });
    if (!asked.length) return;
    const proposed = checkDirection(extractJson(await runAgent(prompt)), asked);

    await db.run(`
      UPDATE generated_drafts
      SET payload = ?, model_name = ?, updated_at = now()
      WHERE id = ? AND status = 'generated'
    `, JSON.stringify({ ...draft.payload, proposed }), agentModel(), draft.id);
    console.log(`direction agent: proposed ${Object.keys(proposed).join(', ')} for ${universe.title}`);
  } catch (error) {
    await giveUp(draft, 'direction agent', error);
  }
}

/**
 * Draw a map of somewhere, in the style the active work asked for.
 *
 * The same loop as a portrait, and the same guarantee: what comes back is
 * candidates, and nothing about the universe changes until somebody keeps one.
 * A generated coastline is a backdrop for pins, never a fact.
 */
async function answerMapRequest(draft) {
  if (draft.artifactType !== MAP_REQUEST) return;
  const placeId = draft.payload?.locationId;
  const forUniverse = !placeId && draft.payload?.universe === true;
  if (!placeId && !forUniverse) return;

  if (!mayAnswer(await autonomyOf(draft.projectId))) {
    console.log(`map agent: ${draft.id} filed and waiting (autonomy is manual)`);
    return;
  }

  try {
    const place = forUniverse
      ? await db.get(`
        SELECT id, title AS name, description, 'universe' AS "regionType"
        FROM stories WHERE id = ?
      `, draft.projectId)
      : await db.get(`
        SELECT id, name, description, region_type AS "regionType" FROM locations WHERE id = ?
      `, placeId);
    if (!place) throw new Error(`nothing to draw: no ${forUniverse ? 'universe' : 'place'} with that id`);

    // What is inside it, so the drawing leaves room for the places that will be
    // pinned on it rather than filling every bay with invented scenery.
    const children = forUniverse
      ? await db.all(`
        SELECT l.name FROM locations l
        WHERE l.project_id = ?
          AND (l.parent_id IS NULL
            OR NOT EXISTS (SELECT 1 FROM locations p WHERE p.id = l.parent_id))
        ORDER BY l.name
      `, draft.projectId).catch(() => [])
      : await db.all(
        'SELECT name FROM locations WHERE parent_id = ? ORDER BY name', placeId,
      ).catch(() => []);

    const source = draft.payload.sourceId
      ? await db.get('SELECT * FROM image_sources WHERE id = ?', draft.payload.sourceId)
      : await db.get(
        'SELECT * FROM image_sources WHERE project_id = ? AND is_default ORDER BY updated_at DESC LIMIT 1',
        draft.projectId,
      );
    if (!source) throw new Error('no image source is configured for this universe');
    if (source.kind !== 'comfyui') throw new Error(`${source.kind} sources are not wired up yet`);

    const work = await db.get(`
      SELECT d.image_style AS style, d.image_style_negative AS negative
      FROM stories s LEFT JOIN derivative_works d ON d.id = s.active_work_id
      WHERE s.id = ?
    `, draft.projectId);

    const built = buildMapPrompt({
      place, children, style: work?.style ?? '', note: draft.payload.note,
    });
    const positive = draft.payload.positive?.trim() || built.positive;
    const negative = draft.payload.negative?.trim() || built.negative;
    const options = typeof source.options === 'string'
      ? JSON.parse(source.options) : (source.options ?? {});

    console.log(`map agent: drawing ${place.name}`);
    const images = await generateWithComfy({
      endpoint: source.endpoint,
      model: source.model,
      positive,
      // The map's own negative first: a generated label is a claim about
      // position that nobody made, and the pins carry the names. An edited
      // negative is used as written.
      negative: draft.payload.negative?.trim()
        ? negative
        : [negative, work?.negative ?? ''].filter(Boolean).join(', '),
      options: { ...options, ...MAP_SIZE },
      seed: Math.floor(Math.random() * 1e15),
    });

    await db.run(`
      UPDATE generated_drafts
      SET payload = ?, model_name = ?, updated_at = now()
      WHERE id = ? AND status = 'generated'
    `, JSON.stringify({ ...draft.payload, proposed: { images, prompt: positive } }), agentModel(), draft.id);
    console.log(`map agent: ${images.length} maps of ${place.name}`);
  } catch (error) {
    await giveUp(draft, 'map agent', error);
  }
}

/**
 * Propose what belongs at a point on a map.
 *
 * Nothing is created here. What comes back is a name and a description for
 * somebody to accept, and accepting is what makes the place -- at the point
 * they clicked, with its own record and its own history. A generated coastline
 * is a backdrop; a generated town in the records would be a lie.
 */
async function answerPlaceRequest(draft) {
  if (draft.artifactType !== PLACE_REQUEST || !agentEnabled()) return;
  const { parentId, at } = draft.payload ?? {};
  if (!parentId || !at || !Number.isFinite(at.x) || !Number.isFinite(at.y)) return;

  if (!mayAnswer(await autonomyOf(draft.projectId))) {
    console.log(`place agent: ${draft.id} filed and waiting (autonomy is manual)`);
    return;
  }

  try {
    const parent = await db.get(`
      SELECT id, name, description, history, folklore, biome, ecology
      FROM locations WHERE id = ?
    `, parentId);
    if (!parent) return;

    const siblings = await db.all(
      'SELECT name FROM locations WHERE parent_id = ? ORDER BY name', parentId,
    ).catch(() => []);

    const universe = await db.get(
      'SELECT persistent_goal AS "persistentGoal", guardrails FROM stories WHERE id = ?',
      draft.projectId,
    );
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

    const { prompt } = buildPlacePrompt({
      parent, siblings, at, note: draft.payload.note, direction,
    });
    const proposed = checkPlace(extractJson(await runAgent(prompt)));
    if (!proposed) throw new Error('the answer named no place');

    await db.run(`
      UPDATE generated_drafts
      SET payload = ?, model_name = ?, updated_at = now()
      WHERE id = ? AND status = 'generated'
    `, JSON.stringify({ ...draft.payload, proposed }), agentModel(), draft.id);
    console.log(`place agent: proposed ${proposed.name} inside ${parent.name}`);
  } catch (error) {
    await giveUp(draft, 'place agent', error);
  }
}

/**
 * Draw a picture of a place, in the style the active work asked for.
 *
 * Sibling of the map request and its opposite: here the illustration style
 * leads, because this is an illustration. What comes back is candidates, and
 * nothing about the universe changes until somebody keeps one.
 */
async function answerPlaceImageRequest(draft) {
  if (draft.artifactType !== PLACE_IMAGE_REQUEST) return;
  const placeId = draft.payload?.locationId;
  // A request with no place is a request about the universe itself. It reads
  // as a place for drawing purposes -- a name and a description -- which is
  // all the prompt builder ever wanted.
  const forUniverse = !placeId && draft.payload?.universe === true;
  if (!placeId && !forUniverse) return;

  if (!mayAnswer(await autonomyOf(draft.projectId))) {
    console.log(`place picture agent: ${draft.id} filed and waiting (autonomy is manual)`);
    return;
  }

  try {
    const place = forUniverse
      ? await db.get(`
        SELECT id, title AS name, description,
               '' AS biome, '' AS ecology, '' AS "regionType"
        FROM stories WHERE id = ?
      `, draft.projectId)
      : await db.get(`
        SELECT id, name, description, biome, ecology, region_type AS "regionType"
        FROM locations WHERE id = ?
      `, placeId);
    if (!place) throw new Error(`nothing to draw: no ${forUniverse ? 'universe' : 'place'} with that id`);

    const source = draft.payload.sourceId
      ? await db.get('SELECT * FROM image_sources WHERE id = ?', draft.payload.sourceId)
      : await db.get(
        'SELECT * FROM image_sources WHERE project_id = ? AND is_default ORDER BY updated_at DESC LIMIT 1',
        draft.projectId,
      );
    if (!source) throw new Error('no image source is configured for this universe');
    if (source.kind !== 'comfyui') throw new Error(`${source.kind} sources are not wired up yet`);

    const work = await db.get(`
      SELECT d.image_style AS style, d.image_style_negative AS negative
      FROM stories s LEFT JOIN derivative_works d ON d.id = s.active_work_id
      WHERE s.id = ?
    `, draft.projectId);

    // An author who has edited the prompt has said exactly what they want
    // sent, so it is sent exactly. Rebuilding it here and appending their
    // words as a note would be the app arguing with the instruction it was
    // given, which is the whole reason the prompt was opened up.
    const built = buildPlaceImagePrompt({
      place, style: work?.style ?? '', note: draft.payload.note,
    });
    const positive = draft.payload.positive?.trim() || built.positive;
    const negative = draft.payload.negative?.trim() || built.negative;
    const options = typeof source.options === 'string'
      ? JSON.parse(source.options) : (source.options ?? {});

    console.log(`place picture agent: drawing ${place.name}`);
    const images = await generateWithComfy({
      endpoint: source.endpoint,
      model: source.model,
      positive,
      // An edited negative is used as written; a built one still gains the
      // work's own negative, which is a property of the style rather than of
      // this request.
      negative: draft.payload.negative?.trim()
        ? negative
        : [negative, work?.negative ?? ''].filter(Boolean).join(', '),
      options: { ...options, ...PLACE_IMAGE_SIZE },
      seed: Math.floor(Math.random() * 1e15),
    });

    await db.run(`
      UPDATE generated_drafts
      SET payload = ?, model_name = ?, updated_at = now()
      WHERE id = ? AND status = 'generated'
    `, JSON.stringify({ ...draft.payload, proposed: { images, prompt: positive } }), agentModel(), draft.id);
    console.log(`place picture agent: ${images.length} pictures of ${place.name}`);
  } catch (error) {
    await giveUp(draft, 'place picture agent', error);
  }
}

/**
 * Fill in what a place has not had written about it.
 *
 * A place is understood by what contains it and what it contains, so the
 * prompt is given both: a station's history is the history of the system it
 * hangs in, and its ecology follows from a biome recorded one level up.
 */
async function answerPlaceCanonRequest(draft) {
  if (draft.artifactType !== PLACE_CANON_REQUEST || !agentEnabled()) return;
  const placeId = draft.payload?.locationId;
  // A universe whose whole setting is one house has the same record a place
  // does, and is written the same way.
  const forUniverse = !placeId && draft.payload?.universe === true;
  const fields = draft.payload?.fields ?? [];
  if ((!placeId && !forUniverse) || !fields.length) return;

  if (!mayAnswer(await autonomyOf(draft.projectId))) {
    console.log(`place canon agent: ${draft.id} filed and waiting (autonomy is manual)`);
    return;
  }

  try {
    const place = forUniverse
      ? await db.get(`
        SELECT id, title AS name, description, history, folklore, biome, ecology,
               '' AS "regionType", '' AS "politicalNotes",
               NULL AS "parentId", is_protected AS "isProtected"
        FROM stories WHERE id = ?
      `, draft.projectId)
      : await db.get(`
        SELECT id, name, description, history, folklore, biome, ecology,
               region_type AS "regionType", political_notes AS "politicalNotes",
               parent_id AS "parentId", is_protected AS "isProtected"
        FROM locations WHERE id = ?
      `, placeId);
    // Said out loud. A silent return leaves the request in the queue looking
    // like an agent that never got round to it, which is a very different
    // problem from one that was asked about a place that is not there.
    if (!place) throw new Error(`no place with id ${placeId}`);
    if (place.isProtected) {
      console.log(`place canon agent: ${place.name} is protected, nothing proposed`);
      return;
    }

    const parent = place.parentId
      ? await db.get(`
        SELECT name, description, biome FROM locations WHERE id = ?
      `, place.parentId)
      : null;
    const inside = forUniverse
      ? await db.all(`
        SELECT l.name FROM locations l
        WHERE l.project_id = ?
          AND (l.parent_id IS NULL
            OR NOT EXISTS (SELECT 1 FROM locations p WHERE p.id = l.parent_id))
        ORDER BY l.name
      `, draft.projectId).catch(() => [])
      : await db.all(
        'SELECT name FROM locations WHERE parent_id = ? ORDER BY name', place.id,
      ).catch(() => []);
    const siblings = place.parentId
      ? await db.all(
        'SELECT name FROM locations WHERE parent_id = ? AND id <> ? ORDER BY name',
        place.parentId, place.id,
      ).catch(() => [])
      : [];

    const universe = await db.get(
      'SELECT persistent_goal AS "persistentGoal", guardrails FROM stories WHERE id = ?',
      draft.projectId,
    );
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

    const { prompt, asked } = buildPlaceCanonPrompt({
      place, parent, inside, siblings, fields, direction, brief: draft.payload?.brief,
      previous: draft.payload?.previous, note: draft.payload?.note,
    });
    const proposed = checkPlaceAnswer(extractJson(await runAgent(prompt)), asked);
    if (!proposed) throw new Error('the answer held none of the fields asked for');

    await db.run(`
      UPDATE generated_drafts
      SET payload = ?, model_name = ?, updated_at = now()
      WHERE id = ? AND status = 'generated'
    `, JSON.stringify({ ...draft.payload, proposed }), agentModel(), draft.id);
    console.log(`place canon agent: proposed ${Object.keys(proposed).join(', ')} for ${place.name}`);
  } catch (error) {
    await giveUp(draft, 'place canon agent', error);
  }
}

/** Everything one event needs to be written about: its neighbours and its parts. */
async function eventContext(eventId, projectId) {
  const event = await db.get(`
    SELECT e.id, e.date, e.year, e.title, e.description, e.account, e.consequences,
           e.remembrance, e.parent_id AS "parentId", e.is_protected AS "isProtected",
           l.name AS "locationName"
    FROM timeline_events e LEFT JOIN locations l ON l.id = e.location_id
    WHERE e.id = ?
  `, eventId);
  if (!event) return null;

  // The two neighbours in time, which is what makes an event this event.
  const before = await db.all(`
    SELECT date, title FROM timeline_events
    WHERE project_id = ? AND id <> ? AND year IS NOT NULL AND year <= ?
    ORDER BY year DESC LIMIT 3
  `, projectId, event.id, event.year ?? 0).catch(() => []);
  const after = await db.all(`
    SELECT date, title FROM timeline_events
    WHERE project_id = ? AND id <> ? AND year IS NOT NULL AND year >= ?
    ORDER BY year ASC LIMIT 3
  `, projectId, event.id, event.year ?? 0).catch(() => []);
  const inside = await db.all(
    'SELECT title FROM timeline_events WHERE parent_id = ? ORDER BY year NULLS LAST, date', event.id,
  ).catch(() => []);
  const partOf = event.parentId
    ? await db.get('SELECT title, date FROM timeline_events WHERE id = ?', event.parentId)
    : null;

  return { event, before, after, inside, partOf };
}

/** Fill in what an event has not had written about it. */
async function answerEventCanonRequest(draft) {
  if (draft.artifactType !== EVENT_CANON_REQUEST || !agentEnabled()) return;
  const eventId = draft.payload?.eventId;
  const fields = draft.payload?.fields ?? [];
  if (!eventId || !fields.length) return;

  if (!mayAnswer(await autonomyOf(draft.projectId))) {
    console.log(`event agent: ${draft.id} filed and waiting (autonomy is manual)`);
    return;
  }

  try {
    const found = await eventContext(eventId, draft.projectId);
    if (!found) throw new Error(`no event with id ${eventId}`);
    if (found.event.isProtected) {
      console.log(`event agent: ${found.event.title} is protected, nothing proposed`);
      return;
    }

    const universe = await db.get(
      'SELECT persistent_goal AS "persistentGoal", guardrails FROM stories WHERE id = ?',
      draft.projectId,
    );
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

    const { prompt, asked } = buildEventCanonPrompt({
      ...found, fields, direction, brief: draft.payload?.brief,
      previous: draft.payload?.previous, note: draft.payload?.note,
    });
    const proposed = checkEventAnswer(extractJson(await runAgent(prompt)), asked);
    if (!proposed) throw new Error('the answer held none of the fields asked for');

    await db.run(`
      UPDATE generated_drafts
      SET payload = ?, model_name = ?, updated_at = now()
      WHERE id = ? AND status = 'generated'
    `, JSON.stringify({ ...draft.payload, proposed }), agentModel(), draft.id);
    console.log(`event agent: proposed ${Object.keys(proposed).join(', ')} for ${found.event.title}`);
  } catch (error) {
    await giveUp(draft, 'event agent', error);
  }
}

/** Picture one moment from an event. */
async function answerEventImageRequest(draft) {
  if (draft.artifactType !== EVENT_IMAGE_REQUEST) return;
  const eventId = draft.payload?.eventId;
  if (!eventId) return;

  if (!mayAnswer(await autonomyOf(draft.projectId))) {
    console.log(`event picture agent: ${draft.id} filed and waiting (autonomy is manual)`);
    return;
  }

  try {
    const event = await db.get(`
      SELECT e.id, e.title, e.description, e.account, l.name AS "locationName"
      FROM timeline_events e LEFT JOIN locations l ON l.id = e.location_id
      WHERE e.id = ?
    `, eventId);
    if (!event) throw new Error(`no event with id ${eventId}`);

    const source = draft.payload.sourceId
      ? await db.get('SELECT * FROM image_sources WHERE id = ?', draft.payload.sourceId)
      : await db.get(
        'SELECT * FROM image_sources WHERE project_id = ? AND is_default ORDER BY updated_at DESC LIMIT 1',
        draft.projectId,
      );
    if (!source) throw new Error('no image source is configured for this universe');
    if (source.kind !== 'comfyui') throw new Error(`${source.kind} sources are not wired up yet`);

    const work = await db.get(`
      SELECT d.image_style AS style, d.image_style_negative AS negative
      FROM stories s LEFT JOIN derivative_works d ON d.id = s.active_work_id
      WHERE s.id = ?
    `, draft.projectId);

    const built = buildEventImagePrompt({
      event, where: event.locationName, style: work?.style ?? '', note: draft.payload.note,
    });
    const positive = draft.payload.positive?.trim() || built.positive;
    const negative = draft.payload.negative?.trim() || built.negative;
    const options = typeof source.options === 'string'
      ? JSON.parse(source.options) : (source.options ?? {});

    console.log(`event picture agent: drawing ${event.title}`);
    const images = await generateWithComfy({
      endpoint: source.endpoint,
      model: source.model,
      positive,
      negative: draft.payload.negative?.trim()
        ? negative
        : [negative, work?.negative ?? ''].filter(Boolean).join(', '),
      options: { ...options, ...EVENT_IMAGE_SIZE },
      seed: Math.floor(Math.random() * 1e15),
    });

    await db.run(`
      UPDATE generated_drafts
      SET payload = ?, model_name = ?, updated_at = now()
      WHERE id = ? AND status = 'generated'
    `, JSON.stringify({ ...draft.payload, proposed: { images, prompt: positive } }),
    agentModel(), draft.id);
    console.log(`event picture agent: ${images.length} of ${event.title}`);
  } catch (error) {
    await giveUp(draft, 'event picture agent', error);
  }
}

/**
 * Propose the sequence an event breaks into.
 *
 * Nothing is created here. What comes back is a list of parts to accept or
 * refuse, and accepting is what puts them on the timeline -- the same rule the
 * place proposal follows, for the same reason: a generated moment inside a
 * siege is a suggestion until somebody says it happened.
 */
async function answerEventPartsRequest(draft) {
  if (draft.artifactType !== EVENT_PARTS_REQUEST || !agentEnabled()) return;
  const eventId = draft.payload?.eventId;
  if (!eventId) return;

  if (!mayAnswer(await autonomyOf(draft.projectId))) {
    console.log(`event parts agent: ${draft.id} filed and waiting (autonomy is manual)`);
    return;
  }

  try {
    const event = await db.get(`
      SELECT e.id, e.title, e.date, e.description, e.account, e.consequences,
             l.name AS "locationName"
      FROM timeline_events e LEFT JOIN locations l ON l.id = e.location_id
      WHERE e.id = ?
    `, eventId);
    if (!event) throw new Error(`no event with id ${eventId}`);

    const inside = await db.all(
      'SELECT title FROM timeline_events WHERE parent_id = ? ORDER BY year NULLS LAST, date', eventId,
    ).catch(() => []);

    const universe = await db.get('SELECT guardrails FROM stories WHERE id = ?', draft.projectId);
    const direction = {
      guardrails: (() => {
        try {
          const parsed = typeof universe?.guardrails === 'string'
            ? JSON.parse(universe.guardrails) : universe?.guardrails;
          return Array.isArray(parsed) ? parsed : [];
        } catch { return []; }
      })(),
    };

    const { prompt } = buildEventPartsPrompt({ event, inside, note: draft.payload.note, direction });
    const parts = checkEventParts(extractJson(await runAgent(prompt)));
    if (!parts) throw new Error('the answer named no parts');

    await db.run(`
      UPDATE generated_drafts
      SET payload = ?, model_name = ?, updated_at = now()
      WHERE id = ? AND status = 'generated'
    `, JSON.stringify({ ...draft.payload, proposed: { parts } }), agentModel(), draft.id);
    console.log(`event parts agent: proposed ${parts.length} parts of ${event.title}`);
  } catch (error) {
    await giveUp(draft, 'event parts agent', error);
  }
}

/** Fill in what a society has not had written about it. */
async function answerSocietyRequest(draft) {
  if (draft.artifactType !== SOCIETY_CANON_REQUEST || !agentEnabled()) return;
  const factionId = draft.payload?.factionId;
  const fields = draft.payload?.fields ?? [];
  if (!factionId || !fields.length) return;

  if (!mayAnswer(await autonomyOf(draft.projectId))) {
    console.log(`society agent: ${draft.id} filed and waiting (autonomy is manual)`);
    return;
  }

  try {
    const faction = await db.get(`
      SELECT id, name, description, history, goals, doctrine, technology,
             economic_leverage AS "economy", corporate_structure AS "structure",
             is_protected AS "isProtected"
      FROM factions WHERE id = ?
    `, factionId);
    if (!faction) throw new Error(`no faction with id ${factionId}`);
    if (faction.isProtected) {
      console.log(`society agent: ${faction.name} is protected, nothing proposed`);
      return;
    }

    // The rivalries, read from the graph rather than asked for. Given from
    // whichever end this faction sits on, so the prompt never has to know
    // which way round an edge was recorded.
    const edges = await db.all(`
      SELECT relationship_type AS "kind",
             source_entity_id AS "sourceId", target_entity_id AS "targetId"
      FROM canon_relationships
      WHERE project_id = ? AND (
        (source_entity_type = 'faction' AND source_entity_id = ?)
        OR (target_entity_type = 'faction' AND target_entity_id = ?)
      )
    `, draft.projectId, factionId, factionId).catch(() => []);

    const ties = [];
    for (const edge of edges) {
      const forward = edge.sourceId === factionId;
      const otherId = forward ? edge.targetId : edge.sourceId;
      const other = await db.get('SELECT name FROM factions WHERE id = ?', otherId)
        ?? await db.get('SELECT name FROM characters WHERE id = ?', otherId);
      if (other?.name) ties.push({ kind: edge.kind, forward, otherName: other.name });
    }

    const universe = await db.get(
      'SELECT persistent_goal AS "persistentGoal", guardrails FROM stories WHERE id = ?',
      draft.projectId,
    );
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

    const { prompt, asked } = buildSocietyPrompt({
      faction, ties, fields, direction, brief: draft.payload?.brief,
      previous: draft.payload?.previous, note: draft.payload?.note,
    });
    const proposed = checkSocietyAnswer(extractJson(await runAgent(prompt)), asked);
    if (!proposed) throw new Error('the answer held none of the fields asked for');

    await db.run(`
      UPDATE generated_drafts
      SET payload = ?, model_name = ?, updated_at = now()
      WHERE id = ? AND status = 'generated'
    `, JSON.stringify({ ...draft.payload, proposed }), agentModel(), draft.id);
    console.log(`society agent: proposed ${Object.keys(proposed).join(', ')} for ${faction.name}`);
  } catch (error) {
    await giveUp(draft, 'society agent', error);
  }
}

/** Draw the mark a group puts on things. */
async function answerSocietyImageRequest(draft) {
  if (draft.artifactType !== SOCIETY_IMAGE_REQUEST) return;
  const factionId = draft.payload?.factionId;
  if (!factionId) return;

  if (!mayAnswer(await autonomyOf(draft.projectId))) {
    console.log(`society picture agent: ${draft.id} filed and waiting (autonomy is manual)`);
    return;
  }

  try {
    const faction = await db.get(
      'SELECT id, name, doctrine, goals FROM factions WHERE id = ?', factionId,
    );
    if (!faction) throw new Error(`no faction with id ${factionId}`);
    try {
      const parsed = JSON.parse(faction.goals);
      faction.goals = Array.isArray(parsed) ? parsed : [];
    } catch { faction.goals = Array.isArray(faction.goals) ? faction.goals : []; }

    const source = draft.payload.sourceId
      ? await db.get('SELECT * FROM image_sources WHERE id = ?', draft.payload.sourceId)
      : await db.get(
        'SELECT * FROM image_sources WHERE project_id = ? AND is_default ORDER BY updated_at DESC LIMIT 1',
        draft.projectId,
      );
    if (!source) throw new Error('no image source is configured for this universe');
    if (source.kind !== 'comfyui') throw new Error(`${source.kind} sources are not wired up yet`);

    const work = await db.get(`
      SELECT d.image_style AS style, d.image_style_negative AS negative
      FROM stories s LEFT JOIN derivative_works d ON d.id = s.active_work_id
      WHERE s.id = ?
    `, draft.projectId);

    const built = buildSocietyImagePrompt({
      faction, style: work?.style ?? '', note: draft.payload.note,
    });
    const positive = draft.payload.positive?.trim() || built.positive;
    const negative = draft.payload.negative?.trim() || built.negative;
    const options = typeof source.options === 'string'
      ? JSON.parse(source.options) : (source.options ?? {});

    console.log(`society picture agent: drawing the mark of ${faction.name}`);
    const images = await generateWithComfy({
      endpoint: source.endpoint,
      model: source.model,
      positive,
      negative: draft.payload.negative?.trim()
        ? negative
        : [negative, work?.negative ?? ''].filter(Boolean).join(', '),
      options: { ...options, ...SOCIETY_IMAGE_SIZE },
      seed: Math.floor(Math.random() * 1e15),
    });

    await db.run(`
      UPDATE generated_drafts
      SET payload = ?, model_name = ?, updated_at = now()
      WHERE id = ? AND status = 'generated'
    `, JSON.stringify({ ...draft.payload, proposed: { images, prompt: positive } }),
    agentModel(), draft.id);
    console.log(`society picture agent: ${images.length} for ${faction.name}`);
  } catch (error) {
    await giveUp(draft, 'society picture agent', error);
  }
}

/** Everything a creature needs written about it, and where it is found. */
async function creatureContext(draft, creatureId) {
  const creature = await db.get(`
    SELECT id, name, category, status, description, tactics,
           ecological_niche AS "ecologicalNiche", motivation, notes,
           in_universe_backstory AS "inUniverseBackstory",
           is_protected AS "isProtected"
    FROM bestiary WHERE id = ?
  `, creatureId);
  if (!creature) throw new Error(`no creature with id ${creatureId}`);
  try {
    const parsed = JSON.parse(creature.tactics);
    creature.tactics = Array.isArray(parsed) ? parsed : [];
  } catch { creature.tactics = Array.isArray(creature.tactics) ? creature.tactics : []; }

  const range = await db.all(`
    SELECT r.notes, l.name AS "locationName", l.region_type AS "regionType"
    FROM bestiary_ranges r LEFT JOIN locations l ON l.id = r.location_id
    WHERE r.bestiary_id = ? ORDER BY l.name
  `, creatureId).catch(() => []);

  const universe = await db.get(
    'SELECT persistent_goal AS "persistentGoal", guardrails FROM stories WHERE id = ?',
    draft.projectId,
  );
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

  return { creature, range, direction };
}

/** Fill in what a creature has not had written about it. */
async function answerCreatureRequest(draft) {
  if (draft.artifactType !== CREATURE_CANON_REQUEST || !agentEnabled()) return;
  const creatureId = draft.payload?.creatureId;
  const fields = draft.payload?.fields ?? [];
  if (!creatureId || !fields.length) return;

  if (!mayAnswer(await autonomyOf(draft.projectId))) {
    console.log(`creature agent: ${draft.id} filed and waiting (autonomy is manual)`);
    return;
  }

  try {
    const { creature, range, direction } = await creatureContext(draft, creatureId);
    if (creature.isProtected) {
      console.log(`creature agent: ${creature.name} is protected, nothing proposed`);
      return;
    }

    const { prompt, asked } = buildCreaturePrompt({
      creature, range, ties: [], fields, direction, brief: draft.payload?.brief,
      previous: draft.payload?.previous, note: draft.payload?.note,
    });
    const proposed = checkCreatureAnswer(extractJson(await runAgent(prompt)), asked);
    if (!proposed) throw new Error('the answer held none of the fields asked for');

    await db.run(`
      UPDATE generated_drafts
      SET payload = ?, model_name = ?, updated_at = now()
      WHERE id = ? AND status = 'generated'
    `, JSON.stringify({ ...draft.payload, proposed }), agentModel(), draft.id);
    console.log(`creature agent: proposed ${Object.keys(proposed).join(', ')} for ${creature.name}`);
  } catch (error) {
    await giveUp(draft, 'creature agent', error);
  }
}

/** Draw one creature, where it lives. */
async function answerCreatureImageRequest(draft) {
  if (draft.artifactType !== CREATURE_IMAGE_REQUEST) return;
  const creatureId = draft.payload?.creatureId;
  if (!creatureId) return;

  if (!mayAnswer(await autonomyOf(draft.projectId))) {
    console.log(`creature picture agent: ${draft.id} filed and waiting (autonomy is manual)`);
    return;
  }

  try {
    const { creature, range } = await creatureContext(draft, creatureId);

    const source = draft.payload.sourceId
      ? await db.get('SELECT * FROM image_sources WHERE id = ?', draft.payload.sourceId)
      : await db.get(
        'SELECT * FROM image_sources WHERE project_id = ? AND is_default ORDER BY updated_at DESC LIMIT 1',
        draft.projectId,
      );
    if (!source) throw new Error('no image source is configured for this universe');
    if (source.kind !== 'comfyui') throw new Error(`${source.kind} sources are not wired up yet`);

    const work = await db.get(`
      SELECT d.image_style AS style, d.image_style_negative AS negative
      FROM stories s LEFT JOIN derivative_works d ON d.id = s.active_work_id
      WHERE s.id = ?
    `, draft.projectId);

    const built = buildCreatureImagePrompt({
      creature, range, style: work?.style ?? '', note: draft.payload.note,
    });
    const positive = draft.payload.positive?.trim() || built.positive;
    const negative = draft.payload.negative?.trim() || built.negative;
    const options = typeof source.options === 'string'
      ? JSON.parse(source.options) : (source.options ?? {});

    console.log(`creature picture agent: drawing ${creature.name}`);
    const images = await generateWithComfy({
      endpoint: source.endpoint,
      model: source.model,
      positive,
      negative: draft.payload.negative?.trim()
        ? negative
        : [negative, work?.negative ?? ''].filter(Boolean).join(', '),
      options: { ...options, ...CREATURE_IMAGE_SIZE },
      seed: Math.floor(Math.random() * 1e15),
    });

    await db.run(`
      UPDATE generated_drafts
      SET payload = ?, model_name = ?, updated_at = now()
      WHERE id = ? AND status = 'generated'
    `, JSON.stringify({ ...draft.payload, proposed: { images, prompt: positive } }),
    agentModel(), draft.id);
    console.log(`creature picture agent: ${images.length} of ${creature.name}`);
  } catch (error) {
    await giveUp(draft, 'creature picture agent', error);
  }
}

/** The technology, with the two edges that keep it in this universe. */
async function technologyContext(draft, technologyId) {
  const technology = await db.get(`
    SELECT t.id, t.name, t.description, t.principles, t.history, t.limitations,
           t.patents_or_taboos AS "patentsOrTaboos", t.proliferation, t.classification,
           t.origin_date AS "originDate", l.name AS "originLocationName",
           f.name AS "holderFactionName", t.is_protected AS "isProtected"
    FROM technologies t
    LEFT JOIN locations l ON l.id = t.origin_location_id
    LEFT JOIN factions  f ON f.id = t.holder_faction_id
    WHERE t.id = ?
  `, technologyId);
  if (!technology) throw new Error(`no technology with id ${technologyId}`);

  const universe = await db.get(
    'SELECT persistent_goal AS "persistentGoal", guardrails FROM stories WHERE id = ?',
    draft.projectId,
  );
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

  return { technology, direction };
}

/** Fill in what a technology has not had written about it. */
async function answerTechnologyRequest(draft) {
  if (draft.artifactType !== TECHNOLOGY_CANON_REQUEST || !agentEnabled()) return;
  const technologyId = draft.payload?.technologyId;
  const fields = draft.payload?.fields ?? [];
  if (!technologyId || !fields.length) return;

  if (!mayAnswer(await autonomyOf(draft.projectId))) {
    console.log(`technology agent: ${draft.id} filed and waiting (autonomy is manual)`);
    return;
  }

  try {
    const { technology, direction } = await technologyContext(draft, technologyId);
    if (technology.isProtected) {
      console.log(`technology agent: ${technology.name} is protected, nothing proposed`);
      return;
    }

    const { prompt, asked } = buildTechnologyPrompt({
      technology, fields, direction, brief: draft.payload?.brief,
      previous: draft.payload?.previous, note: draft.payload?.note,
    });
    const proposed = checkTechnologyAnswer(extractJson(await runAgent(prompt)), asked);
    if (!proposed) throw new Error('the answer held none of the fields asked for');

    await db.run(`
      UPDATE generated_drafts
      SET payload = ?, model_name = ?, updated_at = now()
      WHERE id = ? AND status = 'generated'
    `, JSON.stringify({ ...draft.payload, proposed }), agentModel(), draft.id);
    console.log(`technology agent: proposed ${Object.keys(proposed).join(', ')} for ${technology.name}`);
  } catch (error) {
    await giveUp(draft, 'technology agent', error);
  }
}

/** Draw the device itself. */
async function answerTechnologyImageRequest(draft) {
  if (draft.artifactType !== TECHNOLOGY_IMAGE_REQUEST) return;
  const technologyId = draft.payload?.technologyId;
  if (!technologyId) return;

  if (!mayAnswer(await autonomyOf(draft.projectId))) {
    console.log(`technology picture agent: ${draft.id} filed and waiting (autonomy is manual)`);
    return;
  }

  try {
    const { technology } = await technologyContext(draft, technologyId);

    const source = draft.payload.sourceId
      ? await db.get('SELECT * FROM image_sources WHERE id = ?', draft.payload.sourceId)
      : await db.get(
        'SELECT * FROM image_sources WHERE project_id = ? AND is_default ORDER BY updated_at DESC LIMIT 1',
        draft.projectId,
      );
    if (!source) throw new Error('no image source is configured for this universe');
    if (source.kind !== 'comfyui') throw new Error(`${source.kind} sources are not wired up yet`);

    const work = await db.get(`
      SELECT d.image_style AS style, d.image_style_negative AS negative
      FROM stories s LEFT JOIN derivative_works d ON d.id = s.active_work_id
      WHERE s.id = ?
    `, draft.projectId);

    const built = buildTechnologyImagePrompt({
      technology, style: work?.style ?? '', note: draft.payload.note,
    });
    const positive = draft.payload.positive?.trim() || built.positive;
    const negative = draft.payload.negative?.trim() || built.negative;
    const options = typeof source.options === 'string'
      ? JSON.parse(source.options) : (source.options ?? {});

    console.log(`technology picture agent: drawing ${technology.name}`);
    const images = await generateWithComfy({
      endpoint: source.endpoint,
      model: source.model,
      positive,
      negative: draft.payload.negative?.trim()
        ? negative
        : [negative, work?.negative ?? ''].filter(Boolean).join(', '),
      options: { ...options, ...TECHNOLOGY_IMAGE_SIZE },
      seed: Math.floor(Math.random() * 1e15),
    });

    await db.run(`
      UPDATE generated_drafts
      SET payload = ?, model_name = ?, updated_at = now()
      WHERE id = ? AND status = 'generated'
    `, JSON.stringify({ ...draft.payload, proposed: { images, prompt: positive } }),
    agentModel(), draft.id);
    console.log(`technology picture agent: ${images.length} of ${technology.name}`);
  } catch (error) {
    await giveUp(draft, 'technology picture agent', error);
  }
}

/** Write an arc, from the cast, the chronicle and the arcs beside it. */
async function answerArcRequest(draft) {
  if (draft.artifactType !== ARC_CANON_REQUEST || !agentEnabled()) return;
  const arcId = draft.payload?.arcId;
  const fields = draft.payload?.fields ?? [];
  if (!arcId || !fields.length) return;

  if (!mayAnswer(await autonomyOf(draft.projectId))) {
    console.log(`arc agent: ${draft.id} filed and waiting (autonomy is manual)`);
    return;
  }

  try {
    const arc = await db.get(`
      SELECT id, arc_number AS "arcNumber", title, description, details,
             throughline, out_of_scope AS "outOfScope", is_protected AS "isProtected"
      FROM story_arcs WHERE id = ?
    `, arcId);
    if (!arc) throw new Error(`no arc with id ${arcId}`);
    if (arc.isProtected) {
      console.log(`arc agent: ${arc.title} is protected, nothing proposed`);
      return;
    }
    arc.details = parseList(arc.details);
    arc.outOfScope = parseList(arc.outOfScope);
    const acts = (await db.all(`
      SELECT id, act_number AS "actNumber", title, span, summary, beats
      FROM arc_acts WHERE arc_id = ? ORDER BY act_number, created_at
    `, arcId)).map((a) => ({ ...a, beats: parseList(a.beats) }));
    const actId = draft.payload?.actId;
    const act = actId ? acts.find((a) => a.id === actId) : null;
    if (actId && !act) throw new Error(`no act with id ${actId} in ${arc.title}`);

    const cast = await db.all(`
      SELECT name, role, motivation FROM characters
      WHERE project_id = ? AND importance = 'principal' ORDER BY name LIMIT 10
    `, draft.projectId).catch(() => []);
    const events = await db.all(`
      SELECT title, date FROM timeline_events
      WHERE project_id = ? AND parent_id IS NULL
      ORDER BY year NULLS LAST, title LIMIT 24
    `, draft.projectId).catch(() => []);
    const siblings = await db.all(`
      SELECT title, description FROM story_arcs WHERE project_id = ? AND id <> ?
      ORDER BY arc_number
    `, draft.projectId, arcId).catch(() => []);
    const works = await db.all(`
      SELECT title FROM derivative_works WHERE project_id = ? ORDER BY created_at LIMIT 20
    `, draft.projectId).catch(() => []);

    const universe = await db.get(
      'SELECT persistent_goal AS "persistentGoal", guardrails FROM stories WHERE id = ?',
      draft.projectId,
    );
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

    const asking = {
      arc, acts, cast, works, fields, direction,
      brief: draft.payload?.brief, previous: draft.payload?.previous, note: draft.payload?.note,
    };
    // An act is written inside its arc, with the acts around it in view.
    const { prompt, asked } = act
      ? buildArcActPrompt({ ...asking, act })
      : buildArcPrompt({ ...asking, events, siblings });
    const proposed = checkArcAnswer(extractJson(await runAgent(prompt)), asked);
    if (!proposed) throw new Error('the answer held none of the fields asked for');

    await db.run(`
      UPDATE generated_drafts
      SET payload = ?, model_name = ?, updated_at = now()
      WHERE id = ? AND status = 'generated'
    `, JSON.stringify({ ...draft.payload, proposed }), agentModel(), draft.id);
    console.log(`arc agent: proposed ${Object.keys(proposed).join(', ')} for ${act ? `act ${act.actNumber} of ` : ''}${arc.title}`);
  } catch (error) {
    await giveUp(draft, 'arc agent', error);
  }
}

/**
 * Everything a work needs to be written in place: the works it is a part of,
 * the parts on either side of it (the one before by its last lines), what it
 * is already made of, its cast, what it draws on, and the arcs of the universe.
 */
async function workContext(draft, workId) {
  const work = await db.get(`
    SELECT id, title, type, description, content, parent_id AS "parentId",
           part_number AS "partNumber", source_canon_references AS refs,
           arc_id AS "arcId", act_id AS "actId"
    FROM derivative_works WHERE id = ?
  `, workId);
  if (!work) throw new Error(`no work with id ${workId}`);

  const chain = [];
  let up = work.parentId;
  for (let i = 0; up && i < 4; i += 1) {
    const p = await db.get('SELECT id, title, description, parent_id AS "parentId", arc_id AS "arcId" FROM derivative_works WHERE id = ?', up);
    if (!p) break;
    chain.unshift(p);
    up = p.parentId;
  }

  let before = null;
  let after = null;
  if (work.parentId) {
    const siblings = await db.all(`
      SELECT id, title, description, content, part_number AS "partNumber"
      FROM derivative_works WHERE parent_id = ? ORDER BY part_number NULLS LAST, created_at
    `, work.parentId);
    const at = siblings.findIndex((s) => s.id === work.id);
    if (at > 0) {
      const b = siblings[at - 1];
      before = { title: b.title, tail: String(b.content ?? '').trim().slice(-1500) };
    }
    if (at >= 0 && at < siblings.length - 1) after = siblings[at + 1];
  }

  const children = await db.all(`
    SELECT title, description, part_number AS "partNumber" FROM derivative_works
    WHERE parent_id = ? ORDER BY part_number NULLS LAST, created_at
  `, work.id);

  let cast = await db.all(`
    SELECT c.name, c.role, c.motivation FROM work_characters wc
    JOIN characters c ON c.id = wc.character_id WHERE wc.work_id = ?
    ORDER BY wc.billing NULLS LAST, c.name LIMIT 12
  `, work.id).catch(() => []);
  if (!cast.length && work.parentId) {
    cast = await db.all(`
      SELECT c.name, c.role, c.motivation FROM work_characters wc
      JOIN characters c ON c.id = wc.character_id WHERE wc.work_id = ?
      ORDER BY wc.billing NULLS LAST, c.name LIMIT 12
    `, chain[0]?.id ?? work.parentId).catch(() => []);
  }
  if (!cast.length) {
    cast = await db.all(`
      SELECT name, role, motivation FROM characters
      WHERE project_id = ? AND importance = 'principal' ORDER BY name LIMIT 10
    `, draft.projectId).catch(() => []);
  }

  let refs = [];
  try { refs = typeof work.refs === 'string' ? JSON.parse(work.refs) : (work.refs ?? []); } catch { refs = []; }
  const arcs = await db.all(
    'SELECT title, description FROM story_arcs WHERE project_id = ? ORDER BY arc_number', draft.projectId,
  ).catch(() => []);

  const universe = await db.get(
    'SELECT persistent_goal AS "persistentGoal", guardrails FROM stories WHERE id = ?', draft.projectId,
  );
  const direction = {
    persistentGoal: universe?.persistentGoal ?? '',
    guardrails: (() => {
      try {
        const parsed = typeof universe?.guardrails === 'string' ? JSON.parse(universe.guardrails) : universe?.guardrails;
        return Array.isArray(parsed) ? parsed : [];
      } catch { return []; }
    })(),
  };

  // The arc it tells -- its own, or the nearest work above it -- in full, and
  // the act a part tells.
  const arcId = work.arcId ?? [...chain].reverse().find((c) => c.arcId)?.arcId ?? null;
  let arc = null;
  let act = null;
  if (arcId) {
    const row = await db.get(
      'SELECT id, title, description, throughline, out_of_scope AS "outOfScope" FROM story_arcs WHERE id = ?', arcId,
    );
    if (row) {
      const acts = (await db.all(`
        SELECT id, act_number AS "actNumber", title, summary, beats FROM arc_acts WHERE arc_id = ? ORDER BY act_number
      `, arcId)).map((x) => ({ ...x, beats: parseList(x.beats) }));
      arc = { ...row, outOfScope: parseList(row.outOfScope), acts };
      act = work.actId ? acts.find((x) => x.id === work.actId) ?? null : null;
    }
  }

  return { work, chain, before, after, children, cast, refs: Array.isArray(refs) ? refs : [], arcs, direction, arc, act };
}

/** Past this, a part's prose is written, and the agent does not rewrite it. */
const WRITTEN_WORDS = 300;

/** Write a work's description, or compose a part's prose. */
async function answerWorkRequest(draft) {
  if (draft.artifactType !== WORK_CANON_REQUEST || !agentEnabled()) return;
  const workId = draft.payload?.workId;
  const fields = draft.payload?.fields ?? [];
  if (!workId || !fields.length) return;
  if (!mayAnswer(await autonomyOf(draft.projectId))) {
    console.log(`work agent: ${draft.id} filed and waiting (autonomy is manual)`);
    return;
  }
  try {
    const ctx = await workContext(draft, workId);
    // Written prose is the author's to revise, a passage at a time. A request
    // to recompose a written part would replace all of it with a proposal to
    // accept whole, so it is refused here rather than only hidden in the page.
    const words = String(ctx.work.content ?? '').trim().split(/\s+/).filter(Boolean).length;
    if (fields.includes('content') && words > WRITTEN_WORDS && !draft.payload?.note) {
      throw new Error(`${ctx.work.title} is already written (${words} words); `
        + 'it is revised by editing it, not by composing it again');
    }
    const { prompt, asked } = buildWorkPrompt({
      ...ctx, fields, brief: draft.payload?.brief,
      previous: draft.payload?.previous, note: draft.payload?.note,
    });
    // A chapter takes a minute or two to write; the default is sized for fields.
    const raw = await runAgent(prompt, asked.includes('content') ? { timeoutMs: 480_000 } : undefined);
    const proposed = readWorkAnswer(raw, asked);
    if (!proposed) throw new Error('the answer held none of the fields asked for');
    await db.run(`
      UPDATE generated_drafts SET payload = ?, model_name = ?, updated_at = now()
      WHERE id = ? AND status = 'generated'
    `, JSON.stringify({ ...draft.payload, proposed }), agentModel(), draft.id);
    console.log(`work agent: proposed ${Object.keys(proposed).join(', ')} for ${ctx.work.title}`);
  } catch (error) {
    await giveUp(draft, 'work agent', error);
  }
}

/** Propose the parts a work is made of. Nothing is created by asking. */
async function answerWorkPartsRequest(draft) {
  if (draft.artifactType !== WORK_PARTS_REQUEST || !agentEnabled()) return;
  const workId = draft.payload?.workId;
  if (!workId) return;
  if (!mayAnswer(await autonomyOf(draft.projectId))) {
    console.log(`work parts agent: ${draft.id} filed and waiting (autonomy is manual)`);
    return;
  }
  try {
    const ctx = await workContext(draft, workId);
    const { prompt } = buildWorkPartsPrompt({
      ...ctx, brief: draft.payload?.brief, previous: draft.payload?.previous, note: draft.payload?.note,
    });
    const proposed = checkWorkPartsAnswer(extractJson(await runAgent(prompt)));
    if (!proposed) throw new Error('the answer proposed no parts');
    await db.run(`
      UPDATE generated_drafts SET payload = ?, model_name = ?, updated_at = now()
      WHERE id = ? AND status = 'generated'
    `, JSON.stringify({ ...draft.payload, proposed }), agentModel(), draft.id);
    console.log(`work parts agent: ${proposed.parts.length} parts for ${ctx.work.title}`);
  } catch (error) {
    await giveUp(draft, 'work parts agent', error);
  }
}

function announce(draft) {
  void answerCanonRequest(draft);
  void answerImageRequest(draft);
  void answerSurveyRequest(draft);
  void answerDirectionRequest(draft);
  void answerMapRequest(draft);
  void answerPlaceRequest(draft);
  void answerPlaceImageRequest(draft);
  void answerPlaceCanonRequest(draft);
  void answerEventCanonRequest(draft);
  void answerEventImageRequest(draft);
  void answerEventPartsRequest(draft);
  void answerSocietyRequest(draft);
  void answerSocietyImageRequest(draft);
  void answerCreatureRequest(draft);
  void answerCreatureImageRequest(draft);
  void answerTechnologyRequest(draft);
  void answerTechnologyImageRequest(draft);
  void answerArcRequest(draft);
  void answerWorkRequest(draft);
  void answerWorkPartsRequest(draft);
  const url = env('CANON_REQUEST_WEBHOOK');
  if (!url) return;
  const body = JSON.stringify({ event: 'draft.created', draft });
  fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body })
    .then((res) => {
      if (!res.ok) console.warn(`canon request webhook ${url} answered ${res.status}`);
    })
    .catch((error) => console.warn(`canon request webhook ${url} failed: ${error.message}`));
}

/** What makes two requests the same request: what was asked, of what. */
const fingerprintOf = (artifactType, payload) => createHash('sha256')
  .update(`${artifactType}:${JSON.stringify(payload ?? {})}`).digest('hex').slice(0, 32);

/**
 * File a request from the server itself, the way the route does: stored once
 * per fingerprint, and announced so its agent answers it. Deleting a record
 * uses this to ask for the records that mention it to be tidied. Returns the
 * request, or null when the same request is already open.
 */
export async function fileRequest({ projectId, artifactType, payload }) {
  const fingerprint = fingerprintOf(artifactType, payload);
  const duplicate = await db.get(
    `SELECT id FROM generated_drafts
     WHERE project_id = ? AND prompt_fingerprint = ? AND status <> 'rejected'`,
    projectId, fingerprint,
  );
  if (duplicate) return null;
  const id = `draft-${randomUUID().slice(0, 8)}`;
  await db.run(`
    INSERT INTO generated_drafts
      (id, project_id, artifact_type, payload, status, model_provider, model_name,
       dashboard_task_id, prompt_fingerprint)
    VALUES (?, ?, ?, ?, 'generated', '', '', '', ?)
  `, id, projectId, artifactType, JSON.stringify(payload ?? {}), fingerprint);
  const created = toArtifact(await db.get('SELECT * FROM generated_drafts WHERE id = ?', id));
  announce(created);
  return created;
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
  const fingerprint = req.body.promptFingerprint || fingerprintOf(artifactType, payload);
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
