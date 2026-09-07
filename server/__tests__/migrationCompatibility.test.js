import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'crypto';

const connectionString = process.env.STORYTIME_TEST_DATABASE_URL;
if (!connectionString) {
  throw new Error('STORYTIME_TEST_DATABASE_URL is not set.');
}
process.env.STORYTIME_DATABASE_URL = connectionString;

let db;

beforeAll(async () => {
  db = (await import('../db.js')).default;
  await db.migrate();
});

afterAll(async () => {
  // These files share one worker process, so a pool left open outlives
  // the file that opened it, along with its idle connections and timers.
  await db.close();
});

describe('Database Migration 008 Compatibility & Constraints', () => {
  it('enforces stories.promotion_policy CHECK constraint', async () => {
    const projId = `proj-test-${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    // Valid policy: auto_promote
    await db.run(
      'INSERT INTO stories (id, title, promotion_policy, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      projId,
      'Valid Policy Story',
      'auto_promote',
      now,
      now,
    );

    const row = await db.get('SELECT id, promotion_policy, is_protected FROM stories WHERE id = ?', projId);
    expect(row.promotion_policy).toBe('auto_promote');
    expect(row.is_protected).toBe(false);

    // Invalid policy: quarantine (should fail CHECK constraint)
    await expect(
      db.run(
        'UPDATE stories SET promotion_policy = ? WHERE id = ?',
        'quarantine',
        projId,
      ),
    ).rejects.toThrow();

    // Invalid policy: random_foo (should fail CHECK constraint)
    await expect(
      db.run(
        'UPDATE stories SET promotion_policy = ? WHERE id = ?',
        'random_foo',
        projId,
      ),
    ).rejects.toThrow();
  });

  it('allows retry after rejected draft on prompt_fingerprint, but rejects duplicate for accepted', async () => {
    const projId = `proj-fp-${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    await db.run('INSERT INTO stories (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)', projId, 'Fingerprint Test', now, now);

    const fingerprint = `test-fp-${randomUUID()}`;

    // 1. First attempt fails and is stored as rejected
    const draft1Id = `draft-1-${randomUUID().slice(0, 8)}`;
    await db.run(
      `INSERT INTO generated_drafts (id, project_id, artifact_type, payload, status, prompt_fingerprint, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'rejected', ?, ?, ?)`,
      draft1Id,
      projId,
      'campaign_bundle',
      JSON.stringify({ note: 'first failed try' }),
      fingerprint,
      now,
      now,
    );

    // 2. Second attempt with SAME fingerprint is allowed because first was rejected!
    const draft2Id = `draft-2-${randomUUID().slice(0, 8)}`;
    await db.run(
      `INSERT INTO generated_drafts (id, project_id, artifact_type, payload, status, prompt_fingerprint, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'accepted', ?, ?, ?)`,
      draft2Id,
      projId,
      'campaign_bundle',
      JSON.stringify({ note: 'second accepted try' }),
      fingerprint,
      now,
      now,
    );

    // 3. Third attempt with SAME fingerprint fails unique constraint because draft2 was accepted!
    const draft3Id = `draft-3-${randomUUID().slice(0, 8)}`;
    await expect(
      db.run(
        `INSERT INTO generated_drafts (id, project_id, artifact_type, payload, status, prompt_fingerprint, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'accepted', ?, ?, ?)`,
        draft3Id,
        projId,
        'campaign_bundle',
        JSON.stringify({ note: 'third duplicate try' }),
        fingerprint,
        now,
        now,
      ),
    ).rejects.toThrow();
  });

  it('enforces single outbox exploration_event per draft_id', async () => {
    const projId = `proj-evt-${randomUUID().slice(0, 8)}`;
    const draftId = `draft-evt-${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    await db.run('INSERT INTO stories (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)', projId, 'Event Story', now, now);
    await db.run(
      `INSERT INTO generated_drafts (id, project_id, artifact_type, payload, status, created_at, updated_at)
       VALUES (?, ?, 'campaign_bundle', '{}', 'accepted', ?, ?)`,
      draftId,
      projId,
      now,
      now,
    );

    // First event insert succeeds
    await db.run(
      'INSERT INTO exploration_events (id, project_id, draft_id, status, created_at) VALUES (?, ?, ?, ?, ?)',
      `evt-1-${randomUUID().slice(0, 8)}`,
      projId,
      draftId,
      'pending',
      now,
    );

    // Second event insert for SAME draft_id fails unique constraint (preventing double-writing)
    await expect(
      db.run(
        'INSERT INTO exploration_events (id, project_id, draft_id, status, created_at) VALUES (?, ?, ?, ?, ?)',
        `evt-2-${randomUUID().slice(0, 8)}`,
        projId,
        draftId,
        'pending',
        now,
      ),
    ).rejects.toThrow();
  });
});
