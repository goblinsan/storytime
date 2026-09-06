import { Router } from 'express';
import db from '../db.js';

const router = Router();

const AUTONOMY_MODES = new Set(['manual', 'assisted', 'autonomous_explore']);

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
 * Counts for one universe. Kept as one grouped query per table rather than a
 * count per universe per table, so listing every universe does not fan out into
 * dozens of round trips.
 */
async function canonCounts() {
  const tables = [
    ['characters', 'characters'],
    ['locations', 'locations'],
    ['factions', 'factions'],
    ['timeline_events', 'timelineEvents'],
    ['bestiary', 'bestiaryEntries'],
    ['technologies', 'technologies'],
    ['mystery_signals', 'mysterySignals'],
    ['story_arcs', 'arcs'],
    ['derivative_works', 'works'],
  ];

  const byProject = new Map();
  for (const [table, key] of tables) {
    const rows = await db
      .all(`SELECT project_id AS id, count(*)::int AS n FROM ${table} GROUP BY project_id`)
      .catch(() => []);
    for (const row of rows) {
      if (!byProject.has(row.id)) byProject.set(row.id, {});
      byProject.get(row.id)[key] = row.n;
    }
  }
  return byProject;
}

const emptyCounts = () => ({
  characters: 0, locations: 0, factions: 0, timelineEvents: 0, bestiaryEntries: 0,
  technologies: 0, mysterySignals: 0, arcs: 0, relationships: 0,
});

function toSummary(story, counts, concerns) {
  // Works are a derivative count, not a canon dimension, so they are lifted out
  // rather than left in canonCounts where every total would double-count them.
  const { works = 0, ...canon } = counts.get(story.id) ?? {};
  return {
    id: story.id,
    title: story.title,
    description: story.description ?? '',
    themeId: story.themeId ?? undefined,
    canonCounts: { ...emptyCounts(), ...canon },
    worksCount: works,
    concernsCount: concerns.get(story.id) ?? 0,
    lastActiveAt: story.updatedAt,
  };
}

/** GET /editorial/dashboard - the cross-universe briefing. */
router.get('/dashboard', async (_req, res) => {
  const stories = await db.all(`
    SELECT id, title, description, theme_id AS "themeId",
           persistent_goal AS "persistentGoal", autonomy_mode AS "autonomyMode",
           updated_at AS "updatedAt"
    FROM stories
    WHERE type = 'universe' OR type IS NULL
    ORDER BY updated_at DESC
  `);

  const counts = await canonCounts();

  const concernRows = await db.all(`
    SELECT project_id AS id, count(*)::int AS n
    FROM reader_annotations
    WHERE kind = 'concern' AND status = 'active'
    GROUP BY project_id
  `);
  const concerns = new Map(concernRows.map((r) => [r.id, r.n]));

  const universes = stories.map((s) => toSummary(s, counts, concerns));

  const activeConcerns = await db.all(`
    SELECT a.id, a.project_id AS "universeId", s.title AS "universeTitle",
           a.derivative_id AS "workId", a.section_id AS "sectionId",
           a.selected_text AS "selectedText", a.note, a.updated_at AS "updatedAt"
    FROM reader_annotations a
    JOIN stories s ON s.id = a.project_id
    WHERE a.kind = 'concern' AND a.status = 'active'
    ORDER BY a.updated_at DESC
    LIMIT 20
  `);

  const pendingRepairs = await db.all(`
    SELECT r.id, r.project_id AS "universeId", s.title AS "universeTitle",
           r.derivative_id AS "workId", r.section_id AS "sectionId",
           r.rationale, r.status, r.updated_at AS "updatedAt"
    FROM repair_proposals r
    JOIN stories s ON s.id = r.project_id
    WHERE r.status IN ('pending', 'ready')
    ORDER BY r.updated_at DESC
    LIMIT 20
  `);

  const totalCanonEntities = universes.reduce(
    (n, u) => n + Object.values(u.canonCounts).reduce((a, b) => a + (b ?? 0), 0), 0,
  );
  const totalWorks = universes.reduce((n, u) => n + u.worksCount, 0);
  const openConcernsCount = universes.reduce((n, u) => n + u.concernsCount, 0);

  res.json({
    briefing: {
      headline: universes.length === 0
        ? 'No universes yet'
        : `${universes.length} ${universes.length === 1 ? 'universe' : 'universes'} in the codex`,
      summary: universes.length === 0
        ? 'Create the first universe to begin charting its canon.'
        : `${totalCanonEntities.toLocaleString('en-US')} canon entities across ${universes.length} ${universes.length === 1 ? 'universe' : 'universes'}, with ${totalWorks} derivative ${totalWorks === 1 ? 'work' : 'works'}.`,
      totalUniverses: universes.length,
      totalWorks,
      totalCanonEntities,
      openConcernsCount,
      readyRepairsCount: pendingRepairs.filter((r) => r.status === 'ready').length,
    },
    universes,
    activeConcerns,
    recentActivity: [],
    pendingRepairs,
    systemStatus: { status: 'ok', activeGenerationsCount: 0, queuedTasksCount: 0 },
  });
});

