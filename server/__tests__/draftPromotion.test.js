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
let store;
let promoteDraftToCanon;
let projectId;

const acceptedDraftId = 'draft-promo-acc-1';
const generatedDraftId = 'draft-promo-gen-2';
const rejectedDraftId = 'draft-promo-rej-3';

const bundlePayload = {
  jobType: 'draft_campaign_asset_bundle',
  schemaVersion: 1,
  worldBrief: {
    name: 'Ember Coastline',
    summary: 'A storm-scoured coastline of oathbound harbor shrines.',
    themes: ['oaths', 'tides'],
    openQuestions: ['Who stole the beacon?'],
  },
  characters: [
    {
      id: 'character-cressa',
      name: 'Cressa Vale',
      role: 'Harbor Warden',
      summary: 'Oversees docking rites and relics.',
      motivation: 'Protect the harbor from deep tides.',
      locationId: 'loc-deep-quay',
      factionIds: ['faction-candle-league'],
    },
  ],
  factions: [
    {
      id: 'faction-candle-league',
      name: 'The Candle League',
      summary: 'Maritime guild of lantern keepers.',
      goal: 'Secure fuel for the coastal beacons.',
      goals: ['Secure fuel for the coastal beacons.'],
      pressure: 'Dwindling oil shipments.',
      alliedFactionIds: [],
      rivalFactionIds: [],
    },
  ],
  locations: [
    {
      id: 'loc-deep-quay',
      name: 'Deep Quay',
      summary: 'Stone jetties extending into churning waters.',
      regionType: 'coastal',
      factionIds: ['faction-candle-league'],
    },
  ],
  timelineEvents: [
    {
      id: 'event-oath-broken',
      date: '15 Frostfall',
      title: 'The Broken Beacon Oath',
      summary: 'The lantern went dark during the night of high waters.',
      after: [],
      before: [],
      characterIds: ['character-cressa'],
      locationIds: ['loc-deep-quay'],
      factionIds: ['faction-candle-league'],
    },
  ],
};

beforeAll(async () => {
  db = await import('../db.js');
  await db.migrate();
  await db.run('TRUNCATE stories CASCADE');
  app = (await import('../app.js')).default;
  const promo = await import('../story-harness/promotion.js');
  promoteDraftToCanon = promo.promoteDraftToCanon;
  const worker = await import('../story-harness/worker.js');
  store = new worker.StoryStore(db);

  const project = await request(app)
    .post('/api/stories')
    .send({ title: 'Campaign Prime', description: 'Original description', type: 'campaign' });
  projectId = project.body.id;

  // Insert test drafts
  await db.run(`
    INSERT INTO generated_drafts (
      id, project_id, artifact_type, payload, status, dashboard_project_id,
      dashboard_task_id, model_provider, model_name, prompt_fingerprint, gate_result
    )
    VALUES (?, ?, ?, ?::jsonb, ?, ?, ?, ?, ?, ?, ?::jsonb)
  `,
    acceptedDraftId,
    projectId,
    'campaign_bundle',
    JSON.stringify(bundlePayload),
    'accepted',
    '22',
    '762',
    'local',
    'test-model',
    'fingerprint-1',
    JSON.stringify({ ok: true, violations: [] }),
  );

  await db.run(`
    INSERT INTO generated_drafts (
      id, project_id, artifact_type, payload, status, dashboard_project_id,
      dashboard_task_id, model_provider, model_name, prompt_fingerprint, gate_result
    )
    VALUES (?, ?, ?, ?::jsonb, ?, ?, ?, ?, ?, ?, ?::jsonb)
  `,
    generatedDraftId,
    projectId,
    'campaign_bundle',
    JSON.stringify(bundlePayload),
    'generated',
    '22',
    '763',
    'local',
    'test-model',
    'fingerprint-2',
    JSON.stringify({ ok: true, violations: [] }),
  );

  await db.run(`
    INSERT INTO generated_drafts (
      id, project_id, artifact_type, payload, status, dashboard_project_id,
      dashboard_task_id, model_provider, model_name, prompt_fingerprint, gate_result
    )
    VALUES (?, ?, ?, ?::jsonb, ?, ?, ?, ?, ?, ?, ?::jsonb)
  `,
    rejectedDraftId,
    projectId,
    'campaign_bundle',
    JSON.stringify(bundlePayload),
    'rejected',
    '22',
    '764',
    'local',
    'test-model',
    'fingerprint-3',
    JSON.stringify({ ok: false, violations: [{ code: 'contradiction' }] }),
  );
});

afterAll(async () => {
  await db.close();
});

