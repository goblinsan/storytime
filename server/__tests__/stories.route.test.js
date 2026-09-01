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
    expect(found.type).toBe('universe');
    expect(found.characters).toEqual([]);
    expect(found.counts).toBeDefined();
    expect(found.counts.characters).toBe(0);
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

  it('serves projects via /api/projects alias', async () => {
    const response = await request(app).get('/api/projects');
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
  });

  it('aggregates universe encyclopedia dimensions via GET /api/stories/:id/encyclopedia', async () => {
    const created = await request(app).post('/api/stories').send({
      title: 'Obsidian Reach',
      description: 'A dark coastal realm of obsidian spires.',
      type: 'universe',
    });

    const pId = created.body.id;

    // Add character, location, faction, timeline event
    await db.run(
      "INSERT INTO characters (id, project_id, name, role) VALUES ('c-1', ?, 'Lord Voran', 'Governor')",
      pId,
    );
    await db.run(
      "INSERT INTO locations (id, project_id, name, region_type) VALUES ('loc-1', ?, 'Obsidian Spire', 'spire')",
      pId,
    );
    await db.run(
      "INSERT INTO factions (id, project_id, name, description) VALUES ('f-1', ?, 'Spire Guard', 'Elite defenders')",
      pId,
    );
    await db.run(
      "INSERT INTO timeline_events (id, project_id, date, title, description) VALUES ('t-1', ?, 'Year 100', 'The Great Shattering', 'The spires cracked.')",
      pId,
    );

    const encRes = await request(app).get(`/api/stories/${pId}/encyclopedia`);
    expect(encRes.status).toBe(200);
    expect(encRes.body.project.title).toBe('Obsidian Reach');
    expect(encRes.body.counts.characters).toBe(1);
    expect(encRes.body.counts.locations).toBe(1);
    expect(encRes.body.counts.factions).toBe(1);
    expect(encRes.body.counts.timelineEvents).toBe(1);
    expect(encRes.body.catalog.characters[0].name).toBe('Lord Voran');
    expect(encRes.body.catalog.locations[0].name).toBe('Obsidian Spire');
    expect(encRes.body.catalog.factions[0].name).toBe('Spire Guard');
    expect(encRes.body.catalog.timelineEvents[0].title).toBe('The Great Shattering');
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