/** GET /editorial/universes/:id/direction */
router.get('/universes/:id/direction', async (req, res) => {
  const story = await db.get(`
    SELECT id, title, theme_id AS "themeId", theme_overrides AS "themeOverrides",
           cover_image_url AS "coverImageUrl", persistent_goal AS "persistentGoal",
           temporary_focus AS "temporaryFocus", guardrails, autonomy_mode AS "autonomyMode"
    FROM stories WHERE id = ?
  `, req.params.id);

  if (!story) return res.status(404).json({ error: 'Universe not found' });

  res.json({
    universeId: story.id,
    persistentGoal: story.persistentGoal ?? '',
    temporaryFocus: story.temporaryFocus ?? '',
    guardrails: asJson(story.guardrails, []),
    autonomyMode: story.autonomyMode ?? 'assisted',
    theme: {
      id: story.themeId ?? 'neutral-codex',
      overrides: asJson(story.themeOverrides, {}),
      coverImageUrl: story.coverImageUrl ?? undefined,
    },
  });
});

/** PATCH /editorial/universes/:id/direction */
router.patch('/universes/:id/direction', async (req, res) => {
  const { persistentGoal, temporaryFocus, guardrails, autonomyMode } = req.body ?? {};

  if (autonomyMode !== undefined && !AUTONOMY_MODES.has(autonomyMode)) {
    return res.status(400).json({
      error: `Invalid autonomyMode '${autonomyMode}'. Allowed: ${[...AUTONOMY_MODES].join(', ')}.`,
    });
  }
  if (guardrails !== undefined && !Array.isArray(guardrails)) {
    return res.status(400).json({ error: 'guardrails must be an array of strings.' });
  }

  const existing = await db.get('SELECT id FROM stories WHERE id = ?', req.params.id);
  if (!existing) return res.status(404).json({ error: 'Universe not found' });

  await db.run(`
    UPDATE stories SET
      persistent_goal = COALESCE(?, persistent_goal),
      temporary_focus = COALESCE(?, temporary_focus),
      guardrails = COALESCE(?, guardrails),
      autonomy_mode = COALESCE(?, autonomy_mode),
      updated_at = now()
    WHERE id = ?
  `,
  persistentGoal ?? null,
  temporaryFocus ?? null,
  guardrails === undefined ? null : JSON.stringify(guardrails),
  autonomyMode ?? null,
  req.params.id);

  const updated = await db.get(`
    SELECT persistent_goal AS "persistentGoal", temporary_focus AS "temporaryFocus",
           guardrails, autonomy_mode AS "autonomyMode"
    FROM stories WHERE id = ?
  `, req.params.id);

  res.json({
    universeId: req.params.id,
    persistentGoal: updated.persistentGoal ?? '',
    temporaryFocus: updated.temporaryFocus ?? '',
    guardrails: asJson(updated.guardrails, []),
    autonomyMode: updated.autonomyMode,
  });
});

/** PATCH /editorial/universes/:id/theme */
router.patch('/universes/:id/theme', async (req, res) => {
  const { themeId, overrides, coverImageUrl } = req.body ?? {};

  if (overrides !== undefined && (typeof overrides !== 'object' || overrides === null || Array.isArray(overrides))) {
    return res.status(400).json({ error: 'overrides must be an object of token values.' });
  }

  const existing = await db.get('SELECT id FROM stories WHERE id = ?', req.params.id);
  if (!existing) return res.status(404).json({ error: 'Universe not found' });

  await db.run(`
    UPDATE stories SET
      theme_id = COALESCE(?, theme_id),
      theme_overrides = COALESCE(?, theme_overrides),
      cover_image_url = COALESCE(?, cover_image_url),
      updated_at = now()
    WHERE id = ?
  `,
  themeId ?? null,
  overrides === undefined ? null : JSON.stringify(overrides),
  coverImageUrl ?? null,
  req.params.id);

  const updated = await db.get(`
    SELECT theme_id AS "themeId", theme_overrides AS "themeOverrides",
           cover_image_url AS "coverImageUrl"
    FROM stories WHERE id = ?
  `, req.params.id);

  res.json({
    id: updated.themeId ?? 'neutral-codex',
    overrides: asJson(updated.themeOverrides, {}),
    coverImageUrl: updated.coverImageUrl ?? undefined,
  });
});

export default router;
