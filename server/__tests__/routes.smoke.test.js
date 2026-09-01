import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// The move to Postgres rewrote 67 call sites across eight route modules. The
// stories suite covers one of them. This covers the rest: one write and one read
// per module, which is what catches a mangled placeholder or a lost await. It is
// breadth, not depth -- depth is the per-route work those tasks describe.
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
let projectId;

beforeAll(async () => {
  db = await import('../db.js');
  await db.migrate();
  await db.run('TRUNCATE stories CASCADE');
  app = (await import('../app.js')).default;

  const created = await request(app)
    .post('/api/stories')
    .send({ title: 'Smoke', type: 'campaign' });
  projectId = created.body.id;
  expect(projectId).toEqual(expect.any(String));
});

afterAll(async () => {
  await db.run('TRUNCATE stories CASCADE');
  await db.close();
});

describe('characters', () => {
  it('serves projects through the preview subpath API alias', async () => {
    const listed = await request(app).get('/storytime/api/stories');
    expect(listed.status).toBe(200);
    expect(listed.body.some((project) => project.id === projectId)).toBe(true);
  });

  it('creates and lists', async () => {
    const created = await request(app)
      .post('/api/characters')
      .send({ projectId, name: 'Wren', traits: ['stubborn'] });
    expect(created.status).toBe(201);

    const listed = await request(app).get('/api/characters').query({ projectId });
    expect(listed.status).toBe(200);
    expect(listed.body.some((c) => c.name === 'Wren')).toBe(true);
  });
});

describe('arcs', () => {
  it('creates and lists, with details parsed back to an array', async () => {
    const created = await request(app)
      .post('/api/arcs')
      .send({ projectId, title: 'The Long Winter', details: ['a', 'b'] });
    expect(created.status).toBe(201);
    expect(created.body.arcNumber).toBe(1);

    const listed = await request(app).get('/api/arcs').query({ projectId });
    expect(listed.status).toBe(200);
    const found = listed.body.find((a) => a.title === 'The Long Winter');
    expect(found.details).toEqual(['a', 'b']);
    // Read back from a SELECT, not from the create response, which builds its
    // body from local variables and so never exercises the column aliases.
    expect(found.arcNumber).toBe(1);
    expect(found.projectId).toBe(projectId);
  });

  it('refuses a create against a project that does not exist', async () => {
    const response = await request(app)
      .post('/api/arcs')
      .send({ projectId: 'no-such-project', title: 'Nowhere' });
    expect(response.status).toBe(404);
  });
});

describe('bestiary', () => {
  it('creates and lists', async () => {
    const created = await request(app)
      .post('/api/bestiary')
      .send({ projectId, name: 'Salt Wyrm', category: 'beast', tactics: ['burrow'] });
    expect(created.status).toBe(201);

    const listed = await request(app).get('/api/bestiary').query({ projectId });
    expect(listed.status).toBe(200);
    expect(listed.body.some((b) => b.name === 'Salt Wyrm')).toBe(true);
  });
});

describe('locations', () => {
  it('creates and lists', async () => {
    const created = await request(app)
      .post('/api/locations')
      .send({ projectId, name: 'Ashford', races: ['dwarf'] });
    expect(created.status).toBe(201);

    const listed = await request(app).get('/api/locations').query({ projectId });
    expect(listed.status).toBe(200);
    expect(listed.body.some((l) => l.name === 'Ashford')).toBe(true);
  });
});

describe('terrain', () => {
  it('returns null before anything is stored, then round-trips', async () => {
    const empty = await request(app).get('/api/terrain').query({ projectId });
    expect(empty.status).toBe(200);
    expect(empty.body).toBeNull();

    const put = await request(app)
      .put('/api/terrain')
      .send({ projectId, cols: 12, rows: 8, terrainData: 'xxxx' });
    expect(put.status).toBeLessThan(300);

    const stored = await request(app).get('/api/terrain').query({ projectId });
    expect(stored.body.cols).toBe(12);
    expect(stored.body.terrainData).toBe('xxxx');
  });

  it('refuses a read with no story', async () => {
    const response = await request(app).get('/api/terrain');
    expect(response.status).toBe(400);
  });
});

