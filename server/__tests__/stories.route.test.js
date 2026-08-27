import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Tests run against a real Postgres, configured by STORYTIME_TEST_DATABASE_URL.
// There is no in-memory substitute here on purpose: a fake that passes tells you
// nothing about the database the application actually runs on, and this project
// moved off sqlite precisely because the store's behaviour matters.
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

describe('the test harness itself', () => {
  it('runs against a database it was explicitly given', () => {
    expect(process.env.STORYTIME_DATABASE_URL).toBe(connectionString);
  });

  it('starts from an empty stories table', async () => {
    const rows = await db.all('SELECT count(*)::int AS n FROM stories');
    expect(rows[0].n).toBe(0);
  });
});

describe('GET /api/health', () => {
  it('reports ok with a timestamp', async () => {
    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(Number.isNaN(Date.parse(response.body.timestamp))).toBe(false);
  });
});

describe('stories', () => {
  it('creates a project and returns it with the fields it was given', async () => {
    const response = await request(app)
      .post('/api/stories')
      .send({ title: 'The Salt Road', author: 'Wren', type: 'campaign' });

    expect(response.status).toBe(201);
    expect(response.body.title).toBe('The Salt Road');
    expect(response.body.author).toBe('Wren');
    expect(response.body.type).toBe('campaign');
    expect(response.body.id).toEqual(expect.any(String));
    expect(response.body.isPublished).toBe(false);
    expect(response.body.characters).toEqual([]);
  });

  it('lists a created project, and defaults the fields it was not given', async () => {
    const created = await request(app)
      .post('/api/stories')
      .send({ title: 'Ash and Ledger' });

    const listed = await request(app).get('/api/stories');

    expect(listed.status).toBe(200);
    const found = listed.body.find((story) => story.id === created.body.id);
    expect(found).toBeDefined();
    expect(found.title).toBe('Ash and Ledger');
    expect(found.author).toBe('');
    expect(found.type).toBe('story');
    expect(found.characters).toEqual([]);
  });

  it('filters the list by type', async () => {
    await request(app).post('/api/stories').send({ title: 'Only Ours', type: 'oneshot' });

    const response = await request(app).get('/api/stories').query({ type: 'oneshot' });

    expect(response.status).toBe(200);
    expect(response.body.length).toBeGreaterThan(0);
    for (const story of response.body) {
      expect(story.type).toBe('oneshot');
    }
    expect(response.body.some((story) => story.title === 'Only Ours')).toBe(true);
  });

  it('cascades a delete to the project characters', async () => {
    const created = await request(app).post('/api/stories').send({ title: 'Doomed' });
    await db.run(
      "INSERT INTO characters (id, project_id, name) VALUES ('c-doomed', ?, 'Ghost')",
      created.body.id,
    );

    await db.run('DELETE FROM stories WHERE id = ?', created.body.id);

    const left = await db.all('SELECT id FROM characters WHERE id = ?', 'c-doomed');
    expect(left).toEqual([]);
  });
});
