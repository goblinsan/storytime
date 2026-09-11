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
import { fileRequest } from './routes/generatedDrafts.js';
import { CANON_REQUEST } from './canonAgent.js';
import { PLACE_CANON_REQUEST } from './placeCanonAgent.js';
import { EVENT_CANON_REQUEST } from './eventAgent.js';
import { SOCIETY_CANON_REQUEST } from './societyAgent.js';
import { CREATURE_CANON_REQUEST } from './creatureAgent.js';
import { TECHNOLOGY_CANON_REQUEST } from './technologyAgent.js';
import { ARC_CANON_REQUEST } from './arcAgent.js';
import { WORK_CANON_REQUEST } from './workAgent.js';

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

/**
 * Where a record can be MENTIONED: every field an agent writes, by kind, with
 * the request that agent answers. A delete tidies the links it can see; a name
 * written into somebody else's history is not a link, and no query can decide
 * how that sentence should read once the thing it names is gone. An agent can,
 * as a proposal somebody accepts or refuses.
 */
const MENTIONS = {
  character: {
    table: 'characters', type: CANON_REQUEST, key: 'characterId', guarded: true,
    fields: {
      background: 'background', description: 'description', appearance: 'appearance',
      motivation: 'motivation', tendencies: 'tendencies', traits: 'traits',
      coreSkills: 'core_skills', specialAbilities: 'special_abilities', notableMoments: 'notable_moments',
    },
  },
  place: {
    table: 'locations', type: PLACE_CANON_REQUEST, key: 'locationId', guarded: true,
    fields: { description: 'description', history: 'history', folklore: 'folklore', biome: 'biome', ecology: 'ecology' },
  },
  event: {
    table: 'timeline_events', type: EVENT_CANON_REQUEST, key: 'eventId', guarded: true, name: 'title',
    fields: { description: 'description', account: 'account', consequences: 'consequences', remembrance: 'remembrance' },
  },
  society: {
    table: 'factions', type: SOCIETY_CANON_REQUEST, key: 'factionId', guarded: true,
    fields: {
      description: 'description', history: 'history', goals: 'goals', doctrine: 'doctrine',
      technology: 'technology', economy: 'economic_leverage', structure: 'corporate_structure',
    },
  },
  creature: {
    table: 'bestiary', type: CREATURE_CANON_REQUEST, key: 'creatureId', guarded: true,
    fields: {
      description: 'description', ecologicalNiche: 'ecological_niche', inUniverseBackstory: 'in_universe_backstory',
      motivation: 'motivation', tactics: 'tactics', notes: 'notes',
    },
  },
  technology: {
    table: 'technologies', type: TECHNOLOGY_CANON_REQUEST, key: 'technologyId', guarded: true,
    fields: {
      description: 'description', principles: 'principles', history: 'history',
      limitations: 'limitations', patentsOrTaboos: 'patents_or_taboos',
    },
  },
  arc: {
    table: 'story_arcs', type: ARC_CANON_REQUEST, key: 'arcId', guarded: true, name: 'title',
    fields: { description: 'description', throughline: 'throughline', outOfScope: 'out_of_scope', details: 'details' },
  },
  work: {
    table: 'derivative_works', type: WORK_CANON_REQUEST, key: 'workId', name: 'title',
    fields: { description: 'description' },
  },
};

const KIND_WORD = {
  character: 'character', place: 'place', event: 'event', society: 'group', creature: 'creature',
  technology: 'technology', arc: 'arc', act: 'act of an arc', work: 'work', picture: 'picture',
};

// Words that open a name without being the name somebody is called by.
const TITLES = /^(lord|lady|sir|dame|captain|commander|general|admiral|doctor|dr|king|queen|prince|princess|the|of)$/i;

/** The name, and for a person the given name they are mostly written as. */
function termsFor(kind, name) {
  const terms = [String(name ?? '').trim()].filter((t) => t.length >= 3);
  if (kind === 'character') {
    const given = String(name ?? '').split(/\s+/).find((w) => !TITLES.test(w));
    if (given && given.length >= 4 && !terms.includes(given)) terms.push(given);
  }
  return terms;
}

const matcherFor = (terms) => terms.map((t) => new RegExp(
  `(^|[^\\p{L}\\p{N}])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^\\p{L}\\p{N}])`, 'iu',
));

/**
 * Every record that names this one in a field an agent writes, with which
 * fields. Protected records are counted and left alone; a chapter's prose is
 * counted and left for its author.
 */
