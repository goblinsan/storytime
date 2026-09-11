/**
 * The timeline, in depth.
 *
 * A chronicle is a list until you want to look at one entry, and then it is
 * the least useful shape there is: a battle that takes three chapters to tell
 * gets the same single line as a treaty signed in an afternoon.
 *
 * So an event has a record of its own, pictures of its own, and can be broken
 * into the sequence it actually was. The same three ideas geography uses for a
 * place, because an event is the other axis of the same question -- what
 * happened, where, and what it left.
 *
 * WHAT `year` IS FOR, AND IS NOT
 * `date` is what an author wrote and is the only thing ever shown. `year` is a
 * number parsed out of it so a range can be asked for, and it is nullable
 * because "before the Collapse" is a real date and inventing a number for it
 * would be worse than admitting there is none.
 */
import { Router } from 'express';
import db from '../db.js';

const router = Router();

const EVENT_SELECT = `
  SELECT e.id, e.project_id AS "projectId", e.date, e.year, e.title, e.description,
         e.account, e.consequences, e.remembrance,
         e.parent_id AS "parentId", e.location_id AS "locationId",
         e.is_protected AS "isProtected",
         -- What it comes before, so events in the same year can be listed in
         -- the order they happened rather than by title. Parsed here, and
         -- anything that is not a list reads as none.
         CASE WHEN left(ltrim(coalesce(e.before_event_ids, '')), 1) = '['
              THEN e.before_event_ids::jsonb ELSE '[]'::jsonb END AS "beforeEventIds",
         l.name AS "locationName"
  FROM timeline_events e
  LEFT JOIN locations l ON l.id = e.location_id
`;

/**
 * GET /events?projectId=X[&from=N][&to=N]
 *
 * The index, and the span it covers.
 *
 * `span` is the whole universe's range rather than the filtered one, because a
 * control for narrowing a range has to know the range it is narrowing. Sending
 * back the range of what survived the filter would make the control redraw
 * itself around its own answer.
 */
router.get('/', async (req, res) => {
  const { projectId, from, to } = req.query;
  if (!projectId) return res.status(400).json({ error: 'projectId required' });

  const span = await db.get(`
    SELECT min(year) AS "first", max(year) AS "last",
           count(*)::int AS "total",
           count(*) FILTER (WHERE year IS NULL)::int AS "undated"
    FROM timeline_events WHERE project_id = ?
  `, projectId);

  const where = ['e.project_id = ?'];
  const params = [projectId];
  if (from !== undefined && from !== '') {
    // An event with no year is kept whatever the range: it is not outside it,
    // it is unplaced, and dropping it would quietly hide records.
    where.push('(e.year IS NULL OR e.year >= ?)');
    params.push(Number(from));
  }
  if (to !== undefined && to !== '') {
    where.push('(e.year IS NULL OR e.year <= ?)');
    params.push(Number(to));
  }

  const events = await db.all(`
    ${EVENT_SELECT} WHERE ${where.join(' AND ')}
    ORDER BY e.year NULLS LAST, e.date, e.title
  `, ...params);

  // How many events each one contains, so the index can say which entries open
  // into something without loading every child.
  const inside = await db.all(`
    SELECT parent_id AS "parentId", count(*)::int AS n
    FROM timeline_events
    WHERE project_id = ? AND parent_id IS NOT NULL
    GROUP BY parent_id
  `, projectId);
  const counts = new Map(inside.map((r) => [r.parentId, r.n]));

  const pictured = await db.all(`
    SELECT subject_id AS "id", count(*)::int AS n FROM media_assets
    WHERE project_id = ? AND subject_type = 'event' GROUP BY subject_id
  `, projectId).catch(() => []);
  const pictures = new Map(pictured.map((r) => [r.id, r.n]));

  return res.json({
    span,
    events: events.map((e) => ({
      ...e,
      insideCount: counts.get(e.id) ?? 0,
      pictureCount: pictures.get(e.id) ?? 0,
    })),
  });
});

/**
 * GET /events/:eventId
 *
 * One event: its record, what it breaks into, what it is part of, and its
 * pictures.
 */
router.get('/:eventId', async (req, res) => {
  const event = await db.get(`${EVENT_SELECT} WHERE e.id = ?`, req.params.eventId);
  if (!event) return res.status(404).json({ error: 'Event not found' });

  const inside = await db.all(`
    ${EVENT_SELECT} WHERE e.parent_id = ? ORDER BY e.year NULLS LAST, e.date, e.title
  `, event.id);

  const partOf = event.parentId
    ? await db.get('SELECT id, title, date FROM timeline_events WHERE id = ?', event.parentId)
    : null;

  const pictures = await db.all(`
    SELECT id, url, kind, title, caption FROM media_assets
    WHERE subject_type = 'event' AND subject_id = ? AND kind <> 'map'
    ORDER BY created_at DESC
  `, event.id);

  return res.json({ event, inside, partOf, pictures });
});

/**
 * POST /events/:eventId/inside
 *
 * Break an event into a part of itself.
 *
 * The new event inherits the parent's date rather than being left undated: a
 * scene inside a siege happens when the siege happens unless somebody says
 * otherwise, and an undated child would fall to the bottom of every ordering
 * away from the thing it belongs to.
 */
