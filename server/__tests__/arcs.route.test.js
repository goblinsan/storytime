import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const connectionString = process.env.CONTESORA_TEST_DATABASE_URL || process.env.STORYTIME_TEST_DATABASE_URL;
if (!connectionString) {
  throw new Error('CONTESORA_TEST_DATABASE_URL is not set.');
}
process.env.CONTESORA_DATABASE_URL = connectionString;

let db;
let app;
let projectId;

beforeAll(async () => {
  db = await import('../db.js');
  await db.migrate();
  await db.run('TRUNCATE stories CASCADE');
  app = (await import('../app.js')).default;

  const res = await request(app).post('/api/stories').send({ title: 'Test Project' });
  projectId = res.body.id;
});

afterAll(async () => {
  await db.run('TRUNCATE stories CASCADE');
  await db.close();
});

describe('arcs route', () => {
  it('rejects a list with no project', async () => {
    const res = await request(app).get('/api/arcs');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'projectId query parameter is required' });
  });

  it('rejects a create with no project', async () => {
    const res = await request(app).post('/api/arcs').send({ title: 'Orphan' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'projectId is required' });
  });

  it('rejects a create against a project that does not exist', async () => {
    const res = await request(app).post('/api/arcs').send({
      projectId: 'no-such-project',
      title: 'Nowhere',
    });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Project not found' });
  });

  it('creates the first arc as number 1', async () => {
    const res = await request(app).post('/api/arcs').send({
      projectId,
      title: 'The Long Winter',
    });
    expect(res.status).toBe(201);
    expect(res.body.arcNumber).toBe(1);
    expect(res.body.title).toBe('The Long Winter');
    expect(res.body.description).toBe('');
    expect(res.body.details).toEqual([]);
  });

  it('auto-assigns the next arc number', async () => {
    const res = await request(app).post('/api/arcs').send({
      projectId,
      title: 'The Thaw',
    });
    expect(res.status).toBe(201);
    expect(res.body.arcNumber).toBe(2);
  });

  it('returns 404 for an arc that does not exist', async () => {
    const res = await request(app).get('/api/arcs/no-such-arc');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Arc not found' });
  });

  it('lists arcs in arc-number order with details parsed', async () => {
    await request(app).post('/api/arcs').send({
      projectId,
      title: 'With Details',
      details: ['a', 'b'],
    });

    const res = await request(app).get(`/api/arcs?projectId=${projectId}`);
    expect(res.status).toBe(200);
    expect(res.body.map((a) => a.arcNumber)).toEqual([1, 2, 3]);

    const withDetails = res.body.find((a) => a.title === 'With Details');
    expect(withDetails.details).toEqual(['a', 'b']);
  });

  it('keeps fields that were not sent on update', async () => {
    const createRes = await request(app).post('/api/arcs').send({
      projectId,
      title: 'Original Title',
      description: 'Original Description',
    });
    const arcId = createRes.body.id;

    const res = await request(app).put(`/api/arcs/${arcId}`).send({
      title: 'Renamed',
    });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Renamed');
    expect(res.body.description).toBe('Original Description');
  });
});

describe('an arc\'s acts', () => {
  const LABELED = [
    'THROUGHLINE: the engine.',
    'OUT OF SCOPE FOR THIS STORY: the frame-up stays hidden.',
    'ACT 1 -- The Pull (Ch1-2, written): he answers the call.',
    'The ambush.',
    'DONE (2026-09-03): revised.',
    'ACT 2 -- The Detour (Ch3-4): he tries to leave.',
  ];

  it('splits an arc written as one labeled list the first time it is read', async () => {
    const created = await request(app).post('/api/arcs').send({ projectId, title: 'Labeled', details: LABELED });
    const res = await request(app).get(`/api/arcs/${created.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body.throughline).toBe('the engine.');
    expect(res.body.outOfScope).toEqual(['the frame-up stays hidden.']);
    expect(res.body.notes).toEqual(['DONE (2026-09-03): revised.']);
    expect(res.body.details).toEqual([]);
    expect(res.body.acts.map((a) => [a.actNumber, a.title, a.span, a.beats])).toEqual([
      [1, 'The Pull', 'Ch1-2, written', ['he answers the call.', 'The ambush.']],
      [2, 'The Detour', 'Ch3-4', ['he tries to leave.']],
    ]);
  });

  // The page reads the list and the open arc at once. Both race to split it;
  // the loser must still answer with the split arc, not the list it read first.
  it('splits it once when read twice at once, and both answers see the split', async () => {
    const created = await request(app).post('/api/arcs').send({ projectId, title: 'Twice', details: LABELED });
    const [one, list] = await Promise.all([
      request(app).get(`/api/arcs/${created.body.id}`),
      request(app).get(`/api/arcs?projectId=${projectId}`),
    ]);
    const fromList = list.body.find((a) => a.id === created.body.id);
    for (const arc of [one.body, fromList]) {
      expect(arc.details).toEqual([]);
      expect(arc.acts).toHaveLength(2);
    }
    const again = await request(app).get(`/api/arcs/${created.body.id}`);
    expect(again.body.acts).toHaveLength(2);
  });

  it('leaves a list of plain beats as beats', async () => {
    const created = await request(app).post('/api/arcs').send({ projectId, title: 'Plain', details: ['a', 'b'] });
    const res = await request(app).get(`/api/arcs/${created.body.id}`);
    expect(res.body.details).toEqual(['a', 'b']);
    expect(res.body.acts).toEqual([]);
  });

  it('adds acts numbered after the last, and changes only what was sent', async () => {
    const created = await request(app).post('/api/arcs').send({ projectId, title: 'Built' });
    const first = await request(app).post(`/api/arcs/${created.body.id}/acts`).send({ title: 'One' });
    const second = await request(app).post(`/api/arcs/${created.body.id}/acts`).send({ title: 'Two' });
    expect(first.status).toBe(201);
    expect([first.body.actNumber, second.body.actNumber]).toEqual([1, 2]);

    const changed = await request(app).patch(`/api/arcs/acts/${second.body.id}`)
      .send({ beats: ['x', 'y'], summary: 'It turns.' });
    expect(changed.body).toMatchObject({ title: 'Two', summary: 'It turns.', beats: ['x', 'y'] });

    const arc = await request(app).get(`/api/arcs/${created.body.id}`);
    expect(arc.body.acts.map((a) => a.title)).toEqual(['One', 'Two']);
  });

  it('refuses an act for an arc that does not exist', async () => {
    const res = await request(app).post('/api/arcs/no-such-arc/acts').send({ title: 'Lost' });
    expect(res.status).toBe(404);
  });

  it('writes the throughline and what is kept out on the arc', async () => {
    const created = await request(app).post('/api/arcs').send({ projectId, title: 'Held' });
    const res = await request(app).patch(`/api/arcs/${created.body.id}`)
      .send({ throughline: 'What it is about.', outOfScope: ['No politics.'] });
    expect(res.body.throughline).toBe('What it is about.');
    expect(res.body.outOfScope).toEqual(['No politics.']);
    expect(res.body.title).toBe('Held');
  });
});
