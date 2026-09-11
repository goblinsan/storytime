import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const connectionString = process.env.CONTESORA_TEST_DATABASE_URL || process.env.STORYTIME_TEST_DATABASE_URL;
if (!connectionString) throw new Error('CONTESORA_TEST_DATABASE_URL is not set.');
process.env.CONTESORA_DATABASE_URL = connectionString;

let db;
let app;
let projectId;

beforeAll(async () => {
  db = await import('../db.js');
  await db.migrate();
  await db.run('TRUNCATE stories CASCADE');
  app = (await import('../app.js')).default;
  projectId = (await request(app).post('/api/stories').send({ title: 'Drafts' })).body.id;
});

afterAll(async () => {
  await db.run('TRUNCATE stories CASCADE');
  await db.close();
});

const work = async (content) => (await request(app).post('/api/derivatives')
  .send({ projectId, type: 'story', title: 'A work', content })).body.id;
const surface = async (id) => (await request(app).get(`/api/derivatives/surface/${id}`)).body;
const write = (id, body) => request(app).patch(`/api/derivatives/surface/${id}`).send(body);

describe("a work's earlier drafts", () => {
  it('keeps the prose an edit replaces, once per spell of editing', async () => {
    const id = await work('The first version.');
    await write(id, { content: 'The second version.' });
    await write(id, { content: 'The third version.' });
    const { drafts, work: w } = await surface(id);
    expect(w.content).toBe('The third version.');
    expect(drafts.map((d) => [d.reason, d.opening, d.words]))
      .toEqual([['Before an edit', 'The first version.', 3]]);
  });

  it('always keeps the prose a replacement takes, and says why', async () => {
    const id = await work('Written by hand.');
    await write(id, { content: 'Tidied.' });
    await write(id, { content: 'Composed.', draftReason: 'Before a composed version was put in force' });
    const { drafts } = await surface(id);
    expect(drafts.map((d) => d.reason)).toEqual(['Before a composed version was put in force', 'Before an edit']);
    expect(drafts[0].opening).toBe('Tidied.');
  });

  it('keeps nothing when there was no prose, or it did not change', async () => {
    const id = await work('');
    await write(id, { content: 'Now there is some.' });
    await write(id, { content: 'Now there is some.' });
    expect((await surface(id)).drafts).toEqual([]);
  });

  it('restores a draft, and keeps the prose it replaces', async () => {
    const id = await work('Old words.');
    await write(id, { content: 'New words.' });
    const [draft] = (await surface(id)).drafts;
    const res = await request(app).post(`/api/derivatives/drafts/${draft.id}/restore`);
    expect(res.status).toBe(200);
    const after = await surface(id);
    expect(after.work.content).toBe('Old words.');
    expect(after.drafts.map((d) => [d.opening, d.reason]))
      .toEqual([['New words.', 'Before an earlier draft was restored']]);
  });

  it('reads a draft in full, and deletes it', async () => {
    const id = await work('Keep me for a moment.');
    await write(id, { content: 'Replaced.' });
    const [draft] = (await surface(id)).drafts;
    expect((await request(app).get(`/api/derivatives/drafts/${draft.id}`)).body.content).toBe('Keep me for a moment.');
    expect((await request(app).delete(`/api/derivatives/drafts/${draft.id}`)).status).toBe(200);
    expect((await request(app).get(`/api/derivatives/drafts/${draft.id}`)).status).toBe(404);
    expect((await request(app).delete(`/api/derivatives/drafts/${draft.id}`)).status).toBe(404);
    expect((await surface(id)).work.content).toBe('Replaced.');
  });
});
