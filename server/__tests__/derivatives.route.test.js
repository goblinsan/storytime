import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const connectionString = process.env.CONTESORA_TEST_DATABASE_URL || process.env.STORYTIME_TEST_DATABASE_URL;

if (!connectionString) {
  throw new Error('CONTESORA_TEST_DATABASE_URL is not set.');
}

process.env.CONTESORA_DATABASE_URL = connectionString;

let app;
let db;
let testUniverseId;

beforeAll(async () => {
  db = await import('../db.js');
  await db.migrate();
  await db.run('TRUNCATE stories CASCADE');
  app = (await import('../app.js')).default;

  // Create a test universe with rich canon facts
  const universe = await request(app).post('/api/stories').send({
    title: 'Aethelgard Universe',
    description: 'A fantasy realm of floating citadels and broken bridges.',
    type: 'universe',
  });
  testUniverseId = universe.body.id;

  // Add canon characters
  await db.run(
    "INSERT INTO characters (id, project_id, name, role, motivation) VALUES ('char-1', ?, 'Aeloria the Sky-Knight', 'Knight Commander', 'Protect the floating citadels.')",
    testUniverseId,
  );
  await db.run(
    "INSERT INTO characters (id, project_id, name, role, motivation) VALUES ('char-2', ?, 'Dax the Rift-Trader', 'Contraband Merchant', 'Profit from void crystals.')",
    testUniverseId,
  );

  // Add canon locations
  await db.run(
    "INSERT INTO locations (id, project_id, name, region_type, description) VALUES ('loc-1', ?, 'Sunken Spire', 'citadel', 'An ancient spire suspended over the void.')",
    testUniverseId,
  );

  // Add canon factions
  await db.run(
    "INSERT INTO factions (id, project_id, name, description, goals) VALUES ('fac-1', ?, 'Skyward Order', 'Defenders of the realm', '[\"Secure the citadels\"]')",
    testUniverseId,
  );

  // Add canon timeline event
  await db.run(
    "INSERT INTO timeline_events (id, project_id, date, title, description) VALUES ('time-1', ?, 'Year 450', 'The Shattering of the Chain', 'The great anchoring chains broke.')",
    testUniverseId,
  );

  // Add bestiary entry
  await db.run(
    "INSERT INTO bestiary (id, project_id, name, category, hearts, tactics, status, description) VALUES ('beast-1', ?, 'Void Drake', 'Dragon', 10, '[\"Dive attack\"]', 'active', 'A winged terror.')",
    testUniverseId,
  );
});

afterAll(async () => {
  await db.run('TRUNCATE stories CASCADE');
  await db.close();
});

