import { createHash, randomUUID } from 'crypto';
import { SUPPORTED_JOB_TYPES, normalizeJobType } from './taskTypes.js';

function normalizeLabels(task) {
  if (Array.isArray(task?.labels)) return task.labels.map((label) => String(label));
  if (typeof task?.labels === 'string' && task.labels.trim()) {
    return task.labels.split(',').map((label) => label.trim()).filter(Boolean);
  }
  return [];
}

export function countActiveStoryTimeTasks(tasks = [], now = new Date()) {
  let count = 0;
  for (const t of tasks) {
    const labels = normalizeLabels(t).map((l) => l.toLowerCase());
    const isStoryTimeTask = labels.includes('storytime-generation');
    const isActiveStatus = ['open', 'in_progress', 'acceptance_review'].includes(String(t?.status ?? '').toLowerCase());
    const hasUnexpiredClaim = Boolean(
      t?.claimed_by && t?.claim_expires_at && Date.parse(t.claim_expires_at) > now.getTime()
    );
    if (isStoryTimeTask && (isActiveStatus || hasUnexpiredClaim)) {
      count++;
    }
  }
  return count;
}

export const MAX_EXPLORATION_DEPTH = 10;
export const DEFAULT_TASK_BUDGET = 8;

export const DOMAIN_ORDER = [
  'history',
  'factions',
  'geography',
  'technology',
  'characters',
  'cultures',
  'bestiary',
  'conflicts',
];

export const JOB_DOMAINS = {
  [SUPPORTED_JOB_TYPES.MACRO_HISTORY_TIMELINE]: 'history',
  [SUPPORTED_JOB_TYPES.EVENT_HISTORY_EXPANSION]: 'history',
  [SUPPORTED_JOB_TYPES.FACTION_POLITICS_REFINEMENT]: 'factions',
  [SUPPORTED_JOB_TYPES.FACTION_BELIEF_ENRICHMENT]: 'factions',
  [SUPPORTED_JOB_TYPES.STAR_SYSTEM_REFINEMENT]: 'geography',
  [SUPPORTED_JOB_TYPES.LOCATION_HIERARCHY_REFINEMENT]: 'geography',
  [SUPPORTED_JOB_TYPES.REGION_GEOPOLITICS]: 'geography',
  [SUPPORTED_JOB_TYPES.TECHNOLOGY_LORE_REFINEMENT]: 'technology',
  [SUPPORTED_JOB_TYPES.CHARACTER_FAMILY_LINEAGE]: 'characters',
  [SUPPORTED_JOB_TYPES.LANGUAGE_CULTURE_CONVENTIONS]: 'cultures',
  [SUPPORTED_JOB_TYPES.RELIGION_BELIEF_LORE]: 'cultures',
  [SUPPORTED_JOB_TYPES.BESTIARY_ENTRY_REFINEMENT]: 'bestiary',
  [SUPPORTED_JOB_TYPES.ENCOUNTER_PRESSURE]: 'conflicts',
  [SUPPORTED_JOB_TYPES.SESSION_HOOKS]: 'conflicts',
  [SUPPORTED_JOB_TYPES.MYSTERY_SIGNAL_REFINEMENT]: 'conflicts',
};

let defaultDb = null;
async function resolveDb(database) {
  if (database) return database;
  if (!defaultDb) {
    defaultDb = (await import('../db.js')).default;
  }
  return defaultDb;
}

export function generateBranchKey(projectId, domain, jobType, sourceCanonIds = []) {
  const sortedIds = [...sourceCanonIds].map(String).sort().join(',');
  return `${projectId}:${domain}:${jobType}:${sortedIds}`;
}

/**
 * Computes a deterministic SHA-256 fingerprint for an exploration thread.
 * If retrying a failed thread, retryOrdinal must be incremented.
 */
