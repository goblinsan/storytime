import { createHash, randomUUID } from 'crypto';
import { SUPPORTED_JOB_TYPES, normalizeJobType } from './taskTypes.js';

export const MAX_EXPLORATION_DEPTH = 2;
export const DEFAULT_TASK_BUDGET = 6;

let defaultDb = null;
async function resolveDb(database) {
  if (database) return database;
  if (!defaultDb) {
    defaultDb = (await import('../db.js')).default;
  }
  return defaultDb;
}

/**
 * Computes a deterministic SHA-256 fingerprint for an exploration thread
 * to prevent duplicate or looping tasks across generation cycles.
 */
export function generateThreadFingerprint({
  projectId,
  threadType,
  sourceEntityId = '',
  jobType,
  depth = 1,
  brief = '',
}) {
  const normBrief = String(brief || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  const raw = `${projectId}:${threadType}:${sourceEntityId}:${jobType}:${depth}:${normBrief}`;
  return createHash('sha256').update(raw).digest('hex');
}

/**
 * Extracts exploration candidate threads from universe encyclopedia,
 * canon relationships, promoted drafts, and open questions.
 */
export async function extractExplorationThreads(projectId, { database: dbArg, maxDepth = MAX_EXPLORATION_DEPTH } = {}) {
  const database = await resolveDb(dbArg);
  const story = await database.get('SELECT * FROM stories WHERE id = ?', projectId);
  if (!story) return [];

  const characters = await database.all('SELECT * FROM characters WHERE project_id = ?', projectId);
  const locations = await database.all('SELECT * FROM locations WHERE project_id = ?', projectId);
  const factions = await database.all('SELECT * FROM factions WHERE project_id = ?', projectId);
  const timelineEvents = await database.all('SELECT * FROM timeline_events WHERE project_id = ?', projectId);
  const relationships = await database.all('SELECT * FROM canon_relationships WHERE project_id = ?', projectId).catch(() => []);
  const promotedDrafts = await database.all(
    "SELECT * FROM generated_drafts WHERE project_id = ? AND status = 'accepted' ORDER BY updated_at DESC",
    projectId,
  );

  const threads = [];

  // 1. Thread Source: Open questions from promoted worldBriefs and asset bundles
  for (const draft of promotedDrafts) {
    const payload = typeof draft.payload === 'string' ? JSON.parse(draft.payload || '{}') : (draft.payload || {});
    const openQuestions = Array.isArray(payload.worldBrief?.openQuestions) ? payload.worldBrief.openQuestions : [];

    const parentDepth = draft.gate_result?.exploration?.depth ?? 0;
    const nextDepth = parentDepth + 1;

    for (const [qIdx, question] of openQuestions.entries()) {
      if (!question || typeof question !== 'string') continue;

      let jobType = SUPPORTED_JOB_TYPES.MACRO_HISTORY_TIMELINE;
      const lower = question.toLowerCase();

      if (lower.includes('cartel') || lower.includes('syndicate') || lower.includes('faction') || lower.includes('corp')) {
        jobType = SUPPORTED_JOB_TYPES.FACTION_POLITICS_REFINEMENT;
      } else if (lower.includes('tech') || lower.includes('chassis') || lower.includes('array') || lower.includes('drive') || lower.includes('quantum')) {
        jobType = SUPPORTED_JOB_TYPES.TECHNOLOGY_LORE_REFINEMENT;
      } else if (lower.includes('signal') || lower.includes('transmission') || lower.includes('ghost') || lower.includes('frequency')) {
        jobType = SUPPORTED_JOB_TYPES.MYSTERY_SIGNAL_REFINEMENT;
      } else if (lower.includes('system') || lower.includes('sector') || lower.includes('planet') || lower.includes('veil') || lower.includes('slipway')) {
        jobType = SUPPORTED_JOB_TYPES.STAR_SYSTEM_REFINEMENT;
      }

      threads.push({
        threadType: 'open_question',
        sourceDraftId: draft.id,
        sourceEntityId: `q-${draft.id.slice(0, 8)}-${qIdx}`,
        depth: nextDepth,
        jobType,
        title: `Investigate: ${question.slice(0, 60)}...`,
        brief: `Explore and resolve the open universe question: "${question}". Ensure continuity with existing canon.`,
        mustReference: [],
        avoid: ['medieval fantasy', 'magic spells', 'castles'],
      });
    }
  }

  // 2. Thread Source: Unresolved hostile or rival relationships lacking timeline events
  for (const rel of relationships) {
    const isHostile = ['rival', 'enemy', 'hostile', 'feud', 'distrust'].includes(rel.relationship_type?.toLowerCase());
    if (isHostile) {
      const sourceId = rel.source_entity_id || rel.source_id;
      const targetId = rel.target_entity_id || rel.target_id;
      // Check if any timeline event mentions both entities
      const hasEncounter = timelineEvents.some((evt) => {
        const charIds = Array.isArray(evt.character_ids) ? evt.character_ids : [];
        const facIds = Array.isArray(evt.faction_ids) ? evt.faction_ids : [];
        return (
          (charIds.includes(sourceId) || facIds.includes(sourceId)) &&
          (charIds.includes(targetId) || facIds.includes(targetId))
        );
      });

      if (!hasEncounter) {
        threads.push({
          threadType: 'relationship_gap',
          sourceEntityId: `rel-${rel.id}`,
          sourceCanonIds: [sourceId, targetId],
          depth: 1,
          jobType: SUPPORTED_JOB_TYPES.EVENT_HISTORY_EXPANSION,
          title: `Historical Conflict: ${sourceId} vs ${targetId}`,
          brief: `Detail the catalytic skirmish or treaty breach defining the ${rel.relationship_type} relationship between ${sourceId} and ${targetId}.`,
          mustReference: [sourceId, targetId],
          avoid: ['peaceful resolution without tension'],
        });
      }
    }
  }

  // 3. Thread Source: Factions lacking detailed political/corporate doctrine
  for (const faction of factions) {
    threads.push({
      threadType: 'faction_doctrine_gap',
      sourceEntityId: faction.id,
      sourceCanonIds: [faction.id],
      depth: 1,
      jobType: SUPPORTED_JOB_TYPES.FACTION_POLITICS_REFINEMENT,
      title: `Corporate & Military Doctrine: ${faction.name}`,
      brief: `Refine the governing doctrine, corporate hierarchy, strike assets, and patent leverage for faction ${faction.name} (${faction.id}).`,
      mustReference: [faction.id],
      avoid: ['spiritual monasteries', 'divine magic'],
    });
  }

  // 4. Attach fingerprints to all candidate threads
  return threads.map((t) => ({
    ...t,
    threadFingerprint: generateThreadFingerprint({
      projectId,
      threadType: t.threadType,
      sourceEntityId: t.sourceEntityId,
      jobType: t.jobType,
      depth: t.depth,
      brief: t.brief,
    }),
  }));
}

/**
 * Previews an exploration cycle by extracting threads, calculating fingerprints,
 * and filtering out duplicates against DB drafts and active dashboard tasks.
 */
export async function previewExplorationCycle(
  projectId,
  {
    database: dbArg,
    activeDashboardTasks = [],
    maxDepth = MAX_EXPLORATION_DEPTH,
    taskBudget = DEFAULT_TASK_BUDGET,
  } = {},
) {
  const database = await resolveDb(dbArg);
  const story = await database.get('SELECT * FROM stories WHERE id = ?', projectId);
  if (!story) {
    throw new Error(`Universe project ${projectId} not found`);
  }

  const allThreads = await extractExplorationThreads(projectId, { database, maxDepth });

  // Load existing prompt fingerprints from database
  const existingDrafts = await database.all(
    'SELECT prompt_fingerprint FROM generated_drafts WHERE project_id = ?',
    projectId,
  );
  const existingFingerprints = new Set(existingDrafts.map((d) => d.prompt_fingerprint).filter(Boolean));

  // Also collect fingerprints from active dashboard tasks
  for (const t of activeDashboardTasks) {
    const desc = t.description || '';
    const match = desc.match(/"threadFingerprint":\s*"([^"]+)"/);
    if (match) {
      existingFingerprints.add(match[1]);
    }
  }

  const cycleId = `cycle-${Date.now().toString(36)}`;
  const eligible = [];
  const skipped = [];

  for (const thread of allThreads) {
    if (thread.depth > maxDepth) {
      skipped.push({ ...thread, reason: `exceeds_max_depth_${maxDepth}` });
      continue;
    }

    if (existingFingerprints.has(thread.threadFingerprint)) {
      skipped.push({ ...thread, reason: 'duplicate_fingerprint' });
      continue;
    }

    if (eligible.length >= taskBudget) {
      skipped.push({ ...thread, reason: `budget_limit_${taskBudget}` });
      continue;
    }

    existingFingerprints.add(thread.threadFingerprint);
    eligible.push({
      ...thread,
      cycleId,
      universeSlug: (story.title || 'universe').toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    });
  }

  return {
    projectId,
    universeTitle: story.title,
    cycleId,
    maxDepth,
    taskBudget,
    totalDiscovered: allThreads.length,
    eligibleCount: eligible.length,
    eligible,
    skippedCount: skipped.length,
    skipped,
  };
}

