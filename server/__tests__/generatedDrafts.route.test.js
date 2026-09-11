import { createServer } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const connectionString = process.env.CONTESORA_TEST_DATABASE_URL || process.env.STORYTIME_TEST_DATABASE_URL;

if (!connectionString) {
  throw new Error(
    'CONTESORA_TEST_DATABASE_URL is not set. These tests need a Postgres they ' +
      'are allowed to truncate.',
  );
}

process.env.CONTESORA_DATABASE_URL = connectionString;

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

describe('a draft can be created, and answered', () => {
  let projectId;

  beforeAll(async () => {
    const res = await request(app).post('/api/stories').send({ title: 'Draft Test Universe' });
    projectId = res.body.id;
  });

  /**
   * The table has held drafts since migration 003 and the routes could read,
   * accept, reject and promote them -- but nothing could create one except the
   * harness writing straight to the database. The review queue existed and only
   * the local model could fill it, so a person had no way to ask for anything.
   */
  it('creates a draft and reads it back', async () => {
    const created = await request(app).post('/api/generated-drafts').send({
      projectId,
      artifactType: 'character_canon_request',
      payload: { characterId: 'char-x', fields: ['motivation', 'tendencies'] },
    });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('generated');

    const read = await request(app).get(`/api/generated-drafts/${created.body.id}`);
    expect(read.body.payload).toEqual({ characterId: 'char-x', fields: ['motivation', 'tendencies'] });
    expect(read.body.artifactType).toBe('character_canon_request');
  });

  it('refuses a draft without a project or a type', async () => {
    expect((await request(app).post('/api/generated-drafts').send({ artifactType: 'x' })).status).toBe(400);
    expect((await request(app).post('/api/generated-drafts').send({ projectId })).status).toBe(400);
  });

  it('refuses a draft for a project that does not exist', async () => {
    const res = await request(app).post('/api/generated-drafts').send({
      projectId: 'no-such-universe', artifactType: 'character_canon_request', payload: {},
    });
    expect(res.status).toBe(404);
  });

  it('refuses the same request twice', async () => {
    // A project holds one draft per fingerprint. Asking again for the same
    // character's same gaps is the same request, and says so rather than
    // filing a second one -- or, before the fingerprint was set, hanging.
    const body = {
      projectId,
      artifactType: 'character_canon_request',
      payload: { characterId: 'char-twice', fields: ['motivation'] },
    };
    const first = await request(app).post('/api/generated-drafts').send(body);
    expect(first.status).toBe(201);

    const again = await request(app).post('/api/generated-drafts').send(body);
    expect(again.status).toBe(409);
    expect(again.body.existingId).toBe(first.body.id);
  });

  it('tells a webhook when something is asked for, and does not depend on it', async () => {
    // The seam that connects the button to whatever answers it. Fire and
    // forget on purpose: a request that failed to save because a notifier was
    // down would be the app losing somebody's work over another system's
    // outage, so the create must succeed either way.
    const seen = [];
    const server = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => { seen.push(JSON.parse(body)); res.writeHead(200); res.end('{}'); });
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    process.env.CONTESORA_CANON_REQUEST_WEBHOOK = `http://127.0.0.1:${port}/hook`;

    try {
      const created = await request(app).post('/api/generated-drafts').send({
        projectId,
        artifactType: 'character_canon_request',
        payload: { characterId: 'char-hook', fields: ['motivation'] },
      });
      expect(created.status).toBe(201);

      // It is announced after the response, so wait for it rather than assume.
      const deadline = Date.now() + 2000;
      while (seen.length === 0 && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 25));
      }
      expect(seen).toHaveLength(1);
      expect(seen[0].event).toBe('draft.created');
      expect(seen[0].draft.payload.characterId).toBe('char-hook');
      expect(seen[0].draft.artifactType).toBe('character_canon_request');
    } finally {
      delete process.env.CONTESORA_CANON_REQUEST_WEBHOOK;
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('still files the request when the webhook is unreachable', async () => {
    // Nothing is listening on this port.
    process.env.CONTESORA_CANON_REQUEST_WEBHOOK = 'http://127.0.0.1:1/hook';
    try {
      const created = await request(app).post('/api/generated-drafts').send({
        projectId,
        artifactType: 'character_canon_request',
        payload: { characterId: 'char-nohook', fields: ['tendencies'] },
      });
      expect(created.status).toBe(201);
      const read = await request(app).get(`/api/generated-drafts/${created.body.id}`);
      expect(read.body.payload.characterId).toBe('char-nohook');
    } finally {
      delete process.env.CONTESORA_CANON_REQUEST_WEBHOOK;
    }
  });

  it('answers the request itself, so the button is the whole interaction', async () => {
    // The agent runs in the server now rather than in a second process the
    // owner has to remember to start. Stubbed, because the point under test is
    // the wiring -- filed, answered, validated, stored -- not the model.
    process.env.CONTESORA_CANON_AGENT_COMMAND = '/tmp/stub2.sh';
    const character = await request(app).post('/api/characters').send({
      projectId, name: 'Agent Subject', role: 'Forger', background: 'Worked the seams.',
    });
    try {
      const created = await request(app).post('/api/generated-drafts').send({
        projectId,
        artifactType: 'character_canon_request',
        payload: { characterId: character.body.id, fields: ['motivation', 'tendencies'] },
      });
      expect(created.status).toBe(201);
      // Answered after the response, so the button never waits on a model.
      expect(created.body.payload.proposed).toBeUndefined();

      const deadline = Date.now() + 8000;
      let read;
      do {
        await new Promise((r) => setTimeout(r, 100));
        read = await request(app).get(`/api/generated-drafts/${created.body.id}`);
      } while (!read.body.payload?.proposed && Date.now() < deadline);

      expect(read.body.payload.proposed).toEqual({
        motivation: 'stubbed want', tendencies: 'stubbed tendency',
      });
      // A draft, not canon: the character is untouched until somebody accepts.
      const who = await request(app).get(`/api/characters/${character.body.id}`);
      expect(who.body.motivation).toBe('');
      expect(read.body.status).toBe('generated');
    } finally {
      delete process.env.CONTESORA_CANON_AGENT_COMMAND;
    }
  });

  it('refuses the request, saying why, when the agent answers with the wrong fields', async () => {
    // Refused rather than trimmed: trimming makes a draft that quietly
    // rewrites something already written look like a draft that behaved.
    // And refused rather than left open: an open request with no proposal is
    // what one still being written looks like, so the surface waited forever.
    process.env.CONTESORA_CANON_AGENT_COMMAND = '/tmp/stub2.sh';
    const character = await request(app).post('/api/characters').send({
      projectId, name: 'Agent Subject Two', role: 'Scout', background: 'Walked the rim.',
    });
    try {
      const created = await request(app).post('/api/generated-drafts').send({
        projectId,
        artifactType: 'character_canon_request',
        payload: { characterId: character.body.id, fields: ['traits'] },
      });
      await new Promise((r) => setTimeout(r, 1500));
      const read = await request(app).get(`/api/generated-drafts/${created.body.id}`);
      expect(read.body.payload.proposed).toBeUndefined();
      expect(read.body.status).toBe('rejected');
      expect(read.body.payload.failed.reason).toMatch(/not asked for/);
    } finally {
      delete process.env.CONTESORA_CANON_AGENT_COMMAND;
    }
  });

  it('lets a rejected request be asked for again', async () => {
    // The unique index skips rejected rows, and the duplicate check did not,
    // so turning something down made it impossible to ask for a second time --
    // as a 409 the button has no way to show.
    const body = {
      projectId,
      artifactType: 'character_canon_request',
      payload: { characterId: 'char-reask', fields: ['motivation'] },
    };
    const first = await request(app).post('/api/generated-drafts').send(body);
    expect(first.status).toBe(201);
    expect((await request(app).post('/api/generated-drafts').send(body)).status).toBe(409);

    await request(app).patch(`/api/generated-drafts/${first.body.id}`).send({ status: 'rejected' });

    const again = await request(app).post('/api/generated-drafts').send(body);
    expect(again.status, 'a rejected request should be askable again').toBe(201);
  });

  it('carries an answer back in the same row', async () => {
    // A request and its answer are one artifact. Two rows could be reviewed
    // separately, which is how somebody accepts an answer to a question that
    // was withdrawn.
    const created = await request(app).post('/api/generated-drafts').send({
      projectId,
      artifactType: 'character_canon_request',
      payload: { characterId: 'char-y', fields: ['motivation'] },
    });
    const answered = await request(app).patch(`/api/generated-drafts/${created.body.id}`).send({
      payload: { characterId: 'char-y', fields: ['motivation'], proposed: { motivation: 'To be let alone.' } },
    });
    expect(answered.status).toBe(200);

    const read = await request(app).get(`/api/generated-drafts/${created.body.id}`);
    expect(read.body.payload.proposed).toEqual({ motivation: 'To be let alone.' });
    expect(read.body.status).toBe('generated');
  });
});

