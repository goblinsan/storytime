/**
 * Billing belongs to a character in a work, not to a character.
 *
 * The cast surface read a single characters.importance column as though a
 * universe had one running order, so a story about Malakor could not put
 * Malakor first. work_characters records the order per work, and "work" means
 * any derivative: story, novel, campaign, screenplay, storyboard, game concept.
 */
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const connectionString = process.env.STORYTIME_TEST_DATABASE_URL;
if (!connectionString) throw new Error('STORYTIME_TEST_DATABASE_URL is not set.');
process.env.STORYTIME_DATABASE_URL = connectionString;

let app;
let db;
let projectId;
let workId;
const characters = {};

beforeAll(async () => {
  db = await import('../db.js');
  await db.migrate();
  app = (await import('../app.js')).default;

  projectId = `p-cast-${Date.now()}`;
  await db.run('INSERT INTO stories (id, title) VALUES (?, ?)', projectId, 'Billing fixture');

  workId = `w-cast-${Date.now()}`;
  await db.run(
    'INSERT INTO derivative_works (id, project_id, type, title) VALUES (?, ?, ?, ?)',
    workId, projectId, 'story', 'The Iron Dirge',
  );

  for (const [key, name, importance] of [
    ['lead', 'Malakor Vane', 'background'],
    ['second', 'Elyse Vane', 'principal'],
    ['third', 'Solenne Vane', 'supporting'],
  ]) {
    const id = `${key}-${Date.now()}`;
    characters[key] = id;
    await db.run(
      'INSERT INTO characters (id, project_id, name, importance) VALUES (?, ?, ?, ?)',
      id, projectId, name, importance,
    );
  }
});

afterAll(async () => {
  await db.run('DELETE FROM stories WHERE id = ?', projectId);
});

beforeEach(async () => {
  await db.run('DELETE FROM work_characters WHERE work_id = ?', workId);
});

describe('a work has its own running order', () => {
  it('bills characters in the order they are given, whatever the character says', async () => {
    // Malakor is 'background' on his own row and top of this work's bill.
    await request(app).put(`/api/derivatives/${workId}/cast`).send({
      cast: [
        { characterId: characters.lead, importance: 'principal' },
        { characterId: characters.second },
        { characterId: characters.third },
      ],
    }).expect(200);

    const res = await request(app).get(`/api/derivatives/${workId}/cast`).expect(200);
    expect(res.body.map((r) => r.name)).toEqual(['Malakor Vane', 'Elyse Vane', 'Solenne Vane']);
    expect(res.body[0].billing).toBe(1);
    expect(res.body[0].workImportance).toBe('principal');
    expect(res.body[0].characterImportance).toBe('background');
    // Null means "however this character is normally recorded".
    expect(res.body[1].workImportance).toBeNull();
  });

  it('replaces rather than merges, so a dropped character stops being billed', async () => {
    await request(app).put(`/api/derivatives/${workId}/cast`).send({
      cast: [{ characterId: characters.lead }, { characterId: characters.second }],
    }).expect(200);
    await request(app).put(`/api/derivatives/${workId}/cast`).send({
      cast: [{ characterId: characters.second }],
    }).expect(200);

    const res = await request(app).get(`/api/derivatives/${workId}/cast`).expect(200);
    expect(res.body.map((r) => r.name)).toEqual(['Elyse Vane']);
  });

  it('will not let a derived pass overrule an authored decision', async () => {
    await request(app).put(`/api/derivatives/${workId}/cast`).send({
      cast: [{ characterId: characters.lead, importance: 'principal' }],
      source: 'authored',
    }).expect(200);

    // A scan proposes the same character at the bottom of the bill.
    await request(app).put(`/api/derivatives/${workId}/cast`).send({
      cast: [{ characterId: characters.third }, { characterId: characters.lead }],
      source: 'derived',
    }).expect(200);

    const res = await request(app).get(`/api/derivatives/${workId}/cast`).expect(200);
    const lead = res.body.find((r) => r.characterId === characters.lead);
    expect(lead.source).toBe('authored');
    expect(lead.workImportance).toBe('principal');
    expect(res.body.find((r) => r.characterId === characters.third).source).toBe('derived');
  });

  it('refuses a character billed twice', async () => {
    const res = await request(app).put(`/api/derivatives/${workId}/cast`).send({
      cast: [{ characterId: characters.lead }, { characterId: characters.lead }],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/billed twice/);
  });

  it('refuses an importance the schema does not allow', async () => {
    const res = await request(app).put(`/api/derivatives/${workId}/cast`).send({
      cast: [{ characterId: characters.lead, importance: 'starring' }],
    });
    expect(res.status).toBe(400);
  });

  it('404s for a work that does not exist', async () => {
    await request(app).get('/api/derivatives/no-such-work/cast').expect(404);
  });
});
