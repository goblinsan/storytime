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
     VALUES (?, 'Void Requiem', '', 'A dying-star opera.', '', 'universe', now(), now())`, projectId,
  );
});

describe('the cross-universe dashboard', () => {
  it('reports real canon volume rather than a count of universes alone', async () => {
    await db.run(
      `INSERT INTO characters (id, project_id, name, description, role, created_at, updated_at)
       VALUES (?, ?, 'Malakor Vane', '', 'principal', now(), now())`, randomUUID(), projectId,
    );
    await db.run(
      `INSERT INTO locations (id, project_id, name, description) VALUES (?, ?, 'Nexus Prime', '')`,
      randomUUID(), projectId,
    );

    const res = await request(app).get('/api/editorial/dashboard');
    expect(res.status).toBe(200);
    expect(res.body.briefing.totalUniverses).toBe(1);
    expect(res.body.briefing.totalCanonEntities).toBe(2);

    const universe = res.body.universes[0];
    expect(universe.title).toBe('Void Requiem');
    expect(universe.canonCounts.characters).toBe(1);
    expect(universe.canonCounts.locations).toBe(1);
    // Works are a derivative count, not a canon dimension: leaving them in
    // canonCounts makes every total that sums the dimensions double-count them.
    expect(universe.canonCounts).not.toHaveProperty('works');
    expect(Object.values(universe.canonCounts).every((n) => typeof n === 'number')).toBe(true);
  });

  it('counts works separately from canon', async () => {
    await db.run(
      `INSERT INTO derivative_works (id, project_id, type, title, description, status, content, created_at, updated_at)
       VALUES (?, ?, 'story', 'One', '', 'draft', '', now(), now())`, randomUUID(), projectId,
    );
    const res = await request(app).get('/api/editorial/dashboard');
    expect(res.body.universes[0].worksCount).toBe(1);
    expect(res.body.briefing.totalWorks).toBe(1);
    expect(res.body.briefing.totalCanonEntities).toBe(0);
  });

  it('is honest about an empty codex instead of inventing a briefing', async () => {
    await db.run('TRUNCATE stories CASCADE');
    const res = await request(app).get('/api/editorial/dashboard');
    expect(res.body.briefing.totalUniverses).toBe(0);
    expect(res.body.briefing.headline).toBe('No universes yet');
    expect(res.body.universes).toEqual([]);
    expect(res.body.activeConcerns).toEqual([]);
    expect(res.body.pendingRepairs).toEqual([]);
  });

  it('surfaces open concerns and pending repairs, and counts them per universe', async () => {
    const workId = randomUUID();
    await db.run(
      `INSERT INTO derivative_works (id, project_id, type, title, description, status, content, created_at, updated_at)
       VALUES (?, ?, 'story', 'Chapter One', '', 'draft', 'Some prose here.', now(), now())`,
      workId, projectId,
    );
    await db.run(
      `INSERT INTO reader_annotations
         (id, project_id, derivative_id, section_id, start_offset, end_offset, selected_text, text_sha256, kind)
       VALUES (?, ?, ?, 's1', 0, 4, 'Some', ?, 'concern')`,
      randomUUID(), projectId, workId, 'a'.repeat(64),
    );
    await db.run(
      `INSERT INTO repair_proposals
         (id, project_id, derivative_id, section_id, start_offset, end_offset,
          original_text, original_text_sha256, replacement_text, status)
       VALUES (?, ?, ?, 's1', 0, 4, 'Some', ?, 'Any', 'ready')`,
      randomUUID(), projectId, workId, 'b'.repeat(64),
    );

    const res = await request(app).get('/api/editorial/dashboard');
    expect(res.body.activeConcerns).toHaveLength(1);
    expect(res.body.activeConcerns[0].universeTitle).toBe('Void Requiem');
    expect(res.body.pendingRepairs).toHaveLength(1);
    expect(res.body.briefing.openConcernsCount).toBe(1);
    expect(res.body.briefing.readyRepairsCount).toBe(1);
    expect(res.body.universes[0].concernsCount).toBe(1);
  });

  it('does not count a resolved concern as open', async () => {
    const workId = randomUUID();
    await db.run(
      `INSERT INTO derivative_works (id, project_id, type, title, description, status, content, created_at, updated_at)
       VALUES (?, ?, 'story', 'C', '', 'draft', 'x', now(), now())`, workId, projectId,
    );
    await db.run(
      `INSERT INTO reader_annotations
         (id, project_id, derivative_id, section_id, start_offset, end_offset, selected_text, text_sha256, kind, status)
       VALUES (?, ?, ?, 's1', 0, 1, 'x', ?, 'concern', 'resolved')`,
      randomUUID(), projectId, workId, 'c'.repeat(64),
    );

    const res = await request(app).get('/api/editorial/dashboard');
    expect(res.body.briefing.openConcernsCount).toBe(0);
  });
});

describe('universe direction', () => {
  it('defaults to assisted autonomy and no guardrails', async () => {
    const res = await request(app).get(`/api/editorial/universes/${projectId}/direction`);
    expect(res.status).toBe(200);
    expect(res.body.autonomyMode).toBe('assisted');
    expect(res.body.guardrails).toEqual([]);
    expect(res.body.theme.id).toBe('neutral-codex');
  });

  it('stores direction, focus, guardrails and autonomy', async () => {
    const res = await request(app).patch(`/api/editorial/universes/${projectId}/direction`).send({
      persistentGoal: 'Keep Malakor unsentimental.',
      temporaryFocus: 'Finish the Veil crossing.',
      guardrails: ['No time travel.', 'No resurrection without cost.'],
      autonomyMode: 'autonomous_explore',
    });

    expect(res.status).toBe(200);
    expect(res.body.persistentGoal).toBe('Keep Malakor unsentimental.');
    expect(res.body.guardrails).toHaveLength(2);
    expect(res.body.autonomyMode).toBe('autonomous_explore');

    const reread = await request(app).get(`/api/editorial/universes/${projectId}/direction`);
    expect(reread.body.temporaryFocus).toBe('Finish the Veil crossing.');
  });

  it('leaves untouched fields alone on a partial update', async () => {
    await request(app).patch(`/api/editorial/universes/${projectId}/direction`)
      .send({ persistentGoal: 'Original goal.', autonomyMode: 'manual' });
    await request(app).patch(`/api/editorial/universes/${projectId}/direction`)
      .send({ temporaryFocus: 'Just the focus.' });

    const res = await request(app).get(`/api/editorial/universes/${projectId}/direction`);
    expect(res.body.persistentGoal).toBe('Original goal.');
    expect(res.body.autonomyMode).toBe('manual');
    expect(res.body.temporaryFocus).toBe('Just the focus.');
  });

  it('refuses an autonomy posture the product does not define', async () => {
    const res = await request(app).patch(`/api/editorial/universes/${projectId}/direction`)
      .send({ autonomyMode: 'anything_goes' });
    expect(res.status).toBe(400);

    const unchanged = await request(app).get(`/api/editorial/universes/${projectId}/direction`);
    expect(unchanged.body.autonomyMode).toBe('assisted');
  });

  it('refuses guardrails that are not a list', async () => {
    const res = await request(app).patch(`/api/editorial/universes/${projectId}/direction`)
      .send({ guardrails: 'no time travel' });
    expect(res.status).toBe(400);
  });

  it('404s for a universe that does not exist', async () => {
    expect((await request(app).get(`/api/editorial/universes/${randomUUID()}/direction`)).status).toBe(404);
    expect((await request(app).patch(`/api/editorial/universes/${randomUUID()}/direction`).send({})).status).toBe(404);
  });
});

describe('universe theme', () => {
  it('stores a preset and per-universe token overrides', async () => {
    const res = await request(app).patch(`/api/editorial/universes/${projectId}/theme`).send({
      themeId: 'science-fiction',
      overrides: { accentPrimary: '#0284c7' },
    });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('science-fiction');
    expect(res.body.overrides).toEqual({ accentPrimary: '#0284c7' });

    const direction = await request(app).get(`/api/editorial/universes/${projectId}/direction`);
    expect(direction.body.theme.id).toBe('science-fiction');
  });

  it('refuses overrides that are not an object of tokens', async () => {
    const res = await request(app).patch(`/api/editorial/universes/${projectId}/theme`)
      .send({ overrides: ['#fff'] });
    expect(res.status).toBe(400);
  });
});
