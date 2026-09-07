import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const connectionString = process.env.CONTESORA_TEST_DATABASE_URL || process.env.STORYTIME_TEST_DATABASE_URL;
if (!connectionString) {
  throw new Error('CONTESORA_TEST_DATABASE_URL is not set.');
}
process.env.CONTESORA_DATABASE_URL = connectionString;

let db;
let projectId;
let workId;

beforeAll(async () => {
  db = await import('../db.js');
  await db.migrate();
  await db.run('TRUNCATE stories CASCADE');

  projectId = randomUUID();
  await db.run(
    `INSERT INTO stories (id, title, author, description, content, type, created_at, updated_at)
     VALUES (?, ?, '', '', '', 'universe', now(), now())`,
    projectId, 'Schema Universe',
  );

  workId = randomUUID();
  await db.run(
    `INSERT INTO derivative_works (id, project_id, type, title, description, status, content, created_at, updated_at)
     VALUES (?, ?, 'story', 'A Chapter', '', 'draft', 'Prose.', now(), now())`,
    workId, projectId,
  );
});

afterAll(async () => {
  await db.run('TRUNCATE stories CASCADE');
  // Every pool this file opened, closed. A leaked pool keeps idle connections
  // and timers alive in the worker for the rest of the run.
  await db.close();
});

const columnNames = async (table) => {
  const rows = await db.all(
    'SELECT column_name FROM information_schema.columns WHERE table_name = ?', table,
  );
  return rows.map((r) => r.column_name);
};

describe('universe direction, theme and autonomy', () => {
  it('adds the columns without disturbing an existing universe', async () => {
    const columns = await columnNames('stories');
    for (const column of [
      'theme_id', 'theme_overrides', 'cover_image_url',
      'persistent_goal', 'temporary_focus', 'guardrails', 'autonomy_mode',
    ]) {
      expect(columns, column).toContain(column);
    }

    const story = await db.get('SELECT title, autonomy_mode, guardrails, theme_overrides FROM stories WHERE id = ?', projectId);
    expect(story.title).toBe('Schema Universe');
    expect(story.autonomy_mode).toBe('assisted');
    expect(story.guardrails).toEqual([]);
    expect(story.theme_overrides).toEqual({});
  });

  it('refuses an autonomy posture outside the three the product defines', async () => {
    // An unrecognised posture would read as "no restriction" to a worker
    // deciding whether it may write canon.
    await expect(
      db.run('UPDATE stories SET autonomy_mode = ? WHERE id = ?', 'anything_goes', projectId),
    ).rejects.toThrow();

    await db.run('UPDATE stories SET autonomy_mode = ? WHERE id = ?', 'manual', projectId);
    const story = await db.get('SELECT autonomy_mode FROM stories WHERE id = ?', projectId);
    expect(story.autonomy_mode).toBe('manual');
  });
});

describe('reader annotations', () => {
  const insert = (overrides = {}) => {
    const row = {
      id: randomUUID(), section_id: 's1', start_offset: 10, end_offset: 40,
      selected_text: 'a passage', text_sha256: 'a'.repeat(64), kind: 'note', status: 'active',
      ...overrides,
    };
    return db.run(
      `INSERT INTO reader_annotations
       (id, project_id, derivative_id, section_id, start_offset, end_offset,
        selected_text, text_sha256, kind, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      row.id, projectId, workId, row.section_id, row.start_offset, row.end_offset,
      row.selected_text, row.text_sha256, row.kind, row.status,
    );
  };

  it('stores an annotation against a passage', async () => {
    await insert();
    const row = await db.get('SELECT * FROM reader_annotations WHERE project_id = ?', projectId);
    expect(row.derivative_id).toBe(workId);
    expect(row.selected_text).toBe('a passage');
    expect(row.created_at).toBeTruthy();
  });

  it('rejects a locator whose range is backwards or negative', async () => {
    await expect(insert({ start_offset: 40, end_offset: 10 })).rejects.toThrow();
    await expect(insert({ start_offset: -1, end_offset: 10 })).rejects.toThrow();
  });

  it('rejects a kind or status the product does not define', async () => {
    await expect(insert({ kind: 'graffiti' })).rejects.toThrow();
    await expect(insert({ status: 'maybe' })).rejects.toThrow();
  });

  it('goes away with its universe rather than dangling', async () => {
    const gone = randomUUID();
    await db.run(
      `INSERT INTO stories (id, title, author, description, content, type, created_at, updated_at)
       VALUES (?, 'Doomed', '', '', '', 'universe', now(), now())`, gone,
    );
    const work = randomUUID();
    await db.run(
      `INSERT INTO derivative_works (id, project_id, type, title, description, status, content, created_at, updated_at)
       VALUES (?, ?, 'story', 'X', '', 'draft', '', now(), now())`, work, gone,
    );
    await db.run(
      `INSERT INTO reader_annotations
       (id, project_id, derivative_id, section_id, start_offset, end_offset, selected_text, text_sha256)
       VALUES (?, ?, ?, 's1', 0, 5, 'x', ?)`,
      randomUUID(), gone, work, 'b'.repeat(64),
    );

    await db.run('DELETE FROM stories WHERE id = ?', gone);
    const left = await db.all('SELECT id FROM reader_annotations WHERE project_id = ?', gone);
    expect(left).toEqual([]);
  });
});

describe('repair proposals', () => {
  const insert = (overrides = {}) => {
    const row = {
      id: randomUUID(), status: 'pending', start_offset: 0, end_offset: 20, ...overrides,
    };
    return db.run(
      `INSERT INTO repair_proposals
       (id, project_id, derivative_id, section_id, start_offset, end_offset,
        original_text, original_text_sha256, replacement_text, status)
       VALUES (?, ?, ?, 's1', ?, ?, ?, ?, ?, ?)`,
      row.id, projectId, workId, row.start_offset, row.end_offset,
      'the original passage', 'c'.repeat(64), 'the replacement passage', row.status,
    );
  };

  it('stores a proposal that requires explicit approval by default', async () => {
    await insert();
    const row = await db.get('SELECT * FROM repair_proposals WHERE project_id = ?', projectId);
    // The protected-canon rule turns on this defaulting to true: a proposal that
    // arrives without an opinion must still need a human.
    expect(row.requires_explicit_approval).toBe(true);
    expect(row.status).toBe('pending');
    expect(row.cited_canon_ids).toEqual([]);
    expect(row.applied_at).toBeNull();
  });

  it('keeps the original hash, which is what makes an approval stale-safe', async () => {
    const row = await db.get('SELECT original_text_sha256, original_text FROM repair_proposals WHERE project_id = ?', projectId);
    expect(row.original_text_sha256).toHaveLength(64);
    expect(row.original_text).toBe('the original passage');
  });

  it('rejects a status outside the review lifecycle', async () => {
    await expect(insert({ status: 'probably_fine' })).rejects.toThrow();
    for (const status of ['ready', 'approved', 'applied', 'rejected', 'stale']) {
      await expect(insert({ status })).resolves.toBeTruthy();
    }
  });

  it('rejects a backwards locator range', async () => {
    await expect(insert({ start_offset: 50, end_offset: 20 })).rejects.toThrow();
  });
});

describe('migration hygiene', () => {
  it('is idempotent: running it again changes nothing and throws nothing', async () => {
    const before = await db.get('SELECT count(*)::int AS n FROM reader_annotations');
    await db.migrate();
    await expect(db.migrate()).resolves.toBeUndefined();
    const after = await db.get('SELECT count(*)::int AS n FROM reader_annotations');
    expect(after.n).toBe(before.n);
  });
});
