import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const connectionString = process.env.CONTESORA_TEST_DATABASE_URL || process.env.STORYTIME_TEST_DATABASE_URL;

if (!connectionString) {
  throw new Error(
    'CONTESORA_TEST_DATABASE_URL is not set. These tests need a Postgres they ' +
      'are allowed to truncate. Skipping them silently would report success ' +
      'for a suite that never ran.',
  );
}

process.env.CONTESORA_DATABASE_URL = connectionString;

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

describe('paths', () => {
  let projectId;

  beforeAll(async () => {
    const created = await request(app).post('/api/stories').send({ title: 'Paths Test' });
    projectId = created.body.id;
  });

  it('rejects a list with no project', async () => {
    const response = await request(app).get('/api/paths');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'projectId required' });
  });

  it('rejects a create with no project', async () => {
    const response = await request(app)
      .post('/api/paths')
      .send({ name: 'Orphan Road' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'projectId required' });
  });

  it('creates a path with defaults', async () => {
    const response = await request(app)
      .post('/api/paths')
      .send({ projectId });

    expect(response.status).toBe(201);
    expect(response.body.contextId).toBe('');
    expect(response.body.name).toBe('');
    expect(response.body.pathType).toBe('road');
    expect(response.body.waypoints).toEqual([]);
    expect(response.body.widthMultiplier).toBe(1);
  });

  it('creates a path with explicit fields', async () => {
    const response = await request(app)
      .post('/api/paths')
      .send({
        projectId,
        contextId: 'region-1',
        name: 'Kings Road',
        pathType: 'river',
        waypoints: [{ x: 0, y: 0 }, { x: 5, y: 5 }],
        widthMultiplier: 2,
      });

    expect(response.status).toBe(201);
    expect(response.body.contextId).toBe('region-1');
    expect(response.body.name).toBe('Kings Road');
    expect(response.body.pathType).toBe('river');
    expect(Array.isArray(response.body.waypoints)).toBe(true);
    expect(response.body.waypoints).toEqual([{ x: 0, y: 0 }, { x: 5, y: 5 }]);
    expect(response.body.widthMultiplier).toBe(2);
  });

  it('scopes listing to the given context', async () => {
    await request(app)
      .post('/api/paths')
      .send({ projectId, contextId: 'zone-a' });

    await request(app)
      .post('/api/paths')
      .send({ projectId, contextId: 'zone-b' });

    const response = await request(app).get('/api/paths').query({ projectId, contextId: 'zone-a' });

    expect(response.status).toBe(200);
    expect(response.body.length).toBe(1);
    expect(response.body[0].contextId).toBe('zone-a');
  });

  it('returns 404 for a path that does not exist on update', async () => {
    const response = await request(app)
      .put('/api/paths/no-such-path')
      .send({ name: 'X' });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Path not found' });
  });

  it('keeps fields that were not sent on update', async () => {
    const created = await request(app)
      .post('/api/paths')
      .send({ projectId, name: 'Old Trail', pathType: 'trail' });

    const response = await request(app)
      .put(`/api/paths/${created.body.id}`)
      .send({ name: 'New Trail' });

    expect(response.status).toBe(200);
    expect(response.body.name).toBe('New Trail');
    expect(response.body.pathType).toBe('trail');
  });

  it('deletes a path', async () => {
    const created = await request(app)
      .post('/api/paths')
      .send({ projectId });

    const response = await request(app).delete(`/api/paths/${created.body.id}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true });

    const notFound = await request(app).delete('/api/paths/no-such-path');
    expect(notFound.status).toBe(404);
    expect(notFound.body).toEqual({ error: 'Path not found' });
  });
});
