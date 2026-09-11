import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const connectionString = process.env.CONTESORA_TEST_DATABASE_URL || process.env.STORYTIME_TEST_DATABASE_URL;
if (!connectionString) throw new Error('CONTESORA_TEST_DATABASE_URL is not set.');
process.env.CONTESORA_DATABASE_URL = connectionString;

let db;
let app;
let P;
const now = new Date().toISOString();

beforeAll(async () => {
  db = await import('../db.js');
  await db.migrate();
  await db.run('TRUNCATE stories CASCADE');
  app = (await import('../app.js')).default;
  P = (await request(app).post('/api/stories').send({ title: 'Deletions' })).body.id;
});

afterAll(async () => {
  await db.run('TRUNCATE stories CASCADE');
  await db.close();
});

const said = async (kind, id) => (await request(app).get(`/api/records/${kind}/${id}/consequences`)).body;
const del = (kind, id) => request(app).delete(`/api/records/${kind}/${id}`);
const character = (id, extra = {}) => db.run(
  'INSERT INTO characters (id, project_id, name, relationships, is_protected) VALUES (?, ?, ?, ?, ?)',
  id, P, extra.name ?? id, extra.relationships ?? '[]', Boolean(extra.protected),
);

describe('deleting a character', () => {
  it('says what else goes, then takes its ties and mentions with it', async () => {
    await character('ch-a', { name: 'Ada' });
    await character('ch-b', { relationships: JSON.stringify([{ target: 'ch-a', type: 'rival' }, { target: 'ch-x', type: 'kin' }]) });
    await db.run(`INSERT INTO canon_relationships (id, project_id, source_entity_id, source_entity_type,
      target_entity_id, target_entity_type, relationship_type, confidence, created_at, updated_at)
      VALUES ('rel-ab', ?, 'ch-a', 'character', 'ch-b', 'character', 'rival', 'canon', ?, ?)`, P, now, now);
    await db.run(`INSERT INTO timeline_events (id, project_id, title, date, characters)
      VALUES ('ev-1', ?, 'A meeting', '1', ?)`, P, JSON.stringify(['ch-a', 'ch-b']));

    const before = await said('character', 'ch-a');
    expect(before.name).toBe('Ada');
    expect(before.effects).toEqual(expect.arrayContaining([
      '1 recorded tie to and from them goes with them.',
      '1 event stops naming them.',
      '1 other character stops pointing to them.',
    ]));

    expect((await del('character', 'ch-a')).status).toBe(200);
    expect(await db.get("SELECT id FROM characters WHERE id = 'ch-a'")).toBeNull();
    expect(await db.get("SELECT id FROM canon_relationships WHERE id = 'rel-ab'")).toBeNull();
    expect(JSON.parse((await db.get("SELECT characters FROM timeline_events WHERE id = 'ev-1'")).characters)).toEqual(['ch-b']);
    expect(JSON.parse((await db.get("SELECT relationships FROM characters WHERE id = 'ch-b'")).relationships))
      .toEqual([{ target: 'ch-x', type: 'kin' }]);
  });

  it('refuses a protected record, and says so before anyone tries', async () => {
    await character('ch-kept', { name: 'Kept', protected: true });
    expect((await said('character', 'ch-kept')).protected).toBe(true);
    const res = await del('character', 'ch-kept');
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/protected/);
    expect(await db.get("SELECT id FROM characters WHERE id = 'ch-kept'")).not.toBeNull();
  });
});

