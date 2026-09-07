import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const connectionString = process.env.STORYTIME_TEST_DATABASE_URL;
if (!connectionString) throw new Error('STORYTIME_TEST_DATABASE_URL is not set.');
process.env.STORYTIME_DATABASE_URL = connectionString;

let db;
let app;
let projectId;

beforeAll(async () => {
  db = await import('../db.js');
  await db.migrate();
  app = (await import('../app.js')).default;
});

afterAll(async () => {
  await db.run('TRUNCATE stories CASCADE');
  // Every pool this file opened, closed. A leaked pool keeps idle connections
  // and timers alive in the worker for the rest of the run.
  await db.close();
});

beforeEach(async () => {
  await db.run('TRUNCATE stories CASCADE');
  projectId = randomUUID();
  await db.run(
    `INSERT INTO stories (id, title, author, description, content, type, created_at, updated_at)
     VALUES (?, 'Void Requiem', '', '', '', 'universe', now(), now())`, projectId,
  );
});

const catalogue = (body = {}) =>
  request(app).post('/api/media').send({
    projectId, url: '/media/malakor.png', kind: 'reference', title: 'Malakor, portrait', ...body,
  });

describe('cataloguing assets', () => {
  it('records an asset with no description yet', async () => {
    const res = await catalogue();
    expect(res.status).toBe(201);
    expect(res.body.descriptionStatus).toBe('none');
    expect(res.body.observableTraits).toEqual([]);
    expect(res.body.subject).toBeNull();
  });

  it('links an asset to what it depicts', async () => {
    const res = await catalogue({ subject: { type: 'character', id: 'char-malakor' } });
    expect(res.body.subject).toEqual({ type: 'character', id: 'char-malakor' });
  });

  it('rejects a kind or subject type outside the defined sets', async () => {
    expect((await catalogue({ kind: 'meme' })).status).toBe(400);
    expect((await catalogue({ subject: { type: 'starship', id: 'x' } })).status).toBe(400);
  });

  it('requires a universe that exists', async () => {
    const res = await request(app).post('/api/media').send({ projectId: randomUUID(), url: '/x.png' });
    expect(res.status).toBe(404);
  });

  it('lists a universe assets, filterable by kind', async () => {
    await catalogue();
    await catalogue({ url: '/media/cover.png', kind: 'cover' });

    const all = await request(app).get(`/api/media?projectId=${projectId}`);
    expect(all.body).toHaveLength(2);

    const covers = await request(app).get(`/api/media?projectId=${projectId}&kind=cover`);
    expect(covers.body).toHaveLength(1);
    expect(covers.body[0].kind).toBe('cover');
  });

  it('requires a projectId rather than listing every universe', async () => {
    expect((await request(app).get('/api/media')).status).toBe(400);
  });
});

describe('visual descriptions', () => {
  it('records a request without inventing a description', async () => {
    const asset = await catalogue();
    const res = await request(app).post(`/api/media/${asset.body.id}/describe`)
      .send({ dashboardTaskId: '1234' });

    expect(res.status).toBe(202);
    expect(res.body.descriptionStatus).toBe('requested');
    expect(res.body.dashboardTaskId).toBe('1234');
    expect(res.body.visualDescription).toBe('');
  });

  it('stores a completed description with observation and inference kept apart', async () => {
    const asset = await catalogue();
    const res = await request(app).patch(`/api/media/${asset.body.id}`).send({
      observableTraits: ['Chrome jaw plating', 'Deep red mantle'],
      inferredTraits: ['Recently wounded'],
      uncertainties: ['Left hand out of frame'],
      visualDescription: 'A silver-jawed man in a deep red mantle.',
      descriptionStatus: 'ready',
    });

    expect(res.status).toBe(200);
    expect(res.body.observableTraits).toHaveLength(2);
    expect(res.body.inferredTraits).toEqual(['Recently wounded']);
    expect(res.body.descriptionStatus).toBe('ready');
  });

  it('refuses a trait claimed as both seen and inferred', async () => {
    const asset = await catalogue();
    // The distinction is the entire reason this job type exists; collapsing it
    // would let a guess enter canon as an observation.
    const res = await request(app).patch(`/api/media/${asset.body.id}`).send({
      observableTraits: ['Chrome jaw plating'],
      inferredTraits: ['chrome jaw plating'],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/both observable and inferred/i);
  });

  it('refuses traits that are not lists, and an undefined status', async () => {
    const asset = await catalogue();
    expect((await request(app).patch(`/api/media/${asset.body.id}`)
      .send({ observableTraits: 'a red cloak' })).status).toBe(400);
    expect((await request(app).patch(`/api/media/${asset.body.id}`)
      .send({ descriptionStatus: 'probably' })).status).toBe(400);
  });

  it('leaves untouched fields alone on a partial update', async () => {
    const asset = await catalogue();
    await request(app).patch(`/api/media/${asset.body.id}`)
      .send({ visualDescription: 'First pass.', descriptionStatus: 'ready' });
    await request(app).patch(`/api/media/${asset.body.id}`).send({ descriptionStatus: 'accepted' });

    const list = await request(app).get(`/api/media?projectId=${projectId}`);
    expect(list.body[0].visualDescription).toBe('First pass.');
    expect(list.body[0].descriptionStatus).toBe('accepted');
  });
});

describe('removal', () => {
  it('deletes an asset and 404s for one that never existed', async () => {
    const asset = await catalogue();
    expect((await request(app).delete(`/api/media/${asset.body.id}`)).status).toBe(204);
    expect((await request(app).delete(`/api/media/${asset.body.id}`)).status).toBe(404);
  });

  it('goes away with its universe', async () => {
    await catalogue();
    await db.run('DELETE FROM stories WHERE id = ?', projectId);
    const left = await db.all('SELECT id FROM media_assets WHERE project_id = ?', projectId);
    expect(left).toEqual([]);
  });
});
