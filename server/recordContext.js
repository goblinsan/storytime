/**
 * A record, described for a conversation about it.
 *
 * Every agent here writes: it is handed a record and asked for fields back as
 * JSON. Talking a record over needs the same material read the other way --
 * the record's own fields in words, what it is tied to, what the universe is
 * for, and the names of everything else recorded, so an answer can say "that
 * is not recorded" instead of inventing a sister.
 */
import db from './db.js';

const SPECS = {
  character: {
    table: 'characters', name: 'name', word: 'character',
    fields: [['role', 'Role'], ['background', 'History'], ['description', 'Bearing'], ['appearance', 'Appearance'],
      ['motivation', 'What they want'], ['tendencies', 'Under pressure'], ['traits', 'Traits']],
  },
  place: {
    table: 'locations', name: 'name', word: 'place',
    fields: [['region_type', 'Kind'], ['description', 'What it is'], ['history', 'History'],
      ['folklore', 'Folklore'], ['biome', 'Biome'], ['ecology', 'Ecology']],
  },
  event: {
    table: 'timeline_events', name: 'title', word: 'event',
    fields: [['date', 'When'], ['description', 'What happened'], ['account', 'The account'],
      ['consequences', 'What it changed'], ['remembrance', 'How it is remembered']],
  },
  society: {
    table: 'factions', name: 'name', word: 'group',
    fields: [['description', 'What it is'], ['history', 'History'], ['goals', 'Goals'], ['doctrine', 'Doctrine'],
      ['technology', 'Technology'], ['economic_leverage', 'Economy'], ['corporate_structure', 'Structure']],
  },
  creature: {
    table: 'bestiary', name: 'name', word: 'creature',
    fields: [['category', 'Kind'], ['description', 'What it is'], ['ecological_niche', 'Niche'],
      ['in_universe_backstory', 'Where it came from'], ['motivation', 'What it is doing'],
      ['tactics', 'Tactics'], ['notes', 'What survivors say']],
  },
  technology: {
    table: 'technologies', name: 'name', word: 'technology',
    fields: [['classification', 'Kind'], ['description', 'What it is'], ['principles', 'How it works'],
      ['history', 'History'], ['limitations', 'Limits'], ['patents_or_taboos', 'Who may have it']],
  },
  arc: {
    table: 'story_arcs', name: 'title', word: 'story arc',
    fields: [['description', 'In brief'], ['throughline', 'Throughline'], ['out_of_scope', 'Kept out of it'],
      ['details', 'Beats not yet in an act']],
  },
  work: {
    table: 'derivative_works', name: 'title', word: 'work',
    fields: [['type', 'Format'], ['description', 'In brief']],
  },
};

export const clip = (value, most) => {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > most ? `${text.slice(0, most)}…` : text;
};

/** A JSON list column, read as a list of phrases; anything else as it is. */
const phrases = (value) => {
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.map((p) => (typeof p === 'string' ? p : Object.values(p ?? {}).join(' '))).join('; ');
    }
  } catch { /* not a list */ }
  return value;
};

const described = (pairs) => pairs
  .map(([label, value]) => ({ label, value: clip(phrases(value), 2500) }))
  .filter((f) => f.value);