describe('deleting something that holds other things', () => {
  it('moves a place\'s own places up to what held it', async () => {
    await db.run("INSERT INTO locations (id, project_id, name, parent_id) VALUES ('pl-top', ?, 'The System', NULL)", P);
    await db.run("INSERT INTO locations (id, project_id, name, parent_id) VALUES ('pl-mid', ?, 'The Planet', 'pl-top')", P);
    await db.run("INSERT INTO locations (id, project_id, name, parent_id) VALUES ('pl-low', ?, 'The City', 'pl-mid')", P);
    expect((await said('place', 'pl-mid')).effects).toContain('The place inside it moves up to The System.');
    expect((await del('place', 'pl-mid')).status).toBe(200);
    expect((await db.get("SELECT parent_id FROM locations WHERE id = 'pl-low'")).parent_id).toBe('pl-top');
  });

  it('renumbers the acts after a deleted act', async () => {
    const arc = (await request(app).post('/api/arcs').send({ projectId: P, title: 'Three acts' })).body.id;
    const ids = [];
    for (const title of ['One', 'Two', 'Three']) {
      ids.push((await request(app).post(`/api/arcs/${arc}/acts`).send({ title })).body.id);
    }
    expect((await said('act', ids[1])).effects).toEqual(['The act after it moves up a number.']);
    expect((await del('act', ids[1])).status).toBe(200);
    const acts = (await request(app).get(`/api/arcs/${arc}`)).body.acts;
    expect(acts.map((a) => [a.actNumber, a.title])).toEqual([[1, 'One'], [2, 'Three']]);
  });

  it('makes a deleted work\'s parts works of their own', async () => {
    const work = (await request(app).post('/api/derivatives').send({ projectId: P, type: 'story', title: 'Whole' })).body.id;
    const part = (await request(app).post(`/api/derivatives/surface/${work}/parts`).send({ title: 'Part' })).body.id;
    expect((await said('work', work)).effects).toContain('Its part becomes a work of its own.');
    expect((await del('work', work)).status).toBe(200);
    const row = await db.get('SELECT parent_id, part_number FROM derivative_works WHERE id = ?', part);
    expect([row.parent_id, row.part_number]).toEqual([null, null]);
  });
});

describe('tidying what mentions it', () => {
  it('asks for every record that names it to be tidied, once it is gone', async () => {
    // Filed, not answered: no agent runs in a test.
    process.env.CONTESORA_CANON_AGENT = 'off';
    await character('ch-gone', { name: 'Captain Iris Vell' });
    await db.run("UPDATE characters SET background = 'Raised by Iris on the rim.' WHERE id = 'ch-b'");
    await db.run("INSERT INTO locations (id, project_id, name, history) VALUES ('pl-iris', ?, 'Vell Station', 'Captain Iris Vell founded it.')", P);
    await db.run("INSERT INTO locations (id, project_id, name, history) VALUES ('pl-other', ?, 'Irisfield', 'Named for a flower.')", P);
    await db.run(`INSERT INTO media_assets (id, project_id, url, kind, title, subject_type, subject_id)
      VALUES ('pic-iris', ?, '/x.png', 'reference', 'Iris', 'character', 'ch-gone')`, P);

    const before = await said('character', 'ch-gone');
    expect(before.pictures).toBe(1);
    // "Iris" as a word, not "Irisfield".
    expect(before.mentions.map((m) => m.name).sort()).toEqual(['Vell Station', 'ch-b']);

    const res = await request(app).delete('/api/records/character/ch-gone?tidy=1&pictures=1');
    expect(res.status).toBe(200);
    expect(res.body.picturesDeleted).toBe(1);
    expect(res.body.tidied.sort()).toEqual(['Vell Station', 'ch-b']);
    expect(await db.get("SELECT id FROM media_assets WHERE id = 'pic-iris'")).toBeNull();

    const asked = await db.all("SELECT artifact_type AS type, payload FROM generated_drafts WHERE project_id = ? AND payload::text LIKE '%Iris Vell%'", P);
    const byType = Object.fromEntries(asked.map((a) => [a.type, typeof a.payload === 'string' ? JSON.parse(a.payload) : a.payload]));
    expect(byType.character_canon_request).toMatchObject({ characterId: 'ch-b', fields: ['background'] });
    expect(byType.location_canon_request).toMatchObject({ locationId: 'pl-iris', fields: ['history'] });
    expect(byType.location_canon_request.brief).toMatch(/"Captain Iris Vell" \(a character\) has been deleted/);
  });

  it('keeps pictures, unlinked, unless asked to delete them', async () => {
    await character('ch-pic', { name: 'Pictured Once' });
    await db.run(`INSERT INTO media_assets (id, project_id, url, kind, title, subject_type, subject_id)
      VALUES ('pic-kept', ?, '/y.png', 'reference', 'Kept', 'character', 'ch-pic')`, P);
    expect((await del('character', 'ch-pic')).status).toBe(200);
    const pic = await db.get("SELECT subject_id, subject_type FROM media_assets WHERE id = 'pic-kept'");
    expect([pic.subject_id, pic.subject_type]).toEqual([null, null]);
  });
});

describe('what cannot be deleted', () => {
  it('answers 404 for an unknown kind or record', async () => {
    expect((await del('spaceship', 'x')).status).toBe(404);
    expect((await del('character', 'no-such-character')).status).toBe(404);
  });
});
