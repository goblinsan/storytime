import { createHash, randomUUID } from 'node:crypto';
import { validateCampaignBundle } from './consistencyGate.js';

const AGENT = 'storytime-harness';
const DEFAULT_DASHBOARD_PROJECT_ID = '22';
const JOB_TYPE = 'draft_campaign_asset_bundle';
const STORY_LABEL = 'storytime-generation';
const JOB_LABEL = 'storytime-job:draft_campaign_asset_bundle';

function envFlag(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value ?? '').toLowerCase());
}

function normalizeLabels(task) {
  if (Array.isArray(task?.labels)) return task.labels.map((label) => String(label));
  if (typeof task?.labels === 'string' && task.labels.trim()) {
    try {
      const parsed = JSON.parse(task.labels);
      if (Array.isArray(parsed)) return parsed.map((label) => String(label));
    } catch {
      return task.labels.split(',').map((label) => label.trim());
    }
  }
  return [];
}

function isClaimFree(task, now = new Date()) {
  if (!task?.claimed_by) return true;
  if (!task?.claim_expires_at) return false;
  const expiresAt = Date.parse(task.claim_expires_at);
  return Number.isFinite(expiresAt) && expiresAt <= now.getTime();
}

export function isEligibleStoryTask(task, now = new Date()) {
  const labels = normalizeLabels(task).map((label) => label.toLowerCase());
  const delegation = String(task?.delegation_status ?? '').toLowerCase();
  const status = String(task?.status ?? '').toLowerCase();
  return (
    status === 'open' &&
    (delegation === 'unsupported' || delegation === 'human_required') &&
    labels.includes(STORY_LABEL) &&
    labels.includes(JOB_LABEL) &&
    !labels.includes('local-code') &&
    isClaimFree(task, now)
  );
}

function parseJsonFromFence(text) {
  const fence = String(text ?? '').match(/```json\s*([\s\S]*?)```/i);
  if (!fence) return null;
  try {
    return JSON.parse(fence[1]);
  } catch {
    return null;
  }
}

function parseLineValue(text, key) {
  const match = String(text ?? '').match(new RegExp(`^${key}:\\s*(.+)$`, 'im'));
  return match ? match[1].trim() : '';
}

export function parseTaskMetadata(task) {
  const targetEntries = Array.isArray(task?.target_entries)
    ? task.target_entries
    : Object.values(task?.target_entries ?? {});
  const metadataEntry = targetEntries.find((entry) => entry?.storytimeHarness);
  const fenced = parseJsonFromFence(task?.description);
  const metadata = metadataEntry?.storytimeHarness ?? fenced ?? {};

  return {
    jobType: metadata.jobType ?? parseLineValue(task?.description, 'jobType'),
    storytimeProjectId:
      metadata.storytimeProjectId ?? parseLineValue(task?.description, 'storytimeProjectId'),
    brief: metadata.brief ?? parseLineValue(task?.description, 'brief') ?? task?.title ?? '',
    focus: metadata.focus ?? parseLineValue(task?.description, 'focus') ?? 'balanced',
    mustReference: Array.isArray(metadata.mustReference) ? metadata.mustReference : [],
    avoid: Array.isArray(metadata.avoid) ? metadata.avoid : [],
  };
}

function promptFingerprint(input) {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

function parseModelJson(value) {
  if (typeof value === 'string') return JSON.parse(value);
  if (value?.response) return parseModelJson(value.response);
  if (value?.message?.content) return parseModelJson(value.message.content);
  if (value?.choices?.[0]?.message?.content) {
    return parseModelJson(value.choices[0].message.content);
  }
  return value;
}

export class DashboardClient {
  constructor({ baseUrl, token } = {}) {
    if (!baseUrl) throw new Error('DASHBOARD_BASE_URL is required');
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.token = token ?? '';
  }

  async request(method, path, body) {
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
      headers['X-Control-Workflow-Token'] = this.token;
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    const parsed = text ? JSON.parse(text) : null;
    if (!response.ok) {
      throw new Error(`dashboard ${method} ${path} failed: ${response.status}`);
    }
    return parsed;
  }

  async listTasks(projectId) {
    const result = await this.request('GET', `/projects/${projectId}/tasks?limit=200`);
    return result?.data ?? result ?? [];
  }

  async claimTask(projectId, taskId, agent, leaseSeconds) {
    return this.request('POST', `/projects/${projectId}/tasks/${taskId}/claim`, {
      agent,
      status: 'in_progress',
      lease_seconds: leaseSeconds,
    });
  }

  async commentTask(projectId, taskId, body, agent = AGENT) {
    return this.request('POST', `/projects/${projectId}/tasks/${taskId}/comments`, {
      author: agent,
      tag: 'storytime-harness',
      body,
    });
  }

  async releaseTask(projectId, taskId, agent, status) {
    return this.request('POST', `/projects/${projectId}/tasks/${taskId}/release`, {
      agent,
      status,
    });
  }
}

export class LocalLlmClient {
  constructor({ baseUrl, model, provider = 'ollama' } = {}) {
    if (!baseUrl) throw new Error('LLM_BASE_URL is required');
    if (!model) throw new Error('LLM_MODEL is required');
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.model = model;
    this.provider = provider;
  }

  async generate(promptInput) {
    const prompt = [
      'Return JSON only for this StoryTime job.',
      'Do not include markdown fences.',
      JSON.stringify(promptInput, null, 2),
    ].join('\n\n');

    if (this.provider === 'openai-compatible') {
      const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          temperature: 0.2,
          response_format: { type: 'json_object' },
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (!response.ok) throw new Error(`llm request failed: ${response.status}`);
      return parseModelJson(await response.json());
    }

    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        prompt,
        stream: false,
        format: 'json',
      }),
    });
    if (!response.ok) throw new Error(`llm request failed: ${response.status}`);
    return parseModelJson(await response.json());
  }
}