/** The record in words, or null when there is no such record. */
export async function describeRecord(kind, id) {
  if (kind === 'universe') {
    const u = await db.get(`
      SELECT id, title, description, persistent_goal AS goal, temporary_focus AS focus, guardrails,
             history, folklore
      FROM stories WHERE id = ?
    `, id);
    if (!u) return null;
    return {
      projectId: u.id, name: u.title, word: 'universe', ties: [],
      fields: described([['What it is', u.description], ['What it is for', u.goal], ['Right now', u.focus],
        ['Guardrails', u.guardrails], ['History', u.history], ['Folklore', u.folklore]]),
    };
  }

  if (kind === 'act') {
    const a = await db.get(`
      SELECT a.title, a.act_number AS n, a.span, a.summary, a.beats,
             arc.project_id AS "projectId", arc.title AS arc, arc.throughline
      FROM arc_acts a JOIN story_arcs arc ON arc.id = a.arc_id WHERE a.id = ?
    `, id);
    if (!a) return null;
    return {
      projectId: a.projectId, word: 'act of a story arc', ties: [],
      name: `Act ${a.n}${a.title ? `: ${a.title}` : ''}, of ${a.arc}`,
      fields: described([['Where it falls', a.span], ['What it does', a.summary], ['Its beats', a.beats],
        ["The arc's throughline", a.throughline]]),
    };
  }

  const spec = SPECS[kind];
  if (!spec) return null;
  const row = await db.get(`
    SELECT id, project_id AS "projectId", ${spec.name} AS name, ${spec.fields.map(([c]) => c).join(', ')}
    FROM ${spec.table} WHERE id = ?
  `, id);
  if (!row) return null;
  const fields = described(spec.fields.map(([c, label]) => [label, row[c]]));

  // Where it sits among the others of its kind. Without this an answer about
  // an event could say nothing connects it to the next one, when the
  // chronicle records that it comes directly before it.
  if (kind === 'event') {
    const titles = async (ids) => {
      let list = [];
      try { list = JSON.parse(ids ?? '[]'); } catch { list = []; }
      if (!Array.isArray(list) || !list.length) return '';
      const rows = await db.all('SELECT id, title FROM timeline_events WHERE id = ANY(?::text[])', list);
      return rows.map((r) => r.title).join('; ');
    };
    const e = await db.get(`
      SELECT e.before_event_ids AS "before", e.after_event_ids AS "after", parent.title AS "partOf"
      FROM timeline_events e LEFT JOIN timeline_events parent ON parent.id = e.parent_id WHERE e.id = ?
    `, id);
    const inside = await db.all('SELECT title FROM timeline_events WHERE parent_id = ? ORDER BY year NULLS LAST, title', id);
    fields.push(...described([
      ['Part of', e?.partOf],
      ['What happened inside it', inside.map((x) => x.title).join('; ')],
      ['It comes after', await titles(e?.after)],
      ['It comes before', await titles(e?.before)],
    ]));
  }
  if (kind === 'place') {
    const up = await db.get('SELECT parent.name FROM locations l JOIN locations parent ON parent.id = l.parent_id WHERE l.id = ?', id);
    const inside = await db.all('SELECT name FROM locations WHERE parent_id = ? ORDER BY name', id);
    fields.push(...described([['Inside', up?.name], ['Places inside it', inside.map((x) => x.name).join('; ')]]));
  }

  if (kind === 'arc') {
    const acts = await db.all('SELECT act_number AS n, title, summary FROM arc_acts WHERE arc_id = ? ORDER BY act_number', id);
    if (acts.length) {
      fields.push({ label: 'Its acts', value: acts.map((x) => `${x.n}. ${x.title}${x.summary ? `: ${clip(x.summary, 300)}` : ''}`).join(' | ') });
    }
  }
  if (kind === 'work') {
    const w = await db.get('SELECT content FROM derivative_works WHERE id = ?', id);
    const parts = await db.all('SELECT part_number AS n, title, description FROM derivative_works WHERE parent_id = ? ORDER BY part_number NULLS LAST, created_at', id);
    if (parts.length) {
      fields.push({ label: 'Its parts', value: parts.map((p) => `${p.n ?? '-'}. ${p.title}${p.description ? `: ${clip(p.description, 200)}` : ''}`).join(' | ') });
    }
    if (String(w?.content ?? '').trim()) fields.push({ label: 'The opening of its prose', value: clip(w.content, 3000) });
  }

  const ties = await db.all(`
    SELECT source_entity_id AS source, target_entity_id AS target, relationship_type AS type, notes
    FROM canon_relationships WHERE source_entity_id = ? OR target_entity_id = ? LIMIT 30
  `, id, id).catch(() => []);
  return { projectId: row.projectId, name: row.name, word: spec.word, fields, ties };
}

/** Everything else recorded, by name: enough to know what exists, not what it says. */
export async function canonIndex(projectId) {
  const q = (sql) => db.all(sql, projectId).catch(() => []);
  const [characters, places, groups, events, tech, creatures, arcs, works] = await Promise.all([
    q('SELECT id, name, role FROM characters WHERE project_id = ? ORDER BY name LIMIT 150'),
    q('SELECT id, name FROM locations WHERE project_id = ? ORDER BY name LIMIT 100'),
    q('SELECT id, name FROM factions WHERE project_id = ? ORDER BY name LIMIT 60'),
    q('SELECT id, title AS name, date FROM timeline_events WHERE project_id = ? ORDER BY year NULLS LAST, title LIMIT 100'),
    q('SELECT id, name FROM technologies WHERE project_id = ? ORDER BY name LIMIT 60'),
    q('SELECT id, name FROM bestiary WHERE project_id = ? ORDER BY name LIMIT 60'),
    q('SELECT id, title AS name FROM story_arcs WHERE project_id = ? ORDER BY arc_number'),
    q('SELECT id, title AS name FROM derivative_works WHERE project_id = ? AND parent_id IS NULL ORDER BY created_at'),
  ]);
  const names = new Map();
  const line = (label, rows, show = (r) => r.name) => {
    for (const r of rows) names.set(r.id, r.name);
    return rows.length ? `${label}: ${rows.map(show).join('; ')}` : null;
  };
  const lines = [
    line('Characters', characters, (r) => `${r.name}${r.role ? ` (${clip(r.role, 60)})` : ''}`),
    line('Places', places),
    line('Groups', groups),
    line('Events', events, (r) => `${r.name}${r.date ? ` (${clip(r.date, 40)})` : ''}`),
    line('Technologies', tech),
    line('Creatures', creatures),
    line('Arcs', arcs),
    line('Works', works),
  ].filter(Boolean);
  return { lines, names };
}
