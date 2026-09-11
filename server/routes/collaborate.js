import { Router } from 'express';
import db from '../db.js';
import { CANON_REQUEST, agentEnabled, extractJson, runAgent } from '../canonAgent.js';
import { PLACE_CANON_REQUEST, PLACE_FIELD_NOTES } from '../placeCanonAgent.js';
import { EVENT_CANON_REQUEST, EVENT_FIELD_NOTES } from '../eventAgent.js';
import { SOCIETY_CANON_REQUEST, SOCIETY_FIELD_NOTES } from '../societyAgent.js';
import { CREATURE_CANON_REQUEST, CREATURE_FIELD_NOTES } from '../creatureAgent.js';
import { TECHNOLOGY_CANON_REQUEST, TECHNOLOGY_FIELD_NOTES } from '../technologyAgent.js';
import { ARC_CANON_REQUEST } from '../arcAgent.js';
import { WORK_CANON_REQUEST } from '../workAgent.js';
import { fileRequest } from './generatedDrafts.js';
import { canonIndex, describeRecord } from '../recordContext.js';
import { buildConversationPrompt, buildNewRecordsPrompt, checkNewRecords } from '../conversationAgent.js';

/**
 * A question about a record, answered in words. Nothing is filed and nothing
 * changes: the answer comes back in the same request, because a conversation
 * that has to be polled for is not one.
 */
const router = Router();

async function directionOf(projectId) {
  const universe = await db.get('SELECT persistent_goal AS goal, guardrails FROM stories WHERE id = ?', projectId);
  let guardrails = [];
  try {
    const parsed = typeof universe?.guardrails === 'string' ? JSON.parse(universe.guardrails) : universe?.guardrails;
    guardrails = Array.isArray(parsed) ? parsed : [];
  } catch { guardrails = []; }
  return { goal: universe?.goal ?? '', guardrails };
}

const turnsOf = (thread) => (Array.isArray(thread) ? thread.filter((t) => t && typeof t.text === 'string') : []);

router.post('/ask', async (req, res) => {
  const { kind, id, fields = [], thread = [], question } = req.body ?? {};
  if (typeof question !== 'string' || !question.trim()) {
    return res.status(400).json({ error: 'Ask something first.' });
  }
  const record = await describeRecord(kind, id);
  if (!record) return res.status(404).json({ error: 'There is no such record to talk about.' });
  if (!agentEnabled()) {
    return res.status(503).json({ error: 'The agent is turned off, so there is nobody to ask.' });
  }

  const universe = await db.get(
    'SELECT persistent_goal AS goal, guardrails FROM stories WHERE id = ?', record.projectId,
  );
  let guardrails = [];
  try {
    const parsed = typeof universe?.guardrails === 'string' ? JSON.parse(universe.guardrails) : universe?.guardrails;
    guardrails = Array.isArray(parsed) ? parsed : [];
  } catch { guardrails = []; }

  const prompt = buildConversationPrompt({
    record,
    index: await canonIndex(record.projectId),
    direction: { goal: universe?.goal ?? '', guardrails },
    focus: Array.isArray(fields) ? fields : [],
    thread: Array.isArray(thread) ? thread.filter((t) => t && typeof t.text === 'string') : [],
    question,
  });

  try {
    const answer = String(await runAgent(prompt, { timeoutMs: 150_000 })).trim();
    if (!answer) throw new Error('the agent said nothing');
    return res.json({ answer });
  } catch (error) {
    return res.status(502).json({ error: `No answer: ${error.message}` });
  }
});

const BASE_KINDS = ['character', 'place', 'event', 'society', 'creature', 'technology', 'arc', 'work'];

/**
 * Records to make, proposed from a conversation. Nothing is made: the author
 * chooses which, and each is made the way its own surface makes one.
 */