/**
 * Formats a valid, single fenced JSON block for StoryTime generation tasks.
 */
export function formatStoryTaskDescription(metadata) {
  return `Use StoryTime autonomous worker for this universe generation task.

\`\`\`json
${JSON.stringify(metadata, null, 2)}
\`\`\`
`;
}

/**
 * Executes an exploration cycle by previewing threads and enqueuing tasks
 * onto the project dashboard with the migrated routing contract.
 */
export async function executeExplorationCycle(
  projectId,
  {
    dashboard,
    dashboardProjectId = '22',
    database: dbArg,
    maxDepth = MAX_EXPLORATION_DEPTH,
    taskBudget = DEFAULT_TASK_BUDGET,
  } = {},
) {
  const database = await resolveDb(dbArg);
  const activeTasks = dashboard ? await dashboard.listTasks(dashboardProjectId).catch(() => []) : [];
  const preview = await previewExplorationCycle(projectId, {
    database,
    activeDashboardTasks: activeTasks,
    maxDepth,
    taskBudget,
  });

  const spawned = [];

  for (const candidate of preview.eligible) {
    const metadata = {
      storytimeProjectId: projectId,
      jobType: candidate.jobType,
      depth: candidate.depth,
      cycleId: preview.cycleId,
      threadFingerprint: candidate.threadFingerprint,
      brief: candidate.brief,
      mustReference: candidate.mustReference || [],
      avoid: candidate.avoid || [],
    };

    if (candidate.sourceDraftId) metadata.sourceDraftId = candidate.sourceDraftId;
    if (candidate.sourceCanonIds?.length) metadata.sourceCanonIds = candidate.sourceCanonIds;

    const taskPayload = {
      title: `[StoryTime] ${candidate.title}`,
      description: formatStoryTaskDescription(metadata),
      delegation_status: 'local_ready',
      labels: [
        'storytime-generation',
        `storytime-job:${candidate.jobType}`,
        `storytime-universe:${preview.universeSlug}`,
        `storytime-cycle:${preview.cycleId}`,
        `storytime-depth:${candidate.depth}`,
      ],
      priority_score: 850 - candidate.depth * 50,
    };

    if (dashboard) {
      const created = await dashboard.createTask(dashboardProjectId, taskPayload).catch(() => null);
      if (created?.id) {
        spawned.push({ taskId: created.id, ...candidate });
      } else {
        spawned.push({ mockCreated: true, ...candidate, taskPayload });
      }
    } else {
      spawned.push({ mockCreated: true, ...candidate, taskPayload });
    }
  }

  // Mark pending exploration_events as processed
  await database.run(
    "UPDATE exploration_events SET status = 'processed', processed_at = now() WHERE project_id = ? AND status = 'pending'",
    projectId,
  );

  return {
    success: true,
    cycleId: preview.cycleId,
    tasksSpawned: spawned,
    totalSpawned: spawned.length,
  };
}