export class StoryStore {
  constructor(database) {
    if (!database) throw new Error('StoryStore needs a database adapter');
    this.db = database;
  }

  async loadContext(projectId) {
    const story = await this.db.get(
      'SELECT id, title, description, content, type FROM stories WHERE id = ?',
      projectId,
    );
    if (!story) throw new Error('storytime project not found');

    const characters = await this.db.all(`
      SELECT id, name, description, background, character_type, role, current_location_id
      FROM characters
      WHERE project_id = ?
      ORDER BY created_at ASC
    `, projectId);

    const locations = await this.db.all(`
      SELECT id, name, description, region_type, political_notes
      FROM locations
      WHERE project_id = ?
      ORDER BY name ASC
    `, projectId);

    const factions = await this.db.all(`
      SELECT id, name, description, goals
      FROM factions
      WHERE project_id = ?
      ORDER BY name ASC
    `, projectId);

    const timelineEvents = await this.db.all(`
      SELECT id, date, title, description
      FROM timeline_events
      WHERE project_id = ?
      ORDER BY date ASC, title ASC
    `, projectId);

    const fixedTimelineFacts = [];
    for (let index = 0; index < timelineEvents.length - 1; index += 1) {
      fixedTimelineFacts.push({
        before: timelineEvents[index].id,
        after: timelineEvents[index + 1].id,
      });
    }

    return { story, characters, locations, factions, timelineEvents, fixedTimelineFacts };
  }

  async insertGeneratedDraft(input) {
    const id = input.id ?? randomUUID();
    await this.db.run(`
      INSERT INTO generated_drafts (
        id, project_id, artifact_type, payload, status, dashboard_project_id,
        dashboard_task_id, dashboard_run_id, model_provider, model_name,
        prompt_fingerprint, gate_result
      )
      VALUES (?, ?, ?, ?::jsonb, ?, ?, ?, ?, ?, ?, ?, ?::jsonb)
    `,
      id,
      input.projectId,
      input.artifactType,
      JSON.stringify(input.payload),
      input.status,
      input.dashboardProjectId,
      input.dashboardTaskId,
      input.dashboardRunId ?? '',
      input.modelProvider,
      input.modelName,
      input.promptFingerprint,
      JSON.stringify(input.gateResult),
    );
    return id;
  }
}

export function buildPromptInput(task, metadata, context) {
  return {
    jobType: JOB_TYPE,
    storytimeProject: context.story,
    brief: metadata.brief,
    focus: metadata.focus,
    existingCharacters: context.characters,
    existingLocations: context.locations,
    existingFactions: context.factions,
    fixedTimelineFacts: context.fixedTimelineFacts,
    mustReference: metadata.mustReference,
    avoid: metadata.avoid,
    outputSchemaVersion: 1,
    dashboardTask: {
      id: task.id,
      title: task.title,
    },
  };
}