/**
 * A new event on the chronicle.
 *
 * The surface could break an existing event into parts but could not start
 * one, so every entry had to arrive from somewhere else and a universe with an
 * empty timeline stayed empty.
 *
 * The date is what the author wrote and is the only form ever shown; the year
 * is parsed out of it so the range control has a number to work with, by the
 * same rule the rest of this file uses -- the LAST run of digits, because
 * "Year of the Iron Dirge 304" is a date whose number is at the end.
 */
router.post('/', async (req, res) => {
  const { projectId, title, date = '' } = req.body ?? {};
  if (!projectId) return res.status(400).json({ error: 'projectId is required' });
  if (typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ error: 'title is required' });
  }

  const project = await db.get('SELECT id FROM stories WHERE id = ?', projectId);
  if (!project) return res.status(404).json({ error: 'Universe not found' });

  const id = `evt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const said = typeof date === 'string' ? date.trim() : '';
  const year = (String(said).match(/(\d+)(?!.*\d)/) || [])[1] ?? null;

  await db.run(`
    INSERT INTO timeline_events (id, project_id, date, year, title)
    VALUES (?, ?, ?, ?, ?)
  `, id, projectId, said, year === null ? null : Number(year), title.trim());

  return res.status(201).json(await db.get(`${EVENT_SELECT} WHERE e.id = ?`, id));
});

router.post('/:eventId/inside', async (req, res) => {
  const { title, date } = req.body ?? {};
  if (typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ error: 'title is required' });
  }
  const parent = await db.get(
    'SELECT id, project_id AS "projectId", date, year FROM timeline_events WHERE id = ?',
    req.params.eventId,
  );
  if (!parent) return res.status(404).json({ error: 'Event not found' });

  const id = `evt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const said = typeof date === 'string' && date.trim() ? date.trim() : parent.date;
  const year = (String(said).match(/(\d+)(?!.*\d)/) || [])[1] ?? null;

  await db.run(`
    INSERT INTO timeline_events (id, project_id, date, year, title, parent_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `, id, parent.projectId, said, year === null ? null : Number(year), title.trim(), parent.id);

  return res.status(201).json(await db.get(`${EVENT_SELECT} WHERE e.id = ?`, id));
});

/** Partial update. The server COALESCEs, so an omitted field is left alone. */
router.patch('/:eventId', async (req, res) => {
  const existing = await db.get('SELECT id FROM timeline_events WHERE id = ?', req.params.eventId);
  if (!existing) return res.status(404).json({ error: 'Event not found' });

  const {
    title, date, description, account, consequences, remembrance, locationId, parentId,
  } = req.body ?? {};

  // The label and the number are one fact written twice, so writing the label
  // re-reads the number. Letting them drift is how an event sorts to a year it
  // does not claim.
  const year = typeof date === 'string' && date.trim()
    ? ((String(date).match(/(\d+)(?!.*\d)/) || [])[1] ?? null)
    : undefined;

  // Moving an event: sent at all means asked for, so null moves it to the top
  // of the chronicle -- which COALESCE could never do. It may not go inside
  // itself, or inside anything that is already inside it: that is a loop, and
  // the chronicle would draw it as an event that contains its own container.
  const moving = Object.prototype.hasOwnProperty.call(req.body ?? {}, 'parentId');
  if (moving && parentId) {
    if (parentId === req.params.eventId) {
      return res.status(400).json({ error: 'An event cannot be part of itself.' });
    }
    const target = await db.get(
      'SELECT id, project_id AS "projectId" FROM timeline_events WHERE id = ?', parentId,
    );
    if (!target) return res.status(400).json({ error: 'There is no such event to move it into.' });
    for (let at = target.id, steps = 0; at && steps < 100; steps += 1) {
      if (at === req.params.eventId) {
        return res.status(400).json({ error: 'That event is already inside this one, so this one cannot go inside it.' });
      }
      at = (await db.get('SELECT parent_id AS "parentId" FROM timeline_events WHERE id = ?', at))?.parentId ?? null;
    }
  }

  await db.run(`
    UPDATE timeline_events SET
      title        = COALESCE(?, title),
      date         = COALESCE(?, date),
      year         = CASE WHEN ?::text IS NULL THEN year ELSE ?::int END,
      description  = COALESCE(?, description),
      account      = COALESCE(?, account),
      consequences = COALESCE(?, consequences),
      remembrance  = COALESCE(?, remembrance),
      location_id  = COALESCE(?, location_id),
      parent_id    = CASE WHEN ?::boolean THEN ? ELSE parent_id END,
      updated_at   = now()
    WHERE id = ?
  `,
  title ?? null, date ?? null,
  year === undefined ? null : String(year ?? ''),
  year === undefined || year === null ? null : Number(year),
  description ?? null, account ?? null, consequences ?? null, remembrance ?? null,
  locationId ?? null, moving, moving ? (parentId || null) : null,
  req.params.eventId);

  return res.json(await db.get(`${EVENT_SELECT} WHERE e.id = ?`, req.params.eventId));
});

export default router;
