import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const connectionString = process.env.CONTESORA_TEST_DATABASE_URL || process.env.STORYTIME_TEST_DATABASE_URL;

if (!connectionString) {
  throw new Error(
    'CONTESORA_TEST_DATABASE_URL is not set. These tests need a Postgres they ' +
      'are allowed to truncate. Skipping them silently would report success ' +
      'for a suite that never ran.',
  );
}

process.env.CONTESORA_DATABASE_URL = connectionString;

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

describe('a timeline event records who was there', () => {
  let projectId;

  beforeAll(async () => {
    const res = await request(app).post('/api/stories').send({ title: 'Timeline Test Universe' });
    projectId = res.body.id;
  });

  /**
   * Migration 010 gave events a cast, the factions involved, and what they come
   * before and after. The read paths returned all four; both write paths
   * dropped them, so a request naming an event's cast came back 201 with a body
   * that had none -- and there was no way to say who was at an event at all.
   *
   * Asserted on a fresh read rather than on the response, because a handler
   * that echoed its own request would pass the other way round.
   */
  const lists = [
    ['characters', ['char-lyra', 'char-mara']],
    ['factions', ['fac-vander-thorne']],
    ['beforeEventIds', ['event-later']],
    ['afterEventIds', ['event-earlier']],
  ];

  it.each(lists)('creates an event carrying %s', async (field, value) => {
    const created = await request(app).post('/api/timeline-events').send({
      projectId, title: `Created with ${field}`, date: 'Year 620', [field]: value,
    });
    expect(created.status).toBe(201);

    const read = await request(app).get(`/api/timeline-events/${created.body.id}`);
    expect(read.body[field], `${field} did not survive creation`).toEqual(value);
  });

  it.each(lists)('updates an event %s', async (field, value) => {
    const created = await request(app).post('/api/timeline-events').send({
      projectId, title: `Updated with ${field}`, date: 'Year 620',
    });
    expect(created.body[field]).toEqual([]);

    const updated = await request(app).put(`/api/timeline-events/${created.body.id}`).send({ [field]: value });
    expect(updated.status).toBe(200);

    const read = await request(app).get(`/api/timeline-events/${created.body.id}`);
    expect(read.body[field], `${field} did not survive the update`).toEqual(value);
  });

  it('empties a list when given an empty one', async () => {
    const created = await request(app).post('/api/timeline-events').send({
      projectId, title: 'Cast removed', date: 'Year 300', characters: ['char-lyra'],
    });
    await request(app).put(`/api/timeline-events/${created.body.id}`).send({ characters: [] });
    const read = await request(app).get(`/api/timeline-events/${created.body.id}`);
    expect(read.body.characters).toEqual([]);
  });

  it('leaves a list alone when the update does not mention it', async () => {
    const created = await request(app).post('/api/timeline-events').send({
      projectId, title: 'Retitled only', date: 'Year 300', characters: ['char-lyra'],
    });
    await request(app).put(`/api/timeline-events/${created.body.id}`).send({ title: 'A new title' });
    const read = await request(app).get(`/api/timeline-events/${created.body.id}`);
    expect(read.body.title).toBe('A new title');
    expect(read.body.characters).toEqual(['char-lyra']);
  });
});
