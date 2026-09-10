/**
 * A society, and who it is up against.
 *
 * Most of what a faction knows was already recorded and none of it was shown:
 * what they want, what they believe, how they pay for it, who decides, what
 * they own. The page listed a name and a truncated description.
 *
 * WHO IT IS UP AGAINST IS NOT PROSE
 * `canon_relationships` already holds the rivalries -- three active skirmishes,
 * three cold wars, a trade war -- edges between real records, and nothing in
 * the application has ever displayed them. Writing "they are at war with the
 * Cartel" into a text field beside an edge that already says so is how two
 * copies of one fact begin to disagree. The edges are read; nobody retypes
 * them.
 */
import { Router } from 'express';
import db from '../db.js';
import { readEdge, isAligned } from '../tieWords.js';

const router = Router();

const FACTION_SELECT = `
  SELECT id, project_id AS "projectId", name, description, history, goals, doctrine,
         technology, economic_leverage AS "economy", corporate_structure AS "structure",
         assets, is_protected AS "isProtected"
  FROM factions
`;

/** Stored as JSON text, and not always valid. A bad list is empty, never a crash. */
function asList(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return [value]; }
}

const shape = (row) => ({
  ...row,
  goals: asList(row.goals).map(String),
  assets: asList(row.assets),
});

router.get('/', async (req, res) => {
  const { projectId } = req.query;
  if (!projectId) return res.status(400).json({ error: 'projectId required' });

  const rows = await db.all(`${FACTION_SELECT} WHERE project_id = ? ORDER BY name`, projectId);

  // How many ties each one has, so the index can say which are entangled
  // without loading the graph twice.
  const ties = await db.all(`
    SELECT id, count(*)::int AS n FROM (
      SELECT source_entity_id AS id FROM canon_relationships
      WHERE project_id = ? AND source_entity_type = 'faction'
      UNION ALL
      SELECT target_entity_id AS id FROM canon_relationships
      WHERE project_id = ? AND target_entity_type = 'faction'
    ) t GROUP BY id
  `, projectId, projectId).catch(() => []);
  const counts = new Map(ties.map((t) => [t.id, t.n]));

  const pictured = await db.all(`
    SELECT subject_id AS "id", count(*)::int AS n FROM media_assets
    WHERE project_id = ? AND subject_type = 'faction_crest' GROUP BY subject_id
  `, projectId).catch(() => []);
  const pictures = new Map(pictured.map((r) => [r.id, r.n]));

  return res.json({
    factions: rows.map((r) => ({
      ...shape(r),
      tieCount: counts.get(r.id) ?? 0,
      pictureCount: pictures.get(r.id) ?? 0,
    })),
  });
});

/**
 * GET /societies/:factionId
 *
 * One society: its record, who it is tied to, and its crests.
 *
 * A tie is returned from whichever end this faction is on, with the other end
 * named, so the surface never has to know which way round an edge was
 * recorded. "At war with" reads the same from either side.
 */
router.get('/:factionId', async (req, res) => {
  const faction = await db.get(`${FACTION_SELECT} WHERE id = ?`, req.params.factionId);
  if (!faction) return res.status(404).json({ error: 'Faction not found' });

  const edges = await db.all(`
    SELECT id, relationship_type AS "kind", notes,
           source_entity_id AS "sourceId", source_entity_type AS "sourceType",
           target_entity_id AS "targetId", target_entity_type AS "targetType"
    FROM canon_relationships
    WHERE project_id = ? AND (
      (source_entity_type = 'faction' AND source_entity_id = ?)
      OR (target_entity_type = 'faction' AND target_entity_id = ?)
    )
  `, faction.projectId, faction.id, faction.id).catch(() => []);

  // Every id the other end of an edge might point at, resolved in two reads
  // rather than one per edge.
  const wanted = edges.map((e) => (e.sourceId === faction.id ? e.targetId : e.sourceId));
  const names = new Map();
  if (wanted.length) {
    const marks = wanted.map(() => '?').join(',');
    for (const [table, type] of [['factions', 'faction'], ['characters', 'character']]) {
      const found = await db.all(
        `SELECT id, name FROM ${table} WHERE id IN (${marks})`, ...wanted,
      ).catch(() => []);
      for (const row of found) names.set(row.id, { name: row.name, type });
    }
  }

  const ties = edges.map((e) => {
    // Which end this faction sits on decides how the edge reads: the same
    // `protective_bond` is "protects" from one side and "protected by" from
    // the other, and rendering it one way for both makes the canon say the
    // opposite of what was recorded on half its rows.
    const forward = e.sourceId === faction.id;
    const otherId = forward ? e.targetId : e.sourceId;
    const other = names.get(otherId);
    return {
      id: e.id,
      kind: e.kind,
      forward,
      // The phrasing is decided here, next to the direction that decides it,
      // so no surface has to keep its own table of what a kind means.
      reads: readEdge(e.kind, forward),
      aligned: isAligned(e.kind),
      notes: e.notes ?? '',
      otherId,
      otherName: other?.name ?? '(no longer recorded)',
      otherType: other?.type ?? (forward ? e.targetType : e.sourceType),
    };
  }).sort((a, b) => a.reads.localeCompare(b.reads) || a.otherName.localeCompare(b.otherName));

  const pictures = await db.all(`
    SELECT id, url, kind, title, caption FROM media_assets
    WHERE subject_type = 'faction_crest' AND subject_id = ? ORDER BY created_at DESC
  `, faction.id).catch(() => []);

  return res.json({ faction: shape(faction), ties, pictures });
});

/** Partial update. The server COALESCEs, so an omitted field is left alone. */
router.patch('/:factionId', async (req, res) => {
  const existing = await db.get('SELECT id FROM factions WHERE id = ?', req.params.factionId);
  if (!existing) return res.status(404).json({ error: 'Faction not found' });

  const {
    name, description, history, doctrine, technology, economy, structure, goals,
  } = req.body ?? {};

  await db.run(`
    UPDATE factions SET
      name                = COALESCE(?, name),
      description         = COALESCE(?, description),
      history             = COALESCE(?, history),
      doctrine            = COALESCE(?, doctrine),
      technology          = COALESCE(?, technology),
      economic_leverage   = COALESCE(?, economic_leverage),
      corporate_structure = COALESCE(?, corporate_structure),
      goals               = COALESCE(?, goals),
      updated_at          = now()
    WHERE id = ?
  `,
  name ?? null, description ?? null, history ?? null, doctrine ?? null,
  technology ?? null, economy ?? null, structure ?? null,
  goals === undefined ? null : JSON.stringify(goals),
  req.params.factionId);

  return res.json(shape(await db.get(`${FACTION_SELECT} WHERE id = ?`, req.params.factionId)));
});

export default router;
