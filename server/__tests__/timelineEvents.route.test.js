import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const connectionString = process.env.CONTESORA_TEST_DATABASE_URL || process.env.STORYTIME_TEST_DATABASE_URL;

if (!connectionString) {
  throw new Error('CONTESORA_TEST_DATABASE_URL is not set.');
}

process.env.CONTESORA_DATABASE_URL = connectionString;

let app;
let db;
let testProjectId;

beforeAll(async () => {
  db = await import('../db.js');
  await db.migrate();
  await db.run('TRUNCATE stories CASCADE');
  app = (await import('../app.js')).default;

  const res = await request(app).post('/api/stories').send({
    title: 'Timeline Test Universe',
    type: 'universe',
  });
  testProjectId = res.body.id;
});

afterAll(async () => {
  await db.run('TRUNCATE stories CASCADE');
  await db.close();
});

describe('Timeline Events API (server/routes/timelineEvents.js)', () => {
  let createdEventId;

  it('creates a new timeline event', async () => {
    const res = await request(app).post('/api/timeline-events').send({
      projectId: testProjectId,
      title: 'The Great Shattering',
      date: 'Epoch of Stone',
      description: 'The ancient basalt core fractured under anomalous stress.',
      isProtected: false,
    });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.title).toBe('The Great Shattering');
    expect(res.body.date).toBe('Epoch of Stone');
    expect(res.body.description).toBe('The ancient basalt core fractured under anomalous stress.');
    expect(res.body.isProtected).toBe(false);
    createdEventId = res.body.id;
  });

  it('lists timeline events for a project', async () => {
    const res = await request(app).get('/api/timeline-events').query({ projectId: testProjectId });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(1);
    expect(res.body[0].id).toBe(createdEventId);
    expect(res.body[0].title).toBe('The Great Shattering');
  });

  it('gets a single timeline event by id', async () => {
    const res = await request(app).get(`/api/timeline-events/${createdEventId}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(createdEventId);
    expect(res.body.title).toBe('The Great Shattering');
  });

  it('updates an existing timeline event', async () => {
    const res = await request(app).put(`/api/timeline-events/${createdEventId}`).send({
      title: 'The Great Sundering of the Rift',
      description: 'Revised: The basalt core fractured, releasing the primeval aquifer.',
    });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('The Great Sundering of the Rift');
    expect(res.body.description).toContain('Revised:');
  });

  it('toggles protection on a timeline event', async () => {
    const protectRes = await request(app)
      .put(`/api/timeline-events/${createdEventId}/protection`)
      .send({ isProtected: true });
    expect(protectRes.status).toBe(200);
    expect(protectRes.body.isProtected).toBe(true);

    // Refuses deletion while protected
    const deleteRes = await request(app).delete(`/api/timeline-events/${createdEventId}`);
    expect(deleteRes.status).toBe(403);

    // Unprotect
    const unprotectRes = await request(app)
      .put(`/api/timeline-events/${createdEventId}/protection`)
      .send({ isProtected: false });
    expect(unprotectRes.status).toBe(200);
    expect(unprotectRes.body.isProtected).toBe(false);
  });

  it('deletes an unprotected timeline event', async () => {
    const deleteRes = await request(app).delete(`/api/timeline-events/${createdEventId}`);
    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.success).toBe(true);

    const getRes = await request(app).get(`/api/timeline-events/${createdEventId}`);
    expect(getRes.status).toBe(404);
  });
});
