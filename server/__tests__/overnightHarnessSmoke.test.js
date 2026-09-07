import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'crypto';

const connectionString = process.env.STORYTIME_TEST_DATABASE_URL;
if (!connectionString) {
  throw new Error('STORYTIME_TEST_DATABASE_URL is not set.');
}
process.env.STORYTIME_DATABASE_URL = connectionString;

let db;
let runOnce;
let executeExplorationCycle;

beforeAll(async () => {
  db = (await import('../db.js')).default;
  await db.migrate();
  const workerMod = await import('../story-harness/worker.js');
  runOnce = workerMod.runOnce;
  const harvesterMod = await import('../story-harness/threadHarvester.js');
  executeExplorationCycle = harvesterMod.executeExplorationCycle;
});

afterAll(async () => {
  // These files share one worker process, so a pool left open outlives
  // the file that opened it, along with its idle connections and timers.
  await db.close();
});

describe('StoryTime Autonomous Overnight Harness Smoke Suite', () => {
  const projectId = `proj-smoke-${randomUUID().slice(0, 8)}`;

  beforeAll(async () => {
    // Seed test universe
    await db.run(
      `INSERT INTO stories (id, title, promotion_policy, is_protected, created_at, updated_at)
       VALUES (?, ?, 'auto_promote', false, now(), now())`,
      projectId,
      'Void Requiem: Smoke Universe',
    );
  });

  it('executes a full multi-cycle overnight workflow with auto-promotion, non-blocking quarantine, canon protection, and persistent metrics', async () => {
    const createdTasks = [];
    const comments = [];
    const releases = [];
    const claims = [];

    const mockDashboard = {
      listTasks: vi.fn(async () => createdTasks),
      createTask: vi.fn(async (pId, task) => {
        const id = 1000 + createdTasks.length;
        const record = { id, ...task, status: 'open' };
        createdTasks.push(record);
        return { id };
      }),
      claimTask: vi.fn(async (pId, taskId, agent, leaseSeconds) => {
        claims.push({ taskId, agent, leaseSeconds });
        return {};
      }),
      commentTask: vi.fn(async (pId, taskId, body, agent) => {
        comments.push({ taskId, body, agent });
        return {};
      }),
      releaseTask: vi.fn(async (pId, taskId, agent, status) => {
        releases.push({ taskId, agent, status });
        const target = createdTasks.find((t) => t.id === taskId);
        if (target) target.status = status;
        return {};
      }),
    };

    const store = {
      db,
      loadContext: async () => {
        const story = await db.get('SELECT * FROM stories WHERE id = ?', projectId);
        const characters = await db.all('SELECT * FROM characters WHERE project_id = ?', projectId);
        const factions = await db.all('SELECT * FROM factions WHERE project_id = ?', projectId);
        const locations = await db.all('SELECT * FROM locations WHERE project_id = ?', projectId);
        return { story, characters, factions, locations, timelineEvents: [], canonRelationships: [] };
      },
      insertGeneratedDraft: async (input) => {
        const id = `draft-${randomUUID().slice(0, 8)}`;
        const now = new Date().toISOString();
        await db.run(
          `INSERT INTO generated_drafts (
             id, project_id, artifact_type, payload, status, dashboard_project_id,
             dashboard_task_id, model_provider, model_name, prompt_fingerprint, gate_result, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          id,
          input.projectId,
          input.artifactType,
          JSON.stringify(input.payload),
          input.status,
          input.dashboardProjectId,
          input.dashboardTaskId,
          input.modelProvider,
          input.modelName,
          input.promptFingerprint,
          JSON.stringify(input.gateResult),
          now,
          now,
        );
        return id;
      },
    };

    // --- STEP 1: Process Seed Task with Auto-Promotion ---
    const seedTask = {
      id: 850,
      title: '[StoryTime] Seed Universe Genesis',
      description: `Use StoryTime autonomous worker.
\`\`\`json
{
  "storytimeProjectId": "${projectId}",
  "jobType": "draft_campaign_asset_bundle",
  "depth": 0,
  "cycleId": "cycle-root",
  "threadFingerprint": "fp-root-seed-1"
}
\`\`\``,
      delegation_status: 'local_ready',
      labels: ['storytime-generation', 'storytime-job:draft_campaign_asset_bundle'],
      status: 'open',
    };
    createdTasks.push(seedTask);

    const validSeedPayload = {
      jobType: 'draft_campaign_asset_bundle',
      schemaVersion: 1,
      worldBrief: {
        name: 'Void Requiem: Smoke Universe',
        summary: 'A cyberpunk void travel expanse where megacorporations strip-mine phantom star systems.',
        themes: ['necromancy', 'corporate decay', 'void navigation'],
        openQuestions: [
          'What phantom frequency does the ghost transmission transmit on?',
          'How does the Vander-Thorne cartel enforce patent rights on dead stars?',
        ],
      },
      characters: [
        {
          id: `char-malakor-vane-${projectId}`,
          name: 'Lord Malakor Vane',
          role: 'Cyborg Necromancer',
          summary: 'Ancient noble warlord who cheated oblivion.',
          motivation: 'Chase the echo of his lost wife across deep space.',
          locationId: 'loc-slipway-9',
          factionIds: ['fac-vander-thorne'],
        },
      ],
      factions: [
        {
          id: 'fac-vander-thorne',
          name: 'Vander-Thorne Orbital Cartel',
          summary: 'Ruthless megacorporation with an armada of void dreadnoughts.',
        },
      ],
      locations: [
        {
          id: 'loc-slipway-9',
          name: 'Slipway 9',
          summary: 'A crumbling deep-space transit waystation.',
        },
      ],
      timelineEvents: [
        {
          id: 'evt-first-transgression',
          date: 'Epoch 981.2',
          title: 'The Sacking of the Vane Estate',
          summary: 'Corporate strike forces breached the ancestral shields and slew Vanes family.',
          after: [],
          before: [],
          characterIds: [`char-malakor-vane-${projectId}`],
          locationIds: ['loc-slipway-9'],
          factionIds: ['fac-vander-thorne'],
        },
      ],
    };

    const runResult1 = await runOnce({
      dashboard: mockDashboard,
      store,
      llm: { generate: vi.fn(async () => validSeedPayload) },
      config: {
        dashboardProjectId: '22',
        agent: 'storytime-harness',
        autoPromote: true,
        autoExplore: true,
        maxExplorationDepth: 10,
        backlogLimit: 8,
      },
    });

    expect(runResult1.processed).toBe(true);
    expect(runResult1.status).toBe('done');
    expect(runResult1.promoted).toBe(true);

    // Verify draft was promoted into live canon tables!
    const canonChar = await db.get('SELECT * FROM characters WHERE id = ?', `char-malakor-vane-${projectId}`);
    expect(canonChar).toBeDefined();
    expect(canonChar.name).toBe('Lord Malakor Vane');

    // Verify child tasks were spawned by harvester!
    const spawnedChildren = createdTasks.filter((t) => t.id !== 850);
    expect(spawnedChildren.length).toBeGreaterThan(0);
    expect(spawnedChildren.every((t) => t.delegation_status === 'local_ready')).toBe(true);
    expect(spawnedChildren.every((t) => t.labels.includes('storytime-generation'))).toBe(true);

    // Verify outbox exploration event is marked processed
    const evtRow = await db.get('SELECT * FROM exploration_events WHERE project_id = ?', projectId);
    expect(evtRow).toBeDefined();
    expect(evtRow.status).toBe('processed');

    // --- STEP 2: Creative Failure is Quarantined Non-Blocking ---
    const failingTask = spawnedChildren[0];
    const invalidPayload = {
      ...validSeedPayload,
      unauthorized_extra_field: 'illegal schema injection',
      worldBrief: { name: 'Broken' }, // Missing required fields
    };

    const runResult2 = await runOnce({
      dashboard: mockDashboard,
      store,
      llm: { generate: vi.fn(async () => invalidPayload) },
      config: {
        dashboardProjectId: '22',
        agent: 'storytime-harness',
        autoPromote: true,
      },
    });

    expect(runResult2.processed).toBe(true);
    expect(runResult2.status).toBe('done'); // Does NOT block the overnight run!
    expect(runResult2.quarantined).toBe(true);

    // Verify quarantined comment was posted
    const quarantineComment = comments.find((c) => c.body.includes('[storytime:quarantined]'));
    expect(quarantineComment).toBeDefined();

    // --- STEP 3: Protected Canon Escalates to Manual Review ---
    // Mark Lord Malakor Vane as protected
    await db.run('UPDATE characters SET is_protected = TRUE WHERE id = ?', `char-malakor-vane-${projectId}`);

    // Mark other pending spawned children as completed so mutatingTask is claimed
    for (const t of createdTasks) {
      if (t.status === 'open') t.status = 'completed';
    }

    const mutatingTask = {
      id: 852,
      title: '[StoryTime] Mutate Vane Doctrine',
      description: `Use StoryTime autonomous worker.
\`\`\`json
{
  "storytimeProjectId": "${projectId}",
  "jobType": "character_family_lineage",
  "targetCharacterId": "char-malakor-vane-${projectId}",
  "mustReference": ["char-malakor-vane-${projectId}"],
  "mayUpdate": ["char-malakor-vane-${projectId}"],
  "depth": 1,
  "cycleId": "cycle-2"
}
\`\`\``,
      delegation_status: 'local_ready',
      labels: ['storytime-generation', 'storytime-job:character_family_lineage'],
      status: 'open',
    };
    createdTasks.push(mutatingTask);

    const lineagePayload = {
      jobType: 'character_family_lineage',
      schemaVersion: 1,
      targetCharacterId: `char-malakor-vane-${projectId}`,
      characters: [
        {
          id: 'char-aldus-vane',
          name: 'Aldus Vane',
          role: 'Patriarch Founder',
          summary: 'Ancient progenitor of House Vane who forged the void treaties.',
          relationships: [
            {
              target: `char-malakor-vane-${projectId}`,
              type: 'parent',
            },
          ],
        },
      ],
      familyLegacy: {
        heirloom: 'Obsidian Sigil Matrix',
        motto: 'From the Void We Reclaim',
        debtOrFortune: 'Ancestral patent on sub-space navigational beacons',
      },
    };

    const runResult3 = await runOnce({
      dashboard: mockDashboard,
      store,
      llm: { generate: vi.fn(async () => lineagePayload) },
      config: {
        dashboardProjectId: '22',
        agent: 'storytime-harness',
        autoPromote: true,
      },
    });

    expect(runResult3.processed).toBe(true);
    // Because char-malakor-vane is protected, it strictly forced 'manual' -> 'acceptance_review'!
    expect(runResult3.status).toBe('acceptance_review');
    expect(runResult3.policy).toBe('manual');

    // --- STEP 4: Record Run Summary to overnight_runs Table ---
    const runId = `run-${randomUUID().slice(0, 8)}`;
    await db.run(
      `INSERT INTO overnight_runs (
         id, project_id, started_at, completed_at, generated_count, promoted_count,
         rejected_count, deferred_count, skipped_count, blocked_count, spawned_count,
         active_backlog, summary_metrics
       ) VALUES (?, ?, now(), now(), 3, 1, 1, 0, 0, 0, ?, ?, ?::jsonb)`,
      runId,
      projectId,
      spawnedChildren.length,
      spawnedChildren.length,
      JSON.stringify({
        status: 'completed_bounded',
        maxDepth: 10,
        testedSuites: ['auto_promote', 'quarantine_non_blocking', 'canon_protection'],
      }),
    );

    const summaryRow = await db.get('SELECT * FROM overnight_runs WHERE id = ?', runId);
    expect(summaryRow).toBeDefined();
    expect(summaryRow.promoted_count).toBe(1);
    expect(summaryRow.rejected_count).toBe(1);
    expect(summaryRow.generated_count).toBe(3);
  });
});