describe('paths', () => {
  it('creates and lists', async () => {
    const created = await request(app)
      .post('/api/paths')
      .send({ projectId, name: 'Salt Road', waypoints: [{ x: 1, y: 2 }] });
    expect(created.status).toBeLessThan(300);

    const listed = await request(app).get('/api/paths').query({ projectId });
    expect(listed.status).toBe(200);
    expect(listed.body.some((p) => p.name === 'Salt Road')).toBe(true);
  });
});

describe('import', () => {
  it('lists assets without error on an empty store', async () => {
    const response = await request(app).get('/api/import');
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
  });
});

describe('generated draft storage', () => {
  it('stores generated campaign bundle provenance without creating canon rows', async () => {
    const draftId = 'draft-smoke-1';

    await db.run(`
      INSERT INTO generated_drafts (
        id, project_id, artifact_type, payload, dashboard_project_id,
        dashboard_task_id, model_provider, model_name, prompt_fingerprint
      )
      VALUES (?, ?, ?, ?::jsonb, ?, ?, ?, ?, ?)
    `,
      draftId,
      projectId,
      'campaign_bundle',
      JSON.stringify({ jobType: 'draft_campaign_asset_bundle', schemaVersion: 1 }),
      '22',
      '762',
      'local',
      'idle-llm',
      'prompt-sha256-example',
    );

    const stored = await db.get(
      'SELECT artifact_type, status, payload, dashboard_project_id FROM generated_drafts WHERE id = ?',
      draftId,
    );

    expect(stored.artifact_type).toBe('campaign_bundle');
    expect(stored.status).toBe('generated');
    expect(stored.payload.jobType).toBe('draft_campaign_asset_bundle');
    expect(stored.dashboard_project_id).toBe('22');
  });

  it('lists, reads and accepts generated drafts for downstream import', async () => {
    const draftId = 'draft-review-1';

    await db.run(`
      INSERT INTO generated_drafts (
        id, project_id, artifact_type, payload, dashboard_project_id,
        dashboard_task_id, model_provider, model_name, prompt_fingerprint
      )
      VALUES (?, ?, ?, ?::jsonb, ?, ?, ?, ?, ?)
    `,
      draftId,
      projectId,
      'campaign_bundle',
      JSON.stringify({
        jobType: 'draft_campaign_asset_bundle',
        schemaVersion: 1,
        worldBrief: { name: 'Smoke Coast' },
        characters: [],
        locations: [],
      }),
      '22',
      '763',
      'openai-compatible',
      'local',
      'prompt-sha256-review',
    );

    const listed = await request(app)
      .get('/api/generated-drafts')
      .query({ projectId, status: 'generated' });
    expect(listed.status).toBe(200);
    expect(listed.body.some((draft) => draft.id === draftId)).toBe(true);

    const accepted = await request(app)
      .patch(`/api/generated-drafts/${draftId}`)
      .send({ status: 'accepted' });
    expect(accepted.status).toBe(200);
    expect(accepted.body).toEqual(expect.objectContaining({
      id: draftId,
      artifactType: 'campaign_bundle',
      status: 'accepted',
      payload: expect.objectContaining({
        jobType: 'draft_campaign_asset_bundle',
      }),
    }));

    const fetched = await request(app).get(`/api/generated-drafts/${draftId}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body.status).toBe('accepted');
  });
});

describe('stories detail', () => {
  it('assembles a project with its characters, arcs and bestiary', async () => {
    const response = await request(app).get(`/api/stories/${projectId}`);
    expect(response.status).toBe(200);
    expect(response.body.characters.some((c) => c.name === 'Wren')).toBe(true);
    expect(response.body.arcs.some((a) => a.title === 'The Long Winter')).toBe(true);
    expect(response.body.bestiary.some((b) => b.name === 'Salt Wyrm')).toBe(true);
  });
});
