import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const connectionString = process.env.CONTESORA_TEST_DATABASE_URL || process.env.STORYTIME_TEST_DATABASE_URL;

if (!connectionString) {
  throw new Error('CONTESORA_TEST_DATABASE_URL is not set.');
}

process.env.CONTESORA_DATABASE_URL = connectionString;

let app;
let db;
let testProjectId;

beforeAll(async () => {
  db = await import('../db.js');
  await db.migrate();
  await db.run('TRUNCATE stories CASCADE');
  app = (await import('../app.js')).default;

  const storyRes = await request(app).post('/api/stories').send({
    title: 'The Ashen Expanse',
    description: 'A fantasy story in the Ironlands near the Ashen Sea.',
    type: 'universe',
  });
  testProjectId = storyRes.body.id;

  // Add canonical characters, locations, and relationships
  await db.run(
    "INSERT INTO characters (id, project_id, name, role, motivation) VALUES ('char-1', ?, 'Vaelen', 'Alchemist', 'Heal the land')",
    testProjectId,
  );
  await db.run(
    "INSERT INTO locations (id, project_id, name, region_type) VALUES ('loc-1', ?, 'Ashen Port', 'harbor')",
    testProjectId,
  );
});

afterAll(async () => {
  await db.run('TRUNCATE stories CASCADE');
  await db.close();
});

describe('Composer API Quality Gate Enforcement', () => {
  it('POST /api/composer/chapter composes prose, runs critique gate, and returns qualityPassed', async () => {
    const chapterRes = await request(app).post('/api/derivatives').send({
      projectId: testProjectId,
      type: 'story',
      title: 'The Tide Recedes',
      content: '## Beat 1: The Harbor\nVaelen walked along Ashen Port.',
      status: 'draft',
    });
    const chapterId = chapterRes.body.id;

    const res = await request(app).post('/api/composer/chapter').send({
      derivativeId: chapterId,
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.qualityPassed).toBe('boolean');
    expect(res.body.critiqueGate).toBeDefined();
    expect(res.body.derivative.metadata.critiqueGate).toBeDefined();
    expect(res.body.derivative.metadata.isComposedProse).toBe(true);
  });

  it('POST /api/composer/chapter protects accepted content when unapproved draft fails quality review', async () => {
    const acceptedContent = 'This is the verified and published text of the ancient decree across the Ashen Sea.';
    const acceptedChapter = await request(app).post('/api/derivatives').send({
      projectId: testProjectId,
      type: 'story',
      title: 'Decree of the High Anvil',
      content: acceptedContent,
      status: 'accepted',
      metadata: JSON.stringify({
        avoid: ['ashen'],
      }),
    });

    const res = await request(app).post('/api/composer/chapter').send({
      derivativeId: acceptedChapter.body.id,
    });

    expect(res.status).toBe(200);
    expect(res.body.qualityPassed).toBe(false);
    expect(res.body.derivative.status).toBe('accepted'); // does not downgrade accepted status
    expect(res.body.derivative.metadata.needsQualityReview).toBe(true);
    expect(res.body.derivative.metadata.qualityReviewFailed).toBe(true);
    // Accepted content MUST NOT be overwritten
    expect(res.body.derivative.content).toBe(acceptedContent);
    // Unapproved text stored in metadata
    expect(res.body.derivative.metadata.unapprovedDraft).toBeDefined();
  });

  it('POST /api/composer/all composes all chapters through the quality gate without bypass', async () => {
    // Create two story chapters
    await request(app).post('/api/derivatives').send({
      projectId: testProjectId,
      type: 'story',
      title: 'Batch Chapter 1',
      content: '## Beat 1: Dawn\nDawn broke over Ashen Port.',
      status: 'draft',
    });
    await request(app).post('/api/derivatives').send({
      projectId: testProjectId,
      type: 'story',
      title: 'Batch Chapter 2',
      content: '## Beat 1: Dusk\nDusk settled over the cliffs.',
      status: 'draft',
    });

    const res = await request(app).post('/api/composer/all').send({
      projectId: testProjectId,
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.totalComposed).toBeGreaterThanOrEqual(2);
    expect(typeof res.body.allQualityPassed).toBe('boolean');
    expect(Array.isArray(res.body.composedChapters)).toBe(true);

    for (const ch of res.body.composedChapters) {
      expect(ch.critiqueGate).toBeDefined();
      expect(typeof ch.qualityPassed).toBe('boolean');
    }
  });
});
