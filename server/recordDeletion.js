/**
 * Deleting a record, and saying first what else it takes.
 *
 * The server could delete almost everything and nothing asked it to; when it
 * did, it deleted the row and nothing else. Most of what points at a record is
 * not a foreign key -- a place's own places, a character's current location,
 * the characters an event names, a picture's subject, a tie between two
 * records -- so a delete left all of that pointing at nothing, and every
 * surface that followed one of those references found an empty page.
 *
 * So there is one way to delete a record, and it does three things together:
 * refuses what is protected, says in words what else will change, and changes
 * it in the same transaction as the delete. What nests moves up a level rather
 * than disappearing; what only mentioned the record stops mentioning it;
 * pictures stay in Media, linked to nothing, because a picture is not the
 * thing it was a picture of.
 */
import db from './db.js';

const RECORDS = {
  character: { table: 'characters', name: 'name', pictures: ['character'], them: 'them' },
  place: { table: 'locations', name: 'name', pictures: ['location'] },
  event: { table: 'timeline_events', name: 'title', pictures: ['event'] },
  society: { table: 'factions', name: 'name', pictures: ['faction_crest'] },
  creature: { table: 'bestiary', name: 'name', pictures: ['creature'] },
  technology: { table: 'technologies', name: 'name', pictures: ['technology'] },
  arc: { table: 'story_arcs', name: 'title' },
  act: { table: 'arc_acts', name: 'title', unguarded: true },
  work: { table: 'derivative_works', name: 'title', unguarded: true },
  picture: { table: 'media_assets', name: 'title', unguarded: true },
};

export const RECORD_KINDS = Object.keys(RECORDS);

const number = async (q, sql, ...params) => Number((await q.get(sql, ...params))?.n ?? 0);
const count = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const s = (n) => (n === 1 ? 's' : '');

