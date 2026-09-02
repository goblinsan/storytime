import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildPromptInput,
  configFromEnv,
  isEligibleStoryTask,
  LocalLlmClient,
  parseTaskMetadata,
  runOnce,
  safeError,
} from '../story-harness/worker.js';

const task = {
  id: 762,
  title: 'Draft NPCs',
  description: `Use StoryTime for this generation task.

\`\`\`json
{
  "jobType": "draft_campaign_asset_bundle",
  "storytimeProjectId": "project-1",
  "brief": "Create the first campaign bundle.",
  "focus": "balanced",
  "mustReference": ["event-old-war"],
  "avoid": ["modern slang"]
}
\`\`\`
`,
  status: 'open',
  delegation_status: 'unsupported',
  labels: ['storytime-generation', 'storytime-job:draft_campaign_asset_bundle'],
  priority_score: 900,
};

function context() {
  return {
    story: {
      id: 'project-1',
      title: 'Ember Coast',
      description: 'Storm-haunted frontier campaign.',
      content: '',
      type: 'campaign',
    },
    characters: [],
    locations: [{ id: 'loc-harbor' }],
    factions: [{ id: 'faction-candle-league' }],
    timelineEvents: [{ id: 'event-old-war' }, { id: 'event-king-falls' }],
    fixedTimelineFacts: [{ before: 'event-old-war', after: 'event-king-falls' }],
  };
}

function validPayload(overrides = {}) {
  return {
    jobType: 'draft_campaign_asset_bundle',
    schemaVersion: 1,
    worldBrief: {
      name: 'Ember Coast',
      summary: 'A coastline of oathbound ports and storm shrines.',
      themes: ['oaths'],
      openQuestions: [],
    },
    characters: [{
      id: 'character-mira',
      name: 'Mira Voss',
      role: 'oracle',
      summary: 'Reads omens in wreckage.',
      motivation: 'Protect the harbor.',
      locationId: 'loc-harbor',
      factionIds: ['faction-candle-league'],
    }],
    factions: [],
    locations: [],
    timelineEvents: [{
      id: 'event-lighthouse-oath',
      date: '12 Rainwane',
      title: 'The Lighthouse Oath',
      summary: 'The first visible campaign pressure.',
      after: ['event-old-war'],
      before: [],
      characterIds: ['character-mira'],
      locationIds: ['loc-harbor'],
      factionIds: ['faction-candle-league'],
    }],
    ...overrides,
  };
}

function makeDashboard(tasks = [task]) {
  const dashboard = {
    comments: [],
    releases: [],
    claims: [],
    listTasks: vi.fn(async () => tasks),
    claimTask: vi.fn(async (projectId, taskId, agent, leaseSeconds) => {
      dashboard.claims.push({ projectId, taskId, agent, leaseSeconds });
      return {};
    }),
    commentTask: vi.fn(async (projectId, taskId, body, agent) => {
      dashboard.comments.push({ projectId, taskId, body, agent });
      return {};
    }),
    releaseTask: vi.fn(async (projectId, taskId, agent, status) => {
      dashboard.releases.push({ projectId, taskId, agent, status });
      return {};
    }),
  };
  return dashboard;
}

