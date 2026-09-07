import { createHash, randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const connectionString = process.env.STORYTIME_TEST_DATABASE_URL;
if (!connectionString) throw new Error('STORYTIME_TEST_DATABASE_URL is not set.');
process.env.STORYTIME_DATABASE_URL = connectionString;

const PROSE = 'Inside the Harrowed Veil, distance became unreliable. Malakor guided them by older methods.';
const PASSAGE = 'distance became unreliable';
const START = PROSE.indexOf(PASSAGE);
const END = START + PASSAGE.length;

let db;
let app;
let projectId;
let workId;

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
     VALUES (?, 'Void Requiem', '', 'A dying-star opera.', '', 'universe', now(), now())`, projectId,
  );
  workId = randomUUID();
  await db.run(
    `INSERT INTO derivative_works (id, project_id, type, title, description, status, content, created_at, updated_at)
     VALUES (?, ?, 'story', 'Chapter One', '', 'in_progress', ?, now(), now())`,
    workId, projectId, PROSE,
  );
});

const proposeRepair = (body = {}) =>
  request(app).post(`/api/reader-review/${workId}/repairs`).send({
    sectionId: 's1', startOffset: START, endOffset: END,
    replacementText: 'distance stopped meaning anything',
    rationale: 'Sharper, and it echoes the chapter title.',
    ...body,
  });

describe('annotations', () => {
  it('records an annotation against a passage and hashes what was selected', async () => {
    const res = await request(app).post(`/api/reader-review/${workId}/annotations`).send({
      sectionId: 's1', startOffset: START, endOffset: END,
      selectedText: PASSAGE, kind: 'concern', note: 'Repeats a beat from chapter two.',
    });
    expect(res.status).toBe(201);
    expect(res.body.text_sha256).toBe(createHash('sha256').update(PASSAGE).digest('hex'));

    const list = await request(app).get(`/api/reader-review/${workId}/annotations`);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].kind).toBe('concern');
  });

  it('rejects a backwards range and an undefined kind', async () => {
    const backwards = await request(app).post(`/api/reader-review/${workId}/annotations`)
      .send({ sectionId: 's1', startOffset: 50, endOffset: 10, selectedText: 'x' });
    expect(backwards.status).toBe(400);

    const badKind = await request(app).post(`/api/reader-review/${workId}/annotations`)
      .send({ sectionId: 's1', startOffset: 0, endOffset: 5, selectedText: 'x', kind: 'graffiti' });
    expect(badKind.status).toBe(400);
  });

  it('hides a discarded annotation without deleting the record', async () => {
    const created = await request(app).post(`/api/reader-review/${workId}/annotations`)
      .send({ sectionId: 's1', startOffset: START, endOffset: END, selectedText: PASSAGE });
    await request(app).patch(`/api/reader-review/annotations/${created.body.id}`).send({ status: 'discarded' });

    const list = await request(app).get(`/api/reader-review/${workId}/annotations`);
    expect(list.body).toHaveLength(0);
    const row = await db.get('SELECT status FROM reader_annotations WHERE id = ?', created.body.id);
    expect(row.status).toBe('discarded');
  });
});

describe('the section context manifest', () => {
  it('carries the prose, the universe direction and the canon an agent needs', async () => {
    await db.run('UPDATE stories SET persistent_goal = ?, guardrails = ? WHERE id = ?',
      'Keep Malakor unsentimental.', JSON.stringify(['No time travel.']), projectId);
    await db.run(
      `INSERT INTO characters (id, project_id, name, description, role, created_at, updated_at)
       VALUES (?, ?, 'Malakor Vane', 'A cybernetic necromancer.', 'principal', now(), now())`,
      randomUUID(), projectId,
    );

    const res = await request(app).get(`/api/reader-review/${workId}/sections/s1/context`);
    expect(res.status).toBe(200);
    expect(res.body.section.prose).toBe(PROSE);
    expect(res.body.universe.persistentGoal).toBe('Keep Malakor unsentimental.');
    expect(res.body.guardrails).toEqual(['No time travel.']);
    expect(res.body.canon.characters[0].name).toBe('Malakor Vane');
  });

  it('404s for a work that does not exist', async () => {
    const res = await request(app).get(`/api/reader-review/${randomUUID()}/sections/s1/context`);
    expect(res.status).toBe(404);
  });
});

describe('repair proposals', () => {
  it('captures the passage it was written against, from the prose rather than the caller', async () => {
    const res = await proposeRepair();
    expect(res.status).toBe(201);
    // Trusting a caller-supplied "original" would let a proposal claim to
    // replace text that was never there.
    expect(res.body.original_text).toBe(PASSAGE);
    expect(res.body.original_text_sha256).toBe(createHash('sha256').update(PASSAGE).digest('hex'));
    expect(res.body.status).toBe('ready');
    expect(res.body.requires_explicit_approval).toBe(true);
  });

  it('refuses a locator that addresses nothing, and a no-op replacement', async () => {
    const empty = await proposeRepair({ startOffset: 9000, endOffset: 9100 });
    expect(empty.status).toBe(400);

    const noop = await proposeRepair({ replacementText: PASSAGE });
    expect(noop.status).toBe(400);
  });

  it('applies an approved repair to the prose', async () => {
    const created = await proposeRepair();
    const approved = await request(app)
      .post(`/api/reader-review/repairs/${created.body.id}/approve`).send({ approvedBy: 'james' });

    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe('applied');

    const work = await db.get('SELECT content FROM derivative_works WHERE id = ?', workId);
    expect(work.content).toContain('distance stopped meaning anything');
    expect(work.content).not.toContain(PASSAGE);
    expect(work.content.startsWith('Inside the Harrowed Veil, ')).toBe(true);
  });

  it('refuses to apply a proposal whose passage changed underneath it', async () => {
    const created = await proposeRepair();

    // Somebody edits the prose after the proposal was made.
    await db.run('UPDATE derivative_works SET content = ? WHERE id = ?',
      PROSE.replace(PASSAGE, 'distance became a rumour'), workId);

    const approved = await request(app).post(`/api/reader-review/repairs/${created.body.id}/approve`).send({});
    expect(approved.status).toBe(409);
    expect(approved.body.status).toBe('stale');

    // The edit survives: this is the whole point of the hash check.
    const work = await db.get('SELECT content FROM derivative_works WHERE id = ?', workId);
    expect(work.content).toContain('distance became a rumour');
    expect(work.content).not.toContain('distance stopped meaning anything');

    const row = await db.get('SELECT status FROM repair_proposals WHERE id = ?', created.body.id);
    expect(row.status).toBe('stale');
  });

  it('reports staleness on read, before anyone tries to approve', async () => {
    await proposeRepair();
    const fresh = await request(app).get(`/api/reader-review/${workId}/repairs`);
    expect(fresh.body[0].isStale).toBe(false);

    await db.run('UPDATE derivative_works SET content = ? WHERE id = ?',
      PROSE.replace(PASSAGE, 'something else entirely'), workId);

    const stale = await request(app).get(`/api/reader-review/${workId}/repairs`);
    expect(stale.body[0].isStale).toBe(true);
  });

  it('will not apply the same repair twice', async () => {
    const created = await proposeRepair();
    await request(app).post(`/api/reader-review/repairs/${created.body.id}/approve`).send({});
    const again = await request(app).post(`/api/reader-review/repairs/${created.body.id}/approve`).send({});
    expect(again.status).toBe(409);
  });

  it('will not apply a rejected repair', async () => {
    const created = await proposeRepair();
    await request(app).post(`/api/reader-review/repairs/${created.body.id}/reject`).send({ reason: 'Loses the echo.' });

    const approved = await request(app).post(`/api/reader-review/repairs/${created.body.id}/approve`).send({});
    expect(approved.status).toBe(409);

    const work = await db.get('SELECT content FROM derivative_works WHERE id = ?', workId);
    expect(work.content).toBe(PROSE);
  });
});