function safeError(error) {
  return error instanceof Error ? error.message.replace(/https?:\/\/\S+/g, '<url>') : String(error);
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function successComment(draftId, gateResult) {
  return [
    `StoryTime harness generated draft ${draftId}.`,
    'artifact=campaign_bundle',
    `gate=${gateResult.ok ? 'ok' : 'failed'}`,
    gateResult.ok ? '' : `violations=${gateResult.violations.map((v) => v.code).join(',')}`,
  ].filter(Boolean).join(' ');
}

export async function runOnce({
  dashboard,
  store,
  llm,
  config = {},
} = {}) {
  const dashboardProjectId = String(config.dashboardProjectId ?? DEFAULT_DASHBOARD_PROJECT_ID);
  const agent = config.agent ?? AGENT;
  const leaseSeconds = Number(config.leaseSeconds ?? 7200);
  const dryRun = Boolean(config.dryRun);

  const tasks = await dashboard.listTasks(dashboardProjectId);
  const eligible = tasks
    .filter((task) => isEligibleStoryTask(task))
    .sort((a, b) => Number(b.priority_score ?? 0) - Number(a.priority_score ?? 0));

  if (dryRun) {
    return {
      mode: 'dry-run',
      eligible: eligible.map((task) => ({ id: task.id, title: task.title })),
    };
  }

  const task = eligible[0];
  if (!task) return { mode: 'run', processed: false, reason: 'no_eligible_tasks' };
  if (!store) throw new Error('Story store is required outside dry-run mode');
  if (!llm) throw new Error('LLM client is required outside dry-run mode');

  await dashboard.claimTask(dashboardProjectId, task.id, agent, leaseSeconds);

  try {
    const metadata = parseTaskMetadata(task);
    if (metadata.jobType !== JOB_TYPE || !metadata.storytimeProjectId) {
      throw new Error('missing required StoryTime harness metadata');
    }

    const context = await store.loadContext(metadata.storytimeProjectId);
    const promptInput = buildPromptInput(task, metadata, context);
    const fingerprint = promptFingerprint(promptInput);
    const payload = await llm.generate(promptInput);
    const gateResult = validateCampaignBundle(payload, context);
    const status = gateResult.ok ? 'generated' : 'rejected';
    const draftId = await store.insertGeneratedDraft({
      projectId: metadata.storytimeProjectId,
      artifactType: 'campaign_bundle',
      payload,
      status,
      dashboardProjectId,
      dashboardTaskId: String(task.id),
      dashboardRunId: '',
      modelProvider: config.modelProvider ?? 'local',
      modelName: config.modelName ?? 'unknown',
      promptFingerprint: fingerprint,
      gateResult,
    });

    await dashboard.commentTask(dashboardProjectId, task.id, successComment(draftId, gateResult), agent);
    await dashboard.releaseTask(
      dashboardProjectId,
      task.id,
      agent,
      gateResult.ok ? 'acceptance_review' : 'blocked',
    );

    return {
      mode: 'run',
      processed: true,
      taskId: task.id,
      draftId,
      gateResult,
      status: gateResult.ok ? 'acceptance_review' : 'blocked',
    };
  } catch (error) {
    await dashboard.commentTask(
      dashboardProjectId,
      task.id,
      `StoryTime harness failed before accepting content. phase=worker error=${safeError(error)}`,
      agent,
    );
    await dashboard.releaseTask(dashboardProjectId, task.id, agent, 'blocked');
    return { mode: 'run', processed: false, taskId: task.id, error: safeError(error) };
  }
}

export async function runLoop({
  dashboard,
  store,
  llm,
  config = {},
} = {}) {
  const pollIntervalMs = Math.max(1000, Number(config.pollIntervalMs ?? 60000));

  while (true) {
    const result = await runOnce({ dashboard, store, llm, config });
    console.log(JSON.stringify(result, null, 2));
    await sleep(pollIntervalMs);
  }
}

export function configFromEnv(env = process.env) {
  return {
    dashboardProjectId: env.STORYTIME_DASHBOARD_PROJECT_ID ?? DEFAULT_DASHBOARD_PROJECT_ID,
    agent: env.STORYTIME_HARNESS_AGENT ?? AGENT,
    leaseSeconds: Number(env.STORYTIME_HARNESS_LEASE_SECONDS ?? 7200),
    dryRun: envFlag(env.STORYTIME_HARNESS_DRY_RUN),
    loop: envFlag(env.STORYTIME_HARNESS_LOOP),
    pollIntervalMs: Number(env.STORYTIME_HARNESS_POLL_INTERVAL_MS ?? 60000),
    modelProvider: env.LLM_PROVIDER ?? 'ollama',
    modelName: env.LLM_MODEL ?? '',
  };
}

export async function main() {
  const config = configFromEnv();
  const dashboard = new DashboardClient({
    baseUrl: process.env.DASHBOARD_BASE_URL,
    token: process.env.DASHBOARD_API_TOKEN || process.env.DASHBOARD_CONTROL_WORKFLOW_TOKEN,
  });
  let store = null;
  let llm = null;
  if (!config.dryRun) {
    const database = (await import('../db.js')).default;
    await database.migrate();
    store = new StoryStore(database);
    llm = new LocalLlmClient({
      baseUrl: process.env.LLM_BASE_URL,
      model: process.env.LLM_MODEL,
      provider: process.env.LLM_PROVIDER,
    });
  }
  if (config.loop && !config.dryRun) {
    await runLoop({ dashboard, store, llm, config });
    return;
  }

  const result = await runOnce({ dashboard, store, llm, config });
  console.log(JSON.stringify(result, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(safeError(error));
    process.exitCode = 1;
  });
}
