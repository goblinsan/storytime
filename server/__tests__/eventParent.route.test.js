import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const connectionString = process.env.CONTESORA_TEST_DATABASE_URL || process.env.STORYTIME_TEST_DATABASE_URL;
if (!connectionString) throw new Error('CONTESORA_TEST_DATABASE_URL is not set.');
process.env.CONTESORA_DATABASE_URL = connectionString;

let db;
let app;
let P;

beforeAll(async () => {
  db = await import('../db.js');
  await db.migrate();
  await db.run('TRUNCATE stories CASCADE');
  app = (await import('../app.js')).default;
  P = (await request(app).post('/api/stories').send({ title: 'Moving events' })).body.id;
});

afterAll(async () => {
  await db.run('TRUNCATE stories CASCADE');
  await db.close();
});

const event = async (title) => (await request(app).post('/api/events').send({ projectId: P, title, date: '304' })).body.id;
const move = (id, parentId) => request(app).patch(`/api/events/${id}`).send({ parentId });
const parentOf = async (id) => (await db.get('SELECT parent_id FROM timeline_events WHERE id = ?', id)).parent_id;

describe('moving an event within the chronicle', () => {
  it('moves an event inside another, and back to the top', async () => {
    const war = await event('The Fall');
    const battle = await event('The Breach');
    expect((await move(battle, war)).status).toBe(200);
    expect(await parentOf(battle)).toBe(war);
    expect((await move(battle, null)).status).toBe(200);
    expect(await parentOf(battle)).toBeNull();
  });

  it('leaves where it sits alone when the move is not asked for', async () => {
    const war = await event('The Siege');
    const battle = await event('The Wall');
    await move(battle, war);
    await request(app).patch(`/api/events/${battle}`).send({ title: 'The Wall Falls' });
    expect(await parentOf(battle)).toBe(war);
  });

  it('refuses a move into itself, or into something already inside it', async () => {
    const war = await event('The Long War');
    const battle = await event('A Battle');
    const moment = await event('A Moment');
    await move(battle, war);
    await move(moment, battle);
    expect((await move(war, war)).status).toBe(400);
    const loop = await move(war, moment);
    expect(loop.status).toBe(400);
    expect(loop.body.error).toMatch(/already inside this one/);
    expect(await parentOf(war)).toBeNull();
  });
});
