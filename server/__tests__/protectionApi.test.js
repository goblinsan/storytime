import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { randomUUID } from 'crypto';

const connectionString = process.env.STORYTIME_TEST_DATABASE_URL;
if (!connectionString) {
  throw new Error('STORYTIME_TEST_DATABASE_URL is not set.');
}
process.env.STORYTIME_DATABASE_URL = connectionString;

let app;
let db;

beforeAll(async () => {
  db = (await import('../db.js')).default;
  await db.migrate();

  const storiesRouter = (await import('../routes/stories.js')).default;
  const charactersRouter = (await import('../routes/characters.js')).default;
  const factionsRouter = (await import('../routes/factions.js')).default;
  const locationsRouter = (await import('../routes/locations.js')).default;
  const arcsRouter = (await import('../routes/arcs.js')).default;
  const relationshipsRouter = (await import('../routes/relationships.js')).default;
  const composerRouter = (await import('../routes/composer.js')).default;

  app = express();
  app.use(express.json());
  app.use('/api/stories', storiesRouter);
  app.use('/api/characters', charactersRouter);
  app.use('/api/factions', factionsRouter);
  app.use('/api/locations', locationsRouter);
  app.use('/api/arcs', arcsRouter);
  app.use('/api/relationships', relationshipsRouter);
  app.use('/api/composer', composerRouter);
});

