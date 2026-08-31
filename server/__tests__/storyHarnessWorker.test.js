import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildPromptInput,
  isEligibleStoryTask,
  LocalLlmClient,
  parseTaskMetadata,
  runOnce,
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
  it('identifies only story generation tasks for the StoryTime worker', () => {
    expect(isEligibleStoryTask(task)).toBe(true);
    expect(isEligibleStoryTask({ ...task, labels: ['storytime-generation', 'local-code'] })).toBe(false);
    expect(isEligibleStoryTask({ ...task, delegation_status: 'local_ready' })).toBe(false);
    expect(isEligibleStoryTask({ ...task, claimed_by: 'other-agent' })).toBe(false);
    expect(isEligibleStoryTask({ ...task, blocked_dependencies: ['StoryTime/761'] })).toBe(false);
  });

  it('parses fenced job metadata from the dashboard task description', () => {
    expect(parseTaskMetadata(task)).toEqual({
      jobType: 'draft_campaign_asset_bundle',
      storytimeProjectId: 'project-1',
      brief: 'Create the first campaign bundle.',
      focus: 'balanced',
      mustReference: ['event-old-war'],
      avoid: ['modern slang'],
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

  it('claims one task, stores a generated draft, comments, and releases to acceptance review', async () => {
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
        status: 'generated',
        dashboardProjectId: '22',
        dashboardTaskId: '762',
        modelProvider: 'local',
        modelName: 'test-model',
      }),
    );
    expect(store.drafts[0].gateResult).toEqual({ ok: true, violations: [] });
    expect(dashboard.comments[0].body).toContain('draft-1');
    expect(dashboard.releases[0]).toEqual({
      projectId: '22',
      taskId: 762,
      agent: 'storytime-harness',
      status: 'acceptance_review',
    });
  });

  it('stores rejected drafts and blocks the task when the gate fails', async () => {
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
    expect(result.status).toBe('blocked');
    expect(store.drafts[0].status).toBe('rejected');
    expect(store.drafts[0].gateResult.violations).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'unknown_field' })]),
    );
    expect(dashboard.comments[0].body).toContain('violations=unknown_field');
    expect(dashboard.releases[0].status).toBe('blocked');
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
});
