import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const connectionString = process.env.STORYTIME_TEST_DATABASE_URL;

if (!connectionString) {
  throw new Error('STORYTIME_TEST_DATABASE_URL is not set.');
}

process.env.STORYTIME_DATABASE_URL = connectionString;

let app;
let db;
let testProjectId;

beforeAll(async () => {
  db = await import('../db.js');
  await db.migrate();
  await db.run('TRUNCATE stories CASCADE');
  app = (await import('../app.js')).default;

  const res = await request(app).post('/api/stories').send({
    title: 'Faction Test Universe',
    type: 'universe',
  });
  testProjectId = res.body.id;
});

afterAll(async () => {
  await db.run('TRUNCATE stories CASCADE');
  await db.close();
});

describe('Factions API (server/routes/factions.js)', () => {
  let createdFactionId;

  it('creates a new faction with goals', async () => {
    const res = await request(app).post('/api/factions').send({
      projectId: testProjectId,
      name: 'The Iron Pact',
      description: 'A martial coalition safeguarding trade routes across the frontier.',
      goals: ['Fortify the border pass', 'Secure iron mines'],
    });

    expect(res.status).toBe(201);
    expect(res.body.id).toMatch(/^fac-/);
    expect(res.body.name).toBe('The Iron Pact');
    expect(res.body.goals).toEqual(['Fortify the border pass', 'Secure iron mines']);
    createdFactionId = res.body.id;
  });

  it('lists factions for a project', async () => {
    const res = await request(app).get('/api/factions').query({ projectId: testProjectId });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(1);
    expect(res.body[0].id).toBe(createdFactionId);
  });

  it('gets a single faction by id', async () => {
    const res = await request(app).get(`/api/factions/${createdFactionId}`);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('The Iron Pact');
    expect(res.body.goals).toContain('Secure iron mines');
  });

  it('updates a faction', async () => {
    const res = await request(app).put(`/api/factions/${createdFactionId}`).send({
      name: 'The High Iron Pact',
      goals: ['Rebuild the ancient bulwarks'],
    });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('The High Iron Pact');
    expect(res.body.goals).toEqual(['Rebuild the ancient bulwarks']);
  });

  it('deletes a faction', async () => {
    const delRes = await request(app).delete(`/api/factions/${createdFactionId}`);
    expect(delRes.status).toBe(200);
    expect(delRes.body.success).toBe(true);

    const getRes = await request(app).get(`/api/factions/${createdFactionId}`);
    expect(getRes.status).toBe(404);
  });
});