describe('Draft promotion to canon', () => {
  it('refuses to promote drafts with status "generated"', async () => {
    await expect(promoteDraftToCanon(generatedDraftId, { db })).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining('Only accepted drafts can be promoted to canon'),
    });

    const res = await request(app)
      .post(`/api/generated-drafts/${generatedDraftId}/promote`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Only accepted drafts can be promoted to canon');
  });

  it('refuses to promote drafts with status "rejected"', async () => {
    await expect(promoteDraftToCanon(rejectedDraftId, { db })).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining('Only accepted drafts can be promoted to canon'),
    });

    const res = await request(app)
      .post(`/api/generated-drafts/${rejectedDraftId}/promote`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Only accepted drafts can be promoted to canon');
  });

  it('returns 404 for nonexistent draft', async () => {
    const res = await request(app)
      .post('/api/generated-drafts/nonexistent-id/promote')
      .send({});
    expect(res.status).toBe(404);
  });

  it('successfully promotes an accepted campaign_bundle draft into canonical tables', async () => {
    const res = await request(app)
      .post(`/api/generated-drafts/${acceptedDraftId}/promote`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.objectContaining({
        success: true,
        draftId: acceptedDraftId,
        projectId,
        dashboardTaskId: '762',
        counts: {
          worldBriefUpdated: true,
          characters: 1,
          factions: 1,
          locations: 1,
          timelineEvents: 1,
        },
      }),
    );
    expect(res.body.promotedAt).toBeTruthy();

    // Verify canonical character
    const charRow = await db.get('SELECT * FROM characters WHERE id = ?', 'character-cressa');
    expect(charRow).toBeTruthy();
    expect(charRow.name).toBe('Cressa Vale');
    expect(charRow.role).toBe('Harbor Warden');
    expect(charRow.character_type).toBe('campaign');
    expect(charRow.source_draft_id).toBe(acceptedDraftId);
    expect(charRow.source_task_id).toBe('762');
    expect(charRow.current_location_id).toBe('loc-deep-quay');

    // Verify canonical location
    const locRow = await db.get('SELECT * FROM locations WHERE id = ?', 'loc-deep-quay');
    expect(locRow).toBeTruthy();
    expect(locRow.name).toBe('Deep Quay');
    expect(locRow.region_type).toBe('coastal');
    expect(locRow.source_draft_id).toBe(acceptedDraftId);
    expect(locRow.source_task_id).toBe('762');

    // Verify canonical faction
    const facRow = await db.get('SELECT * FROM factions WHERE id = ?', 'faction-candle-league');
    expect(facRow).toBeTruthy();
    expect(facRow.name).toBe('The Candle League');
    expect(facRow.source_draft_id).toBe(acceptedDraftId);
    expect(facRow.source_task_id).toBe('762');
    expect(JSON.parse(facRow.goals)).toContain('Secure fuel for the coastal beacons.');

    // Verify canonical timeline event
    const evtRow = await db.get('SELECT * FROM timeline_events WHERE id = ?', 'event-oath-broken');
    expect(evtRow).toBeTruthy();
    expect(evtRow.title).toBe('The Broken Beacon Oath');
    expect(evtRow.date).toBe('15 Frostfall');
    expect(evtRow.source_draft_id).toBe(acceptedDraftId);
    expect(evtRow.source_task_id).toBe('762');

    // Verify worldBrief updated story
    const storyRow = await db.get('SELECT * FROM stories WHERE id = ?', projectId);
    expect(storyRow.description).toContain('A storm-scoured coastline of oathbound harbor shrines.');

    // Verify generated_drafts recorded promoted_at
    const draftRow = await db.get('SELECT * FROM generated_drafts WHERE id = ?', acceptedDraftId);
    expect(draftRow.promoted_at).toBeTruthy();
  });

  it('safely refuses duplicate promotion with 409 Conflict', async () => {
    const res = await request(app)
      .post(`/api/generated-drafts/${acceptedDraftId}/promote`)
      .send({});

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Draft has already been promoted to canon');
    expect(res.body.promotedAt).toBeTruthy();
  });

  it('allows idempotent re-promotion when force=true', async () => {
    const res = await request(app)
      .post(`/api/generated-drafts/${acceptedDraftId}/promote`)
      .send({ force: true });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('makes newly promoted canon entities immediately available to StoryStore context', async () => {
    const ctx = await store.loadContext(projectId);
    expect(ctx.characters.map((c) => c.id)).toContain('character-cressa');
    expect(ctx.locations.map((l) => l.id)).toContain('loc-deep-quay');
    expect(ctx.factions.map((f) => f.id)).toContain('faction-candle-league');
    expect(ctx.timelineEvents.map((e) => e.id)).toContain('event-oath-broken');
  });
});
