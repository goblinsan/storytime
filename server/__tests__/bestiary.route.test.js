import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const connectionString = process.env.STORYTIME_TEST_DATABASE_URL;
if (!connectionString) {
  throw new Error('STORYTIME_TEST_DATABASE_URL is not set.');
}
process.env.STORYTIME_DATABASE_URL = connectionString;

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

describe('bestiary route', () => {
  it('rejects a list with no project', async () => {
    const res = await request(app).get('/api/bestiary');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'projectId query parameter is required' });
  });

  it('rejects a create with no project', async () => {
    const res = await request(app).post('/api/bestiary').send({ name: 'Orphan' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'projectId is required' });
  });

  it('rejects a create against a project that does not exist', async () => {
    const res = await request(app).post('/api/bestiary').send({
      projectId: 'no-such-project',
      name: 'Nowhere',
    });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Project not found' });
  });

  it('applies the documented defaults', async () => {
    const res = await request(app).post('/api/bestiary').send({
      projectId,
      name: 'Salt Wyrm',
    });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('active');
    expect(res.body.hearts).toBeNull();
    expect(res.body.tactics).toEqual([]);
    expect(res.body.category).toBe('');
    expect(res.body.description).toBe('');
    expect(res.body.notes).toBe('');
  });

  it('returns 404 for an entry that does not exist', async () => {
    const res = await request(app).get('/api/bestiary/no-such-entry');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Bestiary entry not found' });
  });

  it('lists entries ordered by category then name, with tactics parsed', async () => {
    const createRes = await request(app).post('/api/stories').send({ title: 'Ordering Test' });
    const orderProjectId = createRes.body.id;

    await request(app).post('/api/bestiary').send({
      projectId: orderProjectId,
      category: 'undead',
      name: 'Wight',
    });

    await request(app).post('/api/bestiary').send({
      projectId: orderProjectId,
      category: 'beast',
      name: 'Dire Elk',
      tactics: ['charge', 'flee'],
    });

    await request(app).post('/api/bestiary').send({
      projectId: orderProjectId,
      category: 'beast',
      name: 'Ash Hound',
    });

    const res = await request(app).get(`/api/bestiary?projectId=${orderProjectId}`);
    expect(res.status).toBe(200);

    const names = res.body.map((b) => b.name);
    expect(names).toEqual(['Ash Hound', 'Dire Elk', 'Wight']);

    const direElk = res.body.find((b) => b.name === 'Dire Elk');
    expect(direElk.tactics).toEqual(['charge', 'flee']);
  });

  it('keeps fields that were not sent on update', async () => {
    const createRes = await request(app).post('/api/bestiary').send({
      projectId,
      name: 'Original Name',
      category: 'original-category',
    });
    const entryId = createRes.body.id;

    const res = await request(app).put(`/api/bestiary/${entryId}`).send({
      name: 'Renamed',
    });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Renamed');
    expect(res.body.category).toBe('original-category');
  });

  it('deletes an entry that exists and refuses one that does not', async () => {
    const createRes = await request(app).post('/api/bestiary').send({
      projectId,
      name: 'To Delete',
    });
    const entryId = createRes.body.id;

    const res = await request(app).delete(`/api/bestiary/${entryId}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });

    const res2 = await request(app).delete('/api/bestiary/no-such-entry');
    expect(res2.status).toBe(404);
  });

  it('toggles canon protection and prevents deletion of protected entries', async () => {
    const createRes = await request(app).post('/api/bestiary').send({
      projectId,
      name: 'Protected Beast',
    });
    const entryId = createRes.body.id;

    const protectRes = await request(app)
      .put(`/api/bestiary/${entryId}/protection`)
      .send({ isProtected: true });
    expect(protectRes.status).toBe(200);
    expect(protectRes.body.isProtected).toBe(true);

    const deleteRes = await request(app).delete(`/api/bestiary/${entryId}`);
    expect(deleteRes.status).toBe(403);
    expect(deleteRes.body.error).toContain('Cannot delete protected');

    // Unprotect and delete
    await request(app)
      .put(`/api/bestiary/${entryId}/protection`)
      .send({ isProtected: false });

    const deleteRes2 = await request(app).delete(`/api/bestiary/${entryId}`);
    expect(deleteRes2.status).toBe(200);
  });
});
