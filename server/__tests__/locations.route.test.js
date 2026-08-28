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

describe('locations', () => {
  let projectId;
  let topLevelLocationId;

  beforeAll(async () => {
    const response = await request(app).post('/api/stories').send({ title: 'Test Project' });
    projectId = response.body.id;
  });

  it('rejects a list with no project', async () => {
    const response = await request(app).get('/api/locations');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'projectId required' });
  });

  it('rejects a create with no project', async () => {
    const response = await request(app)
      .post('/api/locations')
      .send({ name: 'Orphan' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'projectId required' });
  });

  it('rejects a create against a project that does not exist', async () => {
    const response = await request(app)
      .post('/api/locations')
      .send({ projectId: 'no-such-project', name: 'Nowhere' });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Project not found' });
  });

  it('creates a top-level location with defaults', async () => {
    const response = await request(app)
      .post('/api/locations')
      .send({ projectId, name: 'Old Port' });

    expect(response.status).toBe(201);
    expect(response.body.parentId).toBeNull();
    expect(response.body.level).toBe(0);
    expect(response.body.cols).toBe(6);
    expect(response.body.rows).toBe(4);
    expect(response.body.races).toEqual([]);
    expect(response.body.connections).toEqual({});
    expect(response.body.cells).toEqual([]);

    topLevelLocationId = response.body.id;
  });

  it('scopes children to their parent', async () => {
    const childResponse = await request(app)
      .post('/api/locations')
      .send({ projectId, parentId: topLevelLocationId, name: 'Old Port Docks' });

    expect(childResponse.status).toBe(201);
    expect(childResponse.body.parentId).toBe(topLevelLocationId);

    const children = await request(app)
      .get('/api/locations')
      .query({ projectId, parentId: topLevelLocationId });

    expect(children.status).toBe(200);
    expect(children.body.length).toBe(1);
    expect(children.body[0].name).toBe('Old Port Docks');

    const all = await request(app).get('/api/locations').query({ projectId });

    expect(all.status).toBe(200);
    expect(all.body.some((loc) => loc.name === 'Old Port Docks')).toBe(false);
  });

  it('returns 404 for a location that does not exist on update', async () => {
    const response = await request(app)
      .put('/api/locations/no-such-location')
      .send({ name: 'X' });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Location not found' });
  });

  it('keeps fields that were not sent on update', async () => {
    const response = await request(app)
      .put(`/api/locations/${topLevelLocationId}`)
      .send({ name: 'Renamed Port' });

    expect(response.status).toBe(200);
    expect(response.body.name).toBe('Renamed Port');
    expect(response.body.description).toBe('');
  });

  it('deletes a location', async () => {
    const response = await request(app).delete(`/api/locations/${topLevelLocationId}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true });

    const notFound = await request(app).delete('/api/locations/no-such-location');

    expect(notFound.status).toBe(404);
    expect(notFound.body).toEqual({ error: 'Location not found' });
  });
});
