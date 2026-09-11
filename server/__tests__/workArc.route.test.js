import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const connectionString = process.env.CONTESORA_TEST_DATABASE_URL || process.env.STORYTIME_TEST_DATABASE_URL;
if (!connectionString) throw new Error('CONTESORA_TEST_DATABASE_URL is not set.');
process.env.CONTESORA_DATABASE_URL = connectionString;

let db;
let app;
let P;
let arc;
let acts;

beforeAll(async () => {
  db = await import('../db.js');
  await db.migrate();
  await db.run('TRUNCATE stories CASCADE');
  app = (await import('../app.js')).default;
  P = (await request(app).post('/api/stories').send({ title: 'Bones and story' })).body.id;
  arc = (await request(app).post('/api/arcs').send({ projectId: P, title: 'The Signal' })).body.id;
  acts = [];
  for (const title of ['The Pull', 'The Detour']) {
    acts.push((await request(app).post(`/api/arcs/${arc}/acts`).send({ title })).body.id);
  }
});

afterAll(async () => {
  await db.run('TRUNCATE stories CASCADE');
  await db.close();
});

const surface = async (id) => (await request(app).get(`/api/derivatives/surface/${id}`)).body;
const link = (id, body) => request(app).patch(`/api/derivatives/surface/${id}`).send(body);

describe('a work built from an arc', () => {
  it('is linked to the arc, and its parts tell its acts', async () => {
    const work = (await request(app).post('/api/derivatives').send({ projectId: P, type: 'story', title: 'The Veil' })).body.id;
    expect((await link(work, { arcId: arc })).status).toBe(200);
    const part = (await request(app).post(`/api/derivatives/surface/${work}/parts`).send({ title: 'Chapter 1', actId: acts[0] })).body.id;

    const whole = await surface(work);
    expect(whole.arc).toEqual({ id: arc, title: 'The Signal', inherited: false });
    expect(whole.acts.map((a) => [a.actNumber, a.title])).toEqual([[1, 'The Pull'], [2, 'The Detour']]);
    expect(whole.parts[0].actId).toBe(acts[0]);

    // A part takes its arc from its work, and says which act it tells.
    const chapter = await surface(part);
    expect(chapter.arc).toMatchObject({ id: arc, inherited: true });
    expect(chapter.act).toMatchObject({ id: acts[0], actNumber: 1 });
    await link(part, { actId: acts[1] });
    expect((await surface(part)).act.actNumber).toBe(2);

    // The arc says what is built from it, and which parts tell each act.
    const told = (await request(app).get(`/api/arcs/${arc}`)).body;
    expect(told.works).toEqual([{ id: work, title: 'The Veil' }]);
    expect(told.acts[1].parts.map((p) => p.id)).toEqual([part]);

    // Unlinking is a choice, and leaves the work where it is.
    await link(work, { arcId: null });
    expect((await surface(work)).arc).toBeNull();
    await link(work, { arcId: arc });
  });

  it('refuses an arc from another universe', async () => {
    const other = (await request(app).post('/api/stories').send({ title: 'Elsewhere' })).body.id;
    const foreign = (await request(app).post('/api/arcs').send({ projectId: other, title: 'Not here' })).body.id;
    const work = (await request(app).post('/api/derivatives').send({ projectId: P, type: 'story', title: 'Stays home' })).body.id;
    expect((await link(work, { arcId: foreign })).status).toBe(400);
  });

  it('keeps the work when its arc is deleted, unlinked, and says so first', async () => {
    const bones = (await request(app).post('/api/arcs').send({ projectId: P, title: 'Short-lived' })).body.id;
    const work = (await request(app).post('/api/derivatives').send({ projectId: P, type: 'story', title: 'Outlives it' })).body.id;
    await link(work, { arcId: bones });
    const said = (await request(app).get(`/api/records/arc/${bones}/consequences`)).body;
    expect(said.effects).toContain('1 work built from it is no longer linked to an arc.');
    expect((await request(app).delete(`/api/records/arc/${bones}`)).status).toBe(200);
    expect((await surface(work)).arc).toBeNull();
  });
});
