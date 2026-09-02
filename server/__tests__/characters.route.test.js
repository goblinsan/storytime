import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const connectionString = process.env.STORYTIME_TEST_DATABASE_URL;

if (!connectionString) {
  throw new Error(
    'STORYTIME_TEST_DATABASE_URL is not set. These tests need a Postgres they ' +
      'are allowed to truncate. Skipping them silently would report success ' +
      'for a suite that never ran.',
  );
}

process.env.STORYTIME_DATABASE_URL = connectionString;

let app;
let db;

beforeAll(async () => {
  db = await import('../db.js');
  await db.migrate();
  await db.run('TRUNCATE stories CASCADE');
  app = (await import('../app.js')).default;
});

afterAll(async () => {
  await db.run('TRUNCATE stories CASCADE');
  await db.close();
});

describe('Characters API & Family Tree Architecture', () => {
  let projectId;

  beforeAll(async () => {
    const res = await request(app).post('/api/stories').send({
      title: 'Test Universe',
      calendarLabel: 'Year of the Iron Dirge',
    });
    projectId = res.body.id;
  });

  it('rejects invalid importance values on creation', async () => {
    const res = await request(app)
      .post('/api/characters')
      .send({
        projectId,
        name: 'Invalid Guy',
        importance: 'legendary',
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('importance must be one of');
  });

  it('creates character with valid importance and timeframe', async () => {
    const res = await request(app)
      .post('/api/characters')
      .send({
        projectId,
        name: 'Lord Test Vane',
        role: 'Test Lord',
        importance: 'principal',
        activeTimeframeStart: 290,
        activeTimeframeEnd: 350,
      });

    expect(res.status).toBe(201);
    expect(res.body.importance).toBe('principal');
    expect(res.body.activeTimeframeStart).toBe(290);
    expect(res.body.activeTimeframeEnd).toBe(350);
  });

  it('serves GET /api/characters/family-tree without being shadowed by /:id', async () => {
    const res = await request(app)
      .get(`/api/characters/family-tree?projectId=${projectId}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('lineages');
    expect(res.body).toHaveProperty('standaloneCount');
  });

  it('filters characters by timeframeYear', async () => {
    // Create an older historical character (active 100 - 150)
    await request(app)
      .post('/api/characters')
      .send({
        projectId,
        name: 'Ancient Predecessor',
        importance: 'background',
        activeTimeframeStart: 100,
        activeTimeframeEnd: 150,
      });

    // Query for year 300
    const res300 = await request(app)
      .get(`/api/characters?projectId=${projectId}&timeframeYear=300`);
    expect(res300.status).toBe(200);
    const names300 = res300.body.map((c) => c.name);
    expect(names300).toContain('Lord Test Vane');
    expect(names300).not.toContain('Ancient Predecessor');

    // Query for year 120
    const res120 = await request(app)
      .get(`/api/characters?projectId=${projectId}&timeframeYear=120`);
    expect(res120.status).toBe(200);
    const names120 = res120.body.map((c) => c.name);
    expect(names120).toContain('Ancient Predecessor');
    expect(names120).not.toContain('Lord Test Vane');
  });

  it('rejects duplicate character names with 409 Conflict', async () => {
    const res = await request(app)
      .post('/api/characters')
      .send({
        projectId,
        name: 'lord test vane',
      });
    expect(res.status).toBe(409);
    expect(res.body.error).toContain('already exists');
  });

  it('permits multiple default New Character creations with auto-numbering', async () => {
    const res1 = await request(app)
      .post('/api/characters')
      .send({
        projectId,
        name: 'New Character',
      });
    expect(res1.status).toBe(201);
    expect(res1.body.name).toBe('New Character');

    const res2 = await request(app)
      .post('/api/characters')
      .send({
        projectId,
        name: 'New Character',
      });
    expect(res2.status).toBe(201);
    expect(res2.body.name).toBe('New Character 2');
  });

  it('returns d3Tree hierarchical data on lineages in GET /api/characters/family-tree', async () => {
    // Add child character
    const childRes = await request(app)
      .post('/api/characters')
      .send({
        projectId,
        name: 'Young Vane',
        importance: 'supporting',
      });

    // Add relationship
    await request(app)
      .post('/api/characters/relationships')
      .send({
        projectId,
        sourceEntityId: 'dummy-id',
        sourceEntityType: 'character',
        targetEntityId: childRes.body.id,
        targetEntityType: 'character',
        relationshipType: 'parent',
      });

    const res = await request(app)
      .get(`/api/characters/family-tree?projectId=${projectId}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.lineages)).toBe(true);
    if (res.body.lineages.length > 0) {
      expect(res.body.lineages[0]).toHaveProperty('d3Tree');
    }
  });
});
