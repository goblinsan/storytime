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
    title: 'Technology Test Universe',
    type: 'universe',
  });
  testProjectId = res.body.id;
});

afterAll(async () => {
  await db.run('TRUNCATE stories CASCADE');
  await db.close();
});

describe('Technologies API (server/routes/technologies.js)', () => {
  let createdTechId;

  it('creates a new technology', async () => {
    const res = await request(app).post('/api/technologies').send({
      projectId: testProjectId,
      name: 'Quantum-Soul Binding',
      principles: 'Quantum entanglement binds neural lattice to star-iron chassis.',
      limitations: 'Requires continuous bio-coolant replenishment every 30 days.',
      proliferation: 'proprietary_cartel',
      classification: 'quantum_necromancy',
      patentsOrTaboos: 'Exclusive patent held by Vander-Thorne Cartel.',
      isProtected: false,
    });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.name).toBe('Quantum-Soul Binding');
    expect(res.body.classification).toBe('quantum_necromancy');
    expect(res.body.isProtected).toBe(false);
    createdTechId = res.body.id;
  });

  it('lists technologies for a project', async () => {
    const res = await request(app).get('/api/technologies').query({ projectId: testProjectId });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(1);
    expect(res.body[0].id).toBe(createdTechId);
  });

  it('gets a single technology by id', async () => {
    const res = await request(app).get(`/api/technologies/${createdTechId}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(createdTechId);
    expect(res.body.name).toBe('Quantum-Soul Binding');
  });

  it('updates a technology', async () => {
    const res = await request(app).put(`/api/technologies/${createdTechId}`).send({
      limitations: 'Requires bio-coolant replenishment every 15 days under combat stress.',
    });

    expect(res.status).toBe(200);
    expect(res.body.limitations).toContain('15 days');
  });

  it('toggles protection on a technology', async () => {
    const protectRes = await request(app)
      .put(`/api/technologies/${createdTechId}/protection`)
      .send({ isProtected: true });
    expect(protectRes.status).toBe(200);
    expect(protectRes.body.isProtected).toBe(true);

    // Refuses deletion while protected
    const deleteRes = await request(app).delete(`/api/technologies/${createdTechId}`);
    expect(deleteRes.status).toBe(403);

    // Unprotect
    const unprotectRes = await request(app)
      .put(`/api/technologies/${createdTechId}/protection`)
      .send({ isProtected: false });
    expect(unprotectRes.status).toBe(200);
    expect(unprotectRes.body.isProtected).toBe(false);
  });

  it('deletes an unprotected technology', async () => {
    const deleteRes = await request(app).delete(`/api/technologies/${createdTechId}`);
    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.success).toBe(true);
  });
});