export function generateThreadFingerprint({
  projectId,
  threadType,
  sourceEntityId = '',
  jobType,
  depth = 1,
  brief = '',
  retryOrdinal = 0,
}) {
  const normBrief = String(brief || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  const raw = `${projectId}:${threadType}:${sourceEntityId}:${jobType}:${depth}:${normBrief}:retry${retryOrdinal}`;
  return createHash('sha256').update(raw).digest('hex');
}

/**
 * Extracts candidate exploration threads from promoted drafts, open questions,
 * canon relationships, and encyclopedic gaps.
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

      const domain = JOB_DOMAINS[jobType] || 'history';
      const branchKey = generateBranchKey(projectId, domain, jobType, []);

      threads.push({
        threadType: 'open_question',
        sourceDraftId: draft.id,
        sourceEntityId: `q-${draft.id.slice(0, 8)}-${qIdx}`,
        sourceCanonIds: [],
        depth: nextDepth,
        jobType,
        domain,
        branchKey,
        title: `Investigate: ${question.slice(0, 60)}...`,
        brief: `Explore and resolve the open universe question: "${question}". Ensure continuity with existing canon.`,
        mustReference: [],
        avoid: ['medieval fantasy', 'magic spells', 'castles'],
      });
    }
  }

  // 2. Thread Source: Unresolved hostile/rival relationships lacking timeline events
  for (const rel of relationships) {
    const isHostile = ['rival', 'enemy', 'hostile', 'feud', 'distrust'].includes(rel.relationship_type?.toLowerCase());
    if (isHostile) {
      const sourceId = rel.source_entity_id || rel.source_id;
      const targetId = rel.target_entity_id || rel.target_id;
      const hasEncounter = timelineEvents.some((evt) => {
        const charIds = Array.isArray(evt.character_ids) ? evt.character_ids : [];
        const facIds = Array.isArray(evt.faction_ids) ? evt.faction_ids : [];
        return (
          (charIds.includes(sourceId) || facIds.includes(sourceId)) &&
          (charIds.includes(targetId) || facIds.includes(targetId))
        );
      });

      if (!hasEncounter) {
        const domain = 'history';
        const jobType = SUPPORTED_JOB_TYPES.EVENT_HISTORY_EXPANSION;
        const sourceCanonIds = [sourceId, targetId];
        const branchKey = generateBranchKey(projectId, domain, jobType, sourceCanonIds);

        threads.push({
          threadType: 'relationship_gap',
          sourceEntityId: `rel-${rel.id}`,
          sourceCanonIds,
          depth: 1,
          jobType,
          domain,
          branchKey,
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
    const domain = 'factions';
    const jobType = SUPPORTED_JOB_TYPES.FACTION_POLITICS_REFINEMENT;
    const sourceCanonIds = [faction.id];
    const branchKey = generateBranchKey(projectId, domain, jobType, sourceCanonIds);

    threads.push({
      threadType: 'faction_doctrine_gap',
      sourceEntityId: faction.id,
      sourceCanonIds,
      depth: 1,
      jobType,
      domain,
      branchKey,
      title: `Corporate & Military Doctrine: ${faction.name}`,
      brief: `Refine the governing doctrine, corporate hierarchy, strike assets, and patent leverage for faction ${faction.name} (${faction.id}).`,
      mustReference: [faction.id],
      avoid: ['spiritual monasteries', 'divine magic'],
    });
  }

  // Attach deterministic fingerprints
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
 * Evaluates whether a quarantined branch can be reset because one of its
 * specific sourceCanonIds has been updated since the quarantine timestamp.
 */
async function evaluateBranchReset(database, branch) {
  if (!branch || !branch.is_quarantined) return false;
  const sourceIds = Array.isArray(branch.source_canon_ids) ? branch.source_canon_ids : [];
  if (sourceIds.length === 0) return false;

  const tables = ['characters', 'factions', 'locations', 'timeline_events', 'canon_relationships'];
  const quarantinedAt = branch.quarantined_at ? new Date(branch.quarantined_at).toISOString() : new Date(0).toISOString();

  for (const table of tables) {
    const row = await database.get(
      `SELECT id FROM ${table} WHERE id = ANY(?) AND updated_at > ? LIMIT 1`,
      sourceIds,
      quarantinedAt,
    ).catch(() => null);

    if (row?.id) {
      await database.run(
        "UPDATE exploration_branches SET is_quarantined = FALSE, consecutive_failures = 0, reset_reason = 'source_canon_updated', updated_at = now() WHERE id = ?",
        branch.id,
      ).catch(() => {});
      return true;
    }
  }

  return false;
}

/**
 * Previews an exploration cycle by extracting threads, calculating fingerprints,
 * checking circuit breakers, and enforcing 8-domain breadth balancing and backlog limits.
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

  // 1. Backlog Throttling: Count active StoryTime generation tasks
  const activeStoryTimeCount = countActiveStoryTimeTasks(activeDashboardTasks);
  if (activeStoryTimeCount >= taskBudget) {
    return {
      projectId,
      universeTitle: story.title,
      throttled: true,
      activeBacklog: activeStoryTimeCount,
      taskBudget,
      reason: 'active_backlog_limit_reached',
      eligibleCount: 0,
      eligible: [],
      skippedCount: 0,
      skipped: [],
    };
  }

  // 2. Load quarantined branches & evaluate source canon resets
  const quarantinedBranches = await database.all(
    'SELECT * FROM exploration_branches WHERE project_id = ? AND is_quarantined = TRUE',
    projectId,
  ).catch(() => []);

  const quarantinedKeys = new Set();
  for (const branch of quarantinedBranches) {
    const reset = await evaluateBranchReset(database, branch);
    if (!reset) {
      quarantinedKeys.add(branch.branch_key);
    }
  }

  const allThreads = await extractExplorationThreads(projectId, { database, maxDepth });

  // 3. Collect existing prompt fingerprints from drafts and exploration_threads
  const existingDrafts = await database.all(
    "SELECT prompt_fingerprint FROM generated_drafts WHERE project_id = ? AND status != 'rejected'",
    projectId,
  ).catch(() => []);
  const existingFingerprints = new Set(existingDrafts.map((d) => d.prompt_fingerprint).filter(Boolean));

  const recordedThreads = await database.all(
    "SELECT thread_fingerprint FROM exploration_threads WHERE project_id = ? AND status IN ('spawned', 'completed')",
    projectId,
  ).catch(() => []);
  for (const row of recordedThreads) {
    if (row.thread_fingerprint) existingFingerprints.add(row.thread_fingerprint);
  }

  // Check active dashboard tasks description for thread fingerprints
  for (const t of activeDashboardTasks) {
    const desc = t.description || '';
    const match = desc.match(/"threadFingerprint":\s*"([^"]+)"/);
    if (match) {
      existingFingerprints.add(match[1]);
    }
  }

  const cycleId = `cycle-${Date.now().toString(36)}`;
  const candidatesByDepth = new Map();
  const skipped = [];

  for (const thread of allThreads) {
    if (thread.depth > maxDepth) {
      skipped.push({ ...thread, reason: `exceeds_max_depth_${maxDepth}` });
      continue;
    }

    if (quarantinedKeys.has(thread.branchKey)) {
      skipped.push({ ...thread, reason: 'branch_quarantined' });
      continue;
    }

    if (existingFingerprints.has(thread.threadFingerprint)) {
      skipped.push({ ...thread, reason: 'duplicate_fingerprint' });
      continue;
    }

    if (!candidatesByDepth.has(thread.depth)) {
      candidatesByDepth.set(thread.depth, []);
    }
    candidatesByDepth.get(thread.depth).push(thread);
  }

  // 4. Breadth-First Domain Balancing Selection
  const availableSlots = taskBudget - activeStoryTimeCount;
  const eligible = [];
  const sortedDepths = [...candidatesByDepth.keys()].sort((a, b) => a - b);

  for (const depth of sortedDepths) {
    if (eligible.length >= availableSlots) break;
    const depthCandidates = candidatesByDepth.get(depth) || [];

    // Group candidates by domain
    const byDomain = new Map();
    for (const d of DOMAIN_ORDER) byDomain.set(d, []);
    for (const c of depthCandidates) {
      const d = c.domain || 'history';
      if (!byDomain.has(d)) byDomain.set(d, []);
      byDomain.get(d).push(c);
    }

    // Round-robin across domains
    let addedInPass = true;
    while (addedInPass && eligible.length < availableSlots) {
      addedInPass = false;
      for (const d of DOMAIN_ORDER) {
        if (eligible.length >= availableSlots) break;
        const list = byDomain.get(d) || [];
        if (list.length > 0) {
          const item = list.shift();
          existingFingerprints.add(item.threadFingerprint);
          eligible.push({
            ...item,
            cycleId,
            universeSlug: (story.title || 'universe').toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          });
          addedInPass = true;
        }
      }
    }
  }

  return {
    projectId,
    universeTitle: story.title,
    cycleId,
    maxDepth,
    taskBudget,
    activeBacklog: activeStoryTimeCount,
    totalDiscovered: allThreads.length,
    eligibleCount: eligible.length,
    eligible,
    skippedCount: skipped.length,
    skipped,
  };
}

/**
 * Formats a single valid fenced JSON block for StoryTime generation tasks.
 */
export function formatStoryTaskDescription(metadata) {
  return `Use StoryTime autonomous worker for this universe generation task.

\`\`\`json
${JSON.stringify(metadata, null, 2)}
\`\`\`
`;
}

/**
 * Executes an exploration cycle by previewing threads, enqueuing tasks
 * onto the dashboard, and recording thread state in exploration_threads.
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

  // If throttled by backlog, mark pending exploration_events as deferred
  if (preview.throttled) {
    await database.run(
      "UPDATE exploration_events SET status = 'deferred' WHERE project_id = ? AND status = 'pending'",
      projectId,
    ).catch(() => {});

    return {
      success: true,
      throttled: true,
      reason: preview.reason,
      activeBacklog: preview.activeBacklog,
      tasksSpawned: [],
      totalSpawned: 0,
    };
  }

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
      mayUpdate: candidate.mayUpdate || (candidate.sourceEntityId ? [candidate.sourceEntityId] : []),
      mayCreate: candidate.mayCreate || [],
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
        'storytime-author:harvester',
      ],
      priority_score: 850 - candidate.depth * 50,
    };

    let taskId = null;
    if (dashboard) {
      const created = await dashboard.createTask(dashboardProjectId, taskPayload).catch(() => null);
      if (created?.id) taskId = created.id;
    }

    // Record thread in exploration_threads
    await database.run(
      `INSERT INTO exploration_threads (
         id, project_id, thread_fingerprint, branch_key, thread_type, source_entity_id, job_type, depth, cycle_id, status, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'spawned', now(), now())
       ON CONFLICT (project_id, thread_fingerprint) DO UPDATE SET
         status = 'spawned', updated_at = now()`,
      `thread-${randomUUID().slice(0, 8)}`,
      projectId,
      candidate.threadFingerprint,
      candidate.branchKey || 'root',
      candidate.threadType,
      candidate.sourceEntityId || '',
      candidate.jobType,
      candidate.depth,
      preview.cycleId,
    ).catch(() => {});

    spawned.push({ taskId: taskId || `mock-${spawned.length}`, ...candidate });
  }

  // If tasks were spawned, update pending/deferred exploration_events to processed
  if (spawned.length > 0) {
    await database.run(
      "UPDATE exploration_events SET status = 'processed', processed_at = now() WHERE project_id = ? AND status IN ('pending', 'deferred')",
      projectId,
    ).catch(() => {});
  }

  return {
    success: true,
    cycleId: preview.cycleId,
    tasksSpawned: spawned,
    totalSpawned: spawned.length,
  };
}