function makeStore() {
  const store = {
    drafts: [],
    loadContext: vi.fn(async () => context()),
    insertGeneratedDraft: vi.fn(async (input) => {
      store.drafts.push(input);
      return 'draft-1';
    }),
  };
  return store;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('StoryTime harness worker', () => {
  it('identifies only story generation tasks for the StoryTime worker (migrated local_ready contract)', () => {
    // Migrated contract: accepts local_ready with storytime labels
    expect(isEligibleStoryTask({ ...task, delegation_status: 'local_ready' })).toBe(true);
    // Backward compatibility: accepts unsupported and human_required
    expect(isEligibleStoryTask({ ...task, delegation_status: 'unsupported' })).toBe(true);
    expect(isEligibleStoryTask({ ...task, delegation_status: 'human_required' })).toBe(true);

    // Strictly rejects any task with local-code label (even if local_ready and has storytime labels)
    expect(isEligibleStoryTask({ ...task, delegation_status: 'local_ready', labels: ['storytime-generation', 'local-code'] })).toBe(false);
    expect(isEligibleStoryTask({ ...task, labels: ['local-code'] })).toBe(false);

    // Rejects missing storytime-generation or unsupported jobs
    expect(isEligibleStoryTask({ ...task, labels: ['storytime-job:draft_campaign_asset_bundle'] })).toBe(false);
    expect(isEligibleStoryTask({ ...task, labels: ['storytime-generation', 'storytime-job:unsupported_custom_job'] })).toBe(false);

    // Rejects claimed or blocked tasks
    expect(isEligibleStoryTask({ ...task, claimed_by: 'other-agent' })).toBe(false);
    expect(isEligibleStoryTask({ ...task, blocked_dependencies: ['StoryTime/761'] })).toBe(false);
  });

  it('parses fenced job metadata and exploration provenance from the dashboard task description', () => {
    const explorationTask = {
      ...task,
      description: `Use StoryTime for this generation task.

\`\`\`json
{
  "jobType": "faction_politics_refinement",
  "storytimeProjectId": "project-1",
  "brief": "Flesh out the corporate board.",
  "depth": 1,
  "cycleId": "cycle-alpha-01",
  "parentTaskId": 836,
  "sourceDraftId": "draft-seed-01",
  "sourceCanonIds": ["fac-vander-thorne"],
  "threadFingerprint": "sha256-fingerprint-test",
  "mustReference": ["fac-vander-thorne"],
  "avoid": ["magic"]
}
\`\`\`
`,
    };

    expect(parseTaskMetadata(explorationTask)).toEqual({
      jobType: 'faction_politics_refinement',
      storytimeProjectId: 'project-1',
      brief: 'Flesh out the corporate board.',
      focus: 'balanced',
      depth: 1,
      cycleId: 'cycle-alpha-01',
      parentTaskId: 836,
      sourceDraftId: 'draft-seed-01',
      sourceCanonIds: ['fac-vander-thorne'],
      threadFingerprint: 'sha256-fingerprint-test',
      mustReference: ['fac-vander-thorne'],
      avoid: ['magic'],
    });
  });

  it('includes the gate-aligned output contract in prompt input', () => {
    const prompt = buildPromptInput(task, parseTaskMetadata(task), context());

    expect(prompt.outputContract.requiredTopLevelKeys).toEqual([
      'jobType',
      'schemaVersion',
      'worldBrief',
      'characters',
      'factions',
      'locations',
      'timelineEvents',
    ]);
    expect(prompt.outputContract.character.id).toBe('character-...');
    expect(prompt.instructions).toContain('Return a single JSON object with no markdown.');
    expect(prompt.instructions.some((inst) => inst.includes('slugified IDs'))).toBe(true);
    expect(prompt.instructions.some((inst) => inst.includes('distinct and unique'))).toBe(true);
    expect(prompt.instructions.some((inst) => inst.includes('evocative summary text'))).toBe(true);
    expect(prompt.instructions.some((inst) => inst.includes('in-world calendar dates'))).toBe(true);
  });

  it('lists eligible tasks in dry-run mode without claiming', async () => {
    const dashboard = makeDashboard([
      task,
      { ...task, id: 763, labels: ['storytime-generation'] },
      { ...task, id: 764, labels: ['storytime-generation', 'local-code'] },
    ]);

    const result = await runOnce({
      dashboard,
      config: { dryRun: true, dashboardProjectId: '22' },
    });

    expect(result).toEqual({
      mode: 'dry-run',
      eligible: [{ id: 762, title: 'Draft NPCs' }],
    });
    expect(dashboard.claimTask).not.toHaveBeenCalled();
  });

  it('claims one task, stores a generated draft, comments, and releases to acceptance review when autoPromote is false', async () => {
    const dashboard = makeDashboard();
    const store = makeStore();
    const llm = { generate: vi.fn(async () => validPayload()) };

    const result = await runOnce({
      dashboard,
      store,
      llm,
      config: {
        dashboardProjectId: '22',
        agent: 'storytime-harness',
        modelProvider: 'local',
        modelName: 'test-model',
        autoPromote: false,
      },
    });

    expect(result.processed).toBe(true);
    expect(result.status).toBe('acceptance_review');
    expect(dashboard.claims).toEqual([
      { projectId: '22', taskId: 762, agent: 'storytime-harness', leaseSeconds: 7200 },
    ]);
    expect(store.drafts[0]).toEqual(
      expect.objectContaining({
        projectId: 'project-1',
        artifactType: 'campaign_bundle',
        status: 'accepted',
        dashboardProjectId: '22',
        dashboardTaskId: '762',
        modelProvider: 'local',
        modelName: 'test-model',
      }),
    );
    expect(store.drafts[0].gateResult).toEqual(expect.objectContaining({ ok: true, violations: [] }));
    expect(dashboard.comments[0].body).toContain('draft-1');
    expect(dashboard.releases[0]).toEqual({
      projectId: '22',
      taskId: 762,
      agent: 'storytime-harness',
      status: 'acceptance_review',
    });
  });

  it('claims task, auto-promotes draft to canon, and releases to done when autoPromote is enabled', async () => {
    const dashboard = makeDashboard();
    const mockDb = {
      get: vi.fn(async (sql) => {
        if (sql.includes('FROM generated_drafts')) {
          return {
            id: 'draft-1',
            project_id: 'project-1',
            artifact_type: 'campaign_bundle',
            payload: JSON.stringify(validPayload()),
            status: 'accepted',
          };
        }
        return null;
      }),
      all: vi.fn(async () => []),
      run: vi.fn(async () => ({ changes: 1 })),
      transaction: vi.fn(async (fn) => fn(mockDb)),
    };
    const store = {
      ...makeStore(),
      db: mockDb,
    };
    const llm = { generate: vi.fn(async () => validPayload()) };

    const result = await runOnce({
      dashboard,
      store,
      llm,
      config: {
        dashboardProjectId: '22',
        agent: 'storytime-harness',
        modelProvider: 'local',
        modelName: 'test-model',
        autoPromote: true,
        autoExplore: false,
      },
    });

    expect(result.processed).toBe(true);
    expect(result.status).toBe('done');
    expect(result.promoted).toBe(true);
    expect(dashboard.releases[0]).toEqual({
      projectId: '22',
      taskId: 762,
      agent: 'storytime-harness',
      status: 'done',
    });
    expect(dashboard.comments[0].body).toContain('promoted draft draft-1 directly into live canon');
  });

  it('stores rejected drafts and releases task to done with [storytime:quarantined] when the gate fails', async () => {
    const dashboard = makeDashboard();
    const store = makeStore();
    const llm = { generate: vi.fn(async () => validPayload({ debug: true })) };

    const result = await runOnce({
      dashboard,
      store,
      llm,
      config: { dashboardProjectId: '22', agent: 'storytime-harness' },
    });

    expect(result.processed).toBe(true);
    expect(result.status).toBe('done');
    expect(result.quarantined).toBe(true);
    expect(store.drafts[0].status).toBe('rejected');
    expect(store.drafts[0].gateResult.violations).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'unknown_field' })]),
    );
    expect(dashboard.comments[0].body).toContain('[storytime:quarantined]');
    expect(dashboard.releases[0].status).toBe('done');
  });

  it('unwraps OpenAI-compatible content envelopes from local llm responses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      id: 'chatcmpl-local',
      object: 'chat.completion',
      choices: [{
        content: '```json\n{"jobType":"draft_campaign_asset_bundle","schemaVersion":1}\n```',
      }],
    }), { status: 200 })));

    const llm = new LocalLlmClient({
      baseUrl: 'http://llm.local',
      model: 'local',
      provider: 'openai-compatible',
    });

    await expect(llm.generate({ jobType: 'draft_campaign_asset_bundle' })).resolves.toEqual({
      jobType: 'draft_campaign_asset_bundle',
      schemaVersion: 1,
    });
  });

  it('falls back to reasoning content when local llm message content is empty', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      choices: [{
        message: {
          role: 'assistant',
          content: '',
          reasoning_content: '{"jobType":"draft_campaign_asset_bundle","schemaVersion":1}',
        },
      }],
    }), { status: 200 })));

    const llm = new LocalLlmClient({
      baseUrl: 'http://llm.local',
      model: 'local',
      provider: 'openai-compatible',
    });

    await expect(llm.generate({ jobType: 'draft_campaign_asset_bundle' })).resolves.toEqual({
      jobType: 'draft_campaign_asset_bundle',
      schemaVersion: 1,
    });
  });

  it('parses enabled and paused configurations from env', () => {
    expect(configFromEnv({}).enabled).toBe(true);
    expect(configFromEnv({}).paused).toBe(false);

    expect(configFromEnv({ STORYTIME_HARNESS_ENABLED: '0' }).enabled).toBe(false);
    expect(configFromEnv({ STORYTIME_HARNESS_ENABLED: 'false' }).enabled).toBe(false);
    expect(configFromEnv({ STORYTIME_HARNESS_PAUSED: '1' }).paused).toBe(true);
    expect(configFromEnv({ STORYTIME_HARNESS_PAUSED: 'true' }).paused).toBe(true);
  });

  it('skips run without querying tasks when harness is paused or disabled', async () => {
    const dashboard = makeDashboard();

    const disabledResult = await runOnce({
      dashboard,
      config: { enabled: false },
    });
    expect(disabledResult).toEqual({
      mode: 'run',
      processed: false,
      reason: 'harness_disabled',
    });
    expect(dashboard.listTasks).not.toHaveBeenCalled();

    const pausedResult = await runOnce({
      dashboard,
      config: { paused: true },
    });
    expect(pausedResult).toEqual({
      mode: 'run',
      processed: false,
      reason: 'harness_paused',
    });
    expect(dashboard.listTasks).not.toHaveBeenCalled();
  });

  it('scrubs database credentials, bearer tokens, and URLs from safeError', () => {
    const error = new Error('Failed to connect to postgresql://admin:supersecret@db.internal:5432/storytime with token Bearer secret-tok-12345 at https://api.internal/endpoint');
    const scrubbed = safeError(error);

    expect(scrubbed).not.toContain('supersecret');
    expect(scrubbed).not.toContain('secret-tok-12345');
    expect(scrubbed).not.toContain('https://api.internal/endpoint');
    expect(scrubbed).toContain('postgres://<redacted>');
    expect(scrubbed).toContain('Bearer <redacted>');
    expect(scrubbed).toContain('<url>');
  });
});