const parse = (value) => {
  try {
    const parsed = JSON.parse(value ?? '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

/** An entry in a JSON list names the id: it is the id, or an object holding it. */
const names = (entry, id) => entry === id
  || (entry !== null && typeof entry === 'object' && Object.values(entry).includes(id));

/** Rows whose JSON list column names the id. The LIKE narrows; the parse decides. */
async function mentioning(q, table, column, id, projectId) {
  const rows = await q.all(
    `SELECT id, ${column} AS list FROM ${table} WHERE project_id = ? AND ${column} LIKE ?`,
    projectId, `%${JSON.stringify(id)}%`,
  );
  return rows.filter((row) => parse(row.list).some((entry) => names(entry, id)));
}

async function unmention(q, table, column, id, projectId) {
  for (const row of await mentioning(q, table, column, id, projectId)) {
    const kept = parse(row.list).filter((entry) => !names(entry, id));
    await q.run(`UPDATE ${table} SET ${column} = ? WHERE id = ?`, JSON.stringify(kept), row.id);
  }
}

async function load(q, kind, id) {
  const spec = RECORDS[kind];
  if (!spec) return null;
  if (kind === 'act') {
    return q.get(`
      SELECT a.id, a.title AS name, a.arc_id AS "arcId", a.act_number AS "actNumber",
             arc.project_id AS "projectId", false AS protected
      FROM arc_acts a JOIN story_arcs arc ON arc.id = a.arc_id WHERE a.id = ?
    `, id);
  }
  const guard = spec.unguarded ? 'false' : 'coalesce(is_protected, false)';
  const parent = kind === 'place' || kind === 'event' ? ', parent_id AS "parentId"' : '';
  return q.get(`
    SELECT id, ${spec.name} AS name, project_id AS "projectId", ${guard} AS protected${parent}
    FROM ${spec.table} WHERE id = ?
  `, id);
}

const tiesOf = (q, id) => number(q,
  'SELECT count(*) AS n FROM canon_relationships WHERE source_entity_id = ? OR target_entity_id = ?', id, id);

/** What deleting it changes, in words. Null when there is no such record. */
export async function consequences(kind, id) {
  const q = db;
  const row = await load(q, kind, id);
  if (!row) return null;
  const spec = RECORDS[kind];
  const it = spec.them ?? 'it';
  const effects = [];
  const say = (n, text) => { if (n > 0) effects.push(text); };
  const ties = async () => {
    const n = await tiesOf(q, id);
    say(n, `${count(n, 'recorded tie')} to and from ${it} go${n === 1 ? 'es' : ''} with ${it}.`);
  };

  switch (kind) {
    case 'character': {
      await ties();
      const cast = await number(q, 'SELECT count(*) AS n FROM work_characters WHERE character_id = ?', id);
      say(cast, `They come off the cast of ${count(cast, 'work')}.`);
      const events = (await mentioning(q, 'timeline_events', 'characters', id, row.projectId)).length;
      say(events, `${count(events, 'event')} stop${s(events)} naming them.`);
      const others = (await mentioning(q, 'characters', 'relationships', id, row.projectId))
        .filter((r) => r.id !== id).length;
      say(others, `${count(others, 'other character')} stop${s(others)} pointing to them.`);
      break;
    }
    case 'place': {
      const inside = await number(q, 'SELECT count(*) AS n FROM locations WHERE parent_id = ?', id);
      const up = row.parentId
        ? (await q.get('SELECT name FROM locations WHERE id = ?', row.parentId))?.name
        : null;
      say(inside, `${inside === 1 ? 'The place' : `The ${inside} places`} inside it move${s(inside)} up to ${up ?? 'the top level'}.`);
      const people = await number(q, 'SELECT count(*) AS n FROM characters WHERE current_location_id = ?', id);
      say(people, `${count(people, 'character')} ${people === 1 ? 'is' : 'are'} no longer placed anywhere.`);
      const events = await number(q, 'SELECT count(*) AS n FROM timeline_events WHERE location_id = ?', id);
      say(events, `${count(events, 'event')} no longer say${s(events)} where ${events === 1 ? 'it' : 'they'} happened.`);
      const range = await number(q, 'SELECT count(*) AS n FROM bestiary_ranges WHERE location_id = ?', id);
      say(range, `It leaves the range of ${count(range, 'creature')}.`);
      const tech = await number(q, 'SELECT count(*) AS n FROM technologies WHERE origin_location_id = ?', id);
      say(tech, `${count(tech, 'technology', 'technologies')} no longer say${s(tech)} where ${tech === 1 ? 'it' : 'they'} came from.`);
      const maps = await number(q, 'SELECT count(*) AS n FROM location_maps WHERE location_id = ?', id);
      say(maps, `${maps === 1 ? 'Its map is' : `Its ${maps} maps are`} unlinked; the picture${maps === 1 ? ' stays' : 's stay'} in Media.`);
      const pins = await number(q, 'SELECT count(*) AS n FROM location_pins WHERE location_id = ?', id);
      say(pins, `It comes off ${count(pins, 'map')} it was pinned to.`);
      const drawn = await number(q, 'SELECT (SELECT count(*) FROM map_paths WHERE context_id = ?) + (SELECT count(*) FROM map_terrain WHERE context_id = ?) AS n', id, id);
      say(drawn, 'The paths and terrain drawn on its map go with it.');
      await ties();
      break;
    }
    case 'event': {
      const inside = await number(q, 'SELECT count(*) AS n FROM timeline_events WHERE parent_id = ?', id);
      const up = row.parentId
        ? (await q.get('SELECT title FROM timeline_events WHERE id = ?', row.parentId))?.title
        : null;
      say(inside, `${inside === 1 ? 'The event' : `The ${inside} events`} inside it move${s(inside)} up to ${up ?? 'the top of the chronicle'}.`);
      const linked = new Set([
        ...(await mentioning(q, 'timeline_events', 'before_event_ids', id, row.projectId)),
        ...(await mentioning(q, 'timeline_events', 'after_event_ids', id, row.projectId)),
      ].map((r) => r.id)).size;
      say(linked, `${count(linked, 'other event')} stop${s(linked)} pointing to it as coming before or after.`);
      await ties();
      break;
    }
    case 'society': {
      const held = await number(q, 'SELECT count(*) AS n FROM technologies WHERE holder_faction_id = ?', id);
      say(held, `${count(held, 'technology', 'technologies')} ${held === 1 ? 'is' : 'are'} no longer held by anyone.`);
      const events = (await mentioning(q, 'timeline_events', 'factions', id, row.projectId)).length;
      say(events, `${count(events, 'event')} stop${s(events)} naming it.`);
      const members = (await mentioning(q, 'characters', 'relationships', id, row.projectId)).length;
      say(members, `${count(members, 'character')} stop${s(members)} being counted among it.`);
      await ties();
      break;
    }
    case 'creature': {
      const range = await number(q, 'SELECT count(*) AS n FROM bestiary_ranges WHERE bestiary_id = ?', id);
      say(range, `Its range across ${count(range, 'place')} goes with it.`);
      await ties();
      break;
    }
    case 'technology':
      await ties();
      break;
    case 'arc': {
      const acts = await number(q, 'SELECT count(*) AS n FROM arc_acts WHERE arc_id = ?', id);
      say(acts, acts === 1 ? 'Its act goes with it.' : `Its ${acts} acts go with it.`);
      break;
    }
    case 'act': {
      const after = await number(q, 'SELECT count(*) AS n FROM arc_acts WHERE arc_id = ? AND act_number > ?', row.arcId, row.actNumber);
      say(after, `${after === 1 ? 'The act' : `The ${after} acts`} after it move${s(after)} up a number.`);
      break;
    }
    case 'work': {
      const parts = await number(q, 'SELECT count(*) AS n FROM derivative_works WHERE parent_id = ?', id);
      say(parts, parts === 1 ? 'Its part becomes a work of its own.' : `Its ${parts} parts become works of their own.`);
      const drafts = await number(q, 'SELECT count(*) AS n FROM work_drafts WHERE work_id = ?', id);
      say(drafts, drafts === 1 ? 'Its earlier draft goes with it.' : `Its ${drafts} earlier drafts go with it.`);
      const read = await number(q, 'SELECT count(*) AS n FROM stories WHERE active_work_id = ?', id);
      say(read, 'The universe stops being read through it.');
      break;
    }
    case 'picture': {
      const maps = await number(q, 'SELECT count(*) AS n FROM location_maps WHERE media_asset_id = ?', id);
      say(maps, `It is the map of ${count(maps, 'place')}; ${maps === 1 ? 'that map goes' : 'those maps go'} with it.`);
      break;
    }
    default:
      break;
  }

  if (spec.pictures) {
    const pictures = await number(q,
      'SELECT count(*) AS n FROM media_assets WHERE subject_id = ? AND subject_type = ANY(?::text[])', id, spec.pictures);
    say(pictures, `${count(pictures, 'picture')} of ${it} stay${s(pictures)} in Media, linked to nothing.`);
  }

  return { name: row.name || `this ${kind}`, protected: Boolean(row.protected), effects };
}

/**
 * Delete it, and change what `consequences` said would change, in one
 * transaction. Returns a status: 404 when there is no such record, 403 when it
 * is protected.
 */
export async function remove(kind, id) {
  const spec = RECORDS[kind];
  return db.transaction(async (q) => {
    const row = await load(q, kind, id);
    if (!row) return { status: 404 };
    if (row.protected) {
      return { status: 403, error: `${row.name} is protected from changes, so it is not deleted.` };
    }
    const { projectId } = row;
    const untie = () => q.run(
      'DELETE FROM canon_relationships WHERE source_entity_id = ? OR target_entity_id = ?', id, id,
    );

    switch (kind) {
      case 'character':
        await untie();
        await unmention(q, 'timeline_events', 'characters', id, projectId);
        await unmention(q, 'characters', 'relationships', id, projectId);
        break;
      case 'place':
        // Its own places move up a level rather than hanging off nothing.
        await q.run('UPDATE locations SET parent_id = ? WHERE parent_id = ?', row.parentId ?? null, id);
        await q.run('UPDATE characters SET current_location_id = NULL WHERE current_location_id = ?', id);
        await q.run('UPDATE timeline_events SET location_id = NULL WHERE location_id = ?', id);
        await q.run('DELETE FROM map_paths WHERE context_id = ?', id);
        await q.run('DELETE FROM map_terrain WHERE context_id = ?', id);
        await untie();
        break;
      case 'event':
        await q.run('UPDATE timeline_events SET parent_id = ? WHERE parent_id = ?', row.parentId ?? null, id);
        await unmention(q, 'timeline_events', 'before_event_ids', id, projectId);
        await unmention(q, 'timeline_events', 'after_event_ids', id, projectId);
        await untie();
        break;
      case 'society':
        await unmention(q, 'timeline_events', 'factions', id, projectId);
        await unmention(q, 'characters', 'relationships', id, projectId);
        await untie();
        break;
      case 'creature':
      case 'technology':
        await untie();
        break;
      case 'work':
        // Its parts become works of their own (the foreign key clears their
        // parent); a work of its own has no part number.
        await q.run('UPDATE derivative_works SET part_number = NULL WHERE parent_id = ?', id);
        break;
      default:
        break;
    }

    if (spec.pictures) {
      await q.run(
        'UPDATE media_assets SET subject_id = NULL, subject_type = NULL WHERE subject_id = ? AND subject_type = ANY(?::text[])',
        id, spec.pictures,
      );
    }
    await q.run(`DELETE FROM ${spec.table} WHERE id = ?`, id);

    if (kind === 'act') {
      await q.run('UPDATE arc_acts SET act_number = act_number - 1 WHERE arc_id = ? AND act_number > ?',
        row.arcId, row.actNumber);
    }
    return { status: 200, name: row.name };
  });
}
