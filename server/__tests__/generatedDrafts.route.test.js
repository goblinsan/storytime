import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const connectionString = process.env.STORYTIME_TEST_DATABASE_URL;

if (!connectionString) {
  throw new Error(
    'STORYTIME_TEST_DATABASE_URL is not set. These tests need a Postgres they ' +
      'are allowed to truncate.',
  );
}

process.env.STORYTIME_DATABASE_URL = connectionString;

let app;
let db;
let projectId1;
let projectId2;

const draftId1 = 'draft-test-gen-1';
const draftId2 = 'draft-test-rej-2';
const draftId3 = 'draft-test-acc-3';

beforeAll(async () => {
  db = await import('../db.js');
  await db.migrate();
  await db.run('TRUNCATE stories CASCADE');
  app = (await import('../app.js')).default;

  const project1 = await request(app)
    .post('/api/stories')
    .send({ title: 'Campaign Prime', type: 'campaign' });
  projectId1 = project1.body.id;

  const project2 = await request(app)
    .post('/api/stories')
    .send({ title: 'Campaign Secondary', type: 'campaign' });
  projectId2 = project2.body.id;

  // Seed sample drafts
  await db.run(`
    INSERT INTO generated_drafts (
      id, project_id, artifact_type, payload, status, dashboard_project_id,
      dashboard_task_id, model_provider, model_name, prompt_fingerprint, gate_result
    )
    VALUES (?, ?, ?, ?::jsonb, ?, ?, ?, ?, ?, ?, ?::jsonb)
  `,
    draftId1,
    projectId1,
    'campaign_bundle',
    JSON.stringify({
      jobType: 'draft_campaign_asset_bundle',
      schemaVersion: 1,
      worldBrief: {
        name: 'The Ashen Coast',
        summary: 'A jagged shoreline of storm-scoured harbors.',
        themes: ['salt debt', 'harbor oaths'],
        openQuestions: ['Who extinguished the lighthouse beacon?'],
      },
      characters: [
        {
          id: 'character-cressa-vale',
          name: 'Cressa Vale',
          role: 'Harbor Warden',
          summary: 'Oversees docking rites and impounded relics.',
          motivation: 'Safeguard the lower docks from deep tides.',
          locationId: 'loc-deep-quay',
          factionIds: ['faction-salt-council'],
        },
      ],
      factions: [
        {
          id: 'faction-salt-council',
          name: 'Salt Council',
          summary: 'Governing body of harbor captains.',
          goal: 'Control maritime trade taxes.',
          pressure: 'An overdue tribute to the sea baron.',
        },
      ],
      locations: [
        {
          id: 'loc-deep-quay',
          name: 'Deep Quay',
          summary: 'The main docking pier carved into granite.',
          regionType: 'coastal harbor',
        },
      ],
      timelineEvents: [
        {
          id: 'event-beacon-quenched',
          date: '14 Deepchill',
          title: 'Quenching of the Light',
          summary: 'The beacon went dark during the winter solstice.',
        },
      ],
    }),
    'generated',
    '22',
    '762',
    'local',
    'hermes-3-8b',
    'sha256-fingerprint-1',
    JSON.stringify({ ok: true, violations: [] }),
  );

  await db.run(`
    INSERT INTO generated_drafts (
      id, project_id, artifact_type, payload, status, dashboard_project_id,
      dashboard_task_id, model_provider, model_name, prompt_fingerprint, gate_result
    )
    VALUES (?, ?, ?, ?::jsonb, ?, ?, ?, ?, ?, ?, ?::jsonb)
  `,
    draftId2,
    projectId1,
    'campaign_bundle',
    JSON.stringify({
      jobType: 'draft_campaign_asset_bundle',
      schemaVersion: 1,
      worldBrief: { name: 'Broken Reach' },
    }),
    'rejected',
    '22',
    '763',
    'local',
    'hermes-3-8b',
    'sha256-fingerprint-2',
    JSON.stringify({
      ok: false,
      violations: [
        {
          code: 'missing_required_key',
          path: '$.characters',
          message: 'characters array is required',
        },
      ],
    }),
  );

  await db.run(`
    INSERT INTO generated_drafts (
      id, project_id, artifact_type, payload, status, dashboard_project_id,
      dashboard_task_id, model_provider, model_name, prompt_fingerprint, gate_result
    )
    VALUES (?, ?, ?, ?::jsonb, ?, ?, ?, ?, ?, ?, ?::jsonb)
  `,
    draftId3,
    projectId2,
    'campaign_bundle',
    JSON.stringify({
      jobType: 'draft_campaign_asset_bundle',
      schemaVersion: 1,
      worldBrief: { name: 'Secondary Realm' },
      characters: [],
      factions: [],
      locations: [],
      timelineEvents: [],
    }),
    'accepted',
    '22',
    '764',
    'openai-compatible',
    'local-qwen',
    'sha256-fingerprint-3',
    JSON.stringify({ ok: true, violations: [] }),
  );
});

afterAll(async () => {
  await db.run('TRUNCATE stories CASCADE');
  await db.close();
});