describe('Protection API & Promotion Policy Endpoints', () => {
  let projectId;

  beforeAll(async () => {
    projectId = `proj-api-${randomUUID().slice(0, 8)}`;
    await db.run(
      'INSERT INTO stories (id, title, promotion_policy, is_protected, created_at, updated_at) VALUES (?, ?, ?, ?, now(), now())',
      projectId,
      'API Universe',
      'auto_promote',
      false,
    );
  });

  it('validates promotionPolicy on POST and PATCH /api/stories', async () => {
    // 1. Create with default auto_promote
    const createRes = await request(app)
      .post('/api/stories')
      .send({ title: 'New Auto Universe' })
      .expect(201);
    expect(createRes.body.promotionPolicy).toBe('auto_promote');
    expect(createRes.body.isProtected).toBe(false);

    const newId = createRes.body.id;

    // 2. Reject invalid policy
    await request(app)
      .patch(`/api/stories/${newId}`)
      .send({ promotionPolicy: 'quarantine' })
      .expect(400);

    await request(app)
      .patch(`/api/stories/${newId}`)
      .send({ promotionPolicy: 'invalid_policy' })
      .expect(400);

    // 3. Update to manual and protect universe
    const patchRes = await request(app)
      .patch(`/api/stories/${newId}`)
      .send({ promotionPolicy: 'manual', isProtected: true })
      .expect(200);
    expect(patchRes.body.promotionPolicy).toBe('manual');
    expect(patchRes.body.isProtected).toBe(true);

    // 4. Verify in GET
    const getRes = await request(app).get(`/api/stories/${newId}`).expect(200);
    expect(getRes.body.promotionPolicy).toBe('manual');
    expect(getRes.body.isProtected).toBe(true);
  });

  it('supports isProtected on characters', async () => {
    const charRes = await request(app)
      .post('/api/characters')
      .send({ projectId, name: 'Vane Clone', isProtected: true })
      .expect(201);
    expect(charRes.body.isProtected).toBe(true);

    const charId = charRes.body.id;

    // Patch to false
    const patchRes = await request(app)
      .patch(`/api/characters/${charId}`)
      .send({ isProtected: false })
      .expect(200);
    expect(patchRes.body.isProtected).toBe(false);

    // Get verify
    const getRes = await request(app).get(`/api/characters/${charId}`).expect(200);
    expect(getRes.body.isProtected).toBe(false);
  });

  it('supports isProtected on factions', async () => {
    const facRes = await request(app)
      .post('/api/factions')
      .send({ projectId, name: 'Apex Cartel', isProtected: true })
      .expect(201);
    expect(facRes.body.isProtected).toBe(true);

    const facId = facRes.body.id;

    const patchRes = await request(app)
      .patch(`/api/factions/${facId}`)
      .send({ isProtected: false })
      .expect(200);
    expect(patchRes.body.isProtected).toBe(false);
  });

  it('supports isProtected on locations', async () => {
    const locRes = await request(app)
      .post('/api/locations')
      .send({ projectId, name: 'Slipway Station', isProtected: true })
      .expect(201);
    expect(locRes.body.isProtected).toBe(true);

    const locId = locRes.body.id;

    const patchRes = await request(app)
      .patch(`/api/locations/${locId}`)
      .send({ isProtected: false })
      .expect(200);
    expect(patchRes.body.isProtected).toBe(false);
  });

  it('supports isProtected on story arcs', async () => {
    const arcRes = await request(app)
      .post('/api/arcs')
      .send({ projectId, title: 'The Fall of Vane', isProtected: true })
      .expect(201);
    expect(arcRes.body.isProtected).toBe(true);

    const arcId = arcRes.body.id;

    const patchRes = await request(app)
      .patch(`/api/arcs/${arcId}`)
      .send({ isProtected: false })
      .expect(200);
    expect(patchRes.body.isProtected).toBe(false);
  });

  it('supports isProtected on timeline events via PATCH /api/stories/:projectId/timeline-events/:id', async () => {
    const eventId = `evt-${randomUUID().slice(0, 8)}`;
    await db.run(
      'INSERT INTO timeline_events (id, project_id, title, description, is_protected) VALUES (?, ?, ?, ?, ?)',
      eventId,
      projectId,
      'Battle of the Veil',
      'Catalytic void skirmish',
      false,
    );

    const patchRes = await request(app)
      .patch(`/api/stories/${projectId}/timeline-events/${eventId}`)
      .send({ isProtected: true })
      .expect(200);
    expect(patchRes.body.isProtected).toBe(true);

    // Verify in story GET
    const getRes = await request(app).get(`/api/stories/${projectId}`).expect(200);
    const evt = getRes.body.timelineEvents.find((e) => e.id === eventId);
    expect(evt?.isProtected).toBe(true);
  });

  it('supports isProtected on canon relationships', async () => {
    const relRes = await request(app)
      .post('/api/relationships')
      .send({
        projectId,
        sourceEntityId: 'char-1',
        sourceEntityType: 'character',
        targetEntityId: 'char-2',
        targetEntityType: 'character',
        relationshipType: 'blood_feud',
        isProtected: true,
      })
      .expect(201);
    expect(relRes.body.isProtected).toBe(true);

    const relId = relRes.body.id;

    const patchRes = await request(app)
      .patch(`/api/relationships/${relId}`)
      .send({ isProtected: false })
      .expect(200);
    expect(patchRes.body.isProtected).toBe(false);
  });

  it('supports branch reset via POST /api/composer/branches/:key/reset', async () => {
    const branchKey = `${projectId}:factions:faction_politics:fac-1`;
    await db.run(
      `INSERT INTO exploration_branches (
         id, project_id, branch_key, domain, consecutive_failures, is_quarantined, quarantined_at, created_at, updated_at
       ) VALUES (?, ?, ?, 'factions', 3, TRUE, now(), now(), now())`,
      `branch-${randomUUID().slice(0, 8)}`,
      projectId,
      branchKey,
    );

    const resetRes = await request(app)
      .post(`/api/composer/branches/${encodeURIComponent(branchKey)}/reset`)
      .expect(200);

    expect(resetRes.body.success).toBe(true);
    expect(resetRes.body.reset).toBe(true);

    const row = await db.get('SELECT is_quarantined, consecutive_failures, reset_reason FROM exploration_branches WHERE branch_key = ?', branchKey);
    expect(row.is_quarantined).toBe(false);
    expect(row.consecutive_failures).toBe(0);
    expect(row.reset_reason).toBe('operator_reset');
  });
});
