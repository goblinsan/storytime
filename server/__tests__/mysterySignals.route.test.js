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
    title: 'Signals Test Universe',
    type: 'universe',
  });
  testProjectId = res.body.id;
});

afterAll(async () => {
  await db.run('TRUNCATE stories CASCADE');
  await db.close();
});

describe('Mystery Signals API (server/routes/mysterySignals.js)', () => {
  let createdSignalId;

  it('lists empty signals initially', async () => {
    const res = await request(app).get(`/api/mystery-signals?projectId=${testProjectId}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(0);
  });

  it('requires projectId query parameter', async () => {
    const res = await request(app).get('/api/mystery-signals');
    expect(res.status).toBe(400);
  });

  it('creates a mystery signal and stores anomalous properties', async () => {
    const res = await request(app)
      .post('/api/mystery-signals')
      .send({
        projectId: testProjectId,
        designation: 'The Whispering Veil',
        frequency: 'Subspace Harmonic Resonance 732.981',
        originVector: 'The Harrowed Veil, Sector Zeta-13',
        anomalousProperties: ['Psychic resonance', 'Frequency shift'],
        transmissionTranscript: 'Malakor... find me in the void...',
      });

    expect(res.status).toBe(201);
    expect(res.body.designation).toBe('The Whispering Veil');
    expect(res.body.anomalousProperties).toEqual(['Psychic resonance', 'Frequency shift']);
    expect(res.body.transmissionTranscript).toBe('Malakor... find me in the void...');
    createdSignalId = res.body.id;
  });

  it('retrieves a single mystery signal by id', async () => {
    const res = await request(app).get(`/api/mystery-signals/${createdSignalId}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(createdSignalId);
    expect(res.body.designation).toBe('The Whispering Veil');
  });

  it('toggles canon protection on a mystery signal', async () => {
    const protectRes = await request(app)
      .put(`/api/mystery-signals/${createdSignalId}/protection`)
      .send({ isProtected: true });

    expect(protectRes.status).toBe(200);
    expect(protectRes.body.isProtected).toBe(true);

    const deleteRes = await request(app).delete(`/api/mystery-signals/${createdSignalId}`);
    expect(deleteRes.status).toBe(403);
  });

  it('deletes an unprotected mystery signal', async () => {
    await request(app)
      .put(`/api/mystery-signals/${createdSignalId}/protection`)
      .send({ isProtected: false });

    const deleteRes = await request(app).delete(`/api/mystery-signals/${createdSignalId}`);
    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.success).toBe(true);
  });
});