async function mentionsOf(q, kind, row) {
  const terms = termsFor(kind, row.name);
  const found = { records: [], protected: 0, prose: 0 };
  if (!terms.length) return found;
  const matchers = matcherFor(terms);
  const says = (text) => matchers.some((m) => m.test(String(text ?? '')));
  const like = terms.map((t) => `%${t}%`);

  for (const [targetKind, spec] of Object.entries(MENTIONS)) {
    const columns = Object.values(spec.fields);
    const where = columns.map((c) => terms.map(() => `${c} ILIKE ?`).join(' OR ')).join(' OR ');
    const rows = await q.all(`
      SELECT id, ${spec.name ?? 'name'} AS name, ${spec.guarded ? 'coalesce(is_protected, false)' : 'false'} AS protected,
             ${columns.join(', ')}
      FROM ${spec.table} WHERE project_id = ? AND id <> ? AND (${where})
    `, row.projectId, row.id, ...columns.flatMap(() => like));
    for (const hit of rows) {
      const fields = Object.entries(spec.fields).filter(([, c]) => says(hit[c])).map(([k]) => k);
      if (!fields.length) continue;
      if (hit.protected) { found.protected += 1; continue; }
      found.records.push({
        kind: targetKind, id: hit.id, name: hit.name, fields,
        type: spec.type, payload: { [spec.key]: hit.id, fields },
      });
    }
  }

  // An arc's acts. Not those of an arc being deleted: they go with it.
  const acts = await q.all(`
    SELECT a.id, a.arc_id AS "arcId", a.act_number AS "actNumber", a.title, a.summary, a.beats,
           coalesce(arc.is_protected, false) AS protected
    FROM arc_acts a JOIN story_arcs arc ON arc.id = a.arc_id
    WHERE arc.project_id = ? AND a.id <> ? AND a.arc_id <> ?
      AND (${terms.map(() => 'a.summary ILIKE ? OR a.beats ILIKE ?').join(' OR ')})
  `, row.projectId, row.id, row.id, ...like.flatMap((t) => [t, t]));
  for (const act of acts) {
    const fields = ['summary', 'beats'].filter((f) => says(act[f]));
    if (!fields.length) continue;
    if (act.protected) { found.protected += 1; continue; }
    found.records.push({
      kind: 'act', id: act.id, name: `Act ${act.actNumber}${act.title ? `: ${act.title}` : ''}`, fields,
      type: ARC_CANON_REQUEST, payload: { arcId: act.arcId, actId: act.id, fields },
    });
  }

  const prose = await q.all(`
    SELECT id, content FROM derivative_works
    WHERE project_id = ? AND id <> ? AND (${terms.map(() => 'content ILIKE ?').join(' OR ')})
  `, row.projectId, row.id, ...like);
  found.prose = prose.filter((w) => says(w.content)).length;
  return found;
}

const tidyBrief = (kind, name) => `"${name}" (a ${KIND_WORD[kind] ?? kind}) has been deleted from this universe: `
  + 'it no longer exists, and nothing should mention it as if it does. Rewrite only what refers to it -- '
  + `remove the mention, or change it so it no longer depends on ${name} -- and keep everything else exactly `
  + 'as it is written. Where it is only mentioned in passing, the smallest change is the right one.';

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

  // Pictures and mentions are choices in the dialog rather than effects: what
  // happens to them depends on what somebody picks.
  const pictures = spec.pictures ? await number(q,
    'SELECT count(*) AS n FROM media_assets WHERE subject_id = ? AND subject_type = ANY(?::text[])', id, spec.pictures) : 0;
  const mentions = await mentionsOf(q, kind, row);
  say(mentions.prose, `It is named in the prose of ${count(mentions.prose, 'work')}; prose is yours to edit, and is left alone.`);
  say(mentions.protected, `${count(mentions.protected, 'protected record')} mention${s(mentions.protected)} it and ${mentions.protected === 1 ? 'is' : 'are'} left alone.`);

  return {
    name: row.name || `this ${kind}`,
    protected: Boolean(row.protected),
    effects,
    pictures,
    mentions: mentions.records.map((m) => ({ kind: m.kind, name: m.name })),
  };
}

/**
 * Delete it, and change what `consequences` said would change, in one
 * transaction. Returns a status: 404 when there is no such record, 403 when it
 * is protected.
 */
export async function remove(kind, id, { pictures = false, tidy = false } = {}) {
  const spec = RECORDS[kind];
  // Found before the delete: afterwards there is nothing left to be named after.
  const before = tidy ? await load(db, kind, id) : null;
  const mentions = before && !before.protected ? await mentionsOf(db, kind, before) : null;

  const result = await db.transaction(async (q) => {
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

    let picturesDeleted = 0;
    if (spec.pictures && pictures) {
      picturesDeleted = (await q.run(
        'DELETE FROM media_assets WHERE subject_id = ? AND subject_type = ANY(?::text[])', id, spec.pictures,
      )).changes;
    } else if (spec.pictures) {
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
    return { status: 200, name: row.name, picturesDeleted };
  });

  // Asked only once the delete has happened: a request to write a thing out
  // of a record must not be answered while the thing is still there.
  const tidied = [];
  if (result.status === 200 && mentions) {
    for (const m of mentions.records) {
      const filed = await fileRequest({
        projectId: before.projectId,
        artifactType: m.type,
        payload: { ...m.payload, brief: tidyBrief(kind, before.name) },
      });
      if (filed) tidied.push(m.name);
    }
  }
  return { ...result, tidied };
}