router.post('/propose-records', async (req, res) => {
  const { kind, id, thread = [], request: now = '' } = req.body ?? {};
  const record = await describeRecord(kind, id);
  if (!record) return res.status(404).json({ error: 'There is no such record to talk about.' });
  if (!agentEnabled()) return res.status(503).json({ error: 'The agent is turned off, so there is nobody to ask.' });

  // An act only belongs to an arc, and a part to a work: they are offered
  // when the conversation is about one.
  const kinds = [...BASE_KINDS,
    ...(kind === 'arc' || kind === 'act' ? ['act'] : []),
    ...(kind === 'work' ? ['part'] : [])];
  const index = await canonIndex(record.projectId);
  const prompt = buildNewRecordsPrompt({
    record, index, direction: await directionOf(record.projectId),
    thread: turnsOf(thread), request: typeof now === 'string' ? now : '', kinds,
  });

  let proposed;
  try {
    proposed = extractJson(await runAgent(prompt, { timeoutMs: 150_000 }));
  } catch (error) {
    return res.status(502).json({ error: `No proposal: ${error.message}` });
  }
  const kept = checkNewRecords(proposed, {
    kinds, existing: [...index.names.values()].map((n) => String(n).toLowerCase()),
  });

  // Where each goes. A place or an event can sit inside one that exists; an
  // act goes in the arc being talked about, and a part in the work.
  const arcId = kind === 'arc' ? id
    : kind === 'act' ? (await db.get('SELECT arc_id AS "arcId" FROM arc_acts WHERE id = ?', id))?.arcId ?? null
      : null;
  const arcName = arcId ? (await db.get('SELECT title FROM story_arcs WHERE id = ?', arcId))?.title ?? null : null;
  const records = [];
  for (const r of kept) {
    let parent = null;
    if (r.inside && (r.kind === 'place' || r.kind === 'event')) {
      parent = r.kind === 'place'
        ? await db.get('SELECT id, name FROM locations WHERE project_id = ? AND lower(name) = lower(?)', record.projectId, r.inside)
        : await db.get('SELECT id, title AS name FROM timeline_events WHERE project_id = ? AND lower(title) = lower(?)', record.projectId, r.inside);
    }
    if (r.kind === 'act') parent = arcId ? { id: arcId, name: arcName } : null;
    if (r.kind === 'part') parent = { id, name: record.name };
    records.push({ kind: r.kind, name: r.name, brief: r.brief, parentId: parent?.id ?? null, parentName: parent?.name ?? null });
  }
  return res.json({ projectId: record.projectId, records });
});

/**
 * Newly made records, written: the usual request for each field, carrying
 * what the record is meant to be and the conversation it came from. The
 * answers arrive as proposals on each record, to put in force or refuse.
 */
const WRITE = {
  character: {
    type: CANON_REQUEST, table: 'characters', key: 'characterId',
    // All of them, as the cast's own New asks when a character is described.
    fields: ['background', 'description', 'appearance', 'motivation', 'tendencies',
      'traits', 'coreSkills', 'specialAbilities', 'notableMoments'],
  },
  place: { type: PLACE_CANON_REQUEST, table: 'locations', key: 'locationId', fields: Object.keys(PLACE_FIELD_NOTES) },
  event: { type: EVENT_CANON_REQUEST, table: 'timeline_events', key: 'eventId', fields: Object.keys(EVENT_FIELD_NOTES) },
  society: { type: SOCIETY_CANON_REQUEST, table: 'factions', key: 'factionId', fields: Object.keys(SOCIETY_FIELD_NOTES) },
  creature: { type: CREATURE_CANON_REQUEST, table: 'bestiary', key: 'creatureId', fields: Object.keys(CREATURE_FIELD_NOTES) },
  technology: {
    type: TECHNOLOGY_CANON_REQUEST, table: 'technologies', key: 'technologyId', fields: Object.keys(TECHNOLOGY_FIELD_NOTES),
  },
  arc: { type: ARC_CANON_REQUEST, table: 'story_arcs', key: 'arcId', fields: ['description', 'throughline', 'outOfScope'] },
  work: { type: WORK_CANON_REQUEST, table: 'derivative_works', key: 'workId', fields: ['description'] },
  part: { type: WORK_CANON_REQUEST, table: 'derivative_works', key: 'workId', fields: ['description'] },
  act: { type: ARC_CANON_REQUEST, fields: ['summary', 'beats'] },
};

router.post('/write', async (req, res) => {
  const { records = [], thread = [] } = req.body ?? {};
  const talk = turnsOf(thread).slice(-10)
    .map((t) => `${t.role === 'agent' ? 'You' : 'Author'}: ${t.text}`).join('\n');
  let filed = 0;
  const missing = [];
  for (const r of (Array.isArray(records) ? records : []).slice(0, 12)) {
    const plan = WRITE[r?.kind];
    if (!plan || typeof r.id !== 'string') continue;
    const row = r.kind === 'act'
      ? await db.get('SELECT arc.project_id AS "projectId", a.arc_id AS "arcId" FROM arc_acts a JOIN story_arcs arc ON arc.id = a.arc_id WHERE a.id = ?', r.id)
      : await db.get(`SELECT project_id AS "projectId" FROM ${plan.table} WHERE id = ?`, r.id);
    if (!row) { missing.push(r.id); continue; }
    const brief = [
      said(r.brief),
      talk && `It comes from a conversation with the author:\n${talk}`,
    ].filter(Boolean).join('\n\n').slice(0, 6000);
    const record = r.kind === 'act' ? { arcId: row.arcId, actId: r.id } : { [plan.key]: r.id };
    // One request per field, as each surface asks: several fields in one
    // answer come back as one.
    for (const field of plan.fields) {
      if (await fileRequest({ projectId: row.projectId, artifactType: plan.type, payload: { ...record, fields: [field], brief } })) filed += 1;
    }
  }
  return res.json({ filed, missing });
});

function said(v) { return String(v ?? '').replace(/\s+/g, ' ').trim(); }

export default router;
