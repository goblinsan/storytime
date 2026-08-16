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
  it('creates and lists', async () => {
    const created = await request(app)
      .post('/api/characters')
      .send({ storyId: projectId, name: 'Wren', traits: ['stubborn'] });
    expect(created.status).toBe(201);

    const listed = await request(app).get('/api/characters').query({ storyId: projectId });
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
      .send({ storyId: projectId, name: 'Ashford', races: ['dwarf'] });
    expect(created.status).toBe(201);

    const listed = await request(app).get('/api/locations').query({ storyId: projectId });
    expect(listed.status).toBe(200);
    expect(listed.body.some((l) => l.name === 'Ashford')).toBe(true);
  });
});

describe('terrain', () => {
  it('returns null before anything is stored, then round-trips', async () => {
    const empty = await request(app).get('/api/terrain').query({ storyId: projectId });
    expect(empty.status).toBe(200);
    expect(empty.body).toBeNull();

    const put = await request(app)
      .put('/api/terrain')
      .send({ storyId: projectId, cols: 12, rows: 8, terrainData: 'xxxx' });
    expect(put.status).toBeLessThan(300);

    const stored = await request(app).get('/api/terrain').query({ storyId: projectId });
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
      .send({ storyId: projectId, name: 'Salt Road', waypoints: [{ x: 1, y: 2 }] });
    expect(created.status).toBeLessThan(300);

    const listed = await request(app).get('/api/paths').query({ storyId: projectId });
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

describe('stories detail', () => {
  it('assembles a project with its characters, arcs and bestiary', async () => {
    const response = await request(app).get(`/api/stories/${projectId}`);
    expect(response.status).toBe(200);
    expect(response.body.characters.some((c) => c.name === 'Wren')).toBe(true);
    expect(response.body.arcs.some((a) => a.title === 'The Long Winter')).toBe(true);
    expect(response.body.bestiary.some((b) => b.name === 'Salt Wyrm')).toBe(true);
  });
});