describe('GET /api/generated-drafts', () => {
  it('lists all drafts across projects when no filters provided', async () => {
    const res = await request(app).get('/api/generated-drafts');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(3);
    const ids = res.body.map((d) => d.id);
    expect(ids).toContain(draftId1);
    expect(ids).toContain(draftId2);
    expect(ids).toContain(draftId3);
  });

  it('filters drafts by projectId', async () => {
    const res = await request(app)
      .get('/api/generated-drafts')
      .query({ projectId: projectId1 });
    expect(res.status).toBe(200);
    expect(res.body.every((d) => d.projectId === projectId1)).toBe(true);
    const ids = res.body.map((d) => d.id);
    expect(ids).toContain(draftId1);
    expect(ids).toContain(draftId2);
    expect(ids).not.toContain(draftId3);
  });

  it('filters drafts by status', async () => {
    const genRes = await request(app)
      .get('/api/generated-drafts')
      .query({ status: 'generated' });
    expect(genRes.status).toBe(200);
    expect(genRes.body.every((d) => d.status === 'generated')).toBe(true);
    expect(genRes.body.some((d) => d.id === draftId1)).toBe(true);

    const rejRes = await request(app)
      .get('/api/generated-drafts')
      .query({ status: 'rejected' });
    expect(rejRes.status).toBe(200);
    expect(rejRes.body.every((d) => d.status === 'rejected')).toBe(true);
    expect(rejRes.body.some((d) => d.id === draftId2)).toBe(true);

    const accRes = await request(app)
      .get('/api/generated-drafts')
      .query({ status: 'accepted' });
    expect(accRes.status).toBe(200);
    expect(accRes.body.every((d) => d.status === 'accepted')).toBe(true);
    expect(accRes.body.some((d) => d.id === draftId3)).toBe(true);
  });

  it('filters by both projectId and status', async () => {
    const res = await request(app)
      .get('/api/generated-drafts')
      .query({ projectId: projectId1, status: 'generated' });
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].id).toBe(draftId1);
    expect(res.body[0].status).toBe('generated');
    expect(res.body[0].projectId).toBe(projectId1);
  });

  it('returns 400 for invalid status', async () => {
    const res = await request(app)
      .get('/api/generated-drafts')
      .query({ status: 'bogus_status' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid draft status/i);
  });
});

describe('GET /api/generated-drafts/:id', () => {
  it('returns complete artifact structure for an existing draft', async () => {
    const res = await request(app).get(`/api/generated-drafts/${draftId1}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(expect.objectContaining({
      id: draftId1,
      projectId: projectId1,
      artifactType: 'campaign_bundle',
      status: 'generated',
      dashboardProjectId: '22',
      dashboardTaskId: '762',
      modelProvider: 'local',
      modelName: 'hermes-3-8b',
      promptFingerprint: 'sha256-fingerprint-1',
      payload: expect.objectContaining({
        jobType: 'draft_campaign_asset_bundle',
        worldBrief: expect.objectContaining({ name: 'The Ashen Coast' }),
        characters: expect.arrayContaining([
          expect.objectContaining({ name: 'Cressa Vale' }),
        ]),
      }),
      gateResult: expect.objectContaining({ ok: true, violations: [] }),
    }));
  });

  it('returns 404 for a non-existent draft id', async () => {
    const res = await request(app).get('/api/generated-drafts/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });
});

describe('PATCH /api/generated-drafts/:id', () => {
  it('transitions generated draft to accepted with proper D&D artifact shape', async () => {
    const patchRes = await request(app)
      .patch(`/api/generated-drafts/${draftId1}`)
      .send({ status: 'accepted' });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.id).toBe(draftId1);
    expect(patchRes.body.status).toBe('accepted');
    expect(patchRes.body.artifactType).toBe('campaign_bundle');
    expect(patchRes.body.payload.jobType).toBe('draft_campaign_asset_bundle');

    // Confirm shape { id, artifactType, status, payload } required for D&D import
    const { id, artifactType, status, payload } = patchRes.body;
    expect(id).toBe(draftId1);
    expect(artifactType).toBe('campaign_bundle');
    expect(status).toBe('accepted');
    expect(payload.worldBrief.name).toBe('The Ashen Coast');

    // Verify GET persists the update
    const getRes = await request(app).get(`/api/generated-drafts/${draftId1}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.status).toBe('accepted');
  });

  it('transitions draft to rejected', async () => {
    const patchRes = await request(app)
      .patch(`/api/generated-drafts/${draftId1}`)
      .send({ status: 'rejected' });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.status).toBe('rejected');

    const getRes = await request(app).get(`/api/generated-drafts/${draftId1}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.status).toBe('rejected');
  });

  it('re-opens rejected draft to generated', async () => {
    const patchRes = await request(app)
      .patch(`/api/generated-drafts/${draftId1}`)
      .send({ status: 'generated' });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.status).toBe('generated');
  });

  it('returns 400 when patching with invalid status', async () => {
    const res = await request(app)
      .patch(`/api/generated-drafts/${draftId1}`)
      .send({ status: 'approved' }); // 'approved' is not allowed, must be 'accepted'

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid draft status/i);
  });

  it('returns 404 when patching non-existent draft', async () => {
    const res = await request(app)
      .patch('/api/generated-drafts/non-existent-draft')
      .send({ status: 'accepted' });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });
});
