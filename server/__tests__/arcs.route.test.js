import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const connectionString = process.env.CONTESORA_TEST_DATABASE_URL || process.env.STORYTIME_TEST_DATABASE_URL;
if (!connectionString) {
  throw new Error('CONTESORA_TEST_DATABASE_URL is not set.');
}
process.env.CONTESORA_DATABASE_URL = connectionString;

let db;
let app;
let projectId;

beforeAll(async () => {
  db = await import('../db.js');
  await db.migrate();
  await db.run('TRUNCATE stories CASCADE');
  app = (await import('../app.js')).default;

  const res = await request(app).post('/api/stories').send({ title: 'Test Project' });
  projectId = res.body.id;
});

afterAll(async () => {
  await db.run('TRUNCATE stories CASCADE');
  await db.close();
});

describe('arcs route', () => {
  it('rejects a list with no project', async () => {
    const res = await request(app).get('/api/arcs');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'projectId query parameter is required' });
  });

  it('rejects a create with no project', async () => {
    const res = await request(app).post('/api/arcs').send({ title: 'Orphan' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'projectId is required' });
  });

  it('rejects a create against a project that does not exist', async () => {
    const res = await request(app).post('/api/arcs').send({
      projectId: 'no-such-project',
      title: 'Nowhere',
    });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Project not found' });
  });

  it('creates the first arc as number 1', async () => {
    const res = await request(app).post('/api/arcs').send({
      projectId,
      title: 'The Long Winter',
    });
    expect(res.status).toBe(201);
    expect(res.body.arcNumber).toBe(1);
    expect(res.body.title).toBe('The Long Winter');
    expect(res.body.description).toBe('');
    expect(res.body.details).toEqual([]);
  });

  it('auto-assigns the next arc number', async () => {
    const res = await request(app).post('/api/arcs').send({
      projectId,
      title: 'The Thaw',
    });
    expect(res.status).toBe(201);
    expect(res.body.arcNumber).toBe(2);
  });

  it('returns 404 for an arc that does not exist', async () => {
    const res = await request(app).get('/api/arcs/no-such-arc');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Arc not found' });
  });

  it('lists arcs in arc-number order with details parsed', async () => {
    await request(app).post('/api/arcs').send({
      projectId,
      title: 'With Details',
      details: ['a', 'b'],
    });

    const res = await request(app).get(`/api/arcs?projectId=${projectId}`);
    expect(res.status).toBe(200);
    expect(res.body.map((a) => a.arcNumber)).toEqual([1, 2, 3]);

    const withDetails = res.body.find((a) => a.title === 'With Details');
    expect(withDetails.details).toEqual(['a', 'b']);
  });

  it('keeps fields that were not sent on update', async () => {
    const createRes = await request(app).post('/api/arcs').send({
      projectId,
      title: 'Original Title',
      description: 'Original Description',
    });
    const arcId = createRes.body.id;

    const res = await request(app).put(`/api/arcs/${arcId}`).send({
      title: 'Renamed',
    });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Renamed');
    expect(res.body.description).toBe('Original Description');
  });
});
