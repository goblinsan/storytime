/**
 * A pin is a position, not a second copy of the truth.
 *
 * The worst outcome for a map surface is a place that is one thing on the
 * drawing and another in the records; the second worst is a picture that looks
 * authoritative about a position nobody chose. So: a pin carries no facts, and
 * one an agent guessed is stored as `proposed` and stays visibly a guess until
 * somebody says otherwise.
 */
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const connectionString = process.env.CONTESORA_TEST_DATABASE_URL || process.env.STORYTIME_TEST_DATABASE_URL;
if (!connectionString) throw new Error('CONTESORA_TEST_DATABASE_URL is not set.');
process.env.CONTESORA_DATABASE_URL = connectionString;

let db;
let app;
let projectId;
let region;
let town;

beforeAll(async () => {
  db = await import('../db.js');
  await db.migrate();
  app = (await import('../app.js')).default;
});

afterAll(async () => {
  await db.run('TRUNCATE stories CASCADE');
  await db.close();
});

beforeEach(async () => {
  await db.run('TRUNCATE stories CASCADE');
  projectId = randomUUID();
  await db.run(
    `INSERT INTO stories (id, title, author, description, content, type, created_at, updated_at)
     VALUES (?, 'A Universe', '', '', '', 'universe', now(), now())`, projectId,
  );
  region = randomUUID();
  town = randomUUID();
  await db.run(
    "INSERT INTO locations (id, project_id, name, description) VALUES (?, ?, 'The Frontier', 'Out past the ring.')",
    region, projectId,
  );
  await db.run(
    "INSERT INTO locations (id, project_id, name, parent_id) VALUES (?, ?, 'Salt Harbour', ?)",
    town, projectId, region,
  );
});

describe('a map and what is on it', () => {
  it('lists what is inside but not yet drawn', async () => {
    // The more useful half when a map is new: not what is pinned, but what is
    // missing from the drawing.
    const res = await request(app).get(`/api/maps/${region}`);
    expect(res.status).toBe(200);
    expect(res.body.place.name).toBe('The Frontier');
    expect(res.body.pins).toEqual([]);
    expect(res.body.unplaced.map((u) => u.name)).toEqual(['Salt Harbour']);
  });

  it('moves a place from unplaced to pinned, and back when the pin is removed', async () => {
    await request(app).put(`/api/maps/${region}/pins/${town}`).send({ x: 0.25, y: 0.5 });

    let res = await request(app).get(`/api/maps/${region}`);
    expect(res.body.pins).toHaveLength(1);
    expect(res.body.pins[0].name).toBe('Salt Harbour');
    expect(res.body.unplaced).toEqual([]);

    await request(app).delete(`/api/maps/${region}/pins/${town}`);
    res = await request(app).get(`/api/maps/${region}`);
    expect(res.body.pins).toEqual([]);
    expect(res.body.unplaced.map((u) => u.name), 'the place itself is untouched')
      .toEqual(['Salt Harbour']);
  });

  it('keeps one pin per place per map, and moving is not a second pin', async () => {
    await request(app).put(`/api/maps/${region}/pins/${town}`).send({ x: 0.1, y: 0.1 });
    await request(app).put(`/api/maps/${region}/pins/${town}`).send({ x: 0.8, y: 0.2 });

    const res = await request(app).get(`/api/maps/${region}`);
    expect(res.body.pins).toHaveLength(1);
    expect(res.body.pins[0].x).toBeCloseTo(0.8);
    expect(res.body.pins[0].y).toBeCloseTo(0.2);
  });

  it('refuses a position that is not a fraction of the image', async () => {
    // Pixels would scatter every pin the moment a map of different dimensions
    // replaced this one, which is the case the review dialog exists for.
    for (const bad of [{ x: 120, y: 40 }, { x: -0.1, y: 0.5 }, { x: 0.5, y: 1.4 }]) {
      const res = await request(app).put(`/api/maps/${region}/pins/${town}`).send(bad);
      expect(res.status, `${JSON.stringify(bad)} should be refused`).toBe(400);
    }
  });

  it('remembers that a pin was guessed rather than placed', async () => {
    const res = await request(app)
      .put(`/api/maps/${region}/pins/${town}`).send({ x: 0.3, y: 0.3, status: 'proposed' });
    expect(res.body.status).toBe('proposed');

    // Accepting is just placing it, which is why there is no separate verb.
    const kept = await request(app)
      .put(`/api/maps/${region}/pins/${town}`).send({ x: 0.3, y: 0.3, status: 'placed' });
    expect(kept.body.status).toBe('placed');
  });

  it('refuses a status it does not know', async () => {
    const res = await request(app)
      .put(`/api/maps/${region}/pins/${town}`).send({ x: 0.3, y: 0.3, status: 'canon' });
    expect(res.status).toBe(400);
  });

  it('carries no facts of its own', async () => {
    // The point of the whole design: everything a pin says about the place
    // comes from the place, so the drawing cannot disagree with the record.
    await request(app).put(`/api/maps/${region}/pins/${town}`).send({ x: 0.4, y: 0.4 });
    await db.run("UPDATE locations SET name = 'Saltmarsh' WHERE id = ?", town);

    const res = await request(app).get(`/api/maps/${region}`);
    expect(res.body.pins[0].name, 'renaming the place renames the pin').toBe('Saltmarsh');
  });

  it('says so when the map or the place is not there', async () => {
    expect((await request(app).get(`/api/maps/${randomUUID()}`)).status).toBe(404);
    expect((await request(app).put(`/api/maps/${region}/pins/${randomUUID()}`)
      .send({ x: 0.5, y: 0.5 })).status).toBe(404);
  });
});