describe('Derivative Works API (Tasks 811 & 817)', () => {
  it('creates and lists derivative works for a universe project', async () => {
    const createRes = await request(app).post('/api/derivatives').send({
      projectId: testUniverseId,
      type: 'story',
      title: 'Wings of the Skyward Order',
      description: 'A novella about the defense of Sunken Spire.',
      status: 'draft',
      content: 'Chapter 1: The Sky-Knight ascends.',
      sourceCanonReferences: [
        { entityType: 'character', entityId: 'char-1', name: 'Aeloria the Sky-Knight' },
        { entityType: 'location', entityId: 'loc-1', name: 'Sunken Spire' },
      ],
    });

    expect(createRes.status).toBe(201);
    expect(createRes.body.id).toBeDefined();
    expect(createRes.body.title).toBe('Wings of the Skyward Order');
    expect(createRes.body.type).toBe('story');
    expect(createRes.body.sourceCanonReferences).toHaveLength(2);

    const listRes = await request(app)
      .get('/api/derivatives')
      .query({ projectId: testUniverseId });

    expect(listRes.status).toBe(200);
    expect(listRes.body.some((d) => d.id === createRes.body.id)).toBe(true);
  });

  it('rejects invalid derivative types', async () => {
    const res = await request(app).post('/api/derivatives').send({
      projectId: testUniverseId,
      type: 'unsupported_type',
      title: 'Invalid',
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid derivative type');
  });

  it('updates a derivative work', async () => {
    const created = await request(app).post('/api/derivatives').send({
      projectId: testUniverseId,
      type: 'screenplay',
      title: 'Draft Script',
      status: 'draft',
    });

    const updateRes = await request(app)
      .put(`/api/derivatives/${created.body.id}`)
      .send({
        title: 'Final Script: Citadel Falling',
        status: 'in_progress',
        content: 'FADE IN: A vast sky.',
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.title).toBe('Final Script: Citadel Falling');
    expect(updateRes.body.status).toBe('in_progress');
    expect(updateRes.body.content).toBe('FADE IN: A vast sky.');
  });

  it('generates a campaign derivative brief with D&D export payload (Task 817)', async () => {
    const genRes = await request(app).post('/api/derivatives/generate-brief').send({
      projectId: testUniverseId,
      type: 'campaign',
      title: 'Fall of the Sunken Spire Campaign',
      selectedEntityIds: ['char-1', 'loc-1', 'fac-1', 'time-1', 'beast-1'],
    });

    expect(genRes.status).toBe(201);
    expect(genRes.body.type).toBe('campaign');
    expect(genRes.body.title).toBe('Fall of the Sunken Spire Campaign');
    expect(genRes.body.content).toContain('Campaign Brief: Fall of the Sunken Spire Campaign');
    expect(genRes.body.content).toContain('Sunken Spire');
    expect(genRes.body.content).toContain('Aeloria the Sky-Knight');
    expect(genRes.body.sourceCanonReferences.length).toBeGreaterThan(0);

    // Verify D&D export payload
    const dndExport = await request(app).get(`/api/derivatives/${genRes.body.id}/dnd-export`);
    expect(dndExport.status).toBe(200);
    expect(dndExport.body.artifactType).toBe('campaign_bundle');
    expect(dndExport.body.status).toBe('accepted');
    expect(dndExport.body.payload.jobType).toBe('draft_campaign_asset_bundle');
    expect(dndExport.body.payload.worldBrief.name).toBe('Fall of the Sunken Spire Campaign');
    expect(dndExport.body.payload.characters.length).toBeGreaterThan(0);
    expect(dndExport.body.payload.characters[0].name).toBe('Aeloria the Sky-Knight');
  });

  it('generates non-campaign derivative briefs (story, screenplay, game_concept, storyboard) (Task 817)', async () => {
    // 1. Story
    const storyRes = await request(app).post('/api/derivatives/generate-brief').send({
      projectId: testUniverseId,
      type: 'story',
      title: 'Chronicles of the Sky-Knight',
    });
    expect(storyRes.status).toBe(201);
    expect(storyRes.body.type).toBe('story');
    expect(storyRes.body.content).toContain('Story Outline');
    expect(storyRes.body.content).toContain('Logline');

    // 2. Screenplay
    const screenRes = await request(app).post('/api/derivatives/generate-brief').send({
      projectId: testUniverseId,
      type: 'screenplay',
      title: 'Skyfall: Episode 1',
    });
    expect(screenRes.status).toBe(201);
    expect(screenRes.body.type).toBe('screenplay');
    expect(screenRes.body.content).toContain('Screenplay Treatment');

    // 3. Game Concept
    const gameRes = await request(app).post('/api/derivatives/generate-brief').send({
      projectId: testUniverseId,
      type: 'game_concept',
      title: 'Aethelgard: Void Tactics',
    });
    expect(gameRes.status).toBe(201);
    expect(gameRes.body.type).toBe('game_concept');
    expect(gameRes.body.content).toContain('Game Concept Document');

    // 4. Storyboard
    const boardRes = await request(app).post('/api/derivatives/generate-brief').send({
      projectId: testUniverseId,
      type: 'storyboard',
      title: 'Sequence 1: The Breach',
    });
    expect(boardRes.status).toBe(201);
    expect(boardRes.body.type).toBe('storyboard');
    expect(boardRes.body.content).toContain('Storyboard Sequence');
  });
});
